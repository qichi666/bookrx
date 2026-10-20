/**
 * Service Worker：让「第二次打开不用联网」成立（P0-14）。
 *
 * 策略不是"预缓存整个站点"，而是两张表：
 *  · 导航请求（打开页面）→ 先走网络，成功就把这份 HTML 存下来；断网时用存的。
 *  · 同源静态资源（JS/CSS/字体/书目 JSON）→ 先给缓存，同时后台再取一次并更新。
 *    Vite 的产物文件名带哈希，内容变了名字就变，所以"先给缓存"不会让人卡在旧版本。
 *
 * 为什么不用 Workbox：这里只有两条规则，引入一个构建期插件 + 一份 manifest 生成器，
 * 换来的能力（预缓存清单）我们用不上——真正的静态清单在 `dist/` 里，哈希名由 Vite 定，
 * 想预缓存就得在构建后回填。两条 `fetch` 分支比那套链路更容易读懂、也更容易验证。
 *
 * 一条硬约束：**只缓存同源 GET**。跨域请求（外链书源）不进缓存，
 * 免得把别人的内容复制到用户机器上——那不是"离线可用"，那是分发。
 */

const CACHE = 'bookrx-v1';
const NAV_FALLBACK = ['./index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 装不上不算失败：首次访问时导航请求会自己把 index.html 存进来
      .then((c) => c.addAll(NAV_FALLBACK).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function sameOrigin(url) {
  return new URL(url, self.location.href).origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!sameOrigin(req.url)) return;

  // 导航：网络优先（要拿到最新入口），失败才用缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html'))),
    );
    return;
  }

  // 静态资源：缓存优先 + 后台刷新
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => hit);
      return hit ?? network;
    }),
  );
});
