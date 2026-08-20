/* World Revolution News – Offline Service Worker · News App 2 release 2026-08-11 */
'use strict';

const APP_CACHE = 'wrn-web-portal-2026-08-20-r10n-r45';
const DATA_CACHE = 'wrn-web-data-2026-08-20-r10n-r45';
const WRN_CACHE_PREFIX = 'wrn-';

const APP_SHELL = [
  './',
  './index.html',
  './privacy.html',
  './article-landing-manifest.json?release=1',
  './sitemap.xml',
  './manifest.json?release=16',
  './favicon.ico?release=2',
  './site-icon-16.png?release=1',
  './site-icon-32.png?release=1',
  './site-icon-48.png?release=1',
  './site-icon-192.png?release=1',
  './site-icon-512.png?release=1',
  './site-icon-maskable-512.png?release=1',
  './apple-touch-icon-site.png?release=1',
  './brand-icon-16.png?release=1',
  './brand-icon-32.png?release=1',
  './brand-icon-48.png?release=1',
  './brand-icon-192.png?release=1',
  './brand-icon-512.png?release=1',
  './brand-icon-maskable-512.png?release=1',
  './solinaridao-header-mark-filled-r10e.png?release=1',
  './solinaridao-wrn-subtitle-mask-r10e.png?release=1',
  './apple-touch-icon.png?release=1',
  './news-app-2.css?release=40',
  './news-app-2-release.css?release=5',
  './prisoner-solidarity.css?release=2',
  './zine-designer.css?release=5',
  './source-verification.css?release=1',
  './news-app-2-website.css?release=37',
  './article-landing.css?release=1',
  './news-app-2-config.js?release=13',
  './native-device-bridge.js?release=2',
  './offline-db.js?release=2',
  './news-app-2-core.js?release=6',
  './news-app-2-specialty.js?release=3',
  './wrn-product-21.js?release=1',
  './news-app-2-media.js?release=2',
  './news-app-2-release.js?release=2',
  './article-summary-core.js?release=1',
  './shared-translation-client.js?release=3',
  './stories-core.js?release=3',
  './lexicon-tab.js?release=6',
  './prisoner-solidarity.js?release=4',
  './zine-designer.js?release=3',
  './media-player.js?release=5',
  './audio-tools.js?release=1',
  './source-passport-21.js?release=1',
  './solidarity-network-21.js?release=3',
  './source-profiles.js?release=1',
  './source-verification.js?release=1',
  './website-language-origin.js?release=3',
  './website-editorial-text.js?release=3',
  './website-portal-core.js?release=6',
  './news-app-2.js?release=49-web16',
  './news-app-2-website.js?release=24',
  './website-translation-state.js?release=1',
  './website-translation-queue.js?release=3',
  './website-auto-translate.js?release=10',
  './website-link-security.js?release=1'
];

const OFFLINE_DATA = [
  './news-feed.json'
];

const JSON_FALLBACKS = new Map([
  [new URL('./news.json', self.location.href).pathname, '[]'],
  [new URL('./news-feed.json', self.location.href).pathname, '[]'],
  [new URL('./news-archive-manifest.json', self.location.href).pathname, '{"schemaVersion":1,"sources":[]}'],
  [new URL('./events.json', self.location.href).pathname, '[]'],
  [new URL('./events-feed.json', self.location.href).pathname, '[]'],
  [new URL('./podcasts.json', self.location.href).pathname, '[]'],
  [new URL('./generated-podcasts.json', self.location.href).pathname, '[]'],
  [new URL('./video-feed.json', self.location.href).pathname, '{"schemaVersion":1,"items":[],"stats":{"acceptedCount":0}}'],
  [new URL('./video-sources-registry.json', self.location.href).pathname, '{"schemaVersion":1,"sources":[]}'],
  [new URL('./radio-stations.json', self.location.href).pathname, '[]'],
  [new URL('./source-catalog.json', self.location.href).pathname, '[]'],
  [new URL('./podcast-sources.json', self.location.href).pathname, '[]'],
  [new URL('./radio-sources.json', self.location.href).pathname, '[]'],
  [new URL('./multilingual-source-registry.json', self.location.href).pathname, '{}'],
  [new URL('./alternative-social-media.json', self.location.href).pathname, '{"platforms":[]}'],
  [new URL('./prisoner-solidarity.json', self.location.href).pathname, '{"schemaVersion":1,"profiles":[],"sources":[]}'],
  [new URL('./library-sources.json', self.location.href).pathname, '[]'],
  [new URL('./library-feed.json', self.location.href).pathname, '[]'],
]);

const DATA_FILES = new Set([
  new URL('./news.json', self.location.href).pathname,
  new URL('./news-feed.json', self.location.href).pathname,
  new URL('./news-archive-manifest.json', self.location.href).pathname,
  new URL('./events.json', self.location.href).pathname,
  new URL('./events-feed.json', self.location.href).pathname,
  new URL('./source-catalog.json', self.location.href).pathname,
  new URL('./podcasts.json', self.location.href).pathname,
  new URL('./generated-podcasts.json', self.location.href).pathname,
  new URL('./video-feed.json', self.location.href).pathname,
  new URL('./video-sources-registry.json', self.location.href).pathname,
  new URL('./radio-stations.json', self.location.href).pathname,
  new URL('./podcast-sources.json', self.location.href).pathname,
  new URL('./radio-sources.json', self.location.href).pathname,
  new URL('./multilingual-source-registry.json', self.location.href).pathname,
  new URL('./library-sources.json', self.location.href).pathname,
  new URL('./library-feed.json', self.location.href).pathname,
  new URL('./alternative-social-media.json', self.location.href).pathname,
  new URL('./prisoner-solidarity.json', self.location.href).pathname
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    const dataCache = await caches.open(DATA_CACHE);
    await Promise.all(
      APP_SHELL.map(async resource => {
        const request = new Request(
          new URL(resource, self.location.href),
          { cache: 'reload' }
        );
        const response = await fetch(request);
        if (!response.ok) {
          throw new Error(`${resource}: HTTP ${response.status}`);
        }
        await cache.put(request, response);
      })
    );

    await Promise.all(OFFLINE_DATA.map(async resource => {
      const request = new Request(new URL(resource, self.location.href), { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`${resource}: HTTP ${response.status}`);
      await dataCache.put(request, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json?.() || {}; } catch {}
    const title = String(payload.title || 'World Revolution News');
    await self.registration.showNotification(title, {
      body: String(payload.body || ''),
      icon: './brand-icon-192.png?release=1',
      badge: './brand-icon-48.png?release=1',
      tag: String(payload.tag || 'wrn-update'),
      renotify: false,
      data: { url: String(payload.url || './index.html') }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification?.data?.url || './index.html', self.location.href).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clientsList.find(client => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, DATA_CACHE]);
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames
        .filter(name =>
          name.startsWith(WRN_CACHE_PREFIX)
          && !keep.has(name)
        )
        .map(name => caches.delete(name))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    DATA_FILES.has(url.pathname)
    || /\/news-detail-\d+\.json$/i.test(url.pathname)
    || /\/news-archive\/[a-z0-9_-]+\.json$/i.test(url.pathname)
  ) {
    event.respondWith(networkFirstData(request));
    return;
  }

  if (['script', 'style', 'manifest', 'font'].includes(
    request.destination
  )) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_CACHE);
  const requestUrl = new URL(request.url);
  const rootPath = new URL('./', self.location.href).pathname;
  const indexPath = new URL('./index.html', self.location.href).pathname;
  const isIndexNavigation = (
    requestUrl.pathname === rootPath
    || requestUrl.pathname === indexPath
  );

  try {
    const response = await fetchWithTimeout(request, 5000);
    if (response?.ok) {
      await cache.put(
        isIndexNavigation ? './index.html' : request,
        response.clone()
      );
    }
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match('./index.html'))
      || new Response(
        'Offline: Die App-Oberfläche ist noch nicht gespeichert.',
        {
          status: 503,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        }
      );
  }
}

async function networkFirstData(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetchWithTimeout(request, 8000);
    if (response?.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(
      request,
      { ignoreSearch: true }
    );
    const url = new URL(request.url);
    const fallback = /\/news-archive\/[a-z0-9_-]+\.json$/i.test(url.pathname)
      ? '[]'
      : JSON_FALLBACKS.get(url.pathname) || 'null';
    return cached || new Response(fallback, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-WRN-Offline-Fallback': 'empty'
      }
    });
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetchWithTimeout(request, 5000);
    if (response?.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || new Response('', { status: 504 });
  }
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );
  try {
    return await fetch(request, {
      signal: controller.signal,
      cache: 'no-store'
    });
  } finally {
    clearTimeout(timeout);
  }
}

