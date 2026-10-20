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
 * 为什么门槛设 0.2：只有 0.35 权重的兜底标签、且只命中第三需求时，
 * 命中率 = min(0.15, 0.35)/1.0 = 0.15 < 0.2 —— 这种书属于「同领域但不沾题」，
 * 留在池子里只会把真正相关的书挤到后面。
 */
export const MIN_DEMAND_FIT = 0.2;

/**
 * 书名证据的下限（与 `catalog/problem-lexicon.json` 的 title 权重对齐）。
 *
 * **证据强度和权重是两件事**，这轮把它们拆开了：书名里写着「倦怠」是强证据，
 * 豆瓣把它归到「职场」大类是弱证据，而两者原来被压成同一个 0.4–0.9 的连续数，
 * 于是「调权重」同时在做「调相关度」和「调可信度」两件事，怎么调都是跷跷板。
 *
 * 现在的规则：默认只用强证据；强证据书不足 `MIN_POOL_FOR_STRONG` 本时才降级启用弱证据，
 * 且降级状态下逐本标「相关性较弱」。
 */
export const TITLE_EVIDENCE_MIN = 0.85;

/** 强证据池低于这个数，就允许把弱证据放进来凑（否则"换一批"没意义）。 */
export const MIN_POOL_FOR_STRONG = 20;

export function isTitleEvidence(weight: number): boolean {
  return weight >= TITLE_EVIDENCE_MIN;
}

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

/** 只保留书名证据再算一次命中率（弱证据书在这里会掉到 0）。 */
export function needFitStrong(
  tags: readonly ProblemTagWeight[],
  demand: ReadonlyMap<ProblemTagId, number>,
): number {
  return needFit(
    tags.filter((t) => isTitleEvidence(t.weight)),
    demand,
  );
}

interface Row {
  book: CandidateBook;
  hit: number;
  weak: boolean;
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
  /** 强证据池的放行下限，默认 `MIN_POOL_FOR_STRONG`（测试里可调小） */
  minStrongPool?: number;
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
  const minStrong = opts.minStrongPool ?? MIN_POOL_FOR_STRONG;

  const strong: Row[] = [];
  const all: Row[] = [];

  for (const book of candidates) {
    if (!inDomainPool(book.domains, domain)) continue;
    if (excludedBookIds.has(book.id)) continue;
    if (seen.has(normalizeTitle(book.title))) continue;
    const tags = derived.get(book.id);
    if (tags === undefined) continue;

    const hitAll = needFit(tags, demand);
    if (hitAll < MIN_DEMAND_FIT) continue;

    const hitStrong = needFitStrong(tags, demand);
    all.push({ book, hit: hitAll, weak: hitStrong < MIN_DEMAND_FIT });
    // 强证据排序也用 hitAll：同一本书里强证据和弱证据都可能命中，弱证据不该被抹掉，
    // 它只决定「这本书能不能在默认状态下进池」。
    if (hitStrong >= MIN_DEMAND_FIT) strong.push({ book, hit: hitAll, weak: false });
  }

  // 强证据够用就只用强证据；不够才整池降级，并逐本记下谁是靠兜底进来的
  const useFallback = strong.length < minStrong;
  const rows = useFallback ? all : strong;
  rows.sort(compareRows);

  const size = rows.length;
  if (size === 0) {
    return { size: 0, picks: [], evidence: useFallback ? 'fallback' : 'title', weak_ids: new Set() };
  }

  const weakIds = new Set<string>();
  if (useFallback) for (const r of rows) if (r.weak) weakIds.add(r.book.id);

  const limit = Math.max(1, Math.min(opts.limit, size));
  const start = ((opts.epoch % Math.ceil(size / limit)) * limit) % size;
  const picks: CandidateBook[] = [];
  for (let i = 0; i < limit; i += 1) {
    const row = rows[(start + i) % size];
    if (row !== undefined) picks.push(row.book);
  }
  return {
    size,
    picks,
    evidence: useFallback ? 'fallback' : 'title',
    weak_ids: weakIds,
  };
}
