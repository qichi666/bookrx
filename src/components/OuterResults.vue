<script setup lang="ts">
/**
 * 外围书库结果区（书目层）。
 *
 * 这些书只过了机器清洗，没有 34 字段人工标注，所以**单独成段**：
 * 明说「未入库」、不显示契合度、点开去豆瓣。与核心库结果视觉上分开，
 * 是为了不让用户把「搜到了」误读成「推荐给你」。
 */
import type { CandidateHit } from '@/engine/search.js';

defineProps<{
  hits: CandidateHit[];
  loading: boolean;
}>();

const FIELD_TEXT: Record<CandidateHit['field'], string> = {
  title: '书名',
  subtitle: '副标题',
  author: '作者',
};

/**
 * 为什么这本书会出现。
 *
 * 副标题命中时只给书名，用户会以为搜错了——「勇气」搜出一堆《游戏力》，
 * 因为它副标题是「笑声，激活孩子天性中的合作与勇气」。所以把命中片段原样贴出来，
 * 让人自己判断这条要不要点。命中片段不参与任何推荐语义，只是证据。
 */
function why(hit: CandidateHit): string {
  if (hit.fuzzy === true) return '书名差一个字';
  return hit.snippet ? `${FIELD_TEXT[hit.field]}：${hit.snippet}` : `${FIELD_TEXT[hit.field]}命中`;
}
</script>

<template>
  <p v-if="loading" class="cand-note">正在检索外围书库…</p>

  <template v-if="hits.length > 0">
    <h3 class="cand-title">外围书库里还有 {{ hits.length }} 本</h3>
    <p class="cand-note">这些书进了书库但没有人工标注，只保证书名 / 副标题 / 作者对得上，点开去豆瓣看。</p>
    <article v-for="c in hits" :key="c.book.id" class="cand-item">
      <div class="cand-head">
        <h4 class="cand-name">{{ c.book.title }}</h4>
        <span class="cand-author">{{ c.book.authors.join(' / ') }}</span>
      </div>
      <p class="cand-why">{{ why(c) }}</p>
      <p class="cand-meta">
        {{ c.book.publisher }}<span v-if="c.book.year"> · {{ c.book.year }}</span>
        <span class="cand-tag">未入库</span>
        <span v-if="c.editions > 0" class="cand-tag">另有 {{ c.editions }} 个版本</span>
      </p>
      <a class="cand-link" :href="c.book.url" target="_blank" rel="noopener noreferrer">豆瓣条目</a>
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

.cand-why {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 4px 0 0;
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
