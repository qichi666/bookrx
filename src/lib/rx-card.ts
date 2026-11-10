/**
 * 处方笺版书摘图（F4 的新版式）。
 *
 * 为什么值得多一个版式：通用引文卡在社交平台上和任何阅读 App 长得一样。
 * 这个产品的独特视觉资产是「书方」——Rx、日期、一份开给某个人的单子。
 * 版式本身就是辨识度，比在角上加个 logo 有效。
 *
 * 与引文卡一样，**不写困境标签、不写档位、不写分数**：
 * 那是用户和系统之间的判断，不该出现在可以发给别人的图上。
 */
import { cssVar, H, PAD, paletteOf, W, wrap, type CardInput } from './card-kit.js';
import { todayIso } from './local-date.js';

export async function renderRxCard(input: CardInput): Promise<Blob> {
  const palette = paletteOf(input.theme ?? 'paper');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('这个浏览器没有可用的 Canvas 2D');

  const fontBook = cssVar('--font-book', 'serif');
  const fontUi = cssVar('--font-ui', 'sans-serif');

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // 外框：处方笺是"一张单子"，所以有边界，但只用一条细线
  ctx.strokeStyle = palette.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2);

  // 抬头：Rx + 日期
  ctx.fillStyle = palette.accent;
  ctx.font = `600 96px ${fontBook}`;
  ctx.fillText('Rx', PAD + 40, PAD + 46);

  ctx.fillStyle = palette.muted;
  ctx.font = `400 26px ${fontUi}`;
  ctx.textAlign = 'right';
  ctx.fillText(todayIso(), W - PAD - 40, PAD + 76);
  ctx.textAlign = 'left';

  // 抬头下的分隔线
  let y = PAD + 180;
  ctx.strokeStyle = palette.rule;
  ctx.beginPath();
  ctx.moveTo(PAD + 40, y);
  ctx.lineTo(W - PAD - 40, y);
  ctx.stroke();

  // 书名
  y += 46;
  ctx.fillStyle = palette.fg;
  ctx.font = `600 54px ${fontBook}`;
  for (const line of wrap(ctx, input.title, W - PAD * 2 - 80).slice(0, 2)) {
    ctx.fillText(line, PAD + 40, y);
    y += 72;
  }

  // 作者
  ctx.fillStyle = palette.muted;
  ctx.font = `400 26px ${fontUi}`;
  ctx.fillText(input.author, PAD + 40, y);
  y += 56;

  // 引文：缩进 + 竖线，像单子上的"医嘱"
  const quote = input.quote.trim();
  if (quote.length > 0) {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(PAD + 40, y, 3, 8);
    ctx.font = `400 34px ${fontBook}`;
    ctx.fillStyle = palette.fg;
    const lines = wrap(ctx, quote, W - PAD * 2 - 130).slice(0, 8);
    for (const line of lines) {
      ctx.fillText(line, PAD + 70, y);
      y += 54;
    }
  }

  // 底部虚线：处方笺的手写分隔
  ctx.strokeStyle = palette.rule;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(PAD + 40, H - PAD - 96);
  ctx.lineTo(W - PAD - 40, H - PAD - 96);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = palette.muted;
  ctx.font = `400 22px ${fontUi}`;
  ctx.fillText('一日一方 · 只在你自己的设备上生成', PAD + 40, H - PAD - 62);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('导出图片失败'));
    }, 'image/png');
  });
}
