<script setup lang="ts">
/**
 * 书籍关系图谱（F15）。
 *
 * 解决的问题：F9 对比只回答「两本都想读时选哪本」，回答不了「读完这本，
 * 下一本读什么来补另一面」。处方不只是单味药，还有配伍。
 *
 * 数据从哪来：现有 33 个困境标签 + 一张人工裁定的关系表（`data/tag-relations.ts`）。
 * **不新增书字段、不调模型、不看时间**——关系是算出来的，不是生成的。
 */
import { computed } from 'vue';
import { SEED_BOOKS } from '@/data/catalog.js';
import { RELATION_LABEL, TAG_RELATIONS } from '@/data/tag-relations.js';
import { relatedBooks, type RelationBook } from '@/domain/relations.js';

const props = defineProps<{ bookId: string }>();

const pool = computed<RelationBook[]>(() =>
  SEED_BOOKS.map((b) => ({
    book_id: b.book_id,
    title: b.title,
    author: b.author_display[0] ?? '',
    hours: b.est_reading_hours,
    difficulty: b.difficulty,
    tags: (b.problem_tags ?? []).map((t) => ({ tag: t.tag, weight: t.weight })),
  })),
);

const target = computed(() => pool.value.find((b) => b.book_id === props.bookId) ?? null);

const items = computed(() =>
  target.value ? relatedBooks(target.value, pool.value, TAG_RELATIONS, 3) : [],
);
</script>

<template>
  <section v-if="items.length > 0" class="rel-block">
    <h2 class="block-title">这本之后，可以接着看</h2>
    <ul class="rel-list">
      <li v-for="r in items" :key="r.book_id" class="rel-row">
        <p class="rel-head">
          <span class="rel-kind" :class="`rel-${r.kind}`">{{ RELATION_LABEL[r.kind] }}</span>
          <router-link class="rel-title" :to="`/book/${r.book_id}`">{{ r.title }}</router-link>
        </p>
        <p class="rel-why">{{ r.why }}</p>
        <p class="rel-meta">{{ r.author }} · 约 {{ r.hours }} 小时 · 难度 {{ r.difficulty }} 级</p>
      </li>
    </ul>
    <p class="rel-note">
      关系是按困境标签人工定的方向，「具体哪一本」由标签权重算出来——同一本书每次打开都是同几条。
    </p>
  </section>
</template>

<style scoped>
.rel-block {
  margin: 32px 0 0;
}

.rel-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.rel-row {
  padding: 12px 0;
  border-top: 1px solid var(--border-soft);
}

.rel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin: 0;
}

.rel-kind {
  flex: 0 0 auto;
  font-size: 0.6875rem;
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--surface-sunken);
  color: var(--text-muted);
}

.rel-kind.rel-next {
  background: var(--surface-brand);
  color: var(--accent);
}

.rel-title {
  font-family: var(--font-book);
  font-size: 1rem;
  color: var(--text-primary);
  text-decoration: none;
}

.rel-title:hover {
  color: var(--accent);
}

.rel-why {
  margin: 4px 0 0;
  font-size: 0.8125rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.rel-meta {
  margin: 4px 0 0;
  font-size: 0.6875rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.rel-note {
  margin: 14px 0 0;
  font-size: 0.6875rem;
  line-height: 1.8;
  color: var(--text-muted);
}
</style>
