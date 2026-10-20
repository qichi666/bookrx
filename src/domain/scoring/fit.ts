import type { Book } from '@/contracts/book.js';
import type { Availability, DepthLevel, FactorId, FormType, ProblemTagId } from '@/contracts/enums.js';
import { FULL_COVERAGE, type FieldCoverage } from './coverage.js';
import { BP_SCALE, bp, clampBp } from './numeric.js';
import type { AxisTargets } from './targets.js';

/** 三档序数：同档 10000 / 相邻 6000 / 跨档 1500 */
const ORDINAL_FIT = [10000, 6000, 1500] as const;
const DEPTH_ORDER: Record<DepthLevel, number> = { howto: 0, howto_why: 1, why: 2 };
const FORM_ORDER: Record<FormType, number> = { story: 0, method: 1, framework: 2 };
/** 档差 0→10000 / 1→6000 / 2→2500 / 3→0；「不限」→7000 */
const LENGTH_FIT_BY_GAP = [10000, 6000, 2500, 0] as const;
const LENGTH_FIT_UNRESTRICTED = 7000;
const AVAILABILITY_FIT: Record<Availability, number> = {
  inline: 10000,
  bring_your_own: 5500,
  external: 2500,
};

export interface FitResult {
  /** 只含本次在场的因子（跳答的因子不在其中） */
  fits: Partial<Record<FactorId, number>>;
  /** 0–10000 整型基点。`0` 即主诉未被覆盖 ⇒ 档位封顶 explore */
  primary_hit: number;
}

function bookWeightOn(book: Book, tag: ProblemTagId): number {
  for (const pt of book.problem_tags ?? []) {
    if (pt.tag === tag) return pt.weight;
  }
  return 0;
}

function problemFit(
  book: Book,
  userTags: ReadonlyMap<ProblemTagId, number>,
  declared: ReadonlyMap<ProblemTagId, number> | undefined,
): number {
  let covered = 0;
  let total = 0;
  for (const [tag, uw] of userTags) {
    total += uw;
    covered += Math.min(uw, bookWeightOn(book, tag));
  }
  if (total <= 0) return 0;

  /**
   * 分母只算「用户主动声明的标签」（问卷里点选的那些），自由文本新命中的标签
   * **只进分子**。理由是一次实测出来的反直觉现象：
   *
   * 覆盖率口径是 `Σ min(用户, 书) / Σ 用户`。自由文本命中一个新标签时按 0.15
   * 追加进 `need_tags` —— 于是分母 1.0 → 1.15，而绝大多数书根本没有这个标签，
   * 分子一动不动。结果是：**用户把话说得更具体，推荐反而更没把握**
   * （前两本 7827/7427 掉到 7127/6727，固定 −700bp，卡在 6000 附近的直接
   * `worth` → `explore`）。
   *
   * 从用户视角看，补一句话是"帮你更懂我"，不是"我有 6 个需求，你只满足 5 个"。
   * 所以：命中新标签 ⇒ 加分；没命中 ⇒ 分数不变（而不是扣分）。
   *
   * `declared` 缺省时退回旧行为（分母 = 全部标签），老的直接调用与单测不受影响。
   */
  let denom = 0;
  for (const w of (declared ?? userTags).values()) denom += w;
  if (denom <= 0) denom = total;
  // 分母不得大于全部权重和，也不得小于最小值；同时 covered 按分母截断，
  // 保证结果一定落在 0–10000，且「全中」恰好 10000。
  const bounded = Math.min(denom, total);
  return clampBp(bp(Math.min(covered, bounded) / bounded));
}

function ordinalFit(a: number, b: number): number {
  const dist = Math.abs(a - b);
  return ORDINAL_FIT[Math.min(dist, ORDINAL_FIT.length - 1)] as number;
}

/** 距离越远分越低：`10000 − bp(|book − target| / 4)`。target 恒为整数，故结果落在 0/2500/…/10000 */
function scaleDistanceFit(bookValue: number, target: number): number {
  return clampBp(BP_SCALE - bp(Math.abs(bookValue - target) / 4));
}

export function computeFits(
  book: Book,
  userTags: ReadonlyMap<ProblemTagId, number>,
  primary: { tag: ProblemTagId; weight: number } | null,
  t: AxisTargets,
  coverage: FieldCoverage = FULL_COVERAGE,
  /** 用户主动声明的标签（点选），用于 problem 因子分母；省略 = 沿用全部标签 */
  declaredTags?: ReadonlyMap<ProblemTagId, number>,
): FitResult {
  const fits: Partial<Record<FactorId, number>> = {};

  // 每个因子都先看「这本书这个字段标过没有」——未标注就不产生 fit，
  // 而不是拿占位值算出一个看起来合理的分。
  if (coverage.problem) fits.problem = problemFit(book, userTags, declaredTags);

  if (t.active_factors.includes('difficulty') && coverage.difficulty) {
    fits.difficulty = scaleDistanceFit(book.difficulty, t.difficulty_target);
  }
  if (t.active_factors.includes('readability') && coverage.readability) {
    fits.readability = scaleDistanceFit(book.prose_accessibility, t.readability_target);
  }
  if (t.active_factors.includes('depth') && t.depth_target && coverage.depth) {
    fits.depth = ordinalFit(DEPTH_ORDER[book.depth], DEPTH_ORDER[t.depth_target]);
  }
  if (t.active_factors.includes('form') && t.form_target && coverage.form) {
    fits.form = ordinalFit(FORM_ORDER[book.form], FORM_ORDER[t.form_target]);
  }
  if (t.active_factors.includes('length') && coverage.length) {
    fits.length = t.length_target === null
      ? LENGTH_FIT_UNRESTRICTED
      : (LENGTH_FIT_BY_GAP[Math.min(Math.abs(book.length_class - t.length_target), 3)] as number);
  }
  fits.availability = AVAILABILITY_FIT[book.availability];

  let primary_hit = 0;
  if (coverage.problem && primary && primary.weight > 0) {
    const covered = Math.min(primary.weight, bookWeightOn(book, primary.tag));
    primary_hit = clampBp(bp(covered / primary.weight));
  }

  return { fits, primary_hit };
}
