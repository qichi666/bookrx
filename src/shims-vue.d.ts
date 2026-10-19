/**
 * 让**不带 vue 插件**的 `tsc -p` 也能解析 `.vue` 导入。
 * 真正的 SFC 类型由 `vue-tsc`（`npm run typecheck`）给出，这里只是让纯 tsc 不报错——
 * 否则"类型检查通过"这件事会取决于你用的是哪个命令。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
