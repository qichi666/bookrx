// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import {
  clearFeedback,
  exportFeedbackJson,
  feedbackSummary,
  listFeedback,
  recordFeedback,
} from '@/engine/feedback.js';

/**
 * 本地轻反馈的**边界**，不是它的功能。
 *
 * 功能一句话就能说完（点一下、存一下、能导出）；值得用测试钉住的是边界：
 *  · 不存 `free_text` —— 用户的处境描述是敏感文本，连"本地存一份"都不必要；
 *  · 同一诊断只留最后一条 —— 否则"点了三次没用"看起来像三个人；
 *  · 有条数上限 —— localStorage 写满会静默失败，那比不存更糟（用户以为记下了）。
 */

function dx(id = 'dx:test', freeText?: string): Diagnosis {
  return {
    diagnosis_id: id,
    created_at: 0,
    answers: {
      domain: 'work',
      problem_tags: ['speaking-block'],
      primary_tag: 'speaking-block',
      primary_source: 'single',
      ...(freeText === undefined ? {} : { free_text: freeText }),
    },
    need_tags: [{ tag: 'speaking-block', weight: 0.6, source: 'option', user_phrase: '开会发言就紧张空白' }],
    include_heavy: false,
    excluded_book_ids: [],
  } as Diagnosis;
}

const tiers = { strong: 1, worth: 2, explore: 2 };

describe('本地反馈', () => {
  beforeEach(() => clearFeedback());

  it('记录里不含自由文本（连本地都不存）', () => {
    recordFeedback(dx('dx:1', '我妈一打电话我就烦'), tiers, 'useful');
    const raw = JSON.stringify(listFeedback());
    expect(raw).not.toContain('我妈');
    expect(raw).not.toContain('free_text');
    expect(raw).toContain('speaking-block');
  });

  it('同一诊断只留最后一条（改主意以最后一次为准）', () => {
    recordFeedback(dx('dx:1'), tiers, 'useful');
    recordFeedback(dx('dx:1'), tiers, 'not-useful');
    const list = listFeedback();
    expect(list).toHaveLength(1);
    expect(list[0]!.verdict).toBe('not-useful');
  });

  it('超过上限时丢最旧的，不会静默停在半截', () => {
    for (let i = 0; i < 205; i += 1) recordFeedback(dx(`dx:${i}`), tiers, 'useful');
    const list = listFeedback();
    expect(list.length).toBe(200);
    expect(list[0]!.diagnosis_id).toBe('dx:5');
  });

  it('导出的是合法 JSON，字段可读且不含自由文本', () => {
    recordFeedback(dx('dx:1'), tiers, 'useful');
    const text = exportFeedbackJson();
    const parsed = JSON.parse(text) as {
      count: number;
      note: string;
      entries: Array<Record<string, unknown>>;
    };
    expect(parsed.count).toBe(1);
    expect(parsed.entries[0]!.domain).toBe('work');
    expect(parsed.entries[0]!.verdict).toBe('useful');
    expect(text).not.toContain('free_text');
    expect(parsed.note).toContain('不含自由文本');
  });

  it('汇总只给计数，不做比率（3 条样本算不出百分比）', () => {
    recordFeedback(dx('dx:1'), tiers, 'useful');
    recordFeedback(dx('dx:2'), tiers, 'not-useful');
    expect(feedbackSummary()).toEqual({ total: 2, useful: 1 });
  });
});
