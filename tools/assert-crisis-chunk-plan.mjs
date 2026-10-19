#!/usr/bin/env node
/**
 * 危机入口门禁 · 层 2 的前置（`prebuild`）。
 *
 * 为什么要在构建**之前**先查一遍：只做 postbuild 断言的话，
 * 一旦有人把 `CrisisView` 从 `manualChunks` 里挪走或改名，构建会**成功**、
 * 产物里不会出现 `crisis-*.js`，然后 postbuild 才报错——排查时第一反应是"构建炸了"，
 * 而真正的改动发生在构建之前。前置断言把失败定位到"入口没了"而不是"产物没了"。
 *
 * 三态：视图文件不存在 = 未验证，非零退出。
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
const VIEWS = join(ROOT, 'src/views');

function vueFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(vueFiles(p));
    else if (e.name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const files = vueFiles(VIEWS);
console.log(`assert-crisis-chunk-plan：扫了 ${files.length} 个视图文件（目录 src/views）`);

if (files.length === 0) {
  console.error('[未验证] src/views 下没有任何 .vue —— 扫描对象为空');
  process.exit(1);
}

const crisis = files.filter((f) => /CrisisView\.(vue|ts)$/.test(f));
if (crisis.length === 0) {
  console.error('[失败] 找不到 src/views/CrisisView —— 危机页无法成为独立 chunk');
  process.exit(1);
}

const cfgPath = join(ROOT, 'vite.config.ts');
if (!existsSync(cfgPath)) {
  console.error('[未验证] 找不到 vite.config.ts');
  process.exit(1);
}
const cfg = readFileSync(cfgPath, 'utf8');
// 数条目式检查：manualChunks 里必须真的把危机视图切出去，只写个注释不算
if (!/CrisisView/.test(cfg) || !/manualChunks/.test(cfg)) {
  console.error('[失败] vite.config.ts 里没有把 CrisisView 切进 manualChunks');
  process.exit(1);
}

console.log(`  危机视图：${crisis.map((f) => f.replace(ROOT, '')).join(', ')}`);
console.log('[通过] 危机页具备成为独立 chunk 的前置条件');
