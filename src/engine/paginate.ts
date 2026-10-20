/**
 * 段落分页（P0-9 的「翻页」）。
 *
 * 刻意**以段落为单位**分页，不按字符硬切：
 * 中文段落被切成两半之后，第一页底部会出现半句话，而用户翻页时会以为丢了内容。
 * 代价是页面利用率不完美（长段落之后会留白），换来的是一页里不会出现断句。
 *
 * 这也决定了"字号改变"的行为：容量重算 → 重新分页 → 当前段落落在新页里。
 * 页码会变，但**位置不会丢**，因为进度记的是「章节 + 段落」，不是页码。
 */

export interface Page {
  /** 本页包含的段落下标（升序） */
  paragraphIndices: number[];
}

/** 每页可容纳的字符数估算：中文按全角（1 字 ≈ 1 个字号宽），留 8% 余量给标点挤压与行尾。 */
export function pageCapacity(widthPx: number, heightPx: number, fontSizePx: number, lineHeight: number): number {
  const charsPerLine = Math.max(4, Math.floor(widthPx / fontSizePx));
  const rows = Math.max(3, Math.floor(heightPx / (fontSizePx * lineHeight)));
  return Math.max(80, Math.floor(charsPerLine * rows * 0.92));
}

/**
 * 分页。超长段落（超过一整页）单独占一页：让它横跨两页会把一句话拆开，
 * 而读者在一页里滚动一点点，比"翻页后接不上下文"好接受得多。
 */
export function paginate(paragraphs: readonly string[], capacity: number): Page[] {
  if (paragraphs.length === 0) return [{ paragraphIndices: [] }];
  const pages: Page[] = [];
  let current: number[] = [];
  let used = 0;

  paragraphs.forEach((text, i) => {
    const len = text.length;
    if (current.length > 0 && used + len > capacity) {
      pages.push({ paragraphIndices: current });
      current = [];
      used = 0;
    }
    current.push(i);
    used += len;
    if (used >= capacity) {
      pages.push({ paragraphIndices: current });
      current = [];
      used = 0;
    }
  });
  if (current.length > 0) pages.push({ paragraphIndices: current });
  return pages.length > 0 ? pages : [{ paragraphIndices: [] }];
}

/** 当前段落落在第几页（字号变化后用它把用户留在原处）。 */
export function pageOfParagraph(pages: readonly Page[], paragraph: number): number {
  for (let i = 0; i < pages.length; i += 1) {
    if (pages[i]!.paragraphIndices.includes(paragraph)) return i;
  }
  return 0;
}

/**
 * 章节内的粗略百分比。
 *
 * 用「已过段落字数 / 全章字数」而不是页码：页码随字号变，读起来会跳
 * （同一位置在字号 16 时是第 3 页、20 时是第 5 页）。
 */
export function chapterPercent(paragraphs: readonly string[], paragraph: number): number {
  const total = paragraphs.reduce((n, p) => n + p.length, 0);
  if (total === 0) return 0;
  let before = 0;
  for (let i = 0; i < paragraph && i < paragraphs.length; i += 1) before += (paragraphs[i] as string).length;
  return Math.min(1, Math.max(0, before / total));
}
