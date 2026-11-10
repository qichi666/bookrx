/**
 * 个人阅读目标（N2）的纯计算。
 *
 * 为什么这一页值得存在：统计页回答"我读过多少"，目标回答"我要去哪"。
 * 前者是回顾，后者才带来下一次打开——但没有目标的时候，那个数字
 * 只是"已经发生的事"，不会推动任何行为。
 *
 * 四条规定，写在函数签名里而不是注释里：
 *  ① **不读时钟**。"今天"由调用方传 `YYYY-MM-DD`，同一份数据换一天算出两个结果是 bug；
 *  ② 周期边界全用**本地 ISO 日期字符串**比较（`'2026-11-01' <= day`），
 *     不建 `Date` 对象、不做时区换算——跨月跨年错一天，统计就是错的；
 *  ③ 闰年、大小月都自己算：`Date` 一进来上面两条就守不住了；
 *  ④ 只返回数字，**不返回文案**。语气（不羞辱、不祝贺）是界面的事，
 *     放进这里会让同一条规则在两个地方各写一遍。
 *
 * 口径上的一个近似，写清楚免得以后被当成 bug：本数按"标为读完那一刻"的
 * `shelf.updated_at` 归入周期——书架里没有 `finished_at` 字段，也不打算为这个加，
 * 因为 `updated_at` 在被标为读完时就是那一刻。
 */

export type GoalScope = 'year' | 'month';
export type GoalMetric = 'books' | 'hours';

export interface ReadingGoal {
  scope: GoalScope;
  metric: GoalMetric;
  /** 本数或小时数，正整数 */
  target: number;
}

/** 没设过目标时的默认值：一年 12 本，约等于一月一本。不是"标准"，只是一个能改的起点 */
export const DEFAULT_GOAL: ReadingGoal = { scope: 'year', metric: 'books', target: 12 };

export interface GoalProgress {
  /** 已完成：本数，或小时数（一位小数） */
  done: number;
  target: number;
  /** 0–100。超额也封顶 100：进度条画不出 130%，而"已超额"由 `remaining === 0` 表达 */
  percent: number;
  /** 还差多少（本 / 小时），已达成是 0 */
  remaining: number;
  /** 按当前进度是否跟得上（含今天；第一天天然算跟得上） */
  onTrack: boolean;
  /** 本期还剩几天（含今天） */
  daysLeft: number;
  daysTotal: number;
  elapsedDays: number;
  year: number;
  /** 年度目标为 null */
  month: number | null;
}

export interface DayLoad {
  day: string;
  duration_ms: number;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2 && isLeap(y)) return 29;
  return MONTH_DAYS[m - 1] ?? 30;
}

function dayOfYear(y: number, m: number, d: number): number {
  let n = d;
  for (let i = 1; i < m; i += 1) n += daysInMonth(y, i);
  return n;
}

function pad(v: number): string {
  return String(v).padStart(2, '0');
}

/** 把「今天」拆成年/月/日。不是合法 ISO 就返回 null，由调用方决定怎么退化 */
export function splitIso(today: string): { y: number; m: number; d: number } | null {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  if (!Number.isInteger(y) || y < 1970 || y > 9999) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function goalProgress(
  goal: ReadingGoal,
  sessions: readonly DayLoad[],
  finishedDays: readonly string[],
  today: string,
): GoalProgress {
  const parts = splitIso(today);
  const target = goal.target > 0 ? goal.target : 1;

  // 日期坏了不能装作"进度 0%"：那会显示成"你今年一本都没读完"。
  // 退化成"仅展示，不判断在轨"，天数给 0，界面据此隐藏节奏判断。
  if (!parts) {
    return {
      done: 0, target, percent: 0, remaining: target, onTrack: true,
      daysLeft: 0, daysTotal: 0, elapsedDays: 0, year: 0, month: null,
    };
  }

  const { y, m, d } = parts;
  const monthly = goal.scope === 'month';
  const start = monthly ? `${y}-${pad(m)}-01` : `${y}-01-01`;
  const end = monthly ? `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` : `${y}-12-31`;

  let done: number;
  if (goal.metric === 'books') {
    // 按日期字符串比较，不建 Date：跨时区、跨夏令时都不会漂
    done = finishedDays.filter((day) => day >= start && day <= end).length;
  } else {
    const ms = sessions.reduce((sum, s) => (s.day >= start && s.day <= end ? sum + s.duration_ms : sum), 0);
    done = Math.round((ms / 3_600_000) * 10) / 10;
  }

  const daysTotal = monthly ? daysInMonth(y, m) : isLeap(y) ? 366 : 365;
  const elapsedDays = monthly ? d : dayOfYear(y, m, d);
  /**
   * 在轨判定：允许**差一格**（本 / 小时）。
   *
   * 严格按比例算的话，1 月 1 日、目标 12 本、进度 0 本会被判成"落后"——
   * 数学上没错，但这是年初第一天，人看到的第一句话就是"你落后了"。
   * 而"差半本"这种精度本来也不该被感知。所以判据是
   * `(done + 1) * 总天数 >= 目标 * 已过天数`：
   * 落后超过一个单位才算掉队，`remaining` 仍照实给，不掩盖差多少。
   *
   * 全程整数乘法，不做除法：`done / target >= elapsed / total` 的两个浮点商
   * 在"刚好达标"这些边界上会给出反直觉的 false。
   */
  const onTrack = (done + 1) * daysTotal >= target * elapsedDays;

  return {
    done,
    target,
    percent: Math.min(100, Math.round((done / target) * 100)),
    remaining: done >= target ? 0 : Math.round((target - done) * 10) / 10,
    onTrack,
    daysLeft: Math.max(0, daysTotal - elapsedDays + 1),
    daysTotal,
    elapsedDays,
    year: y,
    month: monthly ? m : null,
  };
}
