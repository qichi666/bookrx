import { describe, expect, it } from 'vitest';
// @ts-expect-error —— 纯 JS 工具，无类型声明；测的是它的运行时行为
import { validate } from '../../tools/annotate-books.mjs';

/**
 * 标注通道的证据闸：**模型给的每一句引文必须在原文里逐字存在。**
 *
 * 这条闸是整个千级通道唯一的反幻觉手段。不采信模型自报的 confidence——
 * 那个数字没法被证伪；"这句话在不在原文里"可以，而且一查就知道。
 *
 * 两头都要测：
 *  ① 改写一个字的引文必须被丢掉（这是模型最常见的失败方式，肉眼看不出）；
 *  ② 原文里真有的引文不许误伤。
 *
 * 另外三条规矩也在这里守：词表外的标签、超长引文、超过 top_n。
 */
const LEX = {
  top_n: 3,
  tags: {
    anxiety: { label: '焦虑与担忧', keywords: ['焦虑'] },
    'low-mood': { label: '持续情绪低落', keywords: ['低落'] },
    'big-choice': { label: '重大人生选择', keywords: ['选择'] },
    burnout: { label: '倦怠', keywords: ['倦怠'] },
  },
};

const INTRO =
  '这本书讲的是一个长期焦虑的人如何一点点把生活找回来。作者用大量案例说明，' +
  '焦虑并不是要被消灭的东西，而是需要被听见的信号。最后一部分谈到重大人生选择时的心态。';

const j = (tags: unknown[]): string => JSON.stringify({ tags });
const ev = (tag: string, evidence: string): { tag: string; evidence: string } => ({ tag, evidence });

describe('标注器证据闸（validate）', () => {
  it('原文里逐字存在的引文：保留', () => {
    const r = validate(j([ev('anxiety', '焦虑并不是要被消灭的东西')]), LEX, INTRO);
    expect(r.tags).toEqual([{ tag: 'anxiety', evidence: '焦虑并不是要被消灭的东西' }]);
    expect(r.dropped).toEqual([]);
  });

  it('只改了一个字的引文：丢掉并记账（不能静默通过）', () => {
    // 原文是「听见的信号」，这里改成「听到的信号」
    const r = validate(j([ev('anxiety', '焦虑并不是要被消灭的东西，而是需要被听到的信号')]), LEX, INTRO);
    expect(r.tags).toEqual([]);
    expect(r.dropped).toEqual([{ tag: 'anxiety', reason: 'evidence_not_verbatim' }]);
  });

  it('凭空编的引文：丢掉', () => {
    const r = validate(j([ev('anxiety', '本书提供七步焦虑自愈法')]), LEX, INTRO);
    expect(r.tags).toEqual([]);
    expect(r.dropped[0].reason).toBe('evidence_not_verbatim');
  });

  it('词表外的标签：丢掉', () => {
    const r = validate(j([ev('procrastination', '焦虑并不是要被消灭的东西')]), LEX, INTRO);
    expect(r.tags).toEqual([]);
    expect(r.dropped[0].reason).toBe('unknown_tag');
  });

  it('引文超过 40 字：丢掉（不截断后冒充）', () => {
    const long = '这本书讲的是一个长期焦虑的人如何一点点把生活找回来。作者用大量案例说明，焦虑并不是要被消灭的东西';
    expect(long.length).toBeGreaterThan(40);
    const r = validate(j([ev('anxiety', long)]), LEX, INTRO);
    expect(r.tags).toEqual([]);
    expect(r.dropped[0].reason).toBe('evidence_too_long');
  });

  it('空引文：丢掉', () => {
    const r = validate(j([ev('anxiety', '')]), LEX, INTRO);
    expect(r.dropped[0].reason).toBe('no_evidence');
  });

  it(`超过 ${LEX.top_n} 个标签：只留前 ${LEX.top_n} 个，多出来的记账`, () => {
    const r = validate(
      j([
        ev('anxiety', '焦虑并不是要被消灭的东西'),
        ev('low-mood', '这本书讲的是一个长期焦虑的人'),
        ev('big-choice', '最后一部分谈到重大人生选择'),
        ev('burnout', '作者用大量案例说明'),
      ]),
      LEX,
      INTRO,
    );
    expect(r.tags).toHaveLength(3);
    expect(r.dropped).toEqual([{ tag: 'burnout', reason: 'over_top_n' }]);
  });

  it('模型返回的不是 JSON：报 json_parse，不抛异常', () => {
    const r = validate('抱歉，我无法判断。', LEX, INTRO);
    expect(r.tags).toEqual([]);
    expect(r.dropped).toEqual([{ tag: null, reason: 'json_parse' }]);
  });

  it('标点与空白差异不算改写（归一化后比对）', () => {
    // 原文连续，引文里插了空格
    const r = validate(j([ev('anxiety', '焦虑并不是要被消灭的东西')]), LEX, INTRO.replace('焦虑并不是', '焦虑 并不是'));
    expect(r.tags).toHaveLength(1);
  });

  it('同一个标签重复给两次：只留一个', () => {
    const r = validate(
      j([ev('anxiety', '焦虑并不是要被消灭的东西'), ev('anxiety', '这本书讲的是一个长期焦虑的人')]),
      LEX,
      INTRO,
    );
    expect(r.tags).toHaveLength(1);
    expect(r.dropped[0].reason).toBe('duplicate');
  });
});
