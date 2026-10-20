<script setup lang="ts">
/**
 * `/about`：隐私声明 + 本地计数聚合 + 危机入口（全项目两处之一，配额由门禁守着）。
 *
 * 隐私声明三句话是 SPEC §10.2 的硬约束：所有数据只存本机、卸载即消失、我们看不到你。
 */
import { computed, ref } from 'vue';
import { DOMAIN_OPTIONS } from '@/data/quiz.js';
import { readCounters, resetCounters } from '@/engine/telemetry.js';

const counters = ref(readCounters());

const TIER_LABEL: Record<string, string> = {
  strong: '高度契合',
  worth: '较为契合',
  explore: '换个角度',
};

const domainRows = computed(() =>
  DOMAIN_OPTIONS.map((o) => ({ label: o.label, count: counters.value.domain_counts[o.domain] ?? 0 })).filter(
    (r) => r.count > 0,
  ),
);

const tierRows = computed(() =>
  Object.entries(TIER_LABEL)
    .map(([tier, label]) => ({ label, count: counters.value.tier_counts[tier] ?? 0 }))
    .filter((r) => r.count > 0),
);

function clear(): void {
  resetCounters();
  counters.value = readCounters();
}
</script>

<template>
  <section class="about">
    <a class="about-crisis" data-crisis-entry href="#/crisis">心理援助资源</a>

    <h1>关于 BookRx</h1>
    <p class="about-lead">
      输入你此刻的困境，得到几本确实对味的书。推荐由本地的确定性算法完成，
      不需要账号，也不会把你的任何内容发出去。
    </p>

    <h2>你的数据</h2>
    <ul class="privacy-list">
      <li>所有数据只存在你自己的浏览器里。</li>
      <li>清掉浏览器数据或卸载应用，它们就消失了。</li>
      <li>我们看不到你——这个应用根本没有服务器可上报。</li>
    </ul>

    <h2>大家都卡在哪</h2>
    <p class="aggregate-note">
      下面是本机的匿名计数（只记困境域与结果档位，不含你写的任何文字）：
    </p>
    <template v-if="counters.total > 0">
      <p class="aggregate-total">共 {{ counters.total }} 次诊断</p>
      <ul class="aggregate-list">
        <li v-for="r in domainRows" :key="r.label">{{ r.label }} · {{ r.count }}</li>
      </ul>
      <ul class="aggregate-list">
        <li v-for="r in tierRows" :key="r.label">{{ r.label }} · {{ r.count }}</li>
      </ul>
    </template>
    <p v-else class="aggregate-note">还没有记录。</p>
    <button v-if="counters.total > 0" type="button" class="btn-ghost clear-counts" @click="clear">
      清空这份计数
    </button>
  </section>
</template>

<style scoped>
.about {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px;
}

.about-crisis {
  display: inline-block;
  color: var(--danger);
  font-size: 0.8125rem;
  margin-bottom: 16px;
}

h1 {
  font-size: 1.75rem;
  margin: 0 0 8px;
}

h2 {
  font-size: 1.125rem;
  margin: 24px 0 8px;
}

.about-lead {
  color: var(--text-secondary);
  margin: 0;
}

.privacy-list,
.aggregate-list {
  color: var(--text-secondary);
  line-height: 1.8;
  margin: 0;
  padding-left: 20px;
}

.aggregate-note {
  color: var(--text-muted);
  font-size: 0.8125rem;
  margin: 0 0 8px;
}

.aggregate-total {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  margin: 0 0 8px;
}

/* 按钮本体在 styles/controls.css，这里只补这块版式需要的间距 */
.clear-counts {
  margin-top: 8px;
}
</style>
