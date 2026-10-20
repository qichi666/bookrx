<script setup lang="ts">
/**
 * 翻页栏：上一页 / 当前位置 / 下一页。
 *
 * 页码是**本页在本文中的第几页**（按当前字号重新分页的结果），不是"全书第几页"——
 * 换字号后总页数会变，报一个绝对页码只会让人以为进度丢了。
 * 位置感交给「本章 x%」。
 */
defineProps<{
  pageNo: number;
  pageCount: number;
  percent: number;
  atStart: boolean;
  atEnd: boolean;
}>();

const emit = defineEmits<{ prev: []; next: [] }>();
</script>

<template>
  <footer class="reader-foot">
    <button type="button" class="foot-btn" :disabled="atStart" @click="emit('prev')">上一页</button>
    <span class="foot-info">
      {{ pageNo }} / {{ pageCount }} 页 · 本章 {{ Math.round(percent * 100) }}%
    </span>
    <button type="button" class="foot-btn" :disabled="atEnd" @click="emit('next')">下一页</button>
  </footer>
</template>

<style scoped>
.reader-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px calc(6px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
}

.foot-btn {
  min-height: 40px;
  padding: 4px 14px;
  border: 1px solid var(--border-control);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}

.foot-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.foot-info {
  font-size: 0.6875rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
