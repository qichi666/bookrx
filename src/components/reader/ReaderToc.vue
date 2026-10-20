<script setup lang="ts">
/** 目录抽屉：章节列表。当前章高亮，位置用 `aria-current` 而不是只靠颜色。 */
defineProps<{
  items: ReadonlyArray<{ title: string; paragraphs: number }>;
  current: number;
}>();

const emit = defineEmits<{ select: [index: number]; close: [] }>();
</script>

<template>
  <aside class="drawer" role="dialog" aria-label="目录">
    <div class="drawer-head">
      <span class="drawer-title">目录</span>
      <button type="button" class="drawer-close" @click="emit('close')">收起</button>
    </div>
    <ol class="toc-list">
      <li v-for="(it, i) in items" :key="i">
        <button
          type="button"
          class="toc-item"
          :class="{ current: i === current }"
          :aria-current="i === current ? 'true' : undefined"
          @click="emit('select', i)"
        >
          <span class="toc-name">{{ it.title }}</span>
          <span class="toc-count">{{ it.paragraphs }} 段</span>
        </button>
      </li>
    </ol>
  </aside>
</template>

<style scoped>
.drawer {
  border-bottom: 1px solid var(--border);
  background: var(--surface-sunken);
  max-height: 52vh;
  overflow: auto;
}

.drawer-head {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--surface-sunken);
  border-bottom: 1px solid var(--border-soft);
}

.drawer-title {
  font-size: 0.8125rem;
  color: var(--text-primary);
}

.drawer-close {
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.toc-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
}

.toc-item:hover {
  background: var(--surface-raised);
}

.toc-item.current {
  color: var(--accent);
  font-weight: 600;
}

.toc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-count {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 0.6875rem;
}
</style>
