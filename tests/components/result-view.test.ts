// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { BookId } from '@/contracts/enums.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import ResultView from '@/views/ResultView.vue';

/**
 * 结果页三条不可妥协的呈现规则（真实 DOM）：
 * ① 原词逐字回显；② 危机资源条与推荐互斥（P0-17）；
 * ③ L4 空结果不凑数 + 库外卡必标「未入库」。
 */

const KEY = 'bookrx.diagnosis.v1';

function workDiagnosis(): Diagnosis {
  const { diagnosis } = buildDiagnosis({
    domain: 'work',
    tags: ['speaking-block', 'evaluation-anxiety'],
    primary: 'speaking-block',
  });
  return diagnosis;
}

function mountWith(d: Diagnosis | null) {
  if (d) sessionStorage.setItem(KEY, JSON.stringify(d));
  else sessionStorage.removeItem(KEY);
  return mount(ResultView);
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('ResultView', () => {
  it('无诊断记录时引导回问卷，不渲染卡片', () => {
    const w = mountWith(null);
    expect(w.text()).toContain('还没有诊断记录');
    expect(w.text()).not.toContain('高度契合');
  });

  it('诊断摘要条逐字回显原词，并渲染推荐组', () => {
    const w = mountWith(workDiagnosis());
    expect(w.text()).toContain('开会发言就紧张空白');
    expect(w.text()).toContain('你正在面对（工作与意义）');
    // 三组结构存在；至少有一个组有卡片
    const cards = w.findAll('.book-card');
    expect(cards.length).toBeGreaterThan(0);
    expect(w.text()).not.toContain('未入库');
  });

  it('危机信号 → 只给资源、不给推荐（互斥）', () => {
    const d = workDiagnosis();
    d.answers.free_text = '撑不住了，想过自杀';
    const w = mountWith(d);
    expect(w.text()).toContain('12356');
    expect(w.findAll('.book-card')).toHaveLength(0);
    expect(w.text()).not.toContain('高度契合');
  });

  it('L4：全部书目被排除 → 「这些都不对」+ 库外卡标「未入库」', () => {
    const d = workDiagnosis();
    d.excluded_book_ids = SEED_BOOKS.map((b) => b.book_id) as BookId[];
    const w = mountWith(d);
    expect(w.text()).toContain('这些都不对');
    const badges = w.findAll('.external-badge');
    expect(badges.length).toBeGreaterThan(0);
    for (const b of badges) expect(b.text()).toBe('未入库');
  });

  it('危机入口恰好 1 个（全项目配额的一半，另一半在 /about）', () => {
    const w = mountWith(workDiagnosis());
    expect(w.element.querySelectorAll('[data-crisis-entry]')).toHaveLength(1);
  });
});
