<script setup lang="ts">
/**
 * P1 问卷（SPEC §6.1 四屏）：① 困境域 → ② 标签多选（≤3，同屏追问主诉）
 * → ③ 5 组 chip（全部可跳）→ ④ 自由文本。
 *
 * 派生一律延迟到结果页：这里只收集选择并落 `Diagnosis`（sessionStorage），
 * 难度上限、各因子 target 等派生值不在此计算。
 */
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ProblemDomain, ProblemTagId } from '@/contracts/enums.js';
import {
  INCLUDE_HEAVY_PROMPT,
  STEP3_GROUPS,
  TAG_OPTIONS,
} from '@/data/quiz.js';
import { buildDiagnosis } from '@/engine/diagnose.js';
import { saveDiagnosis } from '@/engine/session.js';
import ChipRow from '@/components/ChipRow.vue';
import DomainList from '@/components/DomainList.vue';
import SearchPanel from '@/components/SearchPanel.vue';
import TagPicker from '@/components/TagPicker.vue';

const router = useRouter();

const step = ref(1);
const domain = ref<ProblemDomain | null>(null);
const selected = ref<ProblemTagId[]>([]);
const primary = ref<ProblemTagId | null>(null);
const chips = reactive<Record<string, string | null>>({
  time_budget: null,
  difficulty_pref: null,
  urgency: null,
  form_pref: null,
  depth_pref: null,
});
const includeHeavy = ref<boolean | null>(null);
const freeText = ref('');

const tagOptions = computed(() => (domain.value ? TAG_OPTIONS[domain.value] : []));

function tagLabel(t: ProblemTagId): string {
  return tagOptions.value.find((o) => o.tag === t)?.label ?? t;
}

function chooseDomain(d: ProblemDomain): void {
  domain.value = d;
  selected.value = [];
  primary.value = null;
}

function toggleTag(t: ProblemTagId): void {
  const i = selected.value.indexOf(t);
  if (i >= 0) {
    selected.value.splice(i, 1);
    if (primary.value === t) primary.value = null;
  } else if (selected.value.length < 3) {
    selected.value.push(t);
  }
}

const canNext = computed(() => {
  if (step.value === 1) return domain.value !== null;
  if (step.value === 2) {
    // 多选时主诉必须显式指定（契约：primary_source 不允许 'order'，不按顺序猜）
    return selected.value.length >= 1 && (selected.value.length === 1 || primary.value !== null);
  }
  return true;
});

function next(): void {
  if (!canNext.value) return;
  if (step.value < 4) step.value += 1;
  else submit();
}

function back(): void {
  if (step.value > 1) step.value -= 1;
}

function submit(): void {
  if (!domain.value || selected.value.length === 0) return;
  const { diagnosis } = buildDiagnosis({
    domain: domain.value,
    tags: selected.value,
    primary: primary.value ?? selected.value[0]!,
    time_budget: (chips.time_budget ?? undefined) as '10m' | '30m' | '1h+' | undefined,
    difficulty_pref: (chips.difficulty_pref ?? undefined) as 'easy' | 'challenge' | 'hard' | undefined,
    urgency: (chips.urgency ?? undefined) as '3w' | '1m' | 'none' | undefined,
    form_pref: (chips.form_pref ?? undefined) as 'story' | 'method' | 'framework' | undefined,
    depth_pref: (chips.depth_pref ?? undefined) as 'howto' | 'howto_why' | 'why' | undefined,
    include_heavy: includeHeavy.value ?? undefined,
    free_text: freeText.value.trim().length > 0 ? freeText.value.trim() : undefined,
  });
  saveDiagnosis(diagnosis);
  void router.push('/result');
}
</script>

<template>
  <section class="quiz">
    <header class="quiz-head">
      <p class="quiz-step-label">第 {{ step }} / 4 屏</p>
      <h1 class="quiz-title">说说你现在的处境</h1>
    </header>

    <!-- 第 1 屏：搜索快路径 + 困境域 -->
    <div v-if="step === 1" class="quiz-body">
      <SearchPanel />
      <p class="quiz-lead">或者从这几类里选——哪一类最接近你此刻的状态？</p>
      <DomainList :model-value="domain" @select="chooseDomain" />
    </div>

    <!-- 第 2 屏：标签多选 + 主诉追问 -->
    <div v-else-if="step === 2 && domain" class="quiz-body">
      <p class="quiz-lead">具体是哪种感觉？最多选 3 项。</p>
      <TagPicker :options="tagOptions" :selected="selected" :max="3" @toggle="toggleTag" />
      <div v-if="selected.length >= 2" class="primary-ask">
        <ChipRow
          prompt="哪个最急？"
          :options="selected.map((t) => ({ value: t, label: tagLabel(t) }))"
          :model-value="primary"
          @update="(v) => (primary = (v as ProblemTagId) ?? null)"
        />
      </div>
    </div>

    <!-- 第 3 屏：5 组 chip，全部可跳 -->
    <div v-else-if="step === 3" class="quiz-body">
      <p class="quiz-lead">几个读书偏好，不选就跳过。</p>
      <ChipRow
        v-for="g in STEP3_GROUPS"
        :key="g.id"
        :prompt="g.prompt"
        :options="g.options"
        :model-value="chips[g.id] ?? null"
        @update="(v) => (chips[g.id] = v)"
      />
      <ChipRow
        :prompt="INCLUDE_HEAVY_PROMPT"
        :options="[
          { value: 'no', label: '这次不放进来' },
          { value: 'yes', label: '可以一起看' },
        ]"
        :model-value="includeHeavy === null ? null : includeHeavy ? 'yes' : 'no'"
        @update="(v) => (includeHeavy = v === null ? null : v === 'yes')"
      />
    </div>

    <!-- 第 4 屏：自由文本 -->
    <div v-else class="quiz-body">
      <p class="quiz-lead">用自己的话说说现在的处境（可跳过）。</p>
      <textarea
        v-model="freeText"
        class="free-text"
        rows="4"
        placeholder="比如：每次开会轮到我说话，脑子就一片空白"
      ></textarea>
    </div>

    <footer class="quiz-nav">
      <button v-if="step > 1" type="button" class="btn-ghost" @click="back">上一步</button>
      <button type="button" class="btn-primary" :disabled="!canNext" @click="next">
        {{ step === 4 ? '看推荐' : '下一步' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.quiz {
  max-width: 480px;
  margin: 0 auto;
  padding: 32px 16px;
}

.quiz-step-label {
  color: var(--text-muted);
  font-size: 0.75rem;
  letter-spacing: 0.01em;
  margin: 0 0 4px;
}

.quiz-title {
  font-size: 1.75rem;
  margin: 0 0 8px;
}

.quiz-lead {
  color: var(--text-secondary);
  margin: 0 0 16px;
}

.quiz-body {
  margin-bottom: 24px;
}

.primary-ask {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}

.free-text {
  width: 100%;
  box-sizing: border-box;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
  resize: vertical;
}

.quiz-nav {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.btn-ghost {
  min-height: 44px;
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.btn-primary {
  min-height: 44px;
  padding: 8px 24px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-primary:active {
  background: var(--accent-active);
}

.btn-primary:disabled {
  background: var(--surface-sunken);
  color: var(--text-disabled);
  cursor: not-allowed;
}
</style>
