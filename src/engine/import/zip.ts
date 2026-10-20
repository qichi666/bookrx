/**
 * 最小 ZIP 读取器（EPUB 是 ZIP 容器）。
 *
 * 为什么自己写而不引 `jszip`：本项目要守住「纯前端、零后端、可静态托管」，
 * 依赖面越小越好；而 EPUB 只需要「读中央目录 + 解 deflate」这一件事。
 * 解压交给平台内置的 `DecompressionStream('deflate-raw')`（Chrome 80+ / Node 18+），
 * 于是这一段在 Node 里可以直接用真实样本单测——这正是本项目最看重的验证形态。
 *
 * 不支持：ZIP64、加密条目、分卷。EPUB 规范不允许加密正文（那是 DRM，属于我们明确
 * 拒绝的能力），ZIP64 在 50 MB 上限内不会出现（上限见 `limits.ts`）。
 */

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;
const EOCD_MIN = 22;

export class ZipError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-eocd' | 'bad-entry' | 'unsupported' = 'bad-entry',
  ) {
    super(message);
  }
}

export interface ZipEntry {
  name: string;
  /** 0 = store，8 = deflate */
  method: number;
  compressedSize: number;
  size: number;
  /** 本地头在文件中的偏移 */
  offset: number;
}

function u16(v: DataView, at: number): number {
  return v.getUint16(at, true);
}

function u32(v: DataView, at: number): number {
  return v.getUint32(at, true);
}

/** 从尾部找 EOCD。注释长度可变（0–65535），所以最多回扫 22 + 65535 字节。 */
function findEocd(view: DataView): number {
  const max = Math.min(view.byteLength, EOCD_MIN + 0xffff);
  for (let i = EOCD_MIN; i <= max; i += 1) {
    const at = view.byteLength - i;
    if (at >= 0 && u32(view, at) === SIG_EOCD) return at;
  }
  throw new ZipError('找不到 ZIP 结束记录（EOCD）——不是 ZIP 文件或已损坏', 'no-eocd');
}

/**
 * 读中央目录。**以中央目录为唯一真源**：本地头里的名字长度、扩展字段可能与中央目录
 * 不一致（有些打包器会在本地头塞时间戳扩展），只看本地头会算出错位的数据起点。
 */
export function listEntries(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf);
  if (view.byteLength < EOCD_MIN) throw new ZipError('文件太小，不可能是 ZIP', 'no-eocd');
  const eocd = findEocd(view);
  const count = u16(view, eocd + 10);
  let at = u32(view, eocd + 16);
  const decoder = new TextDecoder('utf-8');
  const out: ZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (at + 46 > view.byteLength || u32(view, at) !== SIG_CEN) {
      throw new ZipError(`中央目录第 ${i + 1} 条损坏`, 'bad-entry');
    }
    const method = u16(view, at + 10);
    const compressedSize = u32(view, at + 20);
    const size = u32(view, at + 24);
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    const offset = u32(view, at + 42);
    const name = decoder.decode(new Uint8Array(buf, at + 46, nameLen));
    out.push({ name, method, compressedSize, size, offset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 读一个条目的原始字节。store 直接切片，deflate 走平台解压。 */
export async function readEntry(buf: ArrayBuffer, entry: ZipEntry): Promise<ArrayBuffer> {
  const view = new DataView(buf);
  if (entry.offset + 30 > view.byteLength || u32(view, entry.offset) !== SIG_LOC) {
    throw new ZipError(`本地头损坏：${entry.name}`, 'bad-entry');
  }
  const nameLen = u16(view, entry.offset + 26);
  const extraLen = u16(view, entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (end > view.byteLength) throw new ZipError(`条目数据越界：${entry.name}`, 'bad-entry');
  const chunk = buf.slice(start, end);

  if (entry.method === 0) return chunk;
  if (entry.method !== 8) {
    throw new ZipError(`不支持的压缩方法 ${entry.method}（只支持 store / deflate）`, 'unsupported');
  }
  const stream = new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

/** 按名字读文本（找不到返回 null，不抛：缺文件是常态，调用方决定严重性）。 */
export async function readTextEntry(
  buf: ArrayBuffer,
  entries: readonly ZipEntry[],
  name: string,
): Promise<string | null> {
  const hit = entries.find((e) => e.name === name);
  if (!hit) return null;
  return new TextDecoder('utf-8').decode(await readEntry(buf, hit));
}
