import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRISIS_RESOURCES, latestVerifiedAt } from '@/data/crisis.js';
import { CRISIS_KEYWORDS, hasCrisisSignal } from '@/engine/result.js';
import type { Diagnosis } from '@/contracts/diagnosis.js';

/**
 * 危机资源：**每一条都必须可核实**。
 *
 * 之前这里只有 `name / contact / scope / hours`，页面上写着「清单核对日期」，
 * 但那个日期没有对应的来源 —— 结构上就没有可核实的痕迹。
 * 号码对不对、还在不在服务，从数据里判断不了。
 *
 * 「新鲜度」（超过 90 天未核实）由 `tools/crisis-audit.mjs` 管，不放在单测里：
 * 单测随时间的推移自己变红，会变成一颗定时炸弹，而定时炸弹最后总被人注释掉。
 */

const FILE = join(process.cwd(), 'catalog', 'crisis-resources.json');
const raw = existsSync(FILE)
  ? (JSON.parse(readFileSync(FILE, 'utf-8')) as {
      max_age_days?: number;
      resources: Array<Record<string, unknown>>;
      emergency: Record<string, unknown>;
    })
  : null;

const ALL = raw === null ? [] : [...raw.resources, raw.emergency];

describe('危机资源可核实性', () => {
  it.skipIf(raw === null)('每条都带 source_url 与 verified_at', () => {
    const missing = ALL.filter((r) => !r.source_url || !r.verified_at).map(
      (r) => String(r.contact ?? '?'),
    );
    expect(missing, `以下条目缺来源或核实日期：${missing.join(', ')}`).toEqual([]);
  });

  it.skipIf(raw === null)('verified_at 是合法日期，且不在未来', () => {
    const bad: string[] = [];
    for (const r of ALL) {
      const d = String(r.verified_at ?? '');
      const t = Date.parse(`${d}T00:00:00Z`);
      if (Number.isNaN(t)) bad.push(`${String(r.contact)}:${d}`);
      else if (t > Date.now() + 24 * 3600 * 1000) bad.push(`${String(r.contact)}:${d}(未来)`);
    }
    expect(bad, `日期不合法：${bad.join(', ')}`).toEqual([]);
  });

  it.skipIf(raw === null)('至少 2 条资源 + 紧急情况，且号码不重复', () => {
    expect(raw!.resources.length).toBeGreaterThanOrEqual(2);
    expect(String(raw!.emergency.contact)).toMatch(/120|110/);
    const contacts = ALL.map((r) => String(r.contact).replace(/\s/g, ''));
    expect(new Set(contacts).size).toBe(contacts.length);
  });

  it.skipIf(raw === null)('页脚取的是最近一次核实日期，不是某个写死的常量', () => {
    expect(latestVerifiedAt()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const newest = ALL.map((r) => String(r.verified_at)).sort().pop();
    expect(latestVerifiedAt()).toBe(newest);
  });

  it('危机的说法本身要覆盖口语，且 `活着没意思` 这类必须触发互斥', () => {
    expect(CRISIS_KEYWORDS.length).toBeGreaterThanOrEqual(10);
    // 互斥是"宁可误报"：半句玩笑也拦，总比把悬崖边的人推给推荐书目好
    const cases = ['活着没意思', '我不想活了', '有自杀的念头', '死了算了'];
    for (const text of cases) {
      const d = { answers: { free_text: text } } as unknown as Diagnosis;
      expect(hasCrisisSignal(d), `「${text}」没触发危机互斥`).toBe(true);
    }
    const normal = { answers: { free_text: '上班好累' } } as unknown as Diagnosis;
    expect(hasCrisisSignal(normal)).toBe(false);
  });

  it('页面上展示的数据与文件一致（防止运行时读到的不是核过的那一份）', () => {
    expect(CRISIS_RESOURCES.resources.map((r) => r.contact)).toEqual(
      (raw?.resources ?? []).map((r) => String(r.contact)),
    );
  });
});
