import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { DepthLevel, FormType, ProblemDomain, ProblemTagId } from '@/contracts/enums.js';

export interface DiagnosisOverrides {
  domain?: ProblemDomain;
  problem_tags?: ProblemTagId[];
  primary_tag?: ProblemTagId;
  time_budget?: '10m' | '30m' | '1h+';
  difficulty_pref?: 'easy' | 'challenge' | 'hard';
  urgency?: '3w' | '1m' | 'none';
  form_pref?: FormType;
  depth_pref?: DepthLevel;
}

/**
 * 诊断记录工厂。**只放用户的选择，不放派生值**（SPEC §5.2.1）：
 * 难度上限、各因子 target 一律由 `deriveTargets` 运行时算。
 */
export function makeDiagnosis(over: DiagnosisOverrides = {}): Diagnosis {
  const problem_tags = over.problem_tags ?? ['low-mood'];
  return {
    diagnosis_id: 'diag-test',
    created_at: 0,
    answers: {
      domain: over.domain ?? 'emotion',
      problem_tags,
      primary_tag: over.primary_tag ?? (problem_tags[0] as ProblemTagId),
      primary_source: 'single',
      time_budget: over.time_budget,
      difficulty_pref: over.difficulty_pref,
      urgency: over.urgency,
      form_pref: over.form_pref,
      depth_pref: over.depth_pref,
    },
    need_tags: [],
    include_heavy: false,
    excluded_book_ids: [],
  };
}

/**
 * 用户侧标签权重（SPEC §6.1）：主诉 0.60 / 次 0.25 / 第三 0.15。
 * 用小数而不是万分制——`problem.fit` 是比值，单位无关；
 * `ARCH §3.9` 的算例写 6000/2500/1500 只是同一组比例的另一套记法。
 */
export function userWeights(pairs: readonly [ProblemTagId, number][]): Map<ProblemTagId, number> {
  return new Map(pairs);
}
