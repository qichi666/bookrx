<script setup lang="ts">
/**
 * 危机资源面板（P0-17 互斥呈现的「资源」一侧）。
 * 数据来自 catalog/crisis-resources.json；改任何一条前先重核官方来源。
 */
import { CRISIS_RESOURCES } from '@/data/crisis.js';
</script>

<template>
  <div class="crisis-panel">
    <h2>先照顾好此刻的自己</h2>
    <p class="crisis-note">这一刻书帮不上忙。这些电话有人接，随时可以打：</p>
    <ul class="crisis-list">
      <li v-for="r in CRISIS_RESOURCES.resources" :key="r.contact">
        <strong>{{ r.contact }}</strong>　{{ r.name }}<span v-if="r.hours">（{{ r.hours }}）</span>
      </li>
    </ul>
    <p class="crisis-emergency">
      {{ CRISIS_RESOURCES.emergency.note }}：{{ CRISIS_RESOURCES.emergency.contact }}
    </p>
  </div>
</template>

<style scoped>
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
</style>
