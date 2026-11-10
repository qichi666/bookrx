<script setup lang="ts">
/**
 * 阅读目标卡片（N2）。
 *
 * 语气是这一块的**功能**，不是修辞：
 *  - 落后时不写"你已经落后 X 本"，写"还差 X 本，还有 N 天"——同一个事实，
 *    后者是信息，前者是判决；
 *  - 达成时不放彩带，也不劝他继续加码，只说"已达成"；
 *  - 没有目标时不显示一个 0% 的空进度条，直接问"要不要设一个"。
 *
 * 目标只存在本机 localStorage：它不是阅读数据，是设置项。
 * 清除目标 = 删掉这一行，书架和统计一概不动。
 */
import { computed, reactive, ref } from 'vue';
import { DEFAULT_GOAL, goalProgress, type GoalMetric, type GoalScope, type ReadingGoal } from '@/domain/goal.js';
import { readGoal, saveGoal } from '@/lib/goal-prefs.js';

const props = defineProps<{
  /** 每天的阅读时长（`{ day: 'YYYY-MM-DD', duration_ms }`），来自 sessions 表 */
  sessions: readonly { day: string; duration_ms: number }[];
  /** 本机「标为读完」的那些书的完成日（本地 ISO 日期） */
  finishedDays: readonly string[];
  /** 今天是哪一天，由视图传入（domain 层禁时钟） */
  today: string;
}>();

const goal = ref<ReadingGoal | null>(readGoal());
/** 没设过目标时直接展开表单：还要先点一下"设目标"才让填，是多余的一步 */
const editing = ref(goal.value === null);

const form = reactive({
  scope: (goal.value?.scope ?? DEFAULT_GOAL.scope) as GoalScope,
  metric: (goal.value?.metric ?? DEFAULT_GOAL.metric) as GoalMetric,
  target: goal.value?.target ?? DEFAULT_GOAL.target,
});

const progress = computed(() =>
  goal.value ? goalProgress(goal.value, props.sessions, props.finishedDays, props.today) : null,
);

const unit = computed(() => (goal.value?.metric === 'hours' ? '小时' : '本'));

/** 3.8 就写 3.8，12 就写 12：给整数补 `.0` 会让人以为精度更高 */
function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

const periodLabel = computed(() => {
  const p = progress.value;
  if (!p) return '';
  return p.month ? `${p.year} 年 ${p.month} 月` : `${p.year} 年`;
});

const formError = ref('');

function startEdit(): void {
  const g = goal.value;
  if (g) {
    form.scope = g.scope;
    form.metric = g.metric;
    form.target = g.target;
  }
  formError.value = '';
  editing.value = true;
}

function submit(): void {
  const target = Math.round(Number(form.target));
  if (!Number.isFinite(target) || target < 1) {
    formError.value = '目标要填一个大于 0 的整数。';
    return;
  }
  if (target > 10_000) {
    formError.value = '上限是一万，再大就不是目标了。';
    return;
  }
  const next: ReadingGoal = { scope: form.scope, metric: form.metric, target };
  saveGoal(next);
  goal.value = next;
  formError.value = '';
  editing.value = false;
}

function clear(): void {
  saveGoal(null);
  goal.value = null;
  form.scope = DEFAULT_GOAL.scope;
  form.metric = DEFAULT_GOAL.metric;
  form.target = DEFAULT_GOAL.target;
  editing.value = true;
}
</script>

<template>
  <section class="goal" aria-labelledby="goal-title">
    <h2 id="goal-title" class="goal-title">阅读目标</h2>

    <template v-if="goal && progress && !editing">
      <p class="goal-period">{{ periodLabel }} · 目标 {{ progress.target }} {{ unit }}</p>
      <p class="goal-num">
        <strong>{{ num(progress.done) }}</strong> / {{ progress.target }} {{ unit }}
      </p>
      <div
        class="goal-bar"
        role="progressbar"
        :aria-valuenow="progress.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${periodLabel}目标完成 ${progress.percent}%`"
      >
        <span class="goal-fill" :style="{ width: `${progress.percent}%` }" />
      </div>

      <p class="goal-status" aria-live="polite">
        <template v-if="progress.remaining === 0">已达成。已经读到的书不会因为目标而变多，这里只是一个数字。</template>
        <template v-else-if="progress.daysLeft === 0">还差 {{ num(progress.remaining) }} {{ unit }}。</template>
        <template v-else>
          还差 {{ num(progress.remaining) }} {{ unit }}，这个周期还剩 {{ progress.daysLeft }} 天。
          <span class="goal-pace">{{ progress.onTrack ? '按这个节奏走得下去。' : '比计划的节奏慢一些，把目标改小也算数。' }}</span>
        </template>
      </p>

      <div class="goal-actions">
        <button type="button" class="g-btn" @click="startEdit">改目标</button>
      </div>
    </template>

    <template v-else>
      <p class="goal-intro">
        给自己定一个私密的目标：没有排行榜，没有分享，也不会有人来催。
        <template v-if="!goal">没设过也没关系，现在填一个就好。</template>
      </p>

      <form class="goal-form" @submit.prevent="submit">
        <label class="g-field">
          <span class="g-label">周期</span>
          <select v-model="form.scope" class="g-input">
            <option value="year">每年</option>
            <option value="month">每月</option>
          </select>
        </label>

        <label class="g-field">
          <span class="g-label">按什么算</span>
          <select v-model="form.metric" class="g-input">
            <option value="books">读几本</option>
            <option value="hours">读几小时</option>
          </select>
        </label>

        <label class="g-field">
          <span class="g-label">目标</span>
          <input v-model.number="form.target" class="g-input g-num" type="number" min="1" max="10000" step="1" />
        </label>

        <p v-if="formError" class="goal-err">{{ formError }}</p>

        <div class="goal-actions">
          <button type="submit" class="g-btn g-primary">保存目标</button>
          <button v-if="goal" type="button" class="g-btn" @click="editing = false">取消</button>
          <button v-if="goal" type="button" class="g-btn g-quiet" @click="clear">清除目标</button>
        </div>

        <p class="goal-note">
          改目标会重算整个周期的进度：这个周期里已经读完的书都算进去，
          不是从今天重新起算，也不会因为调低目标而多出几本来。
        </p>
      </form>
    </template>
  </section>
</template>

<style scoped src="../../styles/goal.css"></style>
