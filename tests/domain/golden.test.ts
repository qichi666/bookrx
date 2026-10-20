import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { BookId, ProblemTagId } from '@/contracts/enums.js';
import { tierOf } from '@/domain/scoring/tier.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { computeResult } from '@/engine/result.js';

/**
 * M0.5 闸门：金标画像。**内部组与外部组分开报，不合并、不求平均。**
 *
 * 两个计数**分开报，不求平均**（SPEC §7.4）：认出率看"该给的书有没有进 strong"，
 * 首屏率看"它是不是第一个"。把两者平均会掩盖最难受的情况——书是认出来了，
 * 但被排到第 4 位，用户根本看不到。
 *
 * 画像先写、分数后跑：`expect` 只凭书的实际内容判定，不看引擎输出。
 * 否则就是拿答案回填考题。
 *
 * **外部组为什么单独一列**：内部出题、内部答题，测得再准也只证明自洽。
 * 外部组首轮**不设通过阈值**，只出基线——先看清差多少，再决定闸门开在哪。
 * 文件：`catalog/golden/external-profiles.json`（空数组 = 未采集，如实打印"未采集"）。
 */

interface Profile {
  id: string;
  author?: string;
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

const INTERNAL = join(process.cwd(), 'catalog', 'golden', 'profiles.json');
const EXTERNAL = join(process.cwd(), 'catalog', 'golden', 'external-profiles.json');

const internal = existsSync(INTERNAL)
  ? (JSON.parse(readFileSync(INTERNAL, 'utf-8')) as { profiles: Profile[] }).profiles
  : [];
const external = existsSync(EXTERNAL)
  ? (JSON.parse(readFileSync(EXTERNAL, 'utf-8')) as { profiles: Profile[] }).profiles
  : [];

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
    // 自由文本必须一起喂：画像里写了口语，就该让口语去撞第 4 屏那条链路
    free_text: p.free_text,
  });
  return diagnosis;
}

interface Row {
  id: string;
  expect: BookId;
  rank: number;
  tier: string | null;
  top1: string | null;
  score: number | null;
}

function evaluate(profiles: readonly Profile[]): { rows: Row[]; recognized: number; first: number } {
  const rows: Row[] = profiles.map((p) => {
    const r = computeResult(toDiagnosis(p));
    const idx = r.items.findIndex((it) => it.book.book_id === p.expect);
    const hit = idx >= 0 ? (r.items[idx] ?? null) : null;
    const tier =
      hit === null ? null : tierOf(hit.score_bp, hit.primary_hit, hit.book_coverage_bp).tier;
    return {
      id: p.id,
      expect: p.expect,
      rank: idx + 1,
      tier,
      top1: r.items[0]?.book.title ?? null,
      score: hit?.score_bp ?? null,
    };
  });
  return {
    rows,
    recognized: rows.filter((x) => x.tier === 'strong').length,
    first: rows.filter((x) => x.rank === 1).length,
  };
}

function report(label: string, profiles: readonly Profile[]): ReturnType<typeof evaluate> {
  const out = evaluate(profiles);
  if (profiles.length === 0) {
    console.log(`  ── ${label}：未采集（0 条）──`);
    return out;
  }
  console.log(`  ── ${label}（${profiles.length} 条）──`);
  for (const x of out.rows) {
    console.log(
      `  ${x.id}  expect=${x.expect}  rank=${x.rank || '未进前5'}  tier=${x.tier ?? '-'}  ` +
        `score=${x.score ?? '-'}  首屏=${x.top1 ?? '空'}`,
    );
  }
  console.log(
    `  ── ${label}：认出率 ${out.recognized}/${profiles.length} ｜ 首屏率 ${out.first}/${profiles.length} ──`,
  );
  return out;
}

describe('M0.5 金标闸门（内部组 10 条）', () => {
  it.skipIf(internal.length === 0)('10 条画像齐备，expect 都指向核心库里的真书', () => {
    expect(internal.length).toBe(10);
    const ids = internal.map((p) => p.expect);
    expect(new Set(ids).size).toBe(10);
    for (const p of internal) {
      expect(p.why.length, `${p.id} 缺理由`).toBeGreaterThan(10);
      expect(p.expect.startsWith('core:')).toBe(true);
    }
  });

  it.skipIf(internal.length === 0)('认出率与首屏率两列分开统计，且逐条可追溯', () => {
    const { rows, recognized, first } = report('内部组', internal);

    // 未达 strong 的逐条拆因子：分清是「引擎排错」还是「这本书本身就没标全」
    for (const p of internal) {
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

    // 结构性断言：每条都必须有结果，不允许"静默空列表"
    for (const x of rows) {
      expect(x.rank, `${x.id} 的 expect 书根本没进结果`).toBeGreaterThan(0);
    }

    // 闸门本体（SPEC §7.4）：两个计数各自 ≥7/10，不求平均。
    // 这里曾经写的是 `toBeLessThanOrEqual(10)` —— 恒真，认出率 0/10 也会通过，
    // 等于"闸门"从来没闸过门。测试全绿不代表闸门通过，这是两件事。
    expect(recognized, `认出率 ${recognized}/10 低于闸门 7/10`).toBeGreaterThanOrEqual(7);
    expect(first, `首屏率 ${first}/10 低于闸门 7/10`).toBeGreaterThanOrEqual(7);
  });
});

describe('外部金标（并行基线，不设阈值）', () => {
  it('外部组的每条都必须写 author，且不能写 internal', () => {
    for (const p of external) {
      expect(p.author, `${p.id} 缺 author`).toBeTruthy();
      expect(p.author, `${p.id} 的 author 不能是 internal（那还是内部组）`).not.toBe('internal');
    }
  });

  it('出基线数字：有就打印，没有就如实说"未采集"', () => {
    if (external.length === 0) {
      console.log(
        '  ── 外部组：未采集 ──\n' +
          '  外部金标是唯一需要非本项目人员的环节：请 2–3 位未参与标注的人各写 5 条，\n' +
          '  填进 catalog/golden/external-profiles.json。它不阻塞任何开发，但越早启动越好。',
      );
      return;
    }
    report('外部组', external);
    // 首轮只出基线，不断言阈值：先看清差多少，再决定闸门开在哪
    expect(external.length).toBeGreaterThan(0);
  });
});
