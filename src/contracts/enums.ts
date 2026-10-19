/**
 * 契约模块：enums
 *
 * 由 `docs/types-draft.ts` 派生，机械切分以保证与草稿逐字一致。
 * 真源是 [`SPEC.md`](../../docs/SPEC.md)；types-draft 只是它的 TS 化表达。
 * 改契约先改 SPEC，再改本目录；`tools/check-enums.mjs` 负责把两边对拍。
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
