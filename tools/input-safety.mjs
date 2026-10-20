#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 不可信内容防御门禁。
 *
 * 背景：用户导入的 EPUB 是**不可信输入**——书里可以带 `<script>`、`onload=`、
 * 内嵌 iframe。第三方 EPUB 渲染库的官方文档明确警告过这件事（WebKit 会让
 * `iframe sandbox` 失效，必须靠 CSP 兜底）。
 *
 * 本项目的防线是结构性的，不是拦截式的：
 *  ① 导入层只把 XHTML **流式去标签成段落文本**，再把文本节点渲染到 DOM——
 *     没有把书里的 HTML 交给浏览器解析，所以书里的脚本没有执行入口；
 *  ② 静态站的 CSP 里 `script-src 'self'`，且不含 `'unsafe-inline'`。
 *
 * 这两条都不是"当前恰好如此"，而是**必须一直如此**。所以这里把它们变成检查：
 * 一旦有人为了省事写 `v-html`，或者给 CSP 加 `'unsafe-inline'`，构建就红。
 *
 * 三态纪律：扫到 0 个文件只能报「未验证」，不能报通过。
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const INDEX = join(ROOT, 'index.html');

/** 原始 HTML 落点。命中任意一条就说明「书里的 HTML 可能被交给浏览器解析」 */
const FORBIDDEN = [
  { re: /\bv-html\b/, why: 'v-html 会把字符串当 HTML 解析，导入书的内容正是这种字符串' },
  { re: /\.innerHTML\s*=/, why: 'innerHTML 赋值等于把内容交给浏览器解析' },
  { re: /\.outerHTML\s*=/, why: 'outerHTML 赋值同上，且会替换掉宿主元素' },
  { re: /insertAdjacentHTML/, why: 'insertAdjacentHTML 是 innerHTML 的另一个入口' },
  { re: /document\.write\s*\(/, why: 'document.write 会重建文档，且不受模块作用域约束' },
  { re: /\bsrcdoc\b/, why: 'srcdoc 会把整段 HTML 当文档执行' },
  { re: /allow-scripts/, why: "iframe 的 allow-scripts 与不用 iframe 的约定冲突" },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|vue|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** 去掉注释再扫：注释里提到 v-html 是在解释「为什么不用」，不该被判红 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function main() {
  const files = walk(SRC);
  if (files.length === 0) {
    console.error('input-safety：src 下没扫到任何文件 —— 未验证（不是通过）');
    process.exit(1);
  }

  const hits = [];
  for (const f of files) {
    const text = stripComments(readFileSync(f, 'utf-8'));
    const lines = text.split('\n');
    for (const rule of FORBIDDEN) {
      lines.forEach((line, i) => {
        if (rule.re.test(line)) {
          hits.push(`${relative(ROOT, f).replace(/\\/g, '/')}:${i + 1}  ${rule.why}`);
        }
      });
    }
  }

  // CSP：必须是「不允许内联脚本」的那一档
  let html;
  try {
    html = readFileSync(INDEX, 'utf-8');
  } catch {
    console.error('input-safety：读不到 index.html —— 未验证（不是通过）');
    process.exit(1);
  }
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
  const cspProblems = [];
  if (csp === null) {
    cspProblems.push('index.html 没有 CSP meta');
  } else {
    const policy = csp[1];
    if (!/script-src[^;]*'self'/.test(policy)) cspProblems.push("CSP 的 script-src 没有限定 'self'");
    const scriptSrc = /script-src([^;]*)/.exec(policy);
    if (scriptSrc && /unsafe-inline|unsafe-eval|\*/.test(scriptSrc[1])) {
      cspProblems.push('CSP 的 script-src 含 unsafe-inline / unsafe-eval / *');
    }
    if (!/object-src\s+'none'/.test(policy)) cspProblems.push("CSP 没有 object-src 'none'");
    if (!/base-uri\s+'self'/.test(policy)) cspProblems.push("CSP 没有 base-uri 'self'");
  }

  console.log(`input-safety：扫了 ${files.length} 个源文件 + index.html 的 CSP`);
  if (hits.length > 0) {
    console.error('\n[失败] 出现原始 HTML 落点（导入内容会被交给浏览器解析）：');
    for (const h of hits) console.error(`  ${h}`);
  }
  if (cspProblems.length > 0) {
    console.error('\n[失败] CSP 不满足最低要求：');
    for (const p of cspProblems) console.error(`  ${p}`);
  }
  if (hits.length > 0 || cspProblems.length > 0) process.exit(1);

  console.log('[通过] 无 v-html / innerHTML / srcdoc / allow-scripts；CSP 不允许内联脚本');
}

main();
