import type { ProblemDomain } from '@/contracts/enums.js';
import mapJson from '../../catalog/domain-map.json';

/**
 * 困境域 → 候选池域。**两套枚举不是一回事，必须显式映射。**
 *
 * 候选池域来自豆瓣标签（`catalog/tag-map.json`，7 个），
 * `ProblemDomain` 是产品自己的困境域（6 个）。两边只有 3 个名字恰好相同，
 * 于是原来的 `book.domains.includes(domain)` 对另外 3 个域**恒为假**——
 * 情绪、习惯、人生转折三个域的「相关书目」永远是空的，而且不报错。
 *
 * 这就是为什么映射必须是一张**写死的表**（`catalog/domain-map.json`），
 * 而不是"名字对上就用、对不上就跳过"：部分正确比全错更危险。
 * 全错会被立刻发现，部分正确会让人以为功能在工作。
 * 以后改候选池的域，`tools/verify-candidates.mjs` 的池子下限断言会让构建变红。
 *
 * 表放在 JSON 而不是 TS 里，是为了让构建期脚本（`tools/*.mjs`）读同一份数据——
 * 两处各写一遍映射，迟早会分叉，而分叉的那天没有任何报错。
 */
export type CandidateDomain =
  | 'growth'
  | 'relationship'
  | 'thinking'
  | 'psychology'
  | 'career'
  | 'meaning'
  | 'work';

interface DomainMapFile {
  min_pool: number;
  domains: Record<string, string[]>;
}

const RAW = mapJson as unknown as DomainMapFile;

/** 宽池下限：低于这个数就没有"换一批"的意义，等于没有。 */
export const MIN_DOMAIN_POOL = RAW.min_pool;

/** 候选池实际存在的 7 个域（`catalog/tag-map.json` 的 `domain` 去重结果）。 */
export const CANDIDATE_DOMAINS: readonly CandidateDomain[] = [
  'growth',
  'relationship',
  'thinking',
  'psychology',
  'career',
  'meaning',
  'work',
];

export const PROBLEM_DOMAIN_POOLS: Readonly<Record<ProblemDomain, readonly CandidateDomain[]>> =
  RAW.domains as unknown as Record<ProblemDomain, readonly CandidateDomain[]>;

/**
 * 取该困境域在候选池里对应的域列表。
 *
 * 未知域返回空数组而不是 `[domain]`：静默退回"按名字相同匹配"正是这次 bug 的成因。
 * 空数组会让池子变 0，测试与构建断言立刻红——**宁可空得响，不要静默地部分对**。
 */
export function poolDomainsOf(domain: ProblemDomain): readonly string[] {
  return PROBLEM_DOMAIN_POOLS[domain] ?? [];
}

/** 一本书是否落在该困境域的候选池里。 */
export function inDomainPool(bookDomains: readonly string[], domain: ProblemDomain): boolean {
  const pools = poolDomainsOf(domain);
  for (const d of pools) {
    if (bookDomains.includes(d)) return true;
  }
  return false;
}
