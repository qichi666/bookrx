<script setup lang="ts">
/**
 * 推荐卡（结果页 8 项层级，UIUX §7.2）：
 * ① 档位方块 + 中文标签（颜色不单独编码档位，方块数 + 文字并列）
 * ② 书名 / 作者 ③ match_brief 首行 ④ 可获得性徽标 ⑤ structure_note
 * ⑥ 元数据行（时长 / 篇幅 / 难度） ⑦ 边界声明（有则显示）⑧ 深链按钮。
 * 只展示档位，不渲染分数或百分比（SPEC：加权和不是概率，伪造精度）。
 */
import { computed } from 'vue';
import type { RankedItem } from '@/engine/recommend.js';
import { tierOf } from '@/domain/scoring/tier.js';
import { SOURCE_LABEL } from '@/domain/scoring/reason.js';
import { metaLine, TIER_LABEL, TIER_SQUARES } from '@/data/book-labels.js';
import { availabilityClass, availabilityOf } from '@/data/availability.js';
import { cardLinksOf } from '@/data/book-links.js';

const props = defineProps<{ item: RankedItem }>();

const judged = computed(() => tierOf(props.item.score_bp, props.item.primary_hit));

/** explore 不渲染方块（1 格方块等于反复告诉用户「这本不行」），只留文字标签。 */
const squareCount = computed(() => TIER_SQUARES[judged.value.tier] ?? 0);

/** 可获得性口径与去哪个链接读，统一走 data 层（能力门控在那一层做，卡片不判断） */
const avail = computed(() => availabilityOf(props.item.book));
const availSkin = computed(() => availabilityClass(props.item.book));
const links = computed(() => cardLinksOf(props.item.book));
const meta = computed(() => metaLine(props.item.book));

/**
 * 详情页入口。整张卡不包成链接（卡内已有 4 个外链，嵌在链接里会变成"点哪都跳"），
 * 只在书名上给一个，另外在底部给一个文字入口。
 */
const detailHref = computed(() => `#/book/${props.item.book.book_id}`);
</script>

<template>
  <article class="book-card">
    <div class="tier-line">
      <span
        v-for="i in squareCount"
        :key="i"
        class="tier-square"
        :class="`tier-${judged.tier}`"
        aria-hidden="true"
      ></span>
      <span class="tier-label">{{ TIER_LABEL[judged.tier] }}</span>
    </div>

    <h3 class="book-title">
      <a :href="detailHref">{{ item.book.title }}</a>
    </h3>
    <p class="book-author">{{ item.book.author_display.join(' / ') }}</p>

    <p class="match-brief">{{ item.book.match_brief }}</p>

    <span class="avail-badge" :class="availSkin">{{ avail.label }}</span>

    <p class="structure-note">{{ item.book.structure_note }}</p>

    <p class="meta-line">{{ meta }}</p>

    <p v-if="item.book.boundary_hints" class="boundary">
      {{ item.book.boundary_hints.problem ?? item.book.boundary_hints.difficulty }}
    </p>

    <details class="why">
      <summary class="why-summary">为什么是这本</summary>
      <ul class="why-list">
        <li v-for="(line, i) in item.reason.lines" :key="i" class="why-line">
          <span class="why-source">{{ SOURCE_LABEL[line.source] }}</span>
          <span class="why-text">{{ line.text }}</span>
        </li>
      </ul>
    </details>

    <div class="card-links">
      <span class="links-label">到哪读</span>
      <a v-for="l in links" :key="l.href" :href="l.href" target="_blank" rel="noopener noreferrer">
        {{ l.label }}
      </a>
      <a class="detail-link" :href="detailHref">为什么是这本</a>
    </div>
  </article>
</template>

<style scoped>
.book-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}

.tier-line {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-bottom: 8px;
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

.book-title {
  font-family: var(--font-book);
  font-size: 1.125rem;
  margin: 0;
}

.book-title a {
  color: inherit;
  text-decoration: none;
}

.book-title a:hover {
  color: var(--accent);
}

.book-author {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 2px 0 10px;
}

.match-brief {
  font-size: 0.9375rem;
  color: var(--text-primary);
  margin: 0 0 8px;
}

.avail-badge {
  display: inline-block;
  font-size: 0.6875rem;
  border-radius: 3px;
  padding: 2px 8px;
  margin-bottom: 10px;
}

.avail-inline {
  background: var(--inline-bg);
  color: var(--inline-fg);
}

.avail-byo {
  background: var(--byo-bg);
  color: var(--byo-fg);
}

.avail-external {
  background: var(--surface-sunken);
  color: var(--text-muted);
}

.structure-note {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0 0 8px;
}

.meta-line {
  color: var(--text-muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  margin: 0 0 4px;
}

.boundary {
  color: var(--warn);
  font-size: 0.75rem;
  margin: 0 0 4px;
}

.card-links {
  display: flex;
  gap: 12px;
  align-items: baseline;
  flex-wrap: wrap;
  margin-top: 10px;
}

.links-label {
  color: var(--text-muted);
  font-size: 0.75rem;
}

/* 理由展开区：默认收起 —— 卡面必须一眼看完，追溯是"想深究时再点"的动作 */
.why {
  margin: 4px 0 2px;
}

.why-summary {
  color: var(--text-muted);
  font-size: 0.75rem;
  cursor: pointer;
  list-style: none;
}

.why-summary::before {
  content: "？";
  display: inline-block;
  width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  border: 1px solid var(--border-control);
  border-radius: 50%;
  margin-right: 6px;
  font-size: 0.625rem;
}

.why-list {
  list-style: none;
  padding: 8px 0 0;
  margin: 0;
}

.why-line {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.why-source {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--border-control);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.6875rem;
}

.why-text {
  flex: 1 1 auto;
}

.card-links a {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}

.card-links a:hover {
  text-decoration: underline;
}

/* 详情入口与"到哪读"不同类：前四个是把书拿到手，这个是把理由讲透 */
.detail-link {
  margin-left: auto;
}
</style>
