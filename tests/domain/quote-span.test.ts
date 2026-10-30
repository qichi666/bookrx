import { describe, expect, it } from 'vitest';
import { spanOfQuote } from '@/domain/quote-span.js';

/**
 * 划线落点（domain/quote-span.ts）。
 *
 * 背景缺陷：旧实现用 `text.indexOf(quote)`，同一段里同一句话出现两次时，
 * 划第二处会静默落到第一处——高亮跑到别的地方，不报错。
 */

describe('spanOfQuote', () => {
  it('期望位置就是命中位置时直接用它', () => {
    expect(spanOfQuote('今天也要好好读书', '读书', 6)).toEqual({ start: 6, end: 8 });
  });

  it('期望位置偏了也不会错位：以原文为准', () => {
    // 期望 5 落在「好读」上，原文里「读书」在 6
    expect(spanOfQuote('今天也要好好读书', '读书', 5)).toEqual({ start: 6, end: 8 });
  });

  it('同一段里重复的句子：划第二处就落在第二处', () => {
    const text = '我不能就这样算了，我不能就这样算了。';
    const second = text.lastIndexOf('我不能就这样算了');
    expect(spanOfQuote(text, '我不能就这样算了', second)).toEqual({
      start: second,
      end: second + '我不能就这样算了'.length,
    });
  });

  it('没有期望位置时退回第一处（这是旧行为，保留作兜底）', () => {
    const text = '甲。甲。';
    expect(spanOfQuote(text, '甲', -1)).toEqual({ start: 0, end: 1 });
  });

  it('期望位置差几个字（选区含首尾空白）→ 取最近的一处', () => {
    const text = '甲乙丙丁甲戊';
    // 期望 2 其实是「丙」，最近的「甲」在 0 而不是 4
    expect(spanOfQuote(text, '甲', 2)).toEqual({ start: 0, end: 1 });
  });

  it('原文里根本没有这句 → null，不猜位置', () => {
    expect(spanOfQuote('这本书里没有那句话', '另一本书', 0)).toBeNull();
  });

  it('空引文 / 空段落一律 null', () => {
    expect(spanOfQuote('有内容', '', 0)).toBeNull();
    expect(spanOfQuote('', '有', 0)).toBeNull();
  });
});
