/**
 * 书名归一化：跨库去重与"排除已展示"都用它。
 *
 * 单独成文件的原因很具体：`wide-pool` 调 `wide-need`，而 `wide-need` 也要这个函数。
 * 放在 `wide-pool` 里就成了运行时循环引用（`import type` 会被擦掉，`import {}` 不会），
 * 打包器能过、单测能过，但在某些加载顺序下会拿到未初始化的绑定。
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s《》「」『』:：,，.。·\-—_/\\|"'“”‘’!！?？]/g, '')
    .toLowerCase();
}
