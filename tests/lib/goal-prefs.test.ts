/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GOAL_KEY, parseGoal, readGoal, saveGoal } from '@/lib/goal-prefs.js';

/**
 * 存档层只做一件事：把用户能看见、也能手改的那行 JSON 变成可信的目标。
 * 这里松一格，下游就会按错的周期算，而界面上写着另一个周期。
 */

afterEach(() => {
  localStorage.clear();
});

describe('parseGoal', () => {
  it('正常值原样读出', () => {
    expect(parseGoal('{"scope":"year","metric":"books","target":12}')).toEqual({
      scope: 'year',
      metric: 'books',
      target: 12,
    });
  });

  it('不认识的周期 / 指标一律当没设过 —— 否则会按错的周期算', () => {
    expect(parseGoal('{"scope":"weekly","metric":"books","target":5}')).toBeNull();
    expect(parseGoal('{"scope":"year","metric":"pages","target":5}')).toBeNull();
  });

  it('目标必须是正整数且在合理上限内', () => {
    expect(parseGoal('{"scope":"year","metric":"books","target":0}')).toBeNull();
    expect(parseGoal('{"scope":"year","metric":"books","target":-3}')).toBeNull();
    expect(parseGoal('{"scope":"year","metric":"books","target":100000}')).toBeNull();
    expect(parseGoal('{"scope":"year","metric":"books","target":"12"}')).toBeNull();
    // 小数不是脏数据，是同一个意思：四舍五入即可
    expect(parseGoal('{"scope":"year","metric":"books","target":12.4}')?.target).toBe(12);
  });

  it('坏 JSON / 空 / 非对象都返回 null，不抛', () => {
    expect(parseGoal('not json')).toBeNull();
    expect(parseGoal('null')).toBeNull();
    expect(parseGoal('[]')).toBeNull();
    expect(parseGoal('')).toBeNull();
    expect(parseGoal(null)).toBeNull();
  });
});

describe('读写', () => {
  it('存了再读是同一个目标', () => {
    saveGoal({ scope: 'month', metric: 'hours', target: 8 });
    expect(readGoal()).toEqual({ scope: 'month', metric: 'hours', target: 8 });
  });

  it('没设过 = null（界面显示"还没设目标"，而不是一个假的 0%）', () => {
    expect(readGoal()).toBeNull();
  });

  it('传 null 是"清除目标"，键一并删掉', () => {
    saveGoal({ scope: 'year', metric: 'books', target: 6 });
    saveGoal(null);
    expect(localStorage.getItem(GOAL_KEY)).toBeNull();
    expect(readGoal()).toBeNull();
  });
});
