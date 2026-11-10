import { plainValue } from '@/lib/plain.js';
import { getAll, open, tx } from './connection.js';

/**
 * v2 新增的两类「读者行为」数据：阅读会话 / 读后回执。
 *
 * 为什么不塞进 `db.ts`：那个文件已经承载了七张核心表的读写，
 * 再加用途不同的表就变成两个职责了（行数门禁也会拦）。
 * 这里复用 `connection.ts` 的连接与事务工具，**不新建连接**——
 * 两条连接会在 `onversionchange` 时互相挡住升级。
 *
 * 本地档案不在这里：它决定「连哪个库」，属于 `profiles.ts`，
 * 而且必须写在固定的默认库里，不能随当前档案漂移。
 *
 * 全部只写本机 IndexedDB，没有上报、没有同步、没有账号。
 */

/** 一次前台阅读会话。**按会话落库，不按秒写**——按秒写会把配额耗在计数上。 */
export interface ReadingSession {
  session_id: string;
  book_id: string;
  /** 本地日期 `YYYY-MM-DD`，连续天数直接对它去重，不额外维护冗余字段 */
  day: string;
  started_at: number;
  ended_at: number;
  duration_ms: number;
}

/** 读后回执：三选一 + 可选理由。这是全项目唯一的效果信号。 */
export type ReceiptVerdict = 'useful' | 'neutral' | 'unfit';

export interface Receipt {
  book_id: string;
  verdict: ReceiptVerdict;
  reason?: string;
  created_at: number;
}

/* ── 阅读会话（v2） ─────────────────────────────────────────────────── */

export async function putSession(s: ReadingSession): Promise<void> {
  const db = await open();
  await tx(db, 'sessions', 'readwrite', (t) => t.objectStore('sessions').put(plainValue(s)));
}

export async function listSessions(): Promise<ReadingSession[]> {
  const db = await open();
  const out = await getAll<ReadingSession>(db, 'sessions');
  // 按开始时间升序：统计要按天分桶，顺序错了柱状图会跳来跳去
  return out.sort((a, b) => a.started_at - b.started_at);
}

/* ── 读后回执（v2） ─────────────────────────────────────────────────── */

export async function putReceipt(r: Receipt): Promise<void> {
  const db = await open();
  await tx(db, 'receipts', 'readwrite', (t) => t.objectStore('receipts').put(plainValue(r)));
}

export async function getReceipt(bookId: string): Promise<Receipt | undefined> {
  const db = await open();
  return tx<Receipt>(db, 'receipts', 'readonly', (t) => t.objectStore('receipts').get(bookId) as IDBRequest<Receipt>);
}

export async function listReceipts(): Promise<Receipt[]> {
  const db = await open();
  return getAll<Receipt>(db, 'receipts');
}
