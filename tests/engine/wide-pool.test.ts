import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { CandidateBook } from '@/data/candidates.js';
import type { ProblemTagWeight } from '@/contracts/book.js';
import type { ProblemTagId } from '@/contracts/enums.js';
import { normalizeTitle, pickWide } from '@/engine/wide-pool.js';

/**
 * 全库推荐池：域过滤、去重、轮换覆盖、确定性。
 * 「每本书都有机会」不是口号——这里用穷举 epoch 断言：跑满若干轮后并集 == 全池。
 */

function mk(id: string, over: Partial<CandidateBook> = {}): CandidateBook {
  return {
    id,
    title: `书${id}`,
    subtitle: '',
    authors: [`作者${id}`],
    publisher: '',
    year: 2020,
    q: 0.8,
    bucket: 'high',
    votes: 100,
    tags: [],
    domains: ['work'],
    url: '',
    ...over,
  };
}

function dx(over: Partial<Diagnosis['answers']> = {}): Diagnosis {
  return {
    diagnosis_id: 'dx:test',
    answers: {
      domain: 'work',
      primary_tag: 'management-delegation',
      quick_effect: 'month',
      difficulty_pref: 'medium',
      time_budget: 'half_hour',
      ...over,
    },
    need_tags: [],
    include_heavy: false,
    excluded_book_ids: [],
    created_at: 0,
    schema_version: 1,
  } as Diagnosis;
}

describe('pickWide', () => {
  it('只取当前域的书', () => {
    const books = [mk('1'), mk('2', { domains: ['psychology'] }), mk('3')];
    const { picks } = pickWide(books, dx(), { epoch: 0, limit: 5 });
    expect(picks.map((p) => p.id).sort()).toEqual(['1', '3']);
  });

  it('同一批内不重复：同 id 与同书名只留一本', () => {
    const books = [mk('1', { title: '沟通的艺术' }), mk('2', { title: '沟通的艺术（第3版）' }), mk('3')];
    const { picks } = pickWide(books, dx(), { epoch: 0, limit: 5 });
    expect(picks.length).toBe(2);
    expect(normalizeTitle(picks[0]!.title)).not.toBe(normalizeTitle(picks[1]!.title));
    expect(normalizeTitle('沟通的艺术（第3版）')).toBe(normalizeTitle('沟通的艺术'));
  });

  it('与核心库已展示书名去重', () => {
    const books = [mk('1', { title: '关键对话' }), mk('2', { title: '另一本' })];
    const { picks } = pickWide(books, dx(), { epoch: 0, limit: 5, excludeTitles: ['关键对话'] });
    expect(picks.map((p) => p.title)).toEqual(['另一本']);
  });

  it('排除用户主动排除的书', () => {
    const books = [mk('user:1'), mk('user:2')];
    const d = dx();
    d.excluded_book_ids = ['user:1'];
    expect(pickWide(books, d, { epoch: 0, limit: 5 }).picks.map((p) => p.id)).toEqual(['user:2']);
  });

  it('轮换有质量梯度：高档书先出，低档书垫底', () => {
    const books = [
      mk('h1', { bucket: 'high' }),
      mk('l1', { bucket: 'low', q: 0.4 }),
      mk('m1', { bucket: 'mid', q: 0.7 }),
    ];
    const { picks } = pickWide(books, dx(), { epoch: 0, limit: 2 });
    expect(picks[0]!.bucket).toBe('high');
    expect(picks[1]!.bucket).toBe('mid');
  });

  it('全库覆盖：跑满若干轮后，池子里每一本都出现过', () => {
    const books = Array.from({ length: 20 }, (_, i) =>
      mk(String(i), { bucket: i % 2 === 0 ? 'high' : 'mid' }),
    );
    const shown = new Set<string>();
    for (let epoch = 0; epoch < 20; epoch += 1) {
      for (const p of pickWide(books, dx(), { epoch, limit: 5 }).picks) shown.add(p.id);
    }
    expect(shown.size).toBe(books.length);
  });

  it('同 epoch 结果稳定（可复现）', () => {
    const books = Array.from({ length: 12 }, (_, i) => mk(String(i)));
    const a = pickWide(books, dx(), { epoch: 3, limit: 5 }).picks.map((p) => p.id);
    const b = pickWide(books, dx(), { epoch: 3, limit: 5 }).picks.map((p) => p.id);
    expect(a).toEqual(b);
    const c = pickWide(books, dx(), { epoch: 4, limit: 5 }).picks.map((p) => p.id);
    expect(c).not.toEqual(a);
  });

  it('size 报的是当前域可用总数（不受 epoch 影响）', () => {
    const books = Array.from({ length: 9 }, (_, i) => mk(String(i)));
    expect(pickWide(books, dx(), { epoch: 0, limit: 5 }).size).toBe(9);
    expect(pickWide(books, dx(), { epoch: 7, limit: 5 }).size).toBe(9);
  });
});

/**
 * 真数据验收：不是在假数据上证「原理可行」，而是在**实际发布的书目层**上
 * 把它跑穿——每个域反复「换一批」，直到该域每本书都露过面。
 * 产物缺失时跳过（`npm run data:build` 没跑过就不该在这里红）。
 */
describe('真实书目层：按需求取书（enriched 派生标签）', () => {
  const DERIVED = join(process.cwd(), 'public', 'catalog', 'enriched', 'derived.json');
  const candidates: CandidateBook[] = existsSync(join(process.cwd(), 'public', 'catalog', 'candidates', 'all.json'))
    ? (JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'candidates', 'all.json'), 'utf-8')) as CandidateBook[])
    : [];
  const derived = new Map<string, ProblemTagWeight[]>(
    existsSync(DERIVED)
      ? (JSON.parse(readFileSync(DERIVED, 'utf-8')) as Array<{ id: string; pt: [string, number][] }>).map(
          (r) => [r.id, r.pt.map(([tag, weight]) => ({ tag: tag as ProblemTagId, weight }))],
        )
      : [],
  );

  it.skipIf(candidates.length === 0 || derived.size === 0)(
    '给定「发言紧张 + 怕被评价」，每一本都能沾上题，且跑满轮次全覆盖',
    () => {
      const demand = new Map<ProblemTagId, number>([
        ['speaking-block', 0.6],
        ['evaluation-anxiety', 0.25],
      ]);
      const d = dx();
      const first = pickWide(candidates, d, { epoch: 0, limit: 5, demand, derived });
      expect(first.size).toBeGreaterThan(20);
      expect(first.picks.length).toBe(5);

      // 每一本都必须真的沾题（命中率 ≥ 0.2），而不是"同领域随便给"
      for (const p of first.picks) {
        const tags = derived.get(p.id) ?? [];
        const hit =
          Math.min(0.6, tags.find((t) => t.tag === 'speaking-block')?.weight ?? 0) +
          Math.min(0.25, tags.find((t) => t.tag === 'evaluation-anxiety')?.weight ?? 0);
        expect(hit, `《${p.title}》不沾题却进了池子`).toBeGreaterThanOrEqual(0.19);
      }

      // 覆盖：跑满 ceil(size/5) 轮，池子里每一本都露过面
      const seen = new Set<string>();
      const rounds = Math.ceil(first.size / 5);
      for (let epoch = 0; epoch < rounds; epoch += 1) {
        for (const p of pickWide(candidates, d, { epoch, limit: 5, demand, derived }).picks) seen.add(p.id);
      }
      expect(seen.size).toBe(first.size);

      console.log(
        `  按需池：${first.size} 本相关（${rounds} 轮翻完）｜首批 = ${first.picks.map((p) => p.title).join('、')}`,
      );
    },
  );

  it.skipIf(candidates.length === 0 || derived.size === 0)('没给派生标签时退回质量档池（降级路径仍可用）', () => {
    const d = dx();
    const withDerived = pickWide(candidates, d, {
      epoch: 0,
      limit: 5,
      demand: new Map<ProblemTagId, number>([['speaking-block', 0.6]]),
      derived,
    });
    const withoutDerived = pickWide(candidates, d, { epoch: 0, limit: 5 });
    expect(withDerived.size).not.toBe(withoutDerived.size);
    expect(withoutDerived.picks.length).toBe(5);
  });
});

describe('真实书目层：全库覆盖', () => {
  const DATA = join(process.cwd(), 'public', 'catalog', 'candidates', 'all.json');
  const books: CandidateBook[] = existsSync(DATA)
    ? (JSON.parse(readFileSync(DATA, 'utf-8')) as CandidateBook[])
    : [];

  it.skipIf(books.length === 0)('每个域都能被翻到最后一本，且同一批里没有重复书名', () => {
    const domains = [...new Set(books.flatMap((b) => b.domains))];
    expect(domains.length).toBeGreaterThanOrEqual(7);

    const report: string[] = [];
    for (const domain of domains) {
      const pool = books.filter((b) => b.domains.includes(domain));
      // 同一域里同名不同版（如「沟通的艺术」与「沟通的艺术（第 3 版）」）按设计只露一本，
      // 所以验收基准是「去重后的书名个数」，不是条数。
      const distinct = new Set(pool.map((b) => normalizeTitle(b.title))).size;
      const shown = new Set<string>();
      let epoch = 0;
      while (shown.size < distinct && epoch < distinct * 3 + 50) {
        const { picks } = pickWide(books, dx({ domain } as Diagnosis['answers']), {
          epoch,
          limit: 5,
        });
        const titles = picks.map((p) => normalizeTitle(p.title));
        expect(new Set(titles).size, `第 ${epoch} 批出现重复书名`).toBe(titles.length);
        for (const p of picks) shown.add(p.id);
        epoch += 1;
      }
      expect(shown.size, `${domain} 没覆盖全（${shown.size}/${distinct}）`).toBe(distinct);
      report.push(`${domain}:${distinct}本/${epoch}轮`);
    }
    console.log(`  全库覆盖验收 ｜ ${report.join('  ')}`);
  });
});
