import type { Diagnosis, NeedTag } from '@/contracts/diagnosis.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import { matchFreeText } from './free-text-match.js';
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

/**
 * 自由文本命中：实现在 `free-text-match.ts`（整串命中 → 允许插入成分 → 区间消歧）。
 * 这里只做转出，保持既有调用点（`search.ts` / 测试）不带路径变化。
 */
export { matchFreeText } from './free-text-match.js';

/**
 * 组装诊断记录与打分用的 userTags（权重 0–1，与书的 `problem_tags[].weight` 同一把尺子）。
 *
 * 这里曾经只写了 `domain / problem_tags / primary_tag / primary_source` 四个键，
 * 把第 3 屏的五个偏好和 `free_text` **全丢了**：于是线上每个用户都按"第 3 屏全跳答"
 * 打分（problem 9200 / availability 800），`hasCrisisSignal` 读的 `free_text`
 * 恒为 undefined —— 危机互斥这条 P0-17 实际上从未生效。金标评测第一次跑就暴露了它。
 */
export function buildDiagnosis(a: QuizAnswers): { diagnosis: Diagnosis; userTags: Map<ProblemTagId, number> } {
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
      // 第 3 屏与自由文本必须落库：不存 = 打分与危机互斥都拿不到用户的选择
      ...(a.time_budget === undefined ? {} : { time_budget: a.time_budget }),
      ...(a.difficulty_pref === undefined ? {} : { difficulty_pref: a.difficulty_pref }),
      ...(a.urgency === undefined ? {} : { urgency: a.urgency }),
      ...(a.form_pref === undefined ? {} : { form_pref: a.form_pref }),
      ...(a.depth_pref === undefined ? {} : { depth_pref: a.depth_pref }),
      ...(a.free_text === undefined ? {} : { free_text: a.free_text }),
    },
    need_tags: truncated,
    include_heavy: a.include_heavy ?? false,
    excluded_book_ids: [],
  };

  const userTags = new Map<ProblemTagId, number>(truncated.map((n) => [n.tag, n.weight]));

  return { diagnosis, userTags };
}

/**
 * 从已落库的诊断复算打分侧 userTags（结果页 / 调参重算共用）。
 *
 * **单位必须是 0–1，与书的 `problem_tags[].weight` 同一把尺子。**
 * 曾经这里乘过 10000（转基点），于是 `min(用户权重, 书权重)` 变成 `min(6000, 0.9)`，
 * `primary_hit` 被算成 1–2 分——`tierOf` 只判 `=== 0`，所以档位看着正常，
 * 但那个数已经不是"主诉命中率"，任何按 `primary_hit ≥ 8000` 写的判据都会恒假。
 */
export function userTagsOf(d: Diagnosis): Map<ProblemTagId, number> {
  return new Map(d.need_tags.map((n) => [n.tag, n.weight]));
}

/**
 * 只取用户在问卷里**点选**的标签权重——`problem` 因子分母用这一份。
 *
 * 与 `userTagsOf` 的差别只在自由文本命中的新标签上：那些标签按 0.15 追加，
 * 若进分母就会出现"说得越具体、分数越低"。详见 `domain/scoring/fit.ts`。
 * `source === 'option'` 的标签权重恒来自 `NEED_TAG_WEIGHTS`（0.6 / 0.25 / 0.15）。
 */
export function declaredTagsOf(d: Diagnosis): Map<ProblemTagId, number> {
  return new Map(d.need_tags.filter((n) => n.source === 'option').map((n) => [n.tag, n.weight]));
}
