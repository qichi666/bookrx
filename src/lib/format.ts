/**
 * 小工具：把时间/字数说成人话。
 *
 * 「3 天前」比 `2026-10-17T09:12:33.000Z` 有用得多——书架上的书是给人看的，
 * 不是给日志看的。但**不能太模糊**：超过一周就直接给日期，"7 周前"没人算得出来。
 */

export function relativeTime(at: number, now = Date.now()): string {
  const diff = now - at;
  if (diff < 0) return '刚刚';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '昨天';
  if (day < 7) return `${day} 天前`;
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 字数：一万以上用「万字」，避免书架上出现 1234567 这种要数位的数字 */
export function humanCount(n: number): string {
  if (n < 10000) return `${n} 字`;
  return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万字`;
}

/** 0.0725 → 7%：书架上的百分比只留整数，"已完成 7.25%"是假精确 */
export function percentText(ratio: number): string {
  const v = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return `${v}%`;
}
