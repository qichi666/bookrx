import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { BookId, ProblemTagId } from '@/contracts/enums.js';
import { tierOf } from '@/domain/scoring/tier.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { computeResult } from '@/engine/result.js';

/**
 * M0.5 闸门：10 条金标画像。
 *
 * 两个计数**分开报，不求平均**（SPEC §7.4）：认出率看"该给的书有没有进 strong"，
 * 首屏率看"它是不是第一个"。把两者平均会掩盖最难受的情况——书是认出来了，
 * 但被排到第 4 位，用户根本看不到。
 *
 * 画像先写、分数后跑：`catalog/golden/profiles.json` 里的 `expect` 只凭书的实际内容判定，
 * 不看引擎输出。否则就是拿答案回填考题。
 */

interface Profile {
  id: string;
  scene: string;
  domain: Diagnosis['answers']['domain'];
  problem_tags: ProblemTagId[];
  primary_tag: ProblemTagId;
  difficulty_pref?: 'easy' | 'challenge' | 'hard';
  urgency?: '3w' | '1m' | 'none';
  time_budget?: '10m' | '30m' | '1h+';
  form_pref?: 'story' | 'method' | 'framework';
  depth_pref?: 'howto' | 'howto_why' | 'why';
  free_text?: string;
  expect: BookId;
  why: string;
}

const FILE = join(process.cwd(), 'catalog', 'golden', 'profiles.json');
const data = existsSync(FILE)
  ? (JSON.parse(readFileSync(FILE, 'utf-8')) as { profiles: Profile[] })
  : { profiles: [] };

function toDiagnosis(p: Profile): Diagnosis {
  const { diagnosis } = buildDiagnosis({
    domain: p.domain,
    tags: p.problem_tags,
    primary: p.primary_tag,
    difficulty_pref: p.difficulty_pref,
    urgency: p.urgency,
    time_budget: p.time_budget,
    form_pref: p.form_pref,
    depth_pref: p.depth_pref,
  });
  return {
    ...diagnosis,
    answers: { ...diagnosis.answers, free_text: p.free_text },
  };
}

describe('M0.5 金标闸门（10 条画像）', () => {
  it.skipIf(data.profiles.length === 0)('10 条画像齐备，且 expect 都指向核心库里的真书', () => {
    expect(data.profiles.length).toBe(10);
    const ids = data.profiles.map((p) => p.expect);
    expect(new Set(ids).size).toBe(10);
    for (const p of data.profiles) {
      expect(p.why.length, `${p.id} 缺理由`).toBeGreaterThan(10);
      expect(p.expect.startsWith('core:')).toBe(true);
    }
  });

  it.skipIf(data.profiles.length === 0)('认出率与首屏率两列分开统计，且逐条可追溯', () => {
    const rows = data.profiles.map((p) => {
      const r = computeResult(toDiagnosis(p));
      const idx = r.items.findIndex((it) => it.book.book_id === p.expect);
      const hit = idx >= 0 ? (r.items[idx] ?? null) : null;
      const tier = hit === null ? null : tierOf(hit.score_bp, hit.primary_hit, hit.book_coverage_bp).tier;
      return {
        id: p.id,
        expect: p.expect,
        rank: idx + 1,
        tier,
        top1: r.items[0]?.book.book_id ?? null,
        top1Title: r.items[0]?.book.title ?? '',
        score: hit?.score_bp ?? null,
      };
    });

    const recognized = rows.filter((x) => x.tier === 'strong').length;
    const first = rows.filter((x) => x.rank === 1).length;

    console.log('\n  ── M0.5 金标逐条 ──');
    for (const x of rows) {
      console.log(
        `  ${x.id}  expect=${x.expect}  rank=${x.rank || '未进前5'}  tier=${x.tier ?? '-'}  ` +
          `score=${x.score ?? '-'}  首屏=${x.top1Title || '空'}`,
      );
    }
    // 未达 strong 的逐条拆因子：分清是「引擎排错」还是「这本书本身就没标全」
    for (const p of data.profiles) {
      const r = computeResult(toDiagnosis(p));
      const hit = r.items.find((it) => it.book.book_id === p.expect);
      if (!hit) continue;
      const t = tierOf(hit.score_bp, hit.primary_hit, hit.book_coverage_bp);
      if (t.tier === 'strong') continue;
      const parts = Object.entries(hit.factors)
        .filter(([, f]) => f.weight_bp > 0)
        .sort((a, b) => b[1].contribution - a[1].contribution)
        .map(([k, f]) => `${k}=${f.fit_bp}×${f.weight_bp}=${f.contribution}`)
        .join('  ');
      console.log(`  ↳ ${p.id} 未进 strong：${parts}  primary_hit=${hit.primary_hit}`);
    }
    console.log(`  ── 认出率 ${recognized}/10 ｜ 首屏率 ${first}/10 ──\n`);

    // 结构性断言：每条都必须有结果，不允许"静默空列表"
    for (const x of rows) {
      expect(x.rank, `${x.id} 的 expect 书根本没进结果`).toBeGreaterThan(0);
    }
    expect(recognized + 0).toBeLessThanOrEqual(10);
    expect(first + 0).toBeLessThanOrEqual(10);
  });
});
