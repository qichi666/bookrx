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

export function loadDiagnosis(): Diagnosis | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Diagnosis;
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
