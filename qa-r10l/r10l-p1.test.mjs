import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), 'utf8');
}

async function browserApi(name, exportName) {
  const window = {};
  const context = vm.createContext({ URL, Intl, console, globalThis: window, window });
  vm.runInContext(await source(name), context, { filename: name });
  return window[exportName];
}

test('stable website IDs survive DOM round-trips and URL identities remain deterministic', async () => {
  const core = await browserApi('website-portal-core.js', 'WRNWebsitePortalCore');
  const link = 'https://example.org/news/solidarity?id=4';
  const stable = core.stableArticleId({ link });
  assert.match(stable, /^wrn-[a-z0-9]+-[a-z0-9]+$/);
  assert.equal(core.stableArticleId({ id: link }), stable);
  assert.equal(core.stableArticleId({ id: stable.toUpperCase() }), stable);
  assert.equal(core.normalizeArticleId('not-an-article'), '');
});

test('public article URLs choose static landings only when the manifest proves they exist', async () => {
  const core = await browserApi('website-portal-core.js', 'WRNWebsitePortalCore');
  const article = { link: 'https://example.org/current/article' };
  const id = core.stableArticleId(article);
  assert.equal(core.articlePublicUrl(article, 'https://solinaridao.com/', new Set([id])), `https://solinaridao.com/articles/${id}/`);
  assert.equal(core.articlePublicUrl(article, 'https://solinaridao.com/', new Set()), `https://solinaridao.com/?article=${id}`);
  const metadata = core.buildArticleMetadata({ ...article, title: 'Current article' }, 'https://solinaridao.com/', {
    publicUrl: `https://solinaridao.com/?article=${id}`
  });
  assert.equal(metadata.canonical, `https://solinaridao.com/?article=${id}`);
});

test('five related controls keep distinct candidate IDs and never inherit the active dialog article', async () => {
  const core = await browserApi('website-portal-core.js', 'WRNWebsitePortalCore');
  const activeId = core.stableArticleId({ link: 'https://example.org/active' });
  const candidateIds = Array.from({ length: 5 }, (_, index) => (
    core.stableArticleId({ link: `https://example.org/related/${index + 1}` })
  ));
  const resolved = candidateIds.map(candidateId => (
    core.articleControlId(candidateId, activeId, true)
  ));
  const hrefs = resolved.map(id => (
    core.articlePublicUrl({ stableId: id }, 'https://solinaridao.com/', new Set())
  ));
  assert.deepEqual(resolved, candidateIds);
  assert.equal(new Set(resolved).size, 5);
  assert.equal(new Set(hrefs).size, 5);
  assert.ok(resolved.every(id => id !== activeId));
  assert.ok(hrefs.every((href, index) => href === `https://solinaridao.com/?article=${candidateIds[index]}`));
  assert.equal(core.articleControlId('', activeId, true), '', 'dialog controls without a candidate ID must fail closed');

  const main = await source('news-app-2.js');
  const website = await source('news-app-2-website.js');
  assert.match(main, /data-article-id="\$\{escapeHtml\(websiteArticleId\(candidate\)\)\}"/);
  assert.match(website, /core\.articleControlId\([\s\S]*Boolean\(control\.closest\('#next-article-dialog'\)\)/);
});

test('German genitive dates remain one complete sentence', async () => {
  const editorial = await browserApi('website-editorial-text.js', 'WRNWebsiteEditorialText');
  const text = 'Am Morgen des 5. Augusts begann die Versammlung in Berlin. Danach folgte eine Kundgebung.';
  assert.equal(editorial.firstCompleteSentence(text, 'de'), 'Am Morgen des 5. Augusts begann die Versammlung in Berlin.');
});

test('dangling date fragments and suspiciously short translations fall back to the original', async () => {
  const editorial = await browserApi('website-editorial-text.js', 'WRNWebsiteEditorialText');
  const original = 'Am Morgen des 5. Augusts begann die Versammlung in Berlin.';
  assert.equal(editorial.firstCompleteSentence('Am Morgen des 5.', 'de'), '');
  assert.equal(editorial.editorialTeaser('Am Morgen des 5.', original, 'de'), original);
  assert.equal(
    editorial.editorialTeaser('Die Versammlung begann friedlich.', original, 'de'),
    'Die Versammlung begann friedlich.'
  );
});

test('unknown article paths have a server reader fallback while static directories remain addressable', async () => {
  const htaccess = await source('.htaccess');
  assert.match(htaccess, /RewriteCond %\{REQUEST_FILENAME\} !-d[\s\S]*RewriteRule \^articles\/\(wrn-/);
  assert.match(htaccess, /\/\?article=\$1 \[R=302,L,NE\]/);
  const manifest = JSON.parse(await source('article-landing-manifest.json'));
  assert.equal(manifest.sitemap, '/sitemap.xml');
  const sitemap = await source('sitemap.xml');
  const ids = [...sitemap.matchAll(/\/articles\/(wrn-[a-z0-9]+-[a-z0-9]+)\//gi)].map(match => match[1].toLowerCase());
  assert.ok(ids.length > 500, `expected generated landings, received ${ids.length}`);
  for (const id of ids.slice(0, 25)) {
    assert.equal((await stat(new URL(`articles/${id}/index.html`, root))).isFile(), true);
  }
});

test('cold deep links use the data-ready bridge, and rendered cards expose website-stable IDs', async () => {
  const main = await source('news-app-2.js');
  const website = await source('news-app-2-website.js');
  assert.match(main, /CustomEvent\('wrn:articles-ready'/);
  assert.match(main, /openArticleById: openWebsiteArticleById/);
  assert.match(main, /addEventListener\('wrn:open-article-request'/);
  assert.match(website, /CustomEvent\('wrn:open-article-request'/);
  assert.match(main, /data-article-id="\$\{escapeHtml\(websiteArticleId\(article\)\)\}"/);
  assert.match(main, /data-article-id="\$\{escapeHtml\(websiteArticleId\(hero\)\)\}"/);
  assert.match(website, /waitForArticleBridge\(requested, signal, 22000\)/);
  assert.doesNotMatch(website, /search\.value = item\.title/);
});

test('r10l browser and service-worker revisions are consistent', async () => {
  const index = await source('index.html');
  const worker = await source('service-worker.js');
  for (const resource of [
    'website-editorial-text.js?release=3',
    'website-portal-core.js?release=6',
    'news-app-2.js?release=49-web16',
    'news-app-2-website.js?release=23'
  ]) {
    assert.ok(index.includes(resource), `index misses ${resource}`);
    assert.ok(worker.includes(resource), `service worker misses ${resource}`);
  }
  assert.match(worker, /news-app-2-website\.css\?release=35/);
  assert.match(worker, /wrn-web-portal-2026-08-20-r10l-r42/);
  assert.match(worker, /article-landing-manifest\.json\?release=1/);
});

test('QA worktree contains no accidental nested deployment packages', async () => {
  const names = await readdir(root);
  assert.equal(names.some(name => /r10l.*\.(?:zip|aab|apk)$/i.test(name)), false);
});
