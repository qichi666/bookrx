#!/usr/bin/env node
/**
 * 危机入口门禁 · 层 2（`postbuild`）：`dist/assets/crisis-*.js` 必须存在。
 *
 * 为什么这条不能省：`copy-audit` 层 2 有三条规则按 `crisis-*` 文件名收窄，
 * P8 一旦被并进主包，那三条规则会**静默失效**——不报错、也不命中，看起来一切正常。
 * 文件不存在视为**构建缺陷**，不得当成「扫过了、是干净的」。
 *
 * 三态：dist 为空 = 未验证，非零退出。
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASSETS = join(ROOT, 'dist/assets');

if (!existsSync(ASSETS)) {
  console.error('[未验证] dist/assets 不存在 —— 还没有构建产物，不得报"通过"');
  process.exit(1);
}

const files = readdirSync(ASSETS);
console.log(`assert-crisis-chunk：扫了 ${files.length} 个产物文件（目录 dist/assets）`);

if (files.length === 0) {
  console.error('[未验证] dist/assets 为空 —— 扫描对象为空');
  process.exit(1);
}

const crisis = files.filter((f) => /^crisis-.*\.js$/.test(f));
console.log(`  危机 chunk：${crisis.length ? crisis.join(', ') : '（无）'}`);

if (crisis.length === 0) {
  console.error('[失败] dist/assets/crisis-*.js 不存在 —— P8 被并进了主包，按文件名收窄的规则已静默失效');
  process.exit(1);
}
console.log('[通过] 危机页是独立 chunk');
