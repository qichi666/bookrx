/**
 * 本地日期。**只给 `storage` / `lib` / 视图层用**，`src/domain` 不许 import 它
 * （那一层禁 `Date`，"今天几号"必须由调用方传进来，否则同一份数据换一天算出两个结果）。
 */

function pad(v: number): string {
  return String(v).padStart(2, '0');
}

/** 毫秒时间戳 → 本地时区的 `YYYY-MM-DD`。 */
export function localDayIso(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地时区的今天。 */
export function todayIso(): string {
  return localDayIso(Date.now());
}

/** `YYYY-MM-DD` → 「11 月 8 日」，柱状图横轴用。 */
export function shortDay(iso: string): string {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${m} 月 ${d} 日`;
}
