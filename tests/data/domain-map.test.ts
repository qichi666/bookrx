import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import type { CandidateBook } from '@/data/candidates.js';
import type { ProblemTagWeight } from '@/contracts/book.js';
import {
  CANDIDATE_DOMAINS,
  MIN_DOMAIN_POOL,
  PROBLEM_DOMAIN_POOLS,
  inDomainPool,
  poolDomainsOf,
} from '@/data/domain-map.js';
import { selectByNeed } from '@/engine/wide-need.js';

/**
 * 困境域 → 候选池域：这张表错了不会报错，只会让**一半的域悄悄变空**。
 *
 * 这就是这条测试存在的理由。它测三件事：
 *  ① 表覆盖全部 6 个域（少一个键 = 那个域的书永久为空）；
 *  ② 表里写的域名在候选池里真实存在（写错一个名字 = 那个域少一半书，无声无息）；
 *  ③ 真实数据上，每个域、每个标签的宽池都 ≥ 下限（不再是 0 本，也不只是"能跑"）。
 */

const TAXONOMY = JSON.parse(readFileSync('catalog/taxonomy.json', 'utf8')) as {
  problem_domains: Record<ProblemDomain, { tags: ProblemTagId[] }>;
};
const DOMAINS = Object.entries(TAXONOMY.problem_domains) as [
  ProblemDomain,
  { tags: ProblemTagId[] },
][];

const ALL = join(process.cwd(), 'public', 'catalog', 'candidates', 'all.json');
const DERIVED = join(process.cwd(), 'public', 'catalog', 'enriched', 'derived.json');
const candidates: CandidateBook[] = existsSync(ALL)
  ? (JSON.parse(readFileSync(ALL, 'utf-8')) as CandidateBook[])
  : [];
const derived = new Map<string, ProblemTagWeight[]>(
  existsSync(DERIVED)
    ? (
        JSON.parse(readFileSync(DERIVED, 'utf-8')) as Array<{ id: string; pt: [string, number][] }>
      ).map((r) => [r.id, r.pt.map(([tag, weight]) => ({ tag: tag as ProblemTagId, weight }))])
    : [],
);

describe('困境域映射表（结构）', () => {
  it('覆盖全部 6 个困境域，且每个域都有映射', () => {
    expect(DOMAINS.length).toBe(6);
    for (const [domain] of DOMAINS) {
      const pools = poolDomainsOf(domain);
      expect(pools.length, `${domain} 没有映射到任何候选池域`).toBeGreaterThan(0);
      // 映射里不许有重复域名（重复不报错，但会让下面的权重直觉失效）
      expect(new Set(pools).size).toBe(pools.length);
    }
  });

  it('未在表里的域返回空数组，而不是"按名字相同猜"', () => {
    // 静默退回按名字匹配正是这次 bug 的成因：猜对了 3 个，另外 3 个空着还没人知道。
    expect(poolDomainsOf('unknown-domain' as ProblemDomain)).toEqual([]);
    expect(inDomainPool(['psychology'], 'unknown-domain' as ProblemDomain)).toBe(false);
  });

  it.skipIf(candidates.length === 0)('表里写的域名都是候选池里真实存在的域', () => {
    const real = new Set(candidates.flatMap((b) => b.domains));
    const typo: string[] = [];
    for (const [domain, pools] of Object.entries(PROBLEM_DOMAIN_POOLS)) {
      for (const p of pools) if (!real.has(p)) typo.push(`${domain} → ${p}`);
    }
    expect(typo, `映射表里写了候选池没有的域：${typo.join(', ')}`).toEqual([]);
  });

  it('候选池的 7 个域都在常量清单里（防新增域后忘了登记）', () => {
    if (candidates.length === 0) return;
    const real = new Set(candidates.flatMap((b) => b.domains));
    const missing = [...real].filter((d) => !CANDIDATE_DOMAINS.includes(d as never));
    expect(missing, `候选池里出现了未登记的域：${missing.join(', ')}`).toEqual([]);
  });
});

describe('困境域映射表（真实数据：每个域每个标签的宽池都够宽）', () => {
  it.skipIf(candidates.length === 0 || derived.size === 0)(
    `6 个域 × 33 个标签，宽池都不少于 ${MIN_DOMAIN_POOL} 本`,
    () => {
      const thin: string[] = [];
      const report: string[] = [];
      const noDomain = new Set<string>();

      for (const [domain, { tags }] of DOMAINS) {
        const { diagnosis } = buildDiagnosis({ domain, tags: [tags[0]!], primary: tags[0]! });
        for (const tag of tags) {
          const demand = new Map<ProblemTagId, number>([[tag, 0.6]]);
          const pool = selectByNeed(
            candidates,
            derived,
            demand,
            domain,
            new Set(diagnosis.excluded_book_ids),
            { epoch: 0, limit: 5 },
          );
          if (pool.size < MIN_DOMAIN_POOL) thin.push(`${domain}/${tag}=${pool.size}`);
          else noDomain.add(domain);
          report.push(`${domain}/${tag}=${pool.size}${pool.evidence === 'fallback' ? '(兜底)' : ''}`);
        }
      }

      console.log(`\n  ── 宽池规模 ──\n  ${report.join('  ')}\n`);
      expect(thin, `以下困境的宽池不足 ${MIN_DOMAIN_POOL} 本：${thin.join(', ')}`).toEqual([]);
      // 回归点：emotion / habits / transition 曾经恒为 0（两套域枚举只撞上 3 个名字）
      expect(noDomain.size).toBe(6);
    },
  );
});
