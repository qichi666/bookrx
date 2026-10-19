<script setup lang="ts">
/**
 * 应用外壳：全局导航头 + 路由出口。
 *
 * 危机页 P8 用**懒加载**引入（路由级动态 import），这样它一定被切成独立 chunk；
 * 静态 import 会被并进主包，而 `crisis-*` 这个文件名是 `copy-audit` 层 2 的收窄条件。
 *
 * AppHeader 是全局出口（用户两次实测被困后加的）：任何页面都能返回或去关于页。
 */
import AppHeader from '@/components/AppHeader.vue';
</script>

<template>
  <AppHeader />
  <main>
    <router-view />
  </main>
</template>

<style scoped>
main {
  padding: 16px;
}
</style>
