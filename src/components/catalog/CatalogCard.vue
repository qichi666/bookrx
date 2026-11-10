<script setup lang="ts">
/**
 * 书库卡片（F3）。
 *
 * 与 `BookCard`（推荐卡）的区别必须讲清楚，否则两张卡会长成一模一样：
 *  - 推荐卡回答「**为什么是这本**」，所以档位、理由、命中依据齐全；
 *  - 书库卡回答「**这里都有些什么**」，没有诊断，所以**不显示档位**
 *    ——「强匹配」是相对于某个诊断的结论，没有诊断时说这句话没有意义。
 *
 * 于是书库卡把重点放在可比较的三个硬指标：难度、篇幅、时长。
 */
import type { Book } from '@/contracts/book.js';
import { DIFFICULTY_LABEL, LENGTH_LABEL, metaLine } from '@/data/book-labels.js';
import { availabilityClass, availabilityOf } from '@/data/availability.js';
import WishButton from '@/components/wish/WishButton.vue';

const props = defineProps<{ book: Book; selected: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const avail = availabilityOf(props.book);
const skin = availabilityClass(props.book);
const meta = metaLine(props.book);
</script>

<template>
  <article class="cc">
    <div class="cc-head">
      <h3 class="cc-title">
        <router-link :to="`/book/${book.book_id}`">{{ book.title }}</router-link>
      </h3>
      <span class="cc-avail" :class="skin">{{ avail.label }}</span>
    </div>
    <p class="cc-author">{{ book.author_display.join(' / ') }}</p>
    <p class="cc-brief">{{ book.match_brief }}</p>
    <p class="cc-meta">{{ meta }}</p>
    <p class="cc-facts">
      <span>难度 {{ DIFFICULTY_LABEL[book.difficulty] ?? book.difficulty }}</span>
      <span aria-hidden="true">·</span>
      <span>{{ LENGTH_LABEL[book.length_class] ?? '篇幅未标' }}</span>
      <span aria-hidden="true">·</span>
      <span>约 {{ book.est_reading_hours }} 小时</span>
    </p>

    <div class="cc-actions">
      <WishButton :book-id="book.book_id" compact />
      <button
        type="button"
        class="cc-compare"
        :class="{ on: selected }"
        :aria-pressed="selected"
        @click="emit('toggle')"
      >
        {{ selected ? '已选入对比' : '加入对比' }}
      </button>
      <router-link class="cc-detail" :to="`/book/${book.book_id}`">详情</router-link>
    </div>
  </article>
</template>

<style scoped>
.cc {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
}

.cc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.cc-title {
  font-family: var(--font-book);
  font-size: 1.0625rem;
  margin: 0;
  min-width: 0;
}

.cc-title a {
  color: inherit;
  text-decoration: none;
}

.cc-title a:hover {
  color: var(--accent);
}

.cc-avail {
  flex: 0 0 auto;
  font-size: 0.6875rem;
  border-radius: 3px;
  padding: 2px 7px;
}

.cc-avail.avail-inline {
  background: var(--inline-bg);
  color: var(--inline-fg);
}

.cc-avail.avail-byo {
  background: var(--byo-bg);
  color: var(--byo-fg);
}

.cc-avail.avail-external {
  background: var(--surface-sunken);
  color: var(--text-muted);
}

.cc-author {
  margin: 2px 0 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.cc-brief {
  margin: 0 0 6px;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.cc-meta {
  margin: 0 0 4px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.cc-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0 0 10px;
  font-size: 0.6875rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.cc-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.cc-compare {
  min-height: 44px;
  padding: 2px 10px;
  border-radius: 6px;
  border: 1px dashed var(--border-control);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}

.cc-compare.on {
  border-style: solid;
  border-color: var(--accent);
  color: var(--accent);
  background: var(--surface-brand);
}

.cc-detail {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 0.75rem;
  color: var(--accent);
  text-decoration: none;
}

.cc-detail:hover {
  text-decoration: underline;
}
</style>
