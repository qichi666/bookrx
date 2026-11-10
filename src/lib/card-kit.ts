/**
 * Canvas 卡片公共件（引文卡 / 处方笺共用）。
 *
 * 抽出来的原因很实际：两张卡都要读 CSS 变量、都要折行、都要同一套画布尺寸。
 * 复制一份会立刻分叉——暗色主题改了一处、另一处没改，导出的图和界面对不上。
 *
 * **颜色一律从 CSS 变量读取**，不写十六进制：
 *  ① 项目规定色值真源只有 `tokens.css`，`.ts` 里写死颜色会被门禁判红；
 *  ② 写死之后，暗色主题下导出的卡片会和界面对不上。
 */

export type CardTheme = 'paper' | 'night';

export const W = 1080;
export const H = 1350;
export const PAD = 100;

export interface CardInput {
  quote: string;
  title: string;
  author: string;
  theme?: CardTheme;
  /** 章节名，可选；有就摆在引文下方 */
  chapter?: string;
}

export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  rule: string;
}

export function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v.length > 0 ? v : fallback;
}

/** 只取变量名，不取具体颜色——具体值由 `tokens.css` 决定，这里不持有一份副本 */
export function paletteOf(theme: CardTheme): Palette {
  if (theme === 'night') {
    return {
      bg: cssVar('--reader-dark-bg', ''),
      fg: cssVar('--reader-dark-fg', ''),
      muted: cssVar('--reader-dark-fg', ''),
      accent: cssVar('--accent', ''),
      rule: cssVar('--reader-dark-fg', ''),
    };
  }
  return {
    bg: cssVar('--bg', ''),
    fg: cssVar('--text-primary', ''),
    muted: cssVar('--text-muted', ''),
    accent: cssVar('--accent', ''),
    rule: cssVar('--border', ''),
  };
}

/** 按像素宽度逐字折行（中文没有空格可断，只能逐字量）。 */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const next = line + ch;
    if (ctx.measureText(next).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** 触发下载。纯客户端：不发起任何网络请求。 */
export function saveCard(blob: Blob, filename = 'bookrx-quote.png'): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 会让部分浏览器来不及取数据，延后一拍
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
