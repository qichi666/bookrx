import { describe, expect, it } from 'vitest';
import { DEFAULT_GOAL, goalProgress, splitIso, type DayLoad } from '@/domain/goal.js';

/**
 * 目标进度的判定全在这里。
 *
 * 这类"百分比 + 是否在轨"最容易出的错，都是**边缘日期**上的差一天：
 * 闰年 2 月、月末、1 月 1 日、12 月 31 日。错一天不会报错，只会静默给出
 * 一个"看起来合理"的数字——所以每个边界都要有一条断言钉住。
 */

const s = (day: string, hours: number): DayLoad => ({ day, duration_ms: Math.round(hours * 3_600_000) });
const year = (target: number) => ({ scope: 'year' as const, metric: 'books' as const, target });

describe('splitIso', () => {
  it('只接受真实的 ISO 日期：2 月 30 日、13 月、空串都不算', () => {
    expect(splitIso('2026-11-10')).toEqual({ y: 2026, m: 11, d: 10 });
    expect(splitIso('2026-02-30')).toBeNull();
    expect(splitIso('2026-13-01')).toBeNull();
    expect(splitIso('2026-00-10')).toBeNull();
    expect(splitIso('')).toBeNull();
  });

  it('闰年 2 月 29 日是合法的，平年不是', () => {
    expect(splitIso('2024-02-29')).not.toBeNull();
    expect(splitIso('2026-02-29')).toBeNull();
  });
});

describe('goalProgress · 年度本数', () => {
  it('只数本年度标为读完的，去年那本不算', () => {
    const p = goalProgress(year(12), [], ['2026-03-01', '2026-12-31', '2025-12-31'], '2026-11-10');
    expect(p.done).toBe(2);
    expect(p.target).toBe(12);
    expect(p.percent).toBe(17);
    expect(p.remaining).toBe(10);
    expect(p.year).toBe(2026);
    expect(p.month).toBeNull();
  });

  it('年初就能算：1 月 1 日完成 1 本就已达标', () => {
    const p = goalProgress(year(1), [], ['2026-01-01'], '2026-01-01');
    expect(p.done).toBe(1);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.onTrack).toBe(true);
    expect(p.daysLeft).toBe(365);
  });

  it('一年最后一天：daysLeft 含今天，是 1 而不是 0', () => {
    const p = goalProgress(year(12), [], [], '2026-12-31');
    expect(p.daysLeft).toBe(1);
    expect(p.elapsedDays).toBe(365);
    expect(p.daysTotal).toBe(365);
  });

  it('闰年多一天，且 3 月 1 日的序号要把 2 月 29 日算进去', () => {
    const leap = goalProgress(year(12), [], [], '2024-03-01');
    expect(leap.daysTotal).toBe(366);
    expect(leap.elapsedDays).toBe(61);
    const normal = goalProgress(year(12), [], [], '2026-03-01');
    expect(normal.daysTotal).toBe(365);
    expect(normal.elapsedDays).toBe(60);
  });

  it('超额封顶 100%，但 remaining 归零、done 照实显示', () => {
    const days = ['2026-01-02', '2026-01-03', '2026-01-04'];
    const p = goalProgress(year(2), [], days, '2026-01-05');
    expect(p.done).toBe(3);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
  });
});

describe('goalProgress · 是否在轨', () => {
  it('第 1 天什么都没读也算在轨 —— 差一格不算落后', () => {
    // 严格按比例：0 * 365 >= 12 * 1 为假，年初第一天就会写"你落后了"
    expect(goalProgress(year(12), [], [], '2026-01-01').onTrack).toBe(true);
  });

  it('差不到一格时不判落后，差一格以上才判', () => {
    // 第 181 天，年度目标 60 本：应读约 30 本，手上有 1 本 → 明显落后
    expect(goalProgress(year(60), [], ['2026-01-05'], '2026-06-30').onTrack).toBe(false);
    // 同样第 181 天，目标 4 本（应读约 2 本），手上有 1 本 → 差不到一格
    expect(goalProgress(year(4), [], ['2026-01-05'], '2026-06-30').onTrack).toBe(true);
  });

  it('刚好跟上节奏算在轨（整数比较，不受浮点商影响）', () => {
    // 365 天读 365 本 → 每天 1 本；第 100 天读 100 本
    const days = Array.from({ length: 100 }, (_, i) => `2026-04-${String((i % 28) + 1).padStart(2, '0')}`);
    const p = goalProgress(year(365), [], days, '2026-04-10');
    expect(p.done).toBe(100);
    expect(p.onTrack).toBe(true);
  });

  it('明显落后时也照实给数字，不夹带评价', () => {
    const p = goalProgress(year(60), [], ['2026-01-05'], '2026-06-30');
    expect(p.done).toBe(1);
    expect(p.remaining).toBe(59);
    expect(p.percent).toBe(2);
  });
});

describe('goalProgress · 月度与时长', () => {
  it('月度只数本月，上月最后一天不算', () => {
    const g = { scope: 'month' as const, metric: 'books' as const, target: 2 };
    const p = goalProgress(g, [], ['2026-10-31', '2026-11-02'], '2026-11-10');
    expect(p.done).toBe(1);
    expect(p.month).toBe(11);
    expect(p.daysTotal).toBe(30);
    expect(p.daysLeft).toBe(21);
  });

  it('2 月的天数按闰年算', () => {
    const g = { scope: 'month' as const, metric: 'books' as const, target: 1 };
    expect(goalProgress(g, [], [], '2024-02-10').daysTotal).toBe(29);
    expect(goalProgress(g, [], [], '2026-02-10').daysTotal).toBe(28);
  });

  it('时长目标：只累加本期会话，小时保留一位小数', () => {
    const g = { scope: 'month' as const, metric: 'hours' as const, target: 10 };
    const p = goalProgress(g, [s('2026-11-01', 1.5), s('2026-11-02', 2.25), s('2026-10-31', 9)], [], '2026-11-10');
    expect(p.done).toBe(3.8);
    expect(p.remaining).toBe(6.2);
    expect(p.percent).toBe(38);
  });

  it('目标为 0 或负数时按 1 处理，不做除零', () => {
    const p = goalProgress({ scope: 'year', metric: 'books', target: 0 }, [], [], '2026-11-10');
    expect(p.target).toBe(1);
    expect(Number.isFinite(p.percent)).toBe(true);
  });

  it('"今天"不合法时退化成只展示，不凭空判落后', () => {
    const p = goalProgress(year(12), [], [], '');
    expect(p.percent).toBe(0);
    expect(p.onTrack).toBe(true);
    expect(p.daysLeft).toBe(0);
    expect(p.year).toBe(0);
  });
});

describe('默认目标', () => {
  it('年度 / 本数 / 12 本 —— 一月一本，一个能被改的起点', () => {
    expect(DEFAULT_GOAL).toEqual({ scope: 'year', metric: 'books', target: 12 });
  });
});
