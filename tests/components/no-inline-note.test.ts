// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { Diagnosis } from '@/contracts/diagnosis.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { domainsWithoutInline } from '@/data/library-index.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { TAG_OPTIONS } from '@/data/quiz.js';
import ResultView from '@/views/ResultView.vue';

/**
 * P0-17「结构性没有可直读正文」的域说明条。
 *
 * 它解释的是一个**永久缺口**，所以测试盯的四件事都是"别越界"：
 *  ① 只在该域的库里一本 inline 都没有时才出现（数据驱动，不写死域名单）；
 *  ② 位置在推荐之前（等用户翻完 5 张卡再解释，他心里已经有结论了）；
 *  ③ 是说明不是道歉 —— 四个道歉词一个都不许出现；
 *  ④ 可折叠（`details` + `summary`），且文案与"有没有阅读器"一致。
 */

const KEY = 'bookrx.diagnosis.v1';
const APOLOGY = ['抱歉', '暂不支持', '资源缺失', '敬请期待'];

function dx(domain: 'emotion' | 'work' | 'habits' | 'thinking'): Diagnosis {
  const tags = {
    emotion: ['low-mood', 'anxiety'],
    work: ['speaking-block', 'burnout'],
    habits: ['procrastination', 'cant-persist'],
    thinking: ['decision-difficulty', 'info-overload'],
  } as const;
  const { diagnosis } = buildDiagnosis({ domain, tags: [...tags[domain]], primary: tags[domain][0] });
  return diagnosis;
}

function mountWith(d: Diagnosis) {
  sessionStorage.setItem(KEY, JSON.stringify(d));
  return mount(ResultView);
}

function findNote(w: ReturnType<typeof mount>) {
  const note = w.find('[data-no-inline-note]');
  if (!note.exists()) throw new Error('没有找到说明条 —— 扫描对象为空，属未验证');
  return note;
}

beforeEach(() => sessionStorage.clear());

describe('结构性无 inline 域的说明条（P0-17）', () => {
  it('数据侧独立重算：说明条覆盖的正是"一本 inline 都没有"的那些域', () => {
    const inlineDomains = new Set<string>();
    for (const b of SEED_BOOKS.filter((x) => x.availability === 'inline')) {
      for (const [domain, opts] of Object.entries(TAG_OPTIONS)) {
        if ((b.problem_tags ?? []).some((p) => opts.some((o) => o.tag === p.tag))) inlineDomains.add(domain);
      }
    }
    const expected = (Object.keys(TAG_OPTIONS) as string[]).filter((d) => !inlineDomains.has(d));
    const actual = [...domainsWithoutInline()];

    // 两个极端都不许出现：全显示（等于没在判断）、全不显示（说明条永远不出现）
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.length).toBeLessThan(6);
    expect([...actual].sort()).toEqual([...expected].sort());
    // 工作与意义域有《围炉夜话》，情绪域有《曾国藩家书》（self-doubt），都必须被排除
    expect(actual).not.toContain('work');
    expect(actual).not.toContain('emotion');
  });

  it('无公版书的域显示，且是说明不是道歉', () => {
    const note = findNote(mountWith(dx('habits')));
    const text = note.text();
    for (const w of APOLOGY) expect(text).not.toContain(w);
    expect(text).toContain('推荐和理由照常');
  });

  it('可折叠（details + summary），不是一段不可收起的灰字', () => {
    const note = findNote(mountWith(dx('habits')));
    expect(note.element.tagName.toLowerCase()).toBe('details');
    expect(note.find('summary').exists()).toBe(true);
  });

  it('位置在推荐之前（先解释再给书单）', () => {
    const w = mountWith(dx('habits'));
    const html = w.html();
    const noteAt = html.indexOf('data-no-inline-note');
    const cardAt = html.indexOf('book-card');
    expect(noteAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(-1);
    expect(noteAt).toBeLessThan(cardAt);
  });

  it('文案与当前能力一致：没有阅读器就不能说「导入后就能读」', () => {
    const w = mountWith(dx('habits'));
    expect(w.html()).not.toContain('导入后就能读');
    expect(w.html()).toContain('本站不提供正文');
  });

  it('有可直读书的域不显示（工作与意义域有《围炉夜话》，情绪域有《曾国藩家书》）', () => {
    for (const d of ['work', 'emotion'] as const) {
      const w = mountWith(dx(d));
      expect(w.find('[data-no-inline-note]').exists()).toBe(false);
    }
  });

  it('命中危机信号时不显示（那一页只有资源，不需要解释书从哪来）', () => {
    const d = buildDiagnosis({
      domain: 'habits',
      tags: ['procrastination'],
      primary: 'procrastination',
      free_text: '活着没意思',
    }).diagnosis;
    const w = mountWith(d);
    expect(w.find('[data-no-inline-note]').exists()).toBe(false);
  });
});
