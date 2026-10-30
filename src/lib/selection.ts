import { spanOfQuote } from '@/domain/quote-span.js';

/**
 * 选区 → 段内区间（浏览器侧薄壳）。
 *
 * 这里只做一件纯逻辑做不到的事：把 DOM 选区换算成「段内字符偏移」，
 * 也就是给 `spanOfQuote` 提供期望位置。换算方式是从段落开头建一个 Range
 * 一路 `setEnd` 到选区起点，读它的字符串长度——比 `anchorOffset` 可靠，
 * 因为段落内部被 `<mark>` 切成了多个文本节点，`anchorOffset` 是**节点内**偏移。
 *
 * 跨段选择会被明确拒绝（返回 null），不做静默截断。
 */
export interface SelectionSpan {
  start: number;
  end: number;
  quote: string;
}

export function selectionSpan(paragraph: Element, text: string): SelectionSpan | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const raw = sel.toString();
  const quote = raw.trim();
  if (quote.length === 0) return null;
  // 选区首尾的空格会把整段偏移挪位，先算清楚挪了多少格
  const lead = raw.length - raw.trimStart().length;

  let hint = -1;
  const range = sel.getRangeAt(0);
  if (paragraph.contains(range.startContainer)) {
    const pre = document.createRange();
    pre.selectNodeContents(paragraph);
    pre.setEnd(range.startContainer, range.startOffset);
    hint = pre.toString().length + lead;
  }

  const span = spanOfQuote(text, quote, hint);
  return span === null ? null : { start: span.start, end: span.end, quote };
}
