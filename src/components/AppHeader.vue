<script setup lang="ts">
/**
 * 全局导航头（每一页都有）。
 *
 * 起因是用户两次实测踩坑：危机页、关于页进去之后没有回去的入口，
 * 只能靠浏览器后退。页面间跳转不该依赖业务流向——头部三件套：
 * 返回（非首页才显示）/ 品牌回首页 / 关于（不在关于页显示）。
 *
 * 2026-11-08 扩到 5 个入口：原来只有 3 个（书架 / 怎么读书 / 关于），
 * 而 `/books`（书库）、`/stats`（统计）全在二级，`/booklist`（导入书单）更不在导航里，
 * 于是一个 13 页的产品在导航层面只有 3 个页面存在。导航要当产品地图用。
 *
 * 为什么不塞 6 个：375px 下 6 个链接必然挤成两行或溢出，等于没扩。
 * 5 个 + 首页的功能卡已经能表达全部面积。
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
const isFramework = computed(() => route.path === '/framework');
const isLibrary = computed(() => route.path === '/library' || route.path === '/import');
const isBooks = computed(() => route.path === '/books');
const isStats = computed(() => route.path === '/stats');

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
    <nav class="header-nav" aria-label="主导航">
      <router-link v-if="!isBooks" class="nav-link" to="/books">书库</router-link>
      <router-link v-if="!isLibrary" class="nav-link" to="/library">书架</router-link>
      <router-link v-if="!isStats" class="nav-link" to="/stats">统计</router-link>
      <router-link v-if="!isFramework" class="nav-link" to="/framework">怎么读书</router-link>
      <router-link v-if="!isAbout" class="nav-link nav-about" to="/about">关于</router-link>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 12px;
  max-width: 720px;
  margin: 0 auto 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.header-side {
  flex: 0 0 auto;
  display: flex;
}

.header-right {
  margin-left: auto;
}

.btn-back {
  min-height: 44px;
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

.header-nav {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
  /* 横向滚动兜底：即使某个字号下真的放不下，也只在导航条内滚，不撑破页面 */
  overflow-x: auto;
  scrollbar-width: none;
}

.header-nav::-webkit-scrollbar {
  display: none;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  /* 44px 是触控下限：导航是最高频的可点元素，不能按文字高度给 */
  min-height: 44px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-decoration: none;
  white-space: nowrap;
}

.nav-link:hover {
  color: var(--text-primary);
  text-decoration: underline;
}

/* 窄屏：导航落到第二行占满宽度，而不是把 5 个链接压成 8px 的字 */
@media (max-width: 520px) {
  .header-nav {
    flex: 1 1 100%;
    margin-left: 0;
    gap: 14px;
    border-top: 1px solid var(--border-soft);
  }

  .nav-link {
    font-size: 0.8125rem;
  }
}
</style>
