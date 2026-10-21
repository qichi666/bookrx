// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import { buildDiagnosis } from '@/engine/diagnose.js';

/**
 * P0-7 书籍详情页。
 *
 * 验收条件只有一条硬的（SPEC §2.1）：「可用性区块紧随书名，不放到页底」——
 * 用户点进来第一件事是"我能不能读到"，把它压到页底等于让人先读完理由再发现读不了。
 * 其余几条来自 PRD §9.1 / §9.4，都是措辞与能力一致性问题：
 *  · 三态动词不复用（阅读 / 自备 / 查看）；
 *  · 公版书必须标来源；
 *  · 措辞必须与**当前能力**一致：能不能说「可直接阅读」，只取决于 `READER_AVAILABLE`。
 */

const KEY = 'bookrx.diagnosis.v1';
let currentId = 'core:000013';

import { READER_AVAILABLE } from '@/data/capabilities.js';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: currentId } }),
  useRouter: () => ({ push: vi.fn() }),
}));

const { default: BookDetailView } = await import('@/views/BookDetailView.vue');

function mountDetail(id: string) {
  currentId = id;
  // 本文件把 vue-router 整个 mock 掉了（要固定 route.params.id），
  // 所以 RouterLink 不会由 app.use(router) 注册——不 stub 就只有控制台警告、
  // 而渲染出来的是空元素，任何依赖链接的断言都会静默失效。
  return mount(BookDetailView, {
    global: {
      stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' } },
    },
  });
}

function workDiagnosis(): Diagnosis {
  return buildDiagnosis({
    domain: 'work',
    tags: ['speaking-block', 'evaluation-anxiety'],
    primary: 'speaking-block',
  }).diagnosis;
}

beforeEach(() => sessionStorage.clear());

describe('书籍详情页', () => {
  it('公版书：可用性区块紧随书名，措辞与当前能力一致', () => {
    const w = mountDetail('core:000013'); // 围炉夜话
    expect(w.text()).toContain('围炉夜话');

    const html = w.html();
    const titleAt = html.indexOf('detail-title');
    const briefAt = html.indexOf('detail-brief');
    const availAt = html.indexOf('avail-block');
    expect(titleAt).toBeGreaterThan(-1);
    expect(briefAt).toBeGreaterThan(titleAt);
    expect(availAt).toBeGreaterThan(briefAt);

    const label = w.find('.avail-label').text();
    // 「可直接阅读」只在真能在这里打开时才允许出现。这条断言跟着能力开关走，
    // 所以将来无论哪一边变了（文案改了、或能力关了），测试都会立刻指出两边对不上。
    if (READER_AVAILABLE) {
      expect(label).toBe('可直接阅读');
      expect(w.text()).toContain('公版作品');
    } else {
      expect(label).toContain('公版');
      expect(label).not.toContain('可直接阅读');
      expect(w.html()).not.toContain('导入后就能读');
    }
  });

  it('公版书必须给出正文来源，且第一个链接就是它', () => {
    const w = mountDetail('core:000013');
    const links = w.findAll('.avail-links a');
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.text()).toBe('公版全文');
    expect(links[0]!.attributes('href')).toMatch(/^https?:\/\//);
    expect(links[0]!.attributes('rel')).toContain('noopener');
  });

  it('版权书：说清"本站不提供全文"并给合法途径，不暗示能在这里读', () => {
    const w = mountDetail('core:000001'); // 被讨厌的勇气
    expect(w.find('.avail-label').text()).toContain('需自备');
    expect(w.text()).toContain('本站不提供全文');
    expect(w.text()).toContain('公共图书馆');
  });

  it('书不存在：提示 + 回推荐，不白屏', () => {
    const w = mountDetail('core:999999');
    expect(w.text()).toContain('这本书不在这份书单里');
    expect(w.html()).toContain('#/result');
  });

  it('有诊断时：档位 + 命中依据（用户原词）+ 每句理由带来源徽章', () => {
    sessionStorage.setItem(KEY, JSON.stringify(workDiagnosis()));
    const w = mountDetail('core:000001');

    expect(w.find('.tier-block').exists()).toBe(true);
    expect(w.find('.tier-label').text()).toMatch(/契合|换个角度/);

    const chips = w.findAll('.hit-chip');
    expect(chips.length).toBeGreaterThan(0);
    // 命中依据是用户自己的原词，不是引擎生成的话
    expect(chips.map((c) => c.text()).join(' ')).toContain('发言');

    const sources = w.findAll('.reason-source').map((s) => s.text());
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(['书里写的', '你的回答', '书的标注']).toContain(s);
  });

  it('无诊断时退化成书目页：罗列事实，不假装知道用户是谁', () => {
    const w = mountDetail('core:000001');
    expect(w.find('.tier-block').exists()).toBe(false);
    expect(w.findAll('.hit-chip')).toHaveLength(0);
    expect(w.find('.reason-list').exists()).toBe(false);
    expect(w.text()).toContain('书目信息');
  });

  it('同主题最多 3 本，且都指回详情页', () => {
    const w = mountDetail('core:000001');
    const items = w.findAll('.related-list li');
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(3);
    for (const li of items) expect(li.find('a').attributes('href')).toMatch(/^#\/book\//);
  });
});
