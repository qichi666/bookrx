#!/usr/bin/env node
/**
 * 枚举双向比对（`ARCH §2.5`）。
 *
 * 契约只放类型、实现侧才有权放 `const` 码表，所以这里**派生不了，只能比对**。
 * 比对弱一档（改完两边一样，中间那段时间可以不一致），因此必须由 CI 强制每次跑。
 *
 * 只断言**机械可判定**的那一半：定义处 ↔ 契约类型 ↔ 实现码表。
 * 文档正文里的枚举出现处不做断言（子集引用与漏改在纯文本上形态相同，脚本区分不了）。
 *
 * 三态语义（SPEC §12）：抽到 0 个值 = **未验证**，非零退出，不得报"通过"。
 * 成功路径也要把抽到的集合打印出来 —— 只在失败时说话的检查，
 * 等于放弃了"抽对了没有"这一整类信息。
 */

import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const read = (p) => readFileSync(ROOT + p, 'utf8');

const failures = [];
const notes = [];

function fail(msg) {
  failures.push(msg);
}

/** 取从 `startMark` 到 `endMark` 之间的文本；找不到就记为未验证。 */
function sliceBetween(src, startMark, endMark, label) {
  const s = src.indexOf(startMark);
  if (s < 0) {
    fail(`${label}：找不到起始标记 ${JSON.stringify(startMark)} → 未验证`);
    return '';
  }
  const e = src.indexOf(endMark, s + startMark.length);
  if (e < 0) {
    fail(`${label}：找不到结束标记 ${JSON.stringify(endMark)} → 未验证`);
    return '';
  }
  return src.slice(s, e + endMark.length);
}

function quotes(text) {
  return [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

function comparePair(label, a, b) {
  const A = [...a].sort();
  const B = [...b].sort();
  if (A.length === 0 || B.length === 0) {
    fail(`${label}：有一侧抽到 0 个值 → 未验证（A=${A.length} B=${B.length}）`);
    return;
  }
  const same = A.length === B.length && A.every((v, i) => v === B[i]);
  notes.push(`${label}：A=${A.length} B=${B.length} ${same ? '一致' : '不一致'} → {${A.join(', ')}}`);
  if (!same) {
    fail(
      `${label}：两侧不一致\n    A（SPEC）    = {${A.join(', ')}}\n` +
        `    B（contracts）= {${B.join(', ')}}\n` +
        `    仅 A 有：{${A.filter((x) => !B.includes(x)).join(', ')}}\n` +
        `    仅 B 有：{${B.filter((x) => !A.includes(x)).join(', ')}}`,
    );
  }
}

const spec = read('docs/SPEC.md');
const arch = read('docs/ARCH.md');
const contracts = read('src/contracts/enums.ts');
const recommendation = read('src/contracts/recommendation.ts');
const filters = read('src/domain/scoring/filters.ts');

/* ── 1. ContentWarning：SPEC §5.2 那一格 ↔ contracts ──────────────────── */
const cwRow = spec
  .split('\n')
  .find((l) => l.includes('`content_warning`') && l.trim().startsWith('|'));
if (!cwRow) {
  fail('ContentWarning：SPEC §5.2 里找不到 `content_warning` 那一行 → 未验证');
} else {
  const specCw = new Set(quotes(cwRow));
  const cwBlock = sliceBetween(
    contracts,
    'export type ContentWarning =',
    ';',
    'ContentWarning（contracts）',
  );
  const codeCw = new Set(quotes(cwBlock));
  comparePair('ContentWarning', specCw, codeCw);
  if (specCw.size !== 7) {
    fail(
      `ContentWarning：SPEC 侧抽到 ${specCw.size} 个值，预期 7 个 —— ` +
        `少 grief / terminal_illness 时 EX-terminal 永远不可能命中，而整条链路不报错。`,
    );
  }
}

/* ── 2. FILTER_RULES：ARCH 码表 ↔ 实现码表（数量 == 7 且逐项相等）────── */
const archRules = sliceBetween(arch, 'const FILTER_RULES = [', '] as const;', 'FILTER_RULES（ARCH）');
const codeRules = sliceBetween(
  filters,
  'export const FILTER_RULES = [',
  '] as const;',
  'FILTER_RULES（实现）',
);
const archCodes = new Set([...archRules.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]));
const codeCodes = new Set([...codeRules.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]));
comparePair('FILTER_RULES', archCodes, codeCodes);
// 数条目，不是数关键词：两行表格被粘成一行、去掉一个 | ，关键词全都还在而结构已坏
if (codeCodes.size !== 7) {
  fail(`FILTER_RULES：实现侧有 ${codeCodes.size} 条，预期 7 条（数条目，不数关键词）`);
}

/* ── 3. Tier：SPEC §6.3 ⑦ ↔ contracts ────────────────────────────────── */
const tierLine = spec.split('\n').find((l) => l.includes('三个值只能是'));
if (!tierLine) {
  fail('Tier：SPEC §6.3 ⑦ 找不到「三个值只能是」那句 → 未验证');
} else {
  // 那一句是「三个值只能是 X/Y/Z。禁止 high、mid、low、fit」——
  // 禁止清单也在反引号里，不切开会把它当成定义值，于是抽出 7 个"合法档位"
  const allowedPart = tierLine.split('禁止')[0];
  const specTier = new Set([...allowedPart.matchAll(/`([a-z]+)`/g)].map((m) => m[1]));
  if (specTier.size !== 3) {
    fail(`Tier：SPEC 侧抽到 ${specTier.size} 个允许值，预期 3 个 → 未验证`);
  }
  const tierBlock = sliceBetween(recommendation, 'export type Tier =', ';', 'Tier（contracts）');
  const codeTier = new Set(quotes(tierBlock));
  comparePair('Tier', specTier, codeTier);
}

/* ── 4. FactorId：SPEC §6.2 权重表 ↔ contracts ───────────────────────── */
const section62 = sliceBetween(spec, '### 6.2', '### 6.3', 'SPEC §6.2');
const specFactors = new Set(
  section62
    .split('\n')
    .map((l) => /^\|\s*`([a-z]+)`/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]),
);
const factorBlock = sliceBetween(contracts, 'export type FactorId =', ';', 'FactorId（contracts）');
const codeFactors = new Set([...factorBlock.matchAll(/^\s*\|\s*'([a-z]+)'/gm)].map((m) => m[1]));
comparePair('FactorId', specFactors, codeFactors);
if (specFactors.size !== 7) {
  fail(`FactorId：SPEC §6.2 表里抽到 ${specFactors.size} 个因子，预期 7 个 → 未验证`);
}

/* ── 输出 ─────────────────────────────────────────────────────────────── */
console.log('check-enums：扫了 4 个文件（SPEC / ARCH / contracts/enums / domain/filters）');
for (const n of notes) console.log('  · ' + n);

if (failures.length) {
  console.error(`\n[失败] ${failures.length} 项：`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('\n[通过] 四组枚举两侧一致');
