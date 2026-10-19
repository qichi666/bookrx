#!/usr/bin/env node
/**
 * 对比度守门脚本（BookRx）
 *
 * 目的：把「文字写进文档的对比度」变成「构建期会红的检查」。
 * 数字写在文档里会过期，脚本不会——谁改了色，谁当场看到红。
 *
 * 用法：
 *   node tools/contrast-check.mjs           # 人读的表 + 失败即 exit 1
 *   node tools/contrast-check.mjs --json    # 机器读（CI 里存 artifact 用）
 *   node tools/contrast-check.mjs --quiet   # 只输出结论
 *
 * 建议接入（package.json）：
 *   "scripts": { "check:contrast": "node tools/contrast-check.mjs", "prebuild": "npm run check:contrast" }
 *
 * 判据（WCAG 2.1）：
 *   - 正文文本  ≥ 4.5:1（1.4.3 AA）
 *   - 大字文本  ≥ 3:1（本项目未使用，字重上限 590，不按大字豁免）
 *   - 图形/UI  ≥ 3:1（1.4.11 非文本对比）
 *   - 禁用态文本豁免 4.5:1，但仍要求 ≥ 3:1「看得见但点不动」（本项目自定，比 WCAG 严）
 *
 * 修改色值时的正确姿势：
 *   1) 改 docs/design-tokens.json
 *   2) 跑本脚本，红了就改回去
 *   3) 不要为了让脚本变绿而去调 THRESHOLD —— 阈值是判据，不是参数
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = join(HERE, '..', 'docs', 'design-tokens.json');

const ARGS = new Set(process.argv.slice(2));
const AS_JSON = ARGS.has('--json');
const QUIET = ARGS.has('--quiet');

/* ------------------------------------------------------------------ *
 * 27 个色对：这是本项目的全部「文字/图形压在底色上」组合。
 * 新增一个 surface 或一个文字层，必须在这里加一行，否则等于没验。
 * ------------------------------------------------------------------ */
const PAIRS = [
  // ---- 浅色主题：正文 15 组 ----
  { theme: 'light', fg: 'fg', bg: 'bg', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg', bg: 'surface-sunken', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg', bg: 'surface-brand', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg-secondary', bg: 'bg', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg-secondary', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg-secondary', bg: 'surface-sunken', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg-secondary', bg: 'surface-brand', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg-muted', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'fg-muted', bg: 'bg', min: 4.5, kind: 'text' },
  // ! 这一组是全站最低的文本组合（4.92:1）。fg-muted 只能做「次要说明」，
  //   一旦要压在凹陷底上承载正文，就必须升级到 fg-secondary。
  { theme: 'light', fg: 'fg-muted', bg: 'surface-sunken', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'accent', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'accent', bg: 'surface-brand', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'accent-fg', bg: 'accent', min: 4.5, kind: 'text' },
  { theme: 'light', fg: 'border-control', bg: 'surface', min: 3.0, kind: 'ui' },

  // ---- 暗色主题：12 组 ----
  { theme: 'dark', fg: 'fg', bg: 'bg', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'fg', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'fg', bg: 'surface-raised', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'fg-secondary', bg: 'bg', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'fg-secondary', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'fg-secondary', bg: 'surface-raised', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'fg-muted', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'fg-muted', bg: 'bg', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'accent', bg: 'bg', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'accent', bg: 'surface', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'accent-fg', bg: 'accent', min: 4.5, kind: 'text' },
  { theme: 'dark', fg: 'border-control', bg: 'bg', min: 3.0, kind: 'ui' },
];

/* ------------------------------------------------------------------ *
 * 读 token + 解析别名
 * ------------------------------------------------------------------ */
const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));

function pick(path) {
  let cur = tokens;
  for (const seg of path.split('.')) {
    if (cur == null || !(seg in cur)) throw new Error(`token 路径不存在: ${path}（断在 "${seg}"）`);
    cur = cur[seg];
  }
  if (!cur || typeof cur !== 'object' || !('$value' in cur)) throw new Error(`token 不是叶子: ${path}`);
  return cur.$value;
}

function resolve(value, guard = 0) {
  if (guard > 10) throw new Error(`别名循环: ${value}`);
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    return resolve(pick(value.slice(1, -1)), guard + 1);
  }
  return value;
}

function colorOf(path) {
  const raw = resolve(pick(path));
  return parseColor(String(raw));
}

/** 支持 #rgb / #rrggbb / rgb() / rgba()（rgba 取前三个通道，透明度不参与对比度计算） */
function parseColor(str) {
  const s = str.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`无法解析颜色: ${str}`);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((x) => parseFloat(x));
    if (parts.length < 3) throw new Error(`无法解析颜色: ${str}`);
    return parts.slice(0, 3).map((x) => Math.round(x));
  }
  throw new Error(`无法解析颜色: ${str}`);
}

/* ------------------------------------------------------------------ *
 * WCAG 2.1 相对亮度与对比度
 * ------------------------------------------------------------------ */
const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ *
 * 跑
 * ------------------------------------------------------------------ */
const rows = [];
for (const p of PAIRS) {
  const group = tokens.color?.[p.theme];
  if (!group) throw new Error(`design-tokens.json 缺 color.${p.theme}`);
  const fg = colorOf(`color.${p.theme}.${p.fg}`);
  const bg = colorOf(`color.${p.theme}.${p.bg}`);
  const ratio = Number(contrast(fg, bg).toFixed(2));
  rows.push({ ...p, ratio, pass: ratio >= p.min });
}

const failed = rows.filter((r) => !r.pass);
const byTheme = (t) => rows.filter((r) => r.theme === t && r.kind === 'text');
const minOf = (list) => list.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
const minLight = minOf(byTheme('light'));
const minDark = minOf(byTheme('dark'));

if (AS_JSON) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    tokensPath: TOKENS_PATH,
    total: rows.length,
    failed: failed.length,
    minLight: { pair: `${minLight.fg}/${minLight.bg}`, ratio: minLight.ratio },
    minDark: { pair: `${minDark.fg}/${minDark.bg}`, ratio: minDark.ratio },
    rows,
  }, null, 2));
} else if (!QUIET) {
  const pad = (s, n) => String(s).padEnd(n);
  let theme = '';
  for (const r of rows) {
    if (r.theme !== theme) {
      theme = r.theme;
      console.log(`\n── ${theme === 'light' ? '浅色主题' : '暗色主题'} ──`);
      console.log(`${pad('文字层', 16)}${pad('底色', 18)}${pad('实测', 8)}${pad('阈值', 6)}结果`);
    }
    console.log(
      `${pad(r.fg, 16)}${pad(r.bg, 18)}${pad(r.ratio.toFixed(2) + ':1', 8)}${pad(r.min.toFixed(1), 6)}${r.pass ? 'OK' : 'FAIL'}`,
    );
  }
  const ui = rows.filter((r) => r.kind === 'ui');
  console.log(`\n共 ${rows.length} 组（文本 ${rows.length - ui.length} / 图形 ${ui.length}）`);
  console.log(`文本最低：浅色 ${minLight.ratio}:1（${minLight.fg}/${minLight.bg}）· 暗色 ${minDark.ratio}:1（${minDark.fg}/${minDark.bg}）`);
}

if (failed.length) {
  console.error(`\n对比度不达标 ${failed.length} 组：`);
  for (const r of failed) {
    console.error(`  x ${r.theme} ${r.fg} on ${r.bg} = ${r.ratio}:1 < ${r.min}:1`);
  }
  console.error('\n修色，不要改阈值。阈值是判据（WCAG 2.1 AA），不是可调参数。');
  process.exit(1);
}

if (!AS_JSON && QUIET) console.log(`对比度 ${rows.length} 组全部通过（文本最低 浅色 ${minLight.ratio} / 暗色 ${minDark.ratio}）`);
else if (!AS_JSON) console.log('\n全部通过。');
