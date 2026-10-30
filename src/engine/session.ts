import type { Diagnosis } from '@/contracts/diagnosis.js';

/**
 * 诊断记录的会话级存取（sessionStorage）。
 *
 * 只存用户的选择（契约：不存派生值），刷新页面后结果页仍能复算；
 * 关闭标签页即消失——与 SPEC §10.2「数据只存本机、卸载即消失」一致。
 */

const KEY = 'bookrx.diagnosis.v1';

export function saveDiagnosis(d: Diagnosis): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* 隐私模式等场景下写入失败不致命：本次会话内结果页直接消费内存中的诊断 */
  }
}

/**
 * 形状检查的**唯一目的**是别让结果页白屏。
 *
 * 这一格是 sessionStorage，值可能来自旧版本、被手工改过、或被同名键顶掉。
 * 之前直接 `as Diagnosis` 放行：拿到的对象缺 `excluded_book_ids` 时，
 * `computeResult` → `new Set(undefined)` 会抛，整页白屏且没有任何提示。
 * 所以只校验下游会无条件解引用的两个字段，别的宽容放行——校验太严格
 * 反而会让用户正常的诊断记录读不出来。
 */
function looksLikeDiagnosis(v: unknown): v is Diagnosis {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  const answers = d['answers'];
  if (typeof answers !== 'object' || answers === null) return false;
  if (typeof (answers as Record<string, unknown>)['domain'] !== 'string') return false;
  return Array.isArray(d['need_tags']) && Array.isArray(d['excluded_book_ids']);
}

export function loadDiagnosis(): Diagnosis | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return looksLikeDiagnosis(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDiagnosis(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* 同上，静默即可 */
  }
}
