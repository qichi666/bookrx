import type { FactorId } from '@/contracts/enums.js';
import { BASE_WEIGHTS_BP } from './weights.js';

/**
 * 字段覆盖率：**哪些字段是"真的标注过"，而不是填了个占位值**。
 *
 * 为什么需要它：核心库 13 本是人工逐本核对的，候选层 6551 本只有「域 + 豆瓣标签 +
 * 口碑」。若把候选书塞进 7 因子打分并给缺失字段填默认值，那些默认值会变成
 * 真实分数的一部分——那不是推荐，是编造。做法改为：**缺失字段对应的因子整条不参与**
 * （与"跳答"同一机制，复用 `renormalizeWeights`），并把覆盖率如实报出来。
 *
 * 一条硬约束（有单测）：未覆盖字段填任何值都不影响分数。填 `1` 和填 `5` 必须同分。
 */
export interface FieldCoverage {
  /** 困境标签（因子 1，权重 3800） */
  problem: boolean;
  /** 难度（因子 2，1800） */
  difficulty: boolean;
  /** 认识深度（因子 3，1200） */
  depth: boolean;
  /** 体例（因子 4，1000） */
  form: boolean;
  /** 篇幅（因子 5，1000） */
  length: boolean;
  /** 表达友好度（因子 6，700） */
  readability: boolean;
}

/** 参与覆盖率的因子（`availability` 恒可得：它来自渠道字段，不需要读整本书） */
const COVERED_FACTORS: readonly Exclude<FactorId, 'availability'>[] = [
  'problem',
  'difficulty',
  'depth',
  'form',
  'length',
  'readability',
];

export const FULL_COVERAGE: FieldCoverage = Object.freeze({
  problem: true,
  difficulty: true,
  depth: true,
  form: true,
  length: true,
  readability: true,
});

/**
 * 只有困境标签可用的覆盖率（候选层的现状）：
 * 3800（problem）+ 500（availability）= 4300 / 10000。
 * 够判"这本书沾不沾题"，不够判"适不适合你"。
 */
export const PROBLEM_ONLY_COVERAGE: FieldCoverage = Object.freeze({
  problem: true,
  difficulty: false,
  depth: false,
  form: false,
  length: false,
  readability: false,
});

/**
 * 进 `strong` 所需的最低覆盖率：6000（= 至少 problem + 难度 + 深度 = 3800+1800+1200 = 6800）。
 * 只有 4300 覆盖率时，"高度契合"这句话没有依据——它只有 43% 的信息支撑。
 */
export const STRONG_MIN_COVERAGE_BP = 6000;

/**
 * 覆盖率 = 已覆盖因子的基准权重之和。全标 = 10000。
 * `availability` 恒计入：它来自渠道字段（本站可读/自备/外链），不需要读整本书。
 */
export function coverageBp(c: FieldCoverage): number {
  let sum = BASE_WEIGHTS_BP.availability;
  for (const f of COVERED_FACTORS) {
    if (c[f]) sum += BASE_WEIGHTS_BP[f];
  }
  return sum;
}

/** 某因子是否可算：`availability` 不看覆盖率。 */
export function isCovered(f: FactorId, c: FieldCoverage): boolean {
  return f === 'availability' ? true : c[f as keyof FieldCoverage];
}

/** 把"用户答了哪些"与"书标了哪些"求交——两边都满足的因子才真参与打分。 */
export function effectiveFactors(
  active: readonly FactorId[],
  c: FieldCoverage,
): FactorId[] {
  return active.filter((f) => isCovered(f, c));
}
