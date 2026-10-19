#!/usr/bin/env node
/**
 * 首屏体积闸门（SPEC §5.1）：boot-columns + titles + taxonomy + phrases，合计 ≤241 KB gzip（+5% 容差）。
 *
 * 三态：首屏文件一个都没有 = 未验证，非零退出。
 * 「没超预算」和「根本没扫到」在只看布尔值时长得一样，所以必须先把扫到了什么打出来。
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const CATALOG = join(ROOT, 'catalog');

const FIRST_SCREEN = ['boot-columns.json', 'titles.json', 'taxonomy.json', 'phrases.json'];
const BUDGET_KB = 241;
const TOLERANCE = 0.05;

const rows = [];
let missing = 0;
for (const name of FIRST_SCREEN) {
  const p = join(CATALOG, name);
  if (!existsSync(p)) {
    missing += 1;
    rows.push({ name, bytes: null, gzip: null, status: '缺失' });
    continue;
  }
  const raw = readFileSync(p);
  const gz = gzipSync(raw, { level: 9 }).length;
  rows.push({ name, bytes: raw.length, gzip: gz, status: gz <= BUDGET_KB * 1024 * (1 + TOLERANCE) ? 'ok' : '超预算' });
}

console.log(`budget-check：扫了 ${FIRST_SCREEN.length} 个首屏文件，缺失 ${missing} 个`);
for (const r of rows) {
  const kb = r.gzip === null ? '—' : `${(r.gzip / 1024).toFixed(1)} KB`;
  console.log(`  · ${r.name.padEnd(20)} gzip ${kb.padStart(10)}  ${r.status}`);
}

if (missing === FIRST_SCREEN.length) {
  console.error('\n[未验证] 首屏数据文件一个都不存在 —— 扫描对象为空，不得报"通过"');
  console.error('         首屏书目数据属于 M0.5；在此之前本门禁只能处于未验证状态。');
  process.exit(1);
}

const total = rows.reduce((a, r) => a + (r.gzip ?? 0), 0);
const limit = BUDGET_KB * 1024 * (1 + TOLERANCE);
console.log(`  合计 ${(total / 1024).toFixed(1)} KB / 预算 ${BUDGET_KB} KB（含 5% 容差 = ${(limit / 1024).toFixed(0)} KB）`);

if (total > limit) {
  console.error(`\n[失败] 首屏合计超预算 ${((total / limit - 1) * 100).toFixed(1)}%`);
  process.exit(1);
}
if (missing > 0) {
  console.error(`\n[失败] 有 ${missing} 个首屏文件缺失 —— 预算无法在缺文件的前提下判定为通过`);
  process.exit(1);
}
console.log('\n[通过] 首屏体积在预算内');
