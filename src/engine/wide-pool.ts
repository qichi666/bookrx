import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { ProblemTagWeight } from '@/contracts/book.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import type { CandidateBook } from '@/data/candidates.js';
import { selectByNeed } from './wide-need.js';

/**
 * 全库推荐池（书目层）。
 *
 * 为什么单独一层：核心库只有十几本人工标注书，按 34 字段打分；候选层
 * 六千多本只有「域 + 公开口碑」，没有难度/体例/篇幅标注。**不能把它们塞进
 * 7 因子打分**——那等于用编造的字段算分。正确做法是：核心层继续按标注打分，
 * 候选层按「同域 + 质量档」轮转补位，如实标「未标注」。
 *
 * 三条硬规则：
 *  ① 全库覆盖：质量桶加权摊成一条全局序列，第 epoch 批 = 第 epoch 个窗口，
 *     严格 ceil(池子大小/limit) 轮翻完，一个周期内每本只出现一次；
 *  ② 不重复：同 id、同书名（归一后，含同名不同版）在整个池里只留一本，
 *     且与核心库已展示书名、库外建议书名去重；
 *  ③ 确定性：同 (diagnosis, epoch) → 同结果，不用 Math.random / 时间。
 */

export type WideBucket = CandidateBook['bucket'];

/** 归一化书名：去空白、书名号、常见标点与版本缀，用于跨库去重。 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s《》「」『』:：,，.。·\-—_/\\|"'“”‘’!！?？]/g, '')
    .toLowerCase();
}

/** 同一档内的确定性顺序：收缩分降序 → 评价人数降序 → id 升序。 */
function compareInBucket(a: CandidateBook, b: CandidateBook): number {
  const qa = a.q ?? -1;
  const qb = b.q ?? -1;
  if (qb !== qa) return qb - qa;
  const va = a.votes ?? -1;
  const vb = b.votes ?? -1;
  if (vb !== va) return vb - va;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface WidePickOptions {
  /** 「换一批」计数：每次 +1 前进一个窗口；同 epoch 结果稳定 */
  epoch: number;
  limit: number;
  /** 已展示过的书名（核心库 + 库外建议），用于跨层去重 */
  excludeTitles?: readonly string[];
  /**
   * 用户需求（困境标签 → 权重）。与 `derived` 同时给出时改走「按需匹配」：
   * 只取沾题的书，按命中率排序——见 `wide-need.ts`。
   */
  demand?: ReadonlyMap<ProblemTagId, number>;
  /** 候选层的派生困境标签（id → problem_tags） */
  derived?: ReadonlyMap<string, readonly ProblemTagWeight[]>;
}

export interface WidePool {
  /** 当前域下可用的候选总数（不受 epoch 影响） */
  size: number;
  picks: CandidateBook[];
}

/**
 * 取一批候选书。
 *
 * 做法：先把四个质量桶**加权摊成一条全局序列**，再按 limit 切窗，
 * 第 epoch 批就是第 epoch 个窗口（越界后回卷）。
 *
 * 为什么不是「四桶轮流各取一本」：那样小桶会空转。实测 1215 本的域里，
 * 轮流法要 752 批才翻完，理论下限是 ceil(1215/5)=243 批——慢了 3 倍，
 * 用户按到手酸也见不到全部书。切窗法把覆盖轮数压到 **严格 ceil(n/limit)**，
 * 且一个完整周期内每本只出现一次。
 *
 * 质量梯度靠「摊序列」保留：第一条仍是 high，同一批里 high/mid/unknown/low
 * 按各自体量分配名额，不会一下掉到低质量区。
 */
export function pickWide(
  candidates: readonly CandidateBook[],
  diagnosis: Diagnosis,
  opts: WidePickOptions,
): WidePool {
  const domain = diagnosis.answers.domain;
  const excludedIds = new Set(diagnosis.excluded_book_ids.map(String));

  // 有派生标签就按需求匹配；没有则退回「同域 + 口碑档」（老行为，作为降级路径）
  if (opts.demand !== undefined && opts.derived !== undefined && opts.demand.size > 0) {
    return selectByNeed(candidates, opts.derived, opts.demand, domain, excludedIds, {
      epoch: opts.epoch,
      limit: opts.limit,
      excludeTitles: opts.excludeTitles,
    });
  }

  const seen = new Set((opts.excludeTitles ?? []).map(normalizeTitle));

  const buckets: Record<WideBucket, CandidateBook[]> = {
    high: [],
    mid: [],
    unknown: [],
    low: [],
  };

  for (const c of candidates) {
    if (!c.domains.includes(domain)) continue;
    if (excludedIds.has(c.id)) continue;
    if (seen.has(normalizeTitle(c.title))) continue;
    buckets[c.bucket].push(c);
  }
  for (const key of Object.keys(buckets) as WideBucket[]) {
    buckets[key].sort(compareInBucket);
  }

  const order: WideBucket[] = ['high', 'mid', 'unknown', 'low'];

  /**
   * 同名不同版在**建池时**就合成一本（按 high→low 取质量最高的一版）。
   *
   * 只做「同批去重」不够：真数据里「沟通的艺术」和「沟通的艺术（第 3 版）」
   * 是两条不同 id，同批不会撞，但会在第 3 批和第 7 批各出现一次——
   * 用户视角就是「又推了同一本书」，而这正是最初被反馈的问题。
   */
  const seenTitles = new Set<string>();
  for (const key of order) {
    buckets[key] = buckets[key].filter((b) => {
      const t = normalizeTitle(b.title);
      if (seenTitles.has(t)) return false;
      seenTitles.add(t);
      return true;
    });
  }

  const size = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);
  if (size === 0) return { size: 0, picks: [] };

  const ordered = interleave(buckets, order, size);
  const limit = Math.max(1, Math.min(opts.limit, size));
  const start = (((opts.epoch % Math.ceil(size / limit)) * limit) % size + size) % size;
  const picks: CandidateBook[] = [];
  for (let i = 0; i < limit; i += 1) {
    const book = ordered[(start + i) % size];
    if (book !== undefined) picks.push(book);
  }
  return { size, picks };
}

/**
 * 平滑加权轮转（nginx 那套）把四个桶摊成一条序列：
 * 大桶按体量多出书，小桶也不会被饿死，且顺序确定（无随机）。
 */
function interleave(
  buckets: Record<WideBucket, CandidateBook[]>,
  order: readonly WideBucket[],
  size: number,
): CandidateBook[] {
  const taken: Record<WideBucket, number> = { high: 0, mid: 0, unknown: 0, low: 0 };
  const credit: Record<WideBucket, number> = { high: 0, mid: 0, unknown: 0, low: 0 };
  const out: CandidateBook[] = [];
  while (out.length < size) {
    let best: WideBucket | null = null;
    for (const key of order) {
      if (taken[key] >= buckets[key].length) continue;
      credit[key] += buckets[key].length;
      if (best === null || credit[key] > credit[best]) best = key;
    }
    if (best === null) break;
    credit[best] -= size;
    const book = buckets[best][taken[best]];
    taken[best] += 1;
    if (book !== undefined) out.push(book);
  }
  return out;
}
