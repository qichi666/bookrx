import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 从「书名 + 副标题 + 豆瓣标签」派生困境标签（problem_tags）。
 *
 * 为什么不是"每本人工核对"：6551 本 × 8–12 分钟 = 900 小时，做不完也维护不了。
 * 人工投入改成**维护一张 33 个标签的词表**（`catalog/problem-lexicon.json`），
 * 一本书用规则判一次，可复算、可回滚、可解释。
 *
 * 两条来源，权重不同（都写进产物，便于事后追责）：
 *   - `title`：书名/副标题命中词表 → 0.85 起，多命中一次 +0.05（上限 0.9，避免四舍五入成 1.0）
 *   - `tag`  ：只从豆瓣大类标签粗分 → 0.4（"心理学"只能说明它沾情绪，说明不了哪一类）
 *
 * 这两级权重同时也是**证据分级**的依据：≥0.85 是书名证据，0.4 是分类兜底。
 * `src/engine/wide-need.ts` 默认只用书名证据，兜底只在池子不足 20 本时降级启用。
 *
 * 产物是 **enriched 层**，不是核心库：覆盖率只有 4300（problem + availability），
 * 所以这些书进打分时只有 problem 一个因子在场，档位封顶 worth。
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALL = join(ROOT, 'public', 'catalog', 'candidates', 'all.json');
const LEX = join(ROOT, 'catalog', 'problem-lexicon.json');
const OUT_DIR = join(ROOT, 'public', 'catalog', 'enriched');
const OUT = join(OUT_DIR, 'derived.json');
const INDEX = join(OUT_DIR, 'index.json');

// 权重不在这里写死 —— 从 `catalog/problem-lexicon.json` 的 `weights` 读（见 deriveBook）。
// 曾经两边各写一份（JSON 0.35 / 代码 0.4），谁也不报错，只是谁也对不上。

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** 归一化文本：去空白与标点后小写，避免「拖延 症」这类空格差异漏命中。 */
function norm(s) {
  return String(s ?? '')
    .replace(/[\s《》「」『』·\-—_/\\|"'“”‘’!！?？,，.。:：;；()（）\[\]【】]/g, '')
    .toLowerCase();
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * FNV-1a 32 位散列。用途只有一个：**让"同权标签里留哪几个"由书决定，而不是由字母序决定。**
 *
 * 这条规则是踩过坑才有的。原来同权时按 `tag` 升序保留前 `top_n` 个，于是 name 靠后的
 * 标签被系统性截掉：work 域 485 本带「职场」标签的书里，只有 5 本派生出 `speaking-block`
 * （`s` 排在 `b`/`c`/`e` 后面），而 `evaluation-anxiety` 有 681 本。管线确定、15 项校验全过、
 * 有一条断言甚至就叫"权重降序、同权按标签升序"——**它把 bug 写成了规范**。
 *
 * 现在：权重仍是第一排序键（书名证据 0.85+ 永远压过兜底 0.35），
 * 同权时按「书 id 的散列在词表顺序上取一个轮转窗口」决定。
 * 确定性还在（同输入同输出），但不再有系统性偏向——每本候选被均匀分到各个同权标签上。
 */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 单本书的派生。
 * 返回 `{ pt: [[tag, weight], ...], how: 'title' | 'tag' }` —— 没有任何命中时 `pt` 为空数组。
 *
 * 权重从词表读（`lexicon.weights`），不在这里写死：写死过一次，
 * JSON 里写着 `tag: 0.35`、代码里用着 `0.4`，两边都没错、只是不一样，
 * 而唯一的后果是校验脚本按 0.4 卡、运营按 0.35 理解——谁也没发现。
 */
export function deriveBook(book, lexicon) {
  const cfg = lexicon.weights ?? {};
  const wTitle = cfg.title ?? 0.85;
  const wExtra = cfg.title_extra ?? 0.05;
  const wMax = cfg.title_max ?? 0.9;
  const wTag = cfg.tag ?? 0.4;

  const text = norm(`${book.title} ${book.subtitle ?? ''}`);
  const bookTags = new Set(book.tags ?? []);
  const best = new Map();

  for (const [tagId, def] of Object.entries(lexicon.tags)) {
    const hits = (def.keywords ?? []).filter((k) => text.includes(norm(k))).length;
    if (hits > 0) {
      // 先取整再排序：`0.85 + 0.05` 在浮点里是 0.9000000000000001，
      // 若用原始值排序、输出时再取整，会得到两个「看起来并列但顺序反了」的标签。
      best.set(tagId, {
        w: round1(Math.min(wMax, wTitle + wExtra * (hits - 1))),
        how: 'title',
      });
      continue;
    }
    // 只有书名没命中时才用标签兜底：标签是粗分类，不能盖过书名里的明确信号
    if ((def.from_tags ?? []).some((t) => bookTags.has(t))) {
      best.set(tagId, { w: wTag, how: 'tag' });
    }
  }

  const ordered = pickTop(best, book.id, Object.keys(lexicon.tags), lexicon.top_n ?? 3);

  if (ordered.length === 0) return { pt: [], how: 'none' };
  return {
    pt: ordered.map(([t, v]) => [t, round1(v.w)]),
    how: ordered[0][1].how,
  };
}

/**
 * 截断：权重降序 → 同权时按「书 id 散列在词表顺序上的轮转窗口」。
 * 导出给 `verify-derived.mjs` 的对手实现参照（校验脚本自己重写一遍，不复用）。
 */
export function pickTop(best, bookId, tagOrder, topN) {
  const orderIndex = new Map(tagOrder.map((t, i) => [t, i]));
  // 先按词表顺序稳定排列（词表顺序是分组语义序，不是字母序）
  const tied = [...best.entries()].sort(
    (a, b) => (orderIndex.get(a[0]) ?? 0) - (orderIndex.get(b[0]) ?? 0),
  );
  const n = tied.length;
  if (n === 0) return [];
  const offset = hash32(String(bookId)) % n;
  const rank = new Map(tied.map(([t], i) => [t, (i - offset + n) % n]));
  return [...tied]
    .sort((a, b) => b[1].w - a[1].w || (rank.get(a[0]) ?? 0) - (rank.get(b[0]) ?? 0))
    .slice(0, topN);
}

function main() {
  const allBuf = readFileSync(ALL);
  const books = JSON.parse(allBuf.toString('utf-8'));
  const lexicon = JSON.parse(readFileSync(LEX, 'utf-8'));

  const out = [];
  const bySource = { title: 0, tag: 0, none: 0 };
  const tagCount = new Map();
  const byDomain = new Map();

  for (const b of books) {
    const r = deriveBook(b, lexicon);
    out.push({ id: b.id, pt: r.pt, how: r.how });
    bySource[r.how] += 1;
    for (const [t] of r.pt) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    for (const d of b.domains ?? []) {
      const cur = byDomain.get(d) ?? { total: 0, with_tags: 0 };
      cur.total += 1;
      if (r.pt.length > 0) cur.with_tags += 1;
      byDomain.set(d, cur);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(out), 'utf-8');

  const index = {
    generated_at: new Date().toISOString().slice(0, 10),
    lexicon_version: lexicon.version,
    source_sha256: sha256(allBuf),
    total: out.length,
    with_tags: bySource.title + bySource.tag,
    without_tags: bySource.none,
    by_source: bySource,
    by_tag: Object.fromEntries([...tagCount.entries()].sort((a, b) => b[1] - a[1])),
    by_domain: Object.fromEntries([...byDomain.entries()].sort()),
    weights: { ...(lexicon.weights ?? {}), top_n: lexicon.top_n ?? 3 },
  };
  writeFileSync(INDEX, JSON.stringify(index, null, 2), 'utf-8');

  console.log(`[派生] ${out.length} 本 → 有标签 ${index.with_tags} / 无标签 ${index.without_tags}`);
  console.log(`[派生] 来源：书名命中 ${bySource.title} ｜ 标签兜底 ${bySource.tag} ｜ 未命中 ${bySource.none}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
