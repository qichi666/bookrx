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
 * 主题开关（N1）因此**不进导航条**：它是个设置，不是一处目的地，
 * 塞进那 5 个里会让导航从"地图"退化成"杂物抽屉"。放在左侧，与返回按钮同级。
 *
 * **不放 `data-crisis-entry`**：全项目该配额只有 2 个（结果页 + /about），
 * 由层 1 门禁数着，头部加了配额测试会红。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { applyTheme, nextTheme, readTheme, saveTheme, type ThemeChoice } from '@/lib/theme.js';

const route = useRoute();
const router = useRouter();

/** 三态标签就是按钮上的字：不写"主题"两个字，因为按钮所在位置已经说明了它是设置 */
const THEME_LABEL: Record<ThemeChoice, string> = { auto: '跟随系统', light: '浅色', dark: '深色' };
const theme = ref<ThemeChoice>(readTheme());

/**
 * 单击循环：跟随系统 → 浅色 → 深色 → 跟随系统。
 *
 * 为什么不是两个按钮或一个开关：两态开关表达不了"跟随系统"这个默认值，
 * 而默认值的意义是"我不用管它"。三个状态用一个按钮走完，是这里最省的面积。
 * 所以也**不用 `aria-pressed`**：`aria-pressed` 描述的是开 / 关，
 * 套在一个三态循环上会让读屏读出"未按下"，而实际状态是"深色"。
 * 可读的状态由按钮文字给出，动作由 `aria-label` 说明。
 */
function cycleTheme(): void {
  const next = nextTheme(theme.value);
  theme.value = next;
  applyTheme(next);
  saveTheme(next);
}

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
      <button
        type="button"
        class="btn-theme"
        :aria-label="`主题：${THEME_LABEL[theme]}，点击切换为${THEME_LABEL[nextTheme(theme)]}`"
        @click="cycleTheme"
      >{{ THEME_LABEL[theme] }}</button>
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
  align-items: center;
  gap: 4px;
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

/* 与返回按钮同一触控高度，但**不画边框**：层级低于返回，高于正文 */
.btn-theme {
  min-height: 44px;
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.75rem;
  white-space: nowrap;
  cursor: pointer;
}

.btn-theme:hover {
  color: var(--text-primary);
}

.brand {
  color: var(--text-primary);
  font-weight: 600;
  text-decoration: none;
}.header-nav {
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
