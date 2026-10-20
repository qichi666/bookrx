import { describe, expect, it } from 'vitest';
import { makeBook } from '../fixtures/make-book.js';
import { makeDiagnosis } from '../fixtures/make-diagnosis.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import { FILTER_RULES, hardFilter, type FilterContext } from '@/domain/scoring/filters.js';
import { SENSITIVE_RULES } from '@/domain/scoring/sensitive.js';
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

/**
 * 这一组是新增的：敏感过滤从「写死两个 if、只在情绪域生效」改成「按域读规则表」。
 *
 * 改之前的具体漏洞：一个刚失去亲人、在**关系**域里选了「越轻松越好」的用户，
 * 会拿到一本通篇讲丧亲的书。当时的代码没错，错的是保护范围只画了一个域。
 */
describe('敏感过滤按域生效（数据驱动）', () => {
  it('关系域：选了「越轻松」时排除哀伤/临终题材', () => {
    expect(hardFilter(warned('grief'), ctx({ domain: 'relationship' }))).toBe('EX-terminal');
    expect(hardFilter(warned('terminal_illness'), ctx({ domain: 'relationship' }))).toBe(
      'EX-terminal',
    );
  });

  it('关系域：创伤题材不可豁免（开关只承诺了「沉重」）', () => {
    expect(
      hardFilter(warned('suicide'), ctx({ domain: 'relationship', include_heavy: true })),
    ).toBe('EX-trauma');
  });

  it('关系域：选了「最难也要读」时不剔除（只在"越轻松"这个前提下保护）', () => {
    const c = ctx({ domain: 'relationship', difficulty_pref: 'hard' });
    expect(c.targets.load).not.toBe(25);
    expect(hardFilter(warned('grief'), c)).toBeNull();
  });

  it('人生转折仍然不剔除 —— 那一域的书大量以丧失为主题，剔了就一本不剩', () => {
    expect(hardFilter(warned('grief'), ctx({ domain: 'transition' }))).toBeNull();
    expect(hardFilter(warned('suicide'), ctx({ domain: 'transition' }))).toBeNull();
  });

  it('规则表里每条都指向码表里存在的过滤码（防新增规则时写错码）', () => {
    const known = new Set(FILTER_RULES.map((r) => r.code));
    for (const rule of SENSITIVE_RULES) {
      expect(known.has(rule.code), `${rule.domain} 的 ${rule.code} 不在码表里`).toBe(true);
      expect(rule.rationale.length, `${rule.domain}/${rule.code} 没写理由`).toBeGreaterThan(10);
    }
  });

  it('创伤类规则一律不可豁免（开关文案没有承诺过它）', () => {
    for (const rule of SENSITIVE_RULES) {
      if (rule.code === 'EX-trauma') expect(rule.waivable).toBe(false);
    }
  });
});
