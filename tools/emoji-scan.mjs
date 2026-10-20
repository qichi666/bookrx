/**
 * emoji 判定的唯一定义。
 *
 * 这条规则曾经在三处各写了一遍（`style-audit` / `doc-audit` / 组件测试），
 * 参数各不相同，于是同一份文档在一条门禁里是绿的、在另一条里是红的。
 * 而两处都是"零 emoji"，同一件事出现两个口径时，人只会信更宽松的那个。
 *
 * 范围取 Unicode `Emoji=Yes` 的主区，外加变体选择符与杂项符号/装饰符号区。
 * **明确排除**：
 *  - 箭头区 U+2190–21FF：`→` `←` `↑` 在注释与 CLI 输出里一直在用，判成 emoji 只会得到假警报；
 *  - U+2713 / U+2717（`✓` `✗`）以及 U+2714 / U+2718：文档的对比表用它们做排版标记。
 * 假警报的下场是有人把整条规则删掉，连同真 emoji 一起失守。
 */

export const EMOJI = /[\u{1F000}-\u{1FAFF}\u{FE0F}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
export const TYPOGRAPHIC_MARKS = /[\u{2190}-\u{21FF}\u{2713}\u{2714}\u{2717}\u{2718}]/gu;

/** 一行里有没有真 emoji（排版标记先剥掉再判）。 */
export function hasEmoji(line) {
  return EMOJI.test(line.replace(TYPOGRAPHIC_MARKS, ''));
}

/** 把一行里的真 emoji 全找出来（用于报告具体字符）。 */
export function findEmoji(line) {
  const cleaned = line.replace(TYPOGRAPHIC_MARKS, ' ');
  return [...cleaned].filter((ch) => EMOJI.test(ch));
}
