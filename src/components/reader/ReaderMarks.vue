<script setup lang="ts">
/**
 * 划线抽屉：本书所有划线 + 笔记。
 *
 * 两条不能省的：
 *  ① **定位失败的划线也要列出来**，并标清原因。悄悄消失等于把用户写的东西弄丢了；
 *  ② 删除是二次确认的（键盘/误触都可能点中），但**笔记本身不随划线删掉**——
 *     划线是位置，笔记是内容，位置找不到时内容更值钱。
 */
import { ref } from 'vue';

export interface MarkEntry {
  id: string;
  quote: string;
  chapterLabel: string;
  note: string;
  /** 定位降级/失败时的说明 */
  warning?: string;
}

const props = defineProps<{ entries: readonly MarkEntry[] }>();
const emit = defineEmits<{
  close: [];
  goto: [id: string];
  remove: [id: string];
  saveNote: [payload: { id: string; body: string }];
}>();

const editing = ref<string | null>(null);
const draft = ref('');
const confirming = ref<string | null>(null);

function startEdit(e: MarkEntry): void {
  editing.value = e.id;
  draft.value = e.note;
}

function save(id: string): void {
  emit('saveNote', { id, body: draft.value.trim() });
  editing.value = null;
}

function askRemove(id: string): void {
  if (confirming.value === id) {
    emit('remove', id);
    confirming.value = null;
    return;
  }
  confirming.value = id;
  void props; // 保持响应式依赖（确认态只影响当前条）
}
</script>

<template>
  <aside class="drawer" role="dialog" aria-label="划线">
    <div class="drawer-head">
      <span class="drawer-title">划线（{{ entries.length }}）</span>
      <button type="button" class="drawer-close" @click="emit('close')">收起</button>
    </div>

    <p v-if="entries.length === 0" class="empty">
      还没有划线。读的时候选中一段文字，会浮出「划线」按钮。
    </p>

    <ul class="mark-list">
      <li v-for="e in entries" :key="e.id" class="mark-item">
        <button type="button" class="quote" @click="emit('goto', e.id)">「{{ e.quote }}」</button>
        <p class="meta">{{ e.chapterLabel }}</p>
        <p v-if="e.warning" class="warning">{{ e.warning }}</p>

        <p v-if="e.note && editing !== e.id" class="note">{{ e.note }}</p>

        <div v-if="editing === e.id" class="editor">
          <textarea v-model="draft" class="note-input" rows="3" placeholder="写点什么（Markdown 子集：加粗、引用）"></textarea>
          <div class="editor-actions">
            <button type="button" class="mini" @click="save(e.id)">保存</button>
            <button type="button" class="mini ghost" @click="editing = null">取消</button>
          </div>
        </div>

        <div v-else class="item-actions">
          <button type="button" class="mini ghost" @click="startEdit(e)">
            {{ e.note ? '改笔记' : '加笔记' }}
          </button>
          <button type="button" class="mini ghost" @click="askRemove(e.id)">
            {{ confirming === e.id ? '确认删除？' : '删除划线' }}
          </button>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.drawer {
  border-bottom: 1px solid var(--border);
  background: var(--surface-sunken);
  max-height: 56vh;
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

.empty {
  padding: 14px 12px;
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.8;
  margin: 0;
}

.mark-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.mark-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
}

.quote {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.8;
  text-align: left;
  cursor: pointer;
}

.quote:hover {
  text-decoration: underline;
}

.meta {
  margin: 4px 0 0;
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.warning {
  margin: 6px 0 0;
  padding-left: 8px;
  border-left: 2px solid var(--info);
  font-size: 0.6875rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

.note {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.8;
}

.editor {
  margin-top: 8px;
}

.note-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--border-control);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.7;
  resize: vertical;
}

.editor-actions,
.item-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.mini {
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 2px 0;
}

.mini.ghost {
  color: var(--text-muted);
}
</style>
