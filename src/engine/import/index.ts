import type { UserBook } from '@/contracts/book.js';
import type { ImportError, ImportErrorCode, ImportedBook, ImportResult } from '@/contracts/import.js';
import { parseEpub } from './epub.js';
import { decodeBytes, parseTxt, type TextEncoding } from './txt.js';
import { countChars, estimateHours, lengthClassOf, type ParsedBook } from './types.js';

/**
 * 导入流水线（P0-8 的能力层）：字节 + 文件名 → `ImportedBook`，**不碰 IndexedDB**。
 *
 * 纯函数是硬要求：只有这样才能在 Node 里拿真实样本跑单测（`tests/engine/import.test.ts`），
 * 而导入链路是"用户第一次接触产品"的地方——它挂了，后面所有功能都谈不上。
 * 落库由调用方做（`storage/library.ts`），失败也能给出 `E_STORAGE_QUOTA` 这种存储侧错误。
 */

/** 单本上限 50 MB：一本纯文字 EPUB 通常 0.3–3 MB，50 MB 已经覆盖插图很多的版本。 */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** 切章算法版本：算法升级时可据此判断旧书要不要重建索引 */
export const CHAPTERIZER_VERSION = 1;

/**
 * 导入书的占位字段。
 *
 * **这些不是标注**：`content_ready='readable'` 的书会被 `filters.ts` 整本挡在个性化推荐池外
 * （`metadata-only`），所以这里的 3 / howto / method 永远不会被算进任何一个分数。
 * 之所以还得填，是因为 `Book` 的这些字段在契约里是必填——类型层不允许"缺标注"，
 * 那就用中性值占位，并把"能不能参与打分"交给 `content_ready` 唯一决定。
 */
const NEUTRAL = {
  difficulty: 3,
  depth: 'howto_why',
  form: 'method',
  entry_level: 3,
  prose_accessibility: 3,
} as const;

function failError(
  code: ImportErrorCode,
  detail: string,
  recoverable = false,
  recovery?: ImportError['recovery'],
): ImportError {
  return { code, detail, recoverable, ...(recovery ? { recovery } : {}) };
}


/** 内容指纹：同一份文件重复导入要得到同一个 id，否则书架上会出现两本一样的书。 */
function contentId(bytes: ArrayBuffer, size: number): string {
  const view = new Uint8Array(bytes);
  let h = 0x811c9dc5;
  const limit = Math.min(view.length, 65536);
  for (let i = 0; i < limit; i += 1) {
    h ^= view[i] as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `user:${h.toString(36)}${size.toString(36)}`;
}

function looksZip(bytes: ArrayBuffer): boolean {
  const v = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return v.length === 4 && v[0] === 0x50 && v[1] === 0x4b && v[2] === 0x03 && v[3] === 0x04;
}

function hasBinaryJunk(bytes: ArrayBuffer): boolean {
  const v = new Uint8Array(bytes);
  const limit = Math.min(v.length, 4096);
  let bad = 0;
  for (let i = 0; i < limit; i += 1) {
    const b = v[i] as number;
    // 允许 \t \n \r，其余控制字符视为二进制
    if (b < 9 || (b > 13 && b < 32)) bad += 1;
  }
  return limit > 0 && bad / limit > 0.05;
}

function todayVersion(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

function toUserBook(
  parsed: ParsedBook,
  fallbackTitle: string,
  id: string,
  encoding: UserBook['source_encoding'],
  at: number,
): UserBook {
  const chars = countChars(parsed.chapters);
  const title = parsed.title.trim() || fallbackTitle || '未命名文件';
  const author = parsed.author.trim();
  const facts = `你导入的文件，共 ${parsed.chapters.length} 章、约 ${chars} 字。正文直接来自文件本身，没有编辑标注。`;
  return {
    book_id: id as UserBook['book_id'],
    title,
    author_ids: [],
    author_display: [author || '作者未知'],
    category_l1: 'other',
    theme_tags: [],
    ...NEUTRAL,
    est_reading_hours: estimateHours(chars),
    length_class: lengthClassOf(chars),
    word_count: chars,
    content_warning: [],
    availability: 'bring_your_own',
    copyright_basis: 'metadata_only',
    translation_copyright: 'unknown',
    one_line_what: facts,
    structure_note: '你导入的原文件，未做编辑加工。',
    match_brief: '你导入的书',
    content_ready: 'readable',
    data_version: todayVersion(at),
    imported_at: at,
    source_encoding: encoding,
    chapterizer_version: CHAPTERIZER_VERSION,
  };
}

export interface ImportOptions {
  /** 失败后由用户手动指定编码重试（`recovery: 'choose-encoding'` 的承接） */
  forcedEncoding?: TextEncoding;
  /** 注入时钟，便于单测断言 data_version 与 imported_at */
  now?: number;
}

/**
 * 详细产物：除了契约里的 `ImportedBook`，再带上解析出来的章节文本。
 *
 * 为什么需要它：契约的 `ImportedBook` 只有 `bytes`，而落库要的是**章节段落**
 * （阅读器渲染、目录、标注锚点全依赖它）。让存储层拿着 bytes 再解析一遍，等于
 * 把一本 EPUB 解两次压、抽两次文本——导入大书时会明显卡一下。
 * 契约不改（它是 SPEC 派生的），改的是这条流水线多交一份已经算好的中间结果。
 */
/**
 * 导入产物一定是 `UserBook` 而不是契约里更宽的 `Book`——因为每条导入路径都会写
 * `imported_at / source_encoding / chapterizer_version`。把这一点写进类型，
 * 落库处就不必再 `as UserBook` 断言一次（断言是假的安全）。
 */
export interface ImportedUserBook extends Omit<ImportedBook, 'book'> {
  book: UserBook;
}

export interface DetailedImport {
  imported: ImportedUserBook;
  parsed: ParsedBook;
}

export type DetailedImportResult =
  | { ok: true; value: DetailedImport }
  | { ok: false; error: ImportError };

export async function importBookDetailed(
  bytes: ArrayBuffer,
  filename: string,
  options: ImportOptions = {},
): Promise<DetailedImportResult> {
  const at = options.now ?? Date.now();

  if (bytes.byteLength === 0) return { ok: false, error: failError('E_IMPORT_EMPTY', '文件是空的（0 字节）') };
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return { ok: false, error: failError('E_IMPORT_TOO_LARGE', `文件 ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB，超过 50 MB 上限`) };
  }

  if (looksZip(bytes)) {
    const r = await parseEpub(bytes);
    if (!r.ok) return { ok: false, error: failError(r.code, r.detail) };
    const id = contentId(bytes, bytes.byteLength);
    const book = toUserBook(r.book, filename.replace(/\.[^.]+$/, ''), id, 'binary', at);
    return {
      ok: true,
      value: {
        imported: { book, bytes, format: 'epub', warnings: r.book.warnings },
        parsed: r.book,
      },
    };
  }

  // 不是 ZIP 就当纯文本；二进制垃圾（PDF / MOBI 改扩展名）在解码前先挡掉
  if (hasBinaryJunk(bytes)) {
    return { ok: false, error: failError('E_IMPORT_NOT_EPUB', '这不是 EPUB（缺少 ZIP 头），也不像纯文本（含大量二进制字节）') };
  }
  const decoded = decodeBytes(bytes, options.forcedEncoding);
  if (!decoded) {
    return { ok: false, error: failError(
      'E_IMPORT_ENCODING',
      options.forcedEncoding
        ? `按 ${options.forcedEncoding} 仍无法解码`
        : '无法判定编码（试过 UTF-8 / UTF-16 / GB18030）',
      true,
      'choose-encoding',
    ) };
  }
  const parsed = parseTxt(decoded.text, filename);
  if (countChars(parsed.chapters) === 0) {
    return { ok: false, error: failError('E_IMPORT_EMPTY_CONTENT', '解码成功，但正文是空的') };
  }
  const id = contentId(bytes, bytes.byteLength);
  const asParsed: ParsedBook = { ...parsed, author: '' };
  return {
    ok: true,
    value: {
      imported: {
        book: toUserBook(asParsed, filename.replace(/\.[^.]+$/, ''), id, decoded.encoding, at),
        bytes,
        format: 'txt',
        encoding: decoded.encoding,
        warnings: parsed.warnings,
      },
      parsed: asParsed,
    },
  };
}

/** 契约形态的入口（只要 `ImportedBook` 的调用方用它，例如只想校验文件是否可导入）。 */
export async function importBook(
  bytes: ArrayBuffer,
  filename: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const r = await importBookDetailed(bytes, filename, options);
  return r.ok ? { ok: true, value: r.value.imported } : r;
}

/** 导入错误码 → 面向用户的一句话 + 一个可执行动作（UI 层直接查表，不写分支） */
export const IMPORT_ERROR_TEXT: Readonly<
  Record<ImportErrorCode, { title: string; action: string }>
> = {
  E_IMPORT_TOO_LARGE: {
    title: '文件太大',
    action: '单本上限 50 MB。插图很多的 EPUB 可以先用压缩工具去掉图片，或换一个纯文字版本。',
  },
  E_IMPORT_EMPTY: { title: '文件是空的', action: '确认文件不是 0 字节：重新下载或从原始来源复制一次。' },
  E_IMPORT_NOT_EPUB: {
    title: '不是 EPUB，也不像纯文本',
    action: '这个文件可能是 PDF / MOBI / AZW3。本站只读 EPUB 与 TXT——用 Calibre 之类工具转成 EPUB 再拖进来。',
  },
  E_IMPORT_CORRUPT_ZIP: {
    title: 'EPUB 压缩包损坏',
    action: '文件在下载或传输中坏了。重新获取一份；如果是从网盘下载的，注意别用"在线预览"另存。',
  },
  E_DRM_PROTECTED: {
    title: '这本书有 DRM',
    action: '受 DRM 保护的书只能在其官方应用里读，本站不提供绕过。如果是自己买的书，换个无 DRM 的来源。',
  },
  E_IMPORT_BAD_OPF: {
    title: 'EPUB 内部结构异常',
    action: '缺 container.xml 或 OPF。换一份资源通常就好了；这本书的制作者可能用了非标准工具。',
  },
  E_IMPORT_ENCODING: {
    title: '这段文字认不出编码',
    action: '下面手动选一个编码再试：中文老书多为 GB18030，简体新版多为 UTF-8。',
  },
  E_IMPORT_EMPTY_CONTENT: {
    title: '文件里没有正文',
    action: '可能是纯图片扫描版，或只有目录。换一个有文字层的版本。',
  },
  E_STORAGE_QUOTA: {
    title: '本地空间不够',
    action: '浏览器给本站的存储配额用完了。删掉几本不读的书，或在设置里清空书库后重试。',
  },
  E_STORAGE_FAILED: {
    title: '本地数据库打不开',
    action:
      '常见于无痕/隐私模式，或浏览器被设置为"退出时清除站点数据"。换一个普通窗口、关掉隐私模式，或允许本站保存数据后重试。',
  },
};
