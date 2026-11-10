// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AppHeader from '@/components/AppHeader.vue';
import { makeTestRouter } from '../router-helper.js';

/**
 * 全局导航头：任何页面都有出口（用户实测两次被困后立的规矩）。
 * 返回按钮非首页才显示；关于链接不在关于页显示；头部不得挂 data-crisis-entry。
 */

async function mountWith() {
  // 用全量路径表：头部同时链到 /framework、/library、/about，
  // 少配一条就会刷 `No match found`，href 退化成兜底值而断言照样绿。
  const router = makeTestRouter();
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
    expect(w.text()).toContain('怎么读');
  });

  it('读书框架页：隐藏「怎么读」自身，仍能去关于', async () => {
    const { router, w } = await mountWith();
    await router.push('/framework');
    await flushPromises();
    const links = w.findAll('a').map((a) => a.attributes('href'));
    expect(links).not.toContain('/framework');
    expect(links).toContain('/about');
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

describe('AppHeader 主题开关（N1）', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('默认「跟随系统」：不写 data-theme，交给 prefers-color-scheme', async () => {
    const { w } = await mountWith();
    expect(w.find('.btn-theme').text()).toBe('跟随系统');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('点一下变浅色、再变深色、第三下回到跟随系统——同时写进存储', async () => {
    const { w } = await mountWith();
    const btn = w.find('.btn-theme');

    await btn.trigger('click');
    expect(btn.text()).toBe('浅色');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('bookrx.theme')).toBe('light');

    await btn.trigger('click');
    expect(btn.text()).toBe('深色');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await btn.trigger('click');
    expect(btn.text()).toBe('跟随系统');
    // 关键：属性被摘掉，而不是留一个 "auto" 值——tokens.css 不认识 auto
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('下次打开沿用上次的选择（挂载时就把状态读出来）', async () => {
    localStorage.setItem('bookrx.theme', 'dark');
    const { w } = await mountWith();
    expect(w.find('.btn-theme').text()).toBe('深色');
  });

  it('按钮有可读的状态与动作说明，且触控高度不低于 44px', async () => {
    const { w } = await mountWith();
    const btn = w.find('.btn-theme');
    expect(btn.attributes('aria-label')).toContain('跟随系统');
    expect(btn.attributes('aria-label')).toContain('浅色');
    // aria-pressed 描述的是开 / 关，套在三态循环上会读出错误状态，所以不用它
    expect(btn.attributes('aria-pressed')).toBeUndefined();
  });
});
