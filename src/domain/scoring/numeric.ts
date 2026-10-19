/**
 * 定点算术（SPEC §6.3 ⑦）：全项目所有 `*_hit` / `*_fit` / `score` 都是 0–10000 的整型基点，
 * 不是 0–1 的小数。混用不会报错，只会让「`primary_hit ≥ 8000`」这类判据恒为假或恒为真。
 */

export const BP_SCALE = 10000;

/** ratio ∈ [0,1] → 基点。这是唯一允许产生 `*_bp` 的入口。 */
export function bp(ratio: number): number {
  return Math.round(BP_SCALE * ratio);
}

export function clampBp(value: number): number {
  if (value < 0) return 0;
  if (value > BP_SCALE) return BP_SCALE;
  return Math.round(value);
}

/**
 * 最大余额法：把 `total` 按 `raws` 的比例分成整数，**保证 Σ 结果 === total**。
 *
 * 为什么不用「各自 round 再求和」：七个因子各 round 一次，误差最多 ±3.5 bp，
 * 而 SPEC §5.3 的硬校验是「7 个 `contribution` 之和必须严格等于 `score_bp`」。
 * 让和等于分数这件事必须在**分配这一步**就成立，不能靠事后补差。
 *
 * 排序键是 `(余额降序, 下标升序)`，因此**结果与输入顺序无关**，
 * 满足「打乱 200 次结果一致」这条可复现性断言。
 */
export function allocateToTotal(raws: readonly number[], total: number): number[] {
  const sum = raws.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('allocateToTotal: 权重和为 0，无法分配');

  const exact = raws.map((r) => (r * total) / sum);
  const floors = exact.map((e) => Math.floor(e));
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));

  const out = floors.slice();
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] = (out[i] as number) + 1;
    remainder -= 1;
  }
  return out;
}
