# BookRx（书方）· 困境 → 书 → 读

> 输入你此刻的困境，得到 5 本确实对味的书；能读的直接在这里读，不能读的给你找书路径。
> **无账号、无上报、无第三方请求。** 推荐与阅读全部在你的浏览器里完成。

Enter what you're struggling with right now; get five books that actually fit — then read them right here, or get a path to where you can. **No account, no tracking, no third-party requests.** Everything runs in your browser.

这是一个纯前端应用，四件事都在本地做完：

- **推荐**：七因子基点打分 + 硬过滤 + 档位分档。同一输入永远得到同一结果，不接大模型、不接推荐服务。
- **导入**：拖进 EPUB 或 TXT，浏览器里解压、切章、落库（IndexedDB）。零依赖，不用上传。
- **阅读**：真翻页（按段落分页）、字号 / 行距 / 底色、目录、书内搜索、划线、笔记。换字号后位置不丢。
- **离线**：装一次 Service Worker，第二次打开不需要联网（除第一次加载）。

书库永远小于人的困境。库内没有合适的书时，它会明说「这些都不对」并给出库外书名，而不是拿三本不对症的书把列表填满。

## 三条底线

1. **危机优先**：诊断命中危机信号时，只给心理援助热线、不给推荐。结果页与关于页各留一个援助入口，由构建门禁守护（少了或多了一个，构建直接失败）。
2. **不凑数**：库内没有合适的书就明说，引导重述困境，同时给出库外书名。
3. **数据只在你机器上**：没有服务器可上报。About 页的「大家都卡在哪」是本机匿名计数；反馈只存域 / 标签 / 档位三档计数，**不记录你写的任何一句话**，想带走可以自己导出 JSON。

## 快速开始

```bash
npm install
npm run dev        # 本地开发（http://localhost:5173）
npm run check      # 全量门禁：类型 + 单测 + 枚举比对 + 风格 + 令牌 + 文案 + 文档 + 危机 + 数据
npm run build      # 产物含独立 crisis chunk（构建期断言）
```

想确认真实浏览器里点得通（单测跑在 happy-dom 里，看不见 CSS、路由、CSP）：

```bash
npm run build
python tools/smoke-browser.py   # 需要 Playwright 的 Python 包 + chromium；端口没人监听会自己起 preview
```

脚本走完「问卷 → 结果 → 危机页 → 关于页 → 导入 → 阅读 → 划线」，断言原词回显逐字来自用户、每句理由都有来源徽章、反馈不落自由文本，并检查控制台零报错。截图落在 `.vitest-tmp/shots/`。

> 仅支持 HTTPS（或 localhost）：Web Crypto 需要 secure context，不支持 `file://` 直接打开。
> HTTPS (or localhost) only — Web Crypto requires a secure context; `file://` won't work.

## 门禁就是规格

这个项目把「说过的话」尽量变成「跑得起来的检查」。`npm run check` 里的每一条都对应一份文档条款，并且**每条都自己带测试**（既证能红、也证不误红）：

| 命令 | 拦什么 |
|---|---|
| `typecheck` | 契约与实现不一致 |
| `test` | 打分、金标、导入、分页、定位降级、文案一致性 |
| `check:enums` | SPEC / ARCH 与 `src/contracts` 的枚举分叉 |
| `audit:style` | emoji、硬编码色值、单文件超长 |
| `audit:token` | `var(--x)` 引用了不存在的令牌（CSS 不会报错，只会静默丢失） |
| `audit:copy` | 禁词、营销话术、危机页埋点泄漏 |
| `audit:doc` | 文档里的过期声明 |
| `audit:crisis` | 危机资源的可核实性 |
| `data:verify` / `data:map-core` | 书目数据、派生标注与规则逐位一致 |

## 导入与版权

- 本站**不提供任何版权书的正文**，也不绕过 DRM。导入的是你自己合法持有的文件。
- 明确拒绝：受 DRM 保护的书（`E_DRM_PROTECTED`）、超过 50 MB 的文件、没有文字层的扫描件。
- 导入书**不进入推荐池**（`content_ready='readable'` 会被硬过滤挡掉）——我们不对自己没读过的书做推荐。
- 内置示例书由本站编写，随代码分发，不涉及第三方版权。

## 文档

- [`docs/SPEC.md`](docs/SPEC.md) — 唯一契约；其余文档与它冲突时以它为准
- [`docs/ARCH.md`](docs/ARCH.md) — 架构、错误码表、黄金算例
- [`docs/PLAN.md`](docs/PLAN.md) — 里程碑与执行状态
- [`docs/HANDOVER.md`](docs/HANDOVER.md) — 交接：进度、已知陷阱、下一步
- [`docs/decisions/`](docs/decisions) — 架构决策记录（ADR）

## 参与

见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。最需要的两种反馈：

1. **书单不对味**：把你实际遇到的困境和它给出的 5 本贴出来（`Issues → 书单反馈`）。
2. **导入失败**：附上文件格式（EPUB / TXT）、大小、错误码，**不要附全文**。

## 许可

代码以 [MIT](LICENSE) 授权。`catalog/` 下的书目数据是演示用数据集，**不在 MIT 授权范围内**，请勿单独抽取再分发。
