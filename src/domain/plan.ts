import type { WishItem } from './wishlist.js';

/**
 * 读书计划排期（F11）。
 *
 * 纯函数，输入「想读列表 + 每周可用小时」，输出「第 N 周读哪几本」。
 * **不做提醒、不判完成、不算逾期**：无账号无服务端，任何"你没完成"的提示
 * 都只是在制造负罪感，而负罪感不会让人多读一页。
 *
 * 排期规则：
 *  1. 按队列顺序排（用户自己排的先后必须被尊重）；
 *  2. 每周尽量排满但不超；单本超过周额度时单独占一周，不做"半本跨周"
 *     ——跨周的书会让"这周该读到哪"变成一道算术题；
 *  3. 时长未知（0）的书按中位 6 小时估，并在结果里标出来；
 *  4. 四周窗口装不下的书进 `overflow`，界面上单独列出来——不塞进最后一个格子。
 */

export interface PlanWeek {
  week: number;
  hours: number;
  items: WishItem[];
}

export interface PlanResult {
  weeks: PlanWeek[];
  /** 有几本书缺预计时长，用了中位估值 */
  estimated_count: number;
  total_hours: number;
  /**
   * 四周装不下、排在窗口之外的条目。
   *
   * 旧实现在「四周都排不下」时把它们全塞进最后一周，于是界面上会出现
   * 「第 4 周 35 小时」——用户明明填了每周 6 小时。宁可承认排不下，
   * 也不能让最后一个格子说谎。
   */
  overflow: WishItem[];
  overflow_hours: number;
}

/** 核心库预计时长中位数（实测 6 小时）。缺时长的书用它兜底。 */
export const FALLBACK_HOURS = 6;

export function planWeeks(items: readonly WishItem[], weeklyHours: number, weekCount = 4): PlanResult {
  const budget = Math.max(0.5, weeklyHours);
  const weeks: PlanWeek[] = [];
  for (let i = 0; i < weekCount; i += 1) weeks.push({ week: i + 1, hours: 0, items: [] });

  let estimated = 0;
  let cursor = 0;
  let total = 0;
  const overflow: WishItem[] = [];
  let overflowHours = 0;

  for (const it of items) {
    const known = Number.isFinite(it.hours) && it.hours > 0;
    const h = known ? it.hours : FALLBACK_HOURS;
    if (!known) estimated += 1;
    total += h;

    /**
     * 单本超过周额度：**单独占当前这一周**，后面的书从下一周排。
     *
     * 旧实现是「塞进最后一周且把 cursor 拉到末尾」，于是一本 20 小时的书
     * 会让前三周全空、第四周堆成 26 小时——和注释承诺的「单独占一周」相反。
     */
    if (h > budget) {
      if (cursor >= weeks.length) {
        overflow.push(it);
        overflowHours = Math.round((overflowHours + h) * 10) / 10;
        continue;
      }
      const target = cursor;
      weeks[target]!.items.push(it);
      weeks[target]!.hours = Math.round((weeks[target]!.hours + h) * 10) / 10;
      cursor = target + 1;
      continue;
    }

    // 从游标往后找第一个装得下的周。**不回头**，否则会出现"第 3 本排在第 1 周"
    let target = -1;
    for (let i = cursor; i < weeks.length; i += 1) {
      if (weeks[i]!.hours + h <= budget) {
        target = i;
        break;
      }
    }
    // 四周都排不下：进 overflow，由界面如实说"还有几本排在四周之后"
    if (target < 0) {
      overflow.push(it);
      overflowHours = Math.round((overflowHours + h) * 10) / 10;
      continue;
    }
    weeks[target]!.items.push(it);
    weeks[target]!.hours = Math.round((weeks[target]!.hours + h) * 10) / 10;
    cursor = target;
  }

  return {
    weeks,
    estimated_count: estimated,
    total_hours: Math.round(total * 10) / 10,
    overflow,
    overflow_hours: overflowHours,
  };
}
