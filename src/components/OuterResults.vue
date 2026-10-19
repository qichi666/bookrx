<script setup lang="ts">
/**
 * 外围书库结果区（书目层）。
 *
 * 这些书只过了机器清洗，没有 34 字段人工标注，所以**单独成段**：
 * 明说「未入库」、不显示契合度、点开去豆瓣。与核心库结果视觉上分开，
 * 是为了不让用户把「搜到了」误读成「推荐给你」。
 */
import type { CandidateBook } from '@/data/candidates.js';

defineProps<{
  hits: CandidateBook[];
  loading: boolean;
}>();
</script>

<template>
  <p v-if="loading" class="cand-note">正在检索外围书库…</p>

  <template v-if="hits.length > 0">
    <h3 class="cand-title">外围书库里还有 {{ hits.length }} 本</h3>
    <p class="cand-note">这些书进了书库但没有人工标注，只保证书名 / 作者对得上，点开去豆瓣看。</p>
    <article v-for="c in hits" :key="c.id" class="cand-item">
      <div class="cand-head">
        <h4 class="cand-name">{{ c.title }}</h4>
        <span class="cand-author">{{ c.authors.join(' / ') }}</span>
      </div>
      <p class="cand-meta">
        {{ c.publisher }}<span v-if="c.year"> · {{ c.year }}</span>
        <span class="cand-tag">未入库</span>
      </p>
      <a class="cand-link" :href="c.url" target="_blank" rel="noopener noreferrer">豆瓣条目</a>
    </article>
  </template>
</template>

<style scoped>
.cand-title {
  font-size: 1rem;
  margin: 16px 0 8px;
}

.cand-note {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0 0 8px;
}

.cand-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 8px;
}

.cand-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.cand-name {
  font-size: 0.9375rem;
  margin: 0;
}

.cand-author {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.cand-meta {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 6px 0;
}

.cand-tag {
  display: inline-block;
  margin-left: 8px;
  padding: 0 6px;
  border: 1px solid var(--border-control);
  border-radius: 4px;
  color: var(--text-muted);
}

.cand-link {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}

.cand-link:hover {
  text-decoration: underline;
}
</style>
