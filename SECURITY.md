# 安全策略

## 报告漏洞

**不要开公开 Issue。** 请用 GitHub 的 [私密漏洞报告](https://docs.github.com/zh/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)（仓库 → Security → Report a vulnerability），或在仓库维护者的主页找到联系邮箱。

请在报告里写清：影响范围（哪个页面 / 哪条链路）、复现步骤、你的浏览器与版本。**不要附带受版权保护的全文或任何人的个人信息。**

我们会在 7 天内给第一次回复；修复后会在 Release 说明里致谢（除非你要求匿名）。

## 本项目的安全模型

这个应用没有后端、没有账号、不上传任何数据。所以它的攻击面只有三处，恰好也是我们最在意的三处：

### 1. 导入的文件（不可信输入）

用户拖进来的 EPUB / TXT 是**不可信数据**。防护方式：

- ZIP 只按**中央目录**解析（本地头里的文件名与扩展字段可能被伪造），路径中含 `..` 的条目一律拒绝；
- 解压只支持 store 与 deflate，其余压缩方法直接判 `E_IMPORT_CORRUPT_ZIP`；
- HTML 只做**流式去标签**提取文本，不执行脚本、不插入 DOM（不用 `DOMParser` 渲染原书 HTML），因此书里的 `<script>`、`onload`、外链图片都不会生效；
- 单文件上限 50 MB，超出直接拒绝，避免内存打满；
- 字体混淆（`idpf.org/2008/embedding`）只记为警告；其他加密算法一律判 `E_DRM_PROTECTED` 并拒绝——**本项目不实现、不协助绕过 DRM**。

### 2. 渲染（XSS）

所有用户可见文本都经过 Vue 的文本插值（不使用 `v-html`）。如果你在某处看到 `v-html`，那是一个漏洞，请报告。

### 3. 依赖

依赖面刻意做小：运行时只有 `vue` + `vue-router`。ZIP 解压用平台内置的 `DecompressionStream`，不引第三方解压库。

## 已知的边界（不是漏洞）

- **本机数据可被清除**：浏览器清站点数据 / 无痕模式退出即消失。这是"无账号"的代价，不是缺陷。
- **同源脚本可读数据**：任何能在本站执行脚本的人都能读 IndexedDB。这正是我们不引入任何第三方脚本的原因。
- **导入书的标注可能失效**：换版式后引文锚点可能定位不到，此时会明确提示"找不回原位"，但**不删除**你的划线。
