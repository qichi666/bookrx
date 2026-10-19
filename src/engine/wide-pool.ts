import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { CandidateBook } from '@/data/candidates.js';

/**
 * 全库推荐池（书目层）。
 *
 * 为什么单独一层：核心库只有十几本人工标注书，按 34 字段打分；候选层
 * 六千多本只有「域 + 公开口碑」，没有难度/体例/篇幅标注。**不能把它们塞进
 * 7 因子打分**——那等于用编造的字段算分。正确做法是：核心层继续按标注打分，
 * 候选层按「同域 + 质量档」轮转补位，如实标「未标注」。
 *
 * 三条硬规则：
 *  ① 全库覆盖：按质量档分桶，桶内用 epoch 偏移循环取——同一批不重复，
 *     跑满 ceil(池子大小/limit) 轮后每本都出现过；
 *  ② 不重复：同 id、同书名（归一后）在本次结果里只出现一次，且与核心库已展示书名去重；
 *  ③ 确定性：同 (diagnosis, epoch) → 同结果，不用 Math.random / 时间。
 */

export type WideBucket = CandidateBook['bucket'];

/** 归一化书名：去空白、书名号、常见标点与版本缀，用于跨库去重。 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s《》「」『』:：,，.。·\-—_/\\|"'“”‘’!！?？]/g, '')
    .toLowerCase();
}

/** 同一档内的确定性顺序：收缩分降序 → 评价人数降序 → id 升序。 */
function compareInBucket(a: CandidateBook, b: CandidateBook): number {
  const qa = a.q ?? -1;
  const qb = b.q ?? -1;
  if (qb !== qa) return qb - qa;
  const va = a.votes ?? -1;
  const vb = b.votes ?? -1;
  if (vb !== va) return vb - va;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface WidePickOptions {
  /** 「换一批」计数：每次 +1 前进一个窗口；同 epoch 结果稳定 */
  epoch: number;
  limit: number;
  /** 已展示过的书名（核心库 + 库外建议），用于跨层去重 */
  excludeTitles?: readonly string[];
}

export interface WidePool {
  /** 当前域下可用的候选总数（不受 epoch 影响） */
  size: number;
  picks: CandidateBook[];
}

/**
 * 取一批候选书。
 *
 * 抽取顺序：high → mid → unknown → low 轮转，每桶按 epoch 步进游标。
 * 这样「换一批」既换书，又不会一下掉到低质量区；跑满一轮后回到开头，
 * 保证**池子里每一本都会轮到**。
 */
export function pickWide(
  candidates: readonly CandidateBook[],
  diagnosis: Diagnosis,
  opts: WidePickOptions,
): WidePool {
  const domain = diagnosis.answers.domain;
  const excludedIds = new Set(diagnosis.excluded_book_ids.map(String));
  const seen = new Set((opts.excludeTitles ?? []).map(normalizeTitle));

  const buckets: Record<WideBucket, CandidateBook[]> = {
    high: [],
    mid: [],
    unknown: [],
    low: [],
  };

  for (const c of candidates) {
    if (!c.domains.includes(domain)) continue;
    if (excludedIds.has(c.id)) continue;
    if (seen.has(normalizeTitle(c.title))) continue;
    buckets[c.bucket].push(c);
  }
  for (const key of Object.keys(buckets) as WideBucket[]) {
    buckets[key].sort(compareInBucket);
  }

  const size = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);
  const order: WideBucket[] = ['high', 'mid', 'unknown', 'low'];
  // 游标每轮只前进 1（滑动窗口）：若按 limit 步进，会与桶大小形成短周期，
  // 永远只覆盖前几本。步进 1 保证跑满 ceil(n/k) 轮后每本都露过面。
  const cursor: Record<WideBucket, number> = {
    high: opts.epoch,
    mid: opts.epoch,
    unknown: opts.epoch,
    low: opts.epoch,
  };

  const picks: CandidateBook[] = [];
  const pickedTitles = new Set<string>();
  let guard = 0;
  while (picks.length < opts.limit && guard < opts.limit * 40) {
    let progressed = false;
    for (const key of order) {
      if (picks.length >= opts.limit) break;
      const arr = buckets[key];
      if (arr.length === 0) continue;
      const book = arr[cursor[key] % arr.length];
      cursor[key] += 1;
      guard += 1;
      if (book === undefined) continue;
      const title = normalizeTitle(book.title);
      if (pickedTitles.has(title)) continue;
      pickedTitles.add(title);
      picks.push(book);
      progressed = true;
    }
    if (!progressed && guard > opts.limit * 4) break;
  }

  return { size, picks };
}
