import { describe, expect, it } from 'vitest';
import { makeBook } from '../fixtures/make-book.js';
import { makeDiagnosis } from '../fixtures/make-diagnosis.js';
import {
  PRIMARY_WEIGHT,
  SECOND_WEIGHT,
  THIRD_WEIGHT,
  primaryOf,
  scoreOne,
  shuffle,
} from '../helpers.js';
import { hardFilter, type FilterContext } from '@/domain/scoring/filters.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import { tierOf } from '@/domain/scoring/tier.js';
import { compareScored } from '@/domain/scoring/rank.js';
import { assertContributionSum, scoreBook } from '@/domain/scoring/score.js';
import type { ProblemTagId } from '@/contracts/enums.js';

/**
 * `ARCH §3.9` 的完整算例。**它锁的不是"这几个数字"，而是三档齐全这个性质** ——
 * 只出现一档的算例证明不了分档器在工作。
 *
 * 分数按 `SPEC §6.2` 的 `readability` 公式重算过：§3.9 表格里的
 * 9430 / 7925 / 6975 / 6545 用的是未修正方向（`target = 1 + 4×紧迫度/100`），
 * 而 SPEC 明写 `1 + 4×(100 − 紧迫度)/100` 且「方向不能反」。
 * 本算例 3-c 选「不着急」（紧迫度 25）→ target = 4 → 四本各 −350：
 * **9080 / 7575 / 6625 / 6195**，与 §3.9 留档第 3 条给出的数字一致。
 */

const diagnosis = makeDiagnosis({
  domain: 'work',
  problem_tags: ['speaking-block', 'evaluation-anxiety', 'rumination'],
  primary_tag: 'speaking-block',
  time_budget: '10m',
  difficulty_pref: 'easy',
  urgency: 'none',
  form_pref: 'method',
  depth_pref: 'howto_why',
});
const TAGS = ['speaking-block', 'evaluation-anxiety', 'rumination'] as const;

const A = makeBook({
  book_id: 'core:000001',
  title: '被讨厌的勇气',
  category_l1: 'psychology',
  problem_tags: [
    { tag: 'speaking-block', weight: 0.9 },
    { tag: 'evaluation-anxiety', weight: 0.9 },
  ],
  difficulty: 2,
  prose_accessibility: 2,
  depth: 'howto_why',
  form: 'method',
  length_class: 2,
  est_reading_hours: 2.5,
  availability: 'inline',
});
const B = makeBook({
  book_id: 'core:000002',
  title: '非暴力沟通',
  category_l1: 'psychology',
  problem_tags: [
    { tag: 'speaking-block', weight: 0.9 },
    { tag: 'evaluation-anxiety', weight: 0.5 },
  ],
  difficulty: 2,
  prose_accessibility: 2,
  depth: 'howto',
  form: 'story',
  length_class: 3,
  est_reading_hours: 5.0,
  availability: 'bring_your_own',
});
const C = makeBook({
  book_id: 'core:000003',
  title: '关键对话',
  category_l1: 'social-science',
  problem_tags: [{ tag: 'speaking-block', weight: 0.85 }],
  difficulty: 2,
  prose_accessibility: 2,
  depth: 'howto',
  form: 'story',
  length_class: 3,
  est_reading_hours: 6.0,
  availability: 'bring_your_own',
});
const D = makeBook({
  book_id: 'core:000004',
  title: '思考，快与慢',
  category_l1: 'psychology',
  problem_tags: [{ tag: 'speaking-block', weight: 0.5 }],
  difficulty: 5,
  prose_accessibility: 4,
  depth: 'why',
  form: 'framework',
  length_class: 4,
  est_reading_hours: 16.0,
  availability: 'bring_your_own',
});
const F = makeBook({
  book_id: 'core:000005',
  title: '正念的奇迹',
  category_l1: 'other',
  problem_tags: [{ tag: 'rumination', weight: 0.5 }],
  difficulty: 2,
  prose_accessibility: 2,
  depth: 'howto_why',
  form: 'method',
  length_class: 2,
  est_reading_hours: 2.0,
  availability: 'bring_your_own',
});

const ctx: FilterContext = {
  domain: diagnosis.answers.domain,
  targets: deriveTargets(diagnosis),
  include_heavy: diagnosis.include_heavy,
  excluded: new Set(diagnosis.excluded_book_ids),
};

const scoreOf = (b: Parameters<typeof scoreOne>[1]) => scoreOne(diagnosis, b, TAGS);

describe('ARCH §3.9 算例（按 SPEC §6.2 公式重算）', () => {
  it('派生目标值：difficulty 2.0、readability 4.0（不着急 → 可啃硬文字）', () => {
    const t = deriveTargets(diagnosis);
    expect(t.load).toBe(25);
    expect(t.difficulty_target).toBe(2);
    expect(t.difficulty_cap).toBe(2);
    expect(t.urgency).toBe(25);
    expect(t.readability_target).toBe(4);
    expect(t.length_target).toBe(2);
  });

  it('① D 命中 EX-difficulty 被剔除，且它的困境标签不为零', () => {
    expect(D.problem_tags?.length).toBeGreaterThan(0);
    expect(hardFilter(D, ctx)).toBe('EX-difficulty');
  });

  it('② A 的七项 contribution 之和 == 9080', () => {
    const s = scoreOf(A);
    assertContributionSum(s);
    expect(s.score_bp).toBe(9080);
    expect(s.factors.problem.contribution).toBe(3230);
    expect(s.factors.readability.contribution).toBe(350);
  });

  it('③ 三档齐全：A=strong、B/C=worth、F=explore', () => {
    const tierFor = (b: typeof A) => {
      const s = scoreOf(b);
      return tierOf(s.score_bp, s.primary_hit).tier;
    };
    expect(tierFor(A)).toBe('strong');
    expect(tierFor(B)).toBe('worth');
    expect(tierFor(C)).toBe('worth');
    expect(tierFor(F)).toBe('explore');
  });

  it('④ F：分数 6195 ≥ 6000、档位 explore、capped=true（三条同时）', () => {
    const f = scoreOf(F);
    expect(f.score_bp).toBe(6195);
    expect(f.score_bp).toBeGreaterThanOrEqual(6000);
    const v = tierOf(f.score_bp, f.primary_hit);
    expect(v.tier).toBe('explore');
    expect(v.capped_by_primary_miss).toBe(true);
  });

  it('⑤ primary_hit：A=10000、F=0', () => {
    expect(scoreOf(A).primary_hit).toBe(10000);
    expect(scoreOf(F).primary_hit).toBe(0);
  });

  it('⑥ A 与 B 的 problem.fit 相同（8500），A 排在 B 前', () => {
    const a = scoreOf(A);
    const b = scoreOf(B);
    expect(a.factors.problem.fit_bp).toBe(8500);
    expect(b.factors.problem.fit_bp).toBe(8500);
    expect(compareScored(a, b)).toBeLessThan(0);
  });

  it('⑩ 打乱输入 200 次，输出顺序完全一致', () => {
    const books = [A, B, C, F];
    const scored = books.map((b) => scoreOf(b));
    const expected = scored
      .slice()
      .sort(compareScored)
      .map((s) => s.book.book_id)
      .join(',');
    for (let seed = 1; seed <= 200; seed++) {
      const shuffled = shuffle(scored, seed).sort(compareScored);
      expect(shuffled.map((s) => s.book.book_id).join(',')).toBe(expected);
    }
    expect(expected).toBe('core:000001,core:000002,core:000003,core:000005');
  });

  it('⑪ score 打平后：problem→difficulty→availability→时长→book_id 逐级生效', () => {
    const a = scoreOf(A);
    const b = scoreOf(B);
    // 人为把 B 的分数拉平到 A
    const bTied = { ...b, score_bp: a.score_bp };
    expect(a.factors.problem.fit_bp).toBe(bTied.factors.problem.fit_bp);
    expect(a.factors.difficulty.fit_bp).toBe(bTied.factors.difficulty.fit_bp);
    expect(compareScored(a, bTied)).toBeLessThan(0); // 第 4 级：inline < bring_your_own

    // 再把 availability 拉平 → 第 5 级时长：A 2.5 < B 5.0
    const bTied2 = {
      ...bTied,
      book: { ...bTied.book, availability: 'inline' as const },
    };
    expect(compareScored(a, bTied2)).toBeLessThan(0);

    // 再把时长拉平 → 第 6 级 book_id：000001 < 000002
    const bTied3 = { ...bTied2, book: { ...bTied2.book, est_reading_hours: 2.5 } };
    expect(compareScored(a, bTied3)).toBeLessThan(0);
  });

  it('打分不依赖 userTags 的插入顺序（权重仍按主诉/次/第三绑定在标签上）', () => {
    const ws = [PRIMARY_WEIGHT, SECOND_WEIGHT, THIRD_WEIGHT] as const;
    const pairs = TAGS.map((t, i) => [t, ws[i] as number] as [ProblemTagId, number]);
    const reversed = new Map(pairs.slice().reverse());
    const direct = scoreBook(F, reversed, primaryOf(diagnosis), deriveTargets(diagnosis));
    expect(direct.score_bp).toBe(scoreOf(F).score_bp);
    expect(direct.factors.problem.fit_bp).toBe(scoreOf(F).factors.problem.fit_bp);
  });

  it('主诉换成第三标签后 problem.fit 会变（权重绑标签，不是绑位置）', () => {
    const ws = [PRIMARY_WEIGHT, SECOND_WEIGHT, THIRD_WEIGHT] as const;
    const swapped = new Map<ProblemTagId, number>([
      [TAGS[0], ws[2]],
      [TAGS[2], ws[0]],
    ]);
    const s = scoreBook(F, swapped, { tag: TAGS[2], weight: PRIMARY_WEIGHT }, deriveTargets(diagnosis));
    expect(s.factors.problem.fit_bp).not.toBe(scoreOf(F).factors.problem.fit_bp);
  });
});
