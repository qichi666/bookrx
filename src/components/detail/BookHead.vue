<script setup lang="ts">
/**
 * 详情页头部：书脊卡 + 书名作者 + `match_brief` + **可用性区块**。
 *
 * 这一块单独成组件的理由不是"行数"，而是它有一个不可挪动的顺序约束：
 * 可用性区块必须紧随书名（P0-7 验收条件），而它又要排在 `match_brief` 之后。
 * 三者的相对顺序是产品决策，把它和下面的理由段混在一个文件里，
 * 下一次改动很容易为了排版顺手把它们换位。
 */
import { computed } from 'vue';
import type { Book } from '@/contracts/book.js';
import { availabilityClass, availabilityOf } from '@/data/availability.js';
import type { BookLink } from '@/data/book-links.js';

const props = defineProps<{
  book: Book;
  links: BookLink[];
  /** 本机已有这本书（导入过）时给出它的 id —— 这时"打开"比任何外链都优先 */
  localId?: string;
}>();

/** 只取一次：三态文案是一份对象，模板里重复调用等于重复走一遍门控。 */
const avail = computed(() => availabilityOf(props.book));
</script>

<template>
  <header class="detail-head">
    <div class="spine" aria-hidden="true">
      <span class="spine-title">{{ book.title }}</span>
    </div>

    <div class="head-text">
      <h1 class="detail-title">{{ book.title }}</h1>
      <p class="detail-author">
        {{ book.author_display.join(' / ') }}
        <template v-if="book.translator"> · 译 {{ book.translator }}</template>
      </p>

      <!-- 为什么是这本：比正文大、比书名小，排在可用性之前 -->
      <p class="detail-brief">{{ book.match_brief }}</p>

      <div class="avail-block" :class="availabilityClass(book)">
        <span class="avail-label">{{ avail.label }}</span>
        <!-- 本机已导入时，"打开"排在所有外链之前：手里有的东西不该让人再去别处找 -->
        <router-link v-if="localId" class="local-open" :to="`/reader/${localId}`">打开本机这一份</router-link>
        <p class="avail-note">{{ avail.note }}</p>
        <p v-if="avail.extra" class="avail-extra">{{ avail.extra }}</p>
        <ul class="avail-links">
          <li v-for="l in links" :key="l.href">
            <a :href="l.href" target="_blank" rel="noopener noreferrer">{{ l.label }}</a>
          </li>
        </ul>
      </div>
    </div>
  </header>
</template>

<style scoped>
.detail-head {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

/* 书脊卡：v1 唯一的封面系统，不抓书封（版权复杂 + 外链易失效） */
.spine {
  flex: 0 0 auto;
  width: 112px;
  height: 160px;
  border-radius: 4px;
  background: var(--surface-sunken);
  border-left: 6px solid var(--accent);
  padding: 10px 8px;
  box-sizing: border-box;
  overflow: hidden;
}

.spine-title {
  font-family: var(--font-read);
  font-size: 0.8125rem;
  color: var(--text-primary);
  writing-mode: vertical-rl;
  letter-spacing: 0.08em;
  max-height: 100%;
}

.head-text {
  flex: 1 1 auto;
  min-width: 0;
}

.detail-title {
  font-size: 1.75rem;
  margin: 0 0 4px;
}

.detail-author {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 0 0 12px;
}

.detail-brief {
  font-size: 1.25rem;
  font-weight: 510;
  color: var(--text-primary);
  margin: 0 0 14px;
}

.avail-block {
  border-radius: 8px;
  padding: 10px 12px;
}

.avail-inline {
  background: var(--inline-bg);
}

.avail-byo,
.avail-external {
  background: var(--surface-sunken);
}

.avail-label {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 590;
  color: var(--inline-fg);
  margin-bottom: 4px;
}

.avail-byo .avail-label,
.avail-external .avail-label {
  color: var(--byo-fg);
}

.avail-note,
.avail-extra {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.7;
  margin: 0 0 4px;
}

.avail-extra {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.local-open {
  display: inline-block;
  margin: 6px 0 8px;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 0.8125rem;
  text-decoration: none;
}

.avail-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  list-style: none;
  padding: 4px 0 0;
  margin: 0;
}

.avail-links a {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}

.avail-links a:hover {
  text-decoration: underline;
}

@media (max-width: 520px) {
  .detail-head {
    flex-direction: column;
    align-items: center;
  }

  .spine {
    width: 96px;
    height: 136px;
  }
}
</style>
