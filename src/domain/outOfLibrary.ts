import type { ExternalSuggestion } from '@/contracts/external.js';
import type { ProblemDomain, ThemeTagId } from '@/contracts/enums.js';

/**
 * 库外路径 D（SPEC §7.3）：系统直接给出**不在库里的书名 + 理由**。
 *
 * 与路径 A/B/C 的区别：A 要用户自己导文件，B 要用户自己填表，C 只是给个外链。
 * 三条都要用户动手，而用户当时问的是"我现在这样该读什么"——
 * 回答"库里没有、请你自己导入"是把我们自己的库存问题变成了他的空手而归。
 *
 * **这里不落库、不入候选池、不参与打分。** 它不是"没打分的书"，
 * 是"打分这件事对它根本不成立"：这些字段（`score_bp` / `factors` / `tier`）
 * 在类型上就不存在，所以不存在"留空的分数"这种中间态。
 */

export const OUT_OF_LIBRARY_BADGE = '未入库';

/**
 * 理由里禁止出现的说法。**理由禁止引用任何库内打分字段** ——
 * 这本书从来没有被打过分，说它"契合度 82%"是凭空的数。
 * 只能说"它讲什么"和"它对着你的哪一点"。
 */
export const FORBIDDEN_REASON_TERMS = [
  '契合度',
  '高度契合',
  '较为契合',
  '换个角度',
  '档位',
  '得分',
  'score',
  'score_bp',
  'fit_bp',
  '权重',
  '排名',
  'top',
] as const;

export interface ExternalQuery {
  domain: ProblemDomain;
  tags: readonly ThemeTagId[];
  /** 上限。库外不设"只能 60 本"这类规模限制 */
  limit: number;
}

/**
 * 挑选库外建议。**不打分**：只按标签重合数排序，重合数不是分数、
 * 不进任何加权、不参与档位——它只决定"先列哪一本"。
 *
 * 排序键 `(重合数降序, 书名升序)` 保证全序与确定性，
 * 不用 `localeCompare`（它依赖运行环境的区域设置，跨机器结果可能不同）。
 */
export function pickExternal(
  candidates: readonly ExternalSuggestion[],
  query: ExternalQuery,
): ExternalSuggestion[] {
  const wanted = new Set(query.tags);
  const scored = candidates.map((c) => {
    let overlap = 0;
    for (const t of c.tags) if (wanted.has(t)) overlap += 1;
    const domainHit = c.domain === query.domain ? 1 : 0;
    return { c, rank: overlap * 2 + domainHit };
  });
  scored.sort((a, b) => b.rank - a.rank || (a.c.title < b.c.title ? -1 : a.c.title > b.c.title ? 1 : 0));
  return scored.slice(0, Math.max(0, query.limit)).map((s) => s.c);
}

/**
 * 完整性断言。**卡片必须标注未入库**不是一句文案要求，是可断言的结构：
 * `badge` 字段是字面量类型，少写它编译不过；这里再在运行时兜一次，
 * 因为数据来自 `catalog/` 的 JSON，编译期管不到。
 */
export function assertExternal(list: readonly ExternalSuggestion[]): void {
  if (list.length === 0) {
    throw new Error('库外建议为空 —— 扫描对象为空时报未验证，不得当作"没有可推荐"');
  }
  for (const s of list) {
    if (s.kind !== 'external_suggestion') {
      throw new Error(`${s.title}：kind 必须为 'external_suggestion'`);
    }
    if (s.badge !== OUT_OF_LIBRARY_BADGE) {
      throw new Error(`${s.title}：badge 必须为「${OUT_OF_LIBRARY_BADGE}」，卡片必须标注未入库`);
    }
    if (!s.reason || s.reason.trim().length === 0) {
      throw new Error(`${s.title}：库外建议必须有理由，不许只列书名`);
    }
    if (s.reason.length > 120) {
      throw new Error(`${s.title}：理由 ${s.reason.length} 字，超过 120 字`);
    }
    for (const term of FORBIDDEN_REASON_TERMS) {
      if (s.reason.toLowerCase().includes(term.toLowerCase())) {
        throw new Error(`${s.title}：理由出现「${term}」—— 库外书没有被打过分，不得引用打分口径`);
      }
    }
    if (!s.where_to_find) {
      throw new Error(`${s.title}：库外建议必须给出去哪里找它`);
    }
  }
}
