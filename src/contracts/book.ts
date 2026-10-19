/**
 * 契约模块：book
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
 */

import type { BookId, AuthorId, CategoryL1, ProblemTagId, ThemeTagId, ContentWarning, FactorId, Availability, CopyrightBasis, TranslationCopyright, PublicDomainReason, LengthClass, Scale5, DepthLevel, FormType, ContentReady } from './enums.js';
export interface ThemeTagWeight {
  tag: ThemeTagId;
  /** 0.1 – 1.0，一位小数 */
  weight: number;
}

export interface ProblemTagWeight {
  tag: ProblemTagId;
  /** 0.1 – 1.0，一位小数 */
  weight: number;
}

/** 与核心库对齐的结果（仅用户导入的书有）。 */

export interface CoreMatch {
  book_id: BookId;
  method: 'isbn' | 'title_author';
}

/* ══════════════════════════════════════════════════════════════════════
 * 二、Book（§2.2）
 * ══════════════════════════════════════════════════════════════════════ */

export interface Book {
  /* ── 标识与基本元数据 ───────────────────────────────────────── */
  book_id: BookId;
  title: string;
  author_ids: AuthorId[];
  author_display: string[];
  /** 中译本必填。版权闸门依赖此字段的人类可读部分 */
  translator?: string;
  isbn13?: string;

  /* ── 分类（候选池 + 多样性 + 打分） ────────────────────────── */
  category_l1: CategoryL1;
  /**
   * 困境标签：打分因子 1 的唯一依据。
   * 缺失 ⇒ 不进入个性化推荐池（PRD §8.3）。类型上设为可选，
   * 是因为导入的书可能没有；但 `content_ready='full'` 的书必须非空（构建期校验）。
   */
  problem_tags?: ProblemTagWeight[];
  /** 主题标签：浏览 / 搜索 / 相邻域用，**不参与打分** */
  theme_tags: ThemeTagWeight[];

  /* ── 打分标注字段（因子 2/3/4/6） ───────────────────────────── */
  /** 内容难度：概念密度与抽象度（因子 2） */
  difficulty: Scale5;
  /** 认识深度（因子 3） */
  depth: DepthLevel;
  /** 体例（因子 4） */
  form: FormType;
  /** 前置门槛：1 = 零前置。**只参与硬过滤，不参与打分** */
  entry_level: Scale5;
  /** 表达友好度：1=最易读（短句、口语、术语少）（因子 6） */
  prose_accessibility: Scale5;
  /**
   * 预计阅读时长（小时，0.5–60，一位小数）。**人工估算，不用 `word_count / 400`**：
   * 文言与理论书可低到 150 字/分、通俗读物可到 700+，统一速度会把《论语》和一本
   * 通俗心理学算成同一档。`word_count / est_reading_hours` 只作构建期校验：
   * 比值必须落在 100–800 字/分，超界进人工复核队列。
   */
  est_reading_hours: number;

  /* ── 篇幅 ───────────────────────────────────────────────────── */
  length_class: LengthClass;
  word_count?: number;

  /* ── 安全 ───────────────────────────────────────────────────── */
  /**
   * 空数组 = 无预警。非空时参与 SPEC §6.3① 的 `EX-trauma` / `EX-terminal` 硬过滤。
   * **不要写成 F3**：ARCH 的 F3 是 `entry_level` 规则，与内容预警无关；
   * 两套编号混用已经害过一次（把内容预警指到难度规则上，规则照样编译通过，只是永不命中）。
   */
  content_warning: ContentWarning[];

  /* ── 供给与版权 ─────────────────────────────────────────────── */
  availability: Availability;
  copyright_basis: CopyrightBasis;
  translation_copyright: TranslationCopyright;
  /** copyright_basis 含 public_domain 时必填 */
  public_domain_reason?: PublicDomainReason;
  /** availability !== 'external' 时必填（出处必须可核验） */
  source_url?: string;

  /* ── 理由槽位数据（§4.2） ───────────────────────────────────── */
  /** 60–90 字。S2 主素材，说清书的**方法/结构**，不是内容简介 */
  one_line_what: string;
  /** ≤30 字。S2 前半句的体例说明，理由里最有人味的部分，必填 */
  structure_note: string;
  /** ≤40 字。"读完你至少能拿到什么"。**缺失则整段 S3 不生成** */
  one_line_gain?: string;
  /** ≤40 字，必须含动词短语。有 one_line_gain 时必填（构建期成对校验） */
  first_action?: string;
  /** 某因子低分时的诚实解释（PRD §7.3 层③） */
  boundary_hints?: Partial<Record<FactorId, string>>;
  /** ≤200 字。S2 缺 one_line_what 时的降级素材（需标注来源） */
  publisher_summary?: string;
  /**
   * ≤28 汉字、单行、**按书预写**（按月 × 按 tag 批量写，运行时不得生成）。
   * 与 `phrases.judgment` 的分工：judgment 按 problem_tag 共享（32 条），
   * 5 张卡里会出现重复的第一行；match_brief 按书唯一，5 张卡互不相同。
   * 构建期校验：字数 ≤28、无换行、同一次推荐结果内不重复（ARCH.md §4.2 / §4.4）。
   */
  match_brief: string;

  /* ── 数据管理 ───────────────────────────────────────────────── */
  series_id?: string;
  core_match?: CoreMatch;
  /** `readable` = 用户导入书缺打分字段：能读，但不入个性化推荐池 */
  content_ready: ContentReady;
  /**
   * 禁止再引入"完整度"字段与任何"复核日期"字段（SPEC §5.2）：
   * 前者与 availability + content_ready 三重重叠；后者会让结果随维护时间漂移，
   * 破坏「同输入同输出」这个可单测前提。tie-break 里不得出现任何时间字段。
   */
  /** `YYYY.MM.DD`，数据快照版本 */
  data_version: string;
}

/** 用户书库里的书：Book + 本地状态（单实体原则，ARCH.md §2.1）。 */

export interface UserBook extends Book {
  book_id: `user:${string}`;
  imported_at: number;
  /** 原文编码（TXT 判定结果）；EPUB 为 'binary' */
  source_encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030' | 'binary';
  /** 切章策略版本，供章节算法升级时判断是否需要重建索引 */
  chapterizer_version: number;
  /**
   * 用户书自带的封面（从 EPUB 的 `cover-image` / `properties="cover-image"` 取）。
   * 语义：`undefined` 或空字符串 = 无封面 → 渲染书脊卡。
   * **不下发占位图 URL**，组件层也不写 `onerror` 兜底——缺封面是正常路径，不是错误。
   * 核心库（`core:`）的书一律无此字段：v1 唯一封面系统是书脊卡。
   */
  cover_url?: string;
}

/* ══════════════════════════════════════════════════════════════════════
 * 三、Diagnosis（§2.3，PRD 四步问卷）
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 四屏（SPEC §6.1）：1 困境类别 / 2 具体感觉（含同屏主诉追问）/ 3 读书条件（5 组 chip）/ 4 自由文本。
 * **`step1b` 已不存在** —— 主诉追问是第 2 屏内的一次同屏单选，不新增屏、不新增步骤。
 */
