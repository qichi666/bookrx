// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import ResultView from '@/views/ResultView.vue';

/**
 * P0-16「情绪与自我」域的危机资源条。
 *
 * 这份测试盯的是**边界**，不是它长什么样：
 *  ① 只有情绪域显示（别的域显示 = 把所有人都当成需要帮助的人）；
 *  ② 条内**不出现任何热线号码**（号码写死必然过期，过期比不展示更伤信任）；
 *  ③ 危机入口配额仍然恒为 1 —— 这条是替代那行小链接，不是叠加；
 *  ④ 命中危机信号时不显示（那时 CrisisPanel 已接管整页）。
 */

const KEY = 'bookrx.diagnosis.v1';

function dx(domain: 'emotion' | 'work', freeText?: string): Diagnosis {
  const { diagnosis } = buildDiagnosis({
    domain,
    tags: domain === 'emotion' ? ['low-mood', 'anxiety'] : ['speaking-block', 'evaluation-anxiety'],
    primary: domain === 'emotion' ? 'low-mood' : 'speaking-block',
    ...(freeText === undefined ? {} : { free_text: freeText }),
  });
  return diagnosis;
}

function mountWith(d: Diagnosis) {
  sessionStorage.setItem(KEY, JSON.stringify(d));
  return mount(ResultView);
}

function findBar(w: ReturnType<typeof mount>) {
  const bar = w.find('.crisis-bar');
  if (!bar.exists()) throw new Error('没有找到危机资源条 —— 扫描对象为空，属未验证');
  return bar;
}

beforeEach(() => sessionStorage.clear());

describe('情绪域的危机资源条（P0-16）', () => {
  it('情绪域显示，文案逐字是定稿那两句', () => {
    const w = mountWith(dx('emotion'));
    const bar = findBar(w);
    expect(bar.text()).toContain('如果你现在不太好过，读书可以先放一放。');
    expect(bar.text()).toContain('查看心理援助资源');
    expect(bar.text()).toContain('这里有可以立刻联系的心理援助资源');
  });

  it('条内不出现任何热线号码', () => {
    const bar = findBar(mountWith(dx('emotion')));
    const text = bar.text();
    for (const n of ['12356', '82951332', '400-161-9995', '010-']) {
      expect(text).not.toContain(n);
    }
    // 一个号码都没有：不能只挡住已知的三个
    expect(text).not.toMatch(/\d{4,}/);
  });

  it('链接指向本地资源页，且是站内路由', () => {
    const bar = findBar(mountWith(dx('emotion')));
    const a = bar.find('a');
    expect(a.attributes('href')).toBe('#/crisis');
  });

  it('危机入口仍恰好 1 个（用条替代了那行链接，不是叠加）', () => {
    const w = mountWith(dx('emotion'));
    expect(w.element.querySelectorAll('[data-crisis-entry]')).toHaveLength(1);
    expect(w.find('.crisis-bar').attributes('data-crisis-entry')).toBeDefined();
  });

  it('非情绪域不显示这条（只给这个域，不替所有人代言）', () => {
    const w = mountWith(dx('work'));
    expect(w.find('.crisis-bar').exists()).toBe(false);
    expect(w.text()).toContain('需要现在就和人说说话');
  });

  it('命中危机信号时让位给 CrisisPanel，不同时出现', () => {
    const w = mountWith(dx('emotion', '最近总想着不如死了算了'));
    expect(w.find('.crisis-bar').exists()).toBe(false);
    expect(w.text()).toContain('12356');
    expect(w.findAll('.book-card')).toHaveLength(0);
  });
});
