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
 *  ③ 权重在允许集合内、最多 top_n 个、按权重降序；同权时按「书 id 散列的轮转窗口」，
 *     而不是字母序 —— 这一条以前写的是 "同权按标签升序"，等于把系统性饿死写成了规范；
 *  ④ index 的每一类计数与独立重算一致；
 *  ⑤ 校验前后输入文件一个字节没变；
 *  ⑥ **保留率公平性**：任一标签的「派生命中数 / 应命中数」不得低于中位数的 60%。
 *     这是 ③ 的可观测后果。只断言顺序对不够——顺序对、结果仍然可以饿死一半标签。
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = join(ROOT, 'public', 'catalog', 'candidates', 'all.json');
const LEX = join(ROOT, 'catalog', 'problem-lexicon.json');
const DERIVED = join(ROOT, 'public', 'catalog', 'enriched', 'derived.json');
const INDEX = join(ROOT, 'public', 'catalog', 'enriched', 'index.json');

/** FNV-1a 32 位：与派生脚本同一套散列，但这里自己实现一遍（不 import）。 */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 按规范重算「这本书应该保留哪几个标签」的顺序。
 * 权重降序 → 同权时按 (词表序号 - offset + n) % n 的轮转窗口。
 *
 * 入参与出参都是三元组 `[tag, weight, source]`：`source` 必须跟着标签走，
 * 否则校验脚本只能证明「权重对」，证明不了「证据等级对」。
 */
function expectedOrder(tagEntries, bookId, tagOrder, topN) {
  const idx = new Map(tagOrder.map((t, i) => [t, i]));
  const tied = [...tagEntries].sort((a, b) => (idx.get(a[0]) ?? 0) - (idx.get(b[0]) ?? 0));
  const n = tied.length;
  if (n === 0) return [];
  const offset = hash32(String(bookId)) % n;
  const rank = new Map(tied.map(([t], i) => [t, (i - offset + n) % n]));
  return [...tied]
    .sort((a, b) => b[1] - a[1] || (rank.get(a[0]) ?? 0) - (rank.get(b[0]) ?? 0))
    .slice(0, topN);
}

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
  const tagOrder = Object.keys(lexicon.tags);
  const cfg = lexicon.weights ?? {};
  const wTitle = cfg.title ?? 0.85;
  const wExtra = cfg.title_extra ?? 0.05;
  const wMax = cfg.title_max ?? 0.9;
  const wTag = cfg.tag ?? 0.4;

  let badTag = 0;
  let badWeight = 0;
  let badOrder = 0;
  let badLen = 0;
  let untraceable = 0;
  let srcMismatch = 0;
  let badHow = 0;
  // 逐标签统计「应得」与「实得」，用于保留率公平性断言
  const eligible = new Map();
  const got = new Map();

  for (const d of derived) {
    if (d.pt.length > topN) badLen += 1;
    if (d.pt.some(([t]) => !allowedTags.has(t))) badTag += 1;

    for (const [, w, src] of d.pt) {
      // 只允许两级证据权重，且**权重必须与证据等级自洽**：
      // 兜底证据（豆瓣大类）恒为 wTag，书名证据恒落在 [wTitle, wMax]。
      // 只查权重不查等级，等于允许「0.4 的兜底标签自称书名证据」蒙混过关。
      const ok =
        (src === 'category' && w === wTag) ||
        (src === 'title' && w >= wTitle && w <= wMax && Math.abs(w * 10 - Math.round(w * 10)) < 1e-9);
      if (!ok) badWeight += 1;
    }

    const howOk = d.pt.length === 0 ? d.how === 'none' : d.how === 'title' || d.how === 'tag';
    if (!howOk) badHow += 1;

    const book = byId.get(d.id);
    const text = norm(`${book.title} ${book.subtitle ?? ''}`);
    const bookTags = new Set(book.tags ?? []);

    // 逐个标签溯源，不看整体命中率；并按自称的证据等级分别核对
    for (const [t, , src] of d.pt) {
      const def = lexicon.tags[t];
      const byTitle = (def.keywords ?? []).some((k) => text.includes(norm(k)));
      const byTag = (def.from_tags ?? []).some((x) => bookTags.has(x));
      if (!byTitle && !byTag) untraceable += 1;
      if (src === 'title' && !byTitle) srcMismatch += 1;
      if (src === 'category' && byTitle) srcMismatch += 1;
      got.set(t, (got.get(t) ?? 0) + 1);
    }

    // 全量重算：应得标签 + 应得顺序 + 应得证据等级。不是"顺序看起来对"，是逐位相等。
    const elig = [];
    for (const [t, def] of Object.entries(lexicon.tags)) {
      const hits = (def.keywords ?? []).filter((k) => text.includes(norm(k))).length;
      if (hits > 0) {
        elig.push([t, Math.round(Math.min(wMax, wTitle + wExtra * (hits - 1)) * 10) / 10, 'title']);
        eligible.set(t, (eligible.get(t) ?? 0) + 1);
      } else if ((def.from_tags ?? []).some((x) => bookTags.has(x))) {
        elig.push([t, wTag, 'category']);
        eligible.set(t, (eligible.get(t) ?? 0) + 1);
      }
    }
    const exp = expectedOrder(elig, d.id, tagOrder, topN);
    if (JSON.stringify(d.pt) !== JSON.stringify(exp)) badOrder += 1;
  }

  chk('标签全部来自词表', badTag === 0, `${badTag} 条越界`);
  chk(`权重落在允许集合内（${wTag} / ${wTitle}–${wMax} 一位小数）`, badWeight === 0, `${badWeight} 处`);
  chk(
    '派生结果与规范逐位一致（权重降序 → 同权按书 id 散列轮转，不用字母序）',
    badOrder === 0,
    `${badOrder} 条不符`,
  );
  chk(`每个标签最多 ${topN} 个`, badLen === 0, `${badLen} 条超长`);
  chk('how 与 pt 长度自洽', badHow === 0, `${badHow} 条不自洽`);
  chk('每个派生标签都能溯源（书名命中或豆瓣标签映射）', untraceable === 0, `${untraceable} 处无据`);
  chk(
    '证据等级与事实一致（自称 title 的必须真在书名里，自称 category 的不得是书名命中）',
    srcMismatch === 0,
    `${srcMismatch} 处对不上`,
  );

  /**
   * 保留率公平性：这条断言是「不许用字符串序决定截断」的可观测后果。
   *
   * 只断言"顺序符合规范"是不够的——顺序可以完全合规，而名字靠后的标签照样被饿死。
   * 实测基线：`self-doubt` 0.7% / `rumination` 1.2% / `speaking-block` 6.1%，
   * 中位数 73%，相差 100 倍，而当时的 15 项校验全绿。
   */
  const ret = [...eligible.entries()]
    .filter(([, e]) => e >= 50)
    .map(([t, e]) => ({ tag: t, e, d: got.get(t) ?? 0, r: (got.get(t) ?? 0) / e }))
    .sort((a, b) => a.r - b.r);
  const median = ret.length === 0 ? 0 : ret[Math.floor(ret.length / 2)].r;
  const starved = ret.filter((x) => x.r < median * 0.6);
  chk(
    `各标签保留率不低于中位数的 60%（中位 ${(median * 100).toFixed(1)}%）`,
    starved.length === 0,
    starved.map((x) => `${x.tag}=${(x.r * 100).toFixed(1)}%`).join(', '),
  );
  console.log(
    `保留率最低五个：${ret
      .slice(0, 5)
      .map((x) => `${x.tag}=${(x.r * 100).toFixed(1)}%`)
      .join('  ')}`,
  );

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
  // 对账比的是**内容**不是键序：派生脚本按计数降序写，校验脚本不该因为并列项的
  // 先后不同就判失败（那会逼着两边共用一套排序，等于放弃独立重算）。
  const byKey = (o) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));
  chk('index.by_tag == 独立重算', byKey(index.by_tag) === byKey(Object.fromEntries(recTag)));
  chk('index.by_domain == 独立重算', byKey(index.by_domain) === byKey(Object.fromEntries(recDomain)));
  chk('index.source_sha256 == all.json 实际哈希', index.source_sha256 === before);
  chk('校验前后 all.json 一个字节没变', sha256(readFileSync(ALL)) === before);

  if (failures.length > 0) {
    console.error(`\n[不通过] 派生标注校验失败 ${failures.length} 项`);
    process.exit(1);
  }
  console.log('\n[通过] 派生标注校验全部通过');
}

main();
