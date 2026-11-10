import { describe, expect, it } from 'vitest';
import type { Book } from '@/contracts/book.js';
import type { ShelfEntry } from '@/storage/db.js';
import { buildWishlist, nextSortOrder, totalHours } from '@/domain/wishlist.js';

/**
 * F5 想读队列的排序（此前无直接用例）。
 *
 * 三条规则看起来都简单，但"排过队的在前面、没排过队的按加入时间倒序"这两句
 * 一旦写成同一个比较函数，就很容易变成**不稳定排序**：同样的数据两次加载
 * 顺序不同，用户会以为队列被系统改过。所以这里每条规则都要单独钉一次。
 */

function core(id: string, title: string, hours = 4, difficulty = 3): Book {
  return {
    book_id: id,
    title,
    author_display: ['某人'],
    est_reading_hours: hours,
    difficulty,
  } as Book;
}

const want = (id: string, updated_at: number, sort_order?: number): ShelfEntry =>
  ({ book_id: id, group: 'want', updated_at, ...(sort_order === undefined ? {} : { sort_order }) }) as ShelfEntry;

describe('buildWishlist', () => {
  it('只收「想读」，在读 / 读完 / 放下的都不进来', () => {
    const shelf: ShelfEntry[] = [
      { book_id: 'r', group: 'reading', updated_at: 1 },
      { book_id: 'f', group: 'finished', updated_at: 1 },
      { book_id: 'a', group: 'abandoned', updated_at: 1 },
      want('w', 1),
    ];
    const out = buildWishlist(shelf, [core('r', '甲'), core('w', '丁')]);
    expect(out.map((i) => i.book_id)).toEqual(['w']);
  });

  it('排过队的按 sort_order 升序，排在没排队的前面', () => {
    const shelf = [want('a', 900), want('b', 100, 2), want('c', 500, 1)];
    const out = buildWishlist(shelf, [core('a', '甲'), core('b', '乙'), core('c', '丙')]);
    expect(out.map((i) => i.book_id)).toEqual(['c', 'b', 'a']);
  });

  it('都没排队时按加入时间倒序（新的在前）', () => {
    const shelf = [want('a', 100), want('b', 300), want('c', 200)];
    const out = buildWishlist(shelf, []);
    expect(out.map((i) => i.book_id)).toEqual(['b', 'c', 'a']);
  });

  it('加入时间也相同：按 book_id 兜底，保证同输入同输出', () => {
    const shelf = [want('b', 100), want('a', 100), want('c', 100)];
    const first = buildWishlist(shelf, []).map((i) => i.book_id);
    const second = buildWishlist([...shelf].reverse(), []).map((i) => i.book_id);
    expect(first).toEqual(['a', 'b', 'c']);
    expect(second).toEqual(first);
  });

  it('核心库没标注的本机书：标题留空、时长 0，不编一个假标题', () => {
    const out = buildWishlist([want('user:1', 1)], [], ['user:1']);
    expect(out[0]).toMatchObject({ book_id: 'user:1', title: '', hours: 0, local: true });
  });

  it('本机有没有正文决定 local 标记，与它在不在核心库无关', () => {
    const shelf = [want('core:1', 1), want('user:2', 2)];
    const out = buildWishlist(shelf, [core('core:1', '甲')], ['user:2']);
    expect(out.find((i) => i.book_id === 'core:1')?.local).toBe(false);
    expect(out.find((i) => i.book_id === 'user:2')?.local).toBe(true);
  });

  it('想读为空给空数组；脏的 sort_order 当成没排队', () => {
    expect(buildWishlist([], [])).toEqual([]);
    const dirty = { book_id: 'a', group: 'want', updated_at: 1, sort_order: 'abc' } as unknown as ShelfEntry;
    expect(buildWishlist([dirty], [])[0]!.sortOrder).toBeNull();
  });
});

describe('nextSortOrder', () => {
  it('空队列给 0：第一条能排到最前', () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it('取最大值 + 1，不看数组顺序', () => {
    const items = buildWishlist([want('a', 1, 5), want('b', 2, 9)], []);
    expect(nextSortOrder(items)).toBe(10);
  });

  it('全都没排过队时给 0（不是从 1 开始，避免和已有 0 冲突）', () => {
    expect(nextSortOrder(buildWishlist([want('a', 1)], []))).toBe(0);
  });
});

describe('totalHours', () => {
  it('累加并保留一位小数', () => {
    const items = buildWishlist([want('a', 1), want('b', 2)], [core('a', '甲', 3.33), core('b', '乙', 4.44)]);
    expect(totalHours(items)).toBe(7.8);
  });

  it('空队列为 0；脏时长按 0 计，不把总数变成 NaN', () => {
    expect(totalHours([])).toBe(0);
    const dirty = [{ hours: Number.NaN }, { hours: 2 }] as never;
    expect(totalHours(dirty)).toBe(2);
  });
});
