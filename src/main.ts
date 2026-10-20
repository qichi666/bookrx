import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import './tokens.css';
import './styles/controls.css';

/**
 * hash 路由：纯静态托管（GitHub Pages 等）无需服务端重写规则。
 * CrisisView 保持懒加载 —— 它必须是独立 chunk（门禁见 tools/assert-crisis-chunk*.mjs）。
 */
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'quiz', component: () => import('./views/QuizView.vue') },
    { path: '/result', name: 'result', component: () => import('./views/ResultView.vue') },
    { path: '/crisis', name: 'crisis', component: () => import('./views/CrisisView.vue') },
    { path: '/about', name: 'about', component: () => import('./views/AboutView.vue') },
    { path: '/framework', name: 'framework', component: () => import('./views/FrameworkView.vue') },
  ],
});

createApp(App).use(router).mount('#app');
