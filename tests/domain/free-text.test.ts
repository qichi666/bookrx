import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProblemTagId } from '@/contracts/enums.js';
import { matchFreeText } from '@/engine/diagnose.js';

/**
 * 第 4 屏自由文本：**口语命中率闸门**。
 *
 * 为什么单独一组：结构化金标（`profiles.json`）把 `problem_tags` 直接喂给引擎，
 * 等于绕过了这条链路。于是「金标 10/10」和「自由文本 29%」可以同时成立，互不矛盾，
 * 而真实用户唯一的入口是口语。这是金标设计的一个结构性盲区。
 *
 * 句子先写、代码后改：`catalog/golden/colloquial.json` 里的 32 句按真人怎么说话写，
 * 不按词表写。改词表去凑句子是本末倒置——那样只会让词表看起来更长。
 *
 * 口径（SPEC：入口不能"大部分时候不工作"）：
 *   · 命中率 ≥ 70%（期望标签出现在命中里）
 *   · 完全零命中 ≤ 15%（对这些人，第 4 屏等于白填）
 * 误命中只打印不判失败：多命中一个相邻标签，比一个都不命中好得多。
 */

interface Case {
  id: string;
  text: string;
  expect: ProblemTagId;
}

const FILE = join(process.cwd(), 'catalog', 'golden', 'colloquial.json');
const data = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf-8')) as { cases: Case[] }) : { cases: [] };

describe('自由文本口语命中率（32 句真实说法）', () => {
  it.skipIf(data.cases.length === 0)('语料齐备，且每句都指定了期望标签', () => {
    expect(data.cases.length).toBeGreaterThanOrEqual(28);
    for (const c of data.cases) {
      expect(c.text.length, `${c.id} 文本为空`).toBeGreaterThan(3);
      expect(c.expect, `${c.id} 缺期望标签`).toBeTruthy();
    }
    expect(new Set(data.cases.map((c) => c.id)).size).toBe(data.cases.length);
  });

  it.skipIf(data.cases.length === 0)('命中率 ≥ 70%，完全零命中 ≤ 15%', () => {
    const rows = data.cases.map((c) => {
      const hits = matchFreeText(c.text);
      return {
        id: c.id,
        text: c.text,
        expect: c.expect,
        got: hits.map((h) => h.tag),
        hit: hits.some((h) => h.tag === c.expect),
        zero: hits.length === 0,
        top: hits[0],
      };
    });

    const hitRate = rows.filter((r) => r.hit).length / rows.length;
    const zeroRate = rows.filter((r) => r.zero).length / rows.length;

    console.log('\n  ── 自由文本逐句 ──');
    for (const r of rows) {
      const mark = r.hit ? '命中' : r.zero ? '零命中' : '误命中';
      console.log(
        `  ${r.id} ${mark.padEnd(3)} 期望=${r.expect} 得到=${r.got.join(',') || '-'}  ｜ ${r.text}` +
          (r.top ? `  ｜ 片段="${r.top.phrase}"` : ''),
      );
    }
    console.log(
      `\n  ── 命中 ${rows.filter((r) => r.hit).length}/${rows.length}（${(hitRate * 100).toFixed(0)}%）` +
        ` ｜ 零命中 ${rows.filter((r) => r.zero).length}/${rows.length}（${(zeroRate * 100).toFixed(0)}%）──\n`,
    );

    expect(hitRate, `命中率 ${(hitRate * 100).toFixed(0)}% 低于 70%`).toBeGreaterThanOrEqual(0.7);
    expect(zeroRate, `零命中率 ${(zeroRate * 100).toFixed(0)}% 高于 15%`).toBeLessThanOrEqual(0.15);
  });

  it.skipIf(data.cases.length === 0)('命中片段必须是原文里逐字存在的切片', () => {
    // 契约：user_phrase 逐字保留。插入匹配也不能改写用户的话。
    const bad: string[] = [];
    for (const c of data.cases) {
      for (const h of matchFreeText(c.text)) {
        if (!c.text.includes(h.phrase)) bad.push(`${c.id} → "${h.phrase}"`);
      }
    }
    expect(bad, `以下命中片段不是原文切片：${bad.join(', ')}`).toEqual([]);
  });
});
