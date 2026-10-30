import type { ImportError, ImportErrorCode, ImportWarning } from '@/contracts/import.js';
import type { UserBook } from '@/contracts/book.js';
import { importBookDetailed, type ImportOptions } from '@/engine/import/index.js';
import { deleteBookData, putBook, putChapters, putFile, putShelf } from './db.js';

/**
 * 导入并落库（P0-8 的存储侧）。
 *
 * 与 `engine/import` 的分工：引擎只解析（纯函数、可单测），这里负责写 IndexedDB
 * 并把**存储侧的失败**翻译成同一个错误码体系——存储失败不是解析错误，
 * 但对用户来说是同一次"导入失败"，所以它必须进同一张错误表，而不是抛个裸异常。
 *
 * 两种存储失败的区分要守住：
 *  `E_STORAGE_QUOTA`  = 配额用完了（用户能靠删书解决）
 *  `E_STORAGE_FAILED` = 数据库根本打不开（隐私模式 / 站点数据被禁，删书也没用）
 * 把后者报成"空间不够"会让人白删一堆书，所以宁可多一个错误码。
 */

export type StoreResult =
  | { ok: true; book: UserBook; chapters: number; warnings: ImportWarning[] }
  | { ok: false; error: ImportError };

function isQuotaError(e: unknown): boolean {
  if (e instanceof DOMException) return e.name === 'QuotaExceededError' || e.code === 22;
  const name = (e as { name?: string } | null)?.name;
  return name === 'QuotaExceededError';
}

function fail(code: ImportErrorCode, detail: string): StoreResult {
  return { ok: false, error: { code, detail, recoverable: code === 'E_STORAGE_QUOTA' } };
}

export async function importAndStore(
  file: File | Blob,
  filename: string,
  options: ImportOptions = {},
): Promise<StoreResult> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch (e) {
    // 文件在读之前就被移走 / 权限被撤销，这是"文件有问题"而不是"库有问题"
    return fail('E_IMPORT_EMPTY', `读取文件失败：${e instanceof Error ? e.message : String(e)}`);
  }

  const parsed = await importBookDetailed(bytes, filename, options);
  if (!parsed.ok) return parsed;

  const { book } = parsed.value.imported;
  try {
    await putBook(book);
    await putChapters({
      book_id: book.book_id,
      chapters: parsed.value.parsed.chapters,
      ...(parsed.value.parsed.cover ? { cover: parsed.value.parsed.cover } : {}),
    });
    await putFile(book.book_id, bytes);
    // 新导入的书默认进"想读"：用户还没开始读，不该被算成"在读"。
    // 第一次真正打开时由 useReaderSession 翻成"在读"。
    await putShelf({ book_id: book.book_id, group: 'want', updated_at: Date.now() });
    return {
      ok: true,
      book,
      chapters: parsed.value.parsed.chapters.length,
      warnings: parsed.value.imported.warnings,
    };
  } catch (e) {
    // 半本书不能留在库里：`putBook` 已经成功、正文写失败时，书架上会多出一条
    // 打不开的记录（元数据在、章节不在），而且重新导入前一直占着配额。
    // 回滚本身也可能失败（配额满时连删除都可能报错），所以只做尽力而为，不覆盖原始错误。
    try {
      await deleteBookData(book.book_id);
    } catch {
      /* 回滚失败就保留原始错误，如实报给用户 */
    }
    const detail = e instanceof Error ? e.message : String(e);
    if (isQuotaError(e)) {
      return fail('E_STORAGE_QUOTA', `IndexedDB 写入时配额超限：${detail}`);
    }
    return fail('E_STORAGE_FAILED', `IndexedDB 写入失败：${detail}`);
  }
}

/** 书架分组的人话（列表分组标题与按钮都用这一份，避免两处措辞不一致） */
export const SHELF_LABEL = {
  reading: '在读',
  want: '想读',
  finished: '读完',
} as const;

/** 删除一本本机书。标注与笔记不删（见 `db.deleteBookData` 的注释）。 */
export async function removeBook(bookId: string): Promise<void> {
  await deleteBookData(bookId);
}

/** 用户手动改书架分组（"读完"是用户自己的判断，不由系统推断） */
export async function moveToShelf(bookId: string, group: keyof typeof SHELF_LABEL): Promise<void> {
  await putShelf({ book_id: bookId, group, updated_at: Date.now() });
}
