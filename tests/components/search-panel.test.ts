// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { saveDiagnosis } from '@/engine/session.js';
import { searchQuestion } from '@/engine/search.js';
import { readCounters, recordResult } from '@/engine/telemetry.js';
import SearchPanel from '@/components/SearchPanel.vue';

/**
 * 搜索面板三分流（真实 DOM + 真路由）：
 * ① 书命中就地展示；② 0 书命中且问题命中 → 跳结果页；③ 全 0 → 外链兜底。
 */

function mountWith() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/result', component: { template: '<div>result</div>' } },
    ],
  });
  const w = mount(SearchPanel, { global: { plugins: [router] } });
  return { router, w };
}

async function search(w: ReturnType<typeof mount>, text: string): Promise<void> {
  await w.find('input').setValue(text);
  await w.find('form').trigger('submit');
}

describe('SearchPanel', () => {
  it('书命中：就地展示书卡，不跳转', async () => {
    const { router, w } = mountWith();
    await search(w, '非暴力');
    expect(w.text()).toContain('非暴力沟通');
    expect(w.text()).toContain('找到了这些书');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('双命中：书优先展示 + 「按你的问题推荐」切换按钮', async () => {
    const { w } = mountWith();
    // 「判断」是真双命中：既是《思考，快与慢》简介里的词（keyword 字段命中），
    // 也是 judgment-distortion 的词典关键词（问题检索命中）。
    await search(w, '判断');
    expect(w.text()).toContain('找到了这些书');
    expect(w.text()).toContain('想按你的问题推荐');
  });

  it('问题命中且无书命中 → 跳结果页（dxs 诊断已存，不进计数）', async () => {
    const { router, w } = mountWith();
    await search(w, '每次开会轮到我说话，脑子就一片空白');
    await flushPromises(); // router.push 是异步导航管线，等它落定再断言
    expect(router.currentRoute.value.path).toBe('/result');
    expect(readCounters().total).toBe(0);
  });

  it('全 0：库内没找到 → 外链兜底文案', async () => {
    const { w } = mountWith();
    await search(w, 'zzzz不存在zzzz');
    expect(w.text()).toContain('库里没找到');
    expect(w.text()).toContain('豆瓣');
    expect(w.text()).toContain('OpenLibrary');
  });
});

describe('搜索诊断不进本地计数', () => {
  it('dxs: 前缀被 recordResult 跳过', () => {
    const d = searchQuestion('开会发言空白')!;
    expect(d.diagnosis_id.startsWith('dxs:')).toBe(true);
    saveDiagnosis(d);
    recordResult(d, ['strong']);
    expect(readCounters().total).toBe(0);
  });
});
