<script setup lang="ts">
/**
 * P8 心理援助资源（占位实现）。
 *
 * 这个文件的存在本身是**门禁的一部分**：`vite.config.ts` 的 `manualChunks` 按
 * `src/views/CrisisView` 把它切成独立 chunk，`copy-audit` 层 2 有三条规则按
 * `crisis-*` 文件名收窄。被并进主包时那三条规则会静默失效——不报错、也不命中。
 *
 * 四要素（机构 / 地区 / 号码 / 最近核对日期）与真实数据属于 M1，此处不填充假数据。
 */
</script>

<template>
  <section class="crisis">
    <h1>心理援助资源</h1>
    <p class="crisis-note">资源清单与最近核对日期在 M1 落地；此处不展示任何未经核对的号码。</p>
  </section>
</template>

<style scoped>
.crisis {
  padding: 16px;
}
.crisis-note {
  /* 色值一律走 token，这里不写兜底十六进制 —— 写了兜底，token 缺失时就看不出来 */
  color: var(--text-secondary);
}
</style>
