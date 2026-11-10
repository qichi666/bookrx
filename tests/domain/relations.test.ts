import { describe, expect, it } from 'vitest';
import { relatedBooks, type RelationBook } from '@/domain/relations.js';
import type { TagRelation } from '@/data/tag-relations.js';

/**
 * 关系图谱是「纯函数 + 人工关系表」的组合，所以可测的正是这两件事：
 *  ① 方向与类型由表决定，函数不自己发明关系；
 *  ② 排序必须全序且稳定 —— 同一份输入多跑几次结果必须一样。
 */

const RELATIONS: TagRelation[] = [
  { from: 'rumination', to: 'self-doubt', kind: 'next', why: '想久了就落到"我不行"' },
  { from: 'anxiety', to: 'rumination', kind: 'next', why: '先停住担心' },
  { from: 'self-doubt', to: 'people-pleasing', kind: 'pair', why: '一个修自我，一个修边界' },
  { from: 'rumination', to: 'emptiness', kind: 'tension', why: '另一种解法' },
];

function book(id: string, tags: [string, number][]): RelationBook {
  return {
    book_id: id,
    title: `书 ${id}`,
    author: '作者',
    hours: 6,
    difficulty: 3,
    tags: tags.map(([tag, weight]) => ({ tag, weight })),
  };
}

describe('relatedBooks', () => {
  const target = book('t', [['rumination', 0.9]]);
  const pool = [
    target,
    book('b1', [['self-doubt', 0.8]]),
    book('b2', [['emptiness', 0.9]]),
    book('b3', [['self-doubt', 0.6]]),
    book('b4', [['anxiety', 0.9]]), // 方向反了：它是指向 target 的，不该被选中
    book('b5', [['self-doubt', 0.2]]), // 权重太低，不算"讲这个"
  ];

  it('只沿关系表的方向找，不反向推断', () => {
    const ids = relatedBooks(target, pool, RELATIONS).map((r) => r.book_id);
    expect(ids).not.toContain('b4');
  });

  it('低权重标签不算命中（0.2 不构成"这本书讲这个"）', () => {
    const ids = relatedBooks(target, pool, RELATIONS).map((r) => r.book_id);
    expect(ids).not.toContain('b5');
  });

  it('按关系类型排序：递进在对照前', () => {
    const list = relatedBooks(target, pool, RELATIONS);
    expect(list.map((r) => r.kind)).toEqual(['next', 'next', 'tension']);
  });

  it('同类型内按两边权重之和降序', () => {
    const list = relatedBooks(target, pool, RELATIONS);
    const nexts = list.filter((r) => r.kind === 'next').map((r) => r.book_id);
    // b1 = 0.9 + 0.8，b3 = 0.9 + 0.6
    expect(nexts).toEqual(['b1', 'b3']);
  });

  it('互补关系只在表里那一端成立（self-doubt 指向 people-pleasing）', () => {
    const selfDoubt = book('sd', [['self-doubt', 0.9]]);
    const list = relatedBooks(selfDoubt, [selfDoubt, book('pp', [['people-pleasing', 0.9]])], RELATIONS);
    expect(list.map((r) => [r.book_id, r.kind])).toEqual([['pp', 'pair']]);
  });

  it('不把自己放进来', () => {
    const list = relatedBooks(target, pool, RELATIONS);
    expect(list.map((r) => r.book_id)).not.toContain('t');
  });

  it('多次调用结果完全一致（全序，不依赖输入顺序）', () => {
    const a = relatedBooks(target, pool, RELATIONS).map((r) => r.book_id);
    const shuffled = [pool[0]!, pool[3]!, pool[1]!, pool[2]!, pool[4]!, pool[5]!];
    const b = relatedBooks(target, shuffled, RELATIONS).map((r) => r.book_id);
    expect(b).toEqual(a);
  });

  it('limit 生效；没有关系或没有标签时返回空数组', () => {
    expect(relatedBooks(target, pool, RELATIONS, 1)).toHaveLength(1);
    // anxiety → rumination，池子里唯一带 rumination 的就是 target 本身
    expect(relatedBooks(book('n', [['anxiety', 0.9]]), pool, RELATIONS).map((r) => r.book_id)).toEqual(['t']);
    expect(relatedBooks(book('empty', []), pool, RELATIONS)).toEqual([]);
  });

  it('一句话解释来自关系表，不是函数现编', () => {
    const list = relatedBooks(target, pool, RELATIONS);
    for (const item of list) {
      const rel = RELATIONS.find((r) => r.to === item.tag && r.kind === item.kind);
      expect(rel?.why).toBe(item.why);
    }
  });
});
