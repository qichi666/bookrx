/**
 * 检索命中高亮（F10 增强）。
 *
 * 为什么不能在视图里用 `v-html` 拼 `<mark>`：项目明令禁止 `v-html`
 * （CSP 不允许内联脚本，`audit:input` 也会拦）。把文本切成片段再交给
 * 模板渲染，既不需要信任输入，也不会把用户自己写的字当 HTML 执行。
 *
 * 纯函数，大小写不敏感，但**不改变原文**：片段的 `text` 拼起来必须逐字等于输入。
 */

export interface Segment {
  text: string;
  hit: boolean;
}

/** 关键词为空或未命中时返回整段（`hit: false`），调用方不需要特判。 */
export function splitByKeyword(text: string, keyword: string): Segment[] {
  const kw = keyword.trim();
  if (kw.length === 0 || text.length === 0) return [{ text, hit: false }];

  const hay = text.toLowerCase();
  const needle = kw.toLowerCase();
  const out: Segment[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) out.push({ text: text.slice(from, at), hit: false });
    out.push({ text: text.slice(at, at + kw.length), hit: true });
    from = at + kw.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out.length > 0 ? out : [{ text, hit: false }];
}

/** 命中了哪些字段。界面上写一行小字，比让用户自己找快得多。 */
export function hitFields(
  row: { book_title: string; quote: string; note: string },
  keyword: string,
): string[] {
  const kw = keyword.trim().toLowerCase();
  if (kw.length === 0) return [];
  const out: string[] = [];
  if (row.book_title.toLowerCase().includes(kw)) out.push('书名');
  if (row.quote.toLowerCase().includes(kw)) out.push('引文');
  if (row.note.toLowerCase().includes(kw)) out.push('笔记');
  return out;
}
