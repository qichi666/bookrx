import type { ImportWarning } from '@/contracts/import.js';
import { splitPlainText } from './html.js';
import type { ParsedChapter } from './types.js';

/**
 * TXT 中文编码判定 + 章节识别（P0-10）。
 *
 * 编码这件事必须「先严格后宽松」，顺序错了会得到一堆乱码但**不报错**：
 * `TextDecoder('gb18030')` 对任何字节序列都能解出字符（它没有非法序列），
 * 所以只要先试它，UTF-8 的中文书也会"成功"解成乱码。反过来，UTF-8 用 fatal 严格模式
 * 会明确失败，这一步才是判定器。
 */

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030';

export interface DecodedText {
  text: string;
  encoding: TextEncoding;
}

function tryDecode(bytes: ArrayBuffer, encoding: TextEncoding, fatal: boolean): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

function bomOf(view: Uint8Array): TextEncoding | null {
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return 'utf-8';
  if (view.length >= 2 && view[0] === 0xff && view[1] === 0xfe) return 'utf-16le';
  if (view.length >= 2 && view[0] === 0xfe && view[1] === 0xff) return 'utf-16be';
  return null;
}

/** UTF-16LE 无 BOM 时，ASCII 文本的奇数位会全是 0。抽样判断，不整篇扫。 */
function looksUtf16Le(view: Uint8Array): boolean {
  const n = Math.min(view.length, 4096) & ~1;
  if (n < 32) return false;
  let zeros = 0;
  for (let i = 1; i < n; i += 2) if (view[i] === 0) zeros += 1;
  return zeros / (n / 2) > 0.6;
}

/**
 * 自动判定：BOM → 严格 UTF-8 → UTF-16LE 启发式 → GB18030。
 *
 * `forced` 来自用户在上一次失败后手动选择的编码（失败态里的「换一种编码再试」），
 * 此时仍然用非严格模式——用户已经明确指定，再严格拒绝只会让他无路可走。
 */
export function decodeBytes(bytes: ArrayBuffer, forced?: TextEncoding): DecodedText | null {
  const view = new Uint8Array(bytes);
  if (forced) {
    const text = tryDecode(bytes, forced, false);
    return text === null ? null : { text, encoding: forced };
  }
  const bom = bomOf(view);
  if (bom) {
    const text = tryDecode(bytes, bom, false);
    if (text !== null) return { text: text.replace(/^\uFEFF/, ''), encoding: bom };
  }
  const utf8 = tryDecode(bytes, 'utf-8', true);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  if (looksUtf16Le(view)) {
    const text = tryDecode(bytes, 'utf-16le', false);
    if (text !== null) return { text, encoding: 'utf-16le' };
  }
  const gb = tryDecode(bytes, 'gb18030', false);
  if (gb !== null) return { text: gb, encoding: 'gb18030' };
  return null;
}

/**
 * 章节标题行：中文「第 X 章/节/回/篇/部/卷」、英文章节、数字编号、常见前后件。
 *
 * 中文那一支特意允许后面跟副标题（`第一章 起点` / `第一章：起点`）：真实 TXT 里
 * 几乎没有"光秃秃只有第 X 章"的行。第一版没留这段，导致一本正常分章的书被判定
 * 成"没有章节"，静默走了等分兜底——目录为空但没有任何报错。
 */
const HEADING = /^[ \t\u3000]*(?:第[〇零一二三四五六七八九十百千两0-9]{1,12}[章节回篇部卷][ \t\u3000:：、.·—-]*[^\n]{0,24}|CHAPTER[ \t]+[0-9IVXLC]{1,6}[ \t:：.-]*[^\n]{0,24}|[0-9]{1,3}[.、．][ \t\u3000]*\S.{0,28}|(?:序|序言|前言|引子|楔子|后记|尾声|附录)[ \t\u3000:：]*[^\n]{0,20})$/i;

/** 单行长度上限：长段落里恰好以「第一章」开头不算标题。 */
const HEADING_MAX = 40;

/** 兜底切章的字数目标：一个屏幕能读完的粗粒度，太大则目录无用，太小则章节爆炸。 */
const FALLBACK_TARGET = 8000;

interface Cut {
  at: number;
  title: string;
}

function findHeadings(lines: readonly string[]): Cut[] {
  const cuts: Cut[] = [];
  let at = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length <= HEADING_MAX && HEADING.test(trimmed)) {
      cuts.push({ at, title: trimmed.replace(/\s+/g, ' ') });
    }
    at += line.length + 1; // +1 是换行符；文本已归一为 \n
  }
  return cuts;
}

/** 兜底切章：在段落边界按目标字数切，保证不把一句话切断。 */
function fallbackChapters(paragraphs: readonly string[]): ParsedChapter[] {
  const out: ParsedChapter[] = [];
  let buf: string[] = [];
  let size = 0;
  const flush = (): void => {
    if (buf.length === 0) return;
    out.push({ title: `第 ${out.length + 1} 节`, paragraphs: buf });
    buf = [];
    size = 0;
  };
  for (const p of paragraphs) {
    buf.push(p);
    size += p.length;
    if (size >= FALLBACK_TARGET) flush();
  }
  flush();
  return out;
}

export interface TxtParse {
  title: string;
  chapters: ParsedChapter[];
  warnings: ImportWarning[];
}

/**
 * 解析正文。`filename` 只用来在文件里没有标题时兜底（去掉扩展名）。
 *
 * 判定"要用兜底切章"的标准是**有效标题数 < 3**：一部正常的长书不会只有一两个章节标题，
 * 出现这种情况通常是：(a) 全书没有章节，或 (b) 标题格式很特殊、正则没认出来。
 * 两种情况下按字数等分都比"整本算一章"好——后者会让目录为空、进度条失真。
 */
export function parseTxt(text: string, filename: string): TxtParse {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const cuts = findHeadings(lines);
  const warnings: ImportWarning[] = [];
  const stem = filename.replace(/\.[^.]+$/, '').trim();

  if (cuts.length >= 3) {
    const chapters: ParsedChapter[] = [];
    const preamble = normalized.slice(0, cuts[0]!.at).trim();
    if (preamble.length > 200) {
      chapters.push({ title: '开头', paragraphs: splitPlainText(preamble) });
    }
    cuts.forEach((cut, i) => {
      const end = i + 1 < cuts.length ? cuts[i + 1]!.at : normalized.length;
      const body = normalized.slice(cut.at, end);
      const paragraphs = splitPlainText(body);
      // 标题行本身会落进第一段，去掉它（否则目录里出现"第一章"两遍）
      if (paragraphs[0]?.startsWith(cut.title)) paragraphs.shift();
      chapters.push({ title: cut.title, paragraphs: paragraphs.length > 0 ? paragraphs : ['（这一章没有正文）'] });
    });
    return { title: stem, chapters, warnings };
  }

  const paragraphs = splitPlainText(normalized);
  warnings.push({ kind: 'chapterize-fallback' });
  return { title: stem, chapters: fallbackChapters(paragraphs), warnings };
}
