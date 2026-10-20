import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import { registerOffline } from './lib/offline.js';
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
  ],
});

createApp(App).use(router).mount('#app');

// 只在生产构建里真的注册（见 offline.ts 里为什么）
registerOffline();
