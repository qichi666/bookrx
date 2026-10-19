/**
 * 契约模块：diagnosis
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { BookId, ProblemDomain, ProblemTagId, DepthLevel, FormType } from './enums.js';
export type StepId = 'step1' | 'step2' | 'step3' | 'step4';

export interface NeedTag {
  tag: ProblemTagId;
  /**
   * 0.1 – 1.0。**取值以 SPEC §6.1 为唯一出处**：step2 主诉 0.60 / 次 0.25 / 第三 0.15。
   * step4 自由文本命中**已有**标签取 `max(现有, 0.6)`（不叠加）；命中**新**标签给 0.15。
   * 不要照 0.9/0.6/0.4 那套旧值写：让自由文本命中已有标签时叠加，会抬高 `Σ用户权`、
   * 摊薄主诉覆盖率——用户多写一句话，反而让自己的主诉变得不重要了。
   */
  weight: number;
  source: 'option' | 'free_text';
  /**
   * 用户原词（选项原文，或自由文本里的命中片段）。**逐字保留，不许改写**。
   * PRD §8.1 要求 S1 必须回引用户原词；若诊断阶段不存原词，
   * 渲染层只能 paraphrase 成通用描述——那正是 PRD 明令禁止的。
   */
  user_phrase: string;
}

/**
 * 诊断记录（SPEC §5.2.1）。
 * **只存用户的选择，不存派生值** —— 难度上限、时长预算、各因子的 target 一律运行时从
 * `answers` 算。存下来会出现「规则改了、老记录还是按老规则算的」这种分叉，而且它不报错。
 */

export interface Diagnosis {
  diagnosis_id: string;
  created_at: number;
  answers: {
    /** 第 1 屏。**是 `ProblemDomain`，不是 `CategoryL1`** */
    domain: ProblemDomain;
    /** 第 2 屏，≤3 项。权重 0.60 / 0.25 / 0.15 按此顺序 */
    problem_tags: ProblemTagId[];
    /** 必填。存下来不重算：档位封顶、S1 回引顺序、破冰位选书三处都依赖它 */
    primary_tag: ProblemTagId;
    /** 'explicit' = 第 2 屏追问选出的；'single' = 第 2 屏只选了 1 项。**'order' 不存在** */
    primary_source: 'explicit' | 'single';
    /** 第 3 屏五组，键名与取值见 SPEC §6.1（唯一出处）。允许整组缺失 = 跳答 */
    time_budget?: '10m' | '30m' | '1h+';
    difficulty_pref?: 'easy' | 'challenge' | 'hard';
    urgency?: '3w' | '1m' | 'none';
    form_pref?: FormType;
    depth_pref?: DepthLevel;
    free_text?: string;
  };
  /** ≤6 项，超出按权重截断 */
  need_tags: NeedTag[];
  /**
   * 用户偏好：要不要把含**临终 / 丧亲**题材的书也放进推荐。默认 false，不记忆。
   * **它只豁免 `EX-terminal`，不豁免 `EX-trauma`**：那个开关的中文是
   * 「这类内容里有涉及临终或丧亲的，要不要一起看？」，只承诺了临终与丧亲。
   * 写成「含自杀题材」会让开关承诺的比它放行的内容更多（SPEC §6.3①）。
   * **它是内容偏好，不是「我能承受」的自我声明** —— 问「要不要看这类内容」不需要
   * 用户先评估自己的状态；问「你承受得住吗」等于让他担保自己（见 SPEC §5.2.1）。
   */
  include_heavy: boolean;
  excluded_book_ids: BookId[];
}

/* ══════════════════════════════════════════════════════════════════════
 * 四、Recommendation（§2.5 / §3）
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 三档（SPEC §6.3 ⑦）。故意不提供百分数字段 —— 用户会用百分数做跨次比较，
 * 而这套打分不在任何意义上具备跨次可比性。
 * 只允许 strong / worth / explore。禁止 high / mid / low / fit。
 */
