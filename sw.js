const CACHE_NAME = 'ratforge-reader-v4';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // Cache-first strategy for static assets, Network-first for MD files?
    // Actually, Stale-While-Revalidate is best for content that might update.

    const url = new URL(e.request.url);

    // If it's an MD file or API call to GitHub
    if (url.pathname.endsWith('.md') || url.hostname.includes('github')) {
        e.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(e.request);
                const fetchPromise = fetch(e.request).then((networkResponse) => {
                    cache.put(e.request, networkResponse.clone());
                    return networkResponse;
                });
                return cachedResponse || fetchPromise;
            })
        );
    } else {
        // For app shell (HTML, CSS, JS)
        e.respondWith(
            caches.match(e.request).then((response) => {
                return response || fetch(e.request);
            })
        );
    }
});
