import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');

test('live feed uses status revisions and the website only translates on action', () => {
  const window = {};
  vm.runInNewContext(read('news-app-2-config.js'), { window });
  const config = window.WRN_CONFIG;
  assert.equal(config.dataUrls.feedStatus, 'https://blackfront161.github.io/Revolution-News-Data/feed-status.json');
  assert.equal(config.dataMirrors.feedStatus, 'https://raw.githubusercontent.com/Blackfront161/Revolution-News-Data/main/feed-status.json');
  assert.ok(config.dataUrls.newsFeed.endsWith('/news-feed.json'));
  assert.ok(config.dataUrls.libraryFeed.endsWith('/library-feed.json'));
  assert.ok(config.dataUrls.videoFeed.endsWith('/video-feed.json'));
  assert.ok(config.dataMirrors.libraryFeed.endsWith('/library-feed.json'));
  assert.ok(config.dataMirrors.videoFeed.endsWith('/video-feed.json'));
  assert.ok(read('news-app-2.js').includes("dataMirrors.libraryFeed, dataUrls.libraryFeed, 'library-feed.json'"));
  assert.ok(read('news-app-2.js').includes("dataMirrors.videoFeed, dataUrls.videoFeed, 'video-feed.json'"));
  assert.ok(!read('index.html').includes('src="website-auto-translate.js'));
  assert.ok(!read('service-worker.js').includes("'./website-auto-translate.js"));
});

test('service worker upgrade keeps saved articles and unrelated caches', async () => {
  const events = new Map();
  const deleted = [];
  const existing = [
    'wrn-web-portal-2026-08-20-r10n-r45',
    'wrn-web-data-2026-08-20-r10n-r45',
    'wrn-web-portal-2026-09-27-r46',
    'wrn-web-data-2026-09-27-r46',
    'wrn-saved-articles-v1',
    'another-site-cache'
  ];
  const self = {
    location: { href: 'https://solinaridao.com/service-worker.js' },
    addEventListener: (name, handler) => events.set(name, handler),
    clients: { claim: async () => {} }
  };
  const caches = {
    keys: async () => existing,
    delete: async name => { deleted.push(name); return true; }
  };
  vm.runInNewContext(read('service-worker.js'), { self, caches, URL, Map, Set });
  let work;
  events.get('activate')({ waitUntil: value => { work = value; } });
  await work;
  assert.deepEqual(deleted.sort(), existing.slice(0, 2).sort());
});

test('offline navigation and feed use previously cached responses', async () => {
  const page = { kind: 'cached-page' };
  const feed = { kind: 'cached-feed' };
  const cache = { match: async request =>
    String(request?.url || request).includes('news-feed.json') ? feed : page };
  const context = vm.createContext({
    self: {
      location: { href: 'https://solinaridao.com/service-worker.js' },
      addEventListener: () => {}
    },
    caches: { open: async () => cache },
    fetch: async () => { throw new Error('offline'); },
    URL,
    Map,
    Set,
    AbortController,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(read('service-worker.js'), context);
  const offlinePage = await vm.runInContext('networkFirstNavigation', context)(
    { url: 'https://solinaridao.com/' }
  );
  const offlineFeed = await vm.runInContext('networkFirstData', context)(
    { url: 'https://solinaridao.com/news-feed.json?revision=offline' }
  );
  assert.equal(offlinePage, page);
  assert.equal(offlineFeed, feed);
});
