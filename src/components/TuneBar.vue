<script setup lang="ts">
/**
 * 结果页调参条（M1a-E）：难度 / 篇幅(时长) / 紧迫度 三组覆写。
 *
 * 只改**这一次**的计算（computeResult 的 answers 覆写位），不回写诊断、不持久化——
 * 刷新即回到问卷原答案。取消选择（再点一次）= 回退到问卷原值。
 */
import { STEP3_GROUPS } from '@/data/quiz.js';
import ChipRow from './ChipRow.vue';

export type TuneKey = 'time_budget' | 'difficulty_pref' | 'urgency';

const props = defineProps<{ answers: Record<string, string | undefined> }>();

const emit = defineEmits<{ tune: [key: TuneKey, value: string | null] }>();

const TUNABLE: readonly TuneKey[] = ['difficulty_pref', 'urgency', 'time_budget'];
const GROUPS = TUNABLE.map((id) => STEP3_GROUPS.find((g) => g.id === id)).filter(
  (g): g is (typeof STEP3_GROUPS)[number] => g !== undefined,
);

function valueOf(id: string): string | null {
  return props.answers[id] ?? null;
}
</script>

<template>
  <section class="tune">
    <p class="tune-note">调一调再看：只改这一次的排序，刷新后回到问卷答案。</p>
    <ChipRow
      v-for="g in GROUPS"
      :key="g.id"
      :prompt="g.prompt"
      :options="g.options"
      :model-value="valueOf(g.id)"
      @update="(v) => emit('tune', g.id as TuneKey, v)"
    />
  </section>
</template>

<style scoped>
.tune {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 24px;
}

.tune-note {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0 0 12px;
}
</style>
