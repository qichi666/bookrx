#!/usr/bin/env node
/**
 * 核心库（`core:`）↔ 候选池（豆瓣 `subject_id`）身份对齐。
 *
 * 为什么必须有这层：两套 id 是不同来源，`seed-core-01.json` 里的 `source_url`
 * 有三条且**全部写错**（指向的 subject 在候选池里根本不存在）。没有可信映射时，
 * 同一本书会以两个身份同时出现（核心库推荐一次、宽池"相关书目"再出现一次），
 * 而去重逻辑按 id 判断，看不见它们其实是同一本。
 *
 * 匹配口径：书名归一化后相等是硬条件；同名多版时**一律取 votes 最高者**。
 *
 * 为什么不是"优先取作者匹配的那个"：同一本书的不同版次/不同抓取来源，作者字段写法
 * 天差地别（《关键对话》一版写 "Kerry Patterson、Joseph Grenny"，另一版写
 * "约瑟夫·格雷尼（Joseph Grenny）..."），按作者筛会稳定挑中票数低的那个版本。
 * 作者匹配因此降级为**证据**而不是筛选条件：对得上就记 `author_matched: true`，
 * 对不上但书名唯一时仍然采用，并记 `needs_review`。
 *
 * 两张人工表：
 *   OVERRIDES     —— 规则结论与人工判断冲突时以人工为准，必须写理由
 *   ALLOW_MISSING —— 候选池抓取范围外的书（公版古籍等），必须写理由，不允许静默放过
 *
 * 三态纪律：0 本匹配上 = 未验证而非通过；有歧义的选择全部写进 `ambiguous` 供人工复核。
 */

/** 人工钉死的映射。键 = 核心库 core_id，值必须带理由，否则下一个看的人不知道为什么。 */
const OVERRIDES = {
  // 按作者筛会挑中 36168599（v1019），但 10586741（v7011）才是豆瓣主记录，
  // 两者是同一本书的第 2/3 版；主记录更能代表"用户会搜到的那本"。
  'core:000003': { subject_id: '10586741', reason: '两个版次，取豆瓣主记录（v7011 > v1019）' },
};

/** 候选池外的书：池子是按标签页抓的，不是全量豆瓣，公版古籍经常不在。 */
const ALLOW_MISSING = {
  // 《围炉夜话》清人王永彬，公版古籍，池内 6551 本中确实没有。
  'core:000013': '公版古籍，候选池抓取范围外',
};

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SHARD_DIR = 'catalog/shards';
const CANDIDATE_FILE = 'public/catalog/candidates/all.json';
const OUT = 'catalog/core-id-map.json';

/** 书名归一化：去空格/标点/副标题修饰，全角转半角，去版本标记。 */
function normTitle(s) {
  return s
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[·・:：,，.。!！?？'"'"()（）[\]【】\-—–_/]/g, '')
    .replace(/第[一二三四五六七八九十\d]+版/g, '')
    .replace(/修订版|精装版|插图版|珍藏版|新版|全集|套装|上下册|全\d册/g, '')
    .toLowerCase();
}

/** 取作者姓氏片段做交集判断：只保留中文/字母，去掉译者与国籍标注。 */
function authorKeys(list) {
  const out = new Set();
  for (const raw of list ?? []) {
    const s = String(raw)
      .normalize('NFKC')
      .replace(/[\[［(（].*?[\]］)）]/g, '')
      .replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
    if (s.length >= 2) out.add(s.slice(0, 3).toLowerCase());
  }
  return out;
}

function loadShardBooks() {
  const out = [];
  for (const f of readdirSync(SHARD_DIR)) {
    if (!f.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(join(SHARD_DIR, f), 'utf8'));
    const arr = Array.isArray(data) ? data : (data.books ?? []);
    for (const b of arr) if (typeof b.book_id === 'string') out.push({ ...b, _shard: f });
  }
  return out;
}

function main() {
  const candidates = JSON.parse(readFileSync(CANDIDATE_FILE, 'utf8'));
  const cands = Array.isArray(candidates) ? candidates : (candidates.books ?? candidates.items ?? []);
  if (cands.length === 0) {
    console.error('[未验证] 候选池为空 —— 不得据此生成映射');
    process.exit(1);
  }

  const byNorm = new Map();
  for (const c of cands) {
    const k = normTitle(c.title);
    if (!k) continue;
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(c);
  }

  const books = loadShardBooks();
  console.log(`map-core：扫了 ${books.length} 本核心库书目，候选池 ${cands.length} 本`);

  const map = {};
  const ambiguous = [];
  const missed = [];

  for (const b of books) {
    const pinned = OVERRIDES[b.book_id];
    const k = normTitle(b.title);
    const pool = byNorm.get(k) ?? [];

    if (pinned) {
      const target = cands.find((c) => c.id === pinned.subject_id);
      if (!target) {
        missed.push({ core_id: b.book_id, title: b.title, reason: 'OVERRIDES 指向的 subject 不在候选池' });
        continue;
      }
      map[b.book_id] = {
        subject_id: target.id,
        title: b.title,
        matched_title: target.title,
        votes: target.votes ?? 0,
        method: 'override',
        same_title_count: pool.length,
        author_matched: null,
        reason: pinned.reason,
      };
      continue;
    }

    if (pool.length === 0) {
      if (ALLOW_MISSING[b.book_id]) {
        console.log(`  [白名单] ${b.book_id} ${b.title}：${ALLOW_MISSING[b.book_id]}`);
        continue;
      }
      missed.push({ core_id: b.book_id, title: b.title, reason: '候选池内无同名书' });
      continue;
    }

    const ranked = [...pool].sort((x, y) => (y.votes ?? 0) - (x.votes ?? 0));
    const pick = ranked[0];
    const mine = authorKeys(b.author_display);
    const authorMatched = authorKeys(pick.authors).size > 0 && [...mine].some((m) => {
      const s = [...authorKeys(pick.authors)].join('');
      return s.includes(m);
    });

    map[b.book_id] = {
      subject_id: pick.id,
      title: b.title,
      matched_title: pick.title,
      votes: pick.votes ?? 0,
      method: authorMatched ? 'exact' : 'title',
      same_title_count: pool.length,
      author_matched: authorMatched,
      ...(authorMatched ? {} : { needs_review: true }),
    };
    if (pool.length > 1) {
      ambiguous.push({
        core_id: b.book_id,
        title: b.title,
        picked: pick.id,
        picked_votes: pick.votes ?? 0,
        others: ranked.slice(1, 4).map((c) => ({ id: c.id, title: c.title, votes: c.votes ?? 0 })),
      });
    }
  }

  // 同一 subject 被两本核心库书抢 → 说明核心库内部重复，必须暴露
  const used = new Map();
  const dup = [];
  for (const [book_id, v] of Object.entries(map)) {
    if (used.has(v.subject_id)) dup.push({ subject_id: v.subject_id, books: [used.get(v.subject_id), book_id] });
    else used.set(v.subject_id, book_id);
  }

  const payload = {
    note: '核心库 book_id → 豆瓣 subject_id。由 tools/map-core-to-candidates.mjs 生成，勿手改。',
    source_sha256_note: '候选池取自 public/catalog/candidates/all.json',
    generated_from: CANDIDATE_FILE,
    entries: map,
    ambiguous,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');

  console.log(`[映射] ${Object.keys(map).length}/${books.length} 本对上`);
  for (const [id, v] of Object.entries(map)) {
    const tag = v.method === 'exact' ? 'OK  ' : 'WARN';
    console.log(`  ${tag} ${id} ${v.title} -> ${v.subject_id} (${v.matched_title}, v${v.votes}, ${v.same_title_count} 个同名版)`);
  }
  if (ambiguous.length) {
    console.log(`\n[歧义] ${ambiguous.length} 本有多个同名版本，已取 votes 最高者：`);
    for (const a of ambiguous) {
      console.log(`  ${a.core_id} ${a.title}：取 ${a.picked}(v${a.picked_votes})，其余 ${a.others.map((o) => o.id + '(v' + o.votes + ')').join(' ')}`);
    }
  }
  if (missed.length) {
    console.log(`\n[缺失] ${missed.length} 本在候选池找不到：`);
    for (const m of missed) console.log(`  ${m.core_id} ${m.title}`);
  }
  if (dup.length) {
    console.log(`\n[重复] ${dup.length} 组核心库内部指向同一本：`);
    for (const d of dup) console.log(`  ${d.subject_id} <- ${d.books.join(' / ')}`);
  }

  if (missed.length || dup.length) process.exit(1);
}

main();
