import type { Tier } from '@/contracts/recommendation.js';
import { STRONG_MIN_COVERAGE_BP } from './coverage.js';

/** 档位阈值是**绝对值**（8000 / 6000 bp），不是分位数（SPEC §7.4） */
export const TIER_STRONG_MIN_BP = 8000;
export const TIER_WORTH_MIN_BP = 6000;

export interface TierVerdict {
  tier: Tier;
  /** 主诉未命中导致档位被封顶时为 true。封顶不改分数，只改标签 */
  capped_by_primary_miss: boolean;
  /** 标注覆盖率不足导致档位被封顶时为 true（候选层 3800 覆盖率的书落这一档） */
  capped_by_low_coverage: boolean;
}

function rawTier(score_bp: number): Tier {
  if (score_bp >= TIER_STRONG_MIN_BP) return 'strong';
  if (score_bp >= TIER_WORTH_MIN_BP) return 'worth';
  return 'explore';
}

/**
 * 主诉未命中 ⇒ 档位封顶 `explore`，与总分无关。
 *
 * 为什么需要这条：其余六个因子理想情况下合计 6200，一本完全不沾题的书只要
 * 难度 / 篇幅 / 体例全中就能拿到 5900–6500 → 自动落进 `worth`。
 * 而"较为契合"这个说法对一本没回答他问题的书是谎话。
 *
 * 这条封顶不改分数、只改标签，所以调试时分数与档位可能"不匹配"——那是**故意的**。
 * 原本就是 explore 的书不置 `capped_by_primary_miss`：那里没有可解释的落差。
 */
export function tierOf(
  score_bp: number,
  primary_hit: number,
  book_coverage_bp: number = 10000,
): TierVerdict {
  const raw = rawTier(score_bp);
  if (primary_hit === 0 && raw !== 'explore') {
    return { tier: 'explore', capped_by_primary_miss: true, capped_by_low_coverage: false };
  }
  /**
   * 覆盖率不足 ⇒ 封顶 `worth`，不给 `strong`。
   *
   * 候选层只有「困境标签」一类信息（3800/10000）。它可能非常沾题，
   * 但我们**不知道**它难度、体例、篇幅合不合适——这时候说「高度契合」
   * 是在用 38% 的信息讲 100% 的话。`worth`（较为契合）是能守住的表述上限。
   */
  if (raw === 'strong' && book_coverage_bp < STRONG_MIN_COVERAGE_BP) {
    return { tier: 'worth', capped_by_primary_miss: false, capped_by_low_coverage: true };
  }
  return { tier: raw, capped_by_primary_miss: false, capped_by_low_coverage: false };
}
