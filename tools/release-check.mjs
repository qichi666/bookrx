#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 发布前检查。**刻意不进 `npm run check`**。
 *
 * 理由：检查的是「发布动作完成没有」，不是「代码对不对」。远程仓库还没建的时候，
 * 它必然红——把一条必然红的检查塞进 CI，等于训练所有人忽略红色。
 * 所以它单独挂 `npm run check:release`，发布前手动跑一次。
 *
 * 三件事：
 *  ① 文档里不许残留 `<GitHub 链接>` / `<Pages 链接>` 这类占位符
 *     （占位符一旦忘了改，用户点到的就是 404，而"入口坏了"比"没有入口"更糟）；
 *  ② 发布物料齐全（README / LICENSE / CONTRIBUTING / SECURITY / CHANGELOG）；
 *  ③ 仓库里没有把 `node_modules` / `dist` 这类产物提交进去。
 */

const ROOT = process.cwd();
const PLACEHOLDER = /<(GitHub|Pages|仓库|链接)[^>]*>/;

const REQUIRED = [
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'CHANGELOG.md',
  '.github/workflows/ci.yml',
  '.github/workflows/pages.yml',
];

const SCAN = ['docs/发布文案.md', 'README.md', 'CONTRIBUTING.md'];

let failed = 0;
const bad = (msg) => {
  console.error(`[失败] ${msg}`);
  failed += 1;
};

for (const rel of REQUIRED) {
  if (!existsSync(join(ROOT, rel))) bad(`缺少发布物料：${rel}`);
}

let scanned = 0;
for (const rel of SCAN) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) continue;
  scanned += 1;
  const lines = readFileSync(p, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    const m = PLACEHOLDER.exec(line);
    if (m) bad(`${rel}:${i + 1} 还留着占位符 ${m[0]} —— 发布前必须替换成真实链接`);
  });
}

if (scanned === 0) {
  bad('没有扫到任何待检查文档 —— 未验证（不是通过）');
}

for (const rel of ['node_modules', 'dist']) {
  if (existsSync(join(ROOT, rel, '.git'))) bad(`${rel} 里出现了 .git —— 产物不该是独立仓库`);
}

if (failed > 0) {
  console.error(`\n发布检查未通过：${failed} 项。`);
  process.exit(1);
}
console.log(`发布检查通过：物料齐全，${scanned} 份文档无占位符残留。`);
