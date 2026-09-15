// 🍻 랜덤 마시기 알림 전용 최소 서비스워커.
// 캐싱/오프라인 기능은 없음 — Notification.showNotification()을 쓰기 위한 용도로만 존재함.
// (Android Chrome 등 일부 브라우저는 new Notification()을 직접 호출하면 예외를 던지고,
//  반드시 ServiceWorkerRegistration.showNotification()을 거쳐야 알림이 뜸)

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// 알림을 탭하면 앱 화면으로 포커스 이동
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow('./');
        })
    );
});
