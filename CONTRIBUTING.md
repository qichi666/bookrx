# 参与贡献

先谢谢。这个项目最需要的不是更多功能，而是**真实用例**：你遇到的困境、它给出的书单、以及你觉得不对的地方。

## 最省时间的三种贡献

| 你想说 | 去哪儿 | 请带上 |
|---|---|---|
| 书单不对味 | [Issues → 书单反馈](/issues/new?template=book_fit.yml) | 你的困境原话 + 给出的 5 本 + 你的预期 |
| 导入失败 | [Issues → Bug](/issues/new?template=bug_report.yml) | 格式（EPUB/TXT）、大小、错误码、浏览器 |
| 代码改动 | Pull Request | 见下面的「改代码前」 |

> **不要附上受版权保护的全文**。贴一段引文可以，整本文件不行。

## 改代码前

```bash
npm ci
npm run check     # 必须先绿
npm run build     # 构建期有两道 crisis chunk 断言
```

`npm run check` 里的每一条门禁都对应 `docs/SPEC.md` 的条款。**门禁红了改代码，不要改规则**——规则是判据，不是可调参数。真要放宽某一条，先改文档，再改脚本，并在 PR 描述里写明理由。

### 三条硬约束（会被 CI 拦住）

1. **零 emoji**：界面与代码里都不许出现 emoji（`tools/style-audit.mjs`）。
2. **零硬编码色值**：除 `#fff` / `#000` 外一律走 `src/tokens.css` 的令牌，且不许引用不存在的令牌（`tools/token-audit.mjs`）。
3. **零上报**：不得引入任何分析、埋点、错误上报。`/crisis` 页面尤其是一行都不许有。

### 单文件行数

`src/` 下单文件 ≤ 300 行（`tools/` ≤ 400）。超了几乎总是"塞了第二个职责"——拆组件，不要放宽上限。

## 提交信息

用 `<type>(<scope>): <做了什么>`，中文正文写"为什么"而不是"改了什么"（diff 已经说明后者）。

```
fix(scoring): 自由文本新标签不再稀释 problem 因子分母
feat(reader): 按段落分页 + 字号变化后回到原段落
docs(spec): 补 bookrx.booklist/1 文件格式
```

常用 type：`feat` / `fix` / `refactor` / `docs` / `test` / `chore`。

## Pull Request

- 一个 PR 一件事。顺手重构请单独开 PR。
- 新增**行为**必须有测试；新增**门禁**必须同时测「能红」和「不误红」。
- 改了文案请顺手跑 `npm run audit:copy`。
- PR 描述里写清：改了什么、为什么、怎么验证的（贴命令与结果）。

## 报告安全问题

见 [SECURITY.md](SECURITY.md)。不要开公开 Issue。

## 行为准则

见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
