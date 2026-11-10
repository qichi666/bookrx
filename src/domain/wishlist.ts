import type { Book } from '@/contracts/book.js';
import type { ShelfEntry } from '@/storage/db.js';

/**
 * 想读队列的纯逻辑。
 *
 * 与 `domain/shelf.ts` 的分工：那边管**本机导入的书**（有正文、能点开读），
 * 这边管**想读队列**——里面大多数是核心库的外链书（66/68 是 `bring_your_own`），
 * 本机没有正文，点开是去别处读。这两种条目必须能同框出现，否则「看到推荐 → 存下」
 * 这条最短的留存回路在核心库上根本不成立。
 *
 * 排序规则（**只影响用户自己的队列，绝不接进推荐打分**）：
 *  1. 排过队的按 `sort_order` 升序；
 *  2. 没排过队的排在后面，按加入时间倒序；
 *  3. 仍相同按 `book_id`，保证同输入同输出。
 */

export interface WishItem {
  book_id: string;
  title: string;
  author: string;
  /** 预计阅读时长（小时）；核心库有，本机书可能缺 */
  hours: number;
  difficulty: number;
  addedAt: number;
  sortOrder: number | null;
  /** true = 这台机器上有正文，点开就能读；false = 外链书 */
  local: boolean;
}

export function buildWishlist(
  shelf: readonly ShelfEntry[],
  coreBooks: readonly Book[],
  localBookIds: readonly string[] = [],
): WishItem[] {
  const core = new Map<string, Book>();
  for (const b of coreBooks) core.set(b.book_id, b);
  const localSet = new Set(localBookIds);

  const items: WishItem[] = [];
  for (const s of shelf) {
    if (s.group !== 'want') continue;
    const b = core.get(s.book_id);
    items.push({
      book_id: s.book_id,
      // 本机书没有核心库标注，标题由调用方从 books 表补齐；这里给空串，宁可空也不编
      title: b?.title ?? '',
      author: b?.author_display[0] ?? '',
      hours: b?.est_reading_hours ?? 0,
      difficulty: b?.difficulty ?? 0,
      addedAt: s.updated_at,
      sortOrder: typeof s.sort_order === 'number' ? s.sort_order : null,
      local: localSet.has(s.book_id),
    });
  }

  return items.sort((a, b) => {
    if (a.sortOrder !== null && b.sortOrder !== null && a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.sortOrder === null && b.sortOrder !== null) return 1;
    if (a.sortOrder !== null && b.sortOrder === null) return -1;
    if (a.addedAt !== b.addedAt) return b.addedAt - a.addedAt;
    return a.book_id < b.book_id ? -1 : a.book_id > b.book_id ? 1 : 0;
  });
}

/** 队列末尾的序号。空队列返回 0，保证第一条排在最前。 */
export function nextSortOrder(items: readonly WishItem[]): number {
  let max = -1;
  for (const it of items) {
    if (it.sortOrder !== null && it.sortOrder > max) max = it.sortOrder;
  }
  return max + 1;
}

/** 总预计时长（小时），读书计划排期用。 */
export function totalHours(items: readonly WishItem[]): number {
  return Math.round(items.reduce((sum, it) => sum + (Number.isFinite(it.hours) ? it.hours : 0), 0) * 10) / 10;
}
