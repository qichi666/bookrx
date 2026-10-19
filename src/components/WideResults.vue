<script setup lang="ts">
/**
 * 全库推荐池结果区。
 *
 * 与核心库的结果必须视觉可分：这些书只按「同域 + 公开口碑」轮转选出，
 * **没有 34 字段标注**，所以标题写「全库里的其他可能」、打「未标注」标，
 * 不显示契合度、不给行动建议。给的是「可以去看看」，不是「这就是你的答案」。
 */
import type { CandidateBook } from '@/data/candidates.js';

defineProps<{
  picks: CandidateBook[];
  size: number;
  loading: boolean;
}>();

defineEmits<{ next: [] }>();
</script>

<template>
  <section v-if="loading || picks.length > 0" class="wide">
    <div class="wide-head">
      <h2 class="wide-title">全库里的其他可能</h2>
      <button v-if="picks.length > 0" type="button" class="wide-next" @click="$emit('next')">
        换一批
      </button>
    </div>

    <p v-if="loading" class="wide-note">正在打开全库书单…</p>
    <p v-else class="wide-note">
      这个领域全库有 {{ size }} 本，这里每次给你 5 本，换一批就会翻到别的书。
      它们没有经过人工标注，只能保证同类，点开去豆瓣看是否对味。
    </p>

    <article v-for="c in picks" :key="c.id" class="wide-item">
      <div class="wide-line">
        <h3 class="wide-name">{{ c.title }}</h3>
        <span class="wide-author">{{ c.authors.join(' / ') }}</span>
      </div>
      <p class="wide-meta">
        {{ c.publisher }}<span v-if="c.year"> · {{ c.year }}</span>
        <span class="wide-tag">未标注</span>
      </p>
      <a class="wide-link" :href="c.url" target="_blank" rel="noopener noreferrer">豆瓣条目</a>
    </article>
  </section>
</template>

<style scoped>
.wide {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}

.wide-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.wide-title {
  font-size: 1.125rem;
  margin: 0 0 12px;
}

.wide-next {
  min-height: 36px;
  padding: 4px 14px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.wide-note {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 0 0 12px;
}

.wide-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 8px;
}

.wide-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.wide-name {
  font-size: 0.9375rem;
  margin: 0;
}

.wide-author {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.wide-meta {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 6px 0;
}

.wide-tag {
  display: inline-block;
  margin-left: 8px;
  padding: 0 6px;
  border: 1px solid var(--border-control);
  border-radius: 4px;
  color: var(--text-muted);
}

.wide-link {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}

.wide-link:hover {
  text-decoration: underline;
}
</style>
