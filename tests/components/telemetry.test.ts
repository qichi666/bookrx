// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { readCounters, recordResult, resetCounters } from '@/engine/telemetry.js';
import AboutView from '@/views/AboutView.vue';

/**
 * 本地计数三条铁律（SPEC §10.2 v2.2 裁决②）：
 * 永不上报（结构上没有出口）、自由文本不入计数、同一诊断只计一次。
 */

function workDiagnosis(): Diagnosis {
  const { diagnosis } = buildDiagnosis({
    domain: 'work',
    tags: ['speaking-block'],
    primary: 'speaking-block',
  });
  return diagnosis;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('telemetry', () => {
  it('计数累加：域 + 档位 + 总数', () => {
    recordResult(workDiagnosis(), ['strong', 'worth']);
    const c = readCounters();
    expect(c.total).toBe(1);
    expect(c.domain_counts['work']).toBe(1);
    expect(c.tier_counts['strong']).toBe(1);
    expect(c.tier_counts['worth']).toBe(1);
  });

  it('同一 diagnosis_id 只计一次（调参重算不重复累加）', () => {
    const d = workDiagnosis();
    recordResult(d, ['strong']);
    recordResult(d, ['worth']);
    const c = readCounters();
    expect(c.total).toBe(1);
    expect(c.tier_counts['worth']).toBeUndefined();
  });

  it('自由文本绝不入计数：存储里查不到原文', () => {
    const d = workDiagnosis();
    d.answers.free_text = '开会发言就很私密的一段原话';
    recordResult(d, ['strong']);
    const raw = localStorage.getItem('bookrx.counters.v1') ?? '';
    expect(raw).not.toContain('很私密');
  });

  it('清零后回到空计数', () => {
    recordResult(workDiagnosis(), ['strong']);
    resetCounters();
    expect(readCounters().total).toBe(0);
  });
});

describe('AboutView', () => {
  it('隐私声明三句话齐备，危机入口恰好 1 个', () => {
    const w = mount(AboutView);
    expect(w.text()).toContain('所有数据只存在你自己的浏览器里');
    expect(w.text()).toContain('我们看不到你');
    expect(w.element.querySelectorAll('[data-crisis-entry]')).toHaveLength(1);
  });

  it('有计数时展示聚合并给清零按钮', () => {
    recordResult(workDiagnosis(), ['strong']);
    const w = mount(AboutView);
    expect(w.text()).toContain('共 1 次诊断');
    expect(w.text()).toContain('工作与意义 · 1');
    expect(w.text()).toContain('清空这份计数');
  });
});
