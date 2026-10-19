// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';

/**
 * 全局导航头：任何页面都有出口（用户实测两次被困后立的规矩）。
 * 返回按钮非首页才显示；关于链接不在关于页显示；头部不得挂 data-crisis-entry。
 */

async function mountWith() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/about', component: { template: '<div>about</div>' } },
      { path: '/result', component: { template: '<div>result</div>' } },
    ],
  });
  // 先 mount（install 触发初始导航），再等导航落定——顺序反了 isReady 永远挂起
  const w = mount(AppHeader, { global: { plugins: [router] } });
  await router.isReady();
  await flushPromises();
  return { router, w };
}

describe('AppHeader', () => {
  it('首页：不显示返回按钮，显示品牌与「关于」', async () => {
    const { w } = await mountWith();
    expect(w.text()).not.toContain('返回');
    expect(w.text()).toContain('BookRx');
    expect(w.find('.nav-about').exists()).toBe(true);
  });

  it('关于页：显示返回、不显示「关于」；点返回回上一页', async () => {
    const { router, w } = await mountWith();
    await router.push('/about');
    await flushPromises();
    expect(w.find('.btn-back').exists()).toBe(true);
    expect(w.find('.nav-about').exists()).toBe(false);
    await w.find('.btn-back').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('无历史直接打开非首页：点返回兜底回首页', async () => {
    const { router, w } = await mountWith();
    // replace 不入历史栈；再把 state.back 抹掉 = 模拟「直接打开本页、无历史」
    await router.replace('/about');
    await flushPromises();
    window.history.replaceState({ back: null }, '', window.location.href);
    await w.find('.btn-back').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('品牌点击回首页', async () => {
    const { router, w } = await mountWith();
    await router.replace('/about');
    await flushPromises();
    await w.find('.brand').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('头部不挂 data-crisis-entry（全项目配额 = 2：结果页 + /about）', async () => {
    const { w } = await mountWith();
    expect(w.html()).not.toContain('data-crisis-entry');
  });
});
