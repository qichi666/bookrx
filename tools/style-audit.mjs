#!/usr/bin/env node
/**
 * 风格与合规门禁（SPEC §12 第 6 组）：无 emoji、无硬编码色值（除 #fff/#000）、单文件 ≤300 行。
 *
 * 色值为什么只放 #fff/#000：其余颜色一律走 token，硬编码一个色值就等于绕过设计系统，
 * 而那种绕过在 diff 里看不出来——它长得和改一处样式一模一样。
 *
 * 三态：扫到 0 个文件 = 未验证，非零退出。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hasEmoji } from './emoji-scan.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGETS = ['src', 'tools'];
const EXTS = ['.ts', '.vue', '.mjs', '.js'];

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

const files = TARGETS.flatMap((t) => walk(join(ROOT, t)));
console.log(`style-audit：扫了 ${files.length} 个文件（目录 ${TARGETS.join(' / ')}）`);
if (files.length === 0) {
  console.error('[未验证] 扫描对象为空 —— 不得报"通过"');
  process.exit(1);
}

/**
 * emoji 的**真**范围已收进 `tools/emoji-scan.mjs`（三处门禁共用一份，免得口径分叉）。
 * 那里写清了为什么排除箭头区与 `✓` `✗`：它们是排版标记，
 * 把它们判成 emoji 会得到一批假警报，而假警报的下场一定是"被人删掉这条规则"。
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const ALLOWED_HEX = new Set(['#fff', '#000', '#ffffff', '#000000', '#FFFFFF', '#000000']);

/**
 * 行数上限分两档，不是因为工具"应该更松"，而是因为两类文件的形状不同：
 * `src/` 是产品代码，一个文件对应一个职责，超 300 行几乎总是"塞了第二个职责"；
 * `tools/` 是线性审计脚本——一份脚本一条检查，从"声明扫描范围"到"逐条判"到"打印"，
 * 拆成两个文件只会把一个检查切成两半，读的人要来回跳。
 *
 * 现存的 `copy-audit.mjs` 329 行 / `doc-audit.mjs` 303 行是这条规则落地之前就有的，
 * 按 400 这一档它们是合规的；**不是豁免，是档位不同**，两个数都打印出来。
 */
const LINE_LIMIT = { src: 300, tools: 400 };

const errors = [];
for (const f of files) {
  /**
   * 必须用 relative 再归一化斜杠：直接 `f.replace(ROOT, '')` 在 Windows 上
   * 会因反斜杠匹配失败而留下绝对路径，`startsWith('src/')` 恒假——
   * 所有文件都被错进 tools 桶（上限 400），src≤300 约束静默失效。
   * 这类"门禁看起来在跑、其实没在管"的故障比没有门禁更危险。
   */
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const src = readFileSync(f, 'utf8');
  // 去掉结尾换行再数：否则 `split('\n')` 会多出一条空元素，比 wc -l 多 1
  const lines = src.replace(/\n$/, '').split('\n');
  const bucket = rel.startsWith('src/') ? 'src' : 'tools';
  const limit = LINE_LIMIT[bucket];

  if (lines.length > limit) {
    errors.push(`${rel}：${lines.length} 行，超过 ${bucket} 档 ${limit} 行上限`);
  }

  lines.forEach((l, i) => {
    if (hasEmoji(l)) {
      errors.push(`${rel}:${i + 1}：出现 emoji —— 无 emoji 是硬约束`);
    }
  });

  for (const m of src.matchAll(HEX)) {
    if (!ALLOWED_HEX.has(m[0].toLowerCase()) && !ALLOWED_HEX.has(m[0])) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${rel}:${line}：硬编码色值 ${m[0]} —— 除 #fff/#000 外一律走 token`);
    }
  }
}

if (errors.length) {
  console.error(`\n[失败] ${errors.length} 项：`);
  for (const e of errors.slice(0, 60)) console.error('  ✗ ' + e);
  if (errors.length > 60) console.error(`  … 另有 ${errors.length - 60} 项`);
  process.exit(1);
}
console.log(
  `\n[通过] ${files.length} 个文件：无 emoji、无硬编码色值；行数 src ≤${LINE_LIMIT.src} / tools ≤${LINE_LIMIT.tools}`,
);
