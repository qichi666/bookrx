<script setup lang="ts">
/**
 * 书内搜索：纯本地遍历，不联网、不建索引。
 *
 * 不建倒排索引是刻意的：一本 20 万字的书逐段 `indexOf` 在浏览器里是毫秒级的，
 * 而索引要落库、要随重新导入失效、要额外存储——为省下的那几毫秒付这些代价不值得。
 * 上限 30 条：再多用户也不会翻，但会让人以为"搜出来几百条"。
 */
import { computed, ref } from 'vue';
import type { ParsedChapter } from '@/engine/import/types.js';

const props = defineProps<{ chapters: readonly ParsedChapter[] }>();
const emit = defineEmits<{ close: []; goto: [payload: { chapter: number; paragraph: number }] }>();

const q = ref('');

interface Hit {
  chapter: number;
  paragraph: number;
  chapterTitle: string;
  before: string;
  hit: string;
  after: string;
}

const hits = computed<Hit[]>(() => {
  const needle = q.value.trim();
  if (needle.length < 2) return [];
  const out: Hit[] = [];
  for (let c = 0; c < props.chapters.length && out.length < 30; c += 1) {
    const ch = props.chapters[c]!;
    for (let p = 0; p < ch.paragraphs.length && out.length < 30; p += 1) {
      const text = ch.paragraphs[p]!;
      let at = text.indexOf(needle);
      while (at >= 0 && out.length < 30) {
        out.push({
          chapter: c,
          paragraph: p,
          chapterTitle: ch.title,
          before: text.slice(Math.max(0, at - 24), at),
          hit: text.slice(at, at + needle.length),
          after: text.slice(at + needle.length, at + needle.length + 24),
        });
        at = text.indexOf(needle, at + needle.length);
      }
    }
  }
  return out;
});

const tooShort = computed(() => q.value.trim().length > 0 && q.value.trim().length < 2);
</script>

<template>
  <aside class="drawer" role="dialog" aria-label="书内搜索">
    <div class="drawer-head">
      <input v-model="q" class="search-input" type="search" placeholder="在本书里搜（至少 2 个字）" autofocus />
      <button type="button" class="drawer-close" @click="emit('close')">收起</button>
    </div>

    <p v-if="tooShort" class="hint">再输入一个字。</p>
    <p v-else-if="q.trim() && hits.length === 0" class="hint">这本书里没有「{{ q.trim() }}」。</p>
    <p v-else-if="hits.length === 30" class="hint">只显示前 30 条。把词写长一点能缩小范围。</p>

    <ul class="hit-list">
      <li v-for="(h, i) in hits" :key="i">
        <button type="button" class="hit" @click="emit('goto', { chapter: h.chapter, paragraph: h.paragraph })">
          <span class="hit-chapter">{{ h.chapterTitle }}</span>
          <span class="hit-text">…{{ h.before }}<mark>{{ h.hit }}</mark>{{ h.after }}…</span>
        </button>
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
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-sunken);
  border-bottom: 1px solid var(--border-soft);
}

.search-input {
  flex: 1;
  min-height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--border-control);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.8125rem;
}

.drawer-close {
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.hint {
  margin: 0;
  padding: 10px 12px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.hit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.hit {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-bottom: 1px solid var(--border-soft);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.hit:hover {
  background: var(--surface-raised);
}

.hit-chapter {
  font-size: 0.6875rem;
  color: var(--text-muted);
}

.hit-text {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

.hit-text mark {
  background: var(--inline-bg);
  color: var(--text-primary);
  border-radius: 2px;
}
</style>
