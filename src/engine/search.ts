import type { Book } from '@/contracts/book.js';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import titlesJson from '../../catalog/titles.json';
import { TAG_OPTIONS } from '@/data/quiz.js';
import { buildDiagnosis, matchFreeText } from './diagnose.js';

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

/** 统一小写并去掉空白，中文不受影响。 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

export function searchBooks(query: string, books: readonly Book[]): BookHit[] {
  const q = normalize(query);
  if (q.length === 0) return [];

  const hits: BookHit[] = [];
  for (const b of books) {
    const t = TITLES.get(b.book_id);
    let field: BookHit['field'] | null = null;
    if (normalize(b.title).includes(q)) {
      field = 'title';
    } else if (
      t &&
      (normalize(t.pinyin_full).includes(q) || (t.pinyin_initials.length > 0 && t.pinyin_initials.includes(q)))
    ) {
      field = 'pinyin';
    } else if (b.author_display.some((a) => normalize(a).includes(q))) {
      field = 'author';
    } else if (normalize(b.one_line_what).includes(q) || normalize(b.match_brief).includes(q)) {
      field = 'keyword';
    }
    if (field) hits.push({ book: b, field });
  }

  hits.sort((a, b) => {
    const p = FIELD_PRIORITY[b.field] - FIELD_PRIORITY[a.field];
    if (p !== 0) return p;
    return a.book.book_id < b.book.book_id ? -1 : a.book.book_id > b.book.book_id ? 1 : 0;
  });
  return hits;
}

const TAG_DOMAIN = new Map<ProblemTagId, ProblemDomain>();
for (const [domain, opts] of Object.entries(TAG_OPTIONS)) {
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
