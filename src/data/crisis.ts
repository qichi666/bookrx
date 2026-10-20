import resourcesJson from '../../catalog/crisis-resources.json';

/**
 * 心理援助资源（危机资源条数据源）。
 *
 * `verified_at` / `source_url` 是**每条各自**的，不是全局一句「清单核对日期」——
 * 全局日期只说明"某天有人看过这份文件"，说明不了具体某个号码是从哪来的。
 * `tools/crisis-audit.mjs` 会在任一超过 90 天未核实时非零退出。
 */
export interface CrisisResource {
  name: string;
  contact: string;
  scope?: string;
  hours?: string;
  note?: string;
  /** 官方/权威来源页。没有来源的号码等于无法核实。 */
  source_url: string;
  source_note?: string;
  /** 最近一次核对的日期（YYYY-MM-DD） */
  verified_at: string;
  /** 核实方式：只核对了官方页面，还是实际拨通过 */
  verify_method?: 'official-page' | 'phone';
}

export interface CrisisResourceData {
  note: string;
  verified_at: string;
  max_age_days?: number;
  resources: CrisisResource[];
  emergency: CrisisResource;
}

export const CRISIS_RESOURCES = resourcesJson as unknown as CrisisResourceData;

/** 全清单里最近一次的核实日期（页脚用）。 */
export function latestVerifiedAt(data: CrisisResourceData = CRISIS_RESOURCES): string {
  const all = [...data.resources, data.emergency].map((r) => r.verified_at).sort();
  return all[all.length - 1] ?? data.verified_at;
}
