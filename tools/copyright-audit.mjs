#!/usr/bin/env node
/**
 * 版权闸门（SPEC §12 第 2 组）。
 *
 * 唯一硬规则：**`availability = 'inline'` 的书，版权依据必须站得住**。
 * 中译本（`translation_copyright ∈ {in_copyright, unknown}`）一律不许 inline ——
 * 译者是独立著作权人，原作进入公有领域**不**代表译文可以自由分发。
 *
 * 三态：0 条记录 = 未验证，非零退出。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');
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
  if (Array.isArray(node)) return node.forEach((v, i) => walkBooks(v, `${path}[${i}]`, out));
  if (node && typeof node === 'object') {
    if (typeof node.book_id === 'string') out.push({ path, book: node });
    else for (const [k, v] of Object.entries(node)) walkBooks(v, `${path}.${k}`, out);
  }
}

const files = jsonFiles(CATALOG_DIR);
console.log(`copyright-audit：扫了 ${files.length} 个文件（目录 ${CATALOG_DIR}）`);

const books = [];
for (const f of files) {
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
  console.error('[未验证] 没有任何书目记录 —— 扫描对象为空，不得报"通过"');
  process.exit(1);
}

const INLINE_BASIS = new Set(['public_domain_cn', 'public_domain_origin', 'licensed_free']);
const SAFE_TRANSLATION = new Set(['none', 'public_domain']);

const errors = [];
const inlineList = [];

for (const { path, book } of books) {
  const id = book.book_id;
  if (book.availability === 'inline') {
    inlineList.push(`${id} ${book.title ?? ''}`);
    if (!INLINE_BASIS.has(book.copyright_basis)) {
      errors.push(`${path} ${id}：inline 但 copyright_basis=${book.copyright_basis} —— 不允许直读`);
    }
    if (!SAFE_TRANSLATION.has(book.translation_copyright)) {
      errors.push(
        `${path} ${id}：inline 但 translation_copyright=${book.translation_copyright} —— ` +
          `中译本译文有独立著作权，原作公版不代表译文可自由分发`,
      );
    }
    if (String(book.copyright_basis ?? '').includes('public_domain') && !book.public_domain_reason) {
      errors.push(`${path} ${id}：copyright_basis 含 public_domain 但缺 public_domain_reason`);
    }
  }
  if (book.availability !== 'external' && !book.source_url) {
    errors.push(`${path} ${id}：availability=${book.availability} 但缺 source_url（出处必须可核验）`);
  }
  if (book.availability === 'inline' && book.copyright_basis === 'metadata_only') {
    errors.push(`${path} ${id}：metadata_only 的书不得标为 inline`);
  }
}

console.log(`  inline 清单（${inlineList.length} 本）：`);
for (const l of inlineList) console.log('    · ' + l);

if (errors.length) {
  console.error(`\n[失败] ${errors.length} 项：`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('\n[通过] 版权闸门：inline 书的版权依据与译文状态全部合规');
