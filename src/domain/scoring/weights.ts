import type { FactorId } from '@/contracts/enums.js';
import { allocateToTotal } from './numeric.js';

/**
 * 七因子权重（SPEC §6.2）。**和必须 = 10000，单测锁定。**
 * 这张表是本文件唯一的真源——`FACTOR_IDS` 从它派生，不另写一份列表。
 */
export const BASE_WEIGHTS_BP: Readonly<Record<FactorId, number>> = Object.freeze({
  problem: 3800,
  difficulty: 1800,
  depth: 1200,
  form: 1000,
  length: 1000,
  readability: 700,
  availability: 500,
});

export const WEIGHT_TOTAL_BP = 10000;

/**
 * `availability` 的权重上限：500 是基准，**归一化后也不许超过 800**。
 * SPEC §6.2：「只作扳机不许做主排序力」——真正承担「优先推能读的」的是 tie-break 第 4 级。
 * 若不设这个上限，第 3 屏全跳时 500 会被放大到 1163（= 11.6%，是基准的 2.3 倍），
 * 「只作扳机」这条承诺就只在用户答满第 3 屏时成立。
 *
 * **与 `ARCH §3.10` 的冲突已修（2026-10-19）**：那一节原来算的是 `problem 8837 / availability 1163`，
 * 没有这个封顶。SPEC §6.2 的「上限 800」写在权重表里，按 SPEC 优先执行封顶，
 * §3.10 已同步改为 `9200 / 800`（封顶把 1163 压回 800，差额归 `problem`）。
 */
export const AVAILABILITY_MAX_WEIGHT_BP = 800;

/** 顺序固定，用于分配与输出的确定性。 */
export const FACTOR_IDS: readonly FactorId[] = Object.freeze([
  'problem',
  'difficulty',
  'depth',
  'form',
  'length',
  'readability',
  'availability',
]);

/**
 * 跳答处理（SPEC §6.1）：未答的那组驱动的因子**整条移除**，
 * 其余权重按比例重分配并归一化到 10000。
 *
 * 为什么不能给未观测的维度填中位数：那一个因子会稳定输出 5000 分，
 * 既不可解释，也会把真正有信号的因子挤薄。
 *
 * `availability` 恒在（它不由任何 chip 驱动），`problem` 恒在（第 1、2 屏必答）。
 */
export function renormalizeWeights(active: readonly FactorId[]): Record<FactorId, number> {
  const activeSet = new Set(active);
  const out = {} as Record<FactorId, number>;
  for (const id of FACTOR_IDS) out[id] = 0;

  const raws = FACTOR_IDS.filter((id) => activeSet.has(id)).map((id) => BASE_WEIGHTS_BP[id]);
  const alloc = allocateToTotal(raws, WEIGHT_TOTAL_BP);

  let i = 0;
  for (const id of FACTOR_IDS) {
    if (activeSet.has(id)) out[id] = alloc[i++] as number;
  }

  // availability 封顶后，把差额按基准权重重新分给其余在场的因子
  if (out.availability > AVAILABILITY_MAX_WEIGHT_BP) {
    out.availability = AVAILABILITY_MAX_WEIGHT_BP;
    const rest = FACTOR_IDS.filter((id) => activeSet.has(id) && id !== 'availability');
    const restRaw = rest.map((id) => BASE_WEIGHTS_BP[id]);
    const restTotal = WEIGHT_TOTAL_BP - AVAILABILITY_MAX_WEIGHT_BP;
    const restAlloc = allocateToTotal(restRaw, restTotal);
    rest.forEach((id, k) => {
      out[id] = restAlloc[k] as number;
    });
  }

  return out;
}

/** 七因子全在场时的权重（= 基准表）。用于单测与调试输出。 */
export function fullWeights(): Record<FactorId, number> {
  return renormalizeWeights(FACTOR_IDS);
}
