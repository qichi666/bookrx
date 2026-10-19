<script setup lang="ts">
/**
 * 应用外壳（占位实现）。
 *
 * P8 用**动态 import** 引入，这样它一定被切成独立 chunk；
 * 静态 import 会被并进主包，而 `crisis-*` 这个文件名是 `copy-audit` 层 2 的收窄条件。
 */
import { defineAsyncComponent, ref, watchEffect } from 'vue';

const CrisisView = defineAsyncComponent(() => import('./views/CrisisView.vue'));
const route = ref(location.hash);
watchEffect(() => {
  const onHash = () => {
    route.value = location.hash;
  };
  addEventListener('hashchange', onHash);
  return () => removeEventListener('hashchange', onHash);
});
</script>

<template>
  <main>
    <CrisisView v-if="route === '#/crisis'" />
    <p v-else>BookRx —— 首屏问卷与结果页属于 M1。</p>
  </main>
</template>

<style scoped>
main {
  padding: 16px;
}
</style>
