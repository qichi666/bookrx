<script setup lang="ts">
/**
 * 书方（F4）：可打印、可带走的处方笺。
 *
 * 为什么这是最高优先级的产出物：66/68 本核心书是外链书，点开就跳去豆瓣，
 * **旅程在跳转那一刻结束**，用户手里什么都没留下。而两个成熟的「书方」产品
 * ——英国 Reading Well 的推荐表、Book Therapy 的 10 页 PDF 报告——交付主体
 * 恰恰就是"一张能拿在手里的东西"。
 *
 * 一条隐私设计（借鉴 StoryGraph 的 Private Books 与 Hardcover 的逐本可见性）：
 * **困境标签默认不打印**。这张纸可能被放在桌上、带给咨询师、被家人看到，
 * 而"我选了哪几个困境标签"比"我在读什么书"敏感得多。默认最小暴露，要带得自己勾。
 *
 * 打印样式三条硬要求：隐藏导航与按钮、A4 单页不断行、不用背景色省墨。
 */
import { computed, ref } from 'vue';
import { tierOf } from '@/domain/scoring/tier.js';
import { loadDiagnosis } from '@/engine/session.js';
import { computeResult } from '@/engine/result.js';
import { DOMAIN_OPTIONS, TAG_OPTIONS } from '@/data/quiz.js';
import type { ProblemDomain } from '@/contracts/enums.js';
import { DIFFICULTY_LABEL, TIER_LABEL } from '@/data/book-labels.js';

const diagnosis = loadDiagnosis();
const includeTags = ref(false);

const TAG_LABEL = new Map<string, string>();
for (const d of DOMAIN_OPTIONS) {
  for (const o of TAG_OPTIONS[d.domain as ProblemDomain]) TAG_LABEL.set(o.tag, o.label);
}

const result = computed(() => (diagnosis ? computeResult(diagnosis) : null));

const GROUPS = [
  { tier: 'strong' as const, title: '先读这几本' },
  { tier: 'worth' as const, title: '也可以' },
  { tier: 'explore' as const, title: '换个角度' },
];

const grouped = computed(() => {
  const items = result.value?.items ?? [];
  const judged = items.map((it) => ({
    it,
    tier: tierOf(it.score_bp, it.primary_hit, it.book_coverage_bp).tier,
  }));
  return GROUPS.map((g) => ({ ...g, items: judged.filter((x) => x.tier === g.tier).map((x) => x.it) })).filter(
    (g) => g.items.length > 0,
  );
});

const myTags = computed(() => (diagnosis?.need_tags ?? []).map((t) => TAG_LABEL.get(t.tag) ?? t.tag));
const domainLabel = computed(() => {
  const d = diagnosis?.answers.domain;
  return DOMAIN_OPTIONS.find((o) => o.domain === d)?.label ?? '';
});

const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

function doPrint(): void {
  window.print();
}
</script>

<template>
  <section class="rx">
    <div class="rx-toolbar no-print">
      <router-link class="rx-back" to="/result">← 回推荐</router-link>
      <label class="rx-toggle">
        <input v-model="includeTags" type="checkbox" />
        打印时带上我选的处境标签
      </label>
      <button type="button" class="btn-primary" @click="doPrint">打印 / 存成 PDF</button>
    </div>

    <p class="rx-hint no-print">
      默认不打印处境标签：这张纸可能被放在桌上、带给别人看，
      「我选了哪几个标签」比「我在读什么书」更需要你自己决定要不要露出来。
    </p>

    <article v-if="!diagnosis || !result" class="rx-sheet">
      <h1 class="sheet-title">还没有书方</h1>
      <p class="sheet-lead">先回答四个小问题，才有可以打印的东西。</p>
      <router-link class="no-print" to="/">去填问卷</router-link>
    </article>

    <article v-else class="rx-sheet">
      <header class="sheet-head">
        <p class="sheet-mark">BookRx 书方</p>
        <p class="sheet-date">{{ today }}</p>
      </header>

      <p v-if="includeTags && myTags.length > 0" class="sheet-tags">
        处境：{{ myTags.join('、') }}
        <span v-if="domainLabel" class="sheet-domain">（{{ domainLabel }}）</span>
      </p>
      <p v-else class="sheet-tags sheet-tags-hidden">
        处境：这一版按你的要求没有打印出来
      </p>

      <section v-for="g in grouped" :key="g.tier" class="sheet-group">
        <h2 class="sheet-group-title">{{ g.title }}</h2>
        <ol class="sheet-list">
          <li v-for="it in g.items" :key="it.book.book_id" class="sheet-item">
            <p class="sheet-book">
              <span class="sheet-book-title">{{ it.book.title }}</span>
              <span class="sheet-book-meta">
                {{ it.book.author_display.join(' / ') }} ·
                难度 {{ DIFFICULTY_LABEL[it.book.difficulty] ?? it.book.difficulty }} ·
                约 {{ it.book.est_reading_hours }} 小时 ·
                {{ TIER_LABEL[g.tier] }}
              </span>
            </p>
            <p class="sheet-why">{{ it.book.one_line_what }}</p>
          </li>
        </ol>
      </section>

      <footer class="sheet-foot">
        <p>
          这份书方由 BookRx 按你填的选项算出，用的是固定的评分规则：
          同样的回答永远得到同样的结果，不存在"算法今天心情不同"。
        </p>
        <p>
          它不是诊断，也不替代专业帮助。书的标注来自人工整理，
          标签数量有限——某一类只有三本书，是书库的现状，不是你的问题。
        </p>
      </footer>
    </article>
  </section>
</template>

<style scoped src="../styles/print.css"></style>
