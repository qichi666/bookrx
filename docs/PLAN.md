# 实施计划 — BookRx v1

> 契约：[`SPEC.md`](./SPEC.md)（唯一真源）。本文件只拆任务，不定义任何契约。
> 冲突时以 SPEC 为准；本文件里出现与 SPEC 不一致的内容，视为本文件的缺陷。

---

## 里程碑与验收门槛

| 阶段 | 交付 | 出口条件（达不到不许进下一阶段） |
|---|---|---|
| **M0** | 脚手架 + 类型 + 数据 schema + 三条校验脚本 | `npm run check` 全绿；权重和 = 10000；`Book` 的 `keyof` 与 SPEC §5.2 逐字段对拍通过 |
| **M0.5** | **60 本书目** + 10 条金标画像 | **闸门 0 通过，两个计数都要 ≥7/10**：① 认出率 = 金标书档位落 `strong` 的条数；② 首屏率 = 第 1 位档位落 `strong` 的条数。报告分两列，不许求平均（见 SPEC §7.4） |
| **M1** | P0-1 ~ P0-7（问卷 / 打分 / 结果页 / 详情 / 导入引导） | v0.1 可发布；同输入两次结果逐字节一致 |
| **M2** | P0-8 ~ P0-11 + P0-14（EPUB / TXT 阅读器、本地书库、离线） | 9 份真实样本导入全通过 |
| **M3** | P0-12 + 100 本小测 | 划线跨刷新不错位；比例闸门 ≥30% |
| **M4** | P0-13 + P0-15（公版直读、导出） | v1.0 |

---

## M0 任务清单（14 项，按依赖排序）

| # | 任务 | 产出 | 完成判据 |
|---|---|---|---|
| 1 | 仓库骨架 | `src/{views,components,domain,engine,data,contracts}/`、`catalog/`、`tools/`、`tests/` | 目录结构与 SPEC §4.1 一致 |
| 2 | Vite + Vue 3 + TS | `package.json` / `vite.config.ts` / `tsconfig.json` | `npm run dev` 起得来；`npm ls` 版本回写 SPEC §4 |
| 3 | 类型落地 | `src/contracts/` ← 由 `docs/types-draft.ts` 派生 | `tsc --noEmit` 零错误 |
| 4 | 权重与常量 | `src/domain/scoring/weights.ts` | 单测断言 7 项和 = 10000 |
| 5 | 打分纯函数 | `src/domain/scoring/score.ts` | 单测：算例三本命中 SPEC 指定 `score_bp`，且覆盖 strong/worth/explore |
| 6 | 硬过滤 | `src/domain/scoring/hardFilter.ts` | 单测：F1–F5 各一条反例被剔除 |
| 7 | 排序器 | `src/domain/scoring/rank.ts` | 单测：6 级 tie-break 每级都被执行到（构造前 k 级全相等的输入） |
| 8 | 档位判定 | `src/domain/scoring/tier.ts` | 单测：8000/6000 边界 + `primary_hit = 0` 封顶 explore |
| 9 | 目录数据 schema | `catalog/` 目录 + `tools/schema.ts` | 缺任一必填字段即 fail |
| 10 | 校验脚本 | `tools/catalog-audit.mjs` | 缺字段 = 0；越界值 = 0；字段数 = 34 |
| 11 | 版权闸门 | `tools/copyright-audit.mjs` | inline + `translation_copyright ∈ {in_copyright, unknown}` → exit 1 |
| 12 | CI | `.github/workflows/ci.yml` | typecheck + 单测 + 三条 audit 全绿 |
| 13 | **危机入口门禁的层 2** | `tools/copy-audit.mjs`（已存在）+ `prebuild` / `postbuild` 接线 | `dist/assets/crisis-*.js` 存在（P8 必须是独立 chunk，否则按文件名收窄的规则静默失效）；空仓跑出**「未验证」而不是「通过」** |
| 14 | **危机入口门禁的层 1** | 组件测试：数 `data-crisis-entry` 节点 | 结果页 + `/about` 共 2 个节点；构造「多一个入口」的 fixture 必须 fail。**这一层没写测试就等于没跑**，不能只因文档写了验收条件就算过 |

**M0 刻意不做**：任何真实书目数据、任何网络请求。M0 的产出是"能证明算式对的骨架"，不是"能看的东西"。

**一处刻意破例**：`src/views/{CrisisView,ResultView,AboutView}.vue` 与 `App.vue` 是**占位实现**，
只为让危机入口的两层门禁真的跑起来（M0-13/14）——层 2 要求 `dist/assets/crisis-*.js` 存在，
层 1 要求能数出真实 DOM 里的 `data-crisis-entry` 节点。没有它们，这两条门禁只能停在"文档写了验收条件"。
它们不是 UI 交付，M1 会整体替换。

### M0 落地状态（2026-10-18）

| 项 | 状态 | 落点 |
|---|---|---|
| 1 仓库骨架 | 完成 | `src/{views,components,domain,engine,data,contracts}/`、`catalog/`、`tools/`、`tests/` |
| 2 Vite + Vue 3 + TS | 完成 | `package.json` / `vite.config.ts` / `tsconfig.json`（`strict` + `noImplicitReturns` + `noUncheckedIndexedAccess`） |
| 3 类型落地 | 完成 | `src/contracts/*.ts` 由 `docs/types-draft.ts` 机械切分（9 个模块，均 ≤300 行） |
| 4 权重与常量 | 完成 | `src/domain/scoring/weights.ts` |
| 5 打分纯函数 | 完成 | `src/domain/scoring/{numeric,fit,score}.ts` |
| 6 硬过滤 | 完成 | `src/domain/scoring/filters.ts`（`FILTER_RULES` 7 条） |
| 7 排序器 | 完成 | `src/domain/scoring/rank.ts`（6 级链） |
| 8 档位判定 | 完成 | `src/domain/scoring/tier.ts` |
| 9 目录数据 schema | 完成 | `tools/schema.mjs`（**从 `src/contracts/book.ts` 派生**必填字段，不手抄清单） |
| 10 校验脚本 | 完成 | `tools/catalog-audit.mjs`（当前状态：**未验证**，书目数据属 M0.5） |
| 11 版权闸门 | 完成 | `tools/copyright-audit.mjs`（当前状态：**未验证**） |
| 12 CI | 完成 | `.github/workflows/ci.yml` —— 只跑 `npm run check`；`check:data` 待 M0.5 接入 |
| 13 危机门禁层 2 | 完成 | `prebuild` / `postbuild` 两个脚本；`npm run build` 已产出 `crisis-*.js` |
| 14 危机门禁层 1 | 完成 | `tests/components/crisis-entry.test.ts`（真实 DOM 计数，含"多一个入口必须 fail"的反例） |
| — 库外路径 D | 完成 | `src/domain/outOfLibrary.ts` + `src/engine/recommend.ts`（SPEC §7.3 新增） |

`npm run check`（typecheck + 单测 + 枚举比对 + 风格门禁）当前**全绿**，61 项测试。
`npm run check:data` 三条闸门在书目数据落地前恒为「未验证」并以非零码退出 —— 这是 SPEC §12 的三态纪律，不是缺陷。

### M0.5 落地状态（2026-10-20，第二轮更新）

| 项 | 状态 | 落点 |
|---|---|---|
| 字段覆盖率与降级 | 完成 | `src/domain/scoring/coverage.ts`；§6.4 三条硬规则；9 条单测（含"未覆盖字段填 1 与填 5 同分"） |
| enriched 层（派生困境标签） | 完成 | `catalog/problem-lexicon.json`（33 标签词表）→ `tools/derive-annotations.mjs` → `public/catalog/enriched/derived.json`；6551 本全覆盖（书名命中 1872 / 标签兜底 4679），`tools/verify-derived.mjs` 15 项硬断言 |
| 按需取书 | 完成 | `src/engine/wide-need.ts`：命中率排序 + 窗口法；实测"发言紧张+怕评价"命中 686 本相关书，138 轮翻完 |
| **60 本核心库** | **完成（60 本）** | `catalog/shards/seed-core-01/02/03.json`；**33 个困境标签零覆盖数 12 → 0**；`tests/data/core-library.test.ts` 10 项硬断言 |
| 核心库 ↔ 候选池身份映射 | 完成 | `tools/map-core-to-candidates.mjs` → `catalog/core-id-map.json`；59/60 唯一映射 + 1 本白名单（《围炉夜话》公版古籍不在池内） |
| 拼音索引 | 改为构建期生成 | `tools/gen-boot-data.mjs` 改用 `pinyin-pro`，去掉手工表；`ü→v`、数字转汉字两处修正（见下） |
| 金标 10 条 + 闸门 | 完成（**认出率 10/10 ｜ 首屏率 9/10**） | `catalog/golden/profiles.json` + `tests/domain/golden.test.ts`；闸门要求各 ≥7/10 |
| LLM 批量补字段（B1） | 未开始（通道受限，见下） | 方案与验收口径已登记在 OPEN-DECISIONS |

> 金标第一次跑就挖出一个 P0：`buildDiagnosis` 组装 `answers` 时丢了第 3 屏五个偏好与 `free_text`，线上所有用户实际都按"全跳答"打分，且 `hasCrisisSignal` 永远读不到自由文本（P0-17 危机互斥从未生效）。已修 + 3 条回归用例。

**第二轮三处必须记住的结论：**

1. **核心库与候选池原本是两个不相交的书集。** `seed-core-01.json` 里 3 条 `source_url` 全部指向候选池里不存在的 subject（《被讨厌的勇气》写的是 26577919，真号 26369699）。没有身份映射时，同一本书会以两个身份各出现一次，而去重按 id 判断看不见。
2. **拼音手工表在 60 本规模上必然错。** `pinyin-pro` 即使在 `toneType:'none'` 下也返回带 `ü` 的音节，`[^a-z]` 一过滤「虑」就剩一个 `l`，`身份的焦虑` 变成 `shen fen de jiao l`，首字母搜索直接失效且不报错。已改为 `ü→v` 并把"出现单字母音节"变成硬错误。
3. **新增正确标注会把旧标注的缺口顶出来。** 补 47 本后金标首屏率从 10/10 掉到 7/10——不是新书抢位，而是《非暴力沟通》缺 `frequent-conflict`、《正念的奇迹》缺 `anxiety`、《思考，快与慢》缺 `judgment-distortion`。按"补事实、不调阈值"处理：只补标签、权重取书里真实主次，没动 8000/6000 两个阈值。

**B1 为何没走云服务：** `cloud-service` 的 LLM 通道只能从浏览器（Origin 必须匹配已绑定应用域名）调用，且官方文档把"前端自建 BFF/Node 代理直连模型服务"列为禁止做法；而 B1 的产物是离线 JSON 数据集，不是运行时后端。为跑一次批处理去开通云后端、再发布页面消耗配额，是把工具用错了地方。本轮改为**直接标注 47 本**（零基建、可逐条复核），批量扩到千本级仍待确定通道。


### M1a 落地状态（2026-10-19）

| 项 | 状态 | 落点 |
|---|---|---|
| 种子数据 + 路由 | 完成 | 13 本种子书（过 34 字段契约）+ 危机资源 + 4 份首屏数据 + vue-router hash 路由 |
| B 问卷 | 完成 | `QuizView` 四屏 + `engine/diagnose.ts`（0.60/0.25/0.15、自由文本命中、主诉显式） |
| C 结果页 | 完成 | `ResultView` 原词回显 / 三组卡 / 库外卡 / 不足 5 本说明 / 无 inline 域说明 |
| D L4 兜底 | 完成 | 0 本不凑数：「这些都不对」+ 重述引导 + 路径 D 按原词扩展 |
| E 调参 | 完成 | `TuneBar` 三组覆写 → `computeResult` 即时重算，不持久化 |
| F 本地计数 | 完成 | `engine/telemetry.ts` + About 隐私三句话 + 聚合展示 + 清零 |
| G 验收 | 自动化全绿 | 95 项测试；用户实走问卷待反馈 |
| H 发布物料 | 完成 | README 中英 + `pages.yml` + 发布文案三稿；GitHub 远程仓库待用户建 |

`check:data` 三条闸门已由「未验证」转绿（catalog 13 本 / 版权 / 首屏体积 4.7KB）。
测试计数从 61 → 95，全部行为锁进组件测试；沙箱 %TEMP% EPERM 已根治（TMPDIR/TEMP 固定进工作区）。

---

## 最终方案 P0/P1/P2 执行状态（2026-10-20）

> **不要和上面的 M1b 混淆**：M1b 是"详情页 / 导入引导"这个产品里程碑，本轮执行的是
> [`decisions/FINAL-PLAN-2026-10-20.md`](./decisions/FINAL-PLAN-2026-10-20.md) §五 列出的
> 四项 P0、五项 P1、四项 P2——它们是**修现在这套东西**，不是加新页面。
>
> 逐项落点与实测数字见下表；"和原计划不一样"的三处（P0-1 审核人 / P1-3 界面一并做 / P1-4 未完成）
> 记在 FINAL-PLAN §9.1。用户指令是「把产品做好、交付可用成品」，且明确跳过 P0-1 里"审核人写谁"
> 的文档部分——危机资源照做可核实化，但不写审核人说明。

| 项 | 状态 | 落点 / 实测 |
|---|---|---|
| **P0-2** 域映射 | 完成 | `catalog/domain-map.json` + `src/data/domain-map.ts`；**6 域 × 33 标签宽池全部 ≥ 20 本**（最小 `family-origin=20`、`attention-scatter=23`），修复前 3/6 域恒为 0 |
| **P0-3** 取消字母序截断 | 完成 | `tools/derive-annotations.mjs` 改 `hash32(book.id)` 轮转窗口；`speaking-block` 派生数 **5 → 236**、`info-overload` 20 → 239、`self-doubt` 6 → 497；保留率最低者从中位数的 0.7% 提到 39.5%（中位 59.9%） |
| **P0-4** 自由文本 | 完成 | `src/engine/free-text-match.ts` 三级匹配 + 词表扩到每标签 18–26 个口语说法；**32 句纯口语金标命中 31/32（97%）、零命中 1/32（3%）**，原为 29% / 64%。唯一漏的是「计划表写得漂亮，第三天就不做了」(`cant-persist`)，**如实记录，未为凑数改语料** |
| **P0-1** 危机资源可核实化 | 完成（跳过审核人文档） | 4 条全部带 `source_url` / `verified_at` / `verification_method`；来源为 gov.cn 国卫医政函〔2024〕259 号、crisis.org.cn、hope9995.com 官方页；`tools/crisis-audit.mjs` 9 项断言（0 条 → 报「未验证」非零退出；超 90 天红灯） |
| **P1-1** 证据分级 | 完成 | `TITLE_EVIDENCE_MIN = 0.85` / 兜底 0.4；强证据池 < 20 本时整池降级并逐本标 `weak_ids`，界面标「相关性较弱」 |
| **P1-2** 噪声预算脚本 | 完成（只报不断） | `tools/sample-audit.mjs` → `catalog/reports/sample-audit.md`，每标签 30 本。**实测书名证据 2274 条 / 兜底 15591 条，27 个标签兜底占比 ≥80%** —— 这条如实写进报表，没有为了让数字好看而调阈值 |
| **P1-3** 理由来源契约 + 界面 | 完成（原计划只做契约，接界面是 P2-1，一并做了） | `src/contracts/recommendation.ts` 的 `ReasonSource` + `src/domain/scoring/reason.ts`；`BookCard` 展开区三档徽章（书里写的 / 你的回答 / 书的标注） |
| **P1-4** 外部金标 | **已跳过（项目决定）** | 用户 2026-10-20 明确指令「不再安排外部人员测试，直接跳过该环节」。`external-profiles.json` 保留空数组作为结构占位，`golden.test.ts` 如实打印「已跳过（项目决定）」。**不伪造外部画像**——伪造的基线比没有基线更糟；将来有人愿意写，填进去即可，代码不用改 |
| **P1-5** 补薄标签 | 完成 | `catalog/shards/seed-core-04.json` 8 本（取悦症 / 过犹不及 / 拖延心理学 / 自控力 / 清醒思考的艺术 / 演讲的力量 / 你的降落伞是什么颜色？/ 吃掉那只青蛙），核心库 **60 → 68 本** |
| **P2-1** 理由来源 UI | 完成 | 见 P1-3 |
| **P2-2** 问卷仪式化 | 完成 | `QuizView` 每屏一句**回执**（如「记下了：话到嘴边说不出口。不用解释原因，我们不需要。」），刻意不解读 |
| **P2-3** 隐私兼容反馈闭环 | 完成 | `src/engine/feedback.ts` + `FeedbackBar.vue`；不存自由文本、上限 200、同诊断只留一条、导出由用户主动触发 |
| **P2-4** 冻结 M2–M4 阅读器路线 | **已推翻（ADR-009）** | 原决策是"不内置阅读器、只给外链"。2026-10-20 自建阅读器上线：字符流 + 引文锚点，零依赖，不引 foliate-js。ADR-001 的选型因此被修订 |
| **新发现（未修）** 自由文本稀释档位 | **待定，需一次拍板** | 把自由文本命中率从 29% 提到 97% 之后才浮出来：命中新标签按 0.15 进 `need_tags`，而 `problem` 是覆盖率口径，于是**分母变大、分子不变**——写一句更具体的描述，前两本从 7827 / 7427 掉到 7127 / 6727（固定 −700 bp），卡在 6000 附近的直接 `worth → explore`。**没顺手改**：它动的是打分语义，会牵动 10 条金标；三个方案见 HANDOVER §困境 7 |

**收尾验证**（本轮新增一道真实浏览器门禁）：

| 门禁 | 结果 |
|---|---|
| `npm run check`（typecheck + 单测 + 枚举 + 风格 + 危机 + 数据） | **30 文件 / 197 条测试全绿**；style-audit 86 文件；crisis-audit 9 项通过 |
| `npm run build` | 通过；危机页仍为独立 chunk（`crisis-*.js` 97.6 kB） |
| `npm run check:data` | 三项全过（68 条记录 / 版权 / 首屏体积） |
| `python tools/smoke-browser.py`（新增） | **真实 Chromium 走完问卷→结果→危机→关于全流程，控制台零报错**，截图存 `.vitest-tmp/shots/` |

> 冒烟脚本当场抓到两条单元测试看不见的问题：① `index.html` 的 meta CSP 里写了 `frame-ancestors`，浏览器**忽略并报错**——删掉并在注释里写明这项防护在当前托管形态下是**缺失**的，不是"已配置"；② 结果页摘要条的断言原先写成「整句出现」，而回显是按匹配片段切的，改成「每段都逐字来自用户写下的话或点选的标签」才是可验证的形态。这两条都是 happy-dom 永远不会报的。

---

## P0-16 / P0-17 / P0-7 落地（2026-10-21）

> 这一轮只做一件事：把 SPEC §2.1 P0 表里**文档写了、代码没有**的三条补齐。
> 补齐过程中发现，三条里有两条不能照抄 v1.2 的定稿文案——照抄会变成假话。

| 项 | 状态 | 落点 / 关键约束 |
|---|---|---|
| **能力门控**（前置） | 完成 | `src/data/capabilities.ts` 的 `READER_AVAILABLE = false`。规格书按"最终形态"写（有内置阅读器），而阅读器属 M2/M4 已在 P2-4 冻结。判断标准只有一条：**用户点下去能不能得到我说会得到的东西**。阅读器上线只翻开关，被挡住的那几段定稿文案原样启用 |
| **P0-16** 域级危机条 | 完成 | `src/components/CrisisBar.vue`；情绪与自我域结果页恒显示，替换原来那行小链接（不叠加）。`data-crisis-entry` 全项目配额**仍恒为 2**（结果页 1 + 关于页 1），`AppHeader` / `CrisisView` / 详情页明令不得挂，由 `tests/components/crisis-entry.test.ts` 数真实 DOM 锁定 |
| **P0-17** 无 inline 域说明条 | 完成 | `src/components/NoInlineNote.vue`（可折叠 `<details>`）。**显示与否由数据算出来**：`domainsWithoutInline()` 实时扫书库得 `relationship`/`habits`/`thinking`/`transition`——v1.2 写死的三个域名里含 `emotion`，而情绪域其实有《曾国藩家书》，照抄会在一个有公版书的域里说"基本都还在版权期内"。书库一长出来说明条自动消失，不需要谁记得回来删 |
| **P0-7** 书籍详情页 | 完成 | `/book/:id`：`BookHead`（书名 → `match_brief` → **可用性区块**）+ `BookReason`（命中依据 → 讲什么 → 拿到什么 → 边界 → 逐句来源）+ 档位 + 书目信息 + 同主题 3 本。无诊断时退化成"书目页"，不假装知道用户是谁。顺序是硬验收：可用性在书名之后、理由段之前 |
| 三态动词不复用 | 完成 | `src/data/availability.ts`（公版·站外可读 / 需自备 / 站外查看）、`book-links.ts`（公版全文 → 微信读书 → 买一本 → 图书馆 → 豆瓣，**顺序有语义**，卡片只取前 4 个保证被砍的是豆瓣而非图书馆） |
| 共享层收口 | 完成 | `book-labels.ts`（枚举→中文一份）、`library-index.ts`（`TAG_DOMAIN` 以问卷选项为唯一真源 + `sameTopicBooks`）。`BookCard` 281 → 271 行且多了详情入口；详情页拆 1 视图 + 2 组件，`.block-title` 进 `styles/sections.css` |

**收尾验证**：

| 门禁 | 结果 |
|---|---|
| `npm run check` | **35 文件 / 229 条测试全绿**（新增 `crisis-bar` 6 + `no-inline-note` 7 + `book-detail` 7 + `copy-audit` 8 + `doc-audit` 5）；style-audit **97 文件**；crisis-audit / 书目层校验全过 |
| `npm run build` | 通过；危机页仍为独立 chunk；**postbuild 现在同时扫 dist 段文案** |
| `python tools/smoke-browser.py` | 通过，**30 条断言全绿**，其中 9 条是这轮新加的：结果页危机入口恰好 1、详情页书名与卡片一致、可用性区块在书名之后且在理由段之前（实测 avail 426 / reason 637）、外链 ≥2 且都带 `rel=noopener`、详情页不挂危机入口、详情页来源只在三档内、能退回推荐、关于页危机入口恰好 1 |

**顺带把两条僵尸门禁接上了线**（详见 SPEC v2.8）：

| 门禁 | 接线前 | 接线后 |
|---|---|---|
| `tools/copy-audit.mjs` | 从未进过 `check`；一跑 5 处命中，其中 4 处是规则扫错目标 | `audit:copy`（src 段）进 `check`，dist 段进 `postbuild`；**0 命中** |
| `tools/doc-audit.mjs` | 从未进过 `check`；一跑 18 处命中，15 处是 `✓` `✗` 被当 emoji | `audit:doc` 进 `check`；修掉 8 处真 emoji + 3 处表格列数；**0 命中** |
| 两条脚本的自测 | 没有——改坏了也没人知道 | `tests/tools/copy-audit.test.ts` 8 条 + `doc-audit.test.ts` 5 条，**既测能红、也测不误红** |

---



## 收尾：把未完成项全部做完（2026-10-20 夜）

> 用户指令：「不再安排外部人员测试，直接跳过该环节，把项目中所有尚未完成的功能和任务全部实现并补充完整，
> 确保代码可以正常运行并具备提交条件。完成后整理好可上传至 GitHub 的仓库。」
> 于是这一轮的目标不是"再加一点"，而是**把文档里写了、代码里没有的东西补上，并且让它跑得起来**。

| 项 | 状态 | 落点 / 关键约束 |
|---|---|---|
| **P0-8 / P0-9 / P0-10** 导入解析 | 完成 | `src/engine/import/`：`zip.ts`（**只认中央目录**，本地头的文件名可被伪造）/ `epub.ts` / `txt.ts` / `html.ts`。零依赖：解压用平台 `DecompressionStream('deflate-raw')`，HTML 用流式去标签而不是 DOM 解析（原书 HTML 里的 `<script>` 与 `onload` 一行都不会执行）。编码判定顺序 `BOM → 严格 UTF-8(fatal) → UTF-16LE 启发式 → GB18030`——**顺序错了会得到乱码而不报错**，因为 `TextDecoder('gb18030')` 对任何字节都能解码 |
| **P0-11** 本地书库 | 完成 | `src/storage/db.ts` 七表 + `library.ts`。删书删六处，**不删** annotations / notes——用户写下的字不该因为删书消失。新增 `E_STORAGE_FAILED`：隐私模式下数据库根本打不开，这时报"空间不够"会让人白删一堆书 |
| **P0-11** 阅读器 | 完成 | `ReaderView` + 5 个子组件（Bar / Toc / Marks / Search / Stage）。**按段落分页**，不按字符硬切；进度记「章节 + 字符偏移」而不是页码；换字号后 `pageOfParagraph` 把用户留在原段落 |
| **P0-12** 双锚点定位 | 完成 | `src/domain/locator.ts` 四级降级：偏移精确 → 同章引文（就近取）→ 全书引文 → 章首。**不伪造 CFI**：自建渲染下不存在合法 CFI（ADR-009） |
| **P0-14** 离线 | 完成 | `public/sw.js` + `src/lib/offline.ts`。导航网络优先（要拿新入口），静态资源缓存优先（哈希文件名自带版本）；只缓存同源 GET——跨域外链书源不进缓存，那不叫离线可用，那叫分发 |
| **P0-13** 内置直读 | **改为示例书 1 本** | `public/samples/reading-sample.txt`（本站自写，一千余字，四章）。不放第三方公版全文，理由见 SPEC §2.1 裁量条款。它走**与导入完全相同**的链路，所以试出来的手感就是真手感 |
| **P1-4** 外部金标 | **跳过（用户决定）** | `golden.test.ts` 如实打印「已跳过（项目决定）」，不再是「未采集」 |
| **书架入口打通** | 完成 | 详情页 `findLocalCopy` 只按**规范化书名**匹配，且要求 ≥2 字：ISBN 在导入文件里十有八九是空的，作者译名能有三四种写法；短书名有歧义，宁可不给"打开"也不要打开错的书 |
| **令牌门禁（新）** | 完成 | `tools/token-audit.mjs`。起因：阅读器 5 个文件引用了 4 个从未定义的令牌（`--surface-raised` / `--surface-inverse` / `--text-inverse` / `--shadow-pop`），**类型、样式、构建全绿**——CSS 变量拼错不报错，只是那条声明被丢掉。自测 7 条，既测能红也测不误红 |
| **GitHub 仓库整理** | 完成 | README 重写 / LICENSE（MIT + 书目数据例外）/ CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG / `.editorconfig` / Issue 模板 3 个 + 配置 / PR 模板 / CI 升 Node 22 |

**收尾验证**：

| 门禁 | 结果 |
|---|---|
| `npm run check` | **43 文件 / 306 条测试全绿**（新增 `locator` 13 + `paginate` 6 + `shelf` 12 + `plain` 7 + `token-audit` 7，另有 `import` 15 / `booklist` 10 / `problem-denominator` 5 在上一轮） |
| `style-audit` | 133 文件；`token-audit` 42 文件 362 处引用、0 未定义；`copy-audit` src 114 文件 0 命中 |
| `npm run build` | 通过；危机页仍是独立 chunk（`crisis-*.js`）；postbuild 同时扫 dist 段 |
| `python tools/smoke-browser.py` | **42 条断言全绿**，新增「示例试读 → 翻章 → 选区划线 → 划线抽屉 → 回书架」13 条 |

> 冒烟当场抓到两个**单测永远看不见**的缺陷，都值得记下来：
> ① **响应式 Proxy 写不进 IndexedDB**（`#<Object> could not be cloned`）。进度里的 `furthest_locator` 取自 `ref`，
> 读出来是 Proxy，`void session.saveProgress(...)` 把异常吞了，表面症状是"进度有时候不保存"。
> 修法是双保险：`lib/plain.ts` 在写库前摊平 + 进度里显式重建 locator。
> ② **段落首子节点是 Vue 的 fragment 注释锚点**，直接 `firstChild` 建 Range 会得到折叠选区，
> 症状是"点了划线没反应"。这是测试脚本的问题，但它说明**真实用户的鼠标选区与脚本伪造的选区不是一回事**。

---

## 数据生产的两种成本（M0.5 前必须选定）

60 本书目分两部分，成本差 5 倍：

| 部分 | 本数 | 单本耗时 | 合计 | 说明 |
|---|---|---|---|---|
| 字段结构化（34 字段 + 文案 5 条） | 53 | 25–40 分钟 | **22–35.5 小时** | 纯人工，无法外包 |
| 公版书 inline 校注 | 7 | 2–3 小时 | **14–21 小时** | 复用清代及以前旧注 + 自写一篇导读；《围炉夜话》《曾国藩家书》无旧注传统，成本更低 |
| **合计** | **60** | — | **36–56.5 小时** | PRD §10.6 的 37–58 是这一行的取整口径 |

> 数字以 [`PRD.md` §10.6](./PRD.md) 为唯一出处；本表只是把 53 + 7 的拆分摊开，方便排期。

**降本方案（推荐）**：inline 部分直接采用已校勘好的公版版本（维基文库 / 标准电子书 / PG），自己只写 300–500 字导读 —— 单本 2–3 小时而非 8–12 小时。代价是版本选择受限于现成质量，不能挑最讲究的底本。

---

## 依赖与风险

| 风险 | 触发信号 | 应对 |
|---|---|---|
| 60 本书全挤在 2 个困境域 | 覆盖度报告里某域 0 本 | 补书前先定「每域 ≥5 本」的下限，宁可少而均 |
| 闸门 0 不过 | 金标 top1 落 strong < 7/10 | 先查 `primary_hit` 与 25/50/75 取值，再查权重，**最后才看阈值** |
| 文案写不出来 | 单本文案耗时 > 60 分钟 | 降到 30 本先行；不要降低文案标准 |
| 阅读器拖垮 M2 | M2 超期 2 周 | 阅读器降级为"外链到你自己的阅读器"，M3 再补 |

---

## 不做的事（防止范围蔓延）

- 不做社区、评论、关注、打卡、排行榜
- 不做 PDF、不做漫画、不做 TTS、不做 OPDS
- 不做账号、不做云同步、不做任何上报式埋点（仅本地匿名计数 + 隐私声明，见 SPEC §10.2 v2.2 裁决）
- 不接 LLM 打分或生成理由（结果不可复现）
- 不做豆瓣评分（无公开 API，且"大众平均" ≠ "对你的适配度"）
