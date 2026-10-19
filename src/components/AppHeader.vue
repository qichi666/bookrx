<script setup lang="ts">
/**
 * 全局导航头（每一页都有）。
 *
 * 起因是用户两次实测踩坑：危机页、关于页进去之后没有回去的入口，
 * 只能靠浏览器后退。页面间跳转不该依赖业务流向——头部三件套：
 * 返回（非首页才显示）/ 品牌回首页 / 关于（不在关于页显示）。
 *
 * **不放 `data-crisis-entry`**：全项目该配额只有 2 个（结果页 + /about），
 * 由层 1 门禁数着，头部加了配额测试会红。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const isHome = computed(() => route.path === '/');
const isAbout = computed(() => route.path === '/about');

/** 有历史就回上一页，直接打开本页时回首页（与危机页同一套逻辑）。 */
function goBack(): void {
  if (window.history.state && window.history.state.back !== null) {
    void router.back();
  } else {
    void router.push('/');
  }
}
</script>

<template>
  <header class="app-header">
    <div class="header-side">
      <button v-if="!isHome" type="button" class="btn-back" @click="goBack">← 返回</button>
    </div>
    <router-link class="brand" to="/">BookRx</router-link>
    <div class="header-side header-right">
      <router-link v-if="!isAbout" class="nav-about" to="/about">关于</router-link>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 720px;
  margin: 0 auto 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.header-side {
  flex: 1;
  display: flex;
}

.header-right {
  justify-content: flex-end;
}

.btn-back {
  min-height: 36px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-control);
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}

.brand {
  color: var(--text-primary);
  font-weight: 600;
  text-decoration: none;
}

.nav-about {
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-decoration: none;
}

.nav-about:hover {
  color: var(--text-primary);
  text-decoration: underline;
}
</style>
