import type { UserBook } from '@/contracts/book.js';
import type { ReadingProgress } from '@/contracts/reader.js';
import type { Annotation, Note } from '@/contracts/reader.js';
import type { ParsedChapter, ParsedCover } from '@/engine/import/types.js';
import { plainValue } from '@/lib/plain.js';

/**
 * 本机存储（IndexedDB）的**读写层**。全部用户数据只在这里，不上传、不同步、没有账号。
 *
 * 连接、库名、schema 在 `connection.ts`：F12 之后「当前在哪个档案」决定库名，
 * 读写函数不该也不需要知道这件事——它们只管调 `open()`。
 *
 * 为什么用 IndexedDB 而不是 localStorage：
 *  - localStorage 只有 5 MB 且是同步的，一本书的正文就可能超过它；
 *  - 存 ArrayBuffer（书文件）必须用 IndexedDB，localStorage 只能存字符串。
 *
 * 章节与文件分开存：列表页只需要元数据，不该为了显示书名把整本正文读出来。
 * 表的分工与 v1 → v2 的幂等建表逻辑见 `connection.ts`。
 */
import { DB_NAME, DB_VERSION, getAll, open, tx } from './connection.js';

// 保持 `db.js` 是存储层唯一对外入口：老代码 / 测试不需要为新模块改 import。
export { DB_NAME, DB_VERSION, getAll, open, tx };

/**
 * 书架状态。`abandoned`（放下的书）不是"读完"的反面，也不是失败：
 * 它记录的是「我试过、我决定先不读了」——把这种状态逼进"在读"，
 * 书架上就会长期挂着几本永远不会动的书，那个列表也就不再可信。
 */
export type ShelfGroup = 'reading' | 'finished' | 'want' | 'abandoned';

export interface ShelfEntry {
  book_id: string;
  group: ShelfGroup;
  updated_at: number;
  /**
   * 什么时候放下的，只在 `group === 'abandoned'` 时有意义。
   * **可选**：老记录没有这个字段，读取端一律 `?? updated_at` 兜底，
   * 所以加它不需要迁移脚本，也不会让半旧的库读出 `undefined`。
   */
  abandoned_at?: number;
  /**
   * 想读队列里的人工顺序（小的在前）。**缺失 = 没排过队**，按 `updated_at` 倒序。
   * 只影响「用户自己的队列」，任何排序实现都不得把它接进推荐打分。
   */
  sort_order?: number;
  /** 这本书怎么进想读的：推荐结果里点进来的，还是自己导入的。列表上要分开显示 */
  from?: 'recommend' | 'import';
}


export interface ChapterRecord {
  book_id: string;
  chapters: ParsedChapter[];
  cover?: ParsedCover;
}

/* 连接 / 事务 / 建表已拆到 connection.ts ── 下面只保留表的读写 */

/* ── 元数据 ─────────────────────────────────────────────────────────── */

export async function putBook(book: UserBook): Promise<void> {
  const db = await open();
  await tx(db, 'books', 'readwrite', (t) => t.objectStore('books').put(plainValue(book)));
}

export async function getBook(bookId: string): Promise<UserBook | undefined> {
  const db = await open();
  const out = await tx<UserBook>(db, 'books', 'readonly', (t) => t.objectStore('books').get(bookId) as IDBRequest<UserBook>);
  return out;
}

export async function listBooks(): Promise<UserBook[]> {
  const db = await open();
  const out = await getAll<UserBook>(db, 'books');
  return out;
}

/* ── 章节 / 原始文件 ────────────────────────────────────────────────── */

export async function putChapters(rec: ChapterRecord): Promise<void> {
  const db = await open();
  await tx(db, 'chapters', 'readwrite', (t) => t.objectStore('chapters').put(rec));
}

export async function getChapters(bookId: string): Promise<ChapterRecord | undefined> {
  const db = await open();
  const out = await tx<ChapterRecord>(db, 'chapters', 'readonly', (t) =>
    t.objectStore('chapters').get(bookId) as IDBRequest<ChapterRecord>,
  );
  return out;
}

export async function putFile(bookId: string, bytes: ArrayBuffer): Promise<void> {
  const db = await open();
  await tx(db, 'files', 'readwrite', (t) => t.objectStore('files').put({ book_id: bookId, bytes }));
}

/* ── 进度 ───────────────────────────────────────────────────────────── */

export async function putProgress(p: ReadingProgress): Promise<void> {
  const db = await open();
  // 进度最容易踩到响应式 Proxy（它由视图层拼装），所以这里必定过一遍 plainValue
  await tx(db, 'progress', 'readwrite', (t) => t.objectStore('progress').put(plainValue(p)));
}

export async function getProgress(bookId: string): Promise<ReadingProgress | undefined> {
  const db = await open();
  const out = await tx<ReadingProgress>(db, 'progress', 'readonly', (t) =>
    t.objectStore('progress').get(bookId) as IDBRequest<ReadingProgress>,
  );
  return out;
}

export async function listProgress(): Promise<ReadingProgress[]> {
  const db = await open();
  const out = await getAll<ReadingProgress>(db, 'progress');
  return out;
}

/* ── 书架 ───────────────────────────────────────────────────────────── */

export async function putShelf(entry: ShelfEntry): Promise<void> {
  const db = await open();
  await tx(db, 'shelf', 'readwrite', (t) => t.objectStore('shelf').put(plainValue(entry)));
}

export async function listShelf(): Promise<ShelfEntry[]> {
  const db = await open();
  const out = await getAll<ShelfEntry>(db, 'shelf');
  return out;
}

export async function getShelf(bookId: string): Promise<ShelfEntry | undefined> {
  const db = await open();
  const out = await tx<ShelfEntry>(db, 'shelf', 'readonly', (t) =>
    t.objectStore('shelf').get(bookId) as IDBRequest<ShelfEntry>,
  );
  return out;
}

/** 移出想读：只删分组记录，不动书本身（核心库的书本来也不在本机）。 */
export async function deleteShelf(bookId: string): Promise<void> {
  const db = await open();
  await tx(db, 'shelf', 'readwrite', (t) => t.objectStore('shelf').delete(bookId));
}

/* ── 标注 / 笔记 ────────────────────────────────────────────────────── */

export async function putAnnotation(a: Annotation): Promise<void> {
  const db = await open();
  await tx(db, 'annotations', 'readwrite', (t) => t.objectStore('annotations').put(plainValue(a)));
}

export async function listAnnotations(bookId: string): Promise<Annotation[]> {
  const db = await open();
  const out = await new Promise<Annotation[]>((resolve, reject) => {
    const t = db.transaction('annotations', 'readonly');
    const req = t.objectStore('annotations').index('by_book').getAll(bookId);
    req.onsuccess = () => resolve(req.result as Annotation[]);
    req.onerror = () => reject(req.error ?? new Error('读取标注失败'));
  });
  return out;
}

export async function deleteAnnotation(id: string): Promise<void> {
  const db = await open();
  await tx(db, 'annotations', 'readwrite', (t) => t.objectStore('annotations').delete(id));
}

/** 全量读取（导出笔记用）：不按书过滤，因为删掉的书留下的划线也要能带走。 */
export async function listAllAnnotations(): Promise<Annotation[]> {
  const db = await open();
  const out = await getAll<Annotation>(db, 'annotations');
  return out;
}

export async function putNote(n: Note): Promise<void> {
  const db = await open();
  await tx(db, 'notes', 'readwrite', (t) => t.objectStore('notes').put(plainValue(n)));
}

export async function listNotes(bookId: string): Promise<Note[]> {
  const db = await open();
  const out = await new Promise<Note[]>((resolve, reject) => {
    const t = db.transaction('notes', 'readonly');
    const req = t.objectStore('notes').index('by_book').getAll(bookId);
    req.onsuccess = () => resolve(req.result as Note[]);
    req.onerror = () => reject(req.error ?? new Error('读取笔记失败'));
  });
  return out;
}

export async function listAllNotes(): Promise<Note[]> {
  const db = await open();
  const out = await getAll<Note>(db, 'notes');
  return out;
}


/* ── 删除与配额 ─────────────────────────────────────────────────────── */

/** 删一本书：六处一起删。**不删标注与笔记**——用户写下的字不该因为删书消失。 */
export async function deleteBookData(bookId: string): Promise<void> {
  const db = await open();
  await tx(db, ['books', 'chapters', 'files', 'progress', 'shelf'], 'readwrite', (t) => {
    t.objectStore('books').delete(bookId);
    t.objectStore('chapters').delete(bookId);
    t.objectStore('files').delete(bookId);
    t.objectStore('progress').delete(bookId);
    t.objectStore('shelf').delete(bookId);
  });
}

export interface QuotaInfo {
  usage: number;
  quota: number;
}

export async function quota(): Promise<QuotaInfo | null> {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}
