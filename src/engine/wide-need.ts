import type { ProblemTagWeight } from '@/contracts/book.js';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import type { CandidateBook } from '@/data/candidates.js';
import { inDomainPool } from '@/data/domain-map.js';
import { normalizeTitle, type WidePool } from './wide-pool.js';

/**
 * 「按需求取书」：候选层有了派生困境标签之后，全库池不该再只按口碑档轮转，
 * 而要按**这本书沾不沾你这个困境**排序。
 *
 * 匹配口径与核心库的 `problemFit` 完全一致（覆盖率，不是 Jaccard）：
 * `Σ min(用户权重, 书权重) / Σ 用户权重`。口径一致才能让两边的话可比。
 *
 * 为什么门槛设 0.2：只命中第三需求时命中率 ≈ 0.15 < 0.2 —— 这种书属于
 * 「同领域但不沾题」，留在池子里只会把真正相关的书挤到后面。
 */
export const MIN_DEMAND_FIT = 0.2;

/**
 * 弱证据（豆瓣大类兜底）**不进这个函数**。
 *
 * 这一条改过一版，值得写清为什么。原先是「强证据不足 20 本时整池降级，
 * 把兜底证据的书也放进来，逐本标『相关性较弱』」。听起来诚实，实际是把
 * 一个系统性错误包装成一句免责说明：豆瓣标签 → 困境标签是 **1 对多** 的
 * （「心理学」同时映射到 5 个标签，「人生」映射到 6 个），而一本书只留 3 个标签，
 * 留下的那 3 个由书 id 散列决定——**等于随机抽签**。
 *
 * 实测后果：33 个标签里 27 个的兜底证据占比 ≥80%，16 个标签的强证据书不到 20 本，
 * 也就是说「降级」不是例外而是这些标签的常态路径。《嫌疑人X的献身》以「心理学」
 * 大类出现在焦虑标签下，就是这条路径的产物。
 *
 * 现在：`loadDerivedTags()` 只返回书名证据（`source === 'title'`），池子小就如实小。
 * 少给几本，比给一堆不对题的书更符合「不凑数」这条底线。
 */
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
  const seen = new Set((opts.excludeTitles ?? []).map(normalizeTitle));
  const rows: Row[] = [];

  for (const book of candidates) {
    if (!inDomainPool(book.domains, domain)) continue;
    if (excludedBookIds.has(book.id)) continue;
    if (seen.has(normalizeTitle(book.title))) continue;
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
