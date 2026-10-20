import type { Book } from '@/contracts/book.js';
import type { FactorFit } from '@/contracts/recommendation.js';
import type { FactorId, ProblemTagId } from '@/contracts/enums.js';
import { BP_SCALE } from './numeric.js';
import { coverageBp, effectiveFactors, FULL_COVERAGE, type FieldCoverage } from './coverage.js';
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
  /**
   * 这本书的标注覆盖率（0–10000）。13 本核心库 = 10000（28 字段人工核对），
   * 候选层 = 3800（只有困境标签可推）。**档位会按它封顶**，见 `tierOf`。
   */
  book_coverage_bp: number;
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
  coverage: FieldCoverage = FULL_COVERAGE,
  /** 用户主动声明的标签（点选），只影响 problem 因子的分母，见 `fit.ts` 的注释 */
  declaredTags?: ReadonlyMap<ProblemTagId, number>,
): ScoredBook {
  // 参与打分的因子 = 用户答了的 ∩ 书上标了的。缺一边就不算，权重还给别人。
  const effective = effectiveFactors(t.active_factors, coverage);
  const weights_used = renormalizeWeights(effective);
  const { fits, primary_hit } = computeFits(book, userTags, primary, t, coverage, declaredTags);

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

  return { book, score_bp, primary_hit, factors, weights_used, book_coverage_bp: coverageBp(coverage) };
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
