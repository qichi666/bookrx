import type { Diagnosis, NeedTag } from '@/contracts/diagnosis.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import { FREE_TEXT_KEYWORDS } from '@/data/free-text-keywords.js';
import { TAG_OPTIONS } from '@/data/quiz.js';

/**
 * 问卷答案 → `Diagnosis`（SPEC §5.2.1）。
 *
 * **只存用户的选择，不存派生值**：难度上限、时长预算、各因子 target 一律运行时
 * 从 `answers` 算（`deriveTargets`）。存派生值会出现「规则改了、老记录还按老规则」
 * 的分叉，而且它不报错。
 */

export const NEED_TAG_WEIGHTS = [0.6, 0.25, 0.15] as const;

/** `need_tags` 上限（契约：超出按权重截断）。 */
export const NEED_TAG_LIMIT = 6;

/** 第 2 屏答案。多选时必须显式追问主诉，否则抛错（`primary_source` 不允许 'order'）。 */
export interface QuizAnswers {
  domain: Diagnosis['answers']['domain'];
  tags: ProblemTagId[];
  primary: ProblemTagId;
  time_budget?: '10m' | '30m' | '1h+';
  difficulty_pref?: 'easy' | 'challenge' | 'hard';
  urgency?: '3w' | '1m' | 'none';
  form_pref?: 'story' | 'method' | 'framework';
  depth_pref?: 'howto' | 'howto_why' | 'why';
  include_heavy?: boolean;
  free_text?: string;
}

/** tag → 用户原词（选项 label）。 */
function labelOf(tag: ProblemTagId): string {
  for (const group of Object.values(TAG_OPTIONS)) {
    const hit = group.find((o) => o.tag === tag);
    if (hit) return hit.label;
  }
  throw new Error(`词典里没有标签 ${tag} 的选项文案 —— data/quiz.ts 与合同层脱节`);
}

/** 自由文本命中：返回 [tag, 命中片段] 列表。一次命中即止，不重复计。 */
export function matchFreeText(text: string): Array<{ tag: ProblemTagId; phrase: string }> {
  const hits: Array<{ tag: ProblemTagId; phrase: string }> = [];
  for (const [tag, keywords] of Object.entries(FREE_TEXT_KEYWORDS) as Array<[ProblemTagId, readonly string[]]>) {
    const kw = keywords.find((k) => text.includes(k));
    if (kw) hits.push({ tag, phrase: kw });
  }
  return hits;
}

/** 组装诊断记录与打分用的 userTags（权重 ×10000 转基点）。 */export function buildDiagnosis(a: QuizAnswers): { diagnosis: Diagnosis; userTags: Map<ProblemTagId, number> } {
  if (a.tags.length === 0) throw new Error('第 2 屏至少选 1 项');
  if (a.tags.length > 1 && !a.tags.includes(a.primary)) {
    throw new Error('多选时主诉必须是所选标签之一 —— 主诉由用户显式指定，不按选择顺序猜');
  }

  const need: NeedTag[] = [];
  /** 契约：命中已有标签取 max(现有, 0.6)（不叠加）；命中新标签给 0.15。 */
  const hitByFreeText = (tag: ProblemTagId, phrase: string): void => {
    const existing = need.find((n) => n.tag === tag);
    if (existing) {
      existing.weight = Math.max(existing.weight, 0.6);
      return;
    }
    need.push({ tag, weight: 0.15, source: 'free_text', user_phrase: phrase });
  };

  a.tags.slice(0, 3).forEach((tag, i) => {
    need.push({ tag, weight: NEED_TAG_WEIGHTS[i] as number, source: 'option', user_phrase: labelOf(tag) });
  });

  if (a.free_text && a.free_text.trim().length > 0) {
    for (const { tag, phrase } of matchFreeText(a.free_text)) {
      hitByFreeText(tag, phrase);
    }
  }

  // 超出 6 项按权重截断（稳定序：权重降序 → tag 升序，保证确定性）
  const truncated = [...need]
    .sort((x, y) => y.weight - x.weight || (x.tag < y.tag ? -1 : x.tag > y.tag ? 1 : 0))
    .slice(0, NEED_TAG_LIMIT);

  const diagnosis: Diagnosis = {
    diagnosis_id: `dx:${Date.now().toString(36)}:${Math.floor(Math.random() * 1e6).toString(36)}`,
    created_at: Date.now(),
    answers: {
      domain: a.domain,
      problem_tags: a.tags.slice(0, 3),
      primary_tag: a.primary,
      primary_source: a.tags.length === 1 ? 'single' : 'explicit',
    },
    need_tags: truncated,
    include_heavy: a.include_heavy ?? false,
    excluded_book_ids: [],
  };

  const userTags = new Map<ProblemTagId, number>(
    truncated.map((n) => [n.tag, Math.round(n.weight * 10000)]),
  );

  return { diagnosis, userTags };
}

/** 从已落库的诊断复算打分侧 userTags（结果页 / 调参重算共用）。 */
export function userTagsOf(d: Diagnosis): Map<ProblemTagId, number> {
  return new Map(d.need_tags.map((n) => [n.tag, Math.round(n.weight * 10000)]));
}
