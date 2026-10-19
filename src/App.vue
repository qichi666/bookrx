<script setup lang="ts">
/**
 * 应用外壳。
 *
 * 危机页 P8 用**懒加载**引入（路由级动态 import），这样它一定被切成独立 chunk；
 * 静态 import 会被并进主包，而 `crisis-*` 这个文件名是 `copy-audit` 层 2 的收窄条件。
 */
</script>

<template>
  <main>
    <router-view />
  </main>
</template>

<style scoped>
main {
  padding: 16px;
}
</style>
