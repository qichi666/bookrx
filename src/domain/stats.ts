/**
 * 阅读统计的纯逻辑。
 *
 * 为什么全部是纯函数：这一层要算「连续天数」这种**最容易写错又最不容易发现**的东西
 * ——差一天不会报错，只会让用户看到"我明明读了"却显示断了。所以它必须能被单测
 * 用固定日期锁死，而不是靠 `new Date()` 在跑的时候碰运气。
 *
 * 因此本文件**不允许出现 `Date` / `Date.now()`**（`src/domain` 的既有约束）：
 * "今天是几号"由调用方以 `YYYY-MM-DD` 传入。
 */

export interface DayBucket {
  /** `YYYY-MM-DD` */
  day: string;
  duration_ms: number;
  session_count: number;
}

export interface StreakResult {
  /** 当前连续天数 */
  days: number;
  /** 这段连续里用掉了几个冻结额度 */
  freezes_used: number;
  /** 今天是否已经有记录（false 时连续天数按"昨天为止"算，不算断） */
  active_today: boolean;
}

/** 每月可用的冻结次数：断一天不清零，避免"差一天全白干"把人推走。 */
export const FREEZE_BUDGET = 2;

/**
 * `YYYY-MM-DD` → 距 1970-01-01 的天数。
 *
 * 用 Howard Hinnant 的 civil-from-days 逆算法手写，不用 `Date`：
 * `new Date('2026-11-08')` 会按 UTC 解析，在 UTC+8 之外会整体偏一天，
 * 而连续天数偏一天就是"永远差一天"这种查不出来的错。
 */
export function dayNumber(iso: string): number {
  // 先按 `YYYY-MM-DD` 严格解析。`Number('')` 是 0，原先空串会被当成
  // 1970-01-01 混进集合——一天的脏数据就能给「连续天数」掺水，而这种错
  // 在界面上完全看不出来（数字只是多了 1）。
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) return NaN;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return NaN;
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 天序号 → `YYYY-MM-DD`（柱状图的横轴标签用，同样不碰 Date） */
export function isoOfDay(n: number): string {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  // 1 月与 2 月属于上一年——`dayNumber` 里减过 1，这里要加回来
  const year = month <= 2 ? yoe + era * 400 + 1 : yoe + era * 400;
  const pad = (v: number): string => String(v).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 连续天数，带冻结额度。
 *
 * 规则（按顺序）：
 *  1. 从今天往回走；今天没记录时，不立刻判零——从昨天开始算（今天还没读不算断）。
 *  2. 遇到没有记录的一天，消耗一次冻结额度跳过去；额度用完即停。
 *  3. 同一天多条会话只算一天。
 *
 * 反例说明为什么不做"断一天归零"：断一天清零会让「连续 40 天」因为一次加班
 * 全部作废，用户的第一反应不是重新开始，而是不再看这个数字。
 */
export function computeStreak(days: readonly string[], today: string, freezeBudget = FREEZE_BUDGET): StreakResult {
  const set = new Set<number>();
  for (const d of days) {
    const n = dayNumber(d);
    if (Number.isFinite(n)) set.add(n);
  }
  const t = dayNumber(today);
  if (!Number.isFinite(t) || set.size === 0) return { days: 0, freezes_used: 0, active_today: false };

  const activeToday = set.has(t);
  let cursor = activeToday ? t : t - 1;
  // 昨天也没记录：连续已经断了，从最近一次有记录的那天重新起算
  if (!activeToday && !set.has(cursor)) {
    let probe = cursor;
    while (probe > t - 400 && !set.has(probe)) probe -= 1;
    if (!set.has(probe)) return { days: 0, freezes_used: 0, active_today: false };
    cursor = probe;
  }

  let count = 0;
  let freezes = 0;
  /**
   * 已经跨过、但还没被"更早的记录"证明值得的缺口。
   *
   * 原先一碰到缺口就 `freezes += 1`，于是连续三天全勤也会显示「已用 1 次冻结」
   * ——结尾那段没接上任何记录的缺口被记了账。冻结的语义是"花一次额度把断掉
   * 的那天补上"，补上了才算花；补不上就不该让用户看到这个数字。
   */
  let pending = 0;
  let gapRun = 0;
  for (let i = cursor; i > cursor - 4000; i -= 1) {
    if (set.has(i)) {
      count += 1;
      freezes += pending;
      pending = 0;
      gapRun = 0;
      continue;
    }
    // 连续缺口超过 1 天就真的要停：冻结只补"漏了一天"，不补"消失了两周"
    if (gapRun >= 1) break;
    if (freezes + pending >= freezeBudget) break;
    pending += 1;
    gapRun += 1;
  }
  return { days: count, freezes_used: freezes, active_today: activeToday };
}

/** 最近 `span` 天（含今天）的每日时长，缺失的天补 0——柱状图需要连续的横轴。 */
export function lastDays(days: readonly DayBucket[], today: string, span = 7): DayBucket[] {
  const byDay = new Map<string, DayBucket>();
  for (const b of days) byDay.set(b.day, b);
  const t = dayNumber(today);
  const out: DayBucket[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const iso = isoOfDay(t - i);
    out.push(byDay.get(iso) ?? { day: iso, duration_ms: 0, session_count: 0 });
  }
  return out;
}

/** 把会话按本地日期聚合成天桶。顺序按日期升序，保证图表稳定。 */
export function bucketSessions(
  sessions: readonly { day: string; duration_ms: number }[],
): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const s of sessions) {
    const cur = map.get(s.day) ?? { day: s.day, duration_ms: 0, session_count: 0 };
    cur.duration_ms += Math.max(0, s.duration_ms);
    cur.session_count += 1;
    map.set(s.day, cur);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** 毫秒 → 「3 小时 20 分」；不足一分钟如实说「不到 1 分钟」，不四舍五入成 0。 */
export function humanDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 分钟';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '不到 1 分钟';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}
