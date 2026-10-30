import { describe, expect, it } from 'vitest';
import type { Annotation, Note, RangeLocator } from '@/contracts/reader.js';
import type { BookId } from '@/contracts/enums.js';
import {
  NOTES_SCHEMA,
  NOTES_WARNING,
  buildNotesFile,
  highlightKey,
  parseNotesFile,
} from '@/domain/notes-file.js';

const CH = { href: 'text/ch1.xhtml', spine_index: 0 };
const QUOTE = '我以为是在沟通，其实是在说服。';

const loc: RangeLocator = {
  start: { scheme: 'quote', chapter_ref: CH, quote: QUOTE, occurrence: 1 },
  end: { scheme: 'txt-offset', chapter: 1, offset: 30 },
  quote: QUOTE,
  prefix: '这一段之前的话',
  suffix: '这一段之后的话',
  chapter_ref: CH,
};

const ann = (id: string, book: BookId, createdAt: number): Annotation => ({
  annotation_id: id,
  book_id: book,
  locator: loc,
  quote: QUOTE,
  created_at: createdAt,
});

const note = (id: string, book: BookId, body: string, annotationId?: string): Note => ({
  note_id: id,
  book_id: book,
  ...(annotationId === undefined ? {} : { annotation_id: annotationId }),
  body_markdown: body,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_000_000,
});

describe('笔记文件（buildNotesFile）', () => {
  it('按书归组，笔记挂到对应的划线上', () => {
    const file = buildNotesFile(
      [
        { book_id: 'user:a', title: '第一本' },
        { book_id: 'user:b', title: '第二本' },
      ],
      [ann('ann1', 'user:a', 10), ann('ann2', 'user:a', 20)],
      [note('n1', 'user:a', '这句说中了我', 'ann1')],
      1,
    );
    expect(file.schema).toBe(NOTES_SCHEMA);
    expect(file.warning).toBe(NOTES_WARNING);
    expect(file.books.length).toBe(1);
    expect(file.books[0]?.highlights.length).toBe(2);
    // created_at 升序：先划的在前
    expect(file.books[0]?.highlights[0]?.note).toBe('这句说中了我');
    expect(file.books[0]?.highlights[1]?.note).toBeUndefined();
  });

  it('没有挂划线的段落笔记也带走（quote 留空，只有 note）', () => {
    const file = buildNotesFile(
      [{ book_id: 'user:a', title: '第一本' }],
      [],
      [note('n1', 'user:a', '整章的感想')],
      1,
    );
    expect(file.books[0]?.highlights).toEqual([
      { quote: '', note: '整章的感想', created_at: 1_700_000_000_000 },
    ]);
  });

  it('空白段落笔记不导出（不留空壳条目）', () => {
    const file = buildNotesFile([{ book_id: 'user:a', title: 'A' }], [], [note('n1', 'user:a', '   ')], 1);
    expect(file.books).toEqual([]);
  });

  it('书架上没有、但划线还在的书，照样导出（标题为空也不丢内容）', () => {
    const file = buildNotesFile([], [ann('ann1', 'user:gone', 10)], [], 1);
    expect(file.books.length).toBe(1);
    expect(file.books[0]?.book_id).toBe('user:gone');
    expect(file.books[0]?.title).toBe('');
  });
});

describe('笔记文件（parseNotesFile）', () => {
  const good = (): string =>
    JSON.stringify({
      schema: NOTES_SCHEMA,
      exported_at: 1,
      warning: NOTES_WARNING,
      books: [{ book_id: 'user:a', title: 'A', highlights: [{ locator: loc, quote: '一句', created_at: 5 }] }],
    });

  it('正常文件原样读回', () => {
    const r = parseNotesFile(good());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.books[0]?.highlights[0]?.quote).toBe('一句');
  });

  it('不是 JSON → E_NOT_JSON', () => {
    const r = parseNotesFile('这不是 json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('E_NOT_JSON');
  });

  it('是 JSON 但不是笔记文件 → E_NOT_NOTES', () => {
    const r = parseNotesFile(JSON.stringify({ schema: 'bookrx.booklist/1', items: [] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('E_NOT_NOTES');
  });

  it('版本比本应用新 → 拒绝并说明，不硬读', () => {
    const r = parseNotesFile(JSON.stringify({ schema: 'bookrx.notes/2', books: [] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('E_FROM_FUTURE');
    expect(r.error.detail).toContain('比本应用新');
  });

  it('结构不对 → E_BAD_SHAPE', () => {
    const r = parseNotesFile(JSON.stringify({ schema: NOTES_SCHEMA, books: [{ book_id: '', highlights: [] }] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('E_BAD_SHAPE');
  });

  it('锚点格式不对 → 拦下（不把坏锚点写进库）', () => {
    const r = parseNotesFile(
      JSON.stringify({
        schema: NOTES_SCHEMA,
        books: [{ book_id: 'user:a', highlights: [{ locator: { scheme: 'quote' }, quote: 'x' }] }],
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('E_BAD_SHAPE');
  });

  it('空文件 → E_EMPTY（而不是"导入成功 0 条"）', () => {
    const r = parseNotesFile(JSON.stringify({ schema: NOTES_SCHEMA, books: [] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('E_EMPTY');
  });
});

describe('去重键', () => {
  it('同书同锚点同引文 → 同键，与字段顺序无关', () => {
    const a = highlightKey('user:a', { quote: '一句', locator: loc, created_at: 1 });
    const b = highlightKey('user:a', { quote: '一句', locator: { ...loc }, created_at: 99 });
    expect(a).toBe(b);
  });

  it('引文不同 → 不同键（同一位置改过引文要算两条）', () => {
    const a = highlightKey('user:a', { quote: '一句', locator: loc, created_at: 1 });
    const b = highlightKey('user:a', { quote: '另一句', locator: loc, created_at: 1 });
    expect(a).not.toBe(b);
  });

  it('同章同句但位置不同 → 不同键（划了两处是两条，不是重复）', () => {
    const at = (offset: number): RangeLocator => ({
      ...loc,
      start: { scheme: 'txt-offset', chapter: 0, offset },
      end: { scheme: 'txt-offset', chapter: 0, offset: offset + 4 },
    });
    const a = highlightKey('user:a', { quote: '一句', locator: at(10), created_at: 1 });
    const b = highlightKey('user:a', { quote: '一句', locator: at(180), created_at: 1 });
    expect(a).not.toBe(b);
  });

  it('引文锚点按 occurrence 区分：第 1 次与第 2 次出现不是同一条', () => {
    const occ = (n: number): RangeLocator => ({
      ...loc,
      start: { scheme: 'quote', chapter_ref: CH, quote: '一句', occurrence: n },
    });
    const a = highlightKey('user:a', { quote: '一句', locator: occ(1), created_at: 1 });
    const b = highlightKey('user:a', { quote: '一句', locator: occ(2), created_at: 1 });
    expect(a).not.toBe(b);
  });

  it('纯笔记（没有锚点）也能算出键', () => {
    expect(highlightKey('user:a', { quote: '一句', created_at: 1 })).toBe('user:a|none|一句|');
  });

  it('同一本书的两条纯笔记不撞键（否则导入只进第一条）', () => {
    const a = highlightKey('user:a', { quote: '', note: '第一段想法', created_at: 1 });
    const b = highlightKey('user:a', { quote: '', note: '第二段想法', created_at: 2 });
    expect(a).not.toBe(b);
  });
});
