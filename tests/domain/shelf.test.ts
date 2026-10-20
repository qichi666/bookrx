import { describe, expect, it } from 'vitest';
import type { UserBook } from '@/contracts/book.js';
import type { ReadingProgress } from '@/contracts/reader.js';
import type { ShelfEntry } from '@/storage/db.js';
import { buildShelf, shelfStats } from '@/domain/shelf.js';
import { findLocalCopy, normalizeTitle } from '@/data/local-copy.js';
import { humanCount, percentText, relativeTime } from '@/lib/format.js';

/**
 * 书架分组的纪律：一排错，用户看到的就是一本"从没打开过的书躺在在读里"，
 * 而且界面上一片正常，没有报错可看。所以这里只测**判定**，不测样式。
 */

function book(id: string, title: string, importedAt = 1_000): UserBook {
  return {
    book_id: id,
    title,
    author_ids: [],
    author_display: ['某人'],
    category_l1: 'other',
    theme_tags: [],
    difficulty: 3,
    depth: 'howto_why',
    form: 'method',
    entry_level: 3,
    prose_accessibility: 3,
    est_reading_hours: 3,
    length_class: 1,
    word_count: 52_000,
    content_warning: [],
    availability: 'bring_your_own',
    copyright_basis: 'metadata_only',
    translation_copyright: 'unknown',
    one_line_what: 'x',
    structure_note: 'y',
    match_brief: 'z',
    content_ready: 'readable',
    data_version: '2026.10.20',
    imported_at: importedAt,
    source_encoding: 'utf-8',
    chapterizer_version: 1,
  } as UserBook;
}

const prog = (id: string, percent: number, at: number): ReadingProgress => ({
  book_id: id as ReadingProgress['book_id'],
  locator: { scheme: 'txt-offset', chapter: 0, offset: 0 },
  furthest_locator: null,
  percent,
  total_reading_ms: 0,
  last_opened_at: at,
  schema_version: 1,
});

describe('buildShelf', () => {
  it('按 shelf 记录分组，一本书只在一组里', () => {
    const books = [book('a', '甲'), book('b', '乙'), book('c', '丙')];
    const shelf: ShelfEntry[] = [
      { book_id: 'a', group: 'reading', updated_at: 1 },
      { book_id: 'b', group: 'finished', updated_at: 1 },
      { book_id: 'c', group: 'want', updated_at: 1 },
    ];
    const g = buildShelf(books, shelf, []);
    expect(g.reading.map((x) => x.id)).toEqual(['a']);
    expect(g.finished.map((x) => x.id)).toEqual(['b']);
    expect(g.want.map((x) => x.id)).toEqual(['c']);
  });

  it('没有 shelf 记录的旧数据进"想读"，不按进度推断成"在读"', () => {
    const books = [book('a', '甲')];
    const g = buildShelf(books, [], [prog('a', 0.6, 1)]);
    expect(g.want.map((x) => x.id)).toEqual(['a']);
    expect(g.reading).toEqual([]);
  });

  it('组内按上次打开时间倒序；没打开过的按导入时间倒序', () => {
    const books = [book('a', '甲', 100), book('b', '乙', 200), book('c', '丙', 300)];
    const shelf: ShelfEntry[] = ['a', 'b', 'c'].map((id) => ({ book_id: id, group: 'want' as const, updated_at: 1 }));
    const g = buildShelf(books, shelf, [prog('a', 0.2, 5_000)]);
    // a 有打开时间（最新）→ 排最前，其余按导入时间倒序
    expect(g.want.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('进度缺失时 percent 是 0，不是 undefined（否则进度条会画出 NaN%）', () => {
    const g = buildShelf([book('a', '甲')], [{ book_id: 'a', group: 'reading', updated_at: 1 }], []);
    expect(g.reading[0]!.percent).toBe(0);
    expect(g.reading[0]!.lastOpenedAt).toBeNull();
  });

  it('shelfStats 的总数等于三组之和', () => {
    const books = [book('a', '甲'), book('b', '乙')];
    const g = buildShelf(books, [{ book_id: 'a', group: 'reading', updated_at: 1 }], []);
    const s = shelfStats(g);
    expect(s.total).toBe(2);
    expect(s.byGroup.reading + s.byGroup.want + s.byGroup.finished).toBe(2);
  });
});

describe('本机副本匹配（只认书名，且太短不认）', () => {
  it('规范化会去掉副题、标点与空白', () => {
    expect(normalizeTitle('活着（余华作品·精装）')).toBe('活着');
    expect(normalizeTitle('The  Pragmatic   Programmer')).toBe('thepragmaticprogrammer');
  });

  it('书名对得上就给 id', () => {
    const locals = [book('user:1', '活着')];
    expect(findLocalCopy({ title: '活着（精装）' } as never, locals)?.book_id).toBe('user:1');
  });

  it('两字以下不给匹配 —— 宁可不提供"打开"，也不要打开错的书', () => {
    const locals = [book('user:1', '活')];
    expect(findLocalCopy({ title: '活' } as never, locals)).toBeUndefined();
  });

  it('作者不同但同名：仍然匹配（这是已知取舍，记录在案）', () => {
    const locals = [book('user:1', '常识')];
    expect(findLocalCopy({ title: '常识' } as never, locals)?.book_id).toBe('user:1');
  });
});

describe('显示格式化', () => {
  it('时间：分钟/小时/昨天/日期分档', () => {
    const now = Date.UTC(2026, 9, 20, 12, 0, 0);
    expect(relativeTime(now - 30_000, now)).toBe('刚刚');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 分钟前');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 小时前');
    expect(relativeTime(now - 26 * 3_600_000, now)).toBe('昨天');
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 天前');
    expect(relativeTime(now - 30 * 86_400_000, now)).toMatch(/^2026-09-\d\d$/);
  });

  it('字数：一万以下给原数，以上给万字', () => {
    expect(humanCount(9999)).toBe('9999 字');
    expect(humanCount(12_345)).toBe('1.2 万字');
    expect(humanCount(1_234_567)).toBe('123 万字');
  });

  it('百分比取整并夹在 0–100', () => {
    expect(percentText(0.0725)).toBe('7%');
    expect(percentText(-1)).toBe('0%');
    expect(percentText(3)).toBe('100%');
  });
});
