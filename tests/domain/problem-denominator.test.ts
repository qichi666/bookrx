import { describe, expect, it } from 'vitest';
import type { Diagnosis, NeedTag } from '@/contracts/diagnosis.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import { declaredTagsOf, userTagsOf } from '@/engine/diagnose.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import { scoreBook } from '@/domain/scoring/score.js';
import { makeBook } from '../fixtures/make-book.js';
import { makeDiagnosis } from '../fixtures/make-diagnosis.js';

/**
 * `problem` 因子的分母口径（2026-10-21 修）。
 *
 * 覆盖率口径是 `Σ min(用户, 书) / Σ 用户`。自由文本命中一个**新**标签时按 0.15
 * 追加进 `need_tags`，于是分母 1.0 → 1.15，而大多数书没有这个标签、分子不动：
 * 用户把话说得更具体，推荐的把握反而变小（实测前两本 7827/7427 → 7127/6727，
 * 固定 −700bp，卡在 6000 附近的直接 worth → explore）。
 *
 * 修法：分母只算**点选**的标签，自由文本新标签只进分子。四条不变式：
 *  ① 书没命中新标签 ⇒ 分数与"没写自由文本"**完全相同**；
 *  ② 书命中了新标签 ⇒ 分数**上升**；
 *  ③ 全中仍然是 10000（分母变小不会溢出）；
 *  ④ 不传 declaredTags 的老调用行为不变。
 */

const BASE: ProblemTagId[] = ['speaking-block', 'evaluation-anxiety'];
const ADDED: ProblemTagId = 'anxiety';

function need(tag: ProblemTagId, weight: number, source: NeedTag['source']): NeedTag {
  return { tag, weight, source, user_phrase: tag };
}

/** 问卷点选两个标签（0.6 / 0.25）；`extra` 决定要不要追加一个自由文本新标签。 */
function diagnosisWith(extra: boolean): Diagnosis {
  const d = makeDiagnosis({ domain: 'work', problem_tags: BASE, primary_tag: 'speaking-block' });
  const tags = [need(BASE[0]!, 0.6, 'option'), need(BASE[1]!, 0.25, 'option')];
  if (extra) tags.push(need(ADDED, 0.15, 'free_text'));
  return { ...d, need_tags: tags };
}

function scoreWith(d: Diagnosis, bookTags: ReadonlyArray<[ProblemTagId, number]>) {
  const book = makeBook({
    book_id: 'core:900001',
    problem_tags: bookTags.map(([tag, weight]) => ({ tag, weight })),
  });
  return scoreBook(
    book,
    userTagsOf(d),
    { tag: 'speaking-block', weight: 0.6 },
    deriveTargets(d),
    undefined,
    declaredTagsOf(d),
  );
}

/** 书只部分覆盖用户的主诉（0.4 < 0.6），否则两边都顶到 10000，看不出差异 */
const PARTIAL: ReadonlyArray<[ProblemTagId, number]> = [
  ['speaking-block', 0.4],
  ['evaluation-anxiety', 0.5],
];

describe('problem 因子：自由文本不该稀释分数', () => {
  const plain = diagnosisWith(false);
  const padded = diagnosisWith(true);

  it('前提：追加的标签 source=free_text，点选的那两份没变', () => {
    expect(padded.need_tags.filter((n) => n.source === 'free_text')).toHaveLength(1);
    expect([...declaredTagsOf(padded).keys()].sort()).toEqual([...declaredTagsOf(plain).keys()].sort());
    expect([...declaredTagsOf(padded).values()].reduce((a, b) => a + b, 0)).toBeCloseTo(0.85, 10);
  });

  it('书没命中新标签 → 分数与没写自由文本时完全相同', () => {
    const a = scoreWith(plain, PARTIAL);
    const b = scoreWith(padded, PARTIAL);
    expect(b.factors.problem.fit_bp).toBe(a.factors.problem.fit_bp);
    expect(b.score_bp).toBe(a.score_bp);
  });

  it('书命中了新标签 → 分数上升，不下降', () => {
    const a = scoreWith(plain, PARTIAL);
    const b = scoreWith(padded, [...PARTIAL, [ADDED, 0.5]]);
    expect(b.factors.problem.fit_bp).toBeGreaterThan(a.factors.problem.fit_bp);
    expect(b.score_bp).toBeGreaterThan(a.score_bp);
  });

  it('全中仍是 10000：分母变小不会让覆盖率溢出', () => {
    const s = scoreWith(padded, [
      ['speaking-block', 0.6],
      ['evaluation-anxiety', 0.25],
      [ADDED, 0.15],
    ]);
    // 分子 1.0 > 分母 0.85 → 按分母截断，恰好 10000 而不是 11764
    expect(s.factors.problem.fit_bp).toBe(10000);
  });

  it('不传 declaredTags 时保留旧口径（老调用方行为不变）', () => {
    const book = makeBook({ book_id: 'core:900002', problem_tags: [{ tag: 'speaking-block', weight: 0.9 }] });
    const legacy = scoreBook(book, userTagsOf(padded), { tag: 'speaking-block', weight: 0.6 }, deriveTargets(padded));
    // 旧口径分母含自由文本那 0.15：min(0.6, 0.9) / (0.6 + 0.25 + 0.15) = 0.6 / 1.0
    expect(legacy.factors.problem.fit_bp).toBe(6000);
  });
});
