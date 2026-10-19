<script setup lang="ts">
/**
 * 第 2 屏困境标签多选（≤ max）。
 * 选满后未选项禁用；选中态 = 边框加粗 + 品牌色 + aria-pressed，颜色不单独编码。
 */
import type { ProblemTagId } from '@/contracts/enums.js';
import type { TagOption } from '@/data/quiz.js';

const props = defineProps<{
  options: readonly TagOption[];
  selected: readonly ProblemTagId[];
  max: number;
}>();

const emit = defineEmits<{ toggle: [tag: ProblemTagId] }>();

function disabled(o: TagOption): boolean {
  return !props.selected.includes(o.tag) && props.selected.length >= props.max;
}
</script>

<template>
  <div class="chips">
    <button
      v-for="o in options"
      :key="o.tag"
      type="button"
      class="chip"
      :class="{ on: selected.includes(o.tag) }"
      :aria-pressed="selected.includes(o.tag)"
      :disabled="disabled(o)"
      @click="emit('toggle', o.tag)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  min-height: 44px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.chip.on {
  border-color: var(--accent);
  border-width: 2px;
  padding: 7px 15px;
  background: var(--surface-brand);
  color: var(--accent);
  font-weight: 510;
}

.chip:disabled {
  color: var(--text-disabled);
  border-color: var(--border);
  cursor: not-allowed;
}
</style>
