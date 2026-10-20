<script setup lang="ts">
/**
 * 书架上一本书。
 *
 * 三条约束写在这里，因为它们是「删书」这件事的全部风险：
 *  ① 删除是**两步**的（第一次点只进入确认态），且必须说清"划线和笔记会留下"；
 *  ② 「读完」只能由用户自己点——系统不替他判断（读到 99% 也不等于读完）；
 *  ③ 进度条只在"有进度"时画，0% 画一条空槽等于天天提醒人没读书。
 */
import { computed } from 'vue';
import { humanCount, percentText, relativeTime } from '@/lib/format.js';
import type { ShelfBook } from '@/domain/shelf.js';

const props = defineProps<{ book: ShelfBook; confirming: boolean }>();
const emit = defineEmits<{
  open: [id: string];
  remove: [id: string];
  askRemove: [id: string];
  move: [payload: { id: string; group: ShelfBook['group'] }];
  cancel: [];
}>();

const meta = computed(() => {
  const bits = [humanCount(props.book.words)];
  if (props.book.lastOpenedAt) bits.push(`上次打开 ${relativeTime(props.book.lastOpenedAt)}`);
  return bits.join(' · ');
});

const canRead = computed(() => props.book.group !== 'finished');
</script>

<template>
  <li class="shelf-item">
    <button type="button" class="item-main" @click="emit('open', book.id)">
      <span class="item-title">{{ book.title }}</span>
      <span class="item-author">{{ book.author }}</span>
      <span class="item-meta">{{ meta }}</span>
      <span v-if="book.percent > 0" class="bar" :aria-label="`已读 ${percentText(book.percent)}`">
        <span class="bar-fill" :style="{ width: percentText(book.percent) }" />
      </span>
    </button>

    <div class="item-actions">
      <button v-if="canRead" type="button" class="mini" @click="emit('open', book.id)">
        {{ book.percent > 0 ? '继续读' : '开始读' }}
      </button>
      <button
        v-if="book.group !== 'finished'"
        type="button"
        class="mini ghost"
        @click="emit('move', { id: book.id, group: 'finished' })"
      >标为读完</button>
      <button
        v-else
        type="button"
        class="mini ghost"
        @click="emit('move', { id: book.id, group: 'reading' })"
      >重新在读</button>

      <template v-if="confirming">
        <button type="button" class="mini danger" @click="emit('remove', book.id)">确认删除</button>
        <button type="button" class="mini ghost" @click="emit('cancel')">取消</button>
      </template>
      <button v-else type="button" class="mini ghost" @click="emit('askRemove', book.id)">删除</button>
    </div>

    <p v-if="confirming" class="confirm-note">
      删除后这本书的正文与进度会被清掉，划线和笔记会保留。想反悔只能重新导入。
    </p>
  </li>
</template>

<style scoped>
.shelf-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border-soft);
}

.item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.item-title {
  font-family: var(--font-book);
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.item-author {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.item-meta {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.bar {
  display: block;
  height: 3px;
  margin-top: 6px;
  background: var(--tier-track);
  border-radius: 2px;
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--accent);
}

.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

.mini {
  min-height: 32px;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.mini.ghost {
  color: var(--text-muted);
}

.mini.danger {
  color: var(--danger);
}

.confirm-note {
  margin: 8px 0 0;
  padding-left: 8px;
  border-left: 2px solid var(--danger);
  font-size: 0.6875rem;
  color: var(--text-secondary);
  line-height: 1.7;
}
</style>
