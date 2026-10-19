import { describe, expect, it } from 'vitest';
import { makeBook } from '../fixtures/make-book.js';
import { makeDiagnosis } from '../fixtures/make-diagnosis.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import { FILTER_RULES, hardFilter, type FilterContext } from '@/domain/scoring/filters.js';
import type { BookId, ContentWarning, ProblemDomain } from '@/contracts/enums.js';

function ctx(over: {
  domain?: ProblemDomain;
  difficulty_pref?: 'easy' | 'challenge' | 'hard';
  include_heavy?: boolean;
  excluded?: BookId[];
} = {}): FilterContext {
  const d = makeDiagnosis({
    domain: over.domain ?? 'emotion',
    difficulty_pref: over.difficulty_pref ?? 'easy',
  });
  return {
    domain: d.answers.domain,
    targets: deriveTargets(d),
    include_heavy: over.include_heavy ?? false,
    excluded: new Set(over.excluded ?? []),
  };
}

const warned = (...w: ContentWarning[]) => makeBook({ book_id: 'core:000010', content_warning: w });

describe('硬过滤（SPEC §6.3 ①）', () => {
  it('码表恰好 7 条且不重复 —— 数条目，不数关键词', () => {
    expect(FILTER_RULES).toHaveLength(7);
    const codes = FILTER_RULES.map((r) => r.code);
    expect(new Set(codes).size).toBe(7);
    expect(codes.sort()).toEqual(
      [
        'EX-difficulty',
        'EX-load',
        'EX-terminal',
        'EX-trauma',
        'excluded-by-user',
        'metadata-only',
        'no-problem-tags',
      ].sort(),
    );
  });

  it('EX-difficulty：difficulty > cap', () => {
    expect(hardFilter(makeBook({ book_id: 'core:000011', difficulty: 5 }), ctx())).toBe(
      'EX-difficulty',
    );
    expect(hardFilter(makeBook({ book_id: 'core:000011', difficulty: 2 }), ctx())).toBeNull();
    // 选「不怕难」时 cap = 5，同一本不该被剔
    expect(
      hardFilter(makeBook({ book_id: 'core:000011', difficulty: 5 }), ctx({ difficulty_pref: 'hard' })),
    ).toBeNull();
  });

  it('EX-load：entry_level ≥ 4 且越轻松', () => {
    expect(hardFilter(makeBook({ book_id: 'core:000012', entry_level: 4 }), ctx())).toBe('EX-load');
    expect(hardFilter(makeBook({ book_id: 'core:000012', entry_level: 3 }), ctx())).toBeNull();
    expect(
      hardFilter(
        makeBook({ book_id: 'core:000012', entry_level: 4 }),
        ctx({ difficulty_pref: 'challenge' }),
      ),
    ).toBeNull();
  });

  it('EX-trauma：自杀 / 性暴力 × 情绪与自我 × 越轻松，且不可豁免', () => {
    const c = ctx();
    expect(hardFilter(warned('suicide'), c)).toBe('EX-trauma');
    expect(hardFilter(warned('sexual_abuse'), c)).toBe('EX-trauma');
    // include_heavy 只豁免 EX-terminal
    expect(hardFilter(warned('suicide'), ctx({ include_heavy: true }))).toBe('EX-trauma');
    // 域不对不剔（人生转折里的人是在找这些书）
    expect(hardFilter(warned('suicide'), ctx({ domain: 'transition' }))).toBeNull();
    // 没选「越轻松」不剔
    expect(hardFilter(warned('suicide'), ctx({ difficulty_pref: 'hard' }))).toBeNull();
  });

  it('EX-terminal：丧亲 / 临终 × 情绪与自我 × 越轻松 × include_heavy=false', () => {
    const c = ctx();
    expect(hardFilter(warned('grief'), c)).toBe('EX-terminal');
    expect(hardFilter(warned('terminal_illness'), c)).toBe('EX-terminal');
    expect(hardFilter(warned('grief'), ctx({ include_heavy: true }))).toBeNull();
    expect(hardFilter(warned('grief'), ctx({ domain: 'transition' }))).toBeNull();
  });

  it('EX-terminal 不误伤 EX-trauma 之外的值（violence / addiction 不触发任何规则）', () => {
    expect(hardFilter(warned('violence'), ctx())).toBeNull();
    expect(hardFilter(warned('addiction'), ctx())).toBeNull();
    expect(hardFilter(warned('eating_disorder'), ctx())).toBeNull();
  });

  it('no-problem-tags / excluded-by-user / metadata-only', () => {
    expect(hardFilter(makeBook({ book_id: 'core:000013', problem_tags: [] }), ctx())).toBe(
      'no-problem-tags',
    );
    expect(hardFilter(makeBook({ book_id: 'core:000013', problem_tags: undefined }), ctx())).toBe(
      'no-problem-tags',
    );
    expect(
      hardFilter(makeBook({ book_id: 'core:000014' }), ctx({ excluded: ['core:000014'] })),
    ).toBe('excluded-by-user');
    expect(
      hardFilter(makeBook({ book_id: 'core:000015', content_ready: 'readable' }), ctx()),
    ).toBe('metadata-only');
  });

  it('干净的书通过（null）', () => {
    expect(hardFilter(makeBook({ book_id: 'core:000016' }), ctx())).toBeNull();
  });
});
