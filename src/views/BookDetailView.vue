<script setup lang="ts">
/**
 * 书籍详情页（SPEC §2.1 P0-7，UIUX P3）。
 *
 * 这一页只回答一个问题：**为什么是这本**。所以 `match_brief` 排在可用性之前，
 * 比正文大、比书名小；可用性区块紧随其后（P0-7 的验收条件：
 * 「可用性区块紧随书名，不放到页底」——用户点进来第一件事是"我能不能读到"）。
 *
 * 与规格书的两处差异，都是因为当前没有阅读器（M2/M4 已冻结，P2-4 换外链方案）：
 *  ① 主操作不是「阅读 / 导入后阅读」，而是「到哪读」的一组外链；
 *  ② 公版书的说明改成「站外可读」，口径由 `data/availability.ts` 统一门控。
 * 文案与结构仍然按 P3 的层级走，等阅读器上线只需换 `READER_AVAILABLE`。
 *
 * 本文件只负责「取数 + 排顺序」，两端分别交给 `detail/BookHead`（书名→简介→可用性）
 * 与 `detail/BookReason`（命中→讲什么→拿到什么→边界→来源）。拆开的理由不是行数，
 * 而是这两处的元素顺序本身是产品决策：混在一个文件里，下次改排版很容易顺手换位。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import BookHead from '@/components/detail/BookHead.vue';
import BookReason from '@/components/detail/BookReason.vue';
import { SEED_BOOKS } from '@/data/catalog.js';
import { linksOf } from '@/data/book-links.js';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, LENGTH_LABEL, TIER_LABEL, TIER_SQUARES } from '@/data/book-labels.js';
import { sameTopicBooks } from '@/data/library-index.js';
import { tierOf } from '@/domain/scoring/tier.js';
import { computeResult } from '@/engine/result.js';
import { loadDiagnosis } from '@/engine/session.js';

const route = useRoute();
const bookId = computed(() => String(route.params.id ?? ''));
const book = computed(() => SEED_BOOKS.find((b) => b.book_id === bookId.value) ?? null);

/**
 * 诊断记录是可选的：直接打开链接、或者从旧的分享链接进来，都可能没有。
 * 没有就退化成"书目页"——展示书本身，不假装知道用户是谁。
 */
const diagnosis = loadDiagnosis();

const matched = computed(() => {
  const b = book.value;
  if (!diagnosis || !b) return null;
  return computeResult(diagnosis).items.find((i) => i.book.book_id === b.book_id) ?? null;
});

const judged = computed(() => {
  const m = matched.value;
  return m ? tierOf(m.score_bp, m.primary_hit) : null;
});

/** 命中依据：诊断里用户自己选过/写过的原词，最多 4 个（PRD §7.3 层②）。 */
const hits = computed(() => (diagnosis ? diagnosis.need_tags.slice(0, 4) : []));

const links = computed(() => (book.value ? linksOf(book.value) : []));
const related = computed(() => (book.value ? sameTopicBooks(book.value) : []));

/** B1：这本书为什么不是更高一档。没有 hint 就整句不给，不补空话。 */
const boundary = computed(() => {
  const hints = book.value?.boundary_hints;
  if (!hints) return '';
  return hints.problem ?? hints.difficulty ?? hints.length ?? '';
});

const metaItems = computed(() => {
  const b = book.value;
  if (!b) return [];
  const items: Array<[string, string]> = [
    ['难度', DIFFICULTY_LABEL[b.difficulty] ?? '未标注'],
    ['篇幅', LENGTH_LABEL[b.length_class] ?? '未标注'],
    ['预计时长', `约 ${b.est_reading_hours} 小时`],
    ['品类', CATEGORY_LABEL[b.category_l1] ?? b.category_l1],
  ];
  if (b.translator) items.push(['译者', b.translator]);
  if (b.isbn13) items.push(['ISBN', b.isbn13]);
  return items;
});
</script>

<template>
  <section class="detail">
    <p v-if="!book" class="detail-missing">
      这本书不在这份书单里。可能是链接过期，或者它来自另一份书单。
      <a href="#/result">回到我的推荐</a>
    </p>

    <template v-else>
      <a class="detail-back" href="#/result">← 回到推荐</a>

      <BookHead :book="book" :links="links" />

      <section v-if="judged" class="tier-block">
        <span v-for="i in TIER_SQUARES[judged.tier]" :key="i" class="tier-square" :class="`tier-${judged.tier}`" aria-hidden="true"></span>
        <span class="tier-label">{{ TIER_LABEL[judged.tier] }}</span>
      </section>

      <!-- 理由四段：S1 回引 / S2 讲什么 / S3 能得到什么 / B1 边界声明 -->
      <BookReason :book="book" :hits="hits" :reason-lines="matched?.reason.lines ?? []" :boundary="boundary" />

      <section class="meta-block">
        <h2 class="block-title">书目信息</h2>
        <dl class="meta-grid">
          <template v-for="[k, v] in metaItems" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
      </section>

      <section v-if="related.length > 0" class="related-block">
        <h2 class="block-title">同主题的其它几本</h2>
        <ul class="related-list">
          <li v-for="r in related" :key="r.book_id">
            <a :href="`#/book/${r.book_id}`">{{ r.title }}</a>
            <span class="related-meta">{{ r.author_display[0] }} · 约 {{ r.est_reading_hours }} 小时</span>
          </li>
        </ul>
      </section>

      <footer class="detail-footer">
        <a href="#/result">回到推荐</a>
        <a href="#/framework">怎么读这本书</a>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.detail {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px;
}

.detail-missing {
  color: var(--text-secondary);
  line-height: 1.9;
}

.detail-missing a,
.detail-back,
.detail-footer a {
  color: var(--accent);
}

.detail-back {
  display: inline-block;
  font-size: 0.8125rem;
  text-decoration: none;
  margin-bottom: 20px;
}

.tier-block {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 20px 0 8px;
}

.tier-square {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: var(--tier-track);
}

.tier-strong {
  background: var(--flag-strong);
}

.tier-worth {
  background: var(--flag-worth);
}

.tier-label {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-left: 4px;
}

.meta-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  margin: 0;
  font-size: 0.8125rem;
}

.meta-grid dt {
  color: var(--text-muted);
}

.meta-grid dd {
  color: var(--text-primary);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.related-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.related-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-soft);
}

.related-list a {
  color: var(--accent);
  font-size: 0.875rem;
  text-decoration: none;
}

.related-meta {
  color: var(--text-muted);
  font-size: 0.75rem;
  flex: 0 0 auto;
}

.detail-footer {
  display: flex;
  gap: 16px;
  margin-top: 28px;
  font-size: 0.8125rem;
}

.detail-footer a {
  text-decoration: none;
}
</style>
