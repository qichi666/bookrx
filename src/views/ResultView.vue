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
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { Tier } from '@/contracts/recommendation.js';
import { tierOf } from '@/domain/scoring/tier.js';
import { DOMAIN_OPTIONS } from '@/data/quiz.js';
import { PHRASES } from '@/data/phrases.js';
import { domainsWithoutInline } from '@/data/library-index.js';
import { clearDiagnosis, loadDiagnosis } from '@/engine/session.js';
import { recordResult } from '@/engine/telemetry.js';
import { computeResult, echoPhrases, hasCrisisSignal, type ComputedResult } from '@/engine/result.js';
import BookCard from '@/components/BookCard.vue';
import WideResults from '@/components/WideResults.vue';
import { useWidePool } from '@/composables/useWidePool.js';
import { normalizeTitle } from '@/engine/wide-pool.js';
import CrisisPanel from '@/components/CrisisPanel.vue';
import CrisisBar from '@/components/CrisisBar.vue';
import NoInlineNote from '@/components/NoInlineNote.vue';
import ExternalCard from '@/components/ExternalCard.vue';
import TuneBar from '@/components/TuneBar.vue';
import ResultSummary from '@/components/ResultSummary.vue';
import FeedbackBar from '@/components/FeedbackBar.vue';

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
  // 兜底去重：同一本书（书名归一后相同）在本次结果里只出现一次
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    const key = normalizeTitle(it.book.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const judged = unique.map((it) => ({ it, tier: tierOf(it.score_bp, it.primary_hit).tier }));
  return GROUPS.map((g) => ({ ...g, items: judged.filter((x) => x.tier === g.tier).map((x) => x.it) }));
});

/** 反馈条只带档位计数，不带书名、不带用户原话（P2-3 的边界）。 */
const tierCount = computed(() => {
  const n = { strong: 0, worth: 0, explore: 0 };
  for (const g of grouped.value) n[g.tier] = g.items.length;
  return n;
});

// 全库推荐池：与核心库、库外建议按书名去重，避免同一本书出现两次
const usedTitles = computed(() => [
  ...(result.value?.items ?? []).map((it) => it.book.title),
  ...(result.value?.external ?? []).map((s) => s.title),
]);
const { loading: wideLoading, pool, next } = useWidePool(diagnosis, usedTitles);

const hasItems = computed(() => (result.value?.items.length ?? 0) > 0);
const itemCount = computed(() => result.value?.items.length ?? 0);

/**
 * P0-16：情绪与自我域的常驻资源条。命中危机信号时不显示 —— 那时 CrisisPanel 已经接管整页，
 * 再叠一条等于同一件事说两遍。两者只有一个危机入口（data-crisis-entry 由外层决定挂谁）。
 */
const emotionBar = computed(() => diagnosis.value?.answers.domain === 'emotion' && !crisis.value);

/**
 * P0-17：这个域的书库里一本可直读正文都没有。
 * 判断来自数据而不是写死域名单——书库变了说明条要自己消失。
 */
const noInlineDomain = computed(() => {
  const d = diagnosis.value?.answers.domain;
  return d !== undefined && domainsWithoutInline().has(d);
});

// 本地匿名计数（SPEC §10.2）：同一诊断只计一次；只记域与档位，自由文本不入计数
watch(result, (r) => {
  if (!r) return;
  const tiers = r.items.map((it) => tierOf(it.score_bp, it.primary_hit).tier);
  recordResult(r.diagnosis, tiers);
});

function restart(): void {
  clearDiagnosis();
  void router.push('/');
}

/** 调参（M1a-E）：覆写 answers 触发 computeResult 重算；置 null = 回退问卷原值。 */
const effectiveAnswers = computed(
  () => ({ ...(diagnosis.value?.answers ?? {}), ...overrides.value }) as Record<string, string | undefined>,
);

function onTune(key: string, value: string | null): void {
  const next: Record<string, unknown> = { ...overrides.value };
  if (value === null) delete next[key];
  else next[key] = value;
  overrides.value = next;
}
</script>

<template>
  <section class="result">
    <!-- 全项目 data-crisis-entry 配额恒为 2（结果页 + /about）；这里用条替代那行链接，不叠加 -->
    <CrisisBar v-if="emotionBar" data-crisis-entry />
    <a v-else class="result-crisis" data-crisis-entry href="#/crisis">需要现在就和人说说话</a>

    <template v-if="!diagnosis || !result">
      <h1>还没有诊断记录</h1>
      <p>先回答四个小问题，我们才能对上你的处境。</p>
      <a href="#/">去填问卷</a>
    </template>

    <template v-else>
      <ResultSummary :domain-label="domainLabel" :echoes="echoes" :judgment-line="judgmentLine" />

      <NoInlineNote v-if="!crisis && noInlineDomain" :domain-label="domainLabel" />

      <!-- 危机信号与推荐互斥：命中即只给资源 -->
      <CrisisPanel v-if="crisis" />

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
        <TuneBar :answers="effectiveAnswers" @tune="onTune" />

        <section v-for="g in grouped" :key="g.tier" v-show="g.items.length > 0" class="tier-group">
          <h2 class="group-title">{{ g.title }}</h2>
          <BookCard v-for="it in g.items" :key="it.book.book_id" :item="it" />
        </section>

        <p v-if="itemCount < 5" class="fewer-note">
          符合你条件的书只有 {{ itemCount }} 本，下面几本不在库里，但方向是对的。
        </p>

      </template>

      <!-- 全库推荐池：同域轮转，标「未标注」，与核心库分开 -->
      <WideResults
        v-if="!crisis"
        :picks="pool.picks"
        :size="pool.size"
        :loading="wideLoading"
        :evidence="pool.evidence"
        :weak-ids="pool.weak_ids"
        @next="next"
      />

      <!-- 库外路径 D：必标「未入库」。L4 时同样给出（按原词扩展） -->
      <section v-if="!crisis && result.external.length > 0" class="external-group">
        <h2 class="group-title">不在库里，但值得找</h2>
        <ExternalCard v-for="s in result.external" :key="s.title" :suggestion="s" />
      </section>

      <FeedbackBar v-if="!crisis && diagnosis" :diagnosis="diagnosis" :tiers="tierCount" />

      <footer class="result-footer">
        <button type="button" class="btn-ghost" @click="restart">重新填问卷</button>
        <a href="#/framework">怎么读这本书</a>
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

.fewer-note {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 16px 0;
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
</style>
