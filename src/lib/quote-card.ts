/**
 * 书摘卡片（F4 的第三个分支）。
 *
 * 为什么用 Canvas 而不是 DOM 截图：项目零 UI 依赖，为了导出一张图引入
 * html2canvas 这类库，等于给一个纯静态站点加 40KB 的运行时代价。
 *
 * 公共件（读色、折行、下载）在 `card-kit.ts`，这里只留版式本身。
 */
import {
  cssVar,
  H,
  PAD,
  paletteOf,
  saveCard,
  W,
  wrap,
  type CardInput,
} from './card-kit.js';
import { todayIso } from './local-date.js';

export type { CardTheme } from './card-kit.js';

/**
 * 画一张 1080×1350 的竖版引文卡并返回 PNG Blob。
 *
 * **不含任何困境标签、分档、分数**：这些是用户和系统之间的判断，
 * 一旦出现在可以发给别人的图片上，就从"工具"变成了"标签"。
 */
export async function renderQuoteCard(input: CardInput): Promise<Blob> {
  const palette = paletteOf(input.theme ?? 'paper');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('这个浏览器没有可用的 Canvas 2D');

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  // 左侧竖线：书页的"版心"暗示，比加边框克制
  ctx.fillStyle = palette.rule;
  ctx.fillRect(PAD, PAD, 2, H - PAD * 2);

  // 起首引号
  ctx.fillStyle = palette.accent;
  ctx.font = '600 120px ' + cssVar('--font-book', 'serif');
  ctx.textBaseline = 'top';
  ctx.fillText('「', PAD + 40, PAD + 10);

  // 引文
  const fontBook = cssVar('--font-book', 'serif');
  ctx.font = `400 40px ${fontBook}`;
  ctx.fillStyle = palette.fg;
  const quote = input.quote.trim();
  let lines = wrap(ctx, quote, W - PAD * 2 - 90);
  const LINE_H = 66;
  const maxLines = 11;
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1]!.slice(0, -1) + '…';
  }
  let y = PAD + 150;
  for (const line of lines) {
    ctx.fillText(line, PAD + 46, y);
    y += LINE_H;
  }

  // 出处
  y += 40;
  ctx.strokeStyle = palette.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD + 46, y);
  ctx.lineTo(PAD + 46 + 72, y);
  ctx.stroke();

  y += 34;
  ctx.font = `600 36px ${fontBook}`;
  ctx.fillStyle = palette.fg;
  ctx.fillText(input.title, PAD + 46, y);

  y += 52;
  ctx.font = `400 28px ${cssVar('--font-ui', 'sans-serif')}`;
  ctx.fillStyle = palette.muted;
  const sub = input.chapter ? `${input.author} · ${input.chapter}` : input.author;
  for (const line of wrap(ctx, sub, W - PAD * 2 - 90).slice(0, 2)) {
    ctx.fillText(line, PAD + 46, y);
    y += 40;
  }

  // 角标：不写网址，只留产品名，避免把卡片变成广告
  ctx.font = `400 22px ${cssVar('--font-ui', 'sans-serif')}`;
  ctx.fillStyle = palette.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`BookRx · ${todayIso()}`, W - PAD, H - PAD + 20);
  ctx.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('导出图片失败'));
    }, 'image/png');
  });
}

/** 兼容旧调用点：内容与 `saveCard` 一致。 */
export function saveQuoteCard(blob: Blob, filename = 'bookrx-quote.png'): void {
  saveCard(blob, filename);
}
