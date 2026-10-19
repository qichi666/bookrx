import type { Availability } from '@/contracts/enums.js';
import type { ScoredBook } from './score.js';

/**
 * tie-break 第 4 级的排序键：inline 最小。
 * 「优先推能读的」由这一级承担，`availability` 因子本身只有 500（上限 800）。
 */
const AVAILABILITY_ORDER: Record<Availability, number> = {
  inline: 0,
  bring_your_own: 1,
  external: 2,
};

/**
 * 6 级 tie-break 全序链（SPEC §6.3 ③）：
 * `score_bp↓ → problem.fit↓ → difficulty.fit↓ → availability↑ → est_reading_hours↑ → book_id↑`
 *
 * 第 6 级 `book_id` 保证**全序**，因此不依赖 `Array.prototype.sort` 的稳定性，
 * 也不需要任何时间字段（SPEC §5.2 明令禁止 `last_reviewed` 这类会让结果随时间漂移的键）。
 * 本函数不得使用 `Math.random` / `Date.now` —— 可复现性由 `tests/domain` 断言。
 */
export function compareScored(a: ScoredBook, b: ScoredBook): number {
  if (a.score_bp !== b.score_bp) return b.score_bp - a.score_bp;

  const ap = a.factors.problem.fit_bp;
  const bpv = b.factors.problem.fit_bp;
  if (ap !== bpv) return bpv - ap;

  const ad = a.factors.difficulty.fit_bp;
  const bd = b.factors.difficulty.fit_bp;
  if (ad !== bd) return bd - ad;

  const aa = AVAILABILITY_ORDER[a.book.availability];
  const ba = AVAILABILITY_ORDER[b.book.availability];
  if (aa !== ba) return aa - ba;

  const ah = a.book.est_reading_hours;
  const bh = b.book.est_reading_hours;
  if (ah !== bh) return ah - bh;

  return a.book.book_id < b.book.book_id ? -1 : a.book.book_id > b.book.book_id ? 1 : 0;
}

export function rankBooks(list: readonly ScoredBook[]): ScoredBook[] {
  return list.slice().sort(compareScored);
}
