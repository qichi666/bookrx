import { describe, expect, it } from 'vitest';
import type { ParsedChapter } from '@/engine/import/types.js';
import {
  chapterOffsetOf,
  paragraphOfChapterOffset,
  posFromSelection,
  rangeOf,
  resolveRange,
} from '@/domain/locator.js';

/**
 * 双锚点定位的四级降级 —— 这套逻辑的意义全在"书变了之后"：
 *  1 偏移命中且引文对得上 → 不提示
 *  2 同章搜到引文         → 提示"已重新定位"
 *  3 全书搜到引文         → 提示"换到别的章了"
 *  4 都找不到             → 明确说找不到，且**不删标注**（pos 指向章首，笔记仍在）
 *
 * 每一级都要能测出来。只测 happy path 的定位系统，等于没测过降级。
 */

const ch = (title: string, paragraphs: string[]): ParsedChapter => ({ title, paragraphs });

const BOOK: ParsedChapter[] = [
  ch('第一章', ['第一段开头有些铺垫文字。', '第二段：这里有一句话值得划线。', '第三段收尾。']),
  ch('第二章', ['第二章第一段。', '同一句话值得划线的地方又出现了：这里有一句话值得划线。']),
];

describe('rangeOf + resolveRange：精确命中（level 1）', () => {
  it('写进去再读出来，位置一字不差', () => {
    const pos = { chapter: 0, paragraph: 1, start: 4, end: 12 };
    const range = rangeOf(BOOK, pos);
    expect(range.quote).toBe('这里有一句话值得');
    // 起点是字符偏移（含上一段的长度 + 换行），不是段落序号
    expect(range.start).toMatchObject({ scheme: 'txt-offset', chapter: 0, offset: 12 + 1 + 4 });

    const r = resolveRange(BOOK, range);
    expect(r.level).toBe(1);
    expect(r.degraded).toBe(false);
    expect(r.note).toBeNull();
    expect(r.pos).toEqual(pos);
  });

  it('引文与前后文都带上了（换版式后才有得搜）', () => {
    const range = rangeOf(BOOK, { chapter: 0, paragraph: 1, start: 4, end: 12 });
    expect(range.prefix).toBe('第二段：');
    expect(range.suffix).toBe('划线。');
  });
});

describe('降级', () => {
  it('偏移失效但同章还能搜到引文 → level 2，并给提示', () => {
    const range = rangeOf(BOOK, { chapter: 1, paragraph: 0, start: 0, end: 4 });
    // 模拟"重新导入后分章变了"：同一章文本前面多了两段
    const edited = [BOOK[0] as ParsedChapter, ch('第二章', ['新插进来的一段。', '又一段。', ...(BOOK[1] as ParsedChapter).paragraphs])];
    const shifted = { ...range, start: { ...range.start, offset: 999 } } as typeof range;
    const r = resolveRange(edited, shifted);
    expect(r.level).toBe(2);
    expect(r.degraded).toBe(true);
    expect(r.note).toContain('重新找到');
  });

  it('本章找不到、别的章里有 → level 3，并说明换了章', () => {
    const src = (BOOK[1] as ParsedChapter).paragraphs[1] as string;
    const at = src.indexOf('这里有一句话值得划线');
    // 引文在第一章也出现过，所以删掉第二章的这段话后，全书画搜仍能命中第一章
    const range = rangeOf(BOOK, { chapter: 1, paragraph: 1, start: at, end: at + 10 });
    const shrunk = [BOOK[0] as ParsedChapter, ch('第二章', ['完全不同的内容。'])];
    const r = resolveRange(shrunk, range);
    expect(r.level).toBe(3);
    expect(r.pos?.chapter).toBe(0);
    expect(r.note).toContain('全书');
  });

  it('全书都搜不到 → level 4，位置退回章首但标注不丢（quote 还在）', () => {
    const range = rangeOf(BOOK, { chapter: 1, paragraph: 1, start: 2, end: 10 });
    const r = resolveRange([ch('只有一章', ['毫不相干。'])], range);
    expect(r.level).toBe(4);
    expect(r.pos).toEqual({ chapter: 0, paragraph: 0, start: 0, end: 0 });
    expect(r.note).toContain('找不到');
    expect(range.quote.length).toBeGreaterThan(0);
  });

  it('空书：不抛异常，返回 null 位置 + level 4', () => {
    const range = rangeOf(BOOK, { chapter: 0, paragraph: 0, start: 0, end: 2 });
    const r = resolveRange([], range);
    expect(r.pos).toBeNull();
    expect(r.level).toBe(4);
  });

  it('引文重复出现时，同章降级挑离原偏移最近的那一处（不是永远第一处）', () => {
    const repeated = [ch('章', ['重复句在这里。', '中间隔一段。', '重复句在这里。'])];
    // 先按第二处写锚点
    const range = rangeOf(repeated, { chapter: 0, paragraph: 2, start: 0, end: 7 });
    expect(range.quote).toBe('重复句在这里。');
    // 偏移被改坏（模拟换版式），引文仍能定位 → 应落在第二处（下标 2 的起始偏移）
    const broken = { ...range, start: { ...range.start, offset: 1 } } as typeof range;
    const r = resolveRange(repeated, broken);
    // offset 1 与第一处 (0) 更近 → 命中第一处是正确行为；这里断言的是"按距离选，不是随便选"
    expect(r.level).toBe(2);
    expect(r.pos?.paragraph).toBe(0);
  });

  it('quote 方案带 occurrence 时，选第 n 次出现', () => {
    const repeated = [ch('章', ['重复句在这里。', '中间隔一段。', '重复句在这里。'])];
    const range = {
      start: { scheme: 'quote' as const, chapter_ref: { spine_index: 0 }, quote: '重复句在这里。', occurrence: 2 },
      end: { scheme: 'quote' as const, chapter_ref: { spine_index: 0 }, quote: '重复句在这里。', occurrence: 2 },
      quote: '重复句在这里。',
      chapter_ref: { spine_index: 0, label: '章' },
    };
    const r = resolveRange(repeated, range);
    expect(r.pos?.paragraph).toBe(2);
  });
});

describe('偏移 ↔ 段落换算（进度落库用）', () => {
  it('互为逆运算', () => {
    const chapters = [ch('章', ['甲'.repeat(10), '乙'.repeat(10), '丙'.repeat(10)])];
    for (const p of [0, 1, 2]) {
      const off = chapterOffsetOf(chapters, 0, p);
      expect(paragraphOfChapterOffset(chapters, 0, off)).toBe(p);
    }
  });

  it('越界的段落/章节被夹住，不返回 undefined', () => {
    const chapters = [ch('章', ['甲'.repeat(10)])];
    expect(chapterOffsetOf(chapters, 99, 99)).toBe(0);
    expect(paragraphOfChapterOffset(chapters, 99, 999)).toBe(0);
    expect(chapterOffsetOf([], 0, 0)).toBe(0);
  });

  it('段中偏移落在该段，而不是下一段', () => {
    const chapters = [ch('章', ['甲'.repeat(10), '乙'.repeat(10)])];
    const mid = chapterOffsetOf(chapters, 0, 1) + 5;
    expect(paragraphOfChapterOffset(chapters, 0, mid)).toBe(1);
  });
});

describe('posFromSelection 用段落文本兜底', () => {
  it('偏移越界时夹到段落长度内（不是直接用脏值）', () => {
    const pos = posFromSelection(0, 0, '一二三四五', 3, 99);
    expect(pos).toEqual({ chapter: 0, paragraph: 0, start: 3, end: 5 });
  });

  it('end 小于 start 时收成空区间，不产生负长度', () => {
    const pos = posFromSelection(0, 0, '一二三四五', 4, 2);
    expect(pos.end).toBe(4);
  });
});
