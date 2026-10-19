# BookRx（书方）· 困境 → 书

> 输入你此刻的困境，得到 5 本确实对味的书 + 直接可读的替代路径。**无账号、无上报、无网络请求。**

这是一个纯前端应用：推荐由本地确定性算法完成（七因子基点打分 + 硬过滤 + 档位分档），同一输入永远得到同一结果。书库里没有的书，会以「未入库」卡片直接列出书名与找书路径，而不是拒绝回答。

## 状态

- **M0 已完成**：打分内核、数据 schema 与校验脚本、CI、危机入口两层门禁；61 项测试全绿（`npm run check`）。
- **进行中（M1a）**：问卷 / 结果页真实现、种子书目（12 本）、本地计数与隐私声明。
- **书库**：首发目标 60 本，当前为种子数据，标注待 M0.5 全量生产。

## 快速开始

```bash
npm install
npm run dev        # 本地开发
npm run check      # typecheck + 单测 + 枚举比对 + 风格门禁
npm run build      # 产物含独立 crisis chunk（构建期断言）
```

> 仅支持 HTTPS（或 localhost）环境：Web Crypto 需要 secure context，不支持 `file://` 直接打开。

## 文档

- [`docs/SPEC.md`](docs/SPEC.md) — 唯一契约（v2.2），其余文档与之冲突时以 SPEC 为准
- [`docs/ARCH.md`](docs/ARCH.md) — 架构与算例（§3.9 黄金算例锁定打分行为）
- [`docs/PLAN.md`](docs/PLAN.md) — 里程碑与任务

## 安全与版权

- 危机资源条与推荐结果互斥呈现，入口常驻（`data-crisis-entry` 两层门禁守护）。
- 公版书直读（inline）仅限可证明公有领域的文本，`npm run audit:copyright` 构建期强制——**证明不了就当作有版权**。

## License

待定（发布时随 M1a/H 步确定）。
