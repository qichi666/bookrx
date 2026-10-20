/**
 * BookRx（产品名待定）—— 类型契约草案（合订本）
 *
 * 使用方式：本文件是 `src/contracts/` 的草案合订本，供前端 / 领域层 / 引擎层对齐。
 * 落地时按 ARCH.md §9.1 拆成 8 个文件（book / taxonomy / diagnosis /
 * recommendation / reader / progress / review / errors），每个 < 300 行。
 *
 * 三条硬约束：
 * 1. 只允许 `type` / `interface`，不允许 `enum`（enum 产出运行时对象，
 *    违反"contracts 零运行时"）。
 * 2. 不 import 任何运行时依赖（vue / dexie / foliate-js 都不行）。
 * 3. 实体类型全仓只在此定义一次，别处只能 import（ARCH.md §9.2 第 8 条）。
 *
 * 字段命名以 PRD §8 / §7.1 为准（编辑与标注人员手中的表就是这个命名）。
 * 对应章节：ARCH.md §2 数据模型 / §3 打分 / §4 理由 / §6.2 导入 / §7.3 定位
 */

/* ══════════════════════════════════════════════════════════════════════
 * 一、标识与受控词表（§2.8 四共享契约之一：theme_tags）
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 书籍标识。
 * - `core:` + 6 位定宽序号：核心库书。构建期从 book-id-ledger.json 分配，
 *   永不复用、永不重排（下架的书保留"墓碑"，序号不回收）。
 * - `user:` + 小写 hex 或规范化 identifier：用户导入的书（§6.2）。
 * 禁止用书名 / ISBN 直接当 id（书名会改、ISBN 常缺失、同名书多）。
 */
export type BookId = `core:${string}` | `user:${string}`;

/** 作者标识，构建期字典分配。无署名统一用 `author:unknown`。 */
export type AuthorId = `author:${string}`;

/**
 * 六大**困境域**（PRD §7.1 第 1 步）。决定候选池、相邻域、过滤与话术。
 * **不要和 `CategoryL1` 混**：这个描述「用户的问题是什么」，那个描述「书是什么文体」。
 * 两者混用会让「同文体 ≤2」静默变成「同问题域 ≤2」——测试全绿，排序变了。
 */
export type ProblemDomain =
  | 'emotion'       // 情绪与自我
  | 'relationship'  // 关系
  | 'work'          // 工作与意义
  | 'habits'        // 习惯与行动
  | 'thinking'      // 认知与思考
  | 'transition';   // 人生转折

/**
 * 书的一级文体（6 类）。**只用于多样性配额**（rank 1–5 内同 `category_l1` ≤2），
 * 不参与任何打分，也不决定候选池。与 `ProblemDomain` 是两件事。
 */
export type CategoryL1 =
  | 'literature'      // 文学
  | 'psychology'      // 心理
  | 'philosophy'      // 思想哲学
  | 'social-science'  // 社科
  | 'biography'       // 传记
  | 'other';

/**
 * 困境标签：32 个受控值（6 域）。**打分只认这套词表**（ARCH.md §3.2）。
 * 与 ThemeTagId（主题词表）是两套不同的词：这套描述"用户的困境"，
 * 那套描述"书的主题"。混用会让"按主题浏览"与"按困境匹配"互相污染。
 */
export type ProblemTagId =
  // emotion 情绪与自我
  | 'low-mood' | 'anxiety' | 'rumination' | 'self-doubt' | 'emptiness' | 'emotional-outburst'
  // relationship 关系
  | 'communication-block' | 'frequent-conflict' | 'intimacy-distance'
  | 'people-pleasing' | 'family-origin' | 'loneliness'
  // work 工作与意义
  | 'speaking-block' | 'evaluation-anxiety' | 'burnout'
  | 'meaning-loss' | 'management-delegation' | 'promotion-stuck'
  // habits 习惯与行动
  | 'procrastination' | 'cant-persist' | 'attention-scatter' | 'time-losing' | 'action-paralysis'
  // thinking 认知与思考
  | 'decision-difficulty' | 'cognitive-bias' | 'cant-see-whole' | 'info-overload' | 'judgment-distortion'
  // transition 人生转折
  | 'career-confusion' | 'age-anxiety' | 'loss-and-farewell' | 'identity-rebuild' | 'big-choice';

/**
 * 主题标签：48 个受控值（8 族）。用于按主题浏览、搜索、相邻域判定，
 * **不直接参与打分**（这是与初稿最大的差别，见 ARCH.md §3.0）。
 */
export type ThemeTagId =
  | 'management' | 'org-design' | 'feedback' | 'conflict' | 'managing-up' | 'efficiency'
  | 'decision' | 'bias' | 'systems' | 'probability' | 'logic' | 'critical-thinking'
  | 'self-awareness' | 'emotion' | 'anxiety-tag' | 'habits' | 'motivation' | 'boundaries'
  | 'intimacy' | 'parenting' | 'family-origin-tag' | 'loneliness-tag'
  | 'gender-identity' | 'repair'
  | 'finance' | 'investing' | 'consumption' | 'career-change'
  | 'side-business' | 'negotiation'
  | 'social-structure' | 'institution' | 'history' | 'economy-cycle'
  | 'city' | 'technology'
  | 'writing' | 'public-speaking' | 'aesthetics' | 'creation'
  | 'reading-method' | 'learning-science'
  | 'meaning-of-life' | 'loss' | 'faith' | 'philosophy'
  | 'ethics' | 'freedom';

/**
 * 内容预警：安全字段（`EX-trauma` / `EX-terminal` 两条硬过滤依赖它，见 SPEC §6.3①）。
 * **词表固定 7 项**，与 `boot-columns` 的位掩码一一对应 —— 少一个值不会报错，
 * 只会让对应那条过滤永远不可能命中：标注人标不上、规则读不到，整条链路安静地失效。
 */
export type ContentWarning =
  | 'suicide'
  | 'violence'
  | 'sexual_abuse'
  | 'eating_disorder'
  | 'addiction'
  | 'grief'
  | 'terminal_illness';

/**
 * 打分维度标识。**7 个**，与 SPEC §6.2 一一对应，权重和为 10000。
 * 顺序即定点整数加法的累加顺序（保证跨平台逐字节一致）。
 *
 * 命名：用 `problem` 不用 `topic`。它比的是「书的困境标签 vs 用户的困境标签」，
 * 而 `theme_tags` 才是主题且不参与打分；叫 topic 会把两件事混成一件。
 *
 * `depth` / `form` 不是可有可无的排序微调：用户说「我想要一套能上手的方法」，
 * 我们却把叙事回忆录排第一，就已经违背了「按符合度排序」。它们是**符合度的一部分**。
 * 信号来自问卷 3-d（体例）与 3-e（深浅），不是没有信号。
 */
export type FactorId =
  | 'problem'        // 困境契合    3800
  | 'difficulty'     // 难度匹配    1800
  | 'depth'          // 深浅匹配    1200
  | 'form'           // 体例匹配    1000
  | 'length'         // 篇幅匹配    1000
  | 'readability'    // 表达匹配     700
  | 'availability';  // 可直读倾斜    500

/*
 * 权重值不写在这里 —— 本文件是 L0 contracts，只放类型，编译后必须零字节。
 * 权重表落在 `src/domain/recommend/weights.ts`，构建期与单测双重校验求和 = 10000。
 */

/** 供给方式三态（§6.1）。唯一真源，禁止由其他字段临时推断。 */
export type Availability = 'inline' | 'bring_your_own' | 'external';

export type CopyrightBasis =
  | 'public_domain_cn'
  | 'public_domain_origin'
  | 'licensed_free'
  | 'in_copyright'
  | 'metadata_only';

/**
 * 中译本版权状态。判定姿态：`unknown` 按"有版权"处理 —— 见 SPEC §6.3 版权闸门
 * （`availability='inline'` 且 `translation_copyright ∈ {in_copyright, unknown}` 时不得直读）。
 * 原著公版 ≠ 中译本公版 —— 这是本项目最容易犯的法律错误。
 */
export type TranslationCopyright = 'none' | 'public_domain' | 'in_copyright' | 'unknown';

export type PublicDomainReason = 'author_death_50y' | 'ancient_text' | 'gov_work' | 'cc_license';

/** 篇幅档：1:<8 万 2:8–20 万 3:20–40 万 4:>40 万。 */
export type LengthClass = 1 | 2 | 3 | 4;

/** 1–5 刻度。语义由字段名决定，锚点定义见 ARCH.md §2.4。 */
export type Scale5 = 1 | 2 | 3 | 4 | 5;

/** 认识深度（因子 3）：与问卷 3-e 一一对应（具体做法 / 做法加为什么 / 底层原理）。三值而非 1–5 —— chip 只有 3 档。 */
export type DepthLevel = 'howto' | 'howto_why' | 'why';

/** 体例（因子 4）：与问卷 3-d 一一对应（一个人的故事 / 一套方法 / 完整框架）。三值。 */
export type FormType = 'story' | 'method' | 'framework';

/**
 * 这两个类型曾被删过，理由是"问卷里没有信号"。**判断对、结论错。**
 *
 * 当时对齐的问卷版本不问"要原理还是要做法"、也不问"要故事还是要框架"，
 * 两因子只能恒为中性 5000，等于让 2200 bp 变成常数项。
 * 但正确的解法是**补题**（3-d 体例 / 3-e 深浅），不是删因子：删掉的权重会按比例
 * 摊给其余因子，等于悄悄改写了"符合度"的定义，而且没有任何报错。
 * 现在的结论：`depth` 1200 bp、`form` 1000 bp，信号来自 3-d / 3-e。
 *
 * 注意本段历史上写的是"删掉因子与字段、weights.ts 留 0 权重命名位"——
 * 那是旧结论，已作废。保留这段是为了记住：**信号缺失时先问问卷能不能问出来。**
 */

/**
 * 字段完整度。`readable` = 用户导入书：能读，但缺打分字段，不入个性化推荐池。
 * 不要再引入冗余的"完整度"字段 —— 「能不能读」由 `availability` 唯一表达。
 */
export type ContentReady = 'full' | 'readable';

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
export interface ChapterRef {
  href?: string;
  spine_index?: number;
  label?: string;
}

/**
 * 位置契约，判别联合三形态。
 *
 * 关键：EPUB CFI 只对"同一份文件"稳定。本产品大部分书由用户自行导入，
 * 换一份版式不同的文件后 CFI 必错，且是静默错位。因此标注必须额外携带
 * 引文锚点，由 resolveLocator 做多级降级。只存 CFI 视为缺陷。
 */
export type Locator =
  | { scheme: 'epub-cfi'; cfi: string }
  | { scheme: 'txt-offset'; chapter: number; offset: number }
  | {
      scheme: 'quote';
      chapter_ref: ChapterRef;
      quote: string;
      /** 该引文在书中第 n 次出现（1-based），解决重复句歧义 */
      occurrence: number;
    };

/** 标注的范围锚点：CFI 双写 + 引文锚点，两者都存，缺一不可。 */
export interface RangeLocator {
  start: Locator;
  end: Locator;
  /** 命中文本，≤500 字。删掉原文件后仍能回看笔记 */
  quote: string;
  /** 引文前 30 字，消歧与校验用 */
  prefix?: string;
  /** 引文后 30 字 */
  suffix?: string;
  chapter_ref: ChapterRef;
}

/** 定位解析结果。degraded=true 表示走了降级路径，UI 应给轻提示。 */
export interface ResolvedLocator {
  locator: Locator;
  degraded: boolean;
  /** 1=精确（CFI） 2=同章引文 3=全书引文 4=章节首 */
  level: 1 | 2 | 3 | 4;
}

/** 完全无法定位的标注，归入「失效标注」分组（绝不删除）。 */
export interface OrphanedAnnotation {
  annotation_id: string;
  book_id: BookId;
  reason: 'chapter-missing' | 'quote-not-found';
}

/**
 * 阅读入口决策结果（§6.1）。
 * UI 不允许自己判断 availability，只能消费此判别联合。
 */
export type ReaderEntry =
  | { kind: 'read-inline'; href: string }
  | { kind: 'read-local'; userBookId: BookId }
  | { kind: 'offer-import'; accept: '.epub,.txt' }
  | { kind: 'info-only'; externalUrl?: string };

/* ══════════════════════════════════════════════════════════════════════
 * 六、阅读进度（§2.6 四共享契约之四：progress_event）
 * ══════════════════════════════════════════════════════════════════════ */

export type ProgressEventKind = 'open' | 'relocate' | 'close' | 'finish';

/**
 * 进度事件。写入策略：relocate 节流 500ms + 尾沿 flush；close/finish 立即落库；
 * 只保留最近 200 条（环形），不无限增长。
 */
export interface ProgressEvent {
  book_id: BookId;
  kind: ProgressEventKind;
  locator: Locator | null;
  /** 0–1 */
  percent: number;
  at: number;
  /** 一次阅读会话一个 id，用于统计单次时长 */
  session_id: string;
}

export interface ReadingProgress {
  book_id: BookId;
  /** 从未打开为 null */
  locator: Locator | null;
  furthest_locator: Locator | null;
  /** 0–1，三位小数 */
  percent: number;
  /** 累计前台阅读毫秒（visibilitychange 隐藏即暂停计时） */
  total_reading_ms: number;
  last_opened_at: number;
  finished_at?: number;
  schema_version: number;
}

/* ══════════════════════════════════════════════════════════════════════
 * 七、标注 / 笔记 / 小测 / 复习卡（§2.7）
 * ══════════════════════════════════════════════════════════════════════ */

/*
 * 划线 v1 单色，**没有色令牌，也没有 `tone` 字段**。
 *
 * 四色方案已试算并否决：要让换色不改变正文对比度，四色必须做成等亮度
 * （彼此对比仅 1.001–1.046:1），而等亮度的代价是**只能靠色相区分** ——
 * 松绿与褐玫两色（取值见 `UIUX.md` §3.7 的令牌表）在红绿色盲下几乎重合。多色上线等于带一个
 * 无障碍缺陷上线。四色的验算与三条启用条件保留在 `UIUX.md` §3.7 附录。
 *
 * 将来要开：前提是先有**非颜色标记**（形状 / 符号 / 角标），再谈颜色；
 * 且必须同时做 Dexie 迁移。在那之前，Annotation 上不得出现任何色相字段。
 */

export interface Annotation {
  annotation_id: string;
  book_id: BookId;
  locator: RangeLocator;
  quote: string;
  created_at: number;
  note_id?: string;
}

export interface Note {
  note_id: string;
  book_id: BookId;
  annotation_id?: string;
  locator?: Locator;
  /** Markdown 子集：加粗 / 引用 / 换行 */
  body_markdown: string;
  created_at: number;
  updated_at: number;
}

/**
 * 章节小测题。第一版题库随核心库分发、人工编写（不引 LLM，ADR-004）。
 * 用户导入的非核心书没有小测 —— 这是明确的能力边界（ARCH.md §12）。
 */
export interface QuizItem {
  quiz_id: string;
  book_id: BookId;
  /** 用引文锚点而非 CFI：题库与用户文件版本无关（§7.3） */
  anchor: Locator & { scheme: 'quote' };
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
}

/**
 * FSRS 卡片状态。日期一律存 number（epoch ms）。
 * 坑：ts-fsrs 的 Card 用 Date 对象，经 JSON 往返会变字符串，
 * 再喂回调度器会静默算出错误的 elapsed_days（典型的沉默逻辑错误）。
 */
export interface FsrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  /** 0=New 1=Learning 2=Review 3=Relearning */
  state: 0 | 1 | 2 | 3;
  last_review?: number;
}

/** 卡片来源：小测题，或用户从笔记一键建卡（保证没小测的书也能进复习流）。 */
export type ReviewCardSource =
  | { kind: 'quiz'; quiz_id: string }
  | { kind: 'note'; note_id: string };

export interface ReviewCard {
  review_id: string;
  book_id: BookId;
  source: ReviewCardSource;
  front: string;
  back: string;
  fsrs: FsrsState;
  suspended: boolean;
  created_at: number;
}

/* ══════════════════════════════════════════════════════════════════════
 * 八、导入（§6.2 / §6.4）
 * ══════════════════════════════════════════════════════════════════════ */

export type ImportErrorCode =
  | 'E_IMPORT_TOO_LARGE'
  | 'E_IMPORT_EMPTY'
  | 'E_IMPORT_NOT_EPUB'
  | 'E_IMPORT_CORRUPT_ZIP'
  | 'E_DRM_PROTECTED'
  | 'E_IMPORT_BAD_OPF'
  | 'E_IMPORT_ENCODING'
  | 'E_IMPORT_EMPTY_CONTENT'
  | 'E_STORAGE_QUOTA'
  | 'E_STORAGE_FAILED';

export interface ImportError {
  code: ImportErrorCode;
  /** 面向开发者的诊断信息，不直接展示给用户 */
  detail: string;
  /** 是否可通过用户动作恢复 */
  recoverable: boolean;
  /** 'choose-encoding' → 弹编码选择；'degrade-metadata' → 允许仅阅读 */
  recovery?: 'choose-encoding' | 'degrade-metadata';
}

export type ImportWarning =
  | { kind: 'font-obfuscated' }
  | { kind: 'metadata-degraded' }
  | { kind: 'fixed-layout-unsupported' }
  | { kind: 'chapterize-fallback' };

/**
 * 导入流水线的成功产物。
 * pipeline 是纯函数：输入 File/ArrayBuffer，输出此结构，**不碰 IndexedDB**；
 * 落库由调用方执行（§6.2）。这样导入链路可在 Node 里用真实样本单测。
 */
export interface ImportedBook {
  book: Book;
  /** 原始字节，由调用方写入独立的 book_files 表 */
  bytes: ArrayBuffer;
  /** 嗅探出的真实格式（不依赖扩展名） */
  format: 'epub' | 'txt';
  encoding?: 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030';
  warnings: ImportWarning[];
}

/** 结果类型，不用异常做流程控制。 */
export type ImportResult =
  | { ok: true; value: ImportedBook }
  | { ok: false; error: ImportError };

/* ══════════════════════════════════════════════════════════════════════
 * 九、catalog 运行时形状（构建期产物的解码结果，§5.2）
 * ══════════════════════════════════════════════════════════════════════ */

/** boot-columns 解码后的行内形状：只含打分所需字段。 */
export interface ScoringRow {
  book_id: BookId;
  author_id: AuthorId;
  category_l1: CategoryL1;
  problem_tags: ProblemTagWeight[];
  difficulty: Scale5;
  prose_accessibility: Scale5;
  est_reading_hours: number;
  length_class: LengthClass;
  availability: Availability;
  content_warning: ContentWarning[];
}

/** 详情分片中的文案字段（渲染卡片时才需要）。 */
export interface DetailRow {
  book_id: BookId;
  one_line_what: string;
  structure_note: string;
  one_line_gain?: string;
  first_action?: string;
  boundary_hints?: Partial<Record<FactorId, string>>;
  publisher_summary?: string;
  /** ≤28 字单行，卡片首行。按书预写，与 phrases.judgment 分工见 Book.match_brief */
  match_brief: string;
  word_count?: number;
  series_id?: string;
  source_url?: string;
  translator?: string;
  copyright_basis: CopyrightBasis;
  translation_copyright: TranslationCopyright;
}

/** 检索命中。score 为优先级权重（§5.4），同分按 book_id 升序。 */
export interface SearchHit {
  book_id: BookId;
  score: number;
  /** 命中字段，供 UI 高亮 */
  field: 'title' | 'pinyin-initials' | 'pinyin-full' | 'author' | 'tag' | 'one_line_what';
}

/* ══════════════════════════════════════════════════════════════════════
 * 十、问卷定义（§2.3，对应 PRD §7.1 的四步）
 * ══════════════════════════════════════════════════════════════════════ */

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
