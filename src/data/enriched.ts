import type { ProblemTagWeight } from '@/contracts/book.js';
import type { ProblemTagId } from '@/contracts/enums.js';

/**
 * 派生标注（enriched 层）加载器。
 *
 * 这些标签是**规则推出来的**，不是人工核对的：来源记在 `how` 里
 * （`title` = 书名命中词表，`tag` = 豆瓣大类兜底，权重 0.4）。
 * 因此它们对应的书覆盖率只有 4300，打分时只有 `problem` 一个因子在场，
 * 档位封顶 `worth`——这条边界由 `tierOf` 与 `coverage.test.ts` 守着。
 */
export interface DerivedEntry {
  id: string;
  pt: ReadonlyArray<readonly [string, number]>;
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

/** 加载一次，之后复用同一个 promise（并发调用不会重复请求）。 */
export function loadDerivedTags(): Promise<Map<string, ProblemTagWeight[]> | null> {
  cache ??= (async () => {
    const rows = await getJson<DerivedEntry[]>(FILE);
    if (rows === null) return null;
    const map = new Map<string, ProblemTagWeight[]>();
    for (const r of rows) {
      map.set(
        r.id,
        r.pt.map(([tag, weight]) => ({ tag: tag as ProblemTagId, weight })),
      );
    }
    return map;
  })();
  return cache;
}

export function resetDerivedCacheForTests(): void {
  cache = null;
}
