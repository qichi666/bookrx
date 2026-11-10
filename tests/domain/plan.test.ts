import { describe, expect, it } from 'vitest';
import { FALLBACK_HOURS, planWeeks } from '@/domain/plan.js';
import type { WishItem } from '@/domain/wishlist.js';

/**
 * 排期是「看起来对、其实会把书堆成一坨」的典型：不测就发现不了。
 *
 * 这里锁死一条曾经写错的行为：单本超过周额度时，旧实现把它塞进最后一周，
 * 并把后面所有书也拉到最后一周——一本 20 小时的书会让前三周全空。
 */

function item(id: string, hours: number): WishItem {
  return {
    book_id: id,
    title: id,
    author: '',
    hours,
    difficulty: 2,
    addedAt: 0,
    sortOrder: null,
    local: false,
  };
}

describe('planWeeks', () => {
  it('按队列顺序装周，每周不超额度', () => {
    const r = planWeeks([item('a', 3), item('b', 3), item('c', 3)], 6, 4);
    expect(r.weeks[0]!.items.map((x) => x.book_id)).toEqual(['a', 'b']);
    expect(r.weeks[0]!.hours).toBe(6);
    expect(r.weeks[1]!.items.map((x) => x.book_id)).toEqual(['c']);
  });

  it('单本超过周额度：单独占当前这一周，后面的书从下一周排（不堆到最后一周）', () => {
    const r = planWeeks([item('big', 20), item('a', 3), item('b', 3)], 6, 4);
    expect(r.weeks[0]!.items.map((x) => x.book_id)).toEqual(['big']);
    expect(r.weeks[1]!.items.map((x) => x.book_id)).toEqual(['a', 'b']);
    // 旧实现会把三本全塞进第 4 周；这里断言第 3、4 周是空的
    expect(r.weeks[2]!.items).toEqual([]);
    expect(r.weeks[3]!.items).toEqual([]);
  });

  it('缺预计时长的书按中位估值，并计入 estimated_count', () => {
    const r = planWeeks([item('x', 0)], 6, 4);
    expect(r.estimated_count).toBe(1);
    expect(r.weeks[0]!.hours).toBe(FALLBACK_HOURS);
  });

  it('四周装不下时进 overflow，不塞进最后一周（最后一周不能报成 35 小时）', () => {
    const many = Array.from({ length: 10 }, (_, i) => item(`b${i}`, 5));
    const r = planWeeks(many, 6, 4);
    const placed = r.weeks.reduce((n, w) => n + w.items.length, 0);
    expect(placed).toBe(4);
    expect(r.overflow).toHaveLength(6);
    expect(r.overflow_hours).toBe(30);
    // 每一周的实际时长都不超过用户填的额度：界面上的数字必须能对上那句话
    for (const w of r.weeks) expect(w.hours).toBeLessThanOrEqual(6);
    // 一条都不能丢
    expect(placed + r.overflow.length).toBe(10);
  });

  it('超长书排满周数后也进 overflow，不叠在第四周', () => {
    const many = Array.from({ length: 5 }, (_, i) => item(`big${i}`, 20));
    const r = planWeeks(many, 6, 4);
    expect(r.weeks.map((w) => w.items.length)).toEqual([1, 1, 1, 1]);
    expect(r.overflow).toHaveLength(1);
    expect(r.overflow_hours).toBe(20);
  });

  it('每周额度传 0 时按 0.5 兜底，不会把书排空', () => {
    const r = planWeeks([item('a', 1)], 0, 4);
    expect(r.weeks.some((w) => w.items.length > 0)).toBe(true);
  });

  it('空队列返回四周空壳，不报错', () => {
    const r = planWeeks([], 6, 4);
    expect(r.weeks).toHaveLength(4);
    expect(r.total_hours).toBe(0);
    expect(r.estimated_count).toBe(0);
  });
});
