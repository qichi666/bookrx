import type { Diagnosis } from '@/contracts/diagnosis.js';

/**
 * 本地轻反馈（P2-3）。**只存在这台设备上，不上传、不埋点、不带自由文本。**
 *
 * 为什么要有：这个产品没有任何反馈闭环，于是"推荐准不准"永远只能靠我们猜。
 * 但做闭环最容易越界的地方也正是这里——一旦上传，用户的困境描述就成了服务器上的
 * 敏感文本；一旦要求登录，本来只想找本书的人要先交出身份。
 *
 * 所以这里的边界写死在代码里：
 *  - 只存 `domain / tier 分布 / 一句有用没用 / 时间戳`，**不存 `free_text`**；
 *  - 只写 localStorage，数据不离开这台设备；
 *  - 导出是用户主动点的一次性 JSON 下载，导出的内容用户自己能看见。
 *
 * 这不是"进化机制"，只是**主观体验样本**。把它说成前者，就是在给一个没有的东西贴标签。
 */

const KEY = 'bookrx.feedback.v1';
/** 上限：超过就丢最旧的。localStorage 只有几 MB，写满会静默失败。 */
const LIMIT = 200;

export type Verdict = 'useful' | 'not-useful';

export interface FeedbackEntry {
  /** 诊断 id（本地生成，不含任何可识别信息） */
  diagnosis_id: string;
  domain: Diagnosis['answers']['domain'];
  primary_tag: string;
  /** 结果里有几本 strong / worth / explore —— 只有计数，没有书名 */
  tiers: { strong: number; worth: number; explore: number };
  verdict: Verdict;
  /** 记录时间（毫秒） */
  at: number;
}

function readRaw(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(list: FeedbackEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-LIMIT)));
  } catch {
    /* 隐私模式或配额满：不影响使用，也不弹错 */
  }
}

/**
 * 记一条。**同一个诊断只留最后一条**：用户改了主意，就该以最后一次为准，
 * 而不是让"点了三次没用"看起来像三个人。
 */
export function recordFeedback(
  diagnosis: Diagnosis,
  tiers: FeedbackEntry['tiers'],
  verdict: Verdict,
): FeedbackEntry {
  const entry: FeedbackEntry = {
    diagnosis_id: diagnosis.diagnosis_id,
    domain: diagnosis.answers.domain,
    primary_tag: diagnosis.answers.primary_tag,
    tiers,
    verdict,
    at: Date.now(),
  };
  const rest = readRaw().filter((e) => e.diagnosis_id !== entry.diagnosis_id);
  writeRaw([...rest, entry]);
  return entry;
}

export function listFeedback(): FeedbackEntry[] {
  return readRaw();
}

export function feedbackSummary(): { total: number; useful: number } {
  const list = readRaw();
  return { total: list.length, useful: list.filter((e) => e.verdict === 'useful').length };
}

export function clearFeedback(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}

/** 导出用的 JSON（用户主动触发）。字段顺序固定，便于人读。 */
export function exportFeedbackJson(): string {
  const list = readRaw();
  const payload = {
    app: 'BookRx',
    kind: 'local-feedback',
    exported_at: new Date().toISOString(),
    note: '这份文件只包含你本机的「有用/没用」记录，不含自由文本、不含任何账号信息。',
    count: list.length,
    entries: list.map((e) => ({
      at: new Date(e.at).toISOString(),
      domain: e.domain,
      primary_tag: e.primary_tag,
      verdict: e.verdict,
      tiers: e.tiers,
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** 触发一次浏览器下载（不经过任何服务器）。 */
export function downloadFeedback(filename = 'bookrx-feedback.json'): void {
  const text = exportFeedbackJson();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
