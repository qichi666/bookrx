<script setup lang="ts">
/**
 * 诊断摘要条（结果页第一块）。
 *
 * 唯一的硬约束：**逐字回显用户原词**（`need_tags.user_phrase`），不许改写、不许概括。
 * 用户在这里要认出来的应该是"我自己刚才说的话"，而不是"系统对我做的总结"。
 * 主诉单独加粗，是因为后续推荐的排序就是围绕主诉算的——用户有权知道是哪一条在起作用。
 */
defineProps<{
  domainLabel: string;
  echoes: Array<{ phrase: string; isPrimary: boolean }>;
  judgmentLine: string;
}>();
</script>

<template>
  <header class="summary">
    <p class="summary-lead">你正在面对（{{ domainLabel }}）：</p>
    <p class="summary-echo">
      <template v-for="(e, i) in echoes" :key="i">
        <mark :class="{ primary: e.isPrimary }">{{ e.phrase }}</mark>{{ i < echoes.length - 1 ? '、' : '' }}
      </template>
    </p>
    <p v-if="judgmentLine" class="summary-judgment">{{ judgmentLine }}</p>
  </header>
</template>

<style scoped>
.summary {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 24px;
}

.summary-lead {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0 0 6px;
}

.summary-echo {
  font-size: 1rem;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.summary-echo mark {
  background: var(--surface-brand);
  color: var(--text-primary);
  padding: 1px 4px;
  border-radius: 3px;
}

.summary-echo mark.primary {
  font-weight: 590;
}

.summary-judgment {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0;
}
</style>
