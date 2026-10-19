import { describe, expect, it } from 'vitest';
import { makeBook } from '../fixtures/make-book.js';
import { compareScored, rankBooks } from '@/domain/scoring/rank.js';
import type { ScoredBook } from '@/domain/scoring/score.js';
import type { Availability, BookId, FactorId } from '@/contracts/enums.js';
import type { FactorFit } from '@/contracts/recommendation.js';

const ZERO: FactorFit = { fit_bp: 0, weight_bp: 0, contribution: 0 };

function mk(over: {
  book_id: BookId;
  score_bp?: number;
  problem_fit?: number;
  difficulty_fit?: number;
  availability?: Availability;
  hours?: number;
}): ScoredBook {
  const factors = {} as Record<FactorId, FactorFit>;
  factors.problem = { ...ZERO, fit_bp: over.problem_fit ?? 0 };
  factors.difficulty = { ...ZERO, fit_bp: over.difficulty_fit ?? 0 };
  for (const id of ['depth', 'form', 'length', 'readability', 'availability'] as FactorId[]) {
    if (!factors[id]) factors[id] = { ...ZERO };
  }
  return {
    book: makeBook({
      book_id: over.book_id,
      availability: over.availability ?? 'bring_your_own',
      est_reading_hours: over.hours ?? 4,
    }),
    score_bp: over.score_bp ?? 0,
    primary_hit: 0,
    factors,
    weights_used: {} as Record<FactorId, number>,
  };
}

describe('6 级 tie-break 全序链（SPEC §6.3 ③）', () => {
  it('第 1 级：score_bp 降序', () => {
    expect(compareScored(mk({ book_id: 'core:000001', score_bp: 900 }), mk({ book_id: 'core:000002', score_bp: 800 }))).toBeLessThan(0);
  });

  it('第 2 级：score 打平比 problem.fit 降序', () => {
    const a = mk({ book_id: 'core:000001', score_bp: 500, problem_fit: 8500 });
    const b = mk({ book_id: 'core:000002', score_bp: 500, problem_fit: 6000 });
    expect(compareScored(a, b)).toBeLessThan(0);
    expect(compareScored(b, a)).toBeGreaterThan(0);
  });

  it('第 3 级：problem.fit 也打平比 difficulty.fit 降序', () => {
    const a = mk({ book_id: 'core:000001', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000 });
    const b = mk({ book_id: 'core:000002', score_bp: 500, problem_fit: 8500, difficulty_fit: 7500 });
    expect(compareScored(a, b)).toBeLessThan(0);
  });

  it('第 4 级：availability 升序（inline 最前）', () => {
    const a = mk({ book_id: 'core:000001', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000, availability: 'inline' });
    const b = mk({ book_id: 'core:000002', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000, availability: 'external' });
    expect(compareScored(a, b)).toBeLessThan(0);
    const c = mk({ book_id: 'core:000003', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000, availability: 'bring_your_own' });
    expect(compareScored(c, b)).toBeLessThan(0);
    expect(compareScored(a, c)).toBeLessThan(0);
  });

  it('第 5 级：est_reading_hours 升序（短的在前）', () => {
    const a = mk({ book_id: 'core:000001', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000, availability: 'inline', hours: 2.5 });
    const b = mk({ book_id: 'core:000002', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000, availability: 'inline', hours: 5 });
    expect(compareScored(a, b)).toBeLessThan(0);
  });

  it('第 6 级：book_id 升序 —— 保证全序，不依赖 sort 稳定性', () => {
    const a = mk({ book_id: 'core:000001', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000, availability: 'inline', hours: 2.5 });
    const b = mk({ book_id: 'core:000002', score_bp: 500, problem_fit: 8500, difficulty_fit: 10000, availability: 'inline', hours: 2.5 });
    expect(compareScored(a, b)).toBeLessThan(0);
    expect(compareScored(b, a)).toBeGreaterThan(0);
    // 完全相同的两个对象必须判等，否则 sort 结果不稳定
    expect(compareScored(a, { ...a })).toBe(0);
  });

  it('rankBooks 不修改入参，且输出按链有序', () => {
    const list = [
      mk({ book_id: 'core:000003', score_bp: 100 }),
      mk({ book_id: 'core:000001', score_bp: 900 }),
      mk({ book_id: 'core:000002', score_bp: 500 }),
    ];
    const snapshot = list.map((s) => s.book.book_id);
    const out = rankBooks(list);
    expect(out.map((s) => s.book.book_id)).toEqual(['core:000001', 'core:000002', 'core:000003']);
    expect(list.map((s) => s.book.book_id)).toEqual(snapshot);
  });
});
