import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { TelemetryCounters } from '@/contracts/telemetry.js';

/**
 * 本地匿名计数（SPEC §10.2，v2.2 裁决②）。
 *
 * 三条铁律：
 * ① **永不上报**——只写 localStorage，卸载即消失；
 * ② **自由文本绝不入计数**——只记困境域与结果档位两个聚合维度；
 * ③ 同一 diagnosis_id 只计一次（调参重算不重复累加）。
 */

const KEY = 'bookrx.counters.v1';

/** 每次全新建对象——浅拷贝 EMPTY 会让 domain_counts / tier_counts 共享引用，
 * bump 直接改到模块级对象上，计数跨诊断、跨会话静默累加。 */
function emptyCounters(): TelemetryCounters {
  return {
    version: 1,
    total: 0,
    domain_counts: {},
    tier_counts: {},
    last_diagnosis_id: null,
  };
}

export function readCounters(): TelemetryCounters {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyCounters();
    return JSON.parse(raw) as TelemetryCounters;
  } catch {
    return emptyCounters();
  }
}

function writeCounters(c: TelemetryCounters): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* 隐私模式写入失败不致命：计数是锦上添花，不是功能依赖 */
  }
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** 结果页渲染时调用。同一诊断只计一次；档位由调用方传入（tierOf 的结果）。
 * `dxs:` 前缀 = 搜索入口合成的临时诊断，不计数（搜索是只读浏览，方案承诺）。 */
export function recordResult(diagnosis: Diagnosis, tiers: readonly string[]): void {
  if (diagnosis.diagnosis_id.startsWith('dxs:')) return;
  const c = readCounters();
  if (c.last_diagnosis_id === diagnosis.diagnosis_id) return;
  c.total += 1;
  bump(c.domain_counts, diagnosis.answers.domain);
  for (const t of tiers) bump(c.tier_counts, t);
  c.last_diagnosis_id = diagnosis.diagnosis_id;
  writeCounters(c);
}

/** 用户主动清零（About 页按钮）。 */
export function resetCounters(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
}
