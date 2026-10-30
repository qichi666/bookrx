import { describe, expect, it } from 'vitest';
import { SEED_BOOKS } from '@/data/catalog.js';
import { searchBooks, searchCandidates, searchQuestion } from '@/engine/search.js';

/**
 * 首页检索（engine/search.ts）：
 * 书检索四路命中 + 确定性排序；问题检索走既有词典合成 dxs: 临时诊断。
 */

describe('searchBooks', () => {
  it('书名包含命中', () => {
    const hits = searchBooks('非暴力', SEED_BOOKS);
    expect(hits[0]?.book.book_id).toBe('core:000002');
    expect(hits[0]?.field).toBe('title');
  });

  it('拼音全拼命中', () => {
    const hits = searchBooks('feibaoli', SEED_BOOKS);
    expect(hits[0]?.book.book_id).toBe('core:000002');
    expect(hits[0]?.field).toBe('pinyin');
  });

  it('拼音首字母命中（gjdh → 关键对话）', () => {
    const hits = searchBooks('gjdh', SEED_BOOKS);
    expect(hits[0]?.book.book_id).toBe('core:000003');
  });

  it('作者命中', () => {
    const hits = searchBooks('卡尼曼', SEED_BOOKS);
    expect(hits[0]?.book.book_id).toBe('core:000004');
    expect(hits[0]?.field).toBe('author');
  });

  it('关键词命中简介', () => {
    const hits = searchBooks('课题分离', SEED_BOOKS);
    expect(hits.some((h) => h.book.book_id === 'core:000001')).toBe(true);
    expect(hits[0]?.field).toBe('keyword');
  });

  it('书名优先级高于作者 / 关键词', () => {
    // 思考，快与慢：query 同时命中《思考，快与慢》书名与其它书的简介时书名在前
    const hits = searchBooks('思考', SEED_BOOKS);
    expect(hits[0]?.field).toBe('title');
  });

  it('同输入两次结果一致；同分按 book_id 升序', () => {
    const a = searchBooks('沟通', SEED_BOOKS);
    const b = searchBooks('沟通', SEED_BOOKS);
    expect(a.map((h) => h.book.book_id)).toEqual(b.map((h) => h.book.book_id));
    for (let i = 1; i < a.length; i += 1) {
      const prev = a[i - 1]!;
      const cur = a[i]!;
      if (prev.field === cur.field) {
        expect(cur.book.book_id > prev.book.book_id).toBe(true);
      }
    }
  });

  it('空串与无命中返回空数组', () => {
    expect(searchBooks('  ', SEED_BOOKS)).toEqual([]);
    expect(searchBooks('zzzz不存在zzzz', SEED_BOOKS)).toEqual([]);
  });

  it('书名少打一个字也能找到，并标记 fuzzy（不许冒充精确命中）', () => {
    const hits = searchBooks('被讨厌勇气', SEED_BOOKS);
    expect(hits[0]?.book.book_id).toBe('core:000001');
    expect(hits[0]?.fuzzy).toBe(true);
  });

  it('有精确命中时不混入近似结果', () => {
    const hits = searchBooks('非暴力沟通', SEED_BOOKS);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.fuzzy !== true)).toBe(true);
  });

  it('拼音首字母只认开头与结尾：yq 不再命中《慢慢来，一切都来得及》', () => {
    const titles = searchBooks('yq', SEED_BOOKS).map((h) => h.book.title);
    expect(titles).toContain('被讨厌的勇气');
    expect(titles).not.toContain('慢慢来，一切都来得及');
  });

  it('单字母不参与拼音匹配（全拼与首字母都要求 ≥2 位）', () => {
    // 注意：单字母仍可能命中作者（例如作者名本身是拉丁字母），这里只钉死拼音这一路
    const hits = searchBooks('y', SEED_BOOKS);
    expect(hits.every((h) => h.field !== 'pinyin')).toBe(true);
  });
});

describe('searchQuestion', () => {
  it('命中标签 → 合成 dxs: 前缀诊断，主诉 = 第一个命中标签', () => {
    const d = searchQuestion('每次开会轮到我说话，脑子就一片空白');
    expect(d).not.toBeNull();
    expect(d?.diagnosis_id.startsWith('dxs:')).toBe(true);
    expect(d?.answers.primary_tag).toBe('speaking-block');
    expect(d?.answers.domain).toBe('work');
  });

  it('user_phrase 逐字保留问句命中片段，不用选项文案', () => {
    const d = searchQuestion('每次开会轮到我说话，脑子就一片空白');
    const primary = d?.need_tags.find((n) => n.tag === 'speaking-block');
    expect(primary?.user_phrase).toBe('一片空白');
  });

  it('无命中返回 null', () => {
    expect(searchQuestion('今天天气不错')).toBeNull();
    expect(searchQuestion('  ')).toBeNull();
  });

  it('最多取 3 个命中标签', () => {
    const d = searchQuestion('焦虑 担心 拖延 分心 纠结 失眠');
    expect(d?.need_tags.length).toBeLessThanOrEqual(3);
  });
});

describe('searchCandidates（外围书库）', () => {
  const mk = (over: Record<string, unknown>) => ({
    id: '1',
    title: '默认书名',
    subtitle: '',
    authors: ['默认作者'],
    publisher: '',
    year: 2020,
    q: 0.7,
    bucket: 'mid' as const,
    votes: 100,
    tags: [],
    domains: [],
    url: '',
    ...over,
  });

  it('书名与作者命中，简介不参与匹配', () => {
    const books = [
      mk({ id: 'a', title: '沟通的艺术', bucket: 'high', q: 0.9 }),
      mk({ id: 'b', title: '无关书', authors: ['沟通大师'] }),
      mk({ id: 'c', title: '另一本' }),
    ];
    const ids = searchCandidates('沟通', books).map((h) => h.book.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).not.toContain('c');
  });

  it('排序：质量档 > 收缩分 > 评价人数 > id', () => {
    const books = [
      mk({ id: '1', title: '沟通甲', bucket: 'mid', q: 0.9, votes: 10 }),
      mk({ id: '2', title: '沟通乙', bucket: 'high', q: 0.7, votes: 10 }),
      mk({ id: '3', title: '沟通丙', bucket: 'high', q: 0.85, votes: 10 }),
      mk({ id: '4', title: '沟通丁', bucket: 'high', q: 0.85, votes: 900 }),
    ];
    expect(searchCandidates('沟通', books).map((h) => h.book.id)).toEqual(['4', '3', '2', '1']);
  });

  it('同输入两次结果一致；默认截断 12 条', () => {
    const books = Array.from({ length: 20 }, (_, i) =>
      mk({ id: String(100 + i), title: `沟通 ${i}` }),
    );
    const a = searchCandidates('沟通', books);
    const b = searchCandidates('沟通', books);
    expect(a.map((x) => x.book.id)).toEqual(b.map((x) => x.book.id));
    expect(a.length).toBe(12);
  });

  it('空串与无命中返回空数组', () => {
    expect(searchCandidates('  ', [mk({})])).toEqual([]);
    expect(searchCandidates('zzz不存在', [mk({ title: '沟通' })])).toEqual([]);
  });

  it('副标题命中时给出原文片段（否则用户看不出这本书为什么出现）', () => {
    const books = [
      mk({ id: 'g', title: '游戏力', subtitle: '笑声，激活孩子天性中的合作与勇气' }),
      mk({ id: 'x', title: '无关书', subtitle: '别的副标题' }),
    ];
    const hits = searchCandidates('勇气', books);
    expect(hits.map((h) => h.book.id)).toEqual(['g']);
    expect(hits[0]?.field).toBe('subtitle');
    expect(hits[0]?.snippet).toContain('勇气');
  });

  it('书名命中时不给片段（书名本身就是证据）', () => {
    const hits = searchCandidates('沟通', [mk({ id: 'a', title: '沟通的艺术' })]);
    expect(hits[0]?.field).toBe('title');
    expect(hits[0]?.snippet).toBe('');
  });

  it('同书名同作者合并成一条，其余记成版本数', () => {
    const books = [
      mk({ id: '1', title: '游戏力', bucket: 'high', q: 0.9, votes: 900 }),
      mk({ id: '2', title: '游戏力', bucket: 'mid', q: 0.8, votes: 500 }),
      mk({ id: '3', title: '游戏力', bucket: 'low', q: 0.6, votes: 100 }),
    ];
    const hits = searchCandidates('游戏力', books);
    expect(hits.length).toBe(1);
    expect(hits[0]?.book.id).toBe('1');
    expect(hits[0]?.editions).toBe(2);
  });

  it('不同作者的相同书名不合并（可能是两本不同的书）', () => {
    const books = [
      mk({ id: '1', title: '心理学', authors: ['甲'] }),
      mk({ id: '2', title: '心理学', authors: ['乙'] }),
    ];
    expect(searchCandidates('心理学', books).length).toBe(2);
  });

  it('作者写法不同也算同一本：方括号、间隔号、一元素 vs 两元素', () => {
    const books = [
      mk({ id: '1', title: '幸福的勇气', authors: ['[日] 岸见一郎、[日] 古贺史健'] }),
      mk({ id: '2', title: '幸福的勇气', authors: ['[日] 岸见一郎', '古贺史健'] }),
    ];
    const hits = searchCandidates('幸福的勇气', books);
    expect(hits.length).toBe(1);
    expect(hits[0]?.editions).toBe(1);
  });

  it('短副标题整句给出，不切半截词', () => {
    const books = [mk({ id: 's', title: '游戏力', subtitle: '笑声，激活孩子天性中的合作与勇气' })];
    const hits = searchCandidates('勇气', books);
    expect(hits[0]?.snippet).toBe('笑声，激活孩子天性中的合作与勇气');
  });

  it('有严格命中时不混入「差一个字」的结果', () => {
    const books = [
      mk({ id: 'exact', title: '被讨厌的勇气', bucket: 'high', q: 0.9 }),
      mk({ id: 'typo', title: '被讨厌勇气' }), // 少一个「的」：近似，不该与精确结果并列
    ];
    const hits = searchCandidates('被讨厌的勇气', books);
    expect(hits.map((h) => h.book.id)).toEqual(['exact']);
  });

  it('一本都没严格命中时才走近似，并把它标出来', () => {
    const books = [
      mk({ id: 'typo', title: '被讨厌勇气' }),
      mk({ id: 'other', title: '完全无关' }),
    ];
    const hits = searchCandidates('被讨厌的勇气', books);
    expect(hits.map((h) => h.book.id)).toEqual(['typo']);
    expect(hits[0]?.fuzzy).toBe(true);
  });

  it('严格命中不带 fuzzy 标记', () => {
    const hits = searchCandidates('勇气', [mk({ id: 'a', title: '被讨厌的勇气' })]);
    expect(hits[0]?.fuzzy).toBeUndefined();
  });
});
