import { describe, expect, it } from 'vitest';
import { hashKey, pickDaily, pickDailyIndex } from '@/lib/daily-pick.js';

/**
 * 「今天」区块的选取必须是确定性的：同一份数据、同一天，刷新十次都是同一条。
 * 这不只是洁癖——如果每次刷新都换一条，用户永远读不完那一条，"今天"就没有意义了。
 */
describe('pickDaily', () => {
  it('同输入同输出：同一天重复调用结果完全一致', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}` }));
    const first = pickDaily(items, '2026-11-10', '12');
    for (let i = 0; i < 20; i += 1) {
      expect(pickDaily(items, '2026-11-10', '12')).toBe(first);
    }
  });

  it('换一天会换一条：不同日期不应该永远落到同一个下标', () => {
    const seen = new Set<number>();
    for (let d = 1; d <= 28; d += 1) {
      seen.add(pickDailyIndex(12, `2026-11-${String(d).padStart(2, '0')}`, '12'));
    }
    // 28 天里至少覆盖 4 个不同下标；要求全不重复是苛求，但不能退化成常量
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('下标永远落在范围内', () => {
    for (let n = 1; n <= 30; n += 1) {
      for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
        const i = pickDailyIndex(n, day, String(n));
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(n);
      }
    }
  });

  it('空列表返回 null，单条永远返回那条', () => {
    expect(pickDaily([], '2026-11-10')).toBeNull();
    const one = [{ id: 'only' }];
    expect(pickDaily(one, '2026-11-10')).toEqual({ id: 'only' });
  });

  it('散列是 32 位无符号整数（不出现负数下标）', () => {
    for (const s of ['', 'a', '2026-11-10', 'book:core:000001']) {
      const h = hashKey(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
