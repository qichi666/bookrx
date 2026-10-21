#!/usr/bin/env node
/**
 * 书目数据校验（SPEC §12 第 2 组）。
 *
 * 三态：扫描对象为空（0 个 json / 0 本书）时报**「未验证」并以非零码退出**，
 * 不得报「通过」——「0 命中」恰恰是"根本没扫到"的典型症状。
 *
 * 必填字段不是手抄清单，而是从 `src/contracts/book.ts` 派生（见 `schema.mjs`）。
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONDITIONALLY_REQUIRED, TEXT_LIMITS, charCount, loadBookFields } from './schema.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CATALOG_DIR = join(ROOT, 'catalog');

function jsonFiles(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(jsonFiles(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

function walkBooks(node, path, out) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkBooks(v, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === 'object') {
    if (typeof node.book_id === 'string') out.push({ path, book: node });
    else for (const [k, v] of Object.entries(node)) walkBooks(v, `${path}.${k}`, out);
  }
}

const files = jsonFiles(CATALOG_DIR);
console.log(`catalog-audit：扫了 ${files.length} 个文件（目录 ${CATALOG_DIR}）`);

/**
 * 派生 / 索引文件不按整本 Book 校验：boot-columns 只装打分数值列、titles 只装标题索引，
 * 它们的完整性由 `tools/gen-boot-data.mjs`（从种子书目机械派生）保证。
 * 在这里对它们跑 34 字段校验，等于要求索引文件伪造出全文案——结构上就不成立。
 */
const DERIVED_FILES = new Set([
  'boot-columns.json',
  'titles.json',
  'taxonomy.json',
  'phrases.json',
  'crisis-resources.json',
]);
const bookFiles = files.filter((f) => !DERIVED_FILES.has(f.split(/[\\/]/).pop()));
if (bookFiles.length === 0) {
  console.error('[未验证] catalog/ 下没有可校验的书目 .json（全是派生文件）—— 扫描对象为空');
  process.exit(1);
}

if (files.length === 0) {
  console.error('[未验证] catalog/ 下没有任何 .json —— 扫描对象为空，不得报"通过"');
  console.error('        书目数据属于 M0.5；在此之前本门禁只能处于未验证状态。');
  process.exit(1);
}

const { required, fields } = loadBookFields(join(ROOT, 'src/contracts/book.ts'));
console.log(`  字段表派生自 src/contracts/book.ts：共 ${fields.length} 个字段，必填 ${required.length} 个`);

const books = [];
for (const f of bookFiles) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    console.error(`[失败] ${f} 不是合法 JSON：${e.message}`);
    process.exit(1);
  }
  walkBooks(parsed, f.replace(ROOT, ''), books);
}

console.log(`  扫了 ${books.length} 条书目记录`);
if (books.length === 0) {
  console.error('[未验证] 有 .json 但没有解析出任何带 book_id 的记录 —— 扫描对象为空');
  process.exit(1);
}

const errors = [];
const SENTENCE_END = /[。！？]$/;

// 派生索引的行数必须与权威书目一致：生成器漏跑或半途失败在这里暴露
for (const name of ['boot-columns.json', 'titles.json']) {
  const p = join(CATALOG_DIR, name);
  if (!existsSync(p)) continue;
  const derived = JSON.parse(readFileSync(p, 'utf8'));
  if (Array.isArray(derived) && derived.length !== books.length) {
    errors.push(`${name} 有 ${derived.length} 行，与权威书目 ${books.length} 本不一致 —— 重新跑 gen-boot-data`);
  }
}

for (const { path, book } of books) {
  const id = book.book_id;
  for (const f of required) {
    if (book[f] === undefined || book[f] === null) errors.push(`${path} ${id}：缺必填字段 ${f}`);
  }
  for (const c of CONDITIONALLY_REQUIRED) {
    if (!c.when(book)) continue;
    if (book[c.field] === undefined || book[c.field] === null) {
      errors.push(`${path} ${id}：条件必填 ${c.field} 缺失（${c.why}）`);
    }
  }
  for (const lim of TEXT_LIMITS) {
    const v = book[lim.field];
    if (v === undefined) continue;
    const n = charCount(v);
    if (n < lim.min || n > lim.max) {
      errors.push(`${path} ${id}：${lim.field} ${n} 字，越界（${lim.min}–${lim.max}）`);
    }
    if (lim.mustEndWithSentence && !SENTENCE_END.test(String(v))) {
      errors.push(`${path} ${id}：${lim.field} 未以 。/！/？ 结尾 —— 卡面那句必须在数据侧保证`);
    }
  }
  // book_id 不得编码可变属性，且永久空号不得回收
  if (!/^(core:\d{6}|user:[0-9a-f]{16})$/.test(id)) {
    errors.push(`${path} ${id}：book_id 形态不合法（core:<6 位定宽> 或 user:<hex16>）`);
  }
  /**
   * 构建期校验：阅读速度必须落在 100–800 字/分。
   * `SPEC §5.2` 写作 `word_count / est_reading_hours ∈ [100,800]`，但 `est_reading_hours`
   * 的单位是**小时**，直接相除得到的是"字/小时"（合理区间 6000–48000），
   * 与 100–800 这个区间对不上。100–800 明摆着是**字/分**（契约注释也是这么写的），
   * 所以这里按语义算 `word_count / (hours × 60)`，并把这处单位不一致记为待确认项。
   */
  if (book.word_count && book.est_reading_hours) {
    const rate = book.word_count / (book.est_reading_hours * 60);
    if (rate < 100 || rate > 800) {
      errors.push(`${path} ${id}：阅读速度 ${rate.toFixed(0)} 字/分，超界（100–800）`);
    }
  }
}

// 首屏文件体积（gzip）在 budget-check 里管，这里只管结构与文案

if (errors.length) {
  console.error(`\n[失败] ${errors.length} 项：`);
  for (const e of errors.slice(0, 50)) console.error('  ✗ ' + e);
  if (errors.length > 50) console.error(`  … 另有 ${errors.length - 50} 项`);
  process.exit(1);
}
console.log(`\n[通过] ${books.length} 条记录：必填齐备、文案长度合规、book_id 形态合法`);
