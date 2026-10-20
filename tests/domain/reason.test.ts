import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProblemTagId } from '@/contracts/enums.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { computeResult } from '@/engine/result.js';
import { SOURCE_LABEL, assertReason, buildReason, tagLabel } from '@/domain/scoring/reason.js';
import { SEED_BOOKS } from '@/data/catalog.js';

/**
 * 理由来源（可审计性契约层）。
 *
 * 这条测试守的不是文案质量，而是**每句话的出处**：
 *  · `prewritten` 必须是书里真实存在的 `match_brief`；
 *  · `from_answer` 必须逐字回引用户原词（不许改写、不许概括）；
 *  · `from_tag_weight` 必须能追到书的 `problem_tags` 里那一条，且用户确实选了它。
 *
 * 为什么值得单测：一句说不出出处的理由，比没有理由更糟——它看起来像结论。
 * 界面层（BookCard 的展开区）只是把这些行渲染出来，正确性全在这里。
 */

interface GoldenProfile {
  id: string;
  domain: ReturnType<typeof buildDiagnosis>['diagnosis']['answers']['domain'];
  problem_tags: ProblemTagId[];
  primary_tag: ProblemTagId;
}

const profiles = (
  JSON.parse(readFileSync('catalog/golden/profiles.json', 'utf8')) as { profiles: GoldenProfile[] }
).profiles;

describe('理由来源', () => {
  it('每条理由都有合法来源，且文本非空', () => {
    for (const p of profiles) {
      const { diagnosis } = buildDiagnosis({
        domain: p.domain,
        tags: p.problem_tags,
        primary: p.primary_tag,
      });
      const r = computeResult(diagnosis);
      expect(r.items.length, `${p.id} 没有推荐结果`).toBeGreaterThan(0);
      for (const item of r.items) {
        expect(() => assertReason(item.reason)).not.toThrow();
        for (const line of [item.reason.brief, ...item.reason.lines]) {
          expect(Object.keys(SOURCE_LABEL)).toContain(line.source);
          expect(line.text.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('`prewritten` 行逐字等于书里的 match_brief（不许现编文案）', () => {
    for (const p of profiles) {
      const { diagnosis } = buildDiagnosis({
        domain: p.domain,
        tags: p.problem_tags,
        primary: p.primary_tag,
      });
      const r = computeResult(diagnosis);
      for (const item of r.items) {
        expect(item.reason.brief.text).toBe(item.book.match_brief);
        expect(item.reason.brief.source).toBe('prewritten');
        const pre = item.reason.lines.filter((l) => l.source === 'prewritten');
        for (const l of pre) expect(l.text).toBe(item.book.match_brief);
      }
    }
  });

  it('`from_answer` 逐字回引用户原词，不是标签 id', () => {
    for (const p of profiles) {
      const { diagnosis } = buildDiagnosis({
        domain: p.domain,
        tags: p.problem_tags,
        primary: p.primary_tag,
      });
      const phrase = diagnosis.need_tags.find((n) => n.tag === p.primary_tag)?.user_phrase;
      const block = buildReason({
        book: SEED_BOOKS[0]!,
        userTags: new Map([[p.primary_tag, 0.6]]),
        primaryTag: p.primary_tag,
        primaryPhrase: phrase,
      });
      const line = block.lines.find((l) => l.source === 'from_answer');
      expect(line?.text).toContain(phrase as string);
      expect(line?.text).not.toContain(p.primary_tag);
    }
  });

  it('`from_tag_weight` 只列「书有 + 用户也选了」的标签，且能追到具体权重', () => {
    const book = SEED_BOOKS.find((b) => (b.problem_tags ?? []).length >= 2);
    expect(book).toBeDefined();
    const tag = (book!.problem_tags ?? [])[0]!.tag;
    const weight = (book!.problem_tags ?? [])[0]!.weight;

    // 用户选了 → 应该出现
    const withTag = buildReason({
      book: book!,
      userTags: new Map([[tag, 0.6]]),
      primaryTag: tag,
      primaryPhrase: '随便一句话',
    });
    const line = withTag.lines.find((l) => l.source === 'from_tag_weight');
    expect(line?.basis).toBe(tag);
    expect(line?.text).toContain(String(weight));
    expect(line?.text).toContain(tagLabel(tag));

    // 用户没选 → 不许出现（这是"为什么推这本"最容易变成胡说的地方）
    const other = (book!.problem_tags ?? [])[1]?.tag;
    const withoutTag = buildReason({
      book: book!,
      userTags: new Map([[tag, 0.6]]),
      primaryTag: tag,
      primaryPhrase: '随便一句话',
    });
    if (other !== undefined) {
      expect(withoutTag.lines.some((l) => l.basis === other)).toBe(false);
    }
  });

  it('页面上的来源徽章文案齐备（三档都要有中文，不能露出枚举值）', () => {
    expect(Object.values(SOURCE_LABEL)).toEqual(['书里写的', '你的回答', '书的标注']);
    for (const v of Object.values(SOURCE_LABEL)) expect(v).not.toMatch(/[a-z_]{4,}/);
  });
});
