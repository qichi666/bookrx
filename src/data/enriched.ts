import type { ProblemTagWeight } from '@/contracts/book.js';
import type { ProblemTagId } from '@/contracts/enums.js';

/**
 * 派生标注（enriched 层）加载器。
 *
 * 这些标签是**规则推出来的**，不是人工核对的。数据里逐标签带证据等级
 * （`title` = 书名命中词表 0.85–0.9；`category` = 豆瓣大类兜底 0.4），
 * **这里只放行 `title` 那一种**。
 *
 * 为什么把兜底整类挡在门外，而不是"标一下相关性较弱"：豆瓣标签到困境标签是
 * 1 对多映射（「人生」对应 6 个困境标签），而一本书只保留 3 个——留下哪 3 个
 * 由书 id 散列决定，等于抽签。实测 27/33 个标签的兜底占比 ≥80%，
 * 16 个标签的强证据书不到 20 本，于是"降级放进来"成了常态路径。
 * 这类书对应的覆盖率只有 4300，打分时只有 `problem` 一个因子在场，
 * 档位封顶 `worth`——这条边界由 `tierOf` 与 `coverage.test.ts` 守着。
 *
 * 代价是某些困境下池子会很小（个位数）。界面上如实说「只找到 N 本」，
 * 不拿不对题的书凑数——这是产品的第二条底线。
 */
export interface DerivedEntry {
  id: string;
  /** `[标签, 权重, 证据等级]`：三元组，第三位是 `title` 或 `category` */
  pt: ReadonlyArray<readonly [string, number, 'title' | 'category']>;
  how: 'title' | 'tag' | 'none';
}

const FILE = 'catalog/enriched/derived.json';

let cache: Promise<Map<string, ProblemTagWeight[]> | null> | null = null;

async function getJson<T>(rel: string): Promise<T | null> {
  try {
    const res = await fetch(rel);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 把产物行折成运行时用的 `id → 标签` 映射。
 *
 * 单独抽成纯函数是为了能被单测直接验证：**兜底证据必须在这一步就被丢掉**。
 * 如果这条规则只写在 fetch 回调里，测试就只能靠读代码来相信它——
 * 而这个项目里"看起来对"和"跑起来对"已经分叉过好几次了。
 */
export function toRuntimeTags(
  rows: readonly DerivedEntry[],
): Map<string, ProblemTagWeight[]> {
  const map = new Map<string, ProblemTagWeight[]>();
  for (const r of rows) {
    const strong = r.pt.filter(([, , src]) => src === 'title');
    // 只有兜底证据的书直接不进 map：它在本产品里没有可以展示的用途，
    // 留着只会诱使下游再写一次"降级放行"。
    if (strong.length === 0) continue;
    map.set(
      r.id,
      strong.map(([tag, weight]) => ({ tag: tag as ProblemTagId, weight })),
    );
  }
  return map;
}

/** 加载一次，之后复用同一个 promise（并发调用不会重复请求）。 */
export function loadDerivedTags(): Promise<Map<string, ProblemTagWeight[]> | null> {
  cache ??= (async () => {
    const rows = await getJson<DerivedEntry[]>(FILE);
    if (rows === null) return null;
    return toRuntimeTags(rows);
  })();
  return cache;
}

export function resetDerivedCacheForTests(): void {
  cache = null;
}
