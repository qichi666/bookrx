import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { computeResult } from '@/engine/result.js';
import { tierOf } from '@/domain/scoring/tier.js';

/**
 * 困境可达性：33 个词表标签，每一个都必须能推出**至少一本不是 explore 的书**。
 *
 * 为什么这条比金标更重要：金标只测 10 条画像，测的是"这几条准不准"；
 * 这条测的是"有没有整片困境无人可答"。13 本的时候有 12 个标签是这种状态——
 * 用户落在「原生家庭」「倦怠」「信息过载」上，核心库给不出任何东西，
 * 而 10 条金标可以全绿，因为金标恰好不覆盖这些标签。
 *
 * 断言口径：
 *   · 主诉命中 + 覆盖率够 → 该落 worth 或 strong（tierOf 的判定，不另算）
 *   · explore 允许作为"有货但主诉没中"的兜底，但**不能一本书都没有**
 *   · 前 5 本里必须至少 1 本 worth/strong，否则用户看首屏等于看不到
 */

const TAXONOMY = JSON.parse(readFileSync('catalog/taxonomy.json', 'utf8')) as {
  problem_domains: Record<ProblemDomain, { tags: ProblemTagId[] }>;
};

const DOMAINS = Object.entries(TAXONOMY.problem_domains) as [ProblemDomain, { tags: ProblemTagId[] }][];

describe('困境可达性（33 个标签逐个过）', () => {
  it('词表非空，否则下面的循环会空转通过', () => {
    expect(DOMAINS.length).toBe(6);
    const total = DOMAINS.reduce((n, [, v]) => n + v.tags.length, 0);
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it('每个标签都能推出值得看的书（前 5 本里至少 1 本 worth/strong）', () => {
    const dead: string[] = [];
    const weak: string[] = [];

    for (const [domain, { tags }] of DOMAINS) {
      for (const tag of tags) {
        const { diagnosis } = buildDiagnosis({
          domain,
          tags: [tag],
          primary: tag,
          // 全部偏好留空 = 用户一路跳答。这是最严苛的口径：
          // 拿不到任何难度/篇幅/体例的补偿，只能靠困境匹配本身站住。
        });
        const r = computeResult(diagnosis);

        if (r.items.length === 0) {
          dead.push(`${domain}/${tag}`);
          continue;
        }

        const top5 = r.items.slice(0, 5).map((it) => {
          const t = tierOf(it.score_bp, it.primary_hit, it.book_coverage_bp).tier;
          return { title: it.book.title, tier: t, score: it.score_bp };
        });
        if (!top5.some((x) => x.tier === 'worth' || x.tier === 'strong')) {
          weak.push(`${domain}/${tag} → 前5全是 explore（最高 ${top5[0]?.score} 分：${top5[0]?.title}）`);
        }
      }
    }

    if (dead.length > 0) {
      console.log('\n  ── 完全没有结果的困境 ──\n  ' + dead.join('\n  '));
    }
    if (weak.length > 0) {
      console.log('\n  ── 有书但都只是 explore ──\n  ' + weak.join('\n  '));
    }

    expect(dead, `以下困境无书可推：${dead.join(', ')}`).toEqual([]);
    expect(weak, `以下困境推不出值得看的书：${weak.join(' | ')}`).toEqual([]);
  });

  it('每个标签的首选书都真的带这个标签（防"靠覆盖率凑上来"）', () => {
    const wrong: string[] = [];
    for (const [domain, { tags }] of DOMAINS) {
      for (const tag of tags) {
        const { diagnosis } = buildDiagnosis({ domain, tags: [tag], primary: tag });
        const r = computeResult(diagnosis);
        const top = r.items[0];
        if (!top) continue;
        const carried = (top.book.problem_tags ?? []).some((p) => p.tag === tag);
        if (!carried) wrong.push(`${domain}/${tag} → 首选《${top.book.title}》没有该标签`);
      }
    }
    expect(wrong, `首选书与标签不对应：${wrong.join(' | ')}`).toEqual([]);
  });
});
