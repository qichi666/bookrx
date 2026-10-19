#!/usr/bin/env node
/**
 * 从 `catalog/shards/seed-core-01.json` **机械派生** `boot-columns.json` 与 `titles.json`。
 *
 * 为什么不手写：同一份书数据抄两遍，改一边忘另一边不会报错——
 * 和 `schema.mjs` 从契约派生字段表是同一个病、同一个解法。
 *
 * 三态纪律：扫到 0 本书 = 未验证，非零退出。
 * 拼音索引目前是种子手工表（键在 PINYIN），M0.5 换 pinyin-pro 构建期生成；
 * 新书没登记拼音会打印警告并留空，不静默编数据。
 */

import { readFileSync, writeFileSync } from 'node:fs';

const books = JSON.parse(readFileSync('catalog/shards/seed-core-01.json', 'utf8'));
console.log(`gen-boot-data：扫了 ${books.length} 本书（catalog/shards/seed-core-01.json）`);
if (!Array.isArray(books) || books.length === 0) {
  console.error('[未验证] 种子书目为空 —— 扫描对象为空，不得生成');
  process.exit(1);
}

const PINYIN = {
  'core:000001': { full: 'bei tao yan de yong qi', initials: 'btydyq' },
  'core:000002': { full: 'fei bao li gou tong', initials: 'fblgt' },
  'core:000003': { full: 'guan jian dui hua', initials: 'gjdh' },
  'core:000004': { full: 'si kuai yu man', initials: 'skym' },
  'core:000005': { full: 'zheng nian de qi ji', initials: 'zndqj' },
  'core:000010': { full: 'zhang kong xi guan', initials: 'zkxg' },
  'core:000011': { full: 'shen du gong zuo', initials: 'sdgz' },
  'core:000012': { full: 'xin liu', initials: 'xl' },
  'core:000013': { full: 'wei lu ye hua', initials: 'wlyh' },
  'core:000014': { full: 'zeng guo fan jia shu', initials: 'zgfjs' },
  'core:000015': { full: 'ye xu zhao ge ren liao liao', initials: 'yxzgrll' },
  'core:000016': { full: 'huo chu sheng ming de yi yi', initials: 'hcsmdyy' },
  'core:000017': { full: 'shi jie jin tou de ka fei guan', initials: 'sjjtdkfg' },
};

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
const warnings = [];
const titles = books.map((b) => {
  const py = PINYIN[b.book_id];
  if (!py) warnings.push(b.book_id + ' ' + b.title + ' 未登记拼音，留空');
  return {
    book_id: b.book_id,
    title: b.title,
    authors: b.author_display,
    pinyin_full: py?.full ?? '',
    pinyin_initials: py?.initials ?? '',
  };
});

for (const w of warnings) console.warn('  警告：' + w);

writeFileSync('catalog/boot-columns.json', JSON.stringify(bootColumns, null, 2) + '\n');
writeFileSync('catalog/titles.json', JSON.stringify(titles, null, 2) + '\n');
console.log(`[通过] 生成 boot-columns.json（${bootColumns.length} 行）+ titles.json（${titles.length} 行）`);
