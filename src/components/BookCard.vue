<script setup lang="ts">
/**
 * 推荐卡（结果页 8 项层级，UIUX §7.2）：
 * ① 档位方块 + 中文标签（颜色不单独编码档位，方块数 + 文字并列）
 * ② 书名 / 作者 ③ match_brief 首行 ④ 可获得性徽标 ⑤ structure_note
 * ⑥ 元数据行（时长 / 篇幅 / 难度） ⑦ 边界声明（有则显示）⑧ 深链按钮。
 * 只展示档位，不渲染分数或百分比（SPEC：加权和不是概率，伪造精度）。
 */
import { computed } from 'vue';
import type { ScoredBook } from '@/domain/scoring/score.js';
import { tierOf } from '@/domain/scoring/tier.js';

const props = defineProps<{ item: ScoredBook }>();

const judged = computed(() => tierOf(props.item.score_bp, props.item.primary_hit));

const TIER_LABEL: Record<string, string> = {
  strong: '高度契合',
  worth: '较为契合',
  explore: '换个角度',
};

const SQUARES: Record<string, number> = { strong: 3, worth: 2, explore: 0 };
/** explore 不渲染方块（1 格方块等于反复告诉用户「这本不行」），只留文字标签。 */
const squareCount = computed(() => SQUARES[judged.value.tier] ?? 0);

const AVAILABILITY_LABEL: Record<string, string> = {
  inline: '可直接开读',
  bring_your_own: '自备书源',
  external: '站外获取',
};

const LENGTH_LABEL: Record<number, string> = {
  1: '8 万字内',
  2: '8–20 万字',
  3: '20–40 万字',
  4: '40 万字以上',
};

const DIFFICULTY_LABEL: Record<number, string> = {
  1: '很轻松',
  2: '轻松',
  3: '适中',
  4: '有挑战',
  5: '硬核',
};

const wereadHref = computed(
  () => `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(props.item.book.title)}`,
);
const doubanHref = computed(
  () => `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(props.item.book.title)}`,
);
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

    <h3 class="book-title">{{ item.book.title }}</h3>
    <p class="book-author">{{ item.book.author_display.join(' / ') }}</p>

    <p class="match-brief">{{ item.book.match_brief }}</p>

    <span
      class="avail-badge"
      :class="item.book.availability === 'inline' ? 'avail-inline' : 'avail-byo'"
    >
      {{ AVAILABILITY_LABEL[item.book.availability] }}
    </span>

    <p class="structure-note">{{ item.book.structure_note }}</p>

    <p class="meta-line">
      约 {{ item.book.est_reading_hours }} 小时 · {{ LENGTH_LABEL[item.book.length_class] }} ·
      {{ DIFFICULTY_LABEL[item.book.difficulty] }}
    </p>

    <p v-if="item.book.boundary_hints" class="boundary">
      {{ item.book.boundary_hints.problem ?? item.book.boundary_hints.difficulty }}
    </p>

    <div class="card-links">
      <a :href="wereadHref" target="_blank" rel="noopener noreferrer">微信读书</a>
      <a :href="doubanHref" target="_blank" rel="noopener noreferrer">豆瓣</a>
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
  font-size: 1.125rem;
  margin: 0;
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
  gap: 16px;
  margin-top: 10px;
}

.card-links a {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}

.card-links a:hover {
  text-decoration: underline;
}
</style>
