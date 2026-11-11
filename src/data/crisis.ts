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
  /**
   * 能直接拨出去的号码。
   *
   * 与 `contact` 分开是因为两件事不一样：`contact` 是**给人读的**（「120 / 110」
   * 这样挤在一行里最省眼），`tel` 是**给拨号盘读的**（一个号码一个 href）。
   * 早先只有 `contact`，于是整页号码是纯文本——在手机上要长按、复制、切到
   * 拨号盘粘贴，而这一页恰恰是最不该多一步的地方。
   *
   * 缺省时不渲染链接，退回纯文本：数据没告诉我们怎么拨，就不要编一个 `tel:`。
   */
  tel?: string | readonly string[];
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

/**
 * 一条资源可拨打的号码列表（`tel:` 只接一个号码，所以「120 / 110」要拆开）。
 * 返回空数组表示「这份数据没给可拨号码」，调用方应退回纯文本。
 */
export function telNumbers(r: CrisisResource): string[] {
  if (r.tel === undefined) return [];
  const list: readonly string[] = typeof r.tel === 'string' ? [r.tel] : r.tel;
  return list.map((t) => t.trim()).filter((t) => t.length > 0);
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
