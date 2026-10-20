<script setup lang="ts">
/**
 * 选区浮条：选中一段文字后浮在页底，只给一个动作——划线。
 *
 * 只有「划线」一个按钮是刻意的：这里多做"复制/分享/搜索"很容易，
 * 但每多一个按钮，手指就更容易点错，而划线结果是要长期留存的。
 * 已经划过的位置不重复提示（由页面层判断）。
 */
defineProps<{ quote: string }>();
const emit = defineEmits<{ apply: []; dismiss: [] }>();

function clipped(q: string): string {
  return q.length > 24 ? `${q.slice(0, 24)}…` : q;
}
</script>

<template>
  <div class="mark-tip">
    <span class="tip-text">「{{ clipped(quote) }}」</span>
    <button type="button" class="btn-primary tip-btn" @click="emit('apply')">划线</button>
    <button type="button" class="tip-cancel" aria-label="取消" @click="emit('dismiss')">×</button>
  </div>
</template>

<style scoped>
.mark-tip {
  position: fixed;
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 92vw;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface-raised);
  border: 1px solid var(--border-control);
  box-shadow: var(--shadow-pop);
}

.tip-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tip-btn {
  min-height: 32px;
  padding: 2px 12px;
  font-size: 0.75rem;
}

.tip-cancel {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1;
  padding: 4px;
  cursor: pointer;
}
</style>
