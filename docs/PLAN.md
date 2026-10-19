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
