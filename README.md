# BookRx（书方）· 困境 → 书

> 输入你此刻的困境，得到 5 本确实对味的书 + 直接可读的替代路径。
> **无账号、无上报、无网络请求。**

Enter what you're struggling with right now; get five books that actually fit — plus paths you can start reading immediately. **No account, no tracking, no network requests.**

这是一个纯前端应用：推荐由本地确定性算法完成（七因子基点打分 + 硬过滤 + 档位分档），同一输入永远得到同一结果。书库里没有的书，会以「未入库」卡片直接列出书名与找书路径，而不是拒绝回答——书库永远小于人的困境，我们的库存问题不该变成你的空手而归。

This is a pure front-end app: recommendations come from a local deterministic algorithm (seven-factor basis-point scoring, hard filters, tiered ranking). Same input, same output, every time. Books not in the library are listed as "未入库" (out-of-library) cards with title and where to find them — a small library must never become an empty-handed user.

## 三条底线 / Three commitments

1. **危机优先 / Crisis first**：诊断命中危机信号时，只给心理援助热线、不给推荐；结果页与关于页各留一个援助入口，由构建门禁守护（少了或多了一个入口，构建直接失败）。
   When the diagnosis matches crisis signals, the app shows helplines instead of recommendations. Two permanent help entries (result page & about page) are guarded by build gates.
2. **不凑数 / No padding**：库内没有合适的书就明说「这些都不对」，引导你重述困境，同时给出库外书名——永远不会拿三本不对症的书把列表填满。
   If nothing in the library fits, it says so, asks you to rephrase, and lists out-of-library titles — never pads the list with wrong books.
3. **数据只在你机器上 / Data stays local**：所有数据只存本机浏览器，卸载即消失；没有服务器可上报，About 页的「大家都卡在哪」是本机匿名计数。
   Everything lives in your browser and disappears when you uninstall. The "what others struggle with" view is built from local anonymous counters only.

## 快速开始 / Quick start

```bash
npm install
npm run dev        # 本地开发 / local dev
npm run check      # typecheck + 单测 + 枚举比对 + 风格门禁 / full gate
npm run build      # 产物含独立 crisis chunk（构建期断言）/ crisis chunk asserted
```

> 仅支持 HTTPS（或 localhost）：Web Crypto 需要 secure context，不支持 `file://` 直接打开。
> HTTPS (or localhost) only — Web Crypto requires a secure context; opening via `file://` is not supported.

## 文档 / Docs

- [`docs/SPEC.md`](docs/SPEC.md) — 唯一契约（v2.2）/ the single contract; all other docs defer to it
- [`docs/ARCH.md`](docs/ARCH.md) — 架构与黄金算例 / architecture & the golden scoring example (§3.9)
- [`docs/PLAN.md`](docs/PLAN.md) — 里程碑与任务 / milestones & tasks

## 安全与版权 / Safety & copyright

- 公版书直读（inline）仅限可证明公有领域的文本，`npm run audit:copyright` 构建期强制——**证明不了就当作有版权**。
  Inline (read-in-app) texts are limited to provable public-domain works, enforced at build time. **If it can't be proven, it's treated as copyrighted.**
- 内容预警（自杀 / 暴力等 7 项）驱动硬过滤；「临终 / 丧亲」类可由用户显式放行，创伤类不可豁免。
  Seven content warnings drive hard filters; terminal-illness content can be opted in explicitly, trauma content cannot.

## License

待定（随 v0.1 发布确定）/ To be decided at v0.1 release.
