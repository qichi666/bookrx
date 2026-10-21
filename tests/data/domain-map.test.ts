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
 *  ③ 真实数据上，每个域的宽池总量够用（不再是 0 本，也不只是"能跑"）。
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
const derived = new Map<string, ProblemTagWeight[]>();
if (existsSync(DERIVED)) {
  const rows = JSON.parse(readFileSync(DERIVED, 'utf-8')) as Array<{
    id: string;
    pt: [string, number, 'annotation' | 'title' | 'category'][];
  }>;
  for (const r of rows) {
    // 与运行时同口径：认「逐本标注」和「书名命中」，只挡兜底。兜底证据在 `enriched.ts`
    // 就被挡住了，测试若把它算进来，就是在用一个用户永远看不到的池子做断言。
    const strong: ProblemTagWeight[] = r.pt
      .filter(([, , src]) => src === 'annotation' || src === 'title')
      .map(([tag, weight]) => ({ tag: tag as ProblemTagId, weight }));
    if (strong.length > 0) derived.set(r.id, strong);
  }
}

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

describe('困境域映射表（真实数据：每个域的宽池都还立得住）', () => {
  it.skipIf(candidates.length === 0 || derived.size === 0)(
    '6 个域的宽池总量都不少于下限，且每域至少有一个标签能看到 5 本以上',
    () => {
      /**
       * 这条断言的**口径换过一次**，换的理由必须写下来：
       *
       * 原来是「每个域、每个标签的池都 ≥20 本」。它一直绿着，靠的是把豆瓣大类的
       * 兜底证据也算进池子——而豆瓣标签到困境标签是 1 对多，一本书只留 3 个，
       * 留哪 3 个由散列决定。也就是说那条断言是**用随机噪声把池子撑宽的**。
       *
       * 兜底证据被挡在运行时之外以后，池子小是真小（big-choice 2 本、emptiness 2 本）。
       * 于是断言改成两条能反映真实能力的话：域还通（总量够用）、有东西可看（不至于全空）。
       * 逐标签规模照样打印出来——数字难看就难看，藏起来才是问题。
       */
      const VISIBLE_FLOOR = 5;
      const thinDomains: string[] = [];
      const invisible: string[] = [];
      const report: string[] = [];
      const noDomain = new Set<string>();
      let total = 0;

      for (const [domain, { tags }] of DOMAINS) {
        const { diagnosis } = buildDiagnosis({ domain, tags: [tags[0]!], primary: tags[0]! });
        let sum = 0;
        let widest = 0;
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
          sum += pool.size;
          if (pool.size > widest) widest = pool.size;
          if (pool.size > 0) noDomain.add(domain);
          report.push(`${domain}/${tag}=${pool.size}`);
        }
        total += sum;
        if (sum < MIN_DOMAIN_POOL) thinDomains.push(`${domain}=${sum}`);
        if (widest < VISIBLE_FLOOR) invisible.push(`${domain}=${widest}`);
      }

      console.log(`\n  ── 宽池规模（仅书名证据）──\n  ${report.join('  ')}\n  域总量 ${total}`);
      expect(thinDomains, `以下域的宽池总量不足 ${MIN_DOMAIN_POOL} 本：${thinDomains.join(', ')}`).toEqual([]);
      expect(invisible, `以下域最好的标签也看不到 ${VISIBLE_FLOOR} 本：${invisible.join(', ')}`).toEqual([]);
      // 回归点：emotion / habits / transition 曾经恒为 0（两套域枚举只撞上 3 个名字）
      expect(noDomain.size).toBe(6);
    },
  );
});
