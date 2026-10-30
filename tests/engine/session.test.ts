// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { clearDiagnosis, loadDiagnosis, saveDiagnosis } from '@/engine/session.js';
import { buildDiagnosis } from '@/engine/diagnose.js';

/**
 * 诊断记录的会话级存取。
 *
 * 缺陷背景：`loadDiagnosis` 以前直接把 JSON.parse 的结果 `as Diagnosis` 放行。
 * 这一格是 sessionStorage——值可能来自旧版本或被同名键顶掉，缺 `excluded_book_ids`
 * 时 `new Set(undefined)` 会抛，结果页整页白屏且没有提示。
 */

const KEY = 'bookrx.diagnosis.v1';

describe('loadDiagnosis', () => {
  it('存进去的能原样读出来', () => {
    const { diagnosis } = buildDiagnosis({ domain: 'emotion', tags: ['anxiety'], primary: 'anxiety' });
    saveDiagnosis(diagnosis);
    expect(loadDiagnosis()?.diagnosis_id).toBe(diagnosis.diagnosis_id);
    clearDiagnosis();
  });

  it('形状不对（缺 excluded_book_ids）→ null，而不是把坏对象交给引擎', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ answers: { domain: 'anxiety' }, need_tags: [] }));
    expect(loadDiagnosis()).toBeNull();
  });

  it('缺 answers → null', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ need_tags: [], excluded_book_ids: [] }));
    expect(loadDiagnosis()).toBeNull();
  });

  it('不是 JSON → null', () => {
    sessionStorage.setItem(KEY, '{坏掉的');
    expect(loadDiagnosis()).toBeNull();
  });

  it('空 → null', () => {
    sessionStorage.removeItem(KEY);
    expect(loadDiagnosis()).toBeNull();
  });
});
