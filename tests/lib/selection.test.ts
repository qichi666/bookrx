// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { selectionSpan } from '@/lib/selection.js';

/**
 * 选区 → 段内区间（lib/selection.ts）。
 *
 * 这里测的是 DOM 换算那一层：段落内部会被 `<mark>` 切成多个文本节点，
 * 所以不能用 `anchorOffset`（那是节点内偏移），必须从段落开头量到选区起点。
 */

function setup(html: string, pick: (root: HTMLElement) => [Node, number, Node, number]): HTMLElement {
  document.body.innerHTML = html;
  const p = document.querySelector('p') as HTMLElement;
  const [sn, so, en, eo] = pick(p);
  const range = document.createRange();
  range.setStart(sn, so);
  range.setEnd(en, eo);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return p;
}

describe('selectionSpan', () => {
  it('纯文本段落：偏移等于选区起点', () => {
    const p = setup('<p data-p="0">今天也要好好读书</p>', (root) => {
      const t = root.firstChild as Text;
      return [t, 6, t, 8];
    });
    expect(selectionSpan(p, '今天也要好好读书')).toEqual({ start: 6, end: 8, quote: '读书' });
  });

  it('段落被 <mark> 切开后仍按整段字符位置算', () => {
    // 「今天」被划了线，后面三个字是另一个文本节点
    const p = setup('<p data-p="0"><mark>今天</mark>也要好好读书</p>', (root) => {
      const t = root.lastChild as Text;
      return [t, 4, t, 6];
    });
    expect(selectionSpan(p, '今天也要好好读书')).toEqual({ start: 6, end: 8, quote: '读书' });
  });

  it('同一段里重复的句子：划第二处就落在第二处', () => {
    const text = '我不能就这样算了。我不能就这样算了。';
    const p = setup(`<p data-p="0">${text}</p>`, (root) => {
      const t = root.firstChild as Text;
      const at = text.lastIndexOf('我不能就这样算了');
      return [t, at, t, at + 8];
    });
    expect(selectionSpan(p, text)).toEqual({
      start: text.lastIndexOf('我不能就这样算了'),
      end: text.lastIndexOf('我不能就这样算了') + 8,
      quote: '我不能就这样算了',
    });
  });

  it('选区首尾带空格：偏移按去掉空格后的引文算', () => {
    const p = setup('<p data-p="0">中间 有字 结尾</p>', (root) => {
      const t = root.firstChild as Text;
      return [t, 1, t, 6];
    });
    // 选区实际是「间 有字 」，trim 后是「间 有字」
    expect(selectionSpan(p, '中间 有字 结尾')).toEqual({ start: 1, end: 5, quote: '间 有字' });
  });

  it('跨段选择 → null（明确拒绝，不静默截断）', () => {
    const p = setup('<p data-p="0">第一章的话</p>', (root) => {
      const t = root.firstChild as Text;
      return [t, 2, t, 5];
    });
    expect(selectionSpan(p, '完全不同的段落文字')).toBeNull();
  });

  it('没有选区 → null', () => {
    document.body.innerHTML = '<p data-p="0">一段话</p>';
    window.getSelection()!.removeAllRanges();
    const p = document.querySelector('p') as HTMLElement;
    expect(selectionSpan(p, '一段话')).toBeNull();
  });
});
