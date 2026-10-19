#!/usr/bin/env node
/**
 * 豆瓣读书标签页抓取（构建期工具，不进入运行时）。
 *
 * 只抓公开列表页，不登录、不碰详情页、不存简介原文（版权）。
 * 每页 20 条，字段：subject_id / 书名 / 作者与译者 / 出版社 / 年份 / 评分 / 评价人数。
 *
 * 用法：
 *   node tools/fetch-douban.mjs --tag 心理学 --pages 3        # 单标签试抓
 *   node tools/fetch-douban.mjs --all --pages 30              # 全量
 *   node tools/fetch-douban.mjs --all --pages 30 --resume     # 默认就是续跑
 *
 * 纪律：1.6–2.6s 随机间隔；失败退避重试；403/418 立即整体停止（不硬刚反爬）。
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, 'catalog', 'raw');
const RAW_FILE = path.join(RAW_DIR, 'douban.jsonl');
const TAG_MAP = path.join(ROOT, 'catalog', 'tag-map.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PAGE_SIZE = 20;
const MIN_GAP_MS = 1600;
const MAX_GAP_MS = 2600;

function parseArgs(argv) {
  const out = { tag: null, pages: 3, all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--tag') out.tag = argv[(i += 1)];
    else if (a === '--pages') out.pages = Number(argv[(i += 1)]);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_GAP_MS + Math.floor(Math.random() * (MAX_GAP_MS - MIN_GAP_MS));

/** 去标签、解实体、压空白。 */
function text(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解析一页标签列表。
 * pub 行格式：[国籍] 作者 / 译者 / 出版社 / 出版年月 / 定价（可能缺项）
 */
export function parseTagPage(html, domain, tag) {
  const items = [];
  const blocks = html.split('<li class="subject-item">').slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/subject\/(\d{4,12})\//);
    if (!idMatch) continue;
    const subjectId = idMatch[1];

    const titleMatch = block.match(/<a href="https:\/\/book\.douban\.com\/subject\/\d+\/" title="([^"]*)"/);
    const title = titleMatch ? text(titleMatch[1]) : '';
    if (!title) continue;

    const subMatch = block.match(/<span style="font-size:12px;">\s*:\s*([\s\S]*?)<\/span>/);
    const subtitle = subMatch ? text(subMatch[1]) : '';

    const pubMatch = block.match(/<div class="pub">([\s\S]*?)<\/div>/);
    const pubLine = pubMatch ? text(pubMatch[1]) : '';
    const parts = pubLine.split('/').map((s) => s.trim()).filter(Boolean);

    // 评分与人数：星级块缺失时两者都为 null（新书/无评分）
    const ratingMatch = block.match(/class="rating_nums">([\d.]+)</);
    const votesMatch = block.match(/\((\d+)人评价\)/);
    const rating = ratingMatch ? Number(ratingMatch[1]) : null;
    const votes = votesMatch ? Number(votesMatch[1]) : null;

    // pub 行尾部依次是 出版年月、定价；出版年月形如 2026-7 / 2020 / 2019-3
    let publisher = '';
    let year = null;
    for (const p of parts) {
      const y = p.match(/(19\d{2}|20\d{2})(?:[-/.](\d{1,2}))?/);
      if (y && !year) {
        year = Number(y[1]);
        continue;
      }
      if (/元$|¥|CNY/i.test(p)) continue; // 定价
      if (!publisher && /(出版|书局|书店|公司|大学|人民|三联|译文|译林|中信|机械工业|商务|广西师范|湖南文艺|上海|北京|江苏|浙江)/.test(p)) {
        publisher = p;
      }
    }
    // 首项常是「[美] 作者」；含译者的第二项通常无国籍前缀
    const authors = parts.slice(0, 2).filter((p) => !/(19\d{2}|20\d{2})/.test(p) && !/元$/.test(p));

    items.push({
      subject_id: subjectId,
      title,
      subtitle,
      authors,
      pub_line: pubLine,
      publisher,
      year,
      rating,
      votes,
      tag,
      domain,
      fetched_at: new Date().toISOString().slice(0, 10),
    });
  }
  return items;
}

async function fetchPage(tag, start) {
  const url = `https://book.douban.com/tag/${encodeURIComponent(tag)}?start=${start}&type=T`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(15000),
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

async function loadDone() {
  if (!existsSync(RAW_FILE)) return new Set();
  const raw = await readFile(RAW_FILE, 'utf8');
  const done = new Set();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      done.add(`${r.tag}:${r.subject_id}`);
    } catch {
      /* 半行跳过 */
    }
  }
  return done;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const map = JSON.parse(await readFile(TAG_MAP, 'utf8'));
  const targets = args.all ? map.tags : map.tags.filter((t) => t.tag === args.tag);
  if (targets.length === 0) {
    console.error(`没有匹配的标签：${args.tag ?? '(空)'}。可用：${map.tags.map((t) => t.tag).join(', ')}`);
    process.exit(1);
  }

  await mkdir(RAW_DIR, { recursive: true });
  const done = await loadDone();
  let added = 0;

  for (const { tag, domain } of targets) {
    const maxStart = Math.max(0, (args.pages - 1) * PAGE_SIZE);
    for (let start = 0; start <= maxStart; start += PAGE_SIZE) {
      const keyProbe = `${tag}:`;
      const already = [...done].some((k) => k.startsWith(keyProbe));
      if (already && start === 0 && args.pages === 1) {
        // 单页模式续跑判断交给逐条 id 去重，这里不阻塞
      }
      let html;
      try {
        html = await fetchPage(tag, start);
      } catch (e) {
        console.error(`[停止] ${tag} start=${start}: ${e.message}`);
        if (e.fatal) {
          console.error('触发反爬，已停止。已抓到的数据已落盘，明天再跑同一命令即可续抓。');
          process.exit(2);
        }
        break;
      }
      const items = parseTagPage(html, domain, tag);
      const fresh = items.filter((it) => !done.has(`${tag}:${it.subject_id}`));
      if (fresh.length === 0 && items.length === 0) break; // 翻到底
      for (const it of fresh) {
        done.add(`${tag}:${it.subject_id}`);
        await appendFile(RAW_FILE, `${JSON.stringify(it)}\n`, 'utf8');
        added += 1;
      }
      console.log(`${tag} start=${start} 解析 ${items.length} 条，新增 ${fresh.length} 条`);
      await sleep(jitter());
    }
  }
  console.log(`完成：本次新增 ${added} 条 → ${path.relative(ROOT, RAW_FILE)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
