<script setup lang="ts">
/**
 * 导入别人的书单（P0-15 的接收端）。
 *
 * 三种结果都要说人话：
 *  ① 解析成功 → 列出对方当时的 5 本，并明确标出「哪几本不在我的书库里」；
 *  ② 解析失败 → 按错误码给具体动作（不是"导入失败，请重试"）；
 *  ③ 导入成功但重算后结果不同 → 这是**正常**的，因为书库版本不同，必须当场说明，
 *     否则用户会以为文件坏了或产品不稳定。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { BooklistFile } from '@/engine/booklist.js';
import { BOOKLIST_ERROR_TEXT, parseBooklist } from '@/engine/booklist.js';
import { SEED_BOOKS } from '@/data/catalog.js';
import { saveDiagnosis } from '@/engine/session.js';
import { TIER_LABEL } from '@/data/book-labels.js';
import { readTextFile } from '@/lib/file-io.js';

const router = useRouter();
const error = ref('');
const loaded = ref<BooklistFile | null>(null);
const dragging = ref(false);

const knownIds = computed(() => new Set<string>(SEED_BOOKS.map((b) => b.book_id)));
const rows = computed(() =>
  (loaded.value?.items ?? []).map((it) => ({ ...it, inLibrary: knownIds.value.has(it.book_id) })),
);
const missing = computed(() => rows.value.filter((r) => !r.inLibrary).length);

async function onFile(file: File | undefined | null): Promise<void> {
  if (!file) return;
  error.value = '';
  loaded.value = null;
  const text = await readTextFile(file);
  const parsed = parseBooklist(text);
  if (!parsed.ok) {
    error.value = BOOKLIST_ERROR_TEXT[parsed.error.code];
    return;
  }
  loaded.value = parsed.value;
}

function onPick(e: Event): void {
  const input = e.target as HTMLInputElement;
  void onFile(input.files?.[0]);
  input.value = '';
}

function onDrop(e: DragEvent): void {
  dragging.value = false;
  void onFile(e.dataTransfer?.files?.[0]);
}

function recompute(): void {
  const f = loaded.value;
  if (!f) return;
  saveDiagnosis(f.diagnosis);
  void router.push('/result');
}

function exportedAt(ms: number): string {
  if (!ms) return '时间未知';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
</script>

<template>
  <section class="booklist-view">
    <h1 class="page-title">导入别人的书单</h1>
    <p class="lead">
      对方在结果页导出的 <code>.booklist.json</code> 拖进来，就能看到他当时做的选择和拿到的书。
      文件里没有他的身份信息，只有问卷选项和书名。
    </p>

    <label
      class="dropzone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input type="file" accept=".json,application/json" class="file-input" @change="onPick" />
      <span class="drop-title">把一个 .booklist.json 拖到这里</span>
      <span class="drop-hint">或者点一下选择文件</span>
    </label>

    <p v-if="error" class="error-line" role="alert">{{ error }}</p>

    <template v-if="loaded">
      <div class="result-head">
        <h2 class="block-title">这份书单</h2>
        <p class="meta-line">
          导出时间 {{ exportedAt(loaded.exported_at) }} ·
          {{ rows.length }} 本 ·
          <template v-if="missing === 0">全部在我的书库里</template>
          <template v-else>{{ missing }} 本不在我的书库里</template>
        </p>
      </div>

      <ul class="rows">
        <li v-for="r in rows" :key="r.book_id" class="row">
          <a v-if="r.inLibrary" class="row-title" :href="`#/book/${r.book_id}`">{{ r.title }}</a>
          <span v-else class="row-title muted">{{ r.title }}</span>
          <span class="row-tier">{{ TIER_LABEL[r.tier] }}</span>
          <span v-if="!r.inLibrary" class="row-flag">不在我的书库</span>
        </li>
      </ul>

      <p v-if="missing > 0" class="note-line">
        书库版本不同是正常的：这份书单导出时对方那一版可能有这本书，现在这一版没有（或倒过来）。
        下面的重算会用你手上的书库，结果可能和上面这几本不完全一致。
      </p>

      <div class="actions">
        <button type="button" class="btn-primary" @click="recompute">用这份选择重算一次</button>
        <a class="back-link" href="#/result">回到我的推荐</a>
      </div>
    </template>
  </section>
</template>

<style scoped>
.booklist-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 16px 40px;
}

.page-title {
  font-size: 1.5rem;
  margin: 8px 0 10px;
}

.lead {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.85;
  margin: 0 0 18px;
}

.lead code {
  font-family: var(--font-mono, monospace);
  font-size: 0.8125rem;
  background: var(--surface-sunken);
  padding: 1px 5px;
  border-radius: 3px;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  border: 1px dashed var(--border-control);
  border-radius: 8px;
  background: var(--surface-sunken);
  cursor: pointer;
  text-align: center;
}

.dropzone.dragging {
  border-color: var(--accent);
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.drop-title {
  font-size: 0.9375rem;
  color: var(--text-primary);
}

.drop-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.error-line {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--flag-strong);
  background: var(--surface-sunken);
  font-size: 0.8125rem;
  color: var(--text-primary);
  line-height: 1.8;
}

.result-head {
  margin-top: 24px;
}

.meta-line {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

.rows {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-soft);
}

.row-title {
  font-size: 0.9375rem;
  color: var(--accent);
  text-decoration: none;
}

.row-title.muted {
  color: var(--text-secondary);
}

.row-tier {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.row-flag {
  font-size: 0.6875rem;
  color: var(--text-muted);
  border: 1px solid var(--border-control);
  border-radius: 4px;
  padding: 1px 6px;
}

.note-line {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.8;
  margin: 12px 0 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}

.back-link {
  font-size: 0.8125rem;
  color: var(--accent);
  text-decoration: none;
}
</style>
