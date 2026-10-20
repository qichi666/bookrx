import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 独立校验派生标注。**故意不复用 `derive-annotations.mjs` 的任何函数**——
 * 复用等于用同一套逻辑自证，算错了也会一起错。
 *
 * 断言口径（全部是硬断言，"列出来看看"不算）：
 *  ① 每条记录能在 all.json 里找到同 id，且无重复、无多余；
 *  ② pt 里**每一个**标签都能溯源：要么书名里真有该标签的关键词，要么豆瓣标签能映射过去；
 *  ③ 权重在允许集合内、最多 top_n 个、按权重降序；
 *  ④ index 的每一类计数与独立重算一致；
 *  ⑤ 校验前后输入文件一个字节没变。
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = join(ROOT, 'public', 'catalog', 'candidates', 'all.json');
const LEX = join(ROOT, 'catalog', 'problem-lexicon.json');
const DERIVED = join(ROOT, 'public', 'catalog', 'enriched', 'derived.json');
const INDEX = join(ROOT, 'public', 'catalog', 'enriched', 'index.json');

const failures = [];
function chk(name, ok, detail = '') {
  if (ok) {
    console.log(`[通过] ${name}`);
  } else {
    console.log(`[失败] ${name}${detail ? ` —— ${detail}` : ''}`);
    failures.push(name);
  }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function norm(s) {
  return String(s ?? '')
    .replace(/[\s《》「」『』·\-—_/\\|"'“”‘’!！?？,，.。:：;；()（）\[\]【】]/g, '')
    .toLowerCase();
}

function main() {
  if (!existsSync(DERIVED)) {
    console.log('[跳过] 没有 public/catalog/enriched/derived.json（先跑 npm run data:derive）');
    return;
  }

  const allBuf = readFileSync(ALL);
  const before = sha256(allBuf);
  const books = JSON.parse(allBuf.toString('utf-8'));
  const lexicon = JSON.parse(readFileSync(LEX, 'utf-8'));
  const derived = JSON.parse(readFileSync(DERIVED, 'utf-8'));
  const index = JSON.parse(readFileSync(INDEX, 'utf-8'));

  const byId = new Map(books.map((b) => [b.id, b]));
  const ids = derived.map((d) => d.id);
  const dupIds = ids.filter((x, i) => ids.indexOf(x) !== i);

  chk('产物条数 == 候选层条数', derived.length === books.length, `${derived.length} vs ${books.length}`);
  chk('无重复 id', dupIds.length === 0, dupIds.slice(0, 3).join(','));
  chk('每条都能在候选层找到同 id', ids.every((id) => byId.has(id)));

  const allowedTags = new Set(Object.keys(lexicon.tags));
  const topN = lexicon.top_n ?? 3;

  let badTag = 0;
  let badWeight = 0;
  let badOrder = 0;
  let badLen = 0;
  let untraceable = 0;
  let badHow = 0;

  for (const d of derived) {
    if (d.pt.length > topN) badLen += 1;
    if (d.pt.some(([t]) => !allowedTags.has(t))) badTag += 1;

    for (const [, w] of d.pt) {
      // 只允许两类来源权重：0.4（标签兜底）或 0.85–0.95（书名命中），都必须是 0.1 的整数倍
      const ok = w === 0.4 || (w >= 0.85 && w <= 0.9 && Math.abs(w * 10 - Math.round(w * 10)) < 1e-9);
      if (!ok) badWeight += 1;
    }
    for (let i = 1; i < d.pt.length; i += 1) {
      const prev = d.pt[i - 1];
      const cur = d.pt[i];
      if (cur[1] > prev[1] || (cur[1] === prev[1] && cur[0] < prev[0])) badOrder += 1;
    }

    const howOk = d.pt.length === 0 ? d.how === 'none' : d.how === 'title' || d.how === 'tag';
    if (!howOk) badHow += 1;

    // 逐个标签溯源，不看整体命中率
    const book = byId.get(d.id);
    const text = norm(`${book.title} ${book.subtitle ?? ''}`);
    const bookTags = new Set(book.tags ?? []);
    for (const [t] of d.pt) {
      const def = lexicon.tags[t];
      const byTitle = (def.keywords ?? []).some((k) => text.includes(norm(k)));
      const byTag = (def.from_tags ?? []).some((x) => bookTags.has(x));
      if (!byTitle && !byTag) untraceable += 1;
    }
  }

  chk('标签全部来自词表', badTag === 0, `${badTag} 条越界`);
  chk('权重落在允许集合内（0.4 / 0.85–0.9 一位小数）', badWeight === 0, `${badWeight} 处`);
  chk('权重降序、同权按标签升序', badOrder === 0, `${badOrder} 处逆序`);
  chk(`每个标签最多 ${topN} 个`, badLen === 0, `${badLen} 条超长`);
  chk('how 与 pt 长度自洽', badHow === 0, `${badHow} 条不自洽`);
  chk('每个派生标签都能溯源（书名命中或豆瓣标签映射）', untraceable === 0, `${untraceable} 处无据`);

  // index 独立重算
  const recount = { title: 0, tag: 0, none: 0 };
  const recTag = new Map();
  const recDomain = new Map();
  for (const d of derived) {
    recount[d.how] += 1;
    for (const [t] of d.pt) recTag.set(t, (recTag.get(t) ?? 0) + 1);
    const book = byId.get(d.id);
    for (const dom of book.domains ?? []) {
      const cur = recDomain.get(dom) ?? { total: 0, with_tags: 0 };
      cur.total += 1;
      if (d.pt.length > 0) cur.with_tags += 1;
      recDomain.set(dom, cur);
    }
  }
  chk('index.total == 产物条数', index.total === derived.length, `${index.total} vs ${derived.length}`);
  chk('index.by_source == 独立重算', JSON.stringify(index.by_source) === JSON.stringify(recount));
  chk('index.by_tag == 独立重算', JSON.stringify(index.by_tag) === JSON.stringify(Object.fromEntries([...recTag.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))));
  chk('index.by_domain == 独立重算', JSON.stringify(index.by_domain) === JSON.stringify(Object.fromEntries([...recDomain.entries()].sort())));
  chk('index.source_sha256 == all.json 实际哈希', index.source_sha256 === before);
  chk('校验前后 all.json 一个字节没变', sha256(readFileSync(ALL)) === before);

  if (failures.length > 0) {
    console.error(`\n[不通过] 派生标注校验失败 ${failures.length} 项`);
    process.exit(1);
  }
  console.log('\n[通过] 派生标注校验全部通过');
}

main();
