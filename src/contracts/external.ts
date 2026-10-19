/**
 * 契约模块：external
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { ProblemDomain, ThemeTagId } from './enums.js';
export interface ExternalSuggestion {
  /** 判别用字面量。有了它，渲染层不可能把库外建议当库内书处理 */
  kind: 'external_suggestion';
  /** 书名。已剥离书名号 */
  title: string;
  author_display: string[];
  /** 分类 / 标签（展示用，不参与任何计算） */
  domain?: ProblemDomain;
  tags: ThemeTagId[];
  /**
   * 推荐理由。**禁止引用任何库内打分字段** —— 不得出现契合度、分数、档位、
   * 排名、权重一类说法，因为这本书从来没有被打过分。
   * 只能说"它讲什么"和"它对着你的哪一点"。
   */
  reason: string;
  /** 去哪里找它。不落库，所以只给出处线索 */
  where_to_find: string;
  /**
   * 卡片上必须显示的标识。**恒为「未入库」**，不是可选文案：
   * 少了它，用户会以为这本书和上面几本一样是"我们读过的书"。
   */
  badge: '未入库';
}
