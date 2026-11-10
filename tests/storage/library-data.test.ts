// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Annotation, Note, ReadingProgress } from '@/contracts/reader.js';
import type { UserBook } from '@/contracts/book.js';
import {
  deleteAnnotation,
  deleteBookData,
  deleteShelf,
  getBook,
  getChapters,
  getProgress,
  getShelf,
  listAllAnnotations,
  listAllNotes,
  listAnnotations,
  listBooks,
  listNotes,
  listProgress,
  listShelf,
  putAnnotation,
  putBook,
  putChapters,
  putNote,
  putProgress,
  putShelf,
} from '@/storage/db.js';
import { getReceipt, listReceipts, listSessions, putReceipt, putSession } from '@/storage/activity.js';
import { closeAll, DB_NAME } from '@/storage/connection.js';

/**
 * F0 / F6 / F10 的数据层：读写本身，以及三条**产品承诺**在存储层是否真的成立。
 *
 * 这三条承诺是：
 *  ① 删一本书，书下的划线笔记要留着（用户写下的字不该因为删书消失）；
 *  ② 同一本书的回执只能有一条（否则读数会被自己重复计算）；
 *  ③ 同一本书的进度只有一条，反复落盘是覆盖不是追加。
 *
 * 用真 IndexedDB（fake-indexeddb）而不是 mock：要测的正是"键 / 索引 / 事务"这一层，
 * mock 掉之后测的就只是"我们的假实现自洽"。
 */

beforeEach(async () => {
  // 每条用例都从一个**空库**开始：fake-indexeddb 的库在同一个进程里是共享的，
  // 只 close 不删，上一条用例写的标注会漏到下一条里，表现成"删了还在"这种假故障。
  await closeAll();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

const book = (id: string, title = '测试书'): UserBook =>
  ({
    book_id: id,
    title,
    author_display: ['某人'],
    word_count: 1000,
    imported_at: 1,
  }) as UserBook;

const rangeLocator = {
  start: { scheme: 'txt-offset' as const, chapter: 0, offset: 0 },
  end: { scheme: 'txt-offset' as const, chapter: 0, offset: 4 },
  quote: '一句话',
  chapter_ref: { spine_index: 0, label: '第一章' },
};

const ann = (id: string, bookId: string, createdAt = 1): Annotation => ({
  annotation_id: id,
  book_id: bookId as Annotation['book_id'],
  locator: rangeLocator,
  quote: '一句话',
  created_at: createdAt,
});

const note = (id: string, bookId: string): Note => ({
  note_id: id,
  book_id: bookId as Note['book_id'],
  body_markdown: '想法',
  created_at: 1,
  updated_at: 1,
});

const progress = (bookId: string, percent: number): ReadingProgress => ({
  book_id: bookId as ReadingProgress['book_id'],
  locator: { scheme: 'txt-offset', chapter: 0, offset: 0 },
  furthest_locator: null,
  percent,
  total_reading_ms: 0,
  last_opened_at: 1,
  schema_version: 1,
});

describe('书的元数据 / 章节 / 进度', () => {
  it('写进去能读出来；同一 id 再写是覆盖，不会出现两本', async () => {
    await putBook(book('b1', '甲'));
    await putBook(book('b1', '甲·改名'));
    const all = await listBooks();
    expect(all).toHaveLength(1);
    expect((await getBook('b1'))?.title).toBe('甲·改名');
  });

  it('没写过的书：getBook / getChapters / getProgress 都返回 undefined，不抛', async () => {
    expect(await getBook('nope')).toBeUndefined();
    expect(await getChapters('nope')).toBeUndefined();
    expect(await getProgress('nope')).toBeUndefined();
    expect(await getShelf('nope')).toBeUndefined();
  });

  it('章节与封面一起存；重新导入覆盖旧章节', async () => {
    await putChapters({
      book_id: 'b1',
      chapters: [{ title: '一', paragraphs: ['a'] }, { title: '二', paragraphs: ['b'] }] as never,
      cover: { mime: 'image/png', bytes: new ArrayBuffer(4) } as never,
    });
    expect((await getChapters('b1'))?.chapters).toHaveLength(2);
    await putChapters({ book_id: 'b1', chapters: [{ title: '合', paragraphs: ['c'] }] as never });
    expect((await getChapters('b1'))?.chapters).toHaveLength(1);
  });

  it('进度只有一条：反复落盘是覆盖，百分比取最后一次', async () => {
    await putProgress(progress('b1', 0.2));
    await putProgress(progress('b1', 0.75));
    const all = await listProgress();
    expect(all).toHaveLength(1);
    expect(all[0]!.percent).toBe(0.75);
  });
});

describe('书架记录', () => {
  it('改分组是覆盖同一条，不会在两处各留一条', async () => {
    await putShelf({ book_id: 'b1', group: 'want', updated_at: 1 });
    await putShelf({ book_id: 'b1', group: 'reading', updated_at: 2 });
    const all = await listShelf();
    expect(all).toHaveLength(1);
    expect(all[0]!.group).toBe('reading');
  });

  it('弃读记录带着 abandoned_at；再改回在读时这个字段会随覆盖消失', async () => {
    await putShelf({ book_id: 'b1', group: 'abandoned', updated_at: 5, abandoned_at: 5 });
    expect((await getShelf('b1'))?.abandoned_at).toBe(5);
    await putShelf({ book_id: 'b1', group: 'reading', updated_at: 6 });
    expect((await getShelf('b1'))?.abandoned_at).toBeUndefined();
  });

  it('deleteShelf 只删书架记录，书本身还在', async () => {
    await putBook(book('b1'));
    await putShelf({ book_id: 'b1', group: 'want', updated_at: 1 });
    await deleteShelf('b1');
    expect(await getShelf('b1')).toBeUndefined();
    expect(await getBook('b1')).toBeDefined();
  });

  it('删不存在的记录不报错（重复点击删除按钮）', async () => {
    await expect(deleteShelf('nope')).resolves.toBeUndefined();
    await expect(deleteAnnotation('nope')).resolves.toBeUndefined();
  });
});

describe('标注与笔记', () => {
  it('按书查标注只拿到这本书的；全量查能拿到别的书', async () => {
    await putAnnotation(ann('a1', 'b1'));
    await putAnnotation(ann('a2', 'b1'));
    await putAnnotation(ann('a3', 'b2'));
    expect((await listAnnotations('b1')).map((a) => a.annotation_id).sort()).toEqual(['a1', 'a2']);
    expect(await listAllAnnotations()).toHaveLength(3);
  });

  it('删掉一条带笔记的划线，笔记还在（笔记不跟着划线消失）', async () => {
    await putAnnotation(ann('a1', 'b1'));
    await putNote({ ...note('n1', 'b1'), annotation_id: 'a1' });
    await deleteAnnotation('a1');
    expect(await listAnnotations('b1')).toHaveLength(0);
    expect(await listNotes('b1')).toHaveLength(1);
  });

  it('笔记按书隔离；同一 note_id 再写是覆盖', async () => {
    await putNote(note('n1', 'b1'));
    await putNote(note('n2', 'b2'));
    await putNote({ ...note('n1', 'b1'), body_markdown: '改过的想法' });
    expect(await listNotes('b1')).toHaveLength(1);
    expect((await listNotes('b1'))[0]!.body_markdown).toBe('改过的想法');
    expect(await listAllNotes()).toHaveLength(2);
  });
});

describe('删一本书：六处一起清，划线笔记留下', () => {
  it('书 / 章节 / 进度 / 书架都清掉，标注与笔记仍然读得到', async () => {
    await putBook(book('b1'));
    await putChapters({ book_id: 'b1', chapters: [{ title: '一', paragraphs: ['a'] }] as never });
    await putProgress(progress('b1', 0.5));
    await putShelf({ book_id: 'b1', group: 'reading', updated_at: 1 });
    await putAnnotation(ann('a1', 'b1'));
    await putNote(note('n1', 'b1'));

    await deleteBookData('b1');

    expect(await getBook('b1')).toBeUndefined();
    expect(await getChapters('b1')).toBeUndefined();
    expect(await getProgress('b1')).toBeUndefined();
    expect(await getShelf('b1')).toBeUndefined();
    // 产品承诺：用户写下的字不因删书消失
    expect(await listAnnotations('b1')).toHaveLength(1);
    expect(await listNotes('b1')).toHaveLength(1);
  });

  it('只删这本书，别的书一动不动', async () => {
    await putBook(book('b1'));
    await putBook(book('b2'));
    await deleteBookData('b1');
    expect((await listBooks()).map((b) => b.book_id)).toEqual(['b2']);
  });
});

describe('读后回执与会话', () => {
  it('同一本书只留一条回执（否则"有用率"的分母会被自己撑大）', async () => {
    await putReceipt({ book_id: 'b1', verdict: 'neutral', created_at: 1 });
    await putReceipt({ book_id: 'b1', verdict: 'useful', created_at: 2 });
    const all = await listReceipts();
    expect(all).toHaveLength(1);
    expect((await getReceipt('b1'))?.verdict).toBe('useful');
  });

  it('回执带理由时原样保留；没理由时不写空字段', async () => {
    await putReceipt({ book_id: 'b1', verdict: 'unfit', reason: '太难', created_at: 1 });
    await putReceipt({ book_id: 'b2', verdict: 'useful', created_at: 1 });
    const all = await listReceipts();
    expect(all.find((r) => r.book_id === 'b1')?.reason).toBe('太难');
    expect(all.find((r) => r.book_id === 'b2')?.reason).toBeUndefined();
  });

  it('会话按开始时间升序返回，与写入顺序无关（柱状图不能跳来跳去）', async () => {
    await putSession({ session_id: 's2', book_id: 'b1', day: '2026-11-09', started_at: 200, ended_at: 260, duration_ms: 60_000 });
    await putSession({ session_id: 's1', book_id: 'b1', day: '2026-11-09', started_at: 100, ended_at: 160, duration_ms: 60_000 });
    expect((await listSessions()).map((s) => s.session_id)).toEqual(['s1', 's2']);
  });

  it('同一 session_id 再写是覆盖，不会把时长翻倍', async () => {
    const s = { session_id: 's1', book_id: 'b1', day: '2026-11-09', started_at: 1, ended_at: 2, duration_ms: 60_000 };
    await putSession(s);
    await putSession(s);
    const all = await listSessions();
    expect(all).toHaveLength(1);
    expect(all[0]!.duration_ms).toBe(60_000);
  });
});
