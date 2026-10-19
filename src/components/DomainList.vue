<script setup lang="ts">
/**
 * 第 1 屏困境域单选列表。
 * 选中态 = 边框加粗 + 品牌色 + 字重，颜色不单独编码选中态。
 */
import type { ProblemDomain } from '@/contracts/enums.js';
import { DOMAIN_OPTIONS } from '@/data/quiz.js';

defineProps<{ modelValue: ProblemDomain | null }>();

const emit = defineEmits<{ select: [domain: ProblemDomain] }>();
</script>

<template>
  <div class="domain-list">
    <button
      v-for="d in DOMAIN_OPTIONS"
      :key="d.domain"
      type="button"
      class="domain-item"
      :class="{ on: modelValue === d.domain }"
      @click="emit('select', d.domain)"
    >
      {{ d.label }}
    </button>
  </div>
</template>

<style scoped>
.domain-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.domain-item {
  min-height: 44px;
  padding: 10px 16px;
  text-align: left;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.domain-item.on {
  border-color: var(--accent);
  border-width: 2px;
  padding: 9px 15px;
  background: var(--surface-brand);
  color: var(--accent);
  font-weight: 510;
}
</style>
