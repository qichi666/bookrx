<script setup lang="ts">
/**
 * 应用外壳：全局导航头 + 路由出口。
 *
 * 危机页 P8 用**懒加载**引入（路由级动态 import），这样它一定被切成独立 chunk；
 * 静态 import 会被并进主包，而 `crisis-*` 这个文件名是 `copy-audit` 层 2 的收窄条件。
 *
 * AppHeader 是全局出口（用户两次实测被困后加的）：任何页面都能返回或去关于页。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';

const route = useRoute();
/**
 * 阅读页是全屏的（`position: fixed; inset: 0`）——留着全局导航头，
 * 它会被压在下面看不见，还多占一段滚动高度。所以这里**真的不渲染**，
 * 而不是用 CSS 盖住：看不见的元素仍然能被 Tab 聚焦，那是无障碍缺陷。
 */
const isReader = computed(() => route.name === 'reader');
</script>

<template>
  <AppHeader v-if="!isReader" />
  <main :class="{ full: isReader }">
    <router-view />
  </main>
</template>

<style scoped>
main {
  padding: 16px;
}

main.full {
  padding: 0;
}
</style>
