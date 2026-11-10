import { describe, expect, it } from 'vitest';
import { parseReaderJump, readerHref } from '@/lib/reader-link.js';

/**
 * 「今天」区块给出的链接必须能被阅读器读回来，否则点进去就是从头开始。
 * 这两件事必须成对测试——只测其中一边，另一边改了也没人知道。
 */
describe('readerHref', () => {
  it('txt-offset 带上章节与偏移', () => {
    expect(readerHref('user:abc', { scheme: 'txt-offset', chapter: 3, offset: 1200 })).toBe(
      '/reader/user:abc?ch=3&off=1200',
    );
  });

  it('EPUB CFI 不给定位参数（CFI 换版式就会错位，不猜）', () => {
    expect(readerHref('user:abc', { scheme: 'epub-cfi', cfi: 'epubcfi(/6/4)' })).toBe('/reader/user:abc');
  });

  it('引文锚点同样退化成只打开书', () => {
    const href = readerHref('core:000001', {
      scheme: 'quote',
      chapter_ref: { spine_index: 2 },
      quote: '一段话',
      occurrence: 1,
    });
    expect(href).toBe('/reader/core:000001');
  });
});

describe('parseReaderJump', () => {
  it('合法参数解析成章节与偏移', () => {
    expect(parseReaderJump({ ch: '2', off: '300' })).toEqual({ chapter: 2, offset: 300 });
    expect(parseReaderJump({ ch: 0, off: 0 })).toEqual({ chapter: 0, offset: 0 });
  });

  it('缺参数 / 非数字 / 负数一律返回 null（退化成正常打开）', () => {
    expect(parseReaderJump({})).toBeNull();
    expect(parseReaderJump({ ch: '2' })).toBeNull();
    expect(parseReaderJump({ ch: 'x', off: '3' })).toBeNull();
    expect(parseReaderJump({ ch: '-1', off: '3' })).toBeNull();
    expect(parseReaderJump({ ch: '1.5', off: '3' })).toBeNull();
    expect(parseReaderJump({ ch: '1', off: '-9' })).toBeNull();
  });

  it('数组形态的 query 值（?ch=1&ch=2）不会被误当成数字', () => {
    expect(parseReaderJump({ ch: ['1', '2'], off: '3' })).toBeNull();
  });
});
