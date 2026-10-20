import type { ProblemTagWeight } from '@/contracts/book.js';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import type { CandidateBook } from '@/data/candidates.js';
import type { WidePool } from './wide-pool.js';

/**
 * 「按需求取书」：候选层有了派生困境标签之后，全库池不该再只按口碑档轮转，
 * 而要按**这本书沾不沾你这个困境**排序。
 *
 * 匹配口径与核心库的 `problemFit` 完全一致（覆盖率，不是 Jaccard）：
 * `Σ min(用户权重, 书权重) / Σ 用户权重`。口径一致才能让两边的话可比。
 *
 * 为什么门槛设 0.2：只有 0.4 权重的兜底标签、且只命中第三需求时，
 * 命中率 = min(0.15, 0.4)/1.0 = 0.15 < 0.2 —— 这种书属于「同领域但不沾题」，
 * 留在池子里只会把真正相关的书挤到后面。
 */
export const MIN_DEMAND_FIT = 0.2;

export function needFit(
  tags: readonly ProblemTagWeight[],
  demand: ReadonlyMap<ProblemTagId, number>,
): number {
  let total = 0;
  let covered = 0;
  const byTag = new Map<string, number>();
  for (const t of tags) {
    const cur = byTag.get(t.tag) ?? 0;
    if (t.weight > cur) byTag.set(t.tag, t.weight);
  }
  for (const [tag, w] of demand) {
    if (w <= 0) continue;
    total += w;
    covered += Math.min(w, byTag.get(tag) ?? 0);
  }
  return total <= 0 ? 0 : Math.round((covered / total) * 1000) / 1000;
}

interface Row {
  book: CandidateBook;
  hit: number;
}

function compareRows(a: Row, b: Row): number {
  if (b.hit !== a.hit) return b.hit - a.hit;
  const qa = a.book.q ?? -1;
  const qb = b.book.q ?? -1;
  if (qb !== qa) return qb - qa;
  const va = a.book.votes ?? -1;
  const vb = b.book.votes ?? -1;
  if (vb !== va) return vb - va;
  return a.book.id < b.book.id ? -1 : a.book.id > b.book.id ? 1 : 0;
}

export interface NeedSelectOptions {
  epoch: number;
  limit: number;
  excludeTitles?: readonly string[];
}

/**
 * 选一批：按命中率降序排成一条序列，第 epoch 批取第 epoch 个窗口。
 * 与质量档池同一套窗口法，因此「换一批」跑满 ceil(相关书数/limit) 轮后
 * **每一本相关书都会露面**，且一个周期内不重复。
 */
export function selectByNeed(
  candidates: readonly CandidateBook[],
  derived: ReadonlyMap<string, readonly ProblemTagWeight[]>,
  demand: ReadonlyMap<ProblemTagId, number>,
  domain: ProblemDomain,
  excludedBookIds: ReadonlySet<string>,
  opts: NeedSelectOptions,
): WidePool {
  const seen = new Set((opts.excludeTitles ?? []).map((t) => t.toLowerCase()));
  const rows: Row[] = [];

  for (const book of candidates) {
    if (!book.domains.includes(domain)) continue;
    if (excludedBookIds.has(book.id)) continue;
    if (seen.has(book.title.toLowerCase())) continue;
    const tags = derived.get(book.id);
    if (tags === undefined) continue;
    const hit = needFit(tags, demand);
    if (hit < MIN_DEMAND_FIT) continue;
    rows.push({ book, hit });
  }

  rows.sort(compareRows);
  const size = rows.length;
  if (size === 0) return { size: 0, picks: [] };

  const limit = Math.max(1, Math.min(opts.limit, size));
  const start = ((opts.epoch % Math.ceil(size / limit)) * limit) % size;
  const picks: CandidateBook[] = [];
  for (let i = 0; i < limit; i += 1) {
    const row = rows[(start + i) % size];
    if (row !== undefined) picks.push(row.book);
  }
  return { size, picks };
}
