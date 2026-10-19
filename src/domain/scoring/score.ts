import type { Book } from '@/contracts/book.js';
import type { FactorFit } from '@/contracts/recommendation.js';
import type { FactorId, ProblemTagId } from '@/contracts/enums.js';
import { BP_SCALE } from './numeric.js';
import { computeFits } from './fit.js';
import { FACTOR_IDS, renormalizeWeights } from './weights.js';
import type { AxisTargets } from './targets.js';

export interface ScoredBook {
  book: Book;
  score_bp: number;
  /** 0–10000 整型基点。`0` ⇒ 档位封顶 explore（见 tier.ts） */
  primary_hit: number;
  factors: Record<FactorId, FactorFit>;
  weights_used: Record<FactorId, number>;
}

const ZERO_FIT: FactorFit = { fit_bp: 0, weight_bp: 0, contribution: 0 };

/**
 * 打分（SPEC §6.3 ②）。硬过滤在此之前已完成，这里**不再做任何剔除**。
 *
 * `contribution = floor(fit_bp × weight_bp / 10000)`，`score_bp = Σ contribution`。
 * 先定 contribution 再把 score 定义成它的和，是为了让「7 项之和严格等于 score_bp」
 * 这条硬校验**在构造上成立**，而不是靠事后补差。一本七项全中的书恰好得 10000。
 *
 * 不在场的因子（跳答）写成全 0 而不是省略：契约里 `factors` 是完整 `Record`，
 * 且全 0 项不影响求和，调试输出也始终能看到七行。
 */
export function scoreBook(
  book: Book,
  userTags: ReadonlyMap<ProblemTagId, number>,
  primary: { tag: ProblemTagId; weight: number } | null,
  t: AxisTargets,
): ScoredBook {
  const weights_used = renormalizeWeights(t.active_factors);
  const { fits, primary_hit } = computeFits(book, userTags, primary, t);

  const factors = {} as Record<FactorId, FactorFit>;
  let score_bp = 0;

  for (const id of FACTOR_IDS) {
    const fit = fits[id];
    if (fit === undefined) {
      factors[id] = { ...ZERO_FIT };
      continue;
    }
    const weight_bp = weights_used[id];
    const contribution = Math.floor((fit * weight_bp) / BP_SCALE);
    factors[id] = { fit_bp: fit, weight_bp, contribution };
    score_bp += contribution;
  }

  return { book, score_bp, primary_hit, factors, weights_used };
}

/** 契约硬校验：七项 contribution 之和必须严格等于 score_bp。测试与调试构建都调用它。 */
export function assertContributionSum(s: ScoredBook): void {
  const sum = FACTOR_IDS.reduce((acc, id) => acc + s.factors[id].contribution, 0);
  if (sum !== s.score_bp) {
    throw new Error(
      `contribution 之和 ${sum} != score_bp ${s.score_bp}（book_id=${s.book.book_id}）`,
    );
  }
  const wsum = FACTOR_IDS.reduce((acc, id) => acc + s.weights_used[id], 0);
  if (wsum !== BP_SCALE) {
    throw new Error(`权重之和 ${wsum} != ${BP_SCALE}（book_id=${s.book.book_id}）`);
  }
}
