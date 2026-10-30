import type { UserBook } from '@/contracts/book.js';
import type { ReadingProgress } from '@/contracts/reader.js';
import type { Annotation, Note } from '@/contracts/reader.js';
import type { ParsedChapter, ParsedCover } from '@/engine/import/types.js';
import { plainValue } from '@/lib/plain.js';

/**
 * 本机存储（IndexedDB）。**全部数据只在这里**，不上传、不同步、没有账号。
 *
 * 为什么用 IndexedDB 而不是 localStorage：
 *  - localStorage 只有 5 MB 且是同步的，一本书的正文就可能超过它；
 *  - 存 ArrayBuffer（书文件）必须用 IndexedDB，localStorage 只能存字符串。
 *
 * 六个表的分工（版本 1，升级只加表、不改字段语义）：
 *  `books` 元数据（UserBook） / `chapters` 章节文本 / `files` 原始字节
 *  `progress` 阅读进度 / `annotations` 划线 / `notes` 笔记 / `shelf` 书架分组
 *
 * 章节与文件分开存：列表页只需要元数据，不该为了显示书名把整本正文读出来。
 */

export const DB_NAME = 'bookrx';
export const DB_VERSION = 1;

export type ShelfGroup = 'reading' | 'finished' | 'want';

export interface ShelfEntry {
  book_id: string;
  group: ShelfGroup;
  updated_at: number;
}

export interface ChapterRecord {
  book_id: string;
  chapters: ParsedChapter[];
  cover?: ParsedCover;
}

/**
 * 连接复用。
 *
 * 旧实现是每次操作 `indexedDB.open(...)` 再 `db.close()`：一次翻页要开三次连接
 * （进度 / 书架读 / 书架写），而且**只要事务抛错就跳过了 close**——异常路径上
 * 句柄一个都收不回来。复用一个连接同时解决两件事。
 *
 * `onversionchange` 必须让路：别的标签页要升级版本时，我们这条旧连接不关，
 * 它就会被永久挡住。
 */
let conn: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  conn ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('shelf')) db.createObjectStore('shelf', { keyPath: 'book_id' });
      if (!db.objectStoreNames.contains('annotations')) {
        const s = db.createObjectStore('annotations', { keyPath: 'annotation_id' });
        s.createIndex('by_book', 'book_id');
      }
      if (!db.objectStoreNames.contains('notes')) {
        const s = db.createObjectStore('notes', { keyPath: 'note_id' });
        s.createIndex('by_book', 'book_id');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        conn = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      conn = null; // 失败不要缓存，否则这个会话再也打不开
      reject(req.error ?? new Error('indexedDB.open 失败'));
    };
  });
  return conn;
}

function tx<T>(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let req: IDBRequest<T> | void;
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error ?? new Error('事务失败'));
    t.onabort = () => reject(t.error ?? new Error('事务被中止'));
    req = run(t);
  });
}

function getAll<T>(db: IDBDatabase, store: string, query?: IDBKeyRange | IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).getAll(query);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error(`读取 ${store} 失败`));
  });
}

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
