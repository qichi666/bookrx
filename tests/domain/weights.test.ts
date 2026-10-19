import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY_MAX_WEIGHT_BP,
  BASE_WEIGHTS_BP,
  FACTOR_IDS,
  WEIGHT_TOTAL_BP,
  fullWeights,
  renormalizeWeights,
} from '@/domain/scoring/weights.js';
import type { FactorId } from '@/contracts/enums.js';

/** 第 3 屏驱动的 5 个因子；`problem` 与 `availability` 恒在场 */
const OPTIONAL: readonly FactorId[] = ['difficulty', 'readability', 'form', 'depth', 'length'];

function subsets(list: readonly FactorId[]): FactorId[][] {
  const out: FactorId[][] = [];
  for (let mask = 0; mask < 1 << list.length; mask++) {
    const s: FactorId[] = ['problem', 'availability'];
    list.forEach((f, i) => {
      if (mask & (1 << i)) s.push(f);
    });
    out.push(s);
  }
  return out;
}

describe('七因子权重（SPEC §6.2）', () => {
  it('基准表之和 == 10000', () => {
    const sum = FACTOR_IDS.reduce((a, id) => a + BASE_WEIGHTS_BP[id], 0);
    expect(sum).toBe(WEIGHT_TOTAL_BP);
  });

  it('七因子全在场时不做任何改动', () => {
    expect(fullWeights()).toEqual({ ...BASE_WEIGHTS_BP });
  });

  it('全部 32 种跳答组合下：和恒为 10000，且 availability 不超过 800', () => {
    for (const active of subsets(OPTIONAL)) {
      const w = renormalizeWeights(active);
      const sum = FACTOR_IDS.reduce((a, id) => a + w[id], 0);
      expect(sum, `active=${active.join(',')}`).toBe(WEIGHT_TOTAL_BP);
      expect(w.availability, `active=${active.join(',')}`).toBeLessThanOrEqual(
        AVAILABILITY_MAX_WEIGHT_BP,
      );
      for (const id of FACTOR_IDS) {
        expect(w[id]).toBeGreaterThanOrEqual(0);
        // 不在场的因子权重必须是 0，不能残留基准值
        expect(active.includes(id) ? w[id] > 0 : w[id] === 0).toBe(true);
      }
    }
  });

  it('第 3 屏全跳：退化为 problem + availability，且 availability 被封在 800', () => {
    const w = renormalizeWeights(['problem', 'availability']);
    expect(w.problem).toBe(WEIGHT_TOTAL_BP - AVAILABILITY_MAX_WEIGHT_BP);
    expect(w.availability).toBe(AVAILABILITY_MAX_WEIGHT_BP);
    // 与 ARCH §3.10 的 8837 / 1163 不同：那一节没有这个封顶，已作为冲突报告
    expect(w.problem).toBe(9200);
  });

  it('分配结果与输入顺序无关（可复现）', () => {
    const a = renormalizeWeights(['problem', 'availability', 'length', 'form']);
    const b = renormalizeWeights(['form', 'length', 'availability', 'problem']);
    expect(a).toEqual(b);
  });
});
