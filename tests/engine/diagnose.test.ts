import { describe, expect, it } from 'vitest';
import type { ProblemTagId } from '@/contracts/enums.js';
import { NEED_TAG_LIMIT, buildDiagnosis, matchFreeText, userTagsOf } from '@/engine/diagnose.js';
import { hasCrisisSignal } from '@/engine/result.js';

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
  /**
   * 单位是 0–1，不是基点。书的 `problem_tags[].weight` 也是 0.1–1.0，
   * 打分时要做 `min(用户权重, 书权重)`——一边 6000 一边 0.9 会让 `primary_hit`
   * 恒等于 1~2 分（不报错、档位也看着正常），是这类 bug 最难查的形态。
   */
  it('第 2 屏三项按 0.60 / 0.25 / 0.15 取权', () => {
    const { userTags } = buildDiagnosis(base);
    expect(userTags.get('speaking-block')).toBe(0.6);
    expect(userTags.get('evaluation-anxiety')).toBe(0.25);
    expect(userTags.get('rumination')).toBe(0.15);
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
    expect(userTags.get('anxiety')).toBe(0.15);
  });

  it('自由文本把已有标签顶到 max(现有, 0.6)，不叠加', () => {
    const { userTags } = buildDiagnosis({
      ...base,
      tags: ['speaking-block', 'anxiety'],
      primary: 'speaking-block',
      free_text: '一发言就慌，总是担心搞砸',
    });
    // speaking-block 原是 0.6（主诉），max(0.6, 0.6) = 0.6
    expect(userTags.get('speaking-block')).toBe(0.6);
    // anxiety 原是 0.25（次诉），被自由文本顶到 0.6
    expect(userTags.get('anxiety')).toBe(0.6);
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

  /**
   * P0 回归：第 3 屏五个偏好与 free_text 必须落库。
   *
   * 曾经只写四个键，导致两个后果同时存在且都不报错：
   * ① 线上每个用户都按"第 3 屏全跳答"打分（problem 9200 / availability 800）；
   * ② `hasCrisisSignal` 读的 `free_text` 恒为 undefined —— 危机互斥从未生效。
   */
  it('第 3 屏偏好与自由文本必须原样落库', () => {
    const { diagnosis } = buildDiagnosis({
      ...base,
      time_budget: '10m',
      difficulty_pref: 'easy',
      urgency: '3w',
      form_pref: 'method',
      depth_pref: 'howto',
      free_text: '每次开会轮到我说话，脑子就一片空白',
    });
    expect(diagnosis.answers.time_budget).toBe('10m');
    expect(diagnosis.answers.difficulty_pref).toBe('easy');
    expect(diagnosis.answers.urgency).toBe('3w');
    expect(diagnosis.answers.form_pref).toBe('method');
    expect(diagnosis.answers.depth_pref).toBe('howto');
    expect(diagnosis.answers.free_text).toContain('一片空白');
  });

  it('危机词经 buildDiagnosis 落库后能被检出（P0-17 互斥的前提）', () => {
    const { diagnosis } = buildDiagnosis({ ...base, free_text: '我不想活了' });
    expect(hasCrisisSignal(diagnosis)).toBe(true);
  });

  it('打分侧 userTags 是 0–1，不是基点（否则 min(用户权重, 书权重) 会算错）', () => {
    const { userTags } = buildDiagnosis(base);
    for (const w of userTags.values()) expect(w).toBeLessThanOrEqual(1);
    expect(userTagsOf(buildDiagnosis(base).diagnosis).get(base.primary)).toBe(0.6);
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
