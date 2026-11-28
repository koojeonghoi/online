// 🍻 랜덤 마시기 알림 및 앱 셸 캐시 라이프사이클 서비스워커.
// Notification.showNotification() 지원(Android Chrome 등)과
// 오프라인 앱 셸 폴백(네트워크 우선 + 캐시 폴백)을 함께 제공합니다.

const CACHE_PREFIX = 'party-games-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const APP_SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './src/utils/sanitize.js',
    './src/utils/audio.js',
    './src/utils/random.js',
    './src/core/room.js',
    './src/games/baseball.js',
    './src/games/rummikub.js',
    './src/games/bingo.js'
];

self.addEventListener('install', (event) => {
    const precache = self.caches
        ? self.caches
              .open(CACHE_NAME)
              .then((cache) =>
                  Promise.allSettled(APP_SHELL_ASSETS.map((asset) => cache.add(asset)))
              )
        : Promise.resolve();
    event.waitUntil(precache.then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    const cleanup = self.caches
        ? self.caches
              .keys()
              .then((keys) =>
                  Promise.all(
                      keys
                          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
                          .map((key) => self.caches.delete(key))
                  )
              )
        : Promise.resolve();
    event.waitUntil(cleanup.then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (!request || request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url, self.location ? self.location.href : undefined);
    } catch (_) {
        return;
    }

    if (self.location && url.origin !== self.location.origin) return;
    if (url.pathname.endsWith('/sw.js')) return;

    const shouldCache = !url.search;
    const fetcher = typeof self.fetch === 'function' ? self.fetch.bind(self) : fetch;
    event.respondWith(
        fetcher(request)
            .then((response) => {
                if (shouldCache && response && response.ok && self.caches) {
                    const responseClone = response.clone();
                    const cacheUpdate = self.caches
                        .open(CACHE_NAME)
                        .then((cache) => cache.put(request, responseClone))
                        .catch(() => {});
                    if (typeof event.waitUntil === 'function') {
                        event.waitUntil(cacheUpdate);
                    }
                }
                return response;
            })
            .catch((networkErr) => {
                if (!self.caches) throw networkErr;
                return self.caches.match(request).then((cached) => {
                    if (cached) return cached;
                    if (request.mode === 'navigate') {
                        return self.caches.match('./index.html').then((fallback) => {
                            if (fallback) return fallback;
                            throw networkErr;
                        });
                    }
                    throw networkErr;
                });
            })
    );
});

// 알림을 탭하면 앱 화면으로 포커스 이동
self.addEventListener('notificationclick', (event) => {
    if (event.notification && typeof event.notification.close === 'function') {
        event.notification.close();
    }
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client && typeof client.focus === 'function') {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow('./');
        })
    );
});
