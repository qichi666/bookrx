#!/usr/bin/env node
/**
 * 派生标注的抽样审计报表。**只报不断**（首轮），但三态纪律照旧：
 * 抽到 0 个标签 = 未验证，非零退出。
 *
 * 为什么不是"自动算出噪声率"：噪声是"这本书到底对不对题"，
 * 只有人读了书名和简介才能判。之前评审里出现过"噪声率 10%"这种估数，
 * 实测是 5%–78%、逐标签差 15 倍——**自动产出的准确率数字比没有更危险**，
 * 因为它看起来是测量结果。
 *
 * 所以这个脚本只做三件事：
 *  ① 把每个标签的「证据构成」算出来（书名证据 / 豆瓣大类兜底），这个可计算；
 *  ② 按"用户最先看到的样子"抽 30 本排好，附上各自的证据类型，供人快速判读；
 *  ③ 把兜底占比 ≥ 80% 的标签标成高风险——这些是噪声最可能集中的地方。
 *
 * 人工判读结果填进 `catalog/reports/noise-manual.json`（可选），
 * 脚本会把它并进报表；没有这个文件就如实写「未判读」。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALL = path.join(ROOT, 'public', 'catalog', 'candidates', 'all.json');
const DERIVED = path.join(ROOT, 'public', 'catalog', 'enriched', 'derived.json');
const LEX = path.join(ROOT, 'catalog', 'problem-lexicon.json');
const MANUAL = path.join(ROOT, 'catalog', 'reports', 'noise-manual.json');
const OUT_DIR = path.join(ROOT, 'catalog', 'reports');
const OUT = path.join(OUT_DIR, 'sample-audit.md');

const SAMPLE = 30;
const HIGH_RISK_FALLBACK = 0.8;
const TITLE_MIN = 0.85;

if (!existsSync(ALL) || !existsSync(DERIVED)) {
  console.error('[未验证] 缺少候选层或派生层产物（先跑 npm run data:build && npm run data:derive）');
  process.exit(1);
}

const books = JSON.parse(readFileSync(ALL, 'utf-8'));
const derived = JSON.parse(readFileSync(DERIVED, 'utf-8'));
const lexicon = JSON.parse(readFileSync(LEX, 'utf-8'));
const manual = existsSync(MANUAL) ? JSON.parse(readFileSync(MANUAL, 'utf-8')) : null;

const byId = new Map(books.map((b) => [b.id, b]));
const tagIds = Object.keys(lexicon.tags);
if (tagIds.length === 0) {
  console.error('[未验证] 词表里一个标签都没有 —— 不得报"通过"');
  process.exit(1);
}

/** tag → { books: [{id, title, votes, q, w}] } */
const pool = new Map(tagIds.map((t) => [t, []]));
for (const row of derived) {
  const book = byId.get(row.id);
  if (!book) continue;
  for (const [tag, w] of row.pt) {
    if (!pool.has(tag)) continue;
    pool.get(tag).push({ book, w });
  }
}

function topN(tag) {
  return [...pool.get(tag)]
    .sort((a, b) => {
      if (b.w !== a.w) return b.w - a.w; // 证据强的先（用户也是先看到它们）
      const qa = a.book.q ?? -1;
      const qb = b.book.q ?? -1;
      if (qb !== qa) return qb - qa;
      const va = a.book.votes ?? -1;
      const vb = b.book.votes ?? -1;
      if (vb !== va) return vb - va;
      return a.book.id < b.book.id ? -1 : 1;
    })
    .slice(0, SAMPLE);
}

const rows = tagIds.map((tag) => {
  const all = pool.get(tag);
  const strong = all.filter((x) => x.w >= TITLE_MIN).length;
  const fallback = all.length - strong;
  const share = all.length === 0 ? 0 : fallback / all.length;
  const m = manual?.[tag];
  return {
    tag,
    total: all.length,
    strong,
    fallback,
    share,
    highRisk: share >= HIGH_RISK_FALLBACK,
    manual: m ?? null,
    sample: topN(tag),
  };
});

const md = [];
md.push('# 派生标注抽样审计');
md.push('');
md.push(`生成时间：${new Date().toISOString().slice(0, 10)}　｜　样本：每个标签 ${SAMPLE} 本（按证据强度与口碑排序，与用户实际先看到的顺序一致）`);
md.push('');
md.push('**噪声率不在这里自动计算。**"这本书对不对题"只有人读了才知道；');
md.push('这个报表的职责是把判读范围从 6551 本缩到每标签 30 本，并把**可计算的那部分**（证据构成）算准。');
md.push('');
md.push('## 汇总');
md.push('');
md.push('| 标签 | 派生总数 | 书名证据 | 兜底 | 兜底占比 | 风险 | 人工判读 |');
md.push('|---|---:|---:|---:|---:|---|---|');
for (const r of rows) {
  md.push(
    `| \`${r.tag}\` | ${r.total} | ${r.strong} | ${r.fallback} | ${(r.share * 100).toFixed(0)}% | ` +
      `${r.highRisk ? '高' : '-'} | ${r.manual === null ? '未判读' : `${(r.manual.noise * 100).toFixed(0)}%（n=${r.manual.n}）`} |`,
  );
}

md.push('');
md.push('## 逐标签样本');
for (const r of rows) {
  md.push('');
  md.push(`### ${r.tag}`);
  md.push('');
  md.push(`证据：书名 ${r.strong} ｜ 兜底 ${r.fallback}（${(r.share * 100).toFixed(0)}%）${r.highRisk ? '　**高风险：大半是分类推断**' : ''}`);
  md.push('');
  md.push('| # | 书名 | 豆瓣标签 | 权重 | 证据 |');
  md.push('|---:|---|---|---:|---|');
  r.sample.forEach((x, i) => {
    const tags = (x.book.tags ?? []).slice(0, 3).join('/');
    md.push(`| ${i + 1} | ${x.book.title} | ${tags} | ${x.w} | ${x.w >= TITLE_MIN ? '书名' : '兜底'} |`);
  });
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, `${md.join('\n')}\n`, 'utf-8');

const highRisk = rows.filter((r) => r.highRisk);
const noEvidence = rows.filter((r) => r.strong === 0);
const thin = rows.filter((r) => r.total < 50);

console.log(`sample-audit：${rows.length} 个标签，报表 → catalog/reports/sample-audit.md`);
console.log(
  `证据构成：书名证据 ${rows.reduce((n, r) => n + r.strong, 0)} 条 ｜ 兜底 ${rows.reduce((n, r) => n + r.fallback, 0)} 条`,
);
if (noEvidence.length > 0) {
  console.log(`没有任何书名证据的标签：${noEvidence.map((r) => r.tag).join(', ')}（这些标签的宽池全靠分类推断）`);
}
if (thin.length > 0) {
  console.log(`派生数 < 50 的标签：${thin.map((r) => `${r.tag}=${r.total}`).join(', ')}`);
}
console.log(
  `兜底占比 ≥ ${HIGH_RISK_FALLBACK * 100}% 的高风险标签 ${highRisk.length} 个` +
    (highRisk.length > 0 ? `：${highRisk.map((r) => `${r.tag}(${(r.share * 100).toFixed(0)}%)`).join(' ')}` : ''),
);
if (manual === null) {
  console.log('人工判读：未进行（可选文件 catalog/reports/noise-manual.json；判读前不要把这里的数字当噪声率）');
}
console.log('\n[完成] 报表已生成（本脚本只报不断；失败判定等人工判读接入后再开启）');
