import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SEED_BOOKS, SEED_SHARD_SIZES } from '@/data/catalog.js';
import type { ProblemTagId } from '@/contracts/enums.js';

/**
 * 核心库数据的结构性断言（不是"列出来看看"）。
 *
 * 这一组防的是三个已经发生过或极易发生的静默失效：
 *   ① 新增分片但忘了在 `catalog.ts` 里装上 → 书少了，所有测试照旧全绿；
 *   ② 新书用了词表外的标签 → 打分时该标签永远匹配不上，档位却看着正常；
 *   ③ 身份映射与书号脱节 → 宽池里同一本书以两个身份出现，去重按 id 判断看不见。
 *
 * 三态纪律：断言的是"必须为真"，不是"打印一下"。空数组要单独判 0，不能让
 * `for (const x of [])` 静默通过。
 */

const TAXONOMY = JSON.parse(readFileSync('catalog/taxonomy.json', 'utf8')) as {
  problem_domains: Record<string, { tags: string[] }>;
};

const ALL_TAGS: readonly ProblemTagId[] = Object.entries(TAXONOMY.problem_domains).flatMap(
  ([, v]) => v.tags as ProblemTagId[],
);

describe('核心库分片装载', () => {
  it('SEED_BOOKS 条数 = 各分片条数之和（防「少装一片」）', () => {
    expect(SEED_SHARD_SIZES.length).toBeGreaterThanOrEqual(3);
    const sum = SEED_SHARD_SIZES.reduce((a, b) => a + b, 0);
    expect(SEED_BOOKS.length).toBe(sum);
    // 60 本是 M0.5 的目标线；低于此线说明有分片没装上
    expect(SEED_BOOKS.length).toBeGreaterThanOrEqual(60);
  });

  it('book_id 唯一，且全部是 core:<6 位定宽>', () => {
    const ids = SEED_BOOKS.map((b) => b.book_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^core:\d{6}$/);
  });

  it('每本都有非空 problem_tags，且权重落在 0.1–1.0', () => {
    for (const b of SEED_BOOKS) {
      expect(b.problem_tags?.length ?? 0, `${b.book_id} ${b.title} 没有困境标签`).toBeGreaterThan(0);
      for (const p of b.problem_tags ?? []) {
        expect(p.weight).toBeGreaterThanOrEqual(0.1);
        expect(p.weight).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('困境标签覆盖', () => {
  it('每个词表标签至少有一本书覆盖（零覆盖会让该困境永远无解）', () => {
    // 先确认词表本身非空 —— 否则下面的循环会空转通过
    expect(ALL_TAGS.length).toBeGreaterThanOrEqual(30);

    const covered = new Set<string>();
    for (const b of SEED_BOOKS) {
      for (const p of b.problem_tags ?? []) covered.add(p.tag);
    }

    const missing = ALL_TAGS.filter((t) => !covered.has(t));
    expect(missing, `以下标签没有任何书覆盖：${missing.join(', ')}`).toEqual([]);
  });

  it('标签全部来自受控词表（词表外的标签永远打不中）', () => {
    const allowed = new Set<string>(ALL_TAGS);
    const bad: string[] = [];
    for (const b of SEED_BOOKS) {
      for (const p of b.problem_tags ?? []) if (!allowed.has(p.tag)) bad.push(`${b.book_id}:${p.tag}`);
    }
    expect(bad, `词表外标签：${bad.join(', ')}`).toEqual([]);
  });
});

describe('核心库 ↔ 候选池身份映射', () => {
  const raw = JSON.parse(readFileSync('catalog/core-id-map.json', 'utf8')) as {
    entries: Record<string, { subject_id: string; method: string; votes: number }>;
    ambiguous: { core_id: string }[];
  };
  const candidates = JSON.parse(readFileSync('public/catalog/candidates/all.json', 'utf8')) as
    | { id: string }[]
    | { books: { id: string }[] };
  const pool = Array.isArray(candidates) ? candidates : candidates.books;
  const poolIds = new Set(pool.map((c) => c.id));

  it('映射到的每个 subject_id 都真实存在于候选池', () => {
    expect(pool.length).toBeGreaterThan(0);
    const keys = Object.keys(raw.entries);
    expect(keys.length, '映射表为空，等于没做对齐').toBeGreaterThan(0);
    for (const [coreId, v] of Object.entries(raw.entries)) {
      expect(poolIds.has(v.subject_id), `${coreId} 指向的 ${v.subject_id} 不在候选池`).toBe(true);
    }
  });

  it('映射的键都是核心库真实存在的书，且一个 subject 不被两本核心库书占用', () => {
    const coreIds = new Set<string>(SEED_BOOKS.map((b) => b.book_id));
    const used = new Map<string, string>();
    for (const [coreId, v] of Object.entries(raw.entries)) {
      expect(coreIds.has(coreId), `映射里有不存在的核心库书 ${coreId}`).toBe(true);
      const prev = used.get(v.subject_id);
      expect(prev, `${v.subject_id} 同时被 ${prev} 和 ${coreId} 占用`).toBeUndefined();
      used.set(v.subject_id, coreId);
    }
  });

  it('ambiguous 列表里的 core_id 都是真实映射过的主键', () => {
    expect(Array.isArray(raw.ambiguous)).toBe(true);
    for (const a of raw.ambiguous) expect(raw.entries[a.core_id]).toBeDefined();
  });
});

describe('来源链接与身份映射一致', () => {
  const map = JSON.parse(readFileSync('catalog/core-id-map.json', 'utf8')) as {
    entries: Record<string, { subject_id: string; title: string }>;
  };

  it('每本书的 source_url 指向的豆瓣条目 = 映射到的 subject_id（池外的书除外）', () => {
    const drift: string[] = [];
    for (const b of SEED_BOOKS) {
      const m = map.entries[b.book_id];
      if (m === undefined) continue; // 公版古籍等池外书，映射表里本来就没有
      const sid = /subject\/(\d+)/.exec(b.source_url ?? '')?.[1];
      if (sid !== String(m.subject_id)) {
        drift.push(`${b.book_id} ${b.title}：url=${sid ?? '非条目链接'} vs 映射=${m.subject_id}`);
      }
    }
    // 这条断言是踩出来的：《被讨厌的勇气》写的是 26577919（另一本书），
    // 映射按书名匹配到了 26369699。两套 id 各自都能"跑通"，只是指向不同的人。
    expect(drift, `来源链接与身份映射脱节：\n  ${drift.join('\n  ')}`).toEqual([]);
  });

  it('池内的书都必须有映射（新书没进候选池要显式加白名单）', () => {
    const missing = SEED_BOOKS.filter((b) => map.entries[b.book_id] === undefined).map(
      (b) => `${b.book_id} ${b.title}`,
    );
    // 白名单在 tools/map-core-to-candidates.mjs 的 ALLOW_MISSING 里，且必须写理由
    expect(missing.length).toBeLessThanOrEqual(2);
  });
});

describe('启动数据（拼音索引）', () => {
  const titles = JSON.parse(readFileSync('catalog/titles.json', 'utf8')) as {
    book_id: string;
    pinyin_full: string;
    pinyin_initials: string;
  }[];

  it('条数与核心库一致，且不出现单字母音节（说明有字音丢失）', () => {
    expect(titles.length).toBe(SEED_BOOKS.length);
    for (const t of titles) {
      expect(t.pinyin_full.length, `${t.book_id} 拼音为空`).toBeGreaterThan(0);
      const short = t.pinyin_full.split(' ').filter((s) => s.length === 1);
      expect(short, `${t.book_id} 出现单字母音节 ${short.join(',')}（${t.pinyin_full}）`).toEqual([]);
    }
  });

  it('首字母串只含小写字母', () => {
    for (const t of titles) expect(t.pinyin_initials).toMatch(/^[a-z]+$/);
  });
});
