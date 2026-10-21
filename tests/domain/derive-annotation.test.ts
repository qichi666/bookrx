import { describe, expect, it } from 'vitest';
// @ts-expect-error —— 纯 JS 工具，无类型声明；测的是它的运行时行为
import { deriveBook as deriveBookRaw } from '../../tools/derive-annotations.mjs';

type Source = 'annotation' | 'title' | 'category';
type Pt = readonly [string, number, Source];
type Derived = { pt: Pt[]; how: string };

/** 给无类型的 JS 工具补一个最小签名，避免整份测试都泡在 `any` 里 */
const deriveBook = deriveBookRaw as (
  book: unknown,
  lexicon: unknown,
  annotation?: unknown,
) => Derived;

/**
 * 派生层接入「逐本标注」后的三条规矩。
 *
 * 这个通道最大的风险不是标错，是**接入本身改变了既有结果**——
 * 那样的话，池子变大到底是标注的功劳还是改坏了，谁也说不清。
 * 所以第一条就是：没有标注时，输出必须与接入前逐位相同。
 */
const LEX = {
  top_n: 3,
  weights: { annotation: 0.95, title: 0.85, title_extra: 0.05, title_max: 0.9, tag: 0.4 },
  tags: {
    anxiety: { keywords: ['焦虑'], from_tags: ['心理学'] },
    'low-mood': { keywords: ['低落'], from_tags: ['心理学'] },
    'big-choice': { keywords: ['选择'], from_tags: ['人生'] },
    burnout: { keywords: [], from_tags: ['职场'] },
  },
};

const book = { id: 'x1', title: '焦虑自救', subtitle: '', tags: ['心理学'] };

describe('派生层接入逐本标注', () => {
  it('没有标注时，结果与只传两个参数逐位相同', () => {
    const withUndef = deriveBook(book, LEX, undefined);
    const legacy = deriveBook(book, LEX);
    expect(JSON.stringify(withUndef)).toBe(JSON.stringify(legacy));
    // 且仍然只产出书名/兜底两级证据，不会凭空冒出 annotation
    expect(withUndef.pt.every(([, , s]) => s === 'title' || s === 'category')).toBe(true);
  });

  it('标注命中：权重 0.95，证据等级 annotation', () => {
    const r = deriveBook(book, LEX, { tags: [{ tag: 'big-choice', evidence: '站在岔路口' }] });
    const hit = r.pt.find(([t]) => t === 'big-choice');
    expect(hit).toEqual(['big-choice', 0.95, 'annotation']);
    expect(r.how).toBe('annotation');
  });

  it('标注与书名命中同一标签：以标注为准（不出现两条同标签记录）', () => {
    const r = deriveBook(book, LEX, { tags: [{ tag: 'anxiety', evidence: '长期焦虑' }] });
    expect(r.pt.filter(([t]) => t === 'anxiety')).toEqual([['anxiety', 0.95, 'annotation']]);
  });

  it('标注没给的标签，书名命中仍然算（标注只覆盖最贴题的那几个）', () => {
    // 书名里没有「低落」，但标注只给了 big-choice；兜底来的 low-mood 仍在
    const r = deriveBook(book, LEX, { tags: [{ tag: 'big-choice', evidence: '岔路' }] });
    const tags = r.pt.map(([t]) => t);
    expect(tags).toContain('big-choice');
    expect(tags).toContain('anxiety'); // 书名命中，与标注无关
  });

  it('词表外的标签被忽略（不靠上游守规矩）', () => {
    const r = deriveBook(book, LEX, { tags: [{ tag: 'procrastination', evidence: '拖' }] });
    expect(r.pt.map(([t]) => t)).not.toContain('procrastination');
  });

  it('标注为空数组时等于没标注', () => {
    expect(JSON.stringify(deriveBook(book, LEX, { tags: [] }))).toBe(JSON.stringify(deriveBook(book, LEX)));
  });
});
