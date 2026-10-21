import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toRuntimeTags, type DerivedEntry } from '@/data/enriched.js';

/**
 * 派生层的**运行时口径**：放行逐本标注与书名证据，挡掉豆瓣大类兜底。
 *
 * 这条规则以前不存在，后果是：豆瓣大类「心理学」把《白夜行》《嫌疑人X的献身》
 * 送进了焦虑标签，而界面上写的是「和你这个困境相关的还有 N 本」。
 * 那时的算法是自洽的（1 对多映射 + 散列截断），错的是**把分类当成证据**。
 *
 * 所以这里测的不是"过滤器能过滤"，而是四件具体的事：
 *  ① 兜底证据一条都不许进运行时；
 *  ② 同一本书里强证据要留下（不能因为旁边有弱证据就整本丢掉）；
 *  ③ 只有弱证据的书整本不进（宁可池子小，也不给不对题的书）；
 *  ④ 逐本标注（annotation）与书名证据同等放行——它是更强的证据，不是更弱的。
 */
describe('派生标签折叠（toRuntimeTags）', () => {
  const entry = (id: string, pt: DerivedEntry['pt']): DerivedEntry => ({
    id,
    pt,
    how: pt.some(([, , s]) => s === 'annotation') ? 'annotation' : pt.some(([, , s]) => s === 'title') ? 'title' : 'tag',
  });

  it('兜底证据一条都不进运行时', () => {
    const map = toRuntimeTags([entry('a', [['anxiety', 0.4, 'category']])]);
    expect(map.size).toBe(0);
  });

  it('逐本标注放行，权重原样保留', () => {
    const map = toRuntimeTags([entry('a', [['big-choice', 0.95, 'annotation']])]);
    expect(map.get('a')).toEqual([{ tag: 'big-choice', weight: 0.95 }]);
  });

  it('标注与书名证据同时存在时都留下，兜底仍然丢掉', () => {
    const map = toRuntimeTags([
      entry('a', [
        ['anxiety', 0.95, 'annotation'],
        ['self-doubt', 0.85, 'title'],
        ['low-mood', 0.4, 'category'],
      ]),
    ]);
    expect(map.get('a')).toEqual([
      { tag: 'anxiety', weight: 0.95 },
      { tag: 'self-doubt', weight: 0.85 },
    ]);
  });

  it('同一本书里强证据留下、弱证据丢掉', () => {
    const map = toRuntimeTags([
      entry('a', [
        ['anxiety', 0.9, 'title'],
        ['low-mood', 0.4, 'category'],
        ['rumination', 0.4, 'category'],
      ]),
    ]);
    expect(map.get('a')).toEqual([{ tag: 'anxiety', weight: 0.9 }]);
  });

  it('只有弱证据的书整本不进 map', () => {
    const map = toRuntimeTags([
      entry('a', [
        ['low-mood', 0.4, 'category'],
        ['anxiety', 0.4, 'category'],
      ]),
      entry('b', [['anxiety', 0.85, 'title']]),
    ]);
    expect([...map.keys()]).toEqual(['b']);
  });

  it('权重原样保留（不在这里做任何加权或归一）', () => {
    const map = toRuntimeTags([entry('a', [['anxiety', 0.85, 'title'], ['burnout', 0.9, 'title']])]);
    expect(map.get('a')?.map((t) => t.weight)).toEqual([0.85, 0.9]);
  });
});

describe('真实派生数据（public/catalog/enriched/derived.json）', () => {
  const FILE = join(process.cwd(), 'public', 'catalog', 'enriched', 'derived.json');

  it.skipIf(!existsSync(FILE))('每条记录都带证据等级，且三种取值都在白名单内', () => {
    const rows = JSON.parse(readFileSync(FILE, 'utf-8')) as DerivedEntry[];
    const ok = new Set(['annotation', 'title', 'category']);
    const bad = rows.filter((r) => r.pt.some(([, , s]) => !ok.has(s)));
    expect(bad.length, `有 ${bad.length} 条记录的证据等级缺失或越界`).toBe(0);

    const all = rows.flatMap((r) => r.pt.map(([, , s]) => s));
    expect(all.includes('title'), '没有任何书名证据 —— 派生管线可能整条挂了').toBe(true);
    expect(all.includes('category'), '没有任何兜底证据 —— 数据形状可能回退了').toBe(true);
    // annotation 允许为 0（标注通道还没跑过），但一旦出现就必须是合法值——
    // 上面那条白名单断言已经守住了这一点。
  });

  it.skipIf(!existsSync(FILE))('运行时映射里不存在兜底标签（这是给用户看的那个集合）', () => {
    const rows = JSON.parse(readFileSync(FILE, 'utf-8')) as DerivedEntry[];
    const runtime = toRuntimeTags(rows);
    const leaked: string[] = [];
    for (const [id, tags] of runtime) {
      const strong = new Set(
        (rows.find((r) => r.id === id)?.pt ?? [])
          .filter(([, , s]) => s === 'annotation' || s === 'title')
          .map(([t]) => t),
      );
      for (const t of tags) if (!strong.has(t.tag)) leaked.push(`${id}/${t.tag}`);
    }
    expect(leaked.slice(0, 5), `运行时混入了 ${leaked.length} 个兜底标签`).toEqual([]);
  });
});
