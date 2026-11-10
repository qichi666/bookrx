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
import WishButton from '@/components/wish/WishButton.vue';

const props = defineProps<{ item: RankedItem }>();

// 第三参数不能省：省略时 tierOf 默认按满覆盖处理，候选层 38% 覆盖率的书
// 会被标成「强匹配」，而详情面板还在解释「因覆盖不足封顶」——结论与解释互相打架
const judged = computed(() =>
  tierOf(props.item.score_bp, props.item.primary_hit, props.item.book_coverage_bp),
);

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

    <div class="card-wish">
      <WishButton :book-id="item.book.book_id" compact />
      <router-link class="wish-compare" :to="`/compare?a=${encodeURIComponent(item.book.book_id)}`">
        拿它比一比
      </router-link>
    </div>
  </article>
</template>

<style scoped src="../styles/book-card.css"></style>
