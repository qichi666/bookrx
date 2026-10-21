#!/usr/bin/env node
/**
 * 标注器：读本地缓存的简介与目录，逐本判定这本书能帮上哪些困境。
 *
 * ## 为什么要有它
 *
 * 书名词表只有 1872 本强证据，`big-choice` / `emptiness` 这样的标签池子掉到 1–2 本。
 * 试过「简介 + 词表关键词」这条纯确定性路线，在 30 本人标书上精确率 **35%**
 * （书名词表是 84%）——简介是营销长文，关键词命中退化成"提到过这个话题"。
 * 所以要扩到千级，只能让模型读文本做语义判断。
 *
 * ## 只标一个字段，是刻意的
 *
 * 只产 `problem_tags`。`one_line_what` / `first_action` / `match_brief` 要读过全书才写得出来，
 * 让模型看 400 字简介写这些就是编造；`difficulty` / `prose_accessibility` 是"读起来难不难"，
 * 同样要正文。与其产一堆无法验证的字段，不如把唯一能负责的那个做到可核对。
 *
 * ## 证据是硬闸，不是置信度
 *
 * 每个标签必须附一句**从简介或目录里逐字复制**的原文（≤40 字）。本地对每个标签做
 * `normalize(evidence) ⊆ normalize(原文)` 校验，不通过就**丢掉这个标签**并把原因记账。
 * 不采信模型自报的 confidence——那个数字没法被证伪，而"这句话在不在原文里"可以。
 *
 * ## 用法
 *
 *   node tools/annotate-books.mjs --limit 20        # 试标 20 本
 *   node tools/annotate-books.mjs --all             # 全量（续跑，已标过的跳过）
 *   node tools/annotate-books.mjs --gold            # 只在 30 本人标书上跑，用于校准，不进产物
 *   node tools/annotate-books.mjs --dry 3           # 只打印 prompt 与响应，不落盘
 *
 * 需要 `DEEPSEEK_API_KEY`（写在项目根 `.env`，该文件已在 .gitignore）。
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = join(ROOT, 'public', 'catalog', 'candidates', 'all.json');
const LEX = join(ROOT, 'catalog', 'problem-lexicon.json');
const INTRO_DIR = join(ROOT, '.cache', 'intros');
const OUT_DIR = join(ROOT, 'catalog', 'annotations');
const META = join(OUT_DIR, '_meta.json');
const GOLD_OUT = join(ROOT, '.cache', 'gold-eval.json');

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const SHARD_SIZE = 200;
const TOP_N = 3;
const MAX_EVIDENCE = 40;
/** prompt 改一个字就换版本号：产物里记着它，任何一条标注都能被复现或追责 */
const PROMPT_VERSION = 'v1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { all: false, limit: 0, gold: false, dry: 0, ids: null, showPrompt: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--limit') out.limit = Number(argv[(i += 1)]);
    else if (a === '--gold') out.gold = true;
    else if (a === '--dry') out.dry = Number(argv[(i += 1)] ?? 1);
    else if (a === '--show-prompt') out.showPrompt = true;
    else if (a === '--ids') out.ids = String(argv[(i += 1)]).split(',').filter(Boolean);
  }
  return out;
}

/** 读 .env，不覆盖已有环境变量（`.env` 不进 git）。 */
function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const norm = (s) =>
  String(s ?? '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[《》「」『』·\-—_/\\|"'“”‘’!！?？,，.。:：;；()（）\[\]【】]/g, '')
    .toLowerCase();

/* ── prompt ─────────────────────────────────────────────────────────── */

const SYSTEM = `你在为一款「按当下困境找书」的工具做图书标注。

给你一本书的书名、副标题、豆瓣大类、内容简介和目录，判断这本书**实际能帮上**哪些困境。

规则：
1. 只依据简介和目录判断。简介里没讲到的，不要根据书名联想，也不要按「这类书通常讲什么」补充。
2. 每个标签必须附一句原文证据：从简介或目录里**逐字复制**一段不超过 40 字的连续文字，不要改写、不要拼接、不要加省略号。
3. 最多 ${TOP_N} 个标签。宁少勿滥——只有一个成立就只给一个，一个都不成立就给空数组。
4. 判断的是「这本书解决什么」，不是「它提到了什么」。一本书提到焦虑但主题是讲沟通方法，那就不该打焦虑。
5. 只输出 JSON，不要任何解释。`;

function tagTable(lexicon) {
  return Object.entries(lexicon.tags)
    .map(([id, def]) => `- ${id}（${def.label}）：${def.def}`)
    .join('\n');
}

function buildUser(book, intro, toc, lexicon) {
  return `【标签表】
${tagTable(lexicon)}

【这本书】
书名：${book.title}
副标题：${book.subtitle || '（无）'}
豆瓣大类：${(book.tags ?? []).join('、') || '（无）'}
作者：${(book.authors ?? []).join('、') || '（无）'}

【内容简介】
${intro || '（无）'}

【目录】
${toc || '（无）'}

【输出格式】
{"tags": [{"tag": "标签 id", "evidence": "从上面简介或目录里逐字复制的片段"}]}`;
}

const promptSha = createHash('sha256').update(`${PROMPT_VERSION}\n${SYSTEM}`).digest('hex').slice(0, 12);

/* ── 调用 ───────────────────────────────────────────────────────────── */

async function callModel(userText) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw Object.assign(new Error('缺少 DEEPSEEK_API_KEY（写进项目根 .env）'), { fatal: true });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userText },
      ],
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw Object.assign(new Error(`HTTP ${res.status} ${body}`), { fatal: res.status === 401 || res.status === 402 });
  }
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    usage: json.usage ?? {},
  };
}

/**
 * 校验并裁掉不合格的标签。
 *
 * 返回 `{ tags, dropped }`：`dropped` 里逐条写原因，**不静默丢弃**——
 * 一个"标签被悄悄砍掉但脚本报成功"的通道，比没有通道更危险。
 *
 * 导出是为了能被单测直接打：这条闸如果不灵，整个通道就是在生产带引文的幻觉。
 */
export function validate(raw, lexicon, sourceText) {
  const allowed = new Set(Object.keys(lexicon.tags));
  const src = norm(sourceText);
  const tags = [];
  const dropped = [];
  const seen = new Set();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { tags, dropped: [{ tag: null, reason: 'json_parse' }] };
  }
  const list = Array.isArray(parsed?.tags) ? parsed.tags : [];
  for (const item of list) {
    const tag = String(item?.tag ?? '');
    const evidence = String(item?.evidence ?? '');
    if (!allowed.has(tag)) { dropped.push({ tag, reason: 'unknown_tag' }); continue; }
    if (seen.has(tag)) { dropped.push({ tag, reason: 'duplicate' }); continue; }
    if (evidence.length === 0) { dropped.push({ tag, reason: 'no_evidence' }); continue; }
    if (evidence.length > MAX_EVIDENCE) { dropped.push({ tag, reason: 'evidence_too_long' }); continue; }
    if (!src.includes(norm(evidence))) { dropped.push({ tag, reason: 'evidence_not_verbatim' }); continue; }
    seen.add(tag);
    tags.push({ tag, evidence });
  }
  const kept = tags.slice(0, TOP_N);
  for (const extra of tags.slice(TOP_N)) dropped.push({ tag: extra.tag, reason: 'over_top_n' });
  return { tags: kept, dropped };
}

/* ── 产物读写 ────────────────────────────────────────────────────────── */

function loadShards() {
  const out = [];
  if (!existsSync(OUT_DIR)) return out;
  for (const f of readdirSync(OUT_DIR).filter((x) => /^shard-\d+\.json$/.test(x)).sort()) {
    const arr = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
    for (const r of arr) out.push(r);
  }
  return out;
}

function writeShards(records) {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(OUT_DIR).filter((x) => /^shard-\d+\.json$/.test(x));
  for (const f of files) writeFileSync(join(OUT_DIR, f), '[]', 'utf8'); // 清空后重写，避免残留旧分片
  const sorted = [...records].sort((a, b) => (a.id < b.id ? -1 : 1));
  let n = 0;
  for (let i = 0; i < sorted.length; i += SHARD_SIZE) {
    n += 1;
    const name = `shard-${String(n).padStart(2, '0')}.json`;
    writeFileSync(join(OUT_DIR, name), JSON.stringify(sorted.slice(i, i + SHARD_SIZE)), 'utf8');
  }
  const byTag = {};
  for (const r of sorted) for (const t of r.tags) byTag[t.tag] = (byTag[t.tag] ?? 0) + 1;
  writeFileSync(
    META,
    JSON.stringify(
      {
        note: '本目录只存派生标注与 ≤40 字证据引文，不含简介原文。生成工具 tools/annotate-books.mjs。',
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        prompt_sha: promptSha,
        top_n: TOP_N,
        total: sorted.length,
        with_tags: sorted.filter((r) => r.tags.length > 0).length,
        by_tag: Object.fromEntries(Object.entries(byTag).sort((a, b) => b[1] - a[1])),
      },
      null,
      2,
    ),
    'utf8',
  );
}

/* ── 主流程 ──────────────────────────────────────────────────────────── */

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const books = JSON.parse(readFileSync(ALL, 'utf8'));
  const lexicon = JSON.parse(readFileSync(LEX, 'utf8'));

  // 人标书（金标）默认不参与：它们是检验通道的尺子，不能被通道自己写过
  const goldIds = new Set();
  for (const f of ['seed-core-01.json', 'seed-core-02.json']) {
    const p = join(ROOT, 'catalog', 'shards', f);
    // 人标书用的是 `book_id`（core:000001），候选层用的是 `id`（豆瓣 subject_id）——
    // 两个字段名不一样，写成 `b.id` 会得到一堆 "undefined"，而过滤结果只是"0 本待标"，
    // 看起来像"已经全标完了"。
    if (existsSync(p)) for (const b of JSON.parse(readFileSync(p, 'utf8'))) goldIds.add(String(b.book_id));
  }
  const coreIdMap = join(ROOT, 'catalog', 'core-id-map.json');
  const coreToSubject = new Map();
  if (existsSync(coreIdMap)) {
    for (const [coreId, e] of Object.entries(JSON.parse(readFileSync(coreIdMap, 'utf8')).entries ?? {})) {
      coreToSubject.set(String(e.subject_id), coreId);
    }
  }

  const haveIntro = (id) => existsSync(join(INTRO_DIR, `${id}.json`));
  const readIntro = (id) => JSON.parse(readFileSync(join(INTRO_DIR, `${id}.json`), 'utf8'));

  let targets;
  if (args.gold) {
    // 只标**真有人标标签**的那几本：core-id-map 里有 67 条，但人工标注只有 30 本，
    // 拿没有人工标签的书去"校准"等于拿空集合算精确率。
    targets = books.filter((b) => {
      const coreId = coreToSubject.get(String(b.id));
      return coreId !== undefined && goldIds.has(coreId) && haveIntro(String(b.id));
    });
  } else {
    const done = new Set(loadShards().map((r) => String(r.id)));
    targets = books.filter((b) => haveIntro(String(b.id)) && !done.has(String(b.id)) && !coreToSubject.has(String(b.id)));
  }
  if (args.ids) targets = targets.filter((b) => args.ids.includes(String(b.id)));
  if (args.limit > 0) targets = targets.slice(0, args.limit);
  if (!args.all && !args.gold && args.limit === 0 && !args.ids) {
    console.error('要指定范围：--all / --limit N / --gold / --ids a,b,c');
    process.exit(1);
  }

  const cached = existsSync(INTRO_DIR) ? readdirSync(INTRO_DIR).filter((f) => f.endsWith('.json')).length : 0;
  console.log(`简介缓存 ${cached} 本；本次待标 ${targets.length} 本（模型 ${MODEL}，prompt ${PROMPT_VERSION}/${promptSha}）`);
  if (targets.length === 0) {
    console.log('没有待标书目。先跑 tools/fetch-intros.mjs 取简介。');
    return;
  }

  // 不开模型也能核对提示词——prompt 是这条通道里最该被人读一遍的东西。
  if (args.showPrompt) {
    const b = targets[0];
    const c = readIntro(String(b.id));
    console.log('\n===== SYSTEM =====\n' + SYSTEM);
    console.log('\n===== USER（示例：' + b.title + '）=====\n' + buildUser(b, c.intro, c.toc, lexicon));
    return;
  }

  const records = args.gold ? [] : loadShards();
  const existing = new Set(records.map((r) => String(r.id)));
  const gold = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let failed = 0;
  let droppedAll = 0;

  for (const [i, b] of targets.entries()) {
    const id = String(b.id);
    const cache = readIntro(id);
    const sourceText = `${cache.intro}\n${cache.toc}\n${b.title} ${b.subtitle ?? ''}`;
    const user = buildUser(b, cache.intro, cache.toc, lexicon);

    let result = { tags: [], dropped: [] };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const r = await callModel(user);
        tokensIn += r.usage.prompt_tokens ?? 0;
        tokensOut += r.usage.completion_tokens ?? 0;
        if (args.dry > 0 && i < args.dry) {
          console.log(`\n── ${id} ${b.title} ──\n${user.slice(0, 700)}\n…\n${r.text}`);
        }
        result = validate(r.text, lexicon, sourceText);
        if (result.dropped.every((d) => d.reason !== 'json_parse')) break;
      } catch (e) {
        if (e.fatal) {
          console.error(`\n[停止] ${e.message}`);
          if (!args.gold) writeShards(records);
          process.exit(2);
        }
        if (attempt === 2) { failed += 1; result = { tags: [], dropped: [{ tag: null, reason: `api:${e.message}` }] }; }
        else await sleep(2000);
      }
    }

    if (result.dropped.length > 0) {
      droppedAll += result.dropped.length;
    }
    const rec = {
      id,
      title: b.title,
      tags: result.tags,
      ...(result.dropped.length > 0 ? { dropped: result.dropped } : {}),
      prompt: `${PROMPT_VERSION}/${promptSha}`,
    };
    if (args.gold) gold.push(rec);
    else if (!existing.has(id)) records.push(rec);

    if ((i + 1) % 20 === 0 || i + 1 === targets.length) {
      const kept = (args.gold ? gold : records).reduce((s, r) => s + r.tags.length, 0);
      console.log(`  ${i + 1}/${targets.length}  标签 ${kept} 个  丢弃 ${droppedAll} 处  失败 ${failed}  用量 ${tokensIn}+${tokensOut} tok`);
    }
    await sleep(300);
  }

  if (args.gold) {
    mkdirSync(dirname(GOLD_OUT), { recursive: true });
    writeFileSync(GOLD_OUT, JSON.stringify(gold), 'utf8');
    console.log(`\n[金标] ${gold.length} 本 → ${GOLD_OUT}（不进仓库，只用于校准）`);
  } else {
    writeShards(records);
    console.log(`\n[完成] 累计 ${records.length} 本 → ${OUT_DIR}`);
  }
  const cost = (tokensIn / 1e6) * 1 + (tokensOut / 1e6) * 2;
  console.log(`token 用量 ${tokensIn} in / ${tokensOut} out，按 DeepSeek 牌价约 ¥${cost.toFixed(2)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
