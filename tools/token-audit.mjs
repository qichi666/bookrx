#!/usr/bin/env node
/**
 * 令牌引用门禁：`var(--x)` 里的 --x 必须真的有人定义。
 *
 * 为什么需要它：CSS 自定义属性拼错**不会报错**，浏览器只是把这条声明丢掉。
 * 于是 `--surface-raised` 写错成 `--surface-raise` 的效果是"背景消失"，
 * 而不是"构建失败"——在白底上看着还像正常的，换到暗色主题才发现整块塌了。
 * 2026-10-20 实测：阅读器 5 个文件引用了 4 个从未存在的令牌（--surface-raised /
 * --surface-inverse / --text-inverse / --shadow-pop），构建、类型、样式门禁全绿。
 *
 * 判定口径：
 *  · 全局令牌来自 `src/tokens.css`（只认声明，不认注释里提到的名字）；
 *  · 组件**自己**在同名文件里声明的 `--x:` 也算数（局部变量是合法用法）；
 *  · `var(--x, 回退值)` 仍然算引用错误——回退值能救显示效果，但救不了拼错的意图。
 *
 * 三态同其他门禁：扫到 0 个文件、或找不到 tokens.css = 未验证，非零退出。
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TARGETS = ['src'];
const EXTS = ['.vue', '.css', '.scss'];
const TOKENS = 'src/tokens.css';

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/**
 * 只取「声明」：`--x:` 后面必须跟值，注释里提到 `--x` 不算定义。
 * 必须允许行内声明（`.box { --gap: 8px }`）——组件局部变量基本都长这样，
 * 只认行首会把它们全判成未定义，于是这条门禁天天误红、很快被人关掉。
 */
function declared(src) {
  const out = new Set();
  for (const m of src.matchAll(/(?:^|[\s{;])(--[a-z0-9-]+)\s*:/gm)) out.add(m[1]);
  return out;
}

const files = TARGETS.flatMap((t) => walk(join(ROOT, t)));
if (files.length === 0) {
  console.error('[未验证] src 下没扫到任何 .vue/.css 文件 —— 不得报"通过"');
  process.exit(1);
}

const tokenPath = join(ROOT, TOKENS);
if (!existsSync(tokenPath)) {
  console.error(`[未验证] 找不到 ${TOKENS} —— 全局令牌的定义源不存在，比的是空集合`);
  process.exit(1);
}

const globalTokens = declared(readFileSync(tokenPath, 'utf8'));
if (globalTokens.size === 0) {
  console.error(`[未验证] ${TOKENS} 里一个令牌都没抽到 —— 解析口径可能已失效`);
  process.exit(1);
}

/**
 * 注释里出现的 `var(--x)` 不算引用 —— 注释是给人看的历史说明，
 * 让「已删掉的旧写法」把门禁弄红，等于逼人删掉解释，最后没人知道为什么改。
 * 用空格替换而不是删除，是为了让行号继续对得上原文件。
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

const errors = [];
let refs = 0;

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const raw = readFileSync(f, 'utf8');
  const src = stripComments(raw);
  const local = declared(src);
  const lines = raw.split('\n');
  for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
    refs += 1;
    const name = m[1];
    if (globalTokens.has(name) || local.has(name)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const hint = lines[line - 1]?.trim().slice(0, 60) ?? '';
    errors.push(`${rel}:${line}：引用了未定义的令牌 ${name} —— ${hint}`);
  }
}

if (refs === 0) {
  console.error('[未验证] 一处 var(--x) 都没扫到 —— 扫描规则可能已经不匹配当前写法');
  process.exit(1);
}

console.log(`token-audit：扫了 ${files.length} 个文件、${refs} 处引用；全局令牌 ${globalTokens.size} 个`);

if (errors.length) {
  console.error(`\n[失败] ${errors.length} 处引用没有定义：`);
  for (const e of errors.slice(0, 40)) console.error('  ✗ ' + e);
  if (errors.length > 40) console.error(`  … 另有 ${errors.length - 40} 处`);
  process.exit(1);
}
console.log('[通过] 所有 var(--x) 都有定义');
