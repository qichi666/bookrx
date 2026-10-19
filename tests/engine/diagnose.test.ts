import { describe, expect, it } from 'vitest';
import type { ProblemTagId } from '@/contracts/enums.js';
import { NEED_TAG_LIMIT, buildDiagnosis, matchFreeText } from '@/engine/diagnose.js';

/**
 * 诊断装配（SPEC §5.2.1 / NeedTag 契约注释）：
 * 权重 0.60 / 0.25 / 0.15；自由文本命中已有标签取 max(现有, 0.6) 不叠加；
 * 命中新标签给 0.15；need_tags ≤6 按权重截断；主诉必须显式。
 */

const base = {
  domain: 'work' as const,
  tags: ['speaking-block', 'evaluation-anxiety', 'rumination'] as ProblemTagId[],
  primary: 'speaking-block' as ProblemTagId,
};

describe('buildDiagnosis', () => {
  it('第 2 屏三项按 0.60 / 0.25 / 0.15 取权', () => {
    const { userTags } = buildDiagnosis(base);
    expect(userTags.get('speaking-block')).toBe(6000);
    expect(userTags.get('evaluation-anxiety')).toBe(2500);
    expect(userTags.get('rumination')).toBe(1500);
  });

  it('只选 1 项时 primary_source = single，无需追问', () => {
    const { diagnosis } = buildDiagnosis({
      ...base,
      tags: ['speaking-block'],
      primary: 'speaking-block',
    });
    expect(diagnosis.answers.primary_source).toBe('single');
  });

  it('多选但主诉不在所选内 → 抛错（不按顺序猜主诉）', () => {
    expect(() =>
      buildDiagnosis({ ...base, primary: 'low-mood' }),
    ).toThrow(/主诉/);
  });

  it('自由文本命中新标签给 0.15', () => {
    const { userTags } = buildDiagnosis({
      ...base,
      free_text: '最近总是焦虑，担心搞砸',
    });
    expect(userTags.get('anxiety')).toBe(1500);
  });

  it('自由文本把已有标签顶到 max(现有, 0.6)，不叠加', () => {
    const { userTags } = buildDiagnosis({
      ...base,
      tags: ['speaking-block', 'anxiety'],
      primary: 'speaking-block',
      free_text: '一发言就慌，总是担心搞砸',
    });
    // speaking-block 原是 0.6（主诉），max(0.6, 0.6) = 0.6
    expect(userTags.get('speaking-block')).toBe(6000);
    // anxiety 原是 0.25（次诉），被自由文本顶到 0.6
    expect(userTags.get('anxiety')).toBe(6000);
  });

  it('自由文本命中新标签给 0.15，user_phrase 保留命中片段', () => {
    const { diagnosis } = buildDiagnosis({
      ...base,
      free_text: '晚上老失眠',
    });
    const ft = diagnosis.need_tags.filter((n) => n.source === 'free_text');
    for (const n of ft) {
      expect(n.weight).toBe(0.15);
      expect(n.user_phrase.length).toBeGreaterThan(0);
    }
  });

  it('need_tags 超出 6 项按权重截断', () => {
    const { diagnosis } = buildDiagnosis({
      ...base,
      free_text:
        '焦虑 担心 低落 空虚 孤独 拖延 分心 纠结 年龄 失眠与发火以及拖延和纠结',
    });
    expect(diagnosis.need_tags.length).toBeLessThanOrEqual(NEED_TAG_LIMIT);
  });

  it('answers 不存派生值：没有 cap / target / 小时数', () => {
    const { diagnosis } = buildDiagnosis(base);
    const keys = Object.keys(diagnosis.answers);
    expect(keys).toEqual(
      expect.arrayContaining(['domain', 'problem_tags', 'primary_tag', 'primary_source']),
    );
    for (const k of keys) {
      expect(['difficulty_cap', 'readability_target', 'length_target', 'time_budget_hours']).not.toContain(k);
    }
  });
});

describe('matchFreeText', () => {
  it('逐字返回命中片段', () => {
    const hits = matchFreeText('每次开会轮到我说话，脑子就一片空白');
    const hit = hits.find((h) => h.tag === 'speaking-block');
    expect(hit?.phrase).toBe('一片空白');
  });

  it('没有命中就返回空列表，不造新标签', () => {
    expect(matchFreeText('今天天气不错')).toEqual([]);
  });
});
