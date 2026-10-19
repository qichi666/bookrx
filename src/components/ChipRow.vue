<script setup lang="ts">
/**
 * 单选 chip 行（第 3 屏五组与第 2 屏主诉追问共用）。
 *
 * 再点一次已选项 = 取消选择（回到「跳过」），这是跳答的入口：
 * SPEC §6.1 禁止给未观测维度填中性值，所以「跳过」必须是一等公民，不是隐藏功能。
 */
defineProps<{
  prompt: string;
  options: readonly { value: string; label: string }[];
  modelValue: string | null;
}>();

const emit = defineEmits<{ update: [value: string | null] }>();
</script>

<template>
  <fieldset class="chip-row">
    <legend class="chip-prompt">{{ prompt }}</legend>
    <div class="chips">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        class="chip"
        :class="{ on: modelValue === o.value }"
        :aria-pressed="modelValue === o.value"
        @click="emit('update', modelValue === o.value ? null : o.value)"
      >
        {{ o.label }}
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.chip-row {
  border: none;
  padding: 0;
  margin: 0 0 20px;
}

.chip-prompt {
  font-size: 1rem;
  color: var(--text-secondary);
  padding: 0;
  margin-bottom: 8px;
}

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
  padding: 7px 15px; /* 加粗边框后补回 1px，避免布局跳动 */
  background: var(--surface-brand);
  color: var(--accent);
  font-weight: 510;
}
</style>
