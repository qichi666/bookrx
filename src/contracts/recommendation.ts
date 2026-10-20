/**
 * 契约模块：recommendation
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { BookId, FactorId } from './enums.js';
export type Tier = 'strong' | 'worth' | 'explore';

/** 单个因子的打分结果。全部定点整数（basis point，万分制）。 */

export interface FactorFit {
  /** 0–10000 */
  fit_bp: number;
  /** 实际使用的权重（信号缺失重分配后），7 项之和恒为 10000 */
  weight_bp: number;
  /** floor(fit_bp * weight_bp / 10000)。7 项之和必须严格等于 score_bp */
  contribution: number;
}

export interface ScoreBreakdown {
  factors: Record<FactorId, FactorFit>;
  /** 软惩罚（本版暂无，保留扩展位；硬过滤在打分之前，不在这里） */
  penalty?: { kind: 'entry-gate'; multiplier_bp: number };
  score_bp: number;
}

/**
 * 理由四段（§4.1）。字段名用**语义名**，不用 S1/S2/S3/B1 这种位置名 ——
 * 位置名会随卡片层级重排而失效（本项目已经重排过两次），字段名不行。
 * 散文里仍可用 S1/S2/S3/B1 指代，但那是行文习惯，不是契约。
 */

export interface ReasonText {
  /** S1 回引你的处境，40–70 字，必须含至少一个用户原词。卡面不放，只在展开区 */
  situation: string;
  /** S2 这本书讲什么，**全文 60–90 字**。卡面只渲染其首句（= Book.structure_note，≤38 字、自带句号） */
  promise: string;
  /** S3 你读完能得到什么，40–70 字。可能不存在 —— 宁可少一段，不可编一段 */
  payoff?: string;
  /** B1 边界声明（≤30 字）。**卡面第 5 行展示，不进展开区**——另起一段就是同一句出现两次 */
  mismatch?: string;
}

/**
 * 理由**来源**（可审计性的契约层，§7.3 层的落地）。
 *
 * 为什么要单独一个枚举：`ReasonText` 只说"理由长什么样"，说不出"这句话是从哪来的"。
 * 于是界面上的理由既可能来自编辑写的文案，也可能来自用户自己的回答，
 * 两者混在一起时，用户没法判断哪句是书里的话、哪句是在复述自己。
 *
 * `prewritten` = 编辑为这本书写的；`from_answer` = 回引用户的原词；
 * `from_tag_weight` = 书的困境标注 × 权重，可追到具体标签与数值。
 */

export type ReasonSource = 'prewritten' | 'from_answer' | 'from_tag_weight';

/** 一行带来源的理由。**没有 source 的理由不许上界面**。 */

export interface ReasonLine {
  text: string;
  source: ReasonSource;
  /** 可追溯的依据：用户标签 id / 书的标签 id。prewritten 时缺省 */
  basis?: string;
}

/**
 * 卡片理由的两块：`brief` 是卡面那一句（固定来自书里的 `match_brief`），
 * `lines` 是展开区（你的回答 / 书的标注 / 书里写的）。
 */

export interface ReasonBlock {
  brief: ReasonLine;
  lines: ReasonLine[];
}

/**
 * 放宽阶梯（§3.8）。
 * 0 = 未放宽；1 = 域内标签级降到域级；2 = 放开到全部域并降 problem 权重；
 * 3 = 只按条件选书。L4（返回空）不体现在此字段，因为没有 Recommendation 产出。
 */
/**
 * 放宽级别。L0 不放宽 → L3 只按条件选书 → L4 无结果。
 * 单条 Recommendation 不会带 4（L4 不产出条目），只有 RecommendationSet 会。
 */

export type RelaxLevel = 0 | 1 | 2 | 3 | 4;

/** 槽位：1 破冰 / 2–4 深化 / 5 换角度（§3.7）。 */

export type SlotIndex = 1 | 2 | 3 | 4 | 5;

export interface Recommendation {
  book_id: BookId;
  diagnosis_id: string;
  /** 定点整数加权和，**7 个** contribution 相加严格等于它 */
  score_bp: number;
  /**
   * 档位。**只由 `score_bp` 的绝对阈值决定**（≥8000 strong / 6000–7999 worth / <6000 explore），
   * 与任何归一化分数无关；且 `primary_hit = 0` 时封顶 `explore`（见 capped_by_primary_miss）。
   */
  tier: Tier;
  factors: Record<FactorId, FactorFit>;
  weights_used: Record<FactorId, number>;
  /**
   * 主诉未命中被封顶到 explore 时为 true。
   * 封顶只改标签、不改分数，所以调试时 `score_bp` 与 `tier` 可能"看起来不匹配"——这是故意的。
   */
  capped_by_primary_miss?: boolean;
  slot: SlotIndex;
  relax_level: RelaxLevel;
  /**
   * true = 这本是通过 S1 破冰位的降级路径被提前的（本来轮不到第 1 位）。
   * 用途：埋点区分"真正够格当破冰位的书"与"被顶上来的书"，
   * 以及让 UI 决定是否必须附 `reason.mismatch`（§3.7 降级 1/2/3）。
   */
  promoted_for_icebreak: boolean;
  /** 最终名次，与 slot 一致（1-based） */
  rank: number;
  reason: ReasonText;
  /** 命中依据 2–4 项，取自用户原词（PRD §7.3 层②）。**进展开区，不上卡面**（tag 级共享，会重复） */
  hit_points: string[];
  /** 卡片附注，例如"角度与第 2 本接近"。UI 直接显示，不下判断 */
  card_notes?: string[];
  /** 仅调试构建：命中的 tie-break 键序列 */
  tie_break_trace?: string[];
}

/** 被硬过滤的书。仅验收与调试可见，UI 不展示。 */

export interface FilteredBook {
  book_id: BookId;
  /**
   * 剔除规则的**名字**，与 SPEC §6.3① 一一对应。
   * 刻意不用 F1/F2 这种编号：SPEC 与 ARCH 的编号不是一套，跨文档引用编号必错。
   * `EX-terminal` 与 `EX-trauma` 必须分开记 —— 合成一个码，将来就分不出是哪条在起作用。
   */
  rule:
    | 'EX-difficulty'   // difficulty > difficulty_cap
    | 'EX-load'         // entry_level ≥ 4 && 认知负荷 < 40
    | 'EX-trauma'       // suicide / sexual_abuse  ×「情绪与自我」× 越轻松，不可豁免
    | 'EX-terminal'     // grief / terminal_illness ×「情绪与自我」× 越轻松，仅此项可被 include_heavy 豁免
    | 'no-problem-tags'
    | 'excluded-by-user'
    | 'metadata-only';
}

/** `/recommend` 的整体结果，UI 只消费这个结构。 */

export interface RecommendationSet {
  diagnosis_id: string;
  items: Recommendation[];
  filtered: FilteredBook[];
  relax_level: RelaxLevel;
  /** 不足 5 本时置位，UI 需显示「符合你条件的书只有 N 本」 */
  has_fewer_than_five: boolean;
  /** 空结果（L4）时存在 */
  empty_reason?: 'no-candidate' | 'all-filtered' | 'all-excluded';
}

/* ══════════════════════════════════════════════════════════════════════
 * 五、定位契约（§7.3 四共享契约之二：locator）
 * ══════════════════════════════════════════════════════════════════════ */

/** 章节引用。解析时按 href → spine_index → label 优先。 */
