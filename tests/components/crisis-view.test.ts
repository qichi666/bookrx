// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import CrisisView from '@/views/CrisisView.vue';

/**
 * 危机页两个不可破的行为：
 * ① 必须有返回出口——这一页的人随时想退回去，没出口等于把人困在门口（2026-10-19 用户实测踩坑）；
 * ② 渲染核对过的真实热线数据，不放空话。
 * 另外本页**不得**挂 data-crisis-entry（全项目配额 2 个：结果页 + /about）。
 */

function mountWith() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/crisis', name: 'crisis', component: CrisisView },
    ],
  });
  const w = mount(CrisisView, { global: { plugins: [router] } });
  return { router, w };
}

describe('CrisisView', () => {
  it('渲染核对过的热线清单（12356）与核实日期、来源链接', () => {
    const { w } = mountWith();
    expect(w.text()).toContain('12356');
    expect(w.text()).toContain('最近核实日期');
    expect(w.text()).toContain('120 / 110');
    // 每一条都要能看到"哪天核的、从哪核的"——只有全局一个日期说明不了号码来源
    const links = w.findAll('.crisis-source a');
    expect(links.length).toBe(3);
    expect(links[0]!.attributes('href')).toMatch(/^https?:\/\//);
    expect(w.findAll('.crisis-source')[0]!.text()).toContain('核实 20');
  });

  it('有返回按钮；无历史时点击回到首页', async () => {
    const { router, w } = mountWith();
    const back = w.findAll('button').find((b) => b.text().includes('返回'));
    expect(back).toBeDefined();
    await back!.trigger('click');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('本页不挂 data-crisis-entry（配额归结果页与 /about）', () => {
    const { w } = mountWith();
    expect(w.element.querySelectorAll('[data-crisis-entry]')).toHaveLength(0);
  });
});
