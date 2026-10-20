/**
 * 离线注册（P0-14 的接线）。
 *
 * 为什么只在生产构建里注册：开发模式下 Vite 的模块请求是不带哈希的，
 * Service Worker 一旦开始缓存，改代码不生效的症状会像"构建坏了"，
 * 而真正的原因是缓存。这个坑值得用一行 `if` 换掉。
 *
 * 注册失败（隐私模式、老浏览器、站点被禁存储）**不提示**：
 * 它属于"少一个能力"，不是"多一个错误"——弹一条"离线不可用"只会让人担心别的。
 */

export function registerOffline(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  const base = import.meta.env.BASE_URL || '/';
  const url = `${base.replace(/\/$/, '')}/sw.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url).catch(() => undefined);
  });
}
