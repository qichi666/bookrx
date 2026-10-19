import { describe, expect, it } from 'vitest';
import { makeBook } from '../fixtures/make-book.js';
import { makeDiagnosis } from '../fixtures/make-diagnosis.js';
import { scoreOne, shuffle, userTags, primaryOf } from '../helpers.js';
import { scoreBook, assertContributionSum } from '@/domain/scoring/score.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import { FACTOR_IDS } from '@/domain/scoring/weights.js';
import { compareScored } from '@/domain/scoring/rank.js';

const TAGS = ['speaking-block', 'evaluation-anxiety', 'rumination'] as const;

const full = makeDiagnosis({
  domain: 'work',
  problem_tags: [...TAGS],
  primary_tag: 'speaking-block',
  time_budget: '30m',
  difficulty_pref: 'challenge',
  urgency: '1m',
  form_pref: 'method',
  depth_pref: 'howto_why',
});

describe('打分（SPEC §6.3 ②）', () => {
  it('contribution 之和严格等于 score_bp（硬校验）', () => {
    for (let i = 0; i < 40; i++) {
      const b = makeBook({
        book_id: `core:${String(i).padStart(6, '0')}`,
        difficulty: ((i % 5) + 1) as 1,
        prose_accessibility: (((i * 3) % 5) + 1) as 1,
        length_class: (((i * 7) % 4) + 1) as 1,
        est_reading_hours: 1 + (i % 20),
        availability: (['inline', 'bring_your_own', 'external'] as const)[i % 3],
      });
      const s = scoreOne(full, b, TAGS);
      assertContributionSum(s);
    }
  });

  it('跳答时权重仍归一到 10000，且被移除的因子 fit 为 0', () => {
    const skipped = makeDiagnosis({
      domain: 'work',
      problem_tags: [...TAGS],
      primary_tag: 'speaking-block',
      // 第 3 屏全跳
    });
    const s = scoreOne(skipped, makeBook({ book_id: 'core:000099' }), TAGS);
    const sum = FACTOR_IDS.reduce((a, id) => a + s.weights_used[id], 0);
    expect(sum).toBe(10000);
    for (const id of ['difficulty', 'readability', 'form', 'depth', 'length'] as const) {
      expect(s.factors[id].fit_bp).toBe(0);
      expect(s.factors[id].weight_bp).toBe(0);
      expect(s.factors[id].contribution).toBe(0);
    }
    expect(s.factors.problem.weight_bp).toBeGreaterThan(0);
    assertContributionSum(s);
  });

  it('七项全中的书得 10000', () => {
    const perfect = makeBook({
      book_id: 'core:000100',
      problem_tags: TAGS.map((t) => ({ tag: t, weight: 1.0 })),
      difficulty: 3, // challenge → target 3
      prose_accessibility: 3, // 紧迫度 50 → target 3
      depth: 'howto_why',
      form: 'method',
      length_class: 3, // 30m → target 3
      availability: 'inline',
    });
    const s = scoreOne(full, perfect, TAGS);
    expect(s.score_bp).toBe(10000);
    expect(s.primary_hit).toBe(10000);
  });

  it('同一输入重复 200 次结果逐字节一致', () => {
    const books = Array.from({ length: 12 }, (_, i) =>
      makeBook({
        book_id: `core:${String(200 + i).padStart(6, '0')}`,
        difficulty: ((i % 5) + 1) as 1,
        length_class: ((i % 4) + 1) as 1,
        est_reading_hours: 1 + (i % 9),
      }),
    );
    const scored = books.map((b) => scoreOne(full, b, TAGS));
    const expected = scored
      .slice()
      .sort(compareScored)
      .map((s) => `${s.book.book_id}:${s.score_bp}:${s.primary_hit}`)
      .join('|');
    for (let seed = 1; seed <= 200; seed++) {
      const out = shuffle(scored, seed).sort(compareScored);
      expect(out.map((s) => `${s.book.book_id}:${s.score_bp}:${s.primary_hit}`).join('|')).toBe(
        expected,
      );
    }
  });

  it('scoreBook 不接受隐式随机源：同参两次调用结果相等', () => {
    const b = makeBook({ book_id: 'core:000300' });
    const t = deriveTargets(full);
    const m = userTags(TAGS);
    const p = primaryOf(full);
    expect(scoreBook(b, m, p, t)).toEqual(scoreBook(b, m, p, t));
  });
});
