import type { RangeLocator, ResolvedLocator } from '@/contracts/reader.js';
import type { ParsedChapter } from '@/engine/import/types.js';

/**
 * 双锚点定位（P0-12 的地基）。
 *
 * 库里存的是「章节 + 字符偏移」（精确、短小）与「引文 + 前后各 30 字」（可重建），
 * 两者同时写进 `RangeLocator`。原因在 `contracts/reader.ts` 里写着：用户导入的书
 * 一旦换版式，纯偏移必然错位，而且是**静默错位**——高亮跑到别处，没人报错。
 *
 * 解析按四级降级（`ResolvedLocator.level`）：
 *   1 偏移精确命中且引文对得上 → 不提示
 *   2 同章搜到引文         → 轻提示「按原文重新定位」
 *   3 全书搜到引文         → 轻提示并说明换到了别处
 *   4 章节首               → 明确告知「这条划线找不回原位」
 *
 * 没有 CFI：本项目自建渲染（ADR-009），不存在合法 CFI，也不伪造一个。
 * 所以 `Locator` 联合里只用 `txt-offset` 与 `quote` 两支。
 */

export interface Pos {
  chapter: number;
  paragraph: number;
  /** 段内字符偏移，半开区间 [start, end) */
  start: number;
  end: number;
}

interface ChapterIndex {
  /** 段落起始的全章偏移 */
  starts: number[];
  /** 全章文本（段落之间以 \n 分隔） */
  text: string;
}

function indexChapter(ch: ParsedChapter): ChapterIndex {
  const starts: number[] = [];
  let at = 0;
  for (const p of ch.paragraphs) {
    starts.push(at);
    at += p.length + 1;
  }
  return { starts, text: ch.paragraphs.join('\n') };
}

function paragraphAt(idx: ChapterIndex, offset: number): number {
  for (let i = idx.starts.length - 1; i >= 0; i -= 1) {
    if (offset >= (idx.starts[i] as number)) return i;
  }
  return 0;
}

function chapterOffset(idx: ChapterIndex, pos: Pos): number {
  return (idx.starts[pos.paragraph] ?? 0) + pos.start;
}

/** 段落连接处会把换行算进偏移，这里把"段尾 offset"与"下一段开头"统一成一个值。 */
function clampPos(ch: ParsedChapter, pos: Pos): Pos {
  const paragraph = Math.min(Math.max(pos.paragraph, 0), ch.paragraphs.length - 1);
  const text = ch.paragraphs[paragraph] ?? '';
  const start = Math.min(Math.max(pos.start, 0), text.length);
  const end = Math.min(Math.max(pos.end, start), text.length);
  return { chapter: pos.chapter, paragraph, start, end };
}

export function rangeOf(chapters: readonly ParsedChapter[], pos: Pos): RangeLocator {
  const safe = clampPos(chapters[pos.chapter] ?? chapters[0]!, pos);
  const ch = chapters[safe.chapter]!;
  const idx = indexChapter(ch);
  const para = ch.paragraphs[safe.paragraph] ?? '';
  const quote = para.slice(safe.start, safe.end);
  const start = chapterOffset(idx, safe);
  const end = start + quote.length;
  return {
    start: { scheme: 'txt-offset', chapter: safe.chapter, offset: start },
    end: { scheme: 'txt-offset', chapter: safe.chapter, offset: end },
    quote,
    prefix: para.slice(Math.max(0, safe.start - 30), safe.start),
    suffix: para.slice(safe.end, safe.end + 30),
    chapter_ref: { spine_index: safe.chapter, label: ch.title },
  };
}

/** 第 n 次出现（1-based）。引文重复时用它区分，避免每次都跳到第一处。 */
function occurrences(text: string, quote: string): number[] {
  const out: number[] = [];
  let at = text.indexOf(quote);
  while (at >= 0) {
    out.push(at);
    at = text.indexOf(quote, at + Math.max(1, quote.length));
  }
  return out;
}

function posFromChapterOffset(ch: ParsedChapter, offset: number, quote: string): Pos {
  const idx = indexChapter(ch);
  const paragraph = paragraphAt(idx, offset);
  const start = Math.max(0, offset - (idx.starts[paragraph] as number));
  return { chapter: 0, paragraph, start, end: start + quote.length };
}

/** 引文重复时，挑离原偏移最近的那一处（比"永远取第一处"更接近用户当时的位置）。 */
function nearest(hits: readonly number[], at: number): number {
  let best = hits[0] as number;
  for (const h of hits) {
    if (Math.abs(h - at) < Math.abs(best - at)) best = h;
  }
  return best;
}

/** 第 n 次出现（1-based）→ 位置；越界就取最后一处，不抛异常。 */
function nthHit(hits: readonly number[], occurrence: number): number {
  const i = Math.min(Math.max(occurrence - 1, 0), hits.length - 1);
  return hits[i] as number;
}

/**
 * 段落 → 章节内字符偏移（进度落库用）。
 *
 * 进度契约里 `txt-offset.offset` 是**字符偏移**，不是段落序号。两者混用不会报错，
 * 只会在换字号/换分章后把人送到莫名其妙的位置，所以这里显式换算一次。
 */
export function chapterOffsetOf(chapters: readonly ParsedChapter[], chapter: number, paragraph: number): number {
  const ch = chapters[Math.min(Math.max(chapter, 0), chapters.length - 1)];
  if (!ch) return 0;
  const idx = indexChapter(ch);
  return idx.starts[Math.min(Math.max(paragraph, 0), ch.paragraphs.length - 1)] ?? 0;
}

/** 章节内字符偏移 → 段落序号（进度续读用），与 `chapterOffsetOf` 互为逆运算。 */
export function paragraphOfChapterOffset(chapters: readonly ParsedChapter[], chapter: number, offset: number): number {
  const ch = chapters[Math.min(Math.max(chapter, 0), chapters.length - 1)];
  if (!ch || ch.paragraphs.length === 0) return 0;
  return paragraphAt(indexChapter(ch), Math.max(0, offset));
}

export interface ResolveResult {
  pos: Pos | null;
  degraded: boolean;
  level: ResolvedLocator['level'];
  /** 给用户的轻提示，level 1 时为 null */
  note: string | null;
}

/**
 * 解析标注位置。`chapters` 可能因重新导入而变（章节数、分章都不同），
 * 所以每一步都可能失败，失败就降级，**不抛异常**。
 */
export function resolveRange(chapters: readonly ParsedChapter[], range: RangeLocator): ResolveResult {
  if (chapters.length === 0) {
    return { pos: null, degraded: true, level: 4, note: '这本书没有可定位的正文' };
  }
  const quote = range.quote;
  const wanted = range.start.scheme === 'txt-offset' ? range.start.chapter : (range.chapter_ref.spine_index ?? 0);
  const chapter = chapters[wanted];

  // 1：偏移精确命中，且引文对得上
  if (chapter && range.start.scheme === 'txt-offset' && quote) {
    const idx = indexChapter(chapter);
    const at = range.start.offset;
    if (idx.text.slice(at, at + quote.length) === quote) {
      const pos = posFromChapterOffset(chapter, at, quote);
      return { pos: { ...pos, chapter: wanted }, degraded: false, level: 1, note: null };
    }
  }

  // 2：同章找引文（按 occurrence / 就近取一处）
  if (chapter && quote) {
    const hits = occurrences(chapter.paragraphs.join('\n'), quote);
    if (hits.length > 0) {
      const pick =
        range.start.scheme === 'txt-offset'
          ? nearest(hits, range.start.offset)
          : range.start.scheme === 'quote'
            ? nthHit(hits, range.start.occurrence)
            : (hits[0] as number);
      const pos = posFromChapterOffset(chapter, pick, quote);
      return {
        pos: { ...pos, chapter: wanted },
        degraded: true,
        level: 2,
        note: '这一版的分页和划线时不同，已按原文在这个章节里重新找到。',
      };
    }
  }

  // 3：全书找引文
  if (quote) {
    for (let i = 0; i < chapters.length; i += 1) {
      const hits = occurrences(chapters[i]!.paragraphs.join('\n'), quote);
      if (hits.length > 0) {
        const pick = range.start.scheme === 'quote' ? nthHit(hits, range.start.occurrence) : (hits[0] as number);
        const pos = posFromChapterOffset(chapters[i]!, pick, quote);
        return {
          pos: { ...pos, chapter: i },
          degraded: true,
          level: 3,
          note: '原文不在划线时那一章了，已按引文在全书中找到它。',
        };
      }
    }
  }

  // 4：章节首
  const fallback = Math.min(Math.max(wanted, 0), chapters.length - 1);
  return {
    pos: { chapter: fallback, paragraph: 0, start: 0, end: 0 },
    degraded: true,
    level: 4,
    note: '这段原文在这本书里找不到了（可能换了译本或删节版）。划线保留在笔记里，不会丢。',
  };
}

/** 选区 → 段落位置。跨段落的选择不支持：切成两段标注在语义上是错的。 */
export function posFromSelection(
  chapter: number,
  paragraph: number,
  text: string,
  start: number,
  end: number,
): Pos {
  // 用段落文本兜底夹一下：选区偏移来自 DOM，段落恰好换版式时可能越界。
  const s = Math.min(Math.max(start, 0), text.length);
  const e = Math.min(Math.max(end, s), text.length);
  return { chapter, paragraph, start: s, end: e };
}
