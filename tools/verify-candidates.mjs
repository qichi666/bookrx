#!/usr/bin/env node
/**
 * 书目层校验（独立重算，不复用 build-candidates 的任何函数）。
 *
 * 依据 real-data-safe-verification 技能的三条纪律：
 *  ① 硬断言，不是"列出来看看"——任一失败退出码 1；
 *  ② 自洽式对账，不写死数字——用原始行独立重算总数/分域数，与 index 声明对账；
 *  ③ 溯源——分片里每条都必须能在原始行里找到同 id、同书名的证据（防凭空造数据）。
 *
 * 另加"源文件一个字节没变"守卫：校验前后各算一次 sha256。
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_FILE = path.join(ROOT, 'catalog', 'raw', 'douban.jsonl');
const OUT_DIR = path.join(ROOT, 'public', 'catalog', 'candidates');
const INDEX_FILE = path.join(OUT_DIR, 'index.json');

const CURRENT_YEAR = new Date().getFullYear();
const MIN_VOTES = 10;
const M_PRIOR = 50;

let failed = 0;
function chk(name, ok, detail = '') {
  if (ok) {
    console.log(`[通过] ${name}`);
  } else {
    failed += 1;
    console.log(`[失败] ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function main() {
  let rawBuf;
  try {
    rawBuf = await readFile(RAW_FILE);
    await readFile(INDEX_FILE);
  } catch {
    console.log('[跳过] 尚无书目层产物（先跑 npm run data:build）');
    return;
  }
  const shaBefore = sha(rawBuf);
  const index = JSON.parse(await readFile(INDEX_FILE, 'utf8'));

  // ---------- 独立重算（刻意不复用构建脚本的实现） ----------
  const rows = rawBuf
    .toString('utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const byId = new Map();
  for (const r of rows) {
    const id = String(r.subject_id);
    const prev = byId.get(id);
    if (!prev) byId.set(id, { ...r, domains: [r.domain], tags: [r.tag] });
    else {
      if (!prev.domains.includes(r.domain)) prev.domains.push(r.domain);
      if (!prev.tags.includes(r.tag)) prev.tags.push(r.tag);
    }
  }

  const invalid = (r) =>
    !r.title ||
    (r.rating !== null && r.rating !== undefined && (r.rating < 0 || r.rating > 10)) ||
    (r.votes !== null && r.votes !== undefined && (r.votes < 0 || r.votes > 1e8)) ||
    (r.year !== null && r.year !== undefined && (r.year < 1800 || r.year > CURRENT_YEAR + 1));

  const validRows = [...byId.values()].filter((r) => !invalid(r));
  const expectedTotal = validRows.length;
  const expectedByDomain = {};
  for (const r of validRows) {
    for (const d of r.domains) expectedByDomain[d] = (expectedByDomain[d] || 0) + 1;
  }

  // ---------- 断言 1：源文件指纹与 index 声明一致 ----------
  chk(
    'index.source_sha256 == 原始文件实际哈希（数据来源可追溯）',
    index.source_sha256 === shaBefore,
    `index=${String(index.source_sha256).slice(0, 12)}… 实际=${shaBefore.slice(0, 12)}…`,
  );

  // ---------- 断言 2：总数对账 ----------
  chk(
    `index.total == 独立重算的有效书数（${index.total} vs ${expectedTotal}）`,
    index.total === expectedTotal,
    `原始 ${rows.length} 行 / 去重 ${byId.size} / 有效 ${expectedTotal}`,
  );

  // ---------- 断言 3：全量文件存在、条数与 index 声明及独立重算都对得上 ----------
  let allRecs = [];
  try {
    allRecs = JSON.parse(await readFile(path.join(OUT_DIR, index.all_file || 'all.json'), 'utf8'));
  } catch {
    chk('all.json 可读取', false);
  }
  const shardRecs = { all: allRecs };
  chk(`all.json 条数 == index.total（${allRecs.length} vs ${index.total}）`, allRecs.length === expectedTotal);
  const declaredDomains = Object.keys(index.by_domain || {}).sort();
  const computedDomains = Object.keys(expectedByDomain).sort();
  chk(
    'index.by_domain 的域集合 == 独立重算',
    JSON.stringify(declaredDomains) === JSON.stringify(computedDomains),
    `${declaredDomains} vs ${computedDomains}`,
  );
  const domainMismatch = declaredDomains.filter(
    (d) => (index.by_domain[d] ?? -1) !== (expectedByDomain[d] ?? 0),
  );
  chk('每个域的条数 == 独立重算', domainMismatch.length === 0, domainMismatch.join(', '));

  // ---------- 断言 4：分片内 id 唯一 ----------
  const dupes = [];
  for (const [domain, recs] of Object.entries(shardRecs)) {
    const seen = new Set();
    for (const r of recs) {
      if (seen.has(r.id)) dupes.push(`${domain}:${r.id}`);
      seen.add(r.id);
    }
  }
  chk('分片内无重复 id', dupes.length === 0, dupes.slice(0, 5).join(', '));

  // ---------- 断言 5：溯源——每条记录都能在原始行找到同 id 同书名 ----------
  const rawById = new Map([...byId.entries()].map(([id, r]) => [id, r]));
  const untraceable = [];
  for (const recs of Object.values(shardRecs)) {
    for (const r of recs) {
      const src = rawById.get(String(r.id));
      if (!src || src.title !== r.title) untraceable.push(r.id);
    }
  }
  chk('每条记录都能溯源到原始行（同 id 同书名）', untraceable.length === 0, untraceable.slice(0, 5).join(', '));

  // ---------- 断言 6：字段不变量 ----------
  const badQ = [];
  const badBucket = [];
  const badYear = [];
  for (const recs of Object.values(shardRecs)) {
    for (const r of recs) {
      if (r.q !== null && (typeof r.q !== 'number' || r.q < 0 || r.q > 1)) badQ.push(r.id);
      const expectBucket =
        r.q === null ? 'unknown' : r.q >= 0.8 ? 'high' : r.q >= 0.65 ? 'mid' : 'low';
      if (r.bucket !== expectBucket) badBucket.push(`${r.id}:${r.bucket}/${expectBucket}`);
      if (r.year !== null && (r.year < 1800 || r.year > CURRENT_YEAR + 1)) badYear.push(r.id);
    }
  }
  chk('quality 取值 ∈ [0,1] 或 null', badQ.length === 0, badQ.slice(0, 5).join(', '));
  chk('bucket 与 quality 阈值一致', badBucket.length === 0, badBucket.slice(0, 5).join(', '));
  chk('出版年在合理区间', badYear.length === 0, badYear.slice(0, 5).join(', '));

  // ---------- 断言 7：低样本不得有 quality（防"3 人打 5 星"） ----------
  const lowSample = [];
  for (const recs of Object.values(shardRecs)) {
    for (const r of recs) {
      if ((r.votes === null || r.votes < MIN_VOTES) && r.q !== null) lowSample.push(r.id);
    }
  }
  chk(`评分人数 <${MIN_VOTES} 的书 quality 必须为 null`, lowSample.length === 0, lowSample.slice(0, 5).join(', '));

  // ---------- 断言 8：先验参数与实现约定一致 ----------
  chk(`index.prior.m == ${M_PRIOR}`, index.prior?.m === M_PRIOR, String(index.prior?.m));

  // ---------- 断言 9：校验本身没写源文件 ----------
  const shaAfter = sha(await readFile(RAW_FILE));
  chk('校验前后原始数据一个字节没变', shaAfter === shaBefore);

  // ---------- 覆盖率报表（只展示，不断言：数字随数据增长变化） ----------
  const totals = Object.entries(index.by_domain || {})
    .map(([d, n]) => `${d}=${n}`)
    .join('  ');
  console.log(`\n分域覆盖：${totals}`);
  console.log(`总计 ${index.total} 本（原始 ${index.source_lines} 行，坏行 ${index.dropped?.bad_json ?? 0}）`);

  if (failed > 0) {
    console.log(`\n[未通过] ${failed} 项失败`);
    process.exit(1);
  }
  console.log('\n[通过] 书目层校验全部通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
