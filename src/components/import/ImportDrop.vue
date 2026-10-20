<script setup lang="ts">
/**
 * 导入投放区：拖进来或点开选文件。
 *
 * 两个细节是刻意的：
 *  ① 接受 `accept=".epub,.txt"` **但不在选择框上做硬限制**——有些系统的文件选择器
 *     会因为扩展名不标准（`.EPUB`、`.text`）把文件变灰，用户会以为"我的书不支持"。
 *     真正的格式判定在导入流水线里（按魔数嗅探，不认扩展名）。
 *  ② 拖动期间整个区域变色 + 说出"松手即可"，因为拖到一半松手是常见失败。
 */
import { ref } from 'vue';

const emit = defineEmits<{ pick: [file: File]; error: [message: string] }>();
const dragging = ref(false);
const input = ref<HTMLInputElement | null>(null);

function onDrop(e: DragEvent): void {
  dragging.value = false;
  const f = e.dataTransfer?.files?.[0];
  if (f) emit('pick', f);
  else emit('error', '没拿到文件。再拖一次，或者点下面的按钮选文件。');
}

function onChange(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) emit('pick', f);
}

function openPicker(): void {
  input.value?.click();
}
</script>

<template>
  <div
    class="drop"
    :class="{ over: dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <p class="drop-main">{{ dragging ? '松手即可导入' : '把 EPUB 或 TXT 拖到这里' }}</p>
    <p class="drop-hint">或者</p>
    <button type="button" class="btn-primary" @click="openPicker">选一个文件</button>
    <input ref="input" type="file" class="hidden-input" accept=".epub,.txt" @change="onChange" />
    <p class="drop-note">单本上限 50 MB。文件不会上传——解析和保存都在你的浏览器里完成。</p>
  </div>
</template>

<style scoped>
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 16px;
  border: 1px dashed var(--border-control);
  border-radius: 10px;
  background: var(--surface-sunken);
  text-align: center;
}

.drop.over {
  border-color: var(--accent);
  background: var(--surface-brand);
}

.drop-main {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.drop-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.hidden-input {
  display: none;
}

.drop-note {
  margin: 4px 0 0;
  font-size: 0.6875rem;
  color: var(--text-muted);
  line-height: 1.7;
}
</style>
