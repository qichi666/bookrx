<script setup lang="ts">
/**
 * P2 结果页（SPEC §7.2）。
 *
 * 三个不可妥协的呈现规则：
 * ① 诊断摘要条**逐字回显**用户原词（need_tags.user_phrase），不许改写；
 * ② 危机资源条与推荐结果**互斥**（P0-17）：自由文本命中危机信号词时，
 *    只给资源、不给推荐——「推荐 5 本书」对那一刻的人是答非所问；
 * ③ 库外建议（路径 D）与库内卡并列但结构不同：必标「未入库」，理由禁引打分口径。
 *
 * L4（库内 0 本，SPEC v2.2 裁决①）：不凑数。「这些都不对」+ 困境重述引导 +
 * 路径 D 按原词扩展，仍然成立——空结果是诚实，不是故障。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { Tier } from '@/contracts/recommendation.js';
import { tierOf } from '@/domain/scoring/tier.js';
import { CRISIS_RESOURCES } from '@/data/crisis.js';
import { DOMAIN_OPTIONS } from '@/data/quiz.js';
import { PHRASES } from '@/data/phrases.js';
import { clearDiagnosis, loadDiagnosis } from '@/engine/session.js';
import { computeResult, echoPhrases, hasCrisisSignal, type ComputedResult } from '@/engine/result.js';
import BookCard from '@/components/BookCard.vue';

const router = useRouter();

const saved = loadDiagnosis();
const diagnosis = ref(saved);
const overrides = ref<Parameters<typeof computeResult>[1]>({});

const result = computed<ComputedResult | null>(() =>
  diagnosis.value ? computeResult(diagnosis.value, overrides.value) : null,
);

const crisis = computed(() => diagnosis.value !== null && hasCrisisSignal(diagnosis.value));

const domainLabel = computed(() => {
  const d = diagnosis.value?.answers.domain;
  return DOMAIN_OPTIONS.find((o) => o.domain === d)?.label ?? '';
});

const echoes = computed(() => (diagnosis.value ? echoPhrases(diagnosis.value) : []));

const judgmentLine = computed(() => {
  const primary = diagnosis.value?.answers.primary_tag;
  return (primary && PHRASES.judgment[primary]) ?? '';
});

const GROUPS: ReadonlyArray<{ tier: Tier; title: string }> = [
  { tier: 'strong', title: '高度契合' },
  { tier: 'worth', title: '较为契合' },
  { tier: 'explore', title: '换个角度' },
];

const grouped = computed(() => {
  const items = result.value?.items ?? [];
  const judged = items.map((it) => ({ it, tier: tierOf(it.score_bp, it.primary_hit).tier }));
  return GROUPS.map((g) => ({ ...g, items: judged.filter((x) => x.tier === g.tier).map((x) => x.it) }));
});

const hasItems = computed(() => (result.value?.items.length ?? 0) > 0);
const itemCount = computed(() => result.value?.items.length ?? 0);
const noInline = computed(() => !(result.value?.items ?? []).some((i) => i.book.availability === 'inline'));

function restart(): void {
  clearDiagnosis();
  void router.push('/');
}
</script>

<template>
  <section class="result">
    <a class="result-crisis" data-crisis-entry href="#/crisis">需要现在就和人说说话</a>

    <template v-if="!diagnosis || !result">
      <h1>还没有诊断记录</h1>
      <p>先回答四个小问题，我们才能对上你的处境。</p>
      <a href="#/">去填问卷</a>
    </template>

    <template v-else>
      <!-- 诊断摘要条：逐字回显原词 -->
      <header class="summary">
        <p class="summary-lead">你正在面对（{{ domainLabel }}）：</p>
        <p class="summary-echo">
          <template v-for="(e, i) in echoes" :key="i">
            <mark :class="{ primary: e.isPrimary }">{{ e.phrase }}</mark>{{ i < echoes.length - 1 ? '、' : '' }}
          </template>
        </p>
        <p v-if="judgmentLine" class="summary-judgment">{{ judgmentLine }}</p>
      </header>

      <!-- P0-17：危机资源条与推荐互斥 -->
      <div v-if="crisis" class="crisis-panel">
        <h2>先照顾好此刻的自己</h2>
        <p class="crisis-note">这一刻书帮不上忙。这些电话有人接，随时可以打：</p>
        <ul class="crisis-list">
          <li v-for="r in CRISIS_RESOURCES.resources" :key="r.contact">
            <strong>{{ r.contact }}</strong>　{{ r.name }}<span v-if="r.hours">（{{ r.hours }}）</span>
          </li>
        </ul>
        <p class="crisis-emergency">{{ CRISIS_RESOURCES.emergency.note }}：{{ CRISIS_RESOURCES.emergency.contact }}</p>
      </div>

      <!-- L4：库内 0 本，不凑数 -->
      <div v-if="!crisis && !hasItems" class="empty-state">
        <h2>这些都不对</h2>
        <p>
          库里没有一本能正面接住你说的话——这不是你的表述问题，是我们书库还没写到这一页。
          换个说法再讲一次你的处境，会更准；或者先看下面这几本不在库里的。
        </p>
        <button type="button" class="btn-primary" @click="restart">重新说说我的处境</button>
      </div>

      <!-- 推荐结果：三组 -->
      <template v-else-if="!crisis">
        <section v-for="g in grouped" :key="g.tier" v-show="g.items.length > 0" class="tier-group">
          <h2 class="group-title">{{ g.title }}</h2>
          <BookCard v-for="it in g.items" :key="it.book.book_id" :item="it" />
        </section>

        <p v-if="itemCount < 5" class="fewer-note">
          符合你条件的书只有 {{ itemCount }} 本，下面几本不在库里，但方向是对的。
        </p>

        <p v-if="noInline" class="no-inline-note">
          这个领域暂时没有可直接开读的书——先把书找到手，读起来并不难。
        </p>
      </template>

      <!-- 库外路径 D：必标「未入库」。L4 时同样给出（按原词扩展） -->
      <section v-if="!crisis && result.external.length > 0" class="external-group">
        <h2 class="group-title">不在库里，但值得找</h2>
        <article v-for="s in result.external" :key="s.title" class="external-card">
          <span class="external-badge">{{ s.badge }}</span>
          <h3 class="book-title">{{ s.title }}</h3>
          <p class="book-author">{{ s.author_display.join(' / ') }}</p>
          <p class="external-reason">{{ s.reason }}</p>
          <p class="external-find">哪里能找到：{{ s.where_to_find }}</p>
        </article>
      </section>

      <footer class="result-footer">
        <button type="button" class="btn-ghost" @click="restart">重新填问卷</button>
        <a href="#/about">关于 BookRx 与你的数据</a>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.result {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px;
}

.result-crisis {
  display: inline-block;
  color: var(--danger);
  font-size: 0.8125rem;
  margin-bottom: 16px;
}

.summary {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 24px;
}

.summary-lead {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0 0 6px;
}

.summary-echo {
  font-size: 1rem;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.summary-echo mark {
  background: var(--surface-brand);
  color: var(--text-primary);
  padding: 1px 4px;
  border-radius: 3px;
}

.summary-echo mark.primary {
  font-weight: 590;
}

.summary-judgment {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0;
}

.crisis-panel {
  background: var(--surface);
  border: 2px solid var(--danger);
  border-radius: 10px;
  padding: 20px;
}

.crisis-panel h2 {
  margin: 0 0 8px;
}

.crisis-note {
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.crisis-list {
  margin: 0 0 12px;
  padding-left: 20px;
  line-height: 1.8;
}

.crisis-list strong {
  font-variant-numeric: tabular-nums;
}

.crisis-emergency {
  color: var(--danger);
  font-size: 0.8125rem;
  margin: 0;
}

.empty-state {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 24px;
}

.empty-state h2 {
  margin: 0 0 8px;
}

.tier-group {
  margin-bottom: 24px;
}

.group-title {
  font-size: 1.125rem;
  border-bottom: 1px solid var(--border-soft);
  padding-bottom: 6px;
  margin: 0 0 12px;
}

.fewer-note,
.no-inline-note {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 16px 0;
}

.external-card {
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}

.external-badge {
  display: inline-block;
  font-size: 0.6875rem;
  border: 1px solid var(--border-control);
  color: var(--text-muted);
  border-radius: 3px;
  padding: 2px 8px;
  margin-bottom: 8px;
}

.external-reason {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0 0 6px;
}

.external-find {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0;
}

.book-title {
  font-size: 1.125rem;
  margin: 0;
}

.book-author {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 2px 0 8px;
}

.result-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 32px;
}

.result-footer a {
  color: var(--accent);
  font-size: 0.8125rem;
  text-decoration: none;
}

.btn-ghost {
  min-height: 44px;
  padding: 8px 20px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.btn-primary {
  min-height: 44px;
  padding: 8px 24px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  cursor: pointer;
}
</style>
