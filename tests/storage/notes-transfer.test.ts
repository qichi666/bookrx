import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, Note } from '@/contracts/reader.js';
import type { UserBook } from '@/contracts/book.js';
import { NOTES_SCHEMA, type NotesFile } from '@/domain/notes-file.js';

/**
 * 笔记导入的幂等性与完整性（storage/notes-transfer.ts）。
 *
 * 两处缺陷都在这里被钉住：
 *  ① 同一本书里多条「纯笔记」去重键相同 → 第二条起被静默丢弃（数据丢失）；
 *  ② 纯笔记不在 annotations 表里，重复导入同一文件会把它们再写一遍（越导越多）。
 *
 * 存储层用假表替换 IndexedDB：这里验的是「写了几条、跳了几条」的账，
 * 不是 IndexedDB 本身的行为（那个只能真浏览器验）。
 */

const books: UserBook[] = [];
const annotations: Annotation[] = [];
const notes: Note[] = [];

vi.mock('@/storage/db.js', () => ({
  listBooks: async () => books,
  listAllAnnotations: async () => annotations,
  listAllNotes: async () => notes,
  putAnnotation: async (a: Annotation) => {
    annotations.push(a);
  },
  putNote: async (n: Note) => {
    notes.push(n);
  },
}));

const { importNotes } = await import('@/storage/notes-transfer.js');

function book(id: string): UserBook {
  return { book_id: id, title: '测试书' } as unknown as UserBook;
}

function file(highlights: NotesFile['books'][number]['highlights']): NotesFile {
  return {
    schema: NOTES_SCHEMA,
    exported_at: 1,
    warning: '',
    books: [{ book_id: 'user:b1' as NotesFile['books'][number]['book_id'], title: '测试书', highlights }],
  };
}

beforeEach(() => {
  books.length = 0;
  annotations.length = 0;
  notes.length = 0;
  books.push(book('user:b1'));
});

describe('importNotes', () => {
  it('同一本书的多条纯笔记全部落库，不因去重被吞', async () => {
    const report = await importNotes(
      file([
        { quote: '', note: '第一段想法', created_at: 1 },
        { quote: '', note: '第二段想法', created_at: 2 },
        { quote: '', note: '第三段想法', created_at: 3 },
      ]),
    );
    expect(report.added).toBe(3);
    expect(report.skipped).toBe(0);
    expect(notes.map((n) => n.body_markdown)).toEqual(['第一段想法', '第二段想法', '第三段想法']);
  });

  it('同一个文件导入两次：第二次全部跳过，不重复堆叠', async () => {
    const f = file([
      { quote: '', note: '第一段想法', created_at: 1 },
      { quote: '', note: '第二段想法', created_at: 2 },
    ]);
    const first = await importNotes(f);
    const second = await importNotes(f);
    expect(first.added).toBe(2);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(2);
    expect(notes.length).toBe(2);
  });

  it('本机没有这本书 → 报进 missing，不硬塞', async () => {
    const report = await importNotes({
      schema: NOTES_SCHEMA,
      exported_at: 1,
      warning: '',
      books: [
        {
          book_id: 'user:not-here' as NotesFile['books'][number]['book_id'],
          title: '别人家的书',
          highlights: [{ quote: '', note: '想法', created_at: 1 }],
        },
      ],
    });
    expect(report.missing).toEqual(['别人家的书']);
    expect(notes.length).toBe(0);
  });
});
