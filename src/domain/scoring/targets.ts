import type { Diagnosis } from '@/contracts/diagnosis.js';
import type { DepthLevel, FactorId, FormType, LengthClass } from '@/contracts/enums.js';

export type LoadValue = 25 | 50 | 75;
export type UrgencyValue = 25 | 50 | 75;

export interface AxisTargets {
  /** 认知负荷，只能取 25 / 50 / 75（见文件末尾的「取整陷阱」说明） */
  load: LoadValue;
  /** `1 + 4×load/100` → 2 / 3 / 4。恒为整数 */
  difficulty_target: number;
  /** 难度硬上限：越轻松 2 / 有点挑战 3 / 不怕难 5 */
  difficulty_cap: number;
  /** 紧迫度：3w 75 / 1m 50 / none 25。读数越低越不急 */
  urgency: UrgencyValue;
  /** `1 + 4×(100−urgency)/100` → 急 2（要易读）/ 不急 4（可啃硬文字）。**方向不能反** */
  readability_target: number;
  /** `null` = 不限（→ 7000）。见文件末尾「不限为什么必须可达」 */
  length_target: LengthClass | null;
  form_target: FormType | null;
  depth_target: DepthLevel | null;
  /** 本次实际参与打分的因子。跳答的组所对应的因子整条移除 */
  active_factors: readonly FactorId[];
}

const LOAD_BY_PREF = { easy: 25, challenge: 50, hard: 75 } as const;
const CAP_BY_PREF = { easy: 2, challenge: 3, hard: 5 } as const;
const URGENCY_BY_ANSWER = { '3w': 75, '1m': 50, none: 25 } as const;
/**
 * 篇幅默认值。**10m→2 这一档取自 `ARCH §3.9` 的算例**（该算例里 3-a 选 10 分钟、
 * 篇幅目标 = `length_class = 2`，A 与 F 都因档差 0 拿满 10000）。
 * 30m→3、1h+→不限 是按同一单调方向补的两档。
 *
 * 「不限」为什么必须可达：`time_budget` 未答时 `length` 因子整条移除（不是给 7000），
 * 所以「不限 → 7000」这个分支只能由某个**已答**选项触发，即 `1h+`。
 * 若把 1h+ 也映射成具体档，`SPEC §6.2` 的「不限 → 7000」就成了死代码。
 */
const LENGTH_BY_BUDGET = { '10m': 2, '30m': 3, '1h+': null } as const;

export function deriveTargets(d: Diagnosis): AxisTargets {
  const a = d.answers;

  const load: LoadValue = a.difficulty_pref ? LOAD_BY_PREF[a.difficulty_pref] : 50;
  const difficulty_cap: number = a.difficulty_pref ? CAP_BY_PREF[a.difficulty_pref] : 5;
  const urgency: UrgencyValue = a.urgency ? URGENCY_BY_ANSWER[a.urgency] : 50;

  const active: FactorId[] = ['problem', 'availability'];
  if (a.difficulty_pref) active.push('difficulty');
  if (a.urgency) active.push('readability');
  if (a.form_pref) active.push('form');
  if (a.depth_pref) active.push('depth');
  if (a.time_budget) active.push('length');

  return {
    load,
    difficulty_target: 1 + (4 * load) / 100,
    difficulty_cap,
    urgency,
    readability_target: 1 + (4 * (100 - urgency)) / 100,
    length_target: a.time_budget ? (LENGTH_BY_BUDGET[a.time_budget] as LengthClass | null) : null,
    form_target: a.form_pref ?? null,
    depth_target: a.depth_pref ?? null,
    active_factors: active,
  };
}

/*
 * 取整陷阱（SPEC §6.1，抄在这里是因为它会被"顺手改成 60"）：
 * 所有产生 target 的选项取值只能落在 25 / 50 / 75，因为 `target = 1 + 4×x/100`
 * 而书的属性是整数刻度（1–5）。x 取 60 时 target = 3.4，没有任何一本书能落在 3.4 上，
 * 最接近的整数距离 0.4 → `difficulty.fit` 最高只能到 9000，永远拿不到 10000。
 * 后果比"少 100 分"严重：选了非整数档的用户在结构上永远拿不到 strong——
 * 那不是偏好差异，是系统性歧视某一类答题者。
 *
 * 已知缺口（不假装已解决）：SPEC §6.1 说 `time_budget` 驱动「认知负荷修正 + 篇幅默认值」，
 * 但 §6.2 里 认知负荷 只由 `difficulty_pref` 决定，没有给出修正公式。
 * 任何把 load 移出 {25,50,75} 的修正都会立刻触发上面的取整陷阱，
 * 所以这里**只让 time_budget 决定篇幅**，认知负荷不加修正。
 *
 * 「不限」为什么必须可达：`time_budget` 未答时 length 因子整条移除（不是给 7000），
 * 所以「不限 → 7000」这个分支只能由某个**已答**选项触发，即 `1h+`。
 * 若把 1h+ 映射成 3 或 4，「不限」就成了死代码——而 SPEC §6.2 明写了它的取值。
 */
