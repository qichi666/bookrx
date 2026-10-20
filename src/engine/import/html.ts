/**
 * XHTML / HTML → 段落文本（不依赖 DOM）。
 *
 * 为什么不用 `DOMParser`：解析层要能在 Node 里跑单测（这是导入链路唯一的可靠验证方式），
 * 而 `DOMParser` 只在浏览器里存在。这里只做"流式去标签"，够用且行为可预测。
 *
 * 取舍：**不还原排版，只还原阅读单位**。表格摊平成行、图片留 alt 文案、
 * 脚注变行内括注——EPUB 里的复杂排版在本产品里一律线性化（ADR-009）。
 */

const BLOCK_END = /<\/(p|div|section|article|h[1-6]|li|tr|blockquote|figcaption|dd|dt|pre)\s*>/gi;
const BLOCK_BREAK = /<(br|hr)\s*\/?>/gi;

/** 常见命名实体。全表 2000+ 条不值得，书目正文里出现的就这些。 */
const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  times: '×',
  laquo: '«',
  raquo: '»',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const cp = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    if (body.startsWith('#')) {
      const cp = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** 去掉 script / style / 注释 / head（title 单独取，正文不要）。 */
function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '');
}

/** 图片留 alt（有的话），否则整段丢掉——空占位比没有更干扰阅读。 */
function inlineImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = /\balt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const text = alt?.[2] ?? alt?.[3] ?? '';
    return text.trim() ? `〔图：${text.trim()}〕` : '';
  });
}

/**
 * 行合并：中文硬折行直接相接，西文之间补一个空格。
 *
 * 中文书里 `<br>` 常被用来折行而不是分段，逐行当段落会得到一堆半句话；
 * 反过来把西文硬折行直接相接又会粘成一个词。按行尾/行首字符判一次即可。
 */
function joinLines(lines: readonly string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const a = out.charCodeAt(out.length - 1);
    const b = line.charCodeAt(0);
    const ascii = (c: number): boolean => c < 0x80;
    out += ascii(a) && ascii(b) ? ` ${line}` : line;
  }
  return out;
}

export interface ExtractedHtml {
  title: string;
  paragraphs: string[];
}

/** 取这一章的标题：`<title>` 优先，其次第一个 h1–h3，都没有就空串。 */
function pickTitle(html: string): string {
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const h = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html);
  const raw = (t?.[1] ?? h?.[1] ?? '').replace(/<[^>]+>/g, '');
  return decodeEntities(raw).replace(/\s+/g, ' ').trim();
}

export function extractHtml(html: string): ExtractedHtml {
  const title = pickTitle(html);
  const body = inlineImages(stripNoise(html))
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n')
    .replace(BLOCK_BREAK, '\n')
    .replace(BLOCK_END, '\n\n')
    // 行内标签直接抹掉，不留空格（中文里 <em> 两侧加空格会切断词）
    .replace(/<[^>]+>/g, '');

  const paragraphs = body
    .split(/\n{2,}/)
    .map((chunk) => joinLines(chunk.split(/\n/)))
    .map((p) => decodeEntities(p).replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((p) => p.length > 0);

  return { title, paragraphs };
}

/** 纯文本按空行分段（TXT 用）。硬折行同样合并。 */
export function splitPlainText(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) => joinLines(chunk.split(/\n/)))
    .map((p) => p.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((p) => p.length > 0);
}
