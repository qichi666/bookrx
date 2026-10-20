<script setup lang="ts">
/**
 * 我的书架：在读 / 想读 / 读完 三组。
 *
 * 这个页面只做三件事，多一件都不做：**列出来、点进去读、删掉**。
 * 特意没有的：搜索、评分、标签云、算法推荐位——书架是用户自己的东西，
 * 加推荐位等于把「我想读什么」变成「系统想让我读什么」。
 *
 * 数据全在本机 IndexedDB，没有账号也没有同步：所以这里的每一行
 * 都必须是"这台机器上真的有一份文件"，否则点进去必然白屏。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ShelfCard from '@/components/shelf/ShelfCard.vue';
import { buildShelf, shelfStats, type ShelfGroups } from '@/domain/shelf.js';
import { humanSize } from '@/lib/file-io.js';
import { listBooks, listProgress, listShelf, quota } from '@/storage/db.js';
import { installSample, SAMPLE_BOOKS } from '@/data/samples.js';
import { moveToShelf, removeBook, SHELF_LABEL } from '@/storage/library.js';
import type { ShelfGroup } from '@/storage/db.js';

const router = useRouter();
const groups = ref<ShelfGroups>({ reading: [], want: [], finished: [] });
const loading = ref(true);
const failed = ref('');
const confirming = ref<string | null>(null);
const usage = ref<{ usage: number; quota: number } | null>(null);
const sampleBusy = ref(false);
const sampleError = ref('');

const stats = computed(() => shelfStats(groups.value));
const order: ShelfGroup[] = ['reading', 'want', 'finished'];

const usageText = computed(() => {
  const u = usage.value;
  if (!u || u.quota === 0) return '';
  const ratio = u.usage / u.quota;
  return `本机已用 ${humanSize(u.usage)} / 浏览器给了 ${humanSize(u.quota)}（${Math.round(ratio * 100)}%）`;
});

async function refresh(): Promise<void> {
  loading.value = true;
  failed.value = '';
  try {
    const [books, shelf, progress] = await Promise.all([listBooks(), listShelf(), listProgress()]);
    groups.value = buildShelf(books, shelf, progress);
    usage.value = await quota();
  } catch (e) {
    // 打不开本机数据库（隐私模式最常见）：说清楚，不要显示成一个空书架
    // ——"书都没了"和"数据库打不开"是两种完全不同的坏消息。
    failed.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function open(id: string): void {
  void router.push(`/reader/${id}`);
}

async function onMove(p: { id: string; group: ShelfGroup }): Promise<void> {
  await moveToShelf(p.id, p.group);
  await refresh();
}

async function onRemove(id: string): Promise<void> {
  await removeBook(id);
  confirming.value = null;
  await refresh();
}

function askRemove(id: string): void {
  confirming.value = id;
}

/** 示例书走的是和导入完全相同的链路，所以"试出来的手感"就是真手感 */
async function loadSample(): Promise<void> {
  const sample = SAMPLE_BOOKS[0];
  if (!sample) return;
  sampleBusy.value = true;
  sampleError.value = '';
  const r = await installSample(sample);
  sampleBusy.value = false;
  if (!r.ok) {
    sampleError.value = r.error.detail;
    return;
  }
  await refresh();
  open(r.book.book_id);
}

onMounted(refresh);
</script>

<template>
  <section class="library">
    <header class="lib-head">
      <h1 class="lib-title">我的书架</h1>
      <p class="lib-sub">
        这些书全部在这台设备上，没有上传、没有账号。换浏览器或清站点数据后需要重新导入。
      </p>
      <router-link class="btn-primary lib-import" to="/import">导入一本书</router-link>
    </header>

    <p v-if="loading" class="state">正在打开本机书库…</p>

    <div v-else-if="failed" class="state state-bad">
      <p class="state-title">本机书库打不开</p>
      <p class="state-body">
        常见于无痕/隐私模式，或浏览器被设置为"退出时清除站点数据"。
        换一个普通窗口再打开本站，书还在原来的浏览器里。
      </p>
      <p class="state-detail">{{ failed }}</p>
      <button type="button" class="btn-ghost" @click="refresh">再试一次</button>
    </div>

    <div v-else-if="stats.total === 0" class="state">
      <p class="state-title">还没有书</p>
      <p class="state-body">
        导入你自己的 EPUB 或 TXT，就能在这里读：翻页、调字号、划线、写笔记。
        书只存在本机，不会上传，也没有账号。
      </p>
      <div class="state-actions">
        <router-link class="btn-primary" to="/import">选一个文件</router-link>
        <button type="button" class="btn-ghost" :disabled="sampleBusy" @click="loadSample">
          {{ sampleBusy ? '正在准备示例…' : '先试读一段示例' }}
        </button>
      </div>
      <p v-if="sampleError" class="state-detail">{{ sampleError }}</p>
      <p class="state-note">
        示例只有一千多字，由本站编写，用途是让你在导入自己的书之前先试手感。
      </p>
    </div>

    <template v-else>
      <div v-for="g in order" :key="g" class="group">
        <h2 class="group-title">
          {{ SHELF_LABEL[g] }}<span class="group-count">{{ stats.byGroup[g] }}</span>
        </h2>
        <p v-if="groups[g].length === 0" class="group-empty">
          {{ g === 'reading' ? '还没有正在读的书。从「想读」里点开一本就到这里了。' : '这一组是空的。' }}
        </p>
        <ul v-else class="shelf-list">
          <ShelfCard
            v-for="b in groups[g]"
            :key="b.id"
            :book="b"
            :confirming="confirming === b.id"
            @open="open"
            @remove="onRemove"
            @ask-remove="askRemove"
            @move="onMove"
            @cancel="confirming = null"
          />
        </ul>
      </div>

      <div class="extra">
        <button v-if="!stats.byGroup.reading && !stats.byGroup.finished" type="button" class="mini" :disabled="sampleBusy" @click="loadSample">
          {{ sampleBusy ? '正在准备示例…' : '试读示例' }}
        </button>
      </div>
      <p v-if="usageText" class="usage">{{ usageText }}</p>
      <p class="privacy">
        阅读进度、划线与笔记都记在本机。清掉站点数据 = 全部消失，且无法恢复。
      </p>
    </template>
  </section>
</template>

<style scoped>
.library {
  max-width: 720px;
  margin: 0 auto;
}

.lib-head {
  margin-bottom: 16px;
}

.lib-title {
  margin: 0 0 6px;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.lib-sub {
  margin: 0 0 12px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.8;
}

.lib-import {
  display: inline-block;
  text-decoration: none;
}

.state {
  padding: 20px 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.9;
}

.state-title {
  margin: 0 0 6px;
  color: var(--text-primary);
}

.state-body {
  margin: 0 0 10px;
}

.state-detail {
  margin: 0 0 10px;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--text-muted);
  word-break: break-all;
}

.state-bad {
  border-left: 2px solid var(--danger);
  padding-left: 12px;
}

.group {
  margin-bottom: 20px;
}

.group-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.group-count {
  font-size: 0.6875rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.group-empty {
  margin: 0;
  padding: 8px 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.shelf-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.state-note {
  margin: 8px 0 0;
  font-size: 0.6875rem;
  color: var(--text-muted);
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

.extra {
  margin: 4px 0 8px;
}

.usage,
.privacy {
  margin: 4px 0;
  font-size: 0.6875rem;
  color: var(--text-muted);
}
</style>
