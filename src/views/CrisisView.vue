<script setup lang="ts">
/**
 * P8 心理援助资源。
 *
 * 这个文件的存在本身是**门禁的一部分**：`vite.config.ts` 的 `manualChunks` 按
 * `src/views/CrisisView` 把它切成独立 chunk，`copy-audit` 层 2 有三条规则按
 * `crisis-*` 文件名收窄。被并进主包时那三条规则会静默失效——不报错、也不命中。
 *
 * 数据来自 `catalog/crisis-resources.json`（每条含机构 / 地区 / 号码 / 时段，
 * `verified_at` 是最近一次人工核对日期）。**本页不放 `data-crisis-entry`**：
 * 全项目该配额只有 2 个（结果页 + /about），由层 1 门禁数着。
 *
 * 返回出口是必须的：这一页的人随时可能想退回去，没有出口等于把人困在门口。
 */
import { useRouter } from 'vue-router';
import { CRISIS_RESOURCES } from '@/data/crisis.js';

const router = useRouter();

/** 有历史就回上一页（结果页 / 问卷），直接打开本页时回首页。 */
function goBack(): void {
  if (window.history.state && window.history.state.back !== null) {
    void router.back();
  } else {
    void router.push('/');
  }
}
</script>

<template>
  <section class="crisis">
    <button type="button" class="btn-back" @click="goBack">← 返回</button>

    <h1>心理援助资源</h1>
    <p class="crisis-lead">这些电话有人接。打过去不需要想好说什么，说“我现在不太好”就可以。</p>

    <ul class="crisis-list">
      <li v-for="r in CRISIS_RESOURCES.resources" :key="r.contact" class="crisis-item">
        <p class="crisis-name">{{ r.name }}</p>
        <p class="crisis-contact">{{ r.contact }}</p>
        <p class="crisis-meta">
          {{ r.scope }}<span v-if="r.hours"> · {{ r.hours }}</span>
        </p>
        <p v-if="r.note" class="crisis-meta">{{ r.note }}</p>
      </li>
    </ul>

    <div class="crisis-emergency">
      <p class="crisis-name">{{ CRISIS_RESOURCES.emergency.name }}</p>
      <p class="crisis-contact">{{ CRISIS_RESOURCES.emergency.contact }}</p>
      <p class="crisis-meta">{{ CRISIS_RESOURCES.emergency.note }}</p>
    </div>

    <p class="crisis-verified">清单核对日期：{{ CRISIS_RESOURCES.verified_at }}。号码若有变动，以官方公布为准。</p>
  </section>
</template>

<style scoped>
.crisis {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px;
}

.btn-back {
  min-height: 44px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: var(--surface);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
  margin-bottom: 20px;
}

.crisis h1 {
  font-size: 1.75rem;
  margin: 0 0 8px;
}

.crisis-lead {
  color: var(--text-secondary);
  margin: 0 0 20px;
}

.crisis-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.crisis-item,
.crisis-emergency {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 12px;
}

.crisis-emergency {
  border-color: var(--danger);
}

.crisis-name {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  margin: 0 0 4px;
}

.crisis-contact {
  color: var(--text-primary);
  font-size: 1.375rem;
  font-weight: 590;
  font-variant-numeric: tabular-nums;
  margin: 0 0 4px;
}

.crisis-meta {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 0;
}

.crisis-verified {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin: 20px 0 0;
}
</style>
