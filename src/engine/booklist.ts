import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { Tier } from '@/contracts/recommendation.js';
import type { ComputedResult } from '@/engine/result.js';
import { tierOf } from '@/domain/scoring/tier.js';

/**
 * 书单文件（P0-15）：把一次推荐结果导出成 `*.booklist.json`，可被别人导入。
 *
 * 两条设计约束：
 *  ① **存选择，不存分数**（与诊断契约同一条纪律）。分数是派生的，存下来就会随规则
 *     演进而分叉，且分叉不报错。所以文件里带的是 `diagnosis`——对方拿自己的书库
 *     重算，得到他自己那份结果；顺带存一份当时的书名快照，用于"书不在这份书单里"时
 *     仍能看懂对方当时看到的是什么。
 *  ② **导入必须能分类报错**。一个不明所以的 "导入失败" 会让人反复重试同一个坏文件。
 *     这里把失败拆成 5 类，每一类都对应一句能指导动作的话（见 UI 层）。
 */

export const BOOKLIST_SCHEMA = 'bookrx.booklist/1';

/** 单条快照：只留看懂书单需要的最小事实 */
export interface BooklistItem {
  book_id: string;
  title: string;
  tier: Tier;
}

export interface BooklistFile {
  schema: string;
  exported_at: number;
  /** 导出端的书库版本，用于提示"对方书库可能不同" */
  data_version: string;
  diagnosis: Diagnosis;
  items: BooklistItem[];
  note?: string;
}

export type BooklistErrorCode =
  | 'E_NOT_JSON'
  | 'E_NOT_BOOKLIST'
  | 'E_BAD_SHAPE'
  | 'E_FROM_FUTURE'
  | 'E_NO_NEED_TAGS';

export interface BooklistError {
  code: BooklistErrorCode;
  detail: string;
}

export type BooklistParseResult =
  | { ok: true; value: BooklistFile }
  | { ok: false; error: BooklistError };

/** 导出：诊断 + 本次结果 → 文件对象。纯函数，不碰 DOM，不碰存储。 */
export function buildBooklist(
  diagnosis: Diagnosis,
  result: ComputedResult,
  now = Date.now(),
): BooklistFile {
  const items: BooklistItem[] = result.items.map((it) => ({
    book_id: it.book.book_id,
    title: it.book.title,
    tier: tierOf(it.score_bp, it.primary_hit).tier,
  }));
  return {
    schema: BOOKLIST_SCHEMA,
    exported_at: now,
    data_version: result.items[0]?.book.data_version ?? '',
    diagnosis,
    items,
  };
}

export function serializeBooklist(file: BooklistFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** 下载文件名：`bookrx-booklist-20261020-2215.json`（本地时间，便于人认） */
export function booklistFilename(at = Date.now()): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `bookrx-booklist-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 解析导入的文件内容。
 *
 * 版本比较只做一件事：**拒绝比自己新的 schema**。旧版本允许读——那是我们承诺过
 * 的向前兼容；而未来版本里的字段我们读不懂，硬读会把"读不懂"变成"读错了"。
 */
export function parseBooklist(raw: string): BooklistParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: { code: 'E_NOT_JSON', detail: '不是合法的 JSON' } };
  }
  if (!isRecord(data)) {
    return { ok: false, error: { code: 'E_NOT_BOOKLIST', detail: '顶层不是对象' } };
  }
  const schema = data.schema;
  if (typeof schema !== 'string' || !schema.startsWith('bookrx.booklist/')) {
    return { ok: false, error: { code: 'E_NOT_BOOKLIST', detail: 'schema 不是 bookrx.booklist/…' } };
  }
  const version = Number(schema.slice('bookrx.booklist/'.length));
  if (!Number.isFinite(version)) {
    return { ok: false, error: { code: 'E_BAD_SHAPE', detail: 'schema 版本号不是数字' } };
  }
  if (version > 1) {
    return {
      ok: false,
      error: { code: 'E_FROM_FUTURE', detail: `文件版本 ${version} 比本应用新（支持 1）` },
    };
  }

  const dx = data.diagnosis;
  if (!isRecord(dx) || !isRecord(dx.answers) || !Array.isArray(dx.need_tags)) {
    return { ok: false, error: { code: 'E_BAD_SHAPE', detail: '缺少 diagnosis / answers / need_tags' } };
  }
  if (dx.need_tags.length === 0) {
    return { ok: false, error: { code: 'E_NO_NEED_TAGS', detail: 'need_tags 为空' } };
  }
  if (typeof dx.answers.primary_tag !== 'string') {
    return { ok: false, error: { code: 'E_BAD_SHAPE', detail: 'answers.primary_tag 缺失' } };
  }
  if (!Array.isArray(data.items)) {
    return { ok: false, error: { code: 'E_BAD_SHAPE', detail: '缺少 items 数组' } };
  }

  const items: BooklistItem[] = [];
  for (const raw of data.items as unknown[]) {
    if (!isRecord(raw)) continue;
    if (typeof raw.book_id !== 'string' || typeof raw.title !== 'string') continue;
    const tier = raw.tier;
    if (tier !== 'strong' && tier !== 'worth' && tier !== 'explore') continue;
    items.push({ book_id: raw.book_id, title: raw.title, tier });
  }
  if (items.length === 0) {
    return { ok: false, error: { code: 'E_BAD_SHAPE', detail: 'items 里没有一条可用的书' } };
  }

  return {
    ok: true,
    value: {
      schema,
      exported_at: typeof data.exported_at === 'number' ? data.exported_at : 0,
      data_version: typeof data.data_version === 'string' ? data.data_version : '',
      diagnosis: dx as unknown as Diagnosis,
      items,
      ...(typeof data.note === 'string' ? { note: data.note } : {}),
    },
  };
}

/** 错误码 → 一句能指导动作的话（UI 直接用，不在这里拼条件分支） */
export const BOOKLIST_ERROR_TEXT: Readonly<Record<BooklistErrorCode, string>> = {
  E_NOT_JSON: '这个文件不是 JSON。确认选中的是 bookrx 导出的 .booklist.json，不是截图或压缩包。',
  E_NOT_BOOKLIST: '这不是 BookRx 的书单文件。文件里应该有一个 "schema": "bookrx.booklist/1" 字段。',
  E_BAD_SHAPE: '文件结构不完整，可能被编辑器改坏了。请让对方重新导出一次。',
  E_FROM_FUTURE: '这份书单来自更新版本的 BookRx。升级本应用后再导入，或让对方用旧版导出。',
  E_NO_NEED_TAGS: '这份记录里没有任何困境标签，无法据此推荐。可以让对方重新做一次问卷。',
};
