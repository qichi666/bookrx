// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { humanCount, percentText, relativeTime } from '@/lib/format.js';
import { humanSize } from '@/lib/file-io.js';
import { localDayIso, shortDay, todayIso } from '@/lib/local-date.js';

/**
 * 显示格式化（F3/F5/F7 共用）。
 *
 * 这些函数不改数据，只改"人说这句话的方式"，但它们出现的场合全是**坏消息**：
 * 导入失败（"你的文件 62 MB，上限 50 MB"）、书打不开（"上次打开 3 天前"）。
 * 所以在边界上给错字，用户看到的就是一句不像人话的提示。
 */

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const ago = (ms: number): number => NOW - ms;

describe('relativeTime', () => {
  it('分档：刚刚 / 分钟 / 小时 / 昨天 / 天 / 日期', () => {
    expect(relativeTime(ago(30_000), NOW)).toBe('刚刚');
    expect(relativeTime(ago(59_000), NOW)).toBe('刚刚');
    expect(relativeTime(ago(60_000), NOW)).toBe('1 分钟前');
    expect(relativeTime(ago(59 * 60_000), NOW)).toBe('59 分钟前');
    expect(relativeTime(ago(23 * 3_600_000), NOW)).toBe('23 小时前');
    expect(relativeTime(ago(24 * 3_600_000), NOW)).toBe('昨天');
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe('2 天前');
    expect(relativeTime(ago(6 * 86_400_000), NOW)).toBe('6 天前');
  });

  it('满一周就给日期，不给"7 天前 / 2 周前"这种要心算的说法', () => {
    expect(relativeTime(ago(7 * 86_400_000), NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(relativeTime(ago(400 * 86_400_000), NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('时间戳比现在还晚（时钟回拨 / 未来数据）：说「刚刚」，不出现「-3 分钟前」', () => {
    expect(relativeTime(NOW + 60_000, NOW)).toBe('刚刚');
    expect(relativeTime(NOW + 86_400_000, NOW)).toBe('刚刚');
  });

  it('日期按本地时区补零', () => {
    const at = new Date(2026, 0, 5, 9, 0, 0).getTime();
    expect(relativeTime(at, new Date(2026, 5, 1).getTime())).toBe('2026-01-05');
  });
});

describe('humanCount', () => {
  it('一万以下给原数，一万以上给万字', () => {
    expect(humanCount(0)).toBe('0 字');
    expect(humanCount(9_999)).toBe('9999 字');
    expect(humanCount(10_000)).toBe('1.0 万字');
    expect(humanCount(12_345)).toBe('1.2 万字');
    expect(humanCount(100_000)).toBe('10 万字');
    expect(humanCount(1_234_567)).toBe('123 万字');
  });
});

describe('percentText', () => {
  it('四舍五入并夹在 0–100 之间', () => {
    expect(percentText(0)).toBe('0%');
    expect(percentText(0.004)).toBe('0%');
    expect(percentText(0.005)).toBe('1%');
    expect(percentText(0.0725)).toBe('7%');
    expect(percentText(1)).toBe('100%');
    expect(percentText(3)).toBe('100%');
    expect(percentText(-1)).toBe('0%');
  });

  it('脏数据（NaN）目前会原样显示成「NaN%」——记录在案，见测试报告观察项', () => {
    expect(percentText(Number.NaN)).toBe('NaN%');
  });
});

describe('humanSize', () => {
  it('B / KB / MB 三档', () => {
    expect(humanSize(0)).toBe('0 B');
    expect(humanSize(1023)).toBe('1023 B');
    expect(humanSize(1024)).toBe('1 KB');
    expect(humanSize(50 * 1024)).toBe('50 KB');
    expect(humanSize(1024 * 1024)).toBe('1.0 MB');
    expect(humanSize(62.4 * 1024 * 1024)).toBe('62.4 MB');
  });
});

describe('本地日期', () => {
  it('按本地时区取日期，不按 UTC 取（跨零点的书不该显示成前一天）', () => {
    expect(localDayIso(new Date(2026, 10, 10, 0, 30).getTime())).toBe('2026-11-10');
    expect(localDayIso(new Date(2026, 10, 10, 23, 59).getTime())).toBe('2026-11-10');
  });

  it('月与日补零', () => {
    expect(localDayIso(new Date(2026, 0, 5, 12, 0).getTime())).toBe('2026-01-05');
  });

  it('todayIso 与 localDayIso(现在) 一致，且是合法格式', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIso()).toBe(localDayIso());
  });

  it('shortDay 去掉前导零', () => {
    expect(shortDay('2026-11-08')).toBe('11 月 8 日');
    expect(shortDay('2026-01-05')).toBe('1 月 5 日');
  });
});
