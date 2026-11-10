import { describe, expect, it } from 'vitest';
import { isChapterRef, isLocator, isRangeLocator, schemaVersionOf } from '@/domain/notes-shape.js';

/**
 * F10 笔记文件导入的**第一道门**：形状校验。
 *
 * 这一层是全项目唯一接触不可信数据的地方（别人给的一份 `.notes.json`）。
 * 它的判据是「结构够用就行」：缺字段给默认值，但字段存在且类型不对就一律拒收——
 * 半懂不懂地读进去，比明确报错更容易把用户的笔记写坏。
 * 所以这里既要测"该拒的拒"，也要测"该收的收"：拒得太狠会把正常文件挡在外面。
 */

describe('isChapterRef', () => {
  it('三个字段都是可选的：空对象也算对的', () => {
    expect(isChapterRef({})).toBe(true);
    expect(isChapterRef({ href: 'ch1.xhtml', spine_index: 3, label: '第三章' })).toBe(true);
  });

  it('字符串 / 数字可以，对象 / 布尔 / null 不行', () => {
    expect(isChapterRef({ spine_index: '3' })).toBe(true);
    expect(isChapterRef({ href: {} })).toBe(false);
    expect(isChapterRef({ label: true })).toBe(false);
    expect(isChapterRef({ spine_index: null })).toBe(false);
  });

  it('不是对象一律不收：字符串、null、undefined', () => {
    expect(isChapterRef('第3章')).toBe(false);
    expect(isChapterRef(null)).toBe(false);
    expect(isChapterRef(undefined)).toBe(false);
  });

  it('数组会被当成空对象放行（已知宽松；下游只读三个字段，读不到就是 undefined，不会崩）', () => {
    expect(isChapterRef([])).toBe(true);
  });
});

describe('isLocator', () => {
  it('txt-offset：章号与偏移必须是整数', () => {
    expect(isLocator({ scheme: 'txt-offset', chapter: 0, offset: 120 })).toBe(true);
    expect(isLocator({ scheme: 'txt-offset', chapter: 0.5, offset: 1 })).toBe(false);
    expect(isLocator({ scheme: 'txt-offset', chapter: '0', offset: 1 })).toBe(false);
    expect(isLocator({ scheme: 'txt-offset', chapter: -1, offset: 0 })).toBe(true); // 负数由语义层管，形状层不管
    expect(isLocator({ scheme: 'txt-offset', chapter: 0 })).toBe(false);
  });

  it('quote：引文 + 出现次数 + 章节引用，缺一个都不收', () => {
    const ok = { scheme: 'quote', quote: '一句话', occurrence: 0, chapter_ref: { spine_index: 1 } };
    expect(isLocator(ok)).toBe(true);
    expect(isLocator({ ...ok, occurrence: '0' })).toBe(false);
    expect(isLocator({ ...ok, quote: 42 })).toBe(false);
    // 契约里 chapter_ref 是必填（见 src/contracts/reader.ts），所以这里也拒
    expect(isLocator({ scheme: 'quote', quote: '一句话', occurrence: 0 })).toBe(false);
  });

  it('epub-cfi：只要 cfi 是字符串', () => {
    expect(isLocator({ scheme: 'epub-cfi', cfi: 'epubcfi(/6/4!/2)' })).toBe(true);
    expect(isLocator({ scheme: 'epub-cfi', cfi: 6 })).toBe(false);
  });

  it('不认识的 scheme、缺 scheme、null 都拒收', () => {
    expect(isLocator({ scheme: 'page', page: 3 })).toBe(false);
    expect(isLocator({ chapter: 1 })).toBe(false);
    expect(isLocator(null)).toBe(false);
    expect(isLocator('txt-offset')).toBe(false);
  });
});

describe('isRangeLocator', () => {
  const end = { scheme: 'txt-offset', chapter: 1, offset: 40 };
  const start = { scheme: 'txt-offset', chapter: 1, offset: 10 };

  it('双端点 + 引文 + 章节引用齐了才收', () => {
    expect(isRangeLocator({ start, end, quote: '一句话', chapter_ref: { spine_index: 1 } })).toBe(true);
  });

  it('端点坏一个就不收（半个锚点比没有锚点更危险）', () => {
    expect(isRangeLocator({ start, end: { scheme: 'txt-offset', chapter: 1 }, quote: 'x', chapter_ref: {} })).toBe(false);
    expect(isRangeLocator({ start: null, end, quote: 'x', chapter_ref: {} })).toBe(false);
  });

  it('缺引文或缺章节引用不收', () => {
    expect(isRangeLocator({ start, end, chapter_ref: {} })).toBe(false);
    expect(isRangeLocator({ start, end, quote: 'x' })).toBe(false);
  });
});

describe('schemaVersionOf', () => {
  it('标准写法取主版本号', () => {
    expect(schemaVersionOf('bookrx.notes/2')).toBe(2);
    expect(schemaVersionOf('bookrx.notes/10')).toBe(10);
  });

  it('不认识的一律 null：将来好退回"我不知道怎么读"', () => {
    expect(schemaVersionOf('bookrx.notes/')).toBeNull();
    expect(schemaVersionOf('bookrx.notes/2.1')).toBeNull();
    expect(schemaVersionOf('bookrx.notes/v2')).toBeNull();
    expect(schemaVersionOf('other.notes/2')).toBeNull();
    expect(schemaVersionOf('')).toBeNull();
  });
});
