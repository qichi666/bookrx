import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { buildBooklist, booklistFilename, parseBooklist, serializeBooklist, BOOKLIST_SCHEMA } from '@/engine/booklist.js';
import { computeResult } from '@/engine/result.js';

/**
 * P0-15 书单导出 / 导入。
 *
 * 两条不能松的：
 *  ① 导出的是**选择**（diagnosis），不是分数——分数换个书库版本就会变，
 *     存进文件会让收件人以为"对方的分数"可比；
 *  ② 坏文件必须能@分类：一个笼统的"导入失败"会让人反复重试同一个坏文件。
 */

function realDiagnosis() {
  return buildDiagnosis({
    domain: 'work',
    tags: ['speaking-block', 'evaluation-anxiety'],
    primary: 'speaking-block',
    free_text: '下周要做汇报，一想到要站到前面就手心出汗',
  }).diagnosis;
}

describe('导出', () => {
  it('带 schema、诊断与逐本快照，且不带分数', () => {
    const d = realDiagnosis();
    const f = buildBooklist(d, computeResult(d), 1_700_000_000_000);
    expect(f.schema).toBe(BOOKLIST_SCHEMA);
    expect(f.items.length).toBeGreaterThan(0);
    expect(f.items.length).toBeLessThanOrEqual(5);
    for (const it of f.items) {
      expect(it.book_id).toMatch(/^core:/);
      expect(['strong', 'worth', 'explore']).toContain(it.tier);
      expect(Object.keys(it).sort()).toEqual(['book_id', 'tier', 'title']);
    }
    // 关键：文件里不许出现任何分数字段
    const text = serializeBooklist(f);
    expect(text).not.toContain('score_bp');
    expect(text).not.toContain('primary_hit');
  });

  it('文件名带本地时间，便于人认', () => {
    expect(booklistFilename(new Date(2026, 9, 20, 22, 5).getTime())).toBe('bookrx-booklist-20261020-2205.json');
  });
});

describe('往返', () => {
  it('导出 → 序列化 → 解析，诊断逐字段一致', () => {
    const d = realDiagnosis();
    const f = buildBooklist(d, computeResult(d));
    const parsed = parseBooklist(serializeBooklist(f));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.diagnosis).toEqual(d);
    expect(parsed.value.items).toEqual(f.items);
  });
});

describe('导入失败必须分类', () => {
  const base = () => {
    const d = realDiagnosis();
    return JSON.parse(serializeBooklist(buildBooklist(d, computeResult(d)))) as Record<string, unknown>;
  };

  it('不是 JSON', () => {
    const r = parseBooklist('<html>404</html>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_NOT_JSON');
  });

  it('不是书单文件（schema 不对）', () => {
    const r = parseBooklist(JSON.stringify({ hello: 'world' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_NOT_BOOKLIST');
  });

  it('来自更新版本 → 明确说"比本应用新"，不硬读', () => {
    const obj = base();
    obj.schema = 'bookrx.booklist/9';
    const r = parseBooklist(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_FROM_FUTURE');
  });

  it('结构被改坏（缺 need_tags）', () => {
    const obj = base();
    delete (obj.diagnosis as Record<string, unknown>).need_tags;
    const r = parseBooklist(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_BAD_SHAPE');
  });

  it('need_tags 为空 → 单列一类（重做问卷比"文件坏了"准确）', () => {
    const obj = base();
    (obj.diagnosis as Record<string, unknown>).need_tags = [];
    const r = parseBooklist(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_NO_NEED_TAGS');
  });

  it('items 全是垃圾 → 不假装成功', () => {
    const obj = base();
    obj.items = [{ book_id: 1 }, { title: '没有 id' }];
    const r = parseBooklist(JSON.stringify(obj));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E_BAD_SHAPE');
  });
});

describe('契约文件本身', () => {
  it('schema 字符串与文档一致（改了就换版本号，不许静默变更）', () => {
    const spec = readFileSync(join(process.cwd(), 'docs', 'SPEC.md'), 'utf8');
    // SPEC 里记录了这个字符串；两边不一致说明有一边偷改了格式
    expect(spec).toContain('bookrx.booklist/1');
    expect(BOOKLIST_SCHEMA).toBe('bookrx.booklist/1');
  });
});
