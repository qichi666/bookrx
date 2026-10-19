/**
 * 契约模块：telemetry（SPEC §10.2，v2.2 裁决②）
 *
 * **不做任何上报**：应用不发任何网络请求。这份结构只活在 localStorage，
 * 供 About 页展示聚合视图。键名进契约的理由与其它契约一致：
 * 不让字符串字面量散落在组件里，机械可校验。
 *
 * 与 `docs/types-draft.ts` 的 TelemetryCounters 逐字一致（生成器恢复后可机械重切）。
 * 自由文本**绝不入计数**——那是最敏感的字段，聚合视图只需要域与档位。
 */

export interface TelemetryCounters {
  version: 1;
  /** 结果页渲染次数（同一 diagnosis_id 只计一次） */
  total: number;
  /** 困境域计数（大家都卡在哪） */
  domain_counts: Record<string, number>;
  /** 档位计数（strong / worth / explore） */
  tier_counts: Record<string, number>;
  /** 去重护栏：同一诊断只在第一次出结果时计数 */
  last_diagnosis_id: string | null;
}
