// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { BookId } from '@/contracts/enums.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import ResultView from '@/views/ResultView.vue';
import { makeTestRouter } from '../router-helper.js';

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
  return mount(ResultView, { global: { plugins: [makeTestRouter()] } });
}

function findBtn(w: ReturnType<typeof mount>, text: string) {
  const btn = w.findAll('button').find((b) => b.text().trim() === text);
  if (!btn) throw new Error(`找不到按钮「${text}」—— 扫描对象为空，属未验证`);
  return btn;
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

  it('调参：选「越轻松越好」后，卡片全是轻松档（即时重算，不持久化）', async () => {
    const w = mountWith(workDiagnosis());
    await findBtn(w, '越轻松越好').trigger('click');
    const metas = w.findAll('.meta-line');
    expect(metas.length).toBeGreaterThan(0);
    for (const m of metas) expect(m.text()).toContain('轻松');
    expect(w.text()).not.toContain('硬核');
    // 不持久化：sessionStorage 里的诊断未被改写
    const saved = JSON.parse(sessionStorage.getItem(KEY)!) as Diagnosis;
    expect(saved.answers.difficulty_pref).toBeUndefined();
  });
});
