<script setup lang="ts">
/**
 * P2 结果页（占位实现）。
 *
 * 这里的 `data-crisis-entry` 是**危机入口门禁的层 1**：全项目只允许结果页与
 * `/about` 各挂一个，共 2 个。`tests/components/crisis-entry.test.ts` 数真实 DOM 节点。
 * 用属性而不是文案做标识，是因为文案会随设计改；属性是给机器读的契约。
 */
</script>

<template>
  <section class="result">
    <a class="result-crisis" data-crisis-entry href="#/crisis">需要现在就和人说说话</a>
  </section>
</template>

<style scoped>
.result {
  padding: 16px;
}
</style>
