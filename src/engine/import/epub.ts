import type { ImportErrorCode } from '@/contracts/import.js';
import { extractHtml } from './html.js';
import { listEntries, readEntry, readTextEntry, ZipError } from './zip.js';
import type { ParsedBook, ParsedChapter, ParsedCover } from './types.js';

/**
 * EPUB 解析：container.xml → OPF → spine → 章节文本（P0-9）。
 *
 * 只做四件事：读元数据、按 spine 顺序出章节、取封面、识别 DRM 与固定版式。
 * 不做 CSS 还原、不做原书字体、不做固定版式渲染——那些是 ADR-009 明确放弃的，
 * 放弃的理由写在那儿，别在这里重新发明。
 */

export type EpubFailure = { ok: false; code: ImportErrorCode; detail: string };
export type EpubSuccess = { ok: true; book: ParsedBook };
export type EpubResult = EpubSuccess | EpubFailure;

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

/** 取 OPF 里的属性。XML 属性顺序不固定，所以按名找而不是按下标切。 */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m?.[2] ?? m?.[3];
}

function textOf(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!m?.[1]) return undefined;
  return m[1].replace(/<[^>]+>/g, '').trim() || undefined;
}

/** OPF 内相对路径归一化：`OEBPS/Text/../Images/a.jpg` → `OEBPS/Images/a.jpg`。 */
function joinPath(baseDir: string, href: string): string {
  const parts = `${baseDir}/${decodeURIComponent(href)}`.split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

function parseManifest(opf: string): ManifestItem[] {
  const items: ManifestItem[] = [];
  for (const m of opf.matchAll(/<item\b[^>]*\/?>/gi)) {
    const tag = m[0];
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (!id || !href) continue;
    items.push({
      id,
      href,
      mediaType: attr(tag, 'media-type') ?? '',
      properties: attr(tag, 'properties') ?? '',
    });
  }
  return items;
}

/**
 * DRM 判定。
 *
 * 关键区分：**字体混淆不是 DRM**。很多正规 EPUB 用 `idpf.org/2008/embedding`
 * 把内嵌字体打乱（防止字体被单独提取），正文完全可读。把这种情况判成"有 DRM"
 * 会让一批合法书被拒之门外——所以它只产生一条警告，不影响导入。
 */
function inspectEncryption(xml: string): 'none' | 'font-obfuscation' | 'drm' {
  if (!xml.trim()) return 'none';
  const algorithms = [...xml.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!.toLowerCase());
  if (algorithms.length === 0) return 'none';
  const drm = algorithms.some(
    (a) => !a.includes('embedding') && !a.includes('obfuscation') && !a.includes('idpf.org/2008/embedding'),
  );
  return drm ? 'drm' : 'font-obfuscation';
}

export async function parseEpub(buf: ArrayBuffer): Promise<EpubResult> {
  let entries;
  try {
    entries = listEntries(buf);
  } catch (e) {
    const detail = e instanceof ZipError ? e.message : String(e);
    return { ok: false, code: 'E_IMPORT_CORRUPT_ZIP', detail };
  }

  const container = await readTextEntry(buf, entries, 'META-INF/container.xml');
  if (!container) {
    return { ok: false, code: 'E_IMPORT_NOT_EPUB', detail: '缺少 META-INF/container.xml' };
  }
  const rootMatch = /<rootfile\b[^>]*full-path\s*=\s*["']([^"']+)["']/i.exec(container);
  const opfPath = rootMatch?.[1];
  if (!opfPath) return { ok: false, code: 'E_IMPORT_BAD_OPF', detail: 'container.xml 里没有 rootfile' };

  const opf = await readTextEntry(buf, entries, opfPath);
  if (!opf) return { ok: false, code: 'E_IMPORT_BAD_OPF', detail: `找不到 OPF：${opfPath}` };

  const encryption = await readTextEntry(buf, entries, 'META-INF/encryption.xml');
  const enc = inspectEncryption(encryption ?? '');
  if (enc === 'drm') {
    return {
      ok: false,
      code: 'E_DRM_PROTECTED',
      detail: 'OPF 声明了非字体混淆的加密算法（EPUB 里的 DRM）',
    };
  }

  const baseDir = dirOf(opfPath);
  const manifest = parseManifest(opf);
  const byId = new Map(manifest.map((m) => [m.id, m]));
  const warnings: ParsedBook['warnings'] = [];
  if (enc === 'font-obfuscation') warnings.push({ kind: 'font-obfuscated' });

  // 固定版式：能读但排版会散，必须告诉用户，否则他会以为是我们渲染坏了。
  // 两种写法都合法，规范里都有：`<meta property="…" content="…"/>` 与
  // `<meta property="rendition:layout">pre-paginated</meta>`（内容形式）。
  const layoutAttr = /<meta\b[^>]*property\s*=\s*["']rendition:layout["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(opf)
    ?? /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']rendition:layout["']/i.exec(opf);
  const layoutBody = /<meta\b[^>]*property\s*=\s*["']rendition:layout["'][^>]*>([\s\S]*?)<\/meta>/i.exec(opf);
  const layoutValue = (layoutAttr?.[1] ?? layoutBody?.[1] ?? '').trim();
  if (layoutValue.toLowerCase() === 'pre-paginated') {
    warnings.push({ kind: 'fixed-layout-unsupported' });
  }

  const spineIds = [...opf.matchAll(/<itemref\b[^>]*\/?>/gi)]
    .map((m) => attr(m[0], 'idref'))
    .filter((v): v is string => typeof v === 'string');

  const chapters: ParsedChapter[] = [];
  for (const id of spineIds) {
    const item = byId.get(id);
    if (!item) continue;
    if (item.mediaType && !/xhtml|html|xml/i.test(item.mediaType)) continue;
    const path = joinPath(baseDir, item.href);
    const raw = await readTextEntry(buf, entries, path);
    if (!raw) continue;
    const { title: chapterTitle, paragraphs } = extractHtml(raw);
    if (paragraphs.length === 0) continue;
    const title = chapterTitle || item.id;
    // 章节首段常是 `<h1>` 里的章标题本身：留着会在阅读器里出现两遍
    // （章节头一遍、正文第一段又一遍）。只在"确实等于标题"时去掉，避免误删真正的内容。
    const body = paragraphs[0] === title ? paragraphs.slice(1) : paragraphs;
    if (body.length === 0) continue;
    chapters.push({
      title,
      paragraphs: body,
      source_href: path,
    });
  }

  if (chapters.length === 0) {
    return { ok: false, code: 'E_IMPORT_EMPTY_CONTENT', detail: 'spine 里没有可读的正文' };
  }

  const title = textOf(opf, 'dc:title');
  const author = textOf(opf, 'dc:creator');
  if (!title) warnings.push({ kind: 'metadata-degraded' });

  const cover = await pickCover(buf, entries, manifest, baseDir, opf);

  return {
    ok: true,
    book: {
      title: title ?? '',
      author: author ?? '',
      ...(textOf(opf, 'dc:language') ? { language: textOf(opf, 'dc:language')! } : {}),
      chapters,
      ...(cover ? { cover } : {}),
      warnings,
    },
  };
}

/** 封面：先看 manifest 的 `properties="cover-image"`，再看 `<meta name="cover">` 指向的 id。 */
async function pickCover(
  buf: ArrayBuffer,
  entries: Awaited<ReturnType<typeof listEntries>>,
  manifest: readonly ManifestItem[],
  baseDir: string,
  opf: string,
): Promise<ParsedCover | undefined> {
  let item = manifest.find((m) => m.properties.split(/\s+/).includes('cover-image'));
  if (!item) {
    const meta = /<meta\b[^>]*name\s*=\s*["']cover["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(opf)
      ?? /<meta\b[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']cover["']/i.exec(opf);
    const id = meta?.[1];
    if (id) item = manifest.find((m) => m.id === id);
  }
  if (!item) return undefined;
  const path = joinPath(baseDir, item.href);
  const entry = entries.find((e) => e.name === path);
  if (!entry) return undefined;
  try {
    const bytes = await readEntry(buf, entry);
    return { href: item.href, mime: item.mediaType || 'image/jpeg', bytes };
  } catch {
    return undefined;
  }
}
