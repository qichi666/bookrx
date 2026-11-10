import { describe, expect, it } from 'vitest';
import {
  FREEZE_BUDGET,
  bucketSessions,
  computeStreak,
  dayNumber,
  humanDuration,
  isoOfDay,
  lastDays,
} from '@/domain/stats.js';

/**
 * F7 统计的纯逻辑（此前无直接用例）。
 *
 * 为什么这一组最值得测：连续天数**差一天不会报错**，只会让用户看到
 * 「我明明读了」却显示断了；而柱状图的横轴如果缺一天/多一天，
 * 页面照样渲染，只是每个柱子的日期都错位。两类错都得靠固定日期锁死。
 */

const d = (n: number, base = '2026-11-10'): string => isoOfDay(dayNumber(base) - n);

describe('dayNumber / isoOfDay', () => {
  it('1970-01-01 是第 0 天，前后一天不跳号', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('1969-12-31')).toBe(-1);
  });

  it('互逆：任意一天转成序号再转回来，逐字相同', () => {
    const samples = ['1970-01-01', '1999-12-31', '2000-02-29', '2024-02-29', '2026-11-10', '2100-03-01'];
    for (const s of samples) expect(isoOfDay(dayNumber(s))).toBe(s);
  });

  it('闰年 2 月 29 日与平年 3 月 1 日相邻（差 1 天，不重不漏）', () => {
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-29')).toBe(1);
    expect(dayNumber('2023-03-01') - dayNumber('2023-02-28')).toBe(1);
  });

  it('跨年边界连续：12-31 与次年 01-01 差 1 天', () => {
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1);
  });

  it('不是日期的输入不参与计算，也不抛异常', () => {
    // 已知缺陷（见 docs/全功能测试报告-2026-11-10.md 问题 2）：
    // `Number('')` 是 0，所以空串会被当成一个"远古日期"收进集合，而不是被判为脏数据。
    // 这里先钉住**期望**行为；修好后这条会变红，提醒把 it.fails 改成 it。
    expect(Number.isNaN(dayNumber('not-a-date'))).toBe(true);
  });

  it.fails('空串应判为脏数据（已知缺陷 2：目前被当成合法日期）', () => {
    expect(Number.isNaN(dayNumber(''))).toBe(true);
  });
});

describe('computeStreak', () => {
  it('连续三天：今天有记录，active_today 为 true', () => {
    const r = computeStreak([d(2), d(1), d(0)], d(0));
    expect(r.days).toBe(3);
    expect(r.active_today).toBe(true);
  });

  /**
   * 已知缺陷 1（见 docs/全功能测试报告-2026-11-10.md）：
   * 循环一碰到缺口就 `freezes += 1`，**在确认缺口后面还有没有记录之前**就记了账。
   * 于是"三天全勤、之后什么都没读"也会显示"已用 1 次冻结"——
   * 而冻结额度是产品明确承诺给用户的东西，虚报一次就等于额度少一次。
   * 下面三条用 `it.fails` 钉住**期望**行为：修好后它们会变红，提醒改回 `it`。
   */
  it.fails('连续三天不该记成"用掉 1 次冻结"（已知缺陷 1）', () => {
    expect(computeStreak([d(2), d(1), d(0)], d(0)).freezes_used).toBe(0);
  });

  it('今天还没读不算断：从昨天往回数，active_today 为 false', () => {
    const r = computeStreak([d(2), d(1)], d(0));
    expect(r.days).toBe(2);
    expect(r.active_today).toBe(false);
  });

  it('同一天多条会话只算一天', () => {
    const r = computeStreak([d(0), d(0), d(0)], d(0));
    expect(r.days).toBe(1);
  });

  it('漏一天用冻结补上：连续天数确实接上了', () => {
    const r = computeStreak([d(0), d(2), d(3)], d(0));
    expect(r.days).toBe(3);
  });

  it.fails('漏一天只该记 1 次冻结，不该把结尾的缺口也记上（已知缺陷 1）', () => {
    // 现状是 2：中间真正补上的 1 次 + 结尾那段没救到任何东西的缺口
    expect(computeStreak([d(0), d(2), d(3)], d(0)).freezes_used).toBe(1);
  });

  it('连漏两天就停：冻结只补"漏了一天"，不补"消失了两周"', () => {
    const r = computeStreak([d(0), d(3), d(4), d(5)], d(0));
    expect(r.days).toBe(1);
  });

  it.fails('连续已经断了就不该报"用掉冻结"（已知缺陷 1）', () => {
    expect(computeStreak([d(0), d(3), d(4), d(5)], d(0)).freezes_used).toBe(0);
  });

  it('冻结额度用尽后即使只漏一天也停', () => {
    // 今天、-2、-4 三天有记录：中间两次各漏一天，正好用掉 2 次额度
    const ok = computeStreak([d(0), d(2), d(4)], d(0));
    expect(ok.days).toBe(3);
    expect(ok.freezes_used).toBe(FREEZE_BUDGET);

    // 再来一个 -6：第三次漏天，额度已尽
    const stopped = computeStreak([d(0), d(2), d(4), d(6)], d(0));
    expect(stopped.days).toBe(3);
    expect(stopped.freezes_used).toBe(FREEZE_BUDGET);
  });

  it('额度可配成 0：漏一天立刻停，行为与预算一致', () => {
    const r = computeStreak([d(0), d(2), d(3)], d(0), 0);
    expect(r.days).toBe(1);
    expect(r.freezes_used).toBe(0);
  });

  it('今天和昨天都没记录：从最近一次有记录那天重新起算，不显示 0', () => {
    const r = computeStreak([d(3), d(4), d(5)], d(0));
    expect(r.days).toBe(3);
    expect(r.active_today).toBe(false);
  });

  it('空记录 / 全是脏日期 / 今天不合法 → 0，不抛', () => {
    expect(computeStreak([], d(0))).toEqual({ days: 0, freezes_used: 0, active_today: false });
    expect(computeStreak(['', 'x', '2026-13-40'], d(0)).days).toBe(0);
    expect(computeStreak([d(0)], '').days).toBe(0);
  });

  it('未来日期不参与计算（不该把明天的记录算成今天在读）', () => {
    const r = computeStreak([d(-1), d(0)], d(0));
    expect(r.days).toBe(1);
    expect(r.active_today).toBe(true);
  });
});

describe('bucketSessions', () => {
  it('同一天合并成一条，时长累加、会话数累加', () => {
    const out = bucketSessions([
      { day: '2026-11-09', duration_ms: 60_000 },
      { day: '2026-11-09', duration_ms: 30_000 },
    ]);
    expect(out).toEqual([{ day: '2026-11-09', duration_ms: 90_000, session_count: 2 }]);
  });

  it('按日期升序输出，与输入顺序无关', () => {
    const out = bucketSessions([
      { day: '2026-11-10', duration_ms: 1 },
      { day: '2026-11-08', duration_ms: 1 },
      { day: '2026-11-09', duration_ms: 1 },
    ]);
    expect(out.map((b) => b.day)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
  });

  it('负时长被夹到 0：脏数据不该把总时长扣成负数', () => {
    const out = bucketSessions([{ day: '2026-11-09', duration_ms: -5_000 }]);
    expect(out[0]!.duration_ms).toBe(0);
  });

  it('空输入给空数组（不是一条 0）', () => {
    expect(bucketSessions([])).toEqual([]);
  });
});

describe('lastDays', () => {
  it('补零：没有记录的天也在，横轴连续', () => {
    const buckets = bucketSessions([{ day: d(1), duration_ms: 60_000 }]);
    const out = lastDays(buckets, d(0), 3);
    expect(out.map((b) => b.day)).toEqual([d(2), d(1), d(0)]);
    expect(out.map((b) => b.duration_ms)).toEqual([0, 60_000, 0]);
  });

  it('最后一项是今天，顺序从旧到新', () => {
    const out = lastDays([], d(0), 7);
    expect(out).toHaveLength(7);
    expect(out[6]!.day).toBe(d(0));
    expect(out[0]!.day).toBe(d(6));
  });

  it('跨月跨年同样连续', () => {
    const out = lastDays([], '2027-01-02', 4);
    expect(out.map((b) => b.day)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('span=1 就只要今天；span=0 给空数组', () => {
    expect(lastDays([], d(0), 1).map((b) => b.day)).toEqual([d(0)]);
    expect(lastDays([], d(0), 0)).toEqual([]);
  });
});

describe('humanDuration', () => {
  it('按人类说法分档：不到一分钟 / 分钟 / 整小时 / 时分', () => {
    expect(humanDuration(30_000)).toBe('不到 1 分钟');
    expect(humanDuration(60_000)).toBe('1 分钟');
    expect(humanDuration(20 * 60_000)).toBe('20 分钟');
    expect(humanDuration(3 * 3_600_000)).toBe('3 小时');
    expect(humanDuration(3 * 3_600_000 + 20 * 60_000)).toBe('3 小时 20 分');
  });

  it('0 / 负数 / NaN / Infinity 都是「0 分钟」，不出现 NaN 分钟', () => {
    expect(humanDuration(0)).toBe('0 分钟');
    expect(humanDuration(-1)).toBe('0 分钟');
    expect(humanDuration(Number.NaN)).toBe('0 分钟');
    expect(humanDuration(Number.POSITIVE_INFINITY)).toBe('0 分钟');
  });
});
