import type { Annotation, Note, RangeLocator } from '@/contracts/reader.js';
import type { BookId } from '@/contracts/enums.js';
import { isRangeLocator, schemaVersionOf } from '@/domain/notes-shape.js';

/**
 * 笔记文件（`bookrx.notes/1`）：把本机的划线、笔记导成一份可带走的 JSON。
 *
 * 为什么必须有这个文件：划线和笔记只存在浏览器 IndexedDB 里，换设备或清缓存即永久丢失。
 * 对「读了很多但记不住」那类用户（约 30%），积累的划线正是他最不想丢的东西——
 * 资产没有出口，等于随时可能被格式化。
 *
 * 三条约束：
 *  ① **锚点原样带走**（`txt-offset` + 引文 + 前后各 30 字），不转成 DOM 位置。
 *     导入端用阅读器已有的四级降级去恢复；换一份版式也能落回去。
 *  ② **受众不同，格式独立**：书单是给别人看的（只存选择、不存分数），
 *     笔记是给自己留的（存原文引文与自己的话），两者不合并成一个 schema。
 *  ③ **导出的文件含敏感内容**：它就是你读什么、想什么的记录。文件头写一行提醒，
 *     但不加密、不上传、不做任何"便利"的云功能——那会把数据主权换走。
 */

export const NOTES_SCHEMA = 'bookrx.notes/1';

/** 上限只为防一个畸形文件把页面卡死，不是产品限制 */
const MAX_BOOKS = 2000;
const MAX_HIGHLIGHTS_PER_BOOK = 2000;
const MAX_QUOTE = 2000;
const MAX_NOTE = 20000;

export interface NotesHighlight {
  /** 双锚点四元组；纯笔记（没有划线）时缺省 */
  locator?: RangeLocator;
  quote: string;
  /** 用户自己写的话（Markdown 子集），可能缺失 */
  note?: string;
  created_at: number;
}

export interface NotesBook {
  book_id: BookId;
  title: string;
  highlights: NotesHighlight[];
}

export interface NotesFile {
  schema: string;
  exported_at: number;
  /** 固定提醒语，写进文件让人在自己电脑上也能看到 */
  warning: string;
  books: NotesBook[];
}

export type NotesErrorCode =
  | 'E_NOT_JSON'
  | 'E_NOT_NOTES'
  | 'E_BAD_SHAPE'
  | 'E_FROM_FUTURE'
  | 'E_EMPTY';

export interface NotesError {
  code: NotesErrorCode;
  detail: string;
}

export type NotesParseResult =
  | { ok: true; value: NotesFile }
  | { ok: false; error: NotesError };

export const NOTES_WARNING =
  '这个文件包含你的阅读划线和个人笔记，请自己保管，不要上传到不可信的位置。';

interface BookRef {
  book_id: BookId;
  title: string;
}

/**
 * 导出：本机的书 / 划线 / 笔记 → 文件对象。纯函数，不碰 DOM、不碰存储。
 *
 * 划线与笔记按 `note_id` / `annotation_id` 配对；没有挂到划线上的笔记
 * （用户直接写的段落笔记）也导出，`quote` 留空、只带 `note`。
 */
export function buildNotesFile(
  books: readonly BookRef[],
  annotations: readonly Annotation[],
  notes: readonly Note[],
  /** 时间戳由调用方给：`src/domain` 里不许出现时钟，可复现性测试会拦 */
  now: number,
): NotesFile {
  const titleOf = new Map(books.map((b) => [b.book_id, b.title]));
  const byBook = new Map<BookId, NotesHighlight[]>();

  const noteByAnnotation = new Map<string, Note>();
  const standalone: Note[] = [];
  for (const n of notes) {
    if (n.annotation_id !== undefined && n.annotation_id !== '') noteByAnnotation.set(n.annotation_id, n);
    else standalone.push(n);
  }

  for (const a of annotations) {
    const n = noteByAnnotation.get(a.annotation_id);
    byBook.set(a.book_id, [
      ...(byBook.get(a.book_id) ?? []),
      {
        locator: a.locator,
        quote: a.quote,
        ...(n === undefined ? {} : { note: n.body_markdown }),
        created_at: a.created_at,
      },
    ]);
  }

  for (const n of standalone) {
    if (n.body_markdown.trim() === '') continue;
    byBook.set(n.book_id, [
      ...(byBook.get(n.book_id) ?? []),
      { quote: '', note: n.body_markdown, created_at: n.created_at },
    ]);
  }

  const out: NotesBook[] = [];
  for (const [bookId, highlights] of byBook) {
    if (highlights.length === 0) continue;
    out.push({
      book_id: bookId,
      title: titleOf.get(bookId) ?? '',
      highlights: highlights.sort((x, y) => x.created_at - y.created_at),
    });
  }
  out.sort((x, y) => (x.title < y.title ? -1 : x.title > y.title ? 1 : 0));

  return {
    schema: NOTES_SCHEMA,
    exported_at: now,
    warning: NOTES_WARNING,
    books: out,
  };
}

/**
 * 导入：解析 + 校验。失败分成 5 类，每类对应一句能指导动作的话。
 *
 * 版本只向前兼容：文件比本应用新就拒绝，并明说"比本应用新"——
 * 硬读一个未来的格式，最好的结果是丢字段，最坏的结果是把笔记写坏。
 */
export function parseNotesFile(text: string): NotesParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'E_NOT_JSON', detail: '这个文件不是 JSON' } };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: { code: 'E_NOT_NOTES', detail: '文件内容不是一个对象' } };
  }
  const f = raw as Record<string, unknown>;
  if (typeof f['schema'] !== 'string' || !f['schema'].startsWith('bookrx.notes/')) {
    return { ok: false, error: { code: 'E_NOT_NOTES', detail: '不是书方导出的笔记文件' } };
  }
  const version = schemaVersionOf(f['schema']);
  if (version === null) {
    return { ok: false, error: { code: 'E_NOT_NOTES', detail: '版本号无法识别' } };
  }
  if (version > 1) {
    return {
      ok: false,
      error: { code: 'E_FROM_FUTURE', detail: `文件版本 ${f['schema']} 比本应用新` },
    };
  }
  if (!Array.isArray(f['books'])) {
    return { ok: false, error: { code: 'E_BAD_SHAPE', detail: '缺少 books 数组' } };
  }
  if (f['books'].length > MAX_BOOKS) {
    return { ok: false, error: { code: 'E_BAD_SHAPE', detail: `books 超过 ${MAX_BOOKS} 条` } };
  }

  const books: NotesBook[] = [];
  for (const item of f['books'] as unknown[]) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: { code: 'E_BAD_SHAPE', detail: 'books 里有非对象项' } };
    }
    const b = item as Record<string, unknown>;
    if (typeof b['book_id'] !== 'string' || !/^(core|user):/.test(b['book_id'])) {
      return {
        ok: false,
        error: { code: 'E_BAD_SHAPE', detail: '有书目的 book_id 缺失或不是 core:/user: 前缀' },
      };
    }
    if (!Array.isArray(b['highlights'])) {
      return { ok: false, error: { code: 'E_BAD_SHAPE', detail: `${b['book_id']} 缺少 highlights` } };
    }
    if (b['highlights'].length > MAX_HIGHLIGHTS_PER_BOOK) {
      return {
        ok: false,
        error: { code: 'E_BAD_SHAPE', detail: `${b['book_id']} 的 highlights 过多` },
      };
    }
    const highlights: NotesHighlight[] = [];
    for (const h of b['highlights'] as unknown[]) {
      if (typeof h !== 'object' || h === null) {
        return { ok: false, error: { code: 'E_BAD_SHAPE', detail: 'highlights 里有非对象项' } };
      }
      const r = h as Record<string, unknown>;
      const quote = typeof r['quote'] === 'string' ? r['quote'] : '';
      const note = typeof r['note'] === 'string' ? r['note'] : undefined;
      if (quote === '' && (note === undefined || note.trim() === '')) {
        return { ok: false, error: { code: 'E_BAD_SHAPE', detail: '有一条划线和笔记都是空的' } };
      }
      if (quote.length > MAX_QUOTE) {
        return { ok: false, error: { code: 'E_BAD_SHAPE', detail: '有一条引文过长' } };
      }
      if (note !== undefined && note.length > MAX_NOTE) {
        return { ok: false, error: { code: 'E_BAD_SHAPE', detail: '有一条笔记过长' } };
      }
      if (r['locator'] !== undefined && !isRangeLocator(r['locator'])) {
        return { ok: false, error: { code: 'E_BAD_SHAPE', detail: '有一条锚点格式不对' } };
      }
      highlights.push({
        ...(r['locator'] === undefined ? {} : { locator: r['locator'] as RangeLocator }),
        quote,
        ...(note === undefined ? {} : { note }),
        created_at: typeof r['created_at'] === 'number' ? r['created_at'] : 0,
      });
    }
    books.push({
      book_id: b['book_id'] as BookId,
      title: typeof b['title'] === 'string' ? b['title'] : '',
      highlights,
    });
  }

  if (books.every((b) => b.highlights.length === 0)) {
    return { ok: false, error: { code: 'E_EMPTY', detail: '这个文件里没有任何划线或笔记' } };
  }

  return {
    ok: true,
    value: {
      schema: NOTES_SCHEMA,
      exported_at: typeof f['exported_at'] === 'number' ? f['exported_at'] : 0,
      warning: typeof f['warning'] === 'string' ? f['warning'] : NOTES_WARNING,
      books,
    },
  };
}

/**
 * 去重键：同一本书、同一锚点、同一句引文视为同一条。用于导入时避免重复堆叠。
 *
 * 锚点**逐字段拼**，不用 `JSON.stringify(locator)`：对象序列化的结果依赖键的插入顺序，
 * 同一个锚点从两个来源来（旧版本导出的、新导出再导入的）就可能拼出两个不同的键，
 * 于是「重复导入」会静默变成翻倍的划线。
 */
export function highlightKey(bookId: string, h: NotesHighlight): string {
  const l = h.locator;
  const ref = l === undefined ? '' : `${l.chapter_ref.href ?? ''}#${l.chapter_ref.spine_index ?? ''}`;
  const at = l === undefined ? 'none' : `${l.start.scheme}:${ref}:${l.quote}`;
  return `${bookId}|${at}|${h.quote}`;
}
