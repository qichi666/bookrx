#!/usr/bin/env node
/**
 * 原始抓取 → 书目层候选分片（构建期工具）。
 *
 * 输入：catalog/raw/douban.jsonl（只读，不改一个字节）
 * 输出：catalog/candidates/<domain>.json + index.json
 *
 * 规则对应 docs/数据与推荐方案.md §2：
 *  - 缺失：书名/评分缺失按 §2.2 处理；无评分保留但 q=null
 *  - 重复：同 subject_id 跨标签合并（标签取并集），不做标题模糊合并（候选层宁可多留）
 *  - 异常：评分越界、年份越界、人数异常 → 丢弃并计数
 *  - 评分标准化：归一 + 贝叶斯收缩（m=50, C=全库均值）
 *
 * 只读写 catalog/ 下的文件；不联网、不碰 src/。
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_FILE = path.join(ROOT, 'catalog', 'raw', 'douban.jsonl');
const OUT_DIR = path.join(ROOT, 'public', 'catalog', 'candidates');

const M_PRIOR = 50; // 先验强度：50 条评分前一半权重给全库均值
const MIN_VOTES = 10; // 少于 10 人评价视同无评分
const CURRENT_YEAR = new Date().getFullYear();

export function normalizeKey(subjectId) {
  return String(subjectId).trim();
}

/** §2.4 异常值判定：返回 true = 丢弃。 */
export function isInvalid(rec) {
  if (!rec.title || typeof rec.title !== 'string' || rec.title.trim() === '') return true;
  if (rec.rating !== null && rec.rating !== undefined) {
    if (typeof rec.rating !== 'number' || Number.isNaN(rec.rating)) return true;
    if (rec.rating < 0 || rec.rating > 10) return true;
  }
  if (rec.votes !== null && rec.votes !== undefined) {
    if (typeof rec.votes !== 'number' || rec.votes < 0 || rec.votes > 100_000_000) return true;
  }
  if (rec.year !== null && rec.year !== undefined) {
    if (rec.year < 1800 || rec.year > CURRENT_YEAR + 1) return true;
  }
  return false;
}

/** 贝叶斯收缩：q = v/(v+m)·r + m/(v+m)·C。无评分或样本太小返回 null。 */
export function qualityOf(rating, votes, cMean, m = M_PRIOR) {
  if (rating === null || rating === undefined) return null;
  if (votes === null || votes === undefined || votes < MIN_VOTES) return null;
  const r = rating / 10;
  const v = votes;
  const q = (v / (v + m)) * r + (m / (v + m)) * cMean;
  return Math.round(q * 1000) / 1000;
}

export function bucketOf(q) {
  if (q === null) return 'unknown';
  if (q >= 0.8) return 'high';
  if (q >= 0.65) return 'mid';
  return 'low';
}

/** 同 subject_id 跨标签合并：标签取并集，字段取信息更全的一条。 */
export function mergeRecords(records) {
  const byId = new Map();
  for (const r of records) {
    const id = normalizeKey(r.subject_id);
    if (!byId.has(id)) {
      byId.set(id, { ...r, tags: [r.tag], domains: [r.domain] });
      continue;
    }
    const cur = byId.get(id);
    if (!cur.tags.includes(r.tag)) cur.tags.push(r.tag);
    if (!cur.domains.includes(r.domain)) cur.domains.push(r.domain);
    if (!cur.subtitle && r.subtitle) cur.subtitle = r.subtitle;
    if (!cur.publisher && r.publisher) cur.publisher = r.publisher;
    if (cur.year === null && r.year !== null) cur.year = r.year;
    if (cur.rating === null && r.rating !== null) cur.rating = r.rating;
    if ((cur.votes ?? 0) < (r.votes ?? 0)) cur.votes = r.votes;
  }
  return [...byId.values()];
}

async function main() {
  let raw;
  try {
    raw = await readFile(RAW_FILE, 'utf8');
  } catch {
    console.log(`[跳过] 找不到原始数据 ${path.relative(ROOT, RAW_FILE)}（不影响主构建）`);
    console.log('需要重建书目层时先跑：node tools/fetch-douban.mjs --all --pages 25');
    return;
  }

  const sourceSha = createHash('sha256').update(raw).digest('hex');
  const lines = raw.split('\n').filter((l) => l.trim());
  const parsed = [];
  let badJson = 0;
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      badJson += 1;
    }
  }

  const merged = mergeRecords(parsed);
  const valid = merged.filter((r) => !isInvalid(r));
  const dropped = merged.length - valid.length;

  // 全库均值（只统计有评分的），作为贝叶斯先验 C
  const rated = valid.filter((r) => typeof r.rating === 'number');
  const cMean = rated.length
    ? rated.reduce((s, r) => s + r.rating / 10, 0) / rated.length
    : 0.75;

  const out = valid.map((r) => {
    const q = qualityOf(r.rating, r.votes, cMean);
    return {
      id: r.subject_id,
      title: r.title,
      subtitle: r.subtitle || '',
      authors: (r.authors || []).slice(0, 2),
      publisher: r.publisher || '',
      year: r.year,
      q,
      bucket: bucketOf(q),
      votes: r.votes,
      tags: r.tags,
      domains: r.domains,
      url: `https://book.douban.com/subject/${r.subject_id}/`,
    };
  });
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 按域分片（一本书可属多域，各域各留一份，便于按需懒加载）
  const byDomain = new Map();
  for (const rec of out) {
    for (const d of rec.domains) {
      if (!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d).push(rec);
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const byDomainCount = {};
  for (const [domain, recs] of [...byDomain.entries()].sort()) {
    byDomainCount[domain] = recs.length;
  }
  // 只写一份全量文件：分域文件与它内容重复，白白多占一倍体积

  await writeFile(path.join(OUT_DIR, 'all.json'), JSON.stringify(out), 'utf8');

  const index = {
    generated_at: new Date().toISOString().slice(0, 10),
    all_file: 'all.json',
    source_file: 'catalog/raw/douban.jsonl',
    source_sha256: sourceSha,
    source_lines: lines.length,
    total: out.length,
    by_domain: byDomainCount,
    dropped: { invalid: dropped, bad_json: badJson },
    prior: { m: M_PRIOR, c_mean: Math.round(cMean * 1000) / 1000, min_votes: MIN_VOTES },
  };
  await writeFile(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  console.log('书目层构建完成');
  console.log(`  原始行 ${lines.length}（坏行 ${badJson}）→ 合并去重 ${merged.length} → 有效 ${out.length}（丢弃 ${dropped}）`);
  console.log(`  全库均分 C=${index.prior.c_mean}，先验 m=${M_PRIOR}`);
  console.log(`  分域：${Object.entries(byDomainCount).map(([d, n]) => `${d}=${n}`).join(' ')}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
