import {
  buildNotesFile,
  highlightKey,
  type NotesFile,
} from '@/domain/notes-file.js';
import { listAllAnnotations, listAllNotes, listBooks, putAnnotation, putNote } from './db.js';

/**
 * 笔记的导出与导入（IndexedDB ↔ JSON 文件）。
 *
 * 这一层只做「读出来 / 写回去」，格式与校验在 `domain/notes-file.ts`。
 * 分开的理由：格式是纯函数、能单测；存储必须碰 IndexedDB、只能靠真实浏览器验。
 * 混在一起写，格式 bug 就只能等浏览器里发现。
 */

function newId(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * `BookId` 是联合类型，而笔记表的契约只收 `user:` 这一支。
 * 窄化放在一处、返回 null 而不是抛错，调用方本来就要处理「这本书不在本机」。
 */
function asUserBookId(id: string): `user:${string}` | null {
  return id.startsWith('user:') ? (id as `user:${string}`) : null;
}

export interface NotesExport {
  file: NotesFile;
  /** 有划线但书已不在书架上的本数（导出照样带上，只是标题可能为空） */
  orphanBooks: number;
}

/** 导出：读出全部划线与笔记，折成一份文件对象（写盘交给调用方）。 */
export async function exportNotes(now = Date.now()): Promise<NotesExport> {
  const [books, annotations, notes] = await Promise.all([
    listBooks(),
    listAllAnnotations(),
    listAllNotes(),
  ]);
  const known = new Set<string>(books.map((b) => b.book_id));
  const orphanBooks = new Set(
    annotations.filter((a) => !known.has(a.book_id)).map((a) => a.book_id),
  ).size;
  return { file: buildNotesFile(books, annotations, notes, now), orphanBooks };
}

export interface NotesImportReport {
  /** 真正新增的条数 */
  added: number;
  /** 本机已有、跳过的条数（同一锚点同一引文） */
  skipped: number;
  /** 文件里有、但本机书架上没有这本书的书名/ID —— 不假装匹配 */
  missing: string[];
}

/**
 * 导入：只往存在的书上落。
 *
 * 对「本机没有这本书」的处理是**报出来而不是塞进去**：锚点是相对章节的字符偏移，
 * 书不同则偏移毫无意义。塞进去只会得到一堆点开就跳错位置的划线。
 */
export async function importNotes(file: NotesFile): Promise<NotesImportReport> {
  const books = await listBooks();
  const known = new Set<string>(books.map((b) => b.book_id));
  const [existing, existingNotes] = await Promise.all([listAllAnnotations(), listAllNotes()]);

  const seen = new Set(
    existing.map((a) => highlightKey(a.book_id, { quote: a.quote, locator: a.locator, created_at: 0 })),
  );
  // 纯笔记不在 annotations 表里，只按划线算 seen 的话，同一个文件导入第二次会把
  // 没有锚点的笔记全部再写一遍（越导越多）。这里把它们也放进去重集合。
  for (const n of existingNotes) {
    if (n.annotation_id !== undefined && n.annotation_id !== '') continue;
    seen.add(highlightKey(n.book_id, { quote: '', note: n.body_markdown, created_at: 0 }));
  }
  let added = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const b of file.books) {
    // 笔记只挂在用户自己导入的书上（`user:` 前缀）。核心库书的划线目前不落库，
    // 真出现 `core:` 的笔记文件也只能报出来，不能写进 note 表——契约只收 user。
    const userBook = asUserBookId(b.book_id);
    if (userBook === null || !known.has(b.book_id)) {
      missing.push(b.title === '' ? b.book_id : b.title);
      continue;
    }
    for (const h of b.highlights) {
      const key = highlightKey(b.book_id, h);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      const created = h.created_at;
      // 纯笔记（没有划线）不造一条空引文的划线：空 quote 在阅读器里会变成
      // 一个零宽度的高亮，既看不见也删不掉。直接落成 note。
      if (h.quote === '' || h.locator === undefined) {
        if (h.note === undefined || h.note.trim() === '') continue;
        await putNote({
          note_id: newId('note'),
          book_id: userBook,
          body_markdown: h.note,
          created_at: created,
          updated_at: created,
        });
      } else {
        const annotationId = newId('ann');
        await putAnnotation({
          annotation_id: annotationId,
          book_id: userBook,
          locator: h.locator,
          quote: h.quote,
          created_at: created,
        });
        if (h.note !== undefined && h.note.trim() !== '') {
          await putNote({
            note_id: newId('note'),
            book_id: userBook,
            annotation_id: annotationId,
            locator: h.locator.start,
            body_markdown: h.note,
            created_at: created,
            updated_at: created,
          });
        }
      }
      added += 1;
    }
  }

  return { added, skipped, missing };
}
