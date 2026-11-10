// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import GoalCard from '@/components/stats/GoalCard.vue';
import { GOAL_KEY } from '@/lib/goal-prefs.js';

/**
 * 目标卡片的界面契约。
 *
 * 这里测的不是像素，是三句**不能写错的话**：
 *  ① 没设过目标时不给一个 0% 的空进度条，直接让填；
 *  ② 落后时的措辞是"还差 N 本，还有 M 天"，不是"你落后了"；
 *  ③ 改目标的说明必须写明会重算整个周期——否则用户会以为从今天起算。
 */

const TODAY = '2026-11-10';

function mountCard(opts: { sessions?: { day: string; duration_ms: number }[]; finishedDays?: string[] } = {}) {
  return mount(GoalCard, {
    props: { sessions: opts.sessions ?? [], finishedDays: opts.finishedDays ?? [], today: TODAY },
  });
}

afterEach(() => {
  localStorage.clear();
});

describe('没设过目标', () => {
  it('直接展开表单，不画空进度条', () => {
    const w = mountCard();
    expect(w.find('form').exists()).toBe(true);
    expect(w.find('[role="progressbar"]').exists()).toBe(false);
    expect(w.text()).toContain('没设过也没关系');
  });

  it('填一个数并保存：立刻变成进度视图，并写进本机存储', async () => {
    const w = mountCard();
    await w.find('input[type="number"]').setValue(6);
    await w.find('form').trigger('submit');

    expect(JSON.parse(localStorage.getItem(GOAL_KEY) ?? '{}')).toEqual({
      scope: 'year',
      metric: 'books',
      target: 6,
    });
    expect(w.find('form').exists()).toBe(false);
    expect(w.text()).toContain('/ 6 本');
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
  });

  it('填 0 或负数不写存储，并当场说明原因', async () => {
    const w = mountCard();
    await w.find('input[type="number"]').setValue(0);
    await w.find('form').trigger('submit');
    expect(localStorage.getItem(GOAL_KEY)).toBeNull();
    expect(w.text()).toContain('大于 0');
  });
});

describe('已经有目标', () => {
  it('挂载就读出存档：周期、已完成、还差多少', () => {
    localStorage.setItem(GOAL_KEY, JSON.stringify({ scope: 'year', metric: 'books', target: 12 }));
    const w = mountCard({ finishedDays: ['2026-02-01', '2026-05-01', '2026-09-01'] });
    expect(w.text()).toContain('2026 年');
    expect(w.text()).toContain('/ 12 本');
    expect(w.text()).toContain('还差 9 本');
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('25');
  });

  it('落后时只陈述差多少与还剩几天，不说"落后"', () => {
    localStorage.setItem(GOAL_KEY, JSON.stringify({ scope: 'year', metric: 'books', target: 60 }));
    const w = mountCard({ finishedDays: ['2026-01-05'] });
    expect(w.text()).toContain('还差 59 本');
    expect(w.text()).not.toContain('落后');
  });

  it('达成时只写"已达成"，不劝他加码', () => {
    localStorage.setItem(GOAL_KEY, JSON.stringify({ scope: 'year', metric: 'books', target: 2 }));
    const w = mountCard({ finishedDays: ['2026-01-01', '2026-02-01'] });
    expect(w.text()).toContain('已达成');
    expect(w.text()).not.toContain('还差');
  });

  it('时长目标按小时显示，且沿用存档里的周期与指标', () => {
    localStorage.setItem(GOAL_KEY, JSON.stringify({ scope: 'month', metric: 'hours', target: 10 }));
    const w = mountCard({ sessions: [{ day: '2026-11-02', duration_ms: 5_400_000 }] });
    expect(w.text()).toContain('2026 年 11 月');
    expect(w.text()).toContain('1.5');
    expect(w.text()).toContain('小时');
  });
});

describe('改目标与清除', () => {
  it('改目标页写明"会重算整个周期"，不写"从今天起算"', async () => {
    localStorage.setItem(GOAL_KEY, JSON.stringify({ scope: 'year', metric: 'books', target: 12 }));
    const w = mountCard();
    await w.find('.goal-actions .g-btn').trigger('click');
    expect(w.text()).toContain('重算整个周期');
    expect(w.text()).not.toContain('从今天起算');
  });

  it('清除目标：删掉存储并回到表单，书架不受影响', async () => {
    localStorage.setItem(GOAL_KEY, JSON.stringify({ scope: 'year', metric: 'books', target: 12 }));
    const w = mountCard();
    await w.find('.goal-actions .g-btn').trigger('click');
    await w.find('.g-quiet').trigger('click');
    expect(localStorage.getItem(GOAL_KEY)).toBeNull();
    expect(w.find('form').exists()).toBe(true);
  });
});
