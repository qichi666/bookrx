import type { UserBook } from '@/contracts/book.js';
import type { ReadingProgress } from '@/contracts/reader.js';
import type { ShelfEntry, ShelfGroup } from '@/storage/db.js';

/**
 * 书架四组的纯逻辑（在读 / 想读 / 读完 / 放下的）。
 *
 * 抽成纯函数不是为了"架构好看"，是因为这里有四条**只能靠断言守住**的规则：
 *  ① 一本书只出现在一组里（按 `shelf` 唯一归属，不是按分数猜）；
 *  ② 没有 `shelf` 记录的旧数据默认进"想读"——绝不根据进度推断成"在读"，
 *     推断错了会让人以为自己在读一本从没打开过的书；
 *  ③ 组内按「上次打开时间」倒序，"想读"里没打开过的按导入时间倒序；
 *  ④ 弃读是**独立的第四组**，既不进"在读"也不进"读完"——一旦把它塞进
 *     任何一组，书架就开始说谎：说你在读一本你已经放下的书。
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

/**
 * 分组的展示顺序。**只有这一份**：书架页的分组标题、统计口径、未来的筛选
 * 都从它来。曾经这个数组在 `LibraryView` 里另写了一遍，加第四组时漏改，
 * 页面照样渲染、只是"放下的书"永远不显示——类型系统管不到数组字面量，
 * 所以干脆让它只存在一处。
 */
export const SHELF_ORDER: readonly ShelfGroup[] = ['reading', 'want', 'finished', 'abandoned'];

/** 空分组。加组别时 `Record<ShelfGroup, …>` 会在这里报错，不会静默漏掉一组 */
export function emptyGroups(): ShelfGroups {
  return { reading: [], want: [], finished: [], abandoned: [] };
}

function newestFirst(a: ShelfBook, b: ShelfBook): number {
  return (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt);
}

/**
 * 认不出来的分组一律折回「想读」。
 *
 * 记录可能来自旧版本、手改过的库，或将来新增的组别。原先直接 `out[group].push`
 * 会取到 `undefined` 然后抛 TypeError，整页书架变成白屏——用户连"哪本书坏了"
 * 都看不到。折回「想读」至少让书还在，而且「默认想读」与本文件开头第 ② 条同源：
 * 不知道归哪组时，不要替用户判断他已经在读了。
 */
function groupOf(raw: string | undefined): ShelfGroup {
  return raw !== undefined && (SHELF_ORDER as readonly string[]).includes(raw)
    ? (raw as ShelfGroup)
    : 'want';
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

  const out: ShelfGroups = emptyGroups();
  for (const b of books) {
    const entry = byShelf.get(b.book_id);
    // 没有分组记录：默认"想读"，不从进度反推
    const group: ShelfGroup = groupOf(entry?.group);
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
  const byGroup = {} as Record<ShelfGroup, number>;
  let total = 0;
  for (const g of SHELF_ORDER) {
    byGroup[g] = groups[g].length;
    total += byGroup[g];
  }
  return { total, byGroup };
}

export interface ShelfCounts {
  reading: number;
  want: number;
  finished: number;
  abandoned: number;
  /** 「开始过」= 在读 + 读完 */
  started: number;
}

/**
 * 直接数 `shelf` 记录的四种状态，并把「开始过」的口径钉死在一处。
 *
 * 弃读**不进** `started`：读完率问的是「我开始过的书里读完了多少」，
 * 把放下的算进分母，这个数就变成"我放弃得越来越多"的计数器——
 * 它不再描述阅读，只描述挫败。想读同理，收藏不叫开始。
 */
export function countShelfStatus(shelf: readonly ShelfEntry[]): ShelfCounts {
  const c: ShelfCounts = { reading: 0, want: 0, finished: 0, abandoned: 0, started: 0 };
  for (const s of shelf) {
    if (s.group === 'reading') c.reading += 1;
    else if (s.group === 'finished') c.finished += 1;
    else if (s.group === 'abandoned') c.abandoned += 1;
    else c.want += 1;
  }
  c.started = c.reading + c.finished;
  return c;
}
