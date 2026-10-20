import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 从「书名 + 副标题 + 豆瓣标签」派生困境标签（problem_tags）。
 *
 * 为什么不是"每本人工核对"：6551 本 × 8–12 分钟 = 900 小时，做不完也维护不了。
 * 人工投入改成**维护一张 28 个标签的词表**（`catalog/problem-lexicon.json`），
 * 一本书用规则判一次，可复算、可回滚、可解释。
 *
 * 两条来源，权重不同（都写进产物，便于事后追责）：
 *   - `title`：书名/副标题命中词表 → 0.85 起，多命中一次 +0.05（上限 0.9，避免四舍五入成 1.0）
 *   - `tag`  ：只从豆瓣大类标签粗分 → 0.4（"心理学"只能说明它沾情绪，说明不了哪一类）
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

const W_TITLE = 0.85;
const W_TITLE_EXTRA = 0.05;
const W_TITLE_MAX = 0.9;
const W_TAG = 0.4;

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
 * 单本书的派生。
 * 返回 `{ pt: [[tag, weight], ...], how: 'title' | 'tag' }` —— 没有任何命中时 `pt` 为空数组。
 */
export function deriveBook(book, lexicon) {
  const text = norm(`${book.title} ${book.subtitle ?? ''}`);
  const bookTags = new Set(book.tags ?? []);
  const best = new Map();

  for (const [tagId, def] of Object.entries(lexicon.tags)) {
    const hits = (def.keywords ?? []).filter((k) => text.includes(norm(k))).length;
    if (hits > 0) {
      // 先取整再排序：`0.85 + 0.05` 在浮点里是 0.9000000000000001，
      // 若用原始值排序、输出时再取整，会得到两个「看起来并列但顺序反了」的标签。
      best.set(tagId, {
        w: round1(Math.min(W_TITLE_MAX, W_TITLE + W_TITLE_EXTRA * (hits - 1))),
        how: 'title',
      });
      continue;
    }
    // 只有书名没命中时才用标签兜底：标签是粗分类，不能盖过书名里的明确信号
    if ((def.from_tags ?? []).some((t) => bookTags.has(t))) {
      best.set(tagId, { w: W_TAG, how: 'tag' });
    }
  }

  const ordered = [...best.entries()]
    .sort((a, b) => b[1].w - a[1].w || (a[0] < b[0] ? -1 : 1))
    .slice(0, lexicon.top_n ?? 3);

  if (ordered.length === 0) return { pt: [], how: 'none' };
  return {
    pt: ordered.map(([t, v]) => [t, round1(v.w)]),
    how: ordered[0][1].how,
  };
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
    weights: { title: W_TITLE, tag: W_TAG, top_n: lexicon.top_n ?? 3 },
  };
  writeFileSync(INDEX, JSON.stringify(index, null, 2), 'utf-8');

  console.log(`[派生] ${out.length} 本 → 有标签 ${index.with_tags} / 无标签 ${index.without_tags}`);
  console.log(`[派生] 来源：书名命中 ${bySource.title} ｜ 标签兜底 ${bySource.tag} ｜ 未命中 ${bySource.none}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
