/**
 * 阅读器深链：`/reader/:id?ch=3&off=1200`。
 *
 * 两个方向共用一份实现，避免「写链接的」和「读链接的」各自拍脑袋：
 *  - 首页「今天」区块给旧划线生成链接（`readerHref`）；
 *  - 阅读器打开时按参数定位（`parseReaderJump`）。
 *
 * 只支持 `txt-offset`（章节 + 字符偏移）。EPUB CFI 形态**故意不支持**：
 * CFI 只对同一份文件稳定，换个版式会静默错位；宁可正常打开，也不猜位置。
 */
import type { Locator } from '@/contracts/reader.js';

export interface ReaderJump {
  chapter: number;
  offset: number;
}

export function readerHref(bookId: string, start: Locator): string {
  if (start.scheme === 'txt-offset') {
    return `/reader/${bookId}?ch=${start.chapter}&off=${start.offset}`;
  }
  return `/reader/${bookId}`;
}

/** 参数不合法就返回 null，由调用方退化成「正常打开」，不把页面变成错误页。 */
export function parseReaderJump(query: Record<string, unknown>): ReaderJump | null {
  const chapter = Number(query.ch);
  const offset = Number(query.off);
  if (!Number.isInteger(chapter) || chapter < 0) return null;
  if (!Number.isFinite(offset) || offset < 0) return null;
  return { chapter, offset };
}
