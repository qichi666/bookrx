import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import { registerOffline } from './lib/offline.js';
import { applyTheme, readTheme } from './lib/theme.js';
import './tokens.css';
import './styles/controls.css';
import './styles/sections.css';
import './styles/rx.css';

/**
 * hash 路由：纯静态托管（GitHub Pages 等）无需服务端重写规则。
 * CrisisView 保持懒加载 —— 它必须是独立 chunk（门禁见 tools/assert-crisis-chunk*.mjs）。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'quiz', component: () => import('./views/QuizView.vue') },
    { path: '/result', name: 'result', component: () => import('./views/ResultView.vue') },
    { path: '/book/:id', name: 'book', component: () => import('./views/BookDetailView.vue') },
    { path: '/booklist', name: 'booklist', component: () => import('./views/BooklistView.vue') },
    { path: '/library', name: 'library', component: () => import('./views/LibraryView.vue') },
    { path: '/import', name: 'import', component: () => import('./views/ImportView.vue') },
    { path: '/reader/:id', name: 'reader', component: () => import('./views/ReaderView.vue') },
    { path: '/crisis', name: 'crisis', component: () => import('./views/CrisisView.vue') },
    { path: '/about', name: 'about', component: () => import('./views/AboutView.vue') },
    { path: '/framework', name: 'framework', component: () => import('./views/FrameworkView.vue') },
    /* ── 2026-11-09 扩展：书库 / 对比 / 统计 / 笔记 / 计划 / 打印 / 治理 ──
       CrisisView 仍保持懒加载且必须是独立 chunk（门禁见 tools/assert-crisis-chunk*.mjs）；
       下面这些同样懒加载，不会并进主包。 */
    { path: '/books', name: 'books', component: () => import('./views/BooksView.vue') },
    { path: '/compare', name: 'compare', component: () => import('./views/CompareView.vue') },
    { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
    { path: '/notes', name: 'notes', component: () => import('./views/NotesView.vue') },
    { path: '/plan', name: 'plan', component: () => import('./views/PlanView.vue') },
    { path: '/print', name: 'print', component: () => import('./views/PrintView.vue') },
    { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue') },
    { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue') },
    // 兜底：hash 路由下任何拼错的地址（#/stas、#/book/）原本会渲染成一片空白，
    // 连返回入口都没有。重定向回首页，比让人对着空白页刷新强。
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

/**
 * 首屏就把主题落上，别等 AppHeader 挂载——晚一步的话，显式选了深色的人
 * 会先看到一帧浅色背景再翻黑，像页面闪了一下。
 *
 * 彻底消掉这一帧需要在 `<head>` 里写内联脚本，而 CSP 是 `script-src 'self'`，
 * 内联脚本会被直接拦掉（见 index.html）。所以这里接受一帧，不为了零闪白去放宽 CSP。
 */
applyTheme(readTheme());

createApp(App).use(router).mount('#app');

// 只在生产构建里真的注册（见 offline.ts 里为什么）
registerOffline();
