import type { ImportWarning } from '@/contracts/import.js';

/**
 * 解析层的中间形状（不是契约，契约在 `contracts/import.ts`）。
 *
 * 单独开一个类型文件，是因为 EPUB 与 TXT 两条路径都要产出同一种「章节 → 段落」，
 * 而阅读器、标注锚点、书内搜索三处都只认这个形状。放在一个地方，
 * 就不会出现"EPUB 的章节多带一个 href、TXT 的少一个"这种分叉。
 */

export interface ParsedChapter {
  /** 章节标题，没有就用「第 N 节」 */
  title: string;
  paragraphs: string[];
  /** EPUB 内的源文件路径（TXT 没有）。用于诊断与"同章引文"降级的粗定位 */
  source_href?: string;
}

export interface ParsedCover {
  /** EPUB 内路径 */
  href: string;
  mime: string;
  bytes: ArrayBuffer;
}

export interface ParsedBook {
  title: string;
  author: string;
  language?: string;
  chapters: ParsedChapter[];
  cover?: ParsedCover;
  warnings: ImportWarning[];
}

/** 正文总字数（去空白字符数）。用于篇幅档与预计时长，不做分词。 */
export function countChars(chapters: readonly ParsedChapter[]): number {
  let n = 0;
  for (const c of chapters) {
    for (const p of c.paragraphs) n += p.replace(/\s/g, '').length;
  }
  return n;
}

/**
 * 篇幅档（SPEC：1:<8 万 2:8–20 万 3:20–40 万 4:>40 万）。
 *
 * 中文字数按字符算，与 SPEC 的"万字"口径一致；英文书会偏大，
 * 但导入书本来就不入推荐池，这个档只影响列表里的徽标。
 */
export function lengthClassOf(chars: number): 1 | 2 | 3 | 4 {
  if (chars < 80_000) return 1;
  if (chars < 200_000) return 2;
  if (chars < 400_000) return 3;
  return 4;
}

/** 预计阅读时长：中文 400 字/分，保留一位小数，下限 0.5 小时。 */
export function estimateHours(chars: number): number {
  const hours = chars / 400 / 60;
  return Math.max(0.5, Math.round(hours * 10) / 10);
}
