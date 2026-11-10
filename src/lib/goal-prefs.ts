/**
 * 阅读目标的本机存档（N2）。
 *
 * 只存一行 JSON，不进 IndexedDB：目标不是"阅读数据"，它是设置项，
 * 跟主题一个量级。放 localStorage 的好处是不必为它改 schema 版本，
 * 而且「清站点数据」时它跟库一起消失——不留一个指向空书架的目标。
 *
 * 校验写得很严（不认识的 scope / metric 一律当没设过）：
 * 存档是用户能直接看到、也能手改的东西，一个 `scope: "weekly"` 进来，
 * 下游 `goalProgress` 就会按"年度"算，而界面写着"每周"。
 */

import type { GoalMetric, GoalScope, ReadingGoal } from '@/domain/goal.js';

export const GOAL_KEY = 'bookrx.goal';

/** 目标上限：一年 10000 本 / 小时已经远超人类，再大就是脏数据而不是雄心 */
const MAX_TARGET = 10_000;

export function parseGoal(raw: string | null | undefined): ReadingGoal | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const scope = o.scope === 'year' || o.scope === 'month' ? (o.scope as GoalScope) : null;
  const metric = o.metric === 'books' || o.metric === 'hours' ? (o.metric as GoalMetric) : null;
  const n = typeof o.target === 'number' ? Math.round(o.target) : NaN;
  if (!scope || !metric) return null;
  if (!Number.isFinite(n) || n < 1 || n > MAX_TARGET) return null;
  return { scope, metric, target: n };
}

/** 没设过 / 存储被禁 → null（= 还没设目标），不抛 */
export function readGoal(): ReadingGoal | null {
  try {
    return parseGoal(localStorage.getItem(GOAL_KEY));
  } catch {
    return null;
  }
}

/** `null` = 清除目标。写失败不提示：它只影响下次打开还在不在 */
export function saveGoal(goal: ReadingGoal | null): void {
  try {
    if (goal === null) localStorage.removeItem(GOAL_KEY);
    else localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
  } catch {
    /* 隐私模式：本次有效，下次打开回到"没设目标" */
  }
}
