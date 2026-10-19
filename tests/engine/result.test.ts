import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { BookId } from '@/contracts/enums.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { computeResult, echoPhrases, hasCrisisSignal } from '@/engine/result.js';

/** 结果计算层（engine/result.ts）：危机信号、三组归堆、库外补充。 */

function workDiagnosis(): Diagnosis {
  const { diagnosis } = buildDiagnosis({
    domain: 'work',
    tags: ['speaking-block', 'evaluation-anxiety'],
    primary: 'speaking-block',
    difficulty_pref: 'challenge',
    urgency: '1m',
  });
  return diagnosis;
}

describe('computeResult', () => {
  it('work 域主诉 → 种子库里出结果，且都被排过序', () => {
    const r = computeResult(workDiagnosis());
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(5);
    // 6 级链：分数非升序不存在
    for (let i = 1; i < r.items.length; i += 1) {
      expect(r.items[i]!.score_bp).toBeLessThanOrEqual(r.items[i - 1]!.score_bp);
    }
  });

  it('主诉含 speaking-block 时，关键对话或被讨厌的勇气应在结果里', () => {
    const r = computeResult(workDiagnosis());
    const ids = r.items.map((i) => i.book.book_id);
    expect(ids.some((id) => id === 'core:000001' || id === 'core:000003')).toBe(true);
  });

  it('困难度覆写生效：easy 后结果里没有 difficulty > 2 的书', () => {
    const r = computeResult(workDiagnosis(), { difficulty_pref: 'easy' });
    expect(r.items.every((i) => i.book.difficulty <= 2)).toBe(true);
  });
});

describe('hasCrisisSignal（P0-17 互斥）', () => {
  it('自由文本含危机词 → true', () => {
    const d = workDiagnosis();
    d.answers.free_text = '最近压力太大，甚至想过自杀';
    expect(hasCrisisSignal(d)).toBe(true);
  });

  it('普通文本 → false', () => {
    expect(hasCrisisSignal(workDiagnosis())).toBe(false);
  });
});

describe('echoPhrases', () => {
  it('逐字回显原词，主诉在前', () => {
    const d = workDiagnosis();
    const echoes = echoPhrases(d);
    expect(echoes[0]).toEqual({ phrase: '开会发言就紧张空白', isPrimary: true });
    expect(echoes[1]).toEqual({ phrase: '特别怕被评价、被挑错', isPrimary: false });
  });
});

describe('L4：排除全部书目 → 空结果 + 库外兜底', () => {
  it('全部排除后 items 为空，external 仍有建议（不凑数、不空手）', () => {
    const d = workDiagnosis();
    d.excluded_book_ids = SEED_BOOKS.map((b) => b.book_id) as BookId[];
    const r = computeResult(d);
    expect(r.items).toHaveLength(0);
    expect(r.external.length).toBeGreaterThan(0);
    for (const s of r.external) {
      expect(s.badge).toBe('未入库');
    }
  });
});
