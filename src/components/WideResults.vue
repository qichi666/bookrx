<script setup lang="ts">
/**
 * 全库推荐池结果区（enriched 层）。
 *
 * 这些书有**书名证据**推出来的困境标签（书名里真的出现了该困境的词），
 * 所以「沾不沾题」是算出来的，不是猜的；但它们没有难度/体例/篇幅标注，
 * 覆盖率只有 4300/10000，因此：不显示契合度、不给行动建议、档位最高只到「较为契合」。
 * 给的是「很可能对症，值得点开看」，不是「这就是你的答案」。
 *
 * 池子小时如实说小。不拿豆瓣大类兜底的书凑数——那类书进来只会让用户
 * 在「和你这个困境相关」的标题下看到《嫌疑人X的献身》。
 */
import type { CandidateBook } from '@/data/candidates.js';

defineProps<{
  picks: CandidateBook[];
  size: number;
  loading: boolean;
}>();

/** 少于这个数就不再说「还有 N 本」，直接说「只找到 N 本」——避免让人以为后面还有一长串 */
const SMALL_POOL = 20;

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
    <template v-else>
      <p v-if="size >= SMALL_POOL" class="wide-note">
        和你这个困境相关的还有 {{ size }} 本，这里每次给你 5 本，换一批就会翻到别的书。
        它们的标签是从书名推出来的，没有人工核对过难度和篇幅，点开去豆瓣看是否对味。
      </p>
      <p v-else class="wide-note">
        这一条下我们能确认相关的只有 {{ size }} 本，都在这里了。
        宁可少给，也不拿标签对不上的书来凑——剩下的路是换个说法描述你的处境，或者直接去书库搜。
      </p>
    </template>

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
  font-family: var(--font-book);
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
