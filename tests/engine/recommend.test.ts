import { describe, expect, it } from 'vitest';
import { makeBook } from '../fixtures/make-book.js';
import { makeDiagnosis } from '../fixtures/make-diagnosis.js';
import { userTags } from '../helpers.js';
import { recommend, TARGET_COUNT } from '@/engine/recommend.js';
import { OUT_OF_LIBRARY_BADGE } from '@/domain/outOfLibrary.js';
import type { ExternalSuggestion } from '@/contracts/external.js';
import type { ThemeTagId } from '@/contracts/enums.js';

const TAGS = ['speaking-block', 'evaluation-anxiety', 'rumination'] as const;

const diagnosis = makeDiagnosis({
  domain: 'work',
  problem_tags: [...TAGS],
  primary_tag: 'speaking-block',
  time_budget: '30m',
  difficulty_pref: 'challenge',
  urgency: '1m',
  form_pref: 'method',
  depth_pref: 'howto_why',
});

const external: ExternalSuggestion[] = [
  {
    kind: 'external_suggestion',
    title: '沟通的方法',
    author_display: ['脱不花'],
    domain: 'work',
    tags: ['public-speaking'],
    reason: '它把开会话术拆成可照搬的句式，适合先解决"开口"这一件事。',
    where_to_find: '公共图书馆或任意书店',
    badge: OUT_OF_LIBRARY_BADGE,
  },
  {
    kind: 'external_suggestion',
    title: '内向者沟通课',
    author_display: ['佚名'],
    domain: 'work',
    tags: ['public-speaking'],
    reason: '专门写给在会议上不敢开口的人，给的是练的步骤而不是道理。',
    where_to_find: '公共图书馆',
    badge: OUT_OF_LIBRARY_BADGE,
  },
  {
    kind: 'external_suggestion',
    title: '所谓会说话，就是会换位思考',
    author_display: ['佚名'],
    domain: 'work',
    tags: ['public-speaking', 'conflict'],
    reason: '从"对方想听什么"倒推该说什么，适合一开口就卡住的人。',
    where_to_find: '公共图书馆',
    badge: OUT_OF_LIBRARY_BADGE,
  },
];

const EXTERNAL_TAGS: readonly ThemeTagId[] = ['public-speaking'];

function books(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeBook({
      book_id: `core:${String(i + 1).padStart(6, '0')}`,
      problem_tags: [{ tag: 'speaking-block', weight: 0.9 }],
      difficulty: ((i % 3) + 1) as 1,
      length_class: ((i % 3) + 1) as 1,
      est_reading_hours: 2 + i,
    }),
  );
}

describe('主链路（SPEC §6.3 ①②③ + 库外兜底）', () => {
  it('库内够 5 本时不动用库外', () => {
    const r = recommend({
      books: books(12),
      diagnosis,
      userTags: userTags(TAGS),
      externalCandidates: external,
      externalTags: EXTERNAL_TAGS,
    });
    expect(r.items).toHaveLength(TARGET_COUNT);
    expect(r.external).toEqual([]);
    expect(r.topped_up_by_external).toBe(false);
  });

  it('库内不足时，用库外补齐到 5 条 —— 推荐数量不受书库规模限制', () => {
    const r = recommend({
      books: books(2),
      diagnosis,
      userTags: userTags(TAGS),
      externalCandidates: external,
      externalTags: EXTERNAL_TAGS,
    });
    expect(r.items).toHaveLength(2);
    expect(r.external).toHaveLength(3);
    expect(r.items.length + r.external.length).toBe(TARGET_COUNT);
    expect(r.topped_up_by_external).toBe(true);
    for (const e of r.external) expect(e.badge).toBe('未入库');
  });

  it('库外建议不混进 items（它们没有分数，混排等于让凭空的数和真分数比大小）', () => {
    const r = recommend({
      books: books(1),
      diagnosis,
      userTags: userTags(TAGS),
      externalCandidates: external,
      externalTags: EXTERNAL_TAGS,
    });
    for (const it of r.items) expect(it.book.book_id).toMatch(/^core:/);
    for (const e of r.external) expect(e.kind).toBe('external_suggestion');
  });

  it('被硬过滤的书进 filtered，不进 items', () => {
    const pool = [
      ...books(2),
      makeBook({ book_id: 'core:000099', difficulty: 5, problem_tags: [{ tag: 'speaking-block', weight: 0.9 }] }),
    ];
    const r = recommend({
      books: pool,
      diagnosis,
      userTags: userTags(TAGS),
      externalCandidates: external,
      externalTags: EXTERNAL_TAGS,
    });
    expect(r.filtered.map((f) => f.code)).toContain('EX-difficulty');
    expect(r.items.map((i) => i.book.book_id)).not.toContain('core:000099');
  });

  it('库外候选也不足时，总数可以少于 5 —— 不为了凑数伪造，如实少给', () => {
    const r = recommend({
      books: books(2),
      diagnosis,
      userTags: userTags(TAGS),
      externalCandidates: [external[0] as ExternalSuggestion],
      externalTags: EXTERNAL_TAGS,
    });
    expect(r.items.length + r.external.length).toBe(3);
    expect(r.topped_up_by_external).toBe(true);
  });

  it('库内库外都没有时不报错，external 为空', () => {
    const r = recommend({
      books: [],
      diagnosis,
      userTags: userTags(TAGS),
      externalCandidates: [],
      externalTags: [],
    });
    expect(r.items).toEqual([]);
    expect(r.external).toEqual([]);
  });

  it('同输入两次调用结果一致', () => {
    const input = {
      books: books(6),
      diagnosis,
      userTags: userTags(TAGS),
      externalCandidates: external,
      externalTags: EXTERNAL_TAGS,
    };
    const a = recommend(input);
    const b = recommend(input);
    expect(a.items.map((i) => `${i.book.book_id}:${i.score_bp}`)).toEqual(
      b.items.map((i) => `${i.book.book_id}:${i.score_bp}`),
    );
  });
});
