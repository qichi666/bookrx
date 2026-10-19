// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FrameworkView from '@/views/FrameworkView.vue';

/**
 * 读书框架页：三阶段 + 三类书 + 三列表。
 * 这几块是「有实际内容」的证明——不是占位页。
 */

describe('FrameworkView', () => {
  const w = mount(FrameworkView);

  it('三阶段齐全：开读前 / 读中 / 读后', () => {
    expect(w.text()).toContain('开读前');
    expect(w.text()).toContain('读中');
    expect(w.text()).toContain('读后');
    expect(w.findAll('.stage').length).toBe(3);
  });

  it('三类书读法齐全，且各有「常见的坑」', () => {
    expect(w.findAll('.kind').length).toBe(3);
    expect(w.text()).toContain('实用类');
    expect(w.text()).toContain('心理类');
    expect(w.text()).toContain('经典');
    expect(w.findAll('.pitfall').length).toBe(3);
  });

  it('个人读书框架三列表：三列表头 + 一行示例', () => {
    const heads = w.findAll('.notebook th').map((h) => h.text());
    expect(heads).toEqual(['我要解决的问题', '读的书', '一张卡片（观点 / 证据 / 我的动作）']);
    expect(w.findAll('.notebook tbody tr').length).toBe(1);
  });

  it('页内有回问卷与关于的出口', () => {
    const hrefs = w.findAll('a').map((a) => a.attributes('href'));
    expect(hrefs).toContain('#/');
    expect(hrefs).toContain('#/about');
  });
});
