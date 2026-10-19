<script setup lang="ts">
/**
 * 库外建议卡（SPEC §7.3 路径 D）。
 * badge「未入库」是契约字面量；理由禁引打分口径（数据侧由 assertExternal 断言）。
 * 视觉与库内卡区分：虚线边框——「这不是我们读过的书」要在形状上就看得出来。
 */
import type { ExternalSuggestion } from '@/contracts/external.js';

defineProps<{ suggestion: ExternalSuggestion }>();
</script>

<template>
  <article class="external-card">
    <span class="external-badge">{{ suggestion.badge }}</span>
    <h3 class="book-title">{{ suggestion.title }}</h3>
    <p class="book-author">{{ suggestion.author_display.join(' / ') }}</p>
    <p class="external-reason">{{ suggestion.reason }}</p>
    <p class="external-find">哪里能找到：{{ suggestion.where_to_find }}</p>
  </article>
</template>

<style scoped>
.external-card {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}

.external-badge {
  display: inline-block;
  font-size: 0.6875rem;
  border: 1px solid var(--border-control);
  color: var(--text-muted);
  border-radius: 3px;
  padding: 2px 8px;
  margin-bottom: 8px;
}

.book-title {
  font-size: 1.125rem;
  margin: 0;
}

.book-author {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 2px 0 8px;
}

.external-reason {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0 0 6px;
}

.external-find {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0;
}
</style>
