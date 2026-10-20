import type { UserBook } from '@/contracts/book.js';
import type { ReadingProgress } from '@/contracts/reader.js';
import type { ShelfEntry, ShelfGroup } from '@/storage/db.js';

/**
 * 书架三组的纯逻辑（读 / 想读 / 读完）。
 *
 * 抽成纯函数不是为了"架构好看"，是因为这里有三条**只能靠断言守住**的规则：
 *  ① 一本书只出现在一组里（按 `shelf` 唯一归属，不是按分数猜）；
 *  ② 没有 `shelf` 记录的旧数据默认进"想读"——绝不根据进度推断成"在读"，
 *     推断错了会让人以为自己在读一本从没打开过的书；
 *  ③ 组内按「上次打开时间」倒序，"想读"里没打开过的按导入时间倒序。
 *
 * 排序一旦乱，书架就成了随机列表；而这种错在界面上看不出对错，只能靠测试。
 */

export interface ShelfBook {
  id: string;
  title: string;
  author: string;
  words: number;
  /** 0–1 */
  percent: number;
  lastOpenedAt: number | null;
  group: ShelfGroup;
  /** 排序用：导入时间兜底 */
  addedAt: number;
}

export type ShelfGroups = Record<ShelfGroup, ShelfBook[]>;

const EMPTY: ShelfGroups = { reading: [], want: [], finished: [] };

function newestFirst(a: ShelfBook, b: ShelfBook): number {
  return (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt);
}

export function buildShelf(
  books: readonly UserBook[],
  shelf: readonly ShelfEntry[],
  progress: readonly ReadingProgress[],
): ShelfGroups {
  const byShelf = new Map<string, ShelfEntry>();
  for (const s of shelf) byShelf.set(s.book_id, s);
  const byProgress = new Map<string, ReadingProgress>();
  for (const p of progress) byProgress.set(p.book_id, p);

  const out: ShelfGroups = { reading: [...EMPTY.reading], want: [...EMPTY.want], finished: [...EMPTY.finished] };
  for (const b of books) {
    const entry = byShelf.get(b.book_id);
    // 没有分组记录：默认"想读"，不从进度反推
    const group: ShelfGroup = entry?.group ?? 'want';
    const pg = byProgress.get(b.book_id);
    const item: ShelfBook = {
      id: b.book_id,
      title: b.title,
      author: b.author_display[0] ?? '作者未知',
      words: b.word_count ?? 0,
      percent: pg?.percent ?? 0,
      lastOpenedAt: pg?.last_opened_at ?? null,
      group,
      addedAt: b.imported_at ?? 0,
    };
    out[group].push(item);
  }
  for (const g of Object.keys(out) as ShelfGroup[]) out[g].sort(newestFirst);
  return out;
}

/** 组的总数 + 是否有书，标题栏与空态共用，避免两处算出不同的数 */
export function shelfStats(groups: ShelfGroups): { total: number; byGroup: Record<ShelfGroup, number> } {
  return {
    total: groups.reading.length + groups.want.length + groups.finished.length,
    byGroup: {
      reading: groups.reading.length,
      want: groups.want.length,
      finished: groups.finished.length,
    },
  };
}
