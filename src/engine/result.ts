import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import { DOMAIN_THEME_TAGS } from '@/data/quiz.js';
import { EXTERNAL_SEEDS } from '@/data/external-seeds.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { userTagsOf } from './diagnose.js';
import { recommend } from './recommend.js';

/**
 * 结果页计算层（保持纯函数，供 E 步滑杆重算与单测复用）。
 * 派生在此发生：诊断只存用户选择，难度上限 / 各因子 target 都由 answers 现算。
 */

/** E 步调参的覆写位：只覆写 answers，need_tags 等不动。 */
export type AnswerOverrides = Partial<Diagnosis['answers']>;

/**
 * 危机信号词（P0-17：危机资源条与推荐结果互斥）。
 * 命中即展示危机资源、隐藏推荐列表——宁可误报，不可漏报。
 *
 * 这批词是**互斥开关**，不是"情绪词表"：`活着没意思` 这类说法在口语里
 * 经常是半句玩笑，但漏报的代价和误报完全不对称——误报只是少看 5 本书，
 * 漏报是把一个正在悬崖边的人推给"推荐书目"。
 */
export const CRISIS_KEYWORDS: readonly string[] = [
  '自杀',
  '轻生',
  '不想活',
  '活不下去',
  '自残',
  '自伤',
  '伤害自己',
  '结束生命',
  '活着没意思',
  '活着没意义',
  '不如死了',
  '死了算了',
  '跳下去',
];

export function hasCrisisSignal(diagnosis: Diagnosis): boolean {
  const text = diagnosis.answers.free_text ?? '';
  return CRISIS_KEYWORDS.some((k) => text.includes(k));
}

export interface ComputedResult {
  diagnosis: Diagnosis;
  /** recommend() 的 items（已按 6 级链排序、截到 5） */
  items: ReturnType<typeof recommend>['items'];
  filtered: ReturnType<typeof recommend>['filtered'];
  external: ReturnType<typeof recommend>['external'];
  toppedUp: boolean;
}

export function computeResult(diagnosis: Diagnosis, overrides: AnswerOverrides = {}): ComputedResult {
  const effective: Diagnosis = { ...diagnosis, answers: { ...diagnosis.answers, ...overrides } };
  const r = recommend({
    books: SEED_BOOKS,
    diagnosis: effective,
    userTags: userTagsOf(effective),
    externalCandidates: EXTERNAL_SEEDS,
    externalTags: DOMAIN_THEME_TAGS[effective.answers.domain],
  });
  return {
    diagnosis: effective,
    items: r.items,
    filtered: r.filtered,
    external: r.external,
    toppedUp: r.topped_up_by_external,
  };
}

/** 诊断摘要条用的原词回显（按 need_tags 顺序，主诉在前）。 */
export function echoPhrases(diagnosis: Diagnosis): Array<{ phrase: string; isPrimary: boolean }> {
  return diagnosis.need_tags.map((n) => ({
    phrase: n.user_phrase,
    isPrimary: n.tag === (diagnosis.answers.primary_tag as ProblemTagId),
  }));
}
