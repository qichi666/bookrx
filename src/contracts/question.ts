/**
 * 契约模块：question
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { ProblemDomain, ProblemTagId, DepthLevel, FormType } from './enums.js';
import type { StepId } from './diagnosis.js';
export interface QuestionOption {
  option_id: string;
  /** 选项文字。**同时是 S1 回引与命中依据的素材，所以它的措辞本身就是产品资产** */
  label: string;
  /** 第 1 屏：映射到问题域。**是 `ProblemDomain`，不是 `CategoryL1`**（后者是书籍体裁） */
  domain?: ProblemDomain;
  /** 第 2 屏：映射到困境标签 */
  problem_tags?: ProblemTagId[];
  /** 第 3 屏 b 组。选此项写入 `answers.difficulty_pref`，难度上限由它派生（2/3/5），**不在数据里存 cap** */
  difficulty_pref?: 'easy' | 'challenge' | 'hard';
  /** 第 3 屏 a 组。选此项写入 `answers.time_budget`，时长预算由它派生，**不在数据里存小时数** */
  time_budget?: '10m' | '30m' | '1h+';
  /** 第 3 屏 c 组。选此项写入 `answers.urgency`，再派生 `readability` 与 `length` 的 target */
  urgency?: '3w' | '1m' | 'none';
  /** 第 3 屏 d 组（体例）。选此项写入 `answers.form_pref` */
  form_pref?: FormType;
  /** 第 3 屏 e 组（深浅）。选此项写入 `answers.depth_pref` */
  depth_pref?: DepthLevel;
  /** 仅「这类内容里有涉及临终或丧亲的，要不要一起看？」这一项，写入 `Diagnosis.include_heavy`。
   *  是内容偏好，不是「我能承受」的自我声明；且**只豁免 `EX-terminal`，不豁免 `EX-trauma`** */
  include_heavy?: boolean;
}

export interface Question {
  step: StepId;
  /** 题干，最终文案由产品/设计定稿 */
  prompt: string;
  multi: boolean;
  max_selections?: number;
  options: QuestionOption[];
  optional: boolean;
}

/* ══════════════════════════════════════════════════════════════════════
 * 九、库外建议（SPEC §7.3 路径 D）
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 库外建议：**不落库、不入候选池、不参与打分**的一条书名建议。
 *
 * 与 `Recommendation` 的关系是**并列**，不是降级版：
 * 它没有 `book_id`、没有 `score_bp`、没有 `factors`、没有 `tier`——
 * 不是"这些字段算不出来所以留空"，而是**这些字段对它根本不成立**。
 * 一旦让它带上 `score_bp`，它就会和库内书排进同一张列表，
 * 而那个分数没有任何标注支撑，是凭空的。
 *
 * 存在的理由：书库永远小于人的困境。用户问"我现在这样该读什么"，
 * 回答"库里没有"是把我们自己的库存问题变成了他的空手而归。
 */
