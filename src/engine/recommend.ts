import type { Book } from '@/contracts/book.js';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ExternalSuggestion } from '@/contracts/external.js';
import type { ProblemTagId, ThemeTagId } from '@/contracts/enums.js';
import type { ReasonBlock } from '@/contracts/recommendation.js';
import type { FilteredOut } from '@/domain/scoring/filters.js';
import { partitionPool, type FilterContext } from '@/domain/scoring/filters.js';
import { buildReason } from '@/domain/scoring/reason.js';
import { scoreBook, type ScoredBook } from '@/domain/scoring/score.js';
import { rankBooks } from '@/domain/scoring/rank.js';
import { deriveTargets } from '@/domain/scoring/targets.js';
import {
  assertExternal,
  pickExternal,
  type ExternalQuery,
} from '@/domain/outOfLibrary.js';

/** 结果页目标条数（SPEC §7.2：1 + 1–3 + 0–1，上限 5） */
export const TARGET_COUNT = 5;

/** 排序后的条目 + 带来源的理由。理由不是打分的一部分，所以不塞进 `scoreBook`。 */
export type RankedItem = ScoredBook & { reason: ReasonBlock };

export interface RecommendResult {
  /** 库内书，按 6 级链排好序，已按 `TARGET_COUNT` 截断；每条都带 `reason` */
  items: RankedItem[];
  filtered: FilteredOut[];
  /** 库外路径 D 的建议。**与 `items` 并列，不混排、不参与排序 */
  external: ExternalSuggestion[];
  /** 库内被过滤后不足 `TARGET_COUNT`，由库外补齐 */
  topped_up_by_external: boolean;
}

export interface RecommendInput {
  books: readonly Book[];
  diagnosis: Diagnosis;
  userTags: ReadonlyMap<ProblemTagId, number>;
  externalCandidates: readonly ExternalSuggestion[];
  /** 库外建议的检索标签（主题词表，与打分用的 `problem_tags` 不是一套） */
  externalTags: readonly ThemeTagId[];
}

/**
 * 主链路（SPEC §6.3）：① 硬过滤 → ② 打分 → ③ 排序 → 库外兜底。
 * ④⑤⑥（槽位 / 放宽阶梯 / 分档）属于 M1，不在这里。
 *
 * **推荐数量不受书库规模限制**：库内不足 `TARGET_COUNT` 时，用库外路径 D 补到 5 条。
 * 不是"先给 2 本再让用户自己找"——库里有多少书是我们的问题，不是用户的问题。
 * 库外那几条**不进 `items`**：它们没有分数，混排就等于让一个凭空的数和真分数比大小。
 */
export function recommend(input: RecommendInput): RecommendResult {
  const { books, diagnosis, userTags, externalCandidates, externalTags } = input;
  const targets = deriveTargets(diagnosis);

  const ctx: FilterContext = {
    domain: diagnosis.answers.domain,
    targets,
    include_heavy: diagnosis.include_heavy,
    excluded: new Set(diagnosis.excluded_book_ids),
  };

  const { kept, filtered } = partitionPool(books, ctx);

  const primary = { tag: diagnosis.answers.primary_tag, weight: userTags.get(diagnosis.answers.primary_tag) ?? 0 };
  const scored = kept.map((b) => scoreBook(b, userTags, primary, targets));

  // 理由在排序之后才有意义（只给进前 5 的书写），但它不属于打分，也不影响排序
  const items: RankedItem[] = rankBooks(scored)
    .slice(0, TARGET_COUNT)
    .map((s) => ({
      ...s,
      reason: buildReason({
        book: s.book,
        userTags,
        primaryTag: diagnosis.answers.primary_tag,
        primaryPhrase: diagnosis.need_tags.find((n) => n.tag === diagnosis.answers.primary_tag)
          ?.user_phrase,
      }),
    }));

  const shortfall = TARGET_COUNT - items.length;
  let external: ExternalSuggestion[] = [];
  if (shortfall > 0 && externalCandidates.length > 0) {
    const query: ExternalQuery = {
      domain: diagnosis.answers.domain,
      tags: externalTags,
      limit: shortfall,
    };
    external = pickExternal(externalCandidates, query);
  }
  if (external.length > 0) assertExternal(external);

  return {
    items,
    filtered,
    external,
    topped_up_by_external: external.length > 0,
  };
}
