import type { Book } from '@/contracts/book.js';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import type { CandidateBook } from '@/data/candidates.js';
import titlesJson from '../../catalog/titles.json';
import { TAG_OPTIONS } from '@/data/quiz.js';
import { buildDiagnosis, matchFreeText } from './diagnose.js';
import { FUZZY_MIN_QUERY, authorKey, fuzzyContains, normalize, snippetAround } from './text-match.js';

/**
 * 首页通用检索（两种输入，一个框，确定性分流）：
 * ① 书检索：书名 / 拼音 / 作者 / 关键词包含匹配，排序键
 *    `(字段优先级降序, book_id 升序)` —— 同输入永远同顺序，不用 localeCompare；
 * ② 问题检索：交给既有的自由文本词典（matchFreeText）→ 命中困境标签 →
 *    合成一条临时诊断走 computeResult，与问卷路径完全同一套引擎。
 *
 * 搜出来的书**不打分、不显示档位**——没打过分就不能宣称契合度。
 */

export interface BookHit {
  book: Book;
  field: 'title' | 'pinyin' | 'author' | 'keyword';
  /** 命中来自「差一个字」兜底而非严格子串；界面必须如实说明，不能冒充精确命中 */
  fuzzy?: boolean;
}

const FIELD_PRIORITY: Record<BookHit['field'], number> = {
  title: 4,
  pinyin: 3,
  author: 2,
  keyword: 1,
};

interface TitleRow {
  book_id: string;
  title: string;
  authors: string[];
  pinyin_full: string;
  pinyin_initials: string;
}

const TITLES = new Map(
  (titlesJson as TitleRow[]).map((t) => [t.book_id, t]),
);

/**
 * 拼音首字母命中规则（v1.1 收紧）。
 *
 * 旧实现是 `initials.includes(q)`，任意位置子串都算命中——
 * 于是 `yq` 会命中《慢慢来，一切都来得**及**》（mmlyqdldj 里恰好有 yq），
 * 用户搜两三个字母时结果里混进一堆不相关的书，看起来像乱搜。
 *
 * 现在的口径：**首字母只认「开头」和「结尾」，长度 ≥3 才允许中间**。
 * 理由是中文书名的语义中心词几乎总在末尾（勇气 / 沟通 / 时间），
 * 而开头对应首字缩写（gjdh → 关键对话），这两个位置截断式命中是用户真想要的；
 * 中间撞车基本都是巧合。
 */
function initialsHit(initials: string, q: string): boolean {
  if (q.length < 2 || initials.length === 0) return false;
  if (initials.startsWith(q)) return true;
  if (initials.endsWith(q)) return true;
  return q.length >= 3 && initials.includes(q);
}

export function searchBooks(query: string, books: readonly Book[]): BookHit[] {
  const q = normalize(query);
  if (q.length === 0) return [];

  const hits: BookHit[] = [];
  const misses: Book[] = [];
  for (const b of books) {
    const t = TITLES.get(b.book_id);
    let field: BookHit['field'] | null = null;
    if (normalize(b.title).includes(q)) {
      field = 'title';
    } else if (
      t &&
      // 全拼至少两个字母才认：单字母匹配等于把大半个书库倒出来
      ((q.length >= 2 && normalize(t.pinyin_full).includes(q)) || initialsHit(t.pinyin_initials, q))
    ) {
      field = 'pinyin';
    } else if (b.author_display.some((a) => normalize(a).includes(q))) {
      field = 'author';
    } else if (normalize(b.one_line_what).includes(q) || normalize(b.match_brief).includes(q)) {
      field = 'keyword';
    }
    if (field) hits.push({ book: b, field });
    else misses.push(b);
  }

  // 兜底：书名少打 / 打错一个字（「被讨厌勇气」→「被讨厌的勇气」）。
  // 只在一本都没命中时启用，且查询至少 3 个字——短串做近似匹配全是噪声。
  // 命中后标记 fuzzy，界面据此说明「不是完全对上」，不冒充精确结果。
  if (hits.length === 0) {
    for (const b of misses) {
      if (fuzzyContains(normalize(b.title), q)) {
        hits.push({ book: b, field: 'title', fuzzy: true });
      }
    }
  }

  hits.sort((a, b) => {
    const p = FIELD_PRIORITY[b.field] - FIELD_PRIORITY[a.field];
    if (p !== 0) return p;
    return a.book.book_id < b.book.book_id ? -1 : a.book.book_id > b.book.book_id ? 1 : 0;
  });
  return hits;
}

const TAG_DOMAIN = new Map<ProblemTagId, ProblemDomain>();for (const [domain, opts] of Object.entries(TAG_OPTIONS)) {
  for (const o of opts) TAG_DOMAIN.set(o.tag, domain as ProblemDomain);
}

/**
 * 问题检索：命中 ≥1 个困境标签时合成临时诊断。
 * diagnosis_id 带 `dxs:` 前缀 = 搜索入口，本地计数跳过它（方案承诺：
 * 搜索是只读浏览，不产生诊断计数）。
 */
export function searchQuestion(query: string): Diagnosis | null {
  const text = query.trim();
  if (text.length === 0) return null;

  const tags: ProblemTagId[] = [];
  const phrases = new Map<ProblemTagId, string>();
  for (const h of matchFreeText(text)) {
    if (!tags.includes(h.tag)) {
      tags.push(h.tag);
      phrases.set(h.tag, h.phrase);
    }
    if (tags.length >= 3) break;
  }
  const primary = tags[0];
  const domain = primary !== undefined ? TAG_DOMAIN.get(primary) : undefined;
  if (primary === undefined || domain === undefined) return null;

  const { diagnosis } = buildDiagnosis({ domain, tags, primary });
  for (const n of diagnosis.need_tags) {
    const p = phrases.get(n.tag);
    if (p) n.user_phrase = p; // 逐字回显用户问句里的命中片段，不用选项文案
  }
  diagnosis.diagnosis_id = `dxs:${diagnosis.diagnosis_id.slice('dx:'.length)}`;
  return diagnosis;
}

/**
 * 外围书库检索（书目层）。
 *
 * 这些书没有 34 字段标注，**只用于「这个书名/作者我这儿有没有」**，
 * 不参与打分、不显示契合度；排序只按公开信号（质量档 → 收缩分 → 评价人数），
 * 同分按 id 升序，保证同输入同输出。
 */

export interface CandidateHit {
  book: CandidateBook;
  field: 'title' | 'subtitle' | 'author';
  /** 命中处的原文片段：副标题命中时界面要把它显出来，否则用户看不出这本书为什么出现 */
  snippet: string;
  /** 同书名同作者的其他版本数（合并后才知道「一本书占了 3 条」） */
  editions: number;
}

const BUCKET_RANK: Record<CandidateBook['bucket'], number> = {
  high: 3,
  mid: 2,
  low: 1,
  unknown: 0,
};

/** 版本归并键：同名同作者视为同一本书的不同版本（豆瓣多次收录）。 */
function editionKey(b: CandidateBook): string {
  // 作者整体拼起来再归一：有人把「甲、乙」放进一个数组元素，有人拆成两个元素，
  // 逐元素比较会漏掉这种同书异写。
  return `${normalize(b.title)}|${authorKey(b.authors.join(''))}`;
}

function candidateField(b: CandidateBook, q: string): CandidateHit['field'] | null {
  if (normalize(b.title).includes(q)) return 'title';
  if (normalize(b.subtitle || '').includes(q)) return 'subtitle';
  if (b.authors.some((a) => normalize(a).includes(q))) return 'author';
  return null;
}

export function searchCandidates(
  query: string,
  books: readonly CandidateBook[],
  limit = 12,
): CandidateHit[] {
  const q = normalize(query);
  if (q.length === 0) return [];

  const matched: { book: CandidateBook; field: CandidateHit['field'] }[] = [];
  for (const b of books) {
    let field = candidateField(b, q);
    if (field === null && q.length >= FUZZY_MIN_QUERY && fuzzyContains(normalize(b.title), q)) {
      field = 'title'; // 书名差一个字的兜底，与核心库同一口径
    }
    if (field !== null) matched.push({ book: b, field });
  }

  matched.sort((x, y) => {
    const rank = BUCKET_RANK[y.book.bucket] - BUCKET_RANK[x.book.bucket];
    if (rank !== 0) return rank;
    const qa = x.book.q ?? -1;
    const qb = y.book.q ?? -1;
    if (qb !== qa) return qb - qa;
    const va = x.book.votes ?? -1;
    const vb = y.book.votes ?? -1;
    if (vb !== va) return vb - va;
    return x.book.id < y.book.id ? -1 : x.book.id > y.book.id ? 1 : 0;
  });

  // 合并同书多版本：排序后只留排最前的那条，其余记成「另有 N 个版本」。
  // 不合并的话，一本书占 3 张卡，看起来像搜出了三本书。
  const out: CandidateHit[] = [];
  const seen = new Map<string, CandidateHit>();
  for (const m of matched) {
    const key = editionKey(m.book);
    const existed = seen.get(key);
    if (existed) {
      existed.editions += 1;
      continue;
    }
    const hit: CandidateHit = {
      book: m.book,
      field: m.field,
      snippet: m.field === 'subtitle' ? snippetAround(m.book.subtitle || '', q) : '',
      editions: 0,
    };
    seen.set(key, hit);
    out.push(hit);
  }
  return out.slice(0, limit);
}
