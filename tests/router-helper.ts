import { createMemoryHistory, createRouter, type Router } from 'vue-router';

/**
 * 组件测试用的最小路由。
 *
 * 为什么值得单独做一件事：不装 router 时组件**照样能渲染**，
 * 但 `<router-link>` 会解析成空元素、`useRouter()` 返回 undefined ——
 * 断言拿到空列表，看起来像"入口不存在"，控制台一路刷 Vue warn，而测试照样绿。
 * 这种"错了也不响"比红更危险；装了 router 之后，至少 `useRouter()` 拿到的是真对象。
 *
 * 路径表必须与 `src/main.ts` 保持一致：漏一条就会在控制台冒出
 * `No match found for location with path "/xxx"`，那时 href 是 `#` 之类的兜底值，
 * 依赖 href 的断言会静默失效。
 */
const APP_PATHS = [
  '/',
  '/result',
  '/book/:id',
  '/booklist',
  '/library',
  '/import',
  '/reader/:id',
  '/crisis',
  '/about',
  '/framework',
] as const;

export function makeTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    // 路由只用来让 router-link / useRouter 可用，组件本身不需要被真正渲染
    routes: APP_PATHS.map((path) => ({ path, component: { template: '<div />' } })),
  });
}
