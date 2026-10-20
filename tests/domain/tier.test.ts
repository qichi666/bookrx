import { describe, expect, it } from 'vitest';
import {
  TIER_STRONG_MIN_BP,
  TIER_WORTH_MIN_BP,
  tierOf,
} from '@/domain/scoring/tier.js';

describe('档位判定（SPEC §6.3 ⑦）', () => {
  it('阈值是绝对值 8000 / 6000，不是分位数', () => {
    expect(TIER_STRONG_MIN_BP).toBe(8000);
    expect(TIER_WORTH_MIN_BP).toBe(6000);
  });

  it('边界：8000 与 7999 分属 strong / worth', () => {
    expect(tierOf(8000, 10000).tier).toBe('strong');
    expect(tierOf(7999, 10000).tier).toBe('worth');
  });

  it('边界：6000 与 5999 分属 worth / explore', () => {
    expect(tierOf(6000, 10000).tier).toBe('worth');
    expect(tierOf(5999, 10000).tier).toBe('explore');
  });

  it('主诉未命中 ⇒ 封顶 explore，与总分无关', () => {
    expect(tierOf(10000, 0)).toEqual({ tier: 'explore', capped_by_primary_miss: true, capped_by_low_coverage: false });
    expect(tierOf(9080, 0).tier).toBe('explore');
    expect(tierOf(9080, 0).capped_by_primary_miss).toBe(true);
    expect(tierOf(9080, 1).tier).toBe('strong');
  });

  it('封顶不改分数，只改标签：原本就是 explore 的不置 capped', () => {
    expect(tierOf(4000, 0)).toEqual({ tier: 'explore', capped_by_primary_miss: false, capped_by_low_coverage: false });
  });

  it('档位枚举只允许三个值', () => {
    for (const s of [0, 5999, 6000, 7999, 8000, 10000]) {
      expect(['strong', 'worth', 'explore']).toContain(tierOf(s, 10000).tier);
    }
  });
});
