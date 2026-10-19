// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import ResultView from '@/views/ResultView.vue';
import AboutView from '@/views/AboutView.vue';

/**
 * 危机入口门禁 · 层 1（PLAN M0-14）。
 *
 * **这一层没写测试就等于没跑** —— 只在文档里写"结果页与 /about 各一个入口"
 * 不算验证：文档不会阻止某天有人再加一个，也不会阻止入口被误删。
 * 所以这里**数真实 DOM 节点**，不是 grep 模板字符串。
 *
 * 三态：挂载后一个节点都没有 = 未验证，不得报"通过"。
 */

function countEntries(component: Parameters<typeof mount>[0]): number {
  const w = mount(component);
  try {
    return w.element.querySelectorAll('[data-crisis-entry]').length;
  } finally {
    w.unmount();
  }
}

const CRISIS_ENTRY_TOTAL = 2;

function assertExactlyTwo(components: Parameters<typeof mount>[0][]): void {
  const counts = components.map(countEntries);
  if (counts.some((n) => n === 0)) {
    throw new Error(`有视图一个入口都没有（${counts.join(', ')}）—— 扫描对象为空，属未验证`);
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (total !== CRISIS_ENTRY_TOTAL) {
    throw new Error(`危机入口共 ${total} 个，预期 ${CRISIS_ENTRY_TOTAL} 个（${counts.join(' + ')}）`);
  }
}

describe('危机入口数量', () => {
  it('结果页与 /about 各 1 个，共 2 个', () => {
    expect(countEntries(ResultView)).toBe(1);
    expect(countEntries(AboutView)).toBe(1);
    expect(() => assertExactlyTwo([ResultView, AboutView])).not.toThrow();
  });

  it('多一个入口的 fixture 必须 fail', () => {
    const Extra = defineComponent({
      name: 'ExtraEntry',
      render() {
        return h('div', [
          h('a', { 'data-crisis-entry': '' }),
          h('a', { 'data-crisis-entry': '' }),
        ]);
      },
    });
    expect(() => assertExactlyTwo([ResultView, AboutView, Extra])).toThrow(/共 4 个/);
  });

  it('入口被删掉的 fixture 报未验证，不得静默通过', () => {
    const Empty = defineComponent({ name: 'Empty', render: () => h('div') });
    expect(() => assertExactlyTwo([ResultView, Empty])).toThrow(/未验证/);
  });
});
