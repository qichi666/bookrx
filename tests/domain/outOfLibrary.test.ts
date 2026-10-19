import { describe, expect, it } from 'vitest';
import type { ExternalSuggestion } from '@/contracts/external.js';
import {
  FORBIDDEN_REASON_TERMS,
  OUT_OF_LIBRARY_BADGE,
  assertExternal,
  pickExternal,
} from '@/domain/outOfLibrary.js';

function ext(over: Partial<ExternalSuggestion> & { title: string }): ExternalSuggestion {
  return {
    kind: 'external_suggestion',
    author_display: ['佚名'],
    domain: 'work',
    tags: ['public-speaking'],
    reason: '它讲的正是开会时脑子一片空白这件事，给的是当场能用的三句话。',
    where_to_find: '公共图书馆或任意书店',
    badge: OUT_OF_LIBRARY_BADGE,
    ...over,
  };
}

describe('库外路径 D（SPEC §7.3）', () => {
  it('缺 badge 就过不了断言 —— 卡片必须标注未入库', () => {
    const bad = { ...ext({ title: 'X' }), badge: '' as '未入库' };
    expect(() => assertExternal([bad])).toThrow(/未入库/);
  });

  it('理由里出现打分口径即失败', () => {
    for (const term of FORBIDDEN_REASON_TERMS) {
      const bad = ext({ title: 'X', reason: `这本书${term}很高，推荐你读。` });
      expect(() => assertExternal([bad]), `term=${term}`).toThrow(/打分口径/);
    }
  });

  it('理由为空 / 过长即失败；缺 where_to_find 即失败', () => {
    expect(() => assertExternal([ext({ title: 'X', reason: ' ' })])).toThrow(/必须有理由/);
    expect(() => assertExternal([ext({ title: 'X', reason: '啊'.repeat(121) })])).toThrow(/超过 120 字/);
    expect(() => assertExternal([ext({ title: 'X', where_to_find: '' })])).toThrow(/去哪里找它/);
  });

  it('空列表报未验证（抛错），不得当作"没有可推荐"', () => {
    expect(() => assertExternal([])).toThrow(/不得当作/);
  });

  it('挑选只按标签重合排序，不产生任何分数', () => {
    const cands = [
      ext({ title: 'C 不相关', tags: ['investing'] }),
      ext({ title: 'A 两个重合', tags: ['public-speaking', 'conflict'] }),
      ext({ title: 'B 一个重合', tags: ['conflict'] }),
    ];
    const picked = pickExternal(cands, { domain: 'work', tags: ['public-speaking', 'conflict'], limit: 3 });
    expect(picked.map((p) => p.title)).toEqual(['A 两个重合', 'B 一个重合', 'C 不相关']);
    // 类型上没有分数可断言，用结构断言保证"不是打分"
    for (const p of picked) expect(Object.keys(p)).not.toContain('score_bp');
  });

  it('排序确定：不依赖 localeCompare，同输入 200 次同输出', () => {
    const cands = Array.from({ length: 8 }, (_, i) =>
      ext({ title: `书${i}`, tags: i % 2 ? ['conflict'] : ['public-speaking'] }),
    );
    const q = { domain: 'work' as const, tags: ['conflict'] as const, limit: 8 };
    const expected = pickExternal(cands, q).map((c) => c.title).join(',');
    for (let i = 0; i < 200; i++) {
      expect(pickExternal(cands.slice().reverse(), q).map((c) => c.title).join(',')).toBe(expected);
    }
  });

  it('limit = 0 返回空，不抛错', () => {
    expect(pickExternal([ext({ title: 'X' })], { domain: 'work', tags: [], limit: 0 })).toEqual([]);
  });
});
