<script setup lang="ts">
/**
 * 详情页的理由段：命中依据 chips + S2 讲什么 + S3 能得到什么 + B1 边界声明 + 逐句来源。
 *
 * 「命中依据」放在最前面，是因为它回答的是"这跟我有什么关系"，
 * 而 S2/S3 回答的是"这书本身怎么样"。顺序反过来，用户会先读一段书评再去找自己的影子。
 *
 * 逐句来源徽章（书里写的 / 你的回答 / 书的标注）不是装饰：没有来源的理由
 * 不许上界面（SPEC §7.5），所以这个列表本身就是可审计性的实体。
 */
import type { Book } from '@/contracts/book.js';
import type { NeedTag } from '@/contracts/diagnosis.js';
import type { ReasonLine } from '@/contracts/recommendation.js';
import { SOURCE_LABEL, tagLabel } from '@/domain/scoring/reason.js';

defineProps<{
  book: Book;
  hits: readonly NeedTag[];
  reasonLines: readonly ReasonLine[];
  /** B1：为什么不是更高档（有则显示） */
  boundary: string;
}>();
</script>

<template>
  <section class="reason-block">
    <p v-if="hits.length > 0" class="hit-line">
      <span class="hit-label">命中了</span>
      <span v-for="h in hits" :key="h.tag" class="hit-chip">{{ h.user_phrase || tagLabel(h.tag) }}</span>
    </p>

    <h2 class="block-title">这本书讲什么</h2>
    <p class="reason-text">{{ book.one_line_what }}</p>
    <p class="reason-text muted">{{ book.structure_note }}</p>

    <template v-if="book.one_line_gain">
      <h2 class="block-title">读完你能拿到什么</h2>
      <p class="reason-text">{{ book.one_line_gain }}</p>
      <p v-if="book.first_action" class="reason-text muted">第一步：{{ book.first_action }}</p>
    </template>

    <p v-if="boundary" class="boundary-line">不过：{{ boundary }}</p>

    <ul v-if="reasonLines.length > 0" class="reason-list">
      <li v-for="(line, i) in reasonLines" :key="i">
        <span class="reason-source">{{ SOURCE_LABEL[line.source] }}</span>
        <span class="reason-body">{{ line.text }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* `.block-title` 在 `styles/sections.css`：书目信息 / 同主题两处也要用同一个层级 */

.hit-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
  margin: 0;
}

.hit-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.hit-chip {
  background: var(--surface-sunken);
  border-radius: 3px;
  padding: 1px 7px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.reason-text {
  font-size: 0.875rem;
  color: var(--text-primary);
  line-height: 1.85;
  margin: 0 0 6px;
}

.reason-text.muted {
  color: var(--text-secondary);
}

.boundary-line {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 12px 0 0;
}

.reason-list {
  list-style: none;
  padding: 12px 0 0;
  margin: 0;
}

.reason-list li {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.reason-source {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--border-control);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.6875rem;
}

.reason-body {
  flex: 1 1 auto;
}
</style>
