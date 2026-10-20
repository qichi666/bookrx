import type { Book } from '@/contracts/book.js';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import { SEED_BOOKS } from './catalog.js';
import { TAG_OPTIONS } from './quiz.js';

/**
 * 书库层面的两个"数据事实"，供界面直接引用。
 *
 * 为什么放在这里而不是组件里：这两个问题都是**关于整座书库**的问题，
 * 而组件只知道它手边那 5 本书。让组件去翻全库，等于让视图层承担数据层职责，
 * 而且它一改就没人知道还有别处在用。
 */

/** 标签 → 所属困境域（问卷选项是唯一真源，不另写一张表）。 */
const TAG_DOMAIN: ReadonlyMap<ProblemTagId, ProblemDomain> = (() => {
  const m = new Map<ProblemTagId, ProblemDomain>();
  for (const [domain, opts] of Object.entries(TAG_OPTIONS)) {
    for (const o of opts) m.set(o.tag, domain as ProblemDomain);
  }
  return m;
})();

/**
 * 哪些困境域**完全**没有可直读的书。
 *
 * 为什么不用规格书里写死的那三个域：规格书是按 60 本书的初始状态写的，
 * 而书库是会变的。真实数据里《围炉夜话》《曾国藩家书》都属于"工作与意义"域，
 * 所以那个域**有**公版书——照抄规格书会让说明条在一个有两本公版书的域里
 * 说"这里的书基本都还在版权期内"，而同一页的卡片上正贴着"公版"徽标。
 *
 * 判断依据是书库本身：域内 `availability === 'inline'` 的书数为 0。
 * 书库一长出来，说明条自动消失，不需要谁记得回来删它。
 */
export function domainsWithoutInline(books: readonly Book[] = SEED_BOOKS): Set<ProblemDomain> {
  const has = new Set<ProblemDomain>();
  for (const b of books) {
    if (b.availability !== 'inline') continue;
    for (const p of b.problem_tags ?? []) {
      const d = TAG_DOMAIN.get(p.tag);
      if (d) has.add(d);
    }
  }
  const all = Object.keys(TAG_OPTIONS) as ProblemDomain[];
  return new Set(all.filter((d) => !has.has(d)));
}

/**
 * 同主题的其它书（详情页底部 3 本）。
 *
 * 相关度 = 与该书共享的 `problem_tags` 权重之和；同分按 `est_reading_hours`
 * 升序（先给薄的，读得下去比读得全重要），再按 `book_id` 保证全序。
 * 只用 `problem_tags`，不用 `theme_tags`：主题标签是浏览用的，不参与推荐口径。
 */
export function sameTopicBooks(book: Book, books: readonly Book[] = SEED_BOOKS, limit = 3): Book[] {
  const mine = new Map((book.problem_tags ?? []).map((p) => [p.tag, p.weight]));
  const scored = books
    .filter((b) => b.book_id !== book.book_id)
    .map((b) => {
      let shared = 0;
      for (const p of b.problem_tags ?? []) {
        const w = mine.get(p.tag);
        if (w !== undefined) shared += Math.min(w, p.weight);
      }
      return { b, shared };
    })
    .filter((x) => x.shared > 0)
    .sort(
      (x, y) =>
        y.shared - x.shared ||
        x.b.est_reading_hours - y.b.est_reading_hours ||
        (x.b.book_id < y.b.book_id ? -1 : 1),
    );
  return scored.slice(0, limit).map((x) => x.b);
}
