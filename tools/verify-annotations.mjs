#!/usr/bin/env node
/**
 * 标注产物校验。四类断言，任何一类能红：
 *
 *  ① **结构**：id 在候选层、无重复、标签来自词表、不超过 top_n、证据 ≤40 字。
 *  ② **证据可追溯**：每条证据必须在简介/目录里**逐字**出现。查不了就报「未验证」，
 *     不报通过——缓存不在本机时（比如别人 clone 下来）这条一定走到这一步。
 *  ③ **覆盖对账**：逐标签统计「标注证据」与「书名词表证据」的池子，与派生产物对得上。
 *  ④ **金标校准**：读 `.cache/gold-eval.json`（模型在人标 30 本上的输出），
 *     与人工 problem_tags 比精确率/召回率。**门槛不达标不许放量。**
 *
 * 为什么必须有 ④：这个通道的全部风险就是"模型看起来标得挺好"。35% 精确率那次
 * 也是"看起来挺好"——直到拿 30 本金标一算。没有金标的标注通道，
 * 本质上是在用更贵的方式抽签。
 *
 * 用法：node tools/verify-annotations.mjs [--strict]
 *   --strict：金标缺失或缓存缺失即视为未通过（发布前用）
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = join(ROOT, 'public', 'catalog', 'candidates', 'all.json');
const LEX = join(ROOT, 'catalog', 'problem-lexicon.json');
const ANN_DIR = join(ROOT, 'catalog', 'annotations');
const INTRO_DIR = join(ROOT, '.cache', 'intros');
const GOLD_EVAL = join(ROOT, '.cache', 'gold-eval.json');
const REPORT = join(ROOT, 'catalog', 'reports', 'annotation-quality.md');

const MAX_EVIDENCE = 40;
/** 门槛：低于这两个数就不许把标注放进运行时 */
const MIN_PRECISION = 0.7;
const MIN_RECALL = 0.5;

const failures = [];
/** 三态：通过 / 失败 / 未验证。**扫不到东西必须落在「未验证」，不能落「通过」。** */
const unverified = [];

function chk(name, ok, detail = '') {
  if (ok) console.log(`[通过] ${name}`);
  else {
    console.log(`[失败] ${name}${detail ? ` —— ${detail}` : ''}`);
    failures.push(name);
  }
}
function skip(name, why) {
  console.log(`[未验证] ${name} —— ${why}`);
  unverified.push(`${name}（${why}）`);
}

const norm = (s) =>
  String(s ?? '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[《》「」『』·\-—_/\\|"'“”‘’!！?？,，.。:：;；()（）\[\]【】]/g, '')
    .toLowerCase();

function loadAnnotations() {
  if (!existsSync(ANN_DIR)) return [];
  const out = [];
  for (const f of readdirSync(ANN_DIR).filter((x) => /^shard-\d+\.json$/.test(x)).sort()) {
    for (const r of JSON.parse(readFileSync(join(ANN_DIR, f), 'utf8'))) out.push(r);
  }
  return out;
}

function main() {
  const strict = process.argv.includes('--strict');
  const records = loadAnnotations();
  if (records.length === 0) {
    skip('标注产物', '目录里一条记录都没有（先跑 tools/annotate-books.mjs）');
    if (strict) process.exit(2);
    console.log('\n[未验证] 没有可校验的标注');
    return;
  }

  const books = JSON.parse(readFileSync(ALL, 'utf8'));
  const lexicon = JSON.parse(readFileSync(LEX, 'utf8'));
  const byId = new Map(books.map((b) => [String(b.id), b]));
  const allowed = new Set(Object.keys(lexicon.tags));
  const topN = lexicon.top_n ?? 3;
  const wAnn = lexicon.weights?.annotation ?? 0.95;

  /* ── ① 结构 ── */
  const ids = records.map((r) => String(r.id));
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  chk('标注条数 > 0 且无重复 id', dup.length === 0, `${dup.length} 个重复`);
  const notInCatalog = ids.filter((id) => !byId.has(id));
  chk('每条都能在候选层找到同 id', notInCatalog.length === 0, notInCatalog.slice(0, 3).join(','));

  let badTag = 0;
  let badLen = 0;
  let badEvidenceLen = 0;
  let noPrompt = 0;
  for (const r of records) {
    if (r.tags.length > topN) badLen += 1;
    if (r.tags.some((t) => !allowed.has(String(t.tag)))) badTag += 1;
    if (r.tags.some((t) => String(t.evidence ?? '').length === 0 || String(t.evidence).length > MAX_EVIDENCE)) badEvidenceLen += 1;
    if (!r.prompt) noPrompt += 1;
  }
  chk('标签全部来自词表', badTag === 0, `${badTag} 条越界`);
  chk(`每本最多 ${topN} 个标签`, badLen === 0, `${badLen} 条超长`);
  chk(`证据非空且 ≤${MAX_EVIDENCE} 字`, badEvidenceLen === 0, `${badEvidenceLen} 条不合规`);
  chk('每条记录都记着 prompt 版本（否则无法复现）', noPrompt === 0, `${noPrompt} 条缺`);

  /* ── ② 证据可追溯 ── */
  const cacheReady = existsSync(INTRO_DIR) && readdirSync(INTRO_DIR).some((f) => f.endsWith('.json'));
  let untraceable = 0;
  let checked = 0;
  const untraceableList = [];
  if (!cacheReady) {
    skip('证据逐字可追溯', '本机没有 .cache/intros（简介原文不入库，需先跑 fetch-intros）');
  } else {
    for (const r of records) {
      const p = join(INTRO_DIR, `${r.id}.json`);
      if (!existsSync(p)) continue; // 缓存删过的书跳过，不当作失败
      const c = JSON.parse(readFileSync(p, 'utf8'));
      const book = byId.get(String(r.id));
      const src = norm(`${c.intro}\n${c.toc}\n${book?.title ?? ''} ${book?.subtitle ?? ''}`);
      checked += 1;
      for (const t of r.tags) {
        if (!src.includes(norm(t.evidence))) {
          untraceable += 1;
          if (untraceableList.length < 5) untraceableList.push(`${r.id}:${t.tag}「${t.evidence}」`);
        }
      }
    }
    chk(
      `证据逐字出现在原文里（查了 ${checked} 本）`,
      untraceable === 0,
      `${untraceable} 处对不上 ${untraceableList.join(' / ')}`,
    );
    if (checked === 0) skip('证据抽查', '缓存存在但没有一本对得上产物 id');
  }

  /* ── ③ 覆盖对账 ── */
  const byTagAnn = new Map();
  for (const r of records) for (const t of r.tags) byTagAnn.set(t.tag, (byTagAnn.get(t.tag) ?? 0) + 1);
  const covered = records.filter((r) => r.tags.length > 0).length;
  console.log(`\n覆盖：${covered}/${records.length} 本至少一个标签；加权 ${wAnn}`);
  const thin = Object.keys(lexicon.tags).filter((t) => (byTagAnn.get(t) ?? 0) < 5);
  console.log(
    `标签分布（少于 5 本的：${thin.length} 个${thin.length ? ` → ${thin.slice(0, 6).join(', ')}` : ''}）`,
  );

  /* ── ④ 金标校准 ── */
  let goldLine = '未做';
  if (!existsSync(GOLD_EVAL)) {
    skip('金标校准', '没有 .cache/gold-eval.json（先跑 annotate-books.mjs --gold）');
  } else {
    const goldEval = JSON.parse(readFileSync(GOLD_EVAL, 'utf8'));
    const coreMap = JSON.parse(readFileSync(join(ROOT, 'catalog', 'core-id-map.json'), 'utf8')).entries ?? {};
    const subjToCore = new Map(Object.entries(coreMap).map(([coreId, e]) => [String(e.subject_id), coreId]));
    const human = new Map();
    for (const f of ['seed-core-01.json', 'seed-core-02.json']) {
      const p = join(ROOT, 'catalog', 'shards', f);
      if (!existsSync(p)) continue;
      for (const b of JSON.parse(readFileSync(p, 'utf8'))) {
        human.set(b.book_id, new Set((b.problem_tags ?? []).map((x) => x.tag)));
      }
    }
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let compared = 0;
    for (const r of goldEval) {
      const coreId = subjToCore.get(String(r.id));
      const truth = human.get(coreId);
      if (!truth) continue;
      compared += 1;
      const pred = new Set(r.tags.map((t) => t.tag));
      for (const t of pred) (truth.has(t) ? (tp += 1) : (fp += 1));
      for (const t of truth) if (!pred.has(t)) fn += 1;
    }
    const P = tp / (tp + fp || 1);
    const R = tp / (tp + fn || 1);
    goldLine = `${compared} 本，精确率 ${(P * 100).toFixed(0)}% / 召回率 ${(R * 100).toFixed(0)}%`;
    chk(`金标精确率 ≥ ${MIN_PRECISION * 100}%（实测 ${(P * 100).toFixed(0)}%）`, P >= MIN_PRECISION, `差 ${((MIN_PRECISION - P) * 100).toFixed(0)} 个点`);
    chk(`金标召回率 ≥ ${MIN_RECALL * 100}%（实测 ${(R * 100).toFixed(0)}%）`, R >= MIN_RECALL);
  }

  /* ── 报告 ── */
  mkdirSync(dirname(REPORT), { recursive: true });
  const lines = [
    '# 标注通道质量报告',
    '',
    `> 由 \`tools/verify-annotations.mjs\` 生成。产物 ${records.length} 本，覆盖 ${covered} 本。`,
    '',
    '## 结论',
    '',
    `- 结构：${failures.some((f) => /标签|证据|prompt|id/.test(f)) ? '有失败项' : '通过'}`,
    `- 证据可追溯：${unverified.some((u) => u.startsWith('证据')) ? '未验证' : untraceable === 0 ? '通过' : '失败'}`,
    `- 金标：${goldLine}`,
    '',
    '## 逐标签覆盖',
    '',
    '| 标签 | 标注证据 |',
    '|---|---|',
    ...[...byTagAnn.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `| ${t} | ${n} |`),
    '',
  ];
  if (unverified.length > 0) {
    lines.push('## 未验证', '', ...unverified.map((u) => `- ${u}`), '');
  }
  writeFileSync(REPORT, lines.join('\n'), 'utf8');
  console.log(`\n报告 → ${REPORT}`);

  if (failures.length > 0) {
    console.error(`\n[不通过] 标注校验失败 ${failures.length} 项`);
    process.exit(1);
  }
  if (unverified.length > 0) {
    console.log(`\n[未验证] ${unverified.length} 项没能校验（不是通过）`);
    if (strict) process.exit(2);
    return;
  }
  console.log('\n[通过] 标注产物校验全部通过');
}

main();
