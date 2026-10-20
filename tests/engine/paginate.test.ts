import { describe, expect, it } from 'vitest';
import { chapterPercent, pageCapacity, pageOfParagraph, paginate } from '@/engine/paginate.js';

/**
 * 分页的三条性质（都是"用户会立刻察觉"的那类）：
 *  ① 段落整段出现，绝不跨页断开；
 *  ② 每个段落恰好出现在一页里（不重不漏）；
 *  ③ 字号变大 → 页数变多，但同一个段落仍在某一页里（位置不丢）。
 */

const para = (n: number, len = 100): string => String(n).padStart(3, '0') + '甲'.repeat(len - 3);

describe('paginate', () => {
  it('段落不跨页断开：任何一段的字数都 ≤ 一页容量时，页内字数不超过容量', () => {
    const ps = Array.from({ length: 20 }, (_, i) => para(i, 120));
    const pages = paginate(ps, 400);
    for (const p of pages) {
      const chars = p.paragraphIndices.reduce((n, i) => n + (ps[i] as string).length, 0);
      // 单段超过容量时允许它独占一页，这里每段 120 < 400，所以不应超
      expect(chars).toBeLessThanOrEqual(400);
    }
  });

  it('不重不漏：所有段的出现次数恰好各一次，且同页内下标升序', () => {
    const ps = Array.from({ length: 37 }, (_, i) => para(i, 90 + i));
    const seen: number[] = [];
    for (const p of paginate(ps, 300)) {
      expect([...p.paragraphIndices].sort((a, b) => a - b)).toEqual(p.paragraphIndices);
      seen.push(...p.paragraphIndices);
    }
    expect(seen).toEqual(ps.map((_, i) => i));
  });

  it('超长段落独占一页，不和别人挤（否则它必然被切开）', () => {
    const ps = ['短', '乙'.repeat(1000), '短2'];
    const pages = paginate(ps, 300);
    const big = pages.find((p) => p.paragraphIndices.includes(1));
    expect(big?.paragraphIndices).toEqual([1]);
  });

  it('空章节给一个空页，而不是零页（否则页码会显示 1/0）', () => {
    const pages = paginate([], 500);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.paragraphIndices).toEqual([]);
  });

  it('字号变大 → 页数变多，且原段落仍能在 pages 里被找到', () => {
    const ps = Array.from({ length: 30 }, (_, i) => para(i, 140));
    const small = pageCapacity(680, 900, 16, 1.7);
    const large = pageCapacity(680, 900, 22, 2.0);
    expect(large).toBeLessThan(small);

    const wide = paginate(ps, small);
    const narrow = paginate(ps, large);
    expect(narrow.length).toBeGreaterThan(wide.length);
    for (const idx of [0, 7, 29]) {
      const at = pageOfParagraph(narrow, idx);
      expect(narrow[at]!.paragraphIndices).toContain(idx);
    }
  });

  it('pageCapacity 有下限：极小窗口不会算出 0 字符一页（会变成无限页）', () => {
    expect(pageCapacity(10, 10, 22, 2)).toBeGreaterThanOrEqual(80);
  });
});

describe('chapterPercent', () => {
  it('第一段是 0，最后一段之后接近满', () => {
    const ps = ['甲'.repeat(100), '乙'.repeat(100)];
    expect(chapterPercent(ps, 0)).toBe(0);
    expect(chapterPercent(ps, 1)).toBeCloseTo(0.5, 5);
    expect(chapterPercent(ps, 2)).toBe(1);
  });

  it('空章节返回 0，而不是 NaN', () => {
    expect(chapterPercent([], 0)).toBe(0);
  });
});
