#!/usr/bin/env node
/**
 * 从 `catalog/shards/seed-core-*.json` **机械派生** `boot-columns.json` 与 `titles.json`。
 *
 * 为什么不手写：同一份书数据抄两遍，改一边忘另一边不会报错——
 * 和 `schema.mjs` 从契约派生字段表是同一个病、同一个解法。
 *
 * 拼音：`pinyin-pro` 构建期生成（不需要网络，算法在本地）。
 * 早期是手工维护的 `PINYIN` 表 —— 13 本时还行，60 本时手抄必然出错且没人查，
 * 而且「新书没登记拼音」只会打印警告、留空继续跑，等于静默降级成不可搜索。
 * 现在改成生成 + 硬校验：生成不出拼音的书直接报错退出。
 *
 * 三态纪律：扫到 0 本书 = 未验证，非零退出。
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pinyin } from 'pinyin-pro';

const SHARD_DIR = 'catalog/shards';

const files = readdirSync(SHARD_DIR)
  .filter((f) => /^seed-core-\d+\.json$/.test(f))
  .sort();

if (files.length === 0) {
  console.error('[未验证] catalog/shards 下没有任何 seed-core-*.json —— 扫描对象为空，不得生成');
  process.exit(1);
}

const books = files.flatMap((f) => {
  const data = JSON.parse(readFileSync(join(SHARD_DIR, f), 'utf8'));
  const arr = Array.isArray(data) ? data : (data.books ?? []);
  console.log(`  装载 ${f}：${arr.length} 本`);
  return arr;
});

console.log(`gen-boot-data：扫了 ${files.length} 个分片、${books.length} 本书`);
if (books.length === 0) {
  console.error('[未验证] 种子书目为空 —— 扫描对象为空，不得生成');
  process.exit(1);
}

/**
 * 书名 → 无声调全拼 + 首字母。
 *
 * 两处必须预处理，否则拼音会静默出错（都是实测踩到的）：
 *   ① `lü`：pinyin-pro 即使 `toneType: 'none'` 也返回带 ü 的音节，
 *      而搜索索引只收 a–z → `[^a-z]` 一过滤，「虑」就只剩一个 `l`，
 *      于是「身份的焦虑」变成 `shen fen de jiao l`，首字母搜索直接失效。
 *      统一把 ü 折成 v（拼音输入法的通行写法），并在校验里禁掉单字母音节。
 *   ② 阿拉伯数字：`第6版` 里的 `6` 原样输出，过滤后丢了，读作 `di ban`。
 *      先转成汉字再取音，读作 `di liu ban`。
 */
const DIGIT_CN = { 0: '零', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };

function pinyinOf(title) {
  const prepared = String(title).replace(/[0-9]/g, (d) => DIGIT_CN[d]);
  const syllables = pinyin(prepared, { toneType: 'none', type: 'array' })
    .map((s) =>
      String(s)
        .toLowerCase()
        .replace(/[üǖǘǚǜ]/g, 'v')
        .replace(/[^a-z]/g, ''),
    )
    .filter((s) => s.length > 0);
  const full = syllables.join(' ');
  const initials = syllables.map((s) => s[0]).join('');
  return { full, initials };
}

// 打分数值列（对应契约 ScoringRow）：无中文长文本，首屏只装打分需要的部分
const bootColumns = books.map((b) => ({
  book_id: b.book_id,
  author_id: b.author_ids[0],
  category_l1: b.category_l1,
  problem_tags: b.problem_tags ?? [],
  difficulty: b.difficulty,
  prose_accessibility: b.prose_accessibility,
  est_reading_hours: b.est_reading_hours,
  length_class: b.length_class,
  availability: b.availability,
  content_warning: b.content_warning,
}));

// 标题索引（对应契约 titles）：id → 书名 / 作者 / 拼音 / 首字母
const failures = [];
const titles = books.map((b) => {
  const py = pinyinOf(b.title);
  if (!py.full || !py.initials) failures.push(`${b.book_id} ${b.title}：拼音生成结果为空`);
  // 单字母音节 = 有为字音丢失（ü / 生僻字 / 数字），静默放过就等于这本书搜不到
  const short = py.full.split(' ').filter((s) => s.length === 1);
  if (short.length > 0) {
    failures.push(`${b.book_id} ${b.title}：出现单字母音节 ${short.join(',')}（拼音 ${py.full}），疑有字音丢失`);
  }
  return {
    book_id: b.book_id,
    title: b.title,
    authors: b.author_display,
    pinyin_full: py.full,
    pinyin_initials: py.initials,
  };
});

if (failures.length) {
  console.error(`[未验证] ${failures.length} 本书生成不出拼音，不得落盘：`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

// 拼音重复会让搜索「输 btydyq 出来两本」，暴露的是书名归一化问题而不是拼音问题
const seen = new Map();
const collisions = [];
for (const t of titles) {
  const prev = seen.get(t.pinyin_initials);
  if (prev) collisions.push(`${t.pinyin_initials}: ${prev} / ${t.title}`);
  else seen.set(t.pinyin_initials, t.title);
}

writeFileSync('catalog/boot-columns.json', JSON.stringify(bootColumns, null, 2) + '\n');
writeFileSync('catalog/titles.json', JSON.stringify(titles, null, 2) + '\n');

if (collisions.length) {
  console.warn(`  提示：${collisions.length} 组书名首字母相同（搜索仍可用全拼区分）：`);
  for (const c of collisions) console.warn('    ' + c);
}
console.log(`[通过] 生成 boot-columns.json（${bootColumns.length} 行）+ titles.json（${titles.length} 行）`);
