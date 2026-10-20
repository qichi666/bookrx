import { describe, expect, it } from 'vitest';
import { makeBook } from '../fixtures/make-book.js';
import { makeDiagnosis } from '../fixtures/make-diagnosis.js';
import { scoreOne, userTags, primaryOf } from '../helpers.js';
import { assertContributionSum, scoreBook } from '@/domain/scoring/score.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import {
  coverageBp,
  FULL_COVERAGE,
  PROBLEM_ONLY_COVERAGE,
  STRONG_MIN_COVERAGE_BP,
} from '@/domain/scoring/coverage.js';
import { tierOf } from '@/domain/scoring/tier.js';
import type { ProblemTagId } from '@/contracts/enums.js';

/**
 * 字段覆盖率：把「书没标过这个字段」和「这个字段标了 0」区分开。
 *
 * 核心断言只有一条，但它决定整套东西是否诚实：
 * **未覆盖的字段填任何值都不能影响分数。** 否则候选层的占位值就成了分数的一部分，
 * 等于用一个没核对过的数字参与排序。
 */

const TAGS = ['speaking-block', 'evaluation-anxiety', 'rumination'] as ProblemTagId[];

const dx = makeDiagnosis({
  domain: 'work',
  problem_tags: [...TAGS],
  primary_tag: 'speaking-block',
  time_budget: '30m',
  difficulty_pref: 'challenge',
  urgency: '1m',
  form_pref: 'method',
  depth_pref: 'howto_why',
});

function book(over: Parameters<typeof makeBook>[0]) {
  return makeBook(over);
}

describe('覆盖率口径', () => {
  it('全标 = 10000；只标困境标签 = 4300（problem 3800 + 渠道 500）', () => {
    expect(coverageBp(FULL_COVERAGE)).toBe(10000);
    expect(coverageBp(PROBLEM_ONLY_COVERAGE)).toBe(4300);
  });

  it('全标时与不传 coverage 的结果完全一致（老路径不受影响）', () => {
    const b = book({ book_id: 'core:000101' });
    const withDefault = scoreOne(dx, b, TAGS);
    const explicit = scoreBook(b, userTags(TAGS), primaryOf(dx), deriveTargets(dx), FULL_COVERAGE);
    expect(explicit).toEqual(withDefault);
    expect(explicit.book_coverage_bp).toBe(10000);
  });
});

describe('未标注字段不得参与打分', () => {
  it('只标困境标签：难度/体例/篇幅等因子权重归零，且权重仍归一 10000', () => {
    const s = scoreBook(
      book({ book_id: 'core:000102' }),
      userTags(TAGS),
      primaryOf(dx),
      deriveTargets(dx),
      PROBLEM_ONLY_COVERAGE,
    );
    for (const id of ['difficulty', 'depth', 'form', 'length', 'readability'] as const) {
      expect(s.weights_used[id], `${id} 不应分到权重`).toBe(0);
      expect(s.factors[id].fit_bp, `${id} 不应有 fit`).toBe(0);
    }
    expect(s.weights_used.problem + s.weights_used.availability).toBe(10000);
    assertContributionSum(s);
    expect(s.book_coverage_bp).toBe(4300);
  });

  it('占位值填 1 与填 5，分数必须一模一样', () => {
    const low = scoreBook(
      book({
        book_id: 'core:000103',
        difficulty: 1,
        prose_accessibility: 1,
        length_class: 1,
        depth: 'howto',
        form: 'story',
      }),
      userTags(TAGS),
      primaryOf(dx),
      deriveTargets(dx),
      PROBLEM_ONLY_COVERAGE,
    );
    const high = scoreBook(
      book({
        book_id: 'core:000103',
        difficulty: 5,
        prose_accessibility: 5,
        length_class: 4,
        depth: 'why',
        form: 'framework',
      }),
      userTags(TAGS),
      primaryOf(dx),
      deriveTargets(dx),
      PROBLEM_ONLY_COVERAGE,
    );
    expect(high.score_bp).toBe(low.score_bp);
    expect(high.primary_hit).toBe(low.primary_hit);
  });

  it('覆盖率只决定"能不能算"，不改变已覆盖因子的权重比例', () => {
    const b = book({ book_id: 'core:000104' });
    const full = scoreBook(b, userTags(TAGS), primaryOf(dx), deriveTargets(dx), FULL_COVERAGE);
    const partial = scoreBook(
      b,
      userTags(TAGS),
      primaryOf(dx),
      deriveTargets(dx),
      { ...FULL_COVERAGE, difficulty: false },
    );
    // 难度退出后，problem 的权重被按比例放大，但「谁更重要」的顺序不变
    expect(partial.weights_used.problem).toBeGreaterThan(full.weights_used.problem);
    expect(partial.weights_used.problem).toBeGreaterThan(partial.weights_used.length);
  });
});

describe('档位按覆盖率封顶', () => {
  it('覆盖率 4300 的书拿不到 strong，最高 worth，并如实标因覆盖率封顶', () => {
    const v = tierOf(9500, 9000, 4300);
    expect(v.tier).toBe('worth');
    expect(v.capped_by_low_coverage).toBe(true);
    expect(v.capped_by_primary_miss).toBe(false);
  });

  it('覆盖率 10000 的书该 strong 就 strong（回归）', () => {
    const v = tierOf(9000, 8000, 10000);
    expect(v.tier).toBe('strong');
    expect(v.capped_by_low_coverage).toBe(false);
  });

  it('主诉未命中优先于覆盖率封顶：两者都触发时报"主诉未命中"', () => {
    const v = tierOf(9000, 0, 4300);
    expect(v.tier).toBe('explore');
    expect(v.capped_by_primary_miss).toBe(true);
    expect(v.capped_by_low_coverage).toBe(false);
  });

  it('阈值常量与文档一致：6000（problem + 难度 + 深度）', () => {
    expect(STRONG_MIN_COVERAGE_BP).toBe(6000);
    expect(tierOf(9000, 8000, 5999).tier).toBe('worth');
    expect(tierOf(9000, 8000, 6000).tier).toBe('strong');
  });
});
