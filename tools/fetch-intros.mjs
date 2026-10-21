#!/usr/bin/env node
/**
 * 取证器：把每本书的简介与目录抓到本地缓存，供标注器读。
 *
 * **缓存不入 git**（`.cache/` 已在 .gitignore 里）。简介是出版社文案，
 * 仓库里只允许出现派生结论和 ≤40 字的证据引文，原文一个字都不进版本库。
 * 这条边界由 `.gitignore` + `tools/release-check.mjs` 两头守。
 *
 * 为什么必须抓文本：实测过「简介 + 词表关键词」这条确定性路线，
 * 在 30 本人标书上精确率只有 **35%**（书名规则是 84%）——
 * 简介是营销长文，关键词命中退化成"提到过这个话题"。所以扩到千级只能靠语义判断，
 * 而语义判断要先有文本可读。数据见 `docs/标注通道.md`。
 *
 * 用法：
 *   node tools/fetch-intros.mjs --limit 20         # 试抓 20 本
 *   node tools/fetch-intros.mjs --all              # 全量（约 3.5 小时）
 *   node tools/fetch-intros.mjs --ids 26369699,3533221
 *
 * 纪律：1.7–2.5s 随机间隔；403/418 立即整体停止（不硬刚反爬）；默认续跑。
 */
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = join(ROOT, 'public', 'catalog', 'candidates', 'all.json');
const CACHE_DIR = join(ROOT, '.cache', 'intros');
const FAILED = join(ROOT, '.cache', 'intros-failed.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MIN_GAP_MS = 1700;
const MAX_GAP_MS = 2500;
/** 简介全文上限：标注用不到更多，截断点按句子边界回退 */
const MAX_INTRO = 2000;
const MAX_TOC = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));

function parseArgs(argv) {
  const out = { all: false, limit: 0, ids: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--limit') out.limit = Number(argv[(i += 1)]);
    else if (a === '--ids') out.ids = String(argv[(i += 1)]).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/** 去标签、解实体、压空白。与 fetch-douban 同一套处理，但这里保留换行（目录要用）。 */
function text(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 按句末标点回退截断，避免把一句话切成两半。 */
function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('\n'));
  return (at > max * 0.6 ? cut.slice(0, at + 1) : cut).trim();
}

/**
 * 解析详情页。
 *
 * 豆瓣把「内容简介」放两处：短版在前、全文在后（`<div class="intro">` 出现两次），
 * 目录在 `<div id="dir_XXXXX_full">`。取最长的那段简介——
 * 只取第一段会稳定拿到 390 字的截断版（带「展开全部」字样），信息量差一半。
 */
export function parseDetail(html) {
  // `[^>]*` 是为了容忍豆瓣给全文块加 `style="display:none"` 之类的属性。
  // 若写死成 `<div class="intro">`，一旦它加个属性，这里就**静默变成只拿到短版**——
  // 不报错、不报警，只是简介少一半。
  const intros = [...html.matchAll(/<div class="intro"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => text(m[1]))
    .map((s) => s.replace(/\s*\(展开全部\)\s*$/, ''))
    .filter((s) => s.length > 20);
  const intro = intros.sort((a, b) => b.length - a.length)[0] ?? '';

  // 目录在 `<div class="indent" id="dir_XXXXX_full">` 里，内容只有 `<br/>`、没有嵌套 div，
  // 所以第一个 `</div>` 就是块尾。**别写成要求 `<div class="bd">` 子块**——
  // 那个正则永远匹配不到，字段恒为空而脚本照样报成功（这项目最忌讳的静默失效）。
  const dirM = html.match(/<div[^>]*id="dir_\d+_full"[^>]*>([\s\S]*?)<\/div>/);
  const toc = dirM ? text(dirM[1]) : '';

  // 书名以详情页为准做一次交叉核对：抓错页面（重定向到搜索页）时能当场发现
  const titleM = html.match(/<span property="v:itemreviewed">([\s\S]*?)<\/span>/);
  const pageTitle = titleM ? text(titleM[1]) : '';

  return { intro: clip(intro, MAX_INTRO), toc: clip(toc, MAX_TOC), page_title: pageTitle };
}

async function fetchDetail(subjectId) {
  const url = `https://book.douban.com/subject/${subjectId}/`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 403 || res.status === 418) {
        throw Object.assign(new Error(`anti-bot ${res.status}`), { fatal: true });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e.fatal) throw e;
      if (attempt < 3) await sleep(4000 * attempt);
    }
  }
  throw lastErr;
}

function doneSet() {
  if (!existsSync(CACHE_DIR)) return new Set();
  return new Set(
    readdirSync(CACHE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, '')),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const books = JSON.parse(readFileSync(ALL, 'utf8'));
  const done = doneSet();
  mkdirSync(CACHE_DIR, { recursive: true });

  let targets = books.filter((b) => !done.has(String(b.id)));
  if (args.ids) {
    const want = new Set(args.ids);
    targets = books.filter((b) => want.has(String(b.id)));
  }
  if (args.limit > 0) targets = targets.slice(0, args.limit);
  if (!args.all && !args.ids && args.limit === 0) {
    console.error('要指定范围：--all / --limit N / --ids a,b,c');
    process.exit(1);
  }

  console.log(`待抓 ${targets.length} 本（已缓存 ${done.size} 本）→ ${CACHE_DIR}`);

  const failed = [];
  let ok = 0;
  for (const [i, b] of targets.entries()) {
    const sid = String(b.id);
    try {
      const html = await fetchDetail(sid);
      const parsed = parseDetail(html);
      if (parsed.intro === '') {
        failed.push({ id: sid, title: b.title, reason: 'no_intro' });
      } else {
        writeFileSync(
          join(CACHE_DIR, `${sid}.json`),
          JSON.stringify({
            v: 1,
            id: sid,
            title: b.title,
            intro: parsed.intro,
            toc: parsed.toc,
            fetched_at: new Date().toISOString().slice(0, 10),
          }),
          'utf8',
        );
        ok += 1;
      }
    } catch (e) {
      if (e.fatal) {
        writeFileSync(FAILED, JSON.stringify(failed.concat([{ id: sid, reason: e.message }]), null, 2));
        console.error(`\n[停止] ${sid}: ${e.message} —— 触发反爬。已抓到 ${ok} 本，明天同命令续跑。`);
        process.exit(2);
      }
      failed.push({ id: sid, title: b.title, reason: e.message });
    }
    if ((i + 1) % 20 === 0 || i + 1 === targets.length) {
      console.log(`  ${i + 1}/${targets.length}  成功 ${ok}  失败 ${failed.length}`);
    }
    await sleep(jitter());
  }

  if (failed.length > 0) writeFileSync(FAILED, JSON.stringify(failed, null, 2), 'utf8');
  console.log(`\n[完成] 新增 ${ok} 本，失败 ${failed.length} 本${failed.length ? `（见 ${FAILED}）` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])) main();
