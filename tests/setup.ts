import { beforeEach, vi } from 'vitest';

/**
 * 全局测试前置：默认不让任何 fetch 真的出网。
 *
 * 为什么必须打桩：书目层用 `fetch('catalog/candidates/all.json')` 这类**相对路径**
 * 加载（浏览器里由当前文档地址解析，这是对的）。但 happy-dom 的默认地址是
 * `http://localhost:3000/`，测试里就变成真请求——没起 dev server 时必然
 * ECONNREFUSED，被 catch 吞掉后表现为「unhandled error」把 vitest 退出码顶成 1，
 * 看起来像断言挂了；起了 dev server 则结果随环境漂移。
 *
 * 默认返回 404 语义（ok:false）→ 候选层视为不可用，与「站点没带这份数据」一致。
 * 需要数据的用例在自己的 it 里再 stub 一次覆盖即可（后 stub 的生效）。
 */
beforeEach(() => {
  vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => null }));
});
