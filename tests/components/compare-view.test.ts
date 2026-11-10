// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CompareView from '@/views/CompareView.vue';
import { SEED_BOOKS } from '@/data/catalog.js';
import { makeTestRouter } from '../router-helper.js';

/**
 * F9 书籍对比的**边界**：这一页全靠 URL 参数驱动，所以异常路径全在参数上——
 * 一本都没选、只选一本、选的 id 不存在、直接塞四本、同一本塞两次。
 * 这些都不该白屏，也不该渲染出一张只有一列的表。
 */

async function mountAt(query: Record<string, string>) {
  const router = makeTestRouter();
  await router.push({ path: '/compare', query });
  await router.isReady();
  const w = mount(CompareView, { global: { plugins: [router] } });
  await flushPromises();
  return { router, w };
}

const ids = SEED_BOOKS.map((b) => b.book_id);
const [b1, b2, b3, b4] = ids;

describe('CompareView 参数边界', () => {
  it('一本都没选：给"至少要两本"的提示，不渲染空表', async () => {
    const { w } = await mountAt({});
    expect(w.find('.cmp-empty').exists()).toBe(true);
    expect(w.find('table').exists()).toBe(false);
  });

  it('只选一本：同样给提示（一列的表没有比较意义）', async () => {
    const { w } = await mountAt({ a: b1! });
    expect(w.find('.cmp-empty').exists()).toBe(true);
    expect(w.text()).toContain('至少要选两本');
  });

  it('两个 id 里有一个是编的：过滤掉不存在的，剩下不足两本 → 提示', async () => {
    const { w } = await mountAt({ a: b1!, b: 'book:does-not-exist' });
    expect(w.find('.cmp-empty').exists()).toBe(true);
    expect(w.find('table').exists()).toBe(false);
  });

  it('选了两本真实存在的书：表格两列、每行都有值', async () => {
    const { w } = await mountAt({ a: b1!, b: b2! });
    expect(w.find('table').exists()).toBe(true);
    expect(w.findAll('thead th')).toHaveLength(3); // 角标 + 两本书
    expect(w.findAll('tbody tr')).toHaveLength(9); // 7 项事实 + 共同能接住 + 只有它有
  });

  it('塞四本：只比前三本（多出来的不渲染，避免窄屏挤成一团）', async () => {
    const { w } = await mountAt({ a: b1!, b: b2!, c: b3!, d: b4! });
    expect(w.findAll('thead th')).toHaveLength(4); // 角标 + 三本
  });

  it('同一个 id 传两次：当前会渲染两列一样的（记录在案，见测试报告观察项）', async () => {
    const { w } = await mountAt({ a: b1!, b: b1! });
    expect(w.find('table').exists()).toBe(true);
    expect(w.findAll('thead th')).toHaveLength(3);
  });
});

describe('CompareView 共同标签', () => {
  it('有共同标签时列出来；没有时写「没有共同标签」，不留空单元格', async () => {
    // 从核心库里找一对真有交集的，找不到就说明标注数据变了，这条测试本身要重新看
    let pair: [string, string] | null = null;
    for (let i = 0; i < SEED_BOOKS.length && !pair; i += 1) {
      const a = new Set((SEED_BOOKS[i]!.problem_tags ?? []).map((t) => t.tag));
      for (let j = i + 1; j < SEED_BOOKS.length; j += 1) {
        if ((SEED_BOOKS[j]!.problem_tags ?? []).some((t) => a.has(t.tag))) {
          pair = [SEED_BOOKS[i]!.book_id, SEED_BOOKS[j]!.book_id];
          break;
        }
      }
    }
    expect(pair).not.toBeNull();

    const { w } = await mountAt({ a: pair![0], b: pair![1] });
    expect(w.findAll('.cmp-tag').length).toBeGreaterThan(0);
    expect(w.text()).not.toContain('没有共同标签');
  });

  it('两本没有任何共同标签：写着「没有共同标签」，而不是一格空白', async () => {
    let pair: [string, string] | null = null;
    for (let i = 0; i < SEED_BOOKS.length && !pair; i += 1) {
      const a = new Set((SEED_BOOKS[i]!.problem_tags ?? []).map((t) => t.tag));
      for (let j = i + 1; j < SEED_BOOKS.length; j += 1) {
        const b = SEED_BOOKS[j]!.problem_tags ?? [];
        if (b.length > 0 && b.every((t) => !a.has(t.tag))) {
          pair = [SEED_BOOKS[i]!.book_id, SEED_BOOKS[j]!.book_id];
          break;
        }
      }
    }
    if (!pair) return; // 核心库若人人有交集，这条不适用
    const { w } = await mountAt({ a: pair[0], b: pair[1] });
    expect(w.text()).toContain('没有共同标签');
  });
});
