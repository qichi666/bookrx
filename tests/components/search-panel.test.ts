// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { saveDiagnosis } from '@/engine/session.js';
import { searchQuestion } from '@/engine/search.js';
import { readCounters, recordResult } from '@/engine/telemetry.js';
import { resetCandidateCacheForTests } from '@/data/candidates.js';
import { vi } from 'vitest';
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
  await flushPromises(); // submit 现在是 async（要等外围书库），断言前必须等它落定
}

describe('SearchPanel', () => {
  // fetch 默认已由 tests/setup.ts 桩成「书目层不可用」（不发真请求）；
  // 这里只需清掉模块级缓存，避免上一个用例的 stub 数据泄漏到下一个。
  beforeEach(() => {
    resetCandidateCacheForTests();
  });

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

  it('外围书库命中：显示「未入库」卡片，不跳转、不算契合', async () => {
    const books = [
      {
        id: '999',
        title: '冷门沟通书',
        subtitle: '',
        authors: ['某作者'],
        publisher: '某出版社',
        year: 2019,
        q: 0.82,
        bucket: 'high',
        votes: 1200,
        tags: ['沟通'],
        domains: ['relationship'],
        url: 'https://book.douban.com/subject/999/',
      },
    ];
    vi.stubGlobal('fetch', async (url: string) => {
      const body = String(url).endsWith('index.json')
        ? { all_file: 'all.json', total: 1, by_domain: { relationship: 1 }, generated_at: '2026-10-19', source_sha256: 'x' }
        : books;
      return { ok: true, json: async () => body };
    });
    const { router, w } = mountWith();
    await search(w, '冷门沟通');
    expect(w.text()).toContain('外围书库里还有');
    expect(w.text()).toContain('未入库');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('全 0：库内没找到 → 外链兜底文案', async () => {
    const { w } = mountWith();
    await search(w, 'zzzz不存在zzzz');
    expect(w.text()).toContain('库里没找到');
    expect(w.text()).toContain('豆瓣');
    expect(w.text()).toContain('OpenLibrary');
  });

  it('空输入：按钮置灰，回车提交也不清掉上一次的结果', async () => {
    const { w } = mountWith();
    await search(w, '非暴力');
    expect(w.text()).toContain('非暴力沟通');
    await w.find('input').setValue('   ');
    const btn = w.find('button[type="submit"]').element as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await w.find('form').trigger('submit'); // 回车走的就是这条隐式提交
    await flushPromises();
    expect(w.text()).toContain('非暴力沟通');
  });

  it('近似命中要说「差一个字」，不让它冒充精确结果', async () => {
    const { w } = mountWith();
    await search(w, '被讨厌勇气');
    expect(w.text()).toContain('被讨厌的勇气');
    expect(w.text()).toContain('差一个字');
  });

  it('外围结果说明命中原因：副标题命中时把原文片段贴出来', async () => {
    const books = [
      {
        id: '777',
        title: '游戏力',
        subtitle: '笑声，激活孩子天性中的合作与勇气',
        authors: ['劳伦斯·科恩'],
        publisher: '中信出版社',
        year: 2017,
        q: 0.8,
        bucket: 'high',
        votes: 3000,
        tags: ['亲子'],
        domains: ['relationship'],
        url: 'https://book.douban.com/subject/777/',
      },
    ];
    vi.stubGlobal('fetch', async (url: string) => {
      const body = String(url).endsWith('index.json')
        ? { all_file: 'all.json', total: 1, by_domain: { relationship: 1 }, generated_at: '2026-10-19', source_sha256: 'x' }
        : books;
      return { ok: true, json: async () => body };
    });
    const { w } = mountWith();
    await search(w, '勇气');
    expect(w.text()).toContain('副标题');
    expect(w.text()).toContain('合作与勇气');
    expect(w.text()).toContain('未入库');
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
