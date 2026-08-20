import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { createPlan, escapeHtml, plainText, serializeJsonLd } from '../tools/generate-article-landings.mjs';

const execute = promisify(execFile);
const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testRoot, '..');
const generator = path.join(repositoryRoot, 'tools', 'generate-article-landings.mjs');
const coreSource = path.join(repositoryRoot, 'website-portal-core.js');

async function runGenerator(root, ...args) {
  return execute(process.execPath, [generator, '--root', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
}

async function runGeneratorWithFault(root, fault, ...args) {
  return execute(process.execPath, [generator, '--root', root, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, WRN_ARTICLE_GENERATOR_FAULT: fault }
  });
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function articleHashes(root) {
  const articlesRoot = path.join(root, 'articles');
  const entries = await readdir(articlesRoot, { withFileTypes: true });
  const result = new Map();
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    result.set(entry.name, digest(await readFile(path.join(articlesRoot, entry.name, 'index.html'))));
  }
  return result;
}

function sitemapIds(xml) {
  return [...xml.matchAll(/<loc>[^<]*\/articles\/(wrn-[a-z0-9]+-[a-z0-9]+)\/<\/loc>/g)].map(match => match[1]);
}

test('escaping protects HTML and embedded JSON-LD', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)> & "x"'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;x&quot;');
  const serialized = serializeJsonLd({ title: '</script><script>alert(1)</script>&\u2028' });
  assert.ok(!serialized.includes('</script>'));
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u2028/);
  assert.equal(plainText('<p>Hello</p><script>alert(1)</script><p>World</p>'), 'Hello World');
});

test('documentation promises process recovery without claiming power-loss atomicity', async () => {
  const readme = await readFile(path.join(repositoryRoot, 'README.md'), 'utf8');
  const help = (await runGenerator(repositoryRoot, '--help')).stdout;
  assert.match(readme, /prozessabbruchfestes transaktionales Recovery/i);
  assert.match(readme, /Best-Effort-Dateisystempersistenz/i);
  assert.match(readme, /keine Zusage von Stromausfall-, Kernel- oder Datenträger-Atomizität/i);
  assert.match(readme, /Wiederherstellung aus Git und dem unveränderlichen Release-\/Rollbackpaket/i);
  assert.match(readme, /niemals direkt im live ausgelieferten `public_html`/i);
  assert.match(help, /interrupted generator process/i);
  assert.match(help, /not a\s+guarantee against power loss, kernel failure or storage failure/i);
  assert.match(help, /never\s+directly in a live hosting directory/i);
  assert.doesNotMatch(`${readme}\n${help}`, /stromausfallsicher|power-loss safe|power-loss atomic/i);
});

test('append-only generator is safe by default, consistent and deterministic', async t => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'wrn-article-generator-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await copyFile(coreSource, path.join(fixture, 'website-portal-core.js'));
  const maliciousTitle = 'Safe title </script><script>alert(1)</script> & more';
  const feed = [
    {
      quelleName: 'Example Source',
      author: 'Ada Example',
      title: 'A reproducible article',
      link: 'https://example.org/article/one?utm_source=test',
      pubDate: '2026-08-20T10:00:00Z',
      content: 'First complete sentence. A second paragraph with useful context.\n\nMore reporting follows.',
      language: 'en',
      primaryTopic: 'Test'
    },
    {
      quelleName: 'Unsafe Source </script>',
      title: maliciousTitle,
      link: 'https://example.org/article/malicious',
      pubDate: '2026-08-20T11:00:00Z',
      content: '<p>Useful report.</p></script><img onerror=alert(2)><script>alert(3)</script> & details',
      language: 'en'
    },
    {
      quelleName: 'Missing Link',
      title: 'No original link',
      link: '',
      pubDate: '2026-08-20T12:00:00Z',
      content: 'This must be excluded.'
    },
    {
      quelleName: 'Relative Link',
      title: 'Relative original link',
      link: '/not-absolute',
      pubDate: '2026-08-20T12:30:00Z',
      content: 'This must also be excluded.'
    }
  ];
  await writeFile(path.join(fixture, 'news-feed.json'), `${JSON.stringify(feed, null, 2)}\n`, 'utf8');

  const safeCheck = await runGenerator(fixture);
  const checkReport = JSON.parse(safeCheck.stdout);
  assert.equal(checkReport.newCount, 2);
  assert.equal(checkReport.excludedCount, 2);
  assert.equal(checkReport.writeRequired, true);
  assert.equal(await readdir(fixture).then(files => files.includes('articles')), false, 'default check must not create output');

  await runGenerator(fixture, '--write');
  const manifest = JSON.parse(await readFile(path.join(fixture, 'article-landing-manifest.json'), 'utf8'));
  const sitemap = await readFile(path.join(fixture, 'sitemap.xml'), 'utf8');
  const directories = (await readdir(path.join(fixture, 'articles'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(manifest.ids, directories);
  assert.deepEqual([...sitemapIds(sitemap)].sort(), directories);
  assert.equal(manifest.articleCount, 2);

  const coreKey = `?test=${Date.now()}`;
  await import(`${pathToFileURL(path.join(fixture, 'website-portal-core.js')).href}${coreKey}`);
  const knownLongUrl = 'https://www.anred.org/jujuy-viviendo-en-la-intemperie-tras-la-represion-y-el-desalojo-a-las-familias-de-la-omunidad-santa-rosa-en-humahuaca/?utm_source=rss&utm_medium=rss&utm_campaign=jujuy-viviendo-en-la-intemperie-tras-la-represion-y-el-desalojo-a-las-familias-de-la-omunidad-santa-rosa-en-humahuaca';
  assert.equal(globalThis.WRNWebsitePortalCore.stableArticleId({ link: knownLongUrl }), 'wrn-101o0me-1bymtda');
  const maliciousId = globalThis.WRNWebsitePortalCore.stableArticleId({ link: feed[1].link });
  const maliciousPagePath = path.join(fixture, 'articles', maliciousId, 'index.html');
  const maliciousPage = await readFile(maliciousPagePath, 'utf8');
  assert.equal((maliciousPage.match(/<script/g) || []).length, 1, 'only the JSON-LD script element is allowed');
  assert.ok(!maliciousPage.includes('</script><script>'));
  assert.ok(!maliciousPage.includes('<img onerror'));
  assert.doesNotThrow(() => {
    const marker = '<script type="application/ld+json">';
    const start = maliciousPage.indexOf(marker) + marker.length;
    JSON.parse(maliciousPage.slice(start, maliciousPage.indexOf('</script>', start)));
  });

  const firstDeterministicCheck = await runGenerator(fixture);
  const secondDeterministicCheck = await runGenerator(fixture);
  assert.equal(firstDeterministicCheck.stdout, secondDeterministicCheck.stdout, 'QA report must be byte-deterministic');
  const stableReport = JSON.parse(firstDeterministicCheck.stdout);
  assert.equal(stableReport.newCount, 0);
  assert.equal(stableReport.manifestChanged, false);
  assert.equal(stableReport.sitemapChanged, false);
  assert.equal(stableReport.writeRequired, false);

  const reportPath = path.join(fixture, 'article-generator-report.json');
  await writeFile(reportPath, 'old report content\n', 'utf8');
  await runGenerator(fixture, '--report', reportPath);
  assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), stableReport);
  assert.equal((await readdir(fixture)).some(name => name.includes('article-generator-report.json.tmp-') || name.includes('article-generator-report.json.backup-')), false);

  const preservedId = directories[0];
  const preservedPath = path.join(fixture, 'articles', preservedId, 'index.html');
  const preservedBefore = `${await readFile(preservedPath, 'utf8')}<!-- historical-byte-marker -->\n`;
  await writeFile(preservedPath, preservedBefore, 'utf8');
  feed[0].content = 'Changed feed content must never silently rewrite an existing historical page.';
  await writeFile(path.join(fixture, 'news-feed.json'), `${JSON.stringify(feed, null, 2)}\n`, 'utf8');
  await runGenerator(fixture, '--write');
  assert.equal(await readFile(preservedPath, 'utf8'), preservedBefore, 'existing article page was rewritten');
});

test('restart recovery proves a complete old or new state after every live rename phase', async t => {
  const phases = ['after-articles-rename', 'after-manifest-rename', 'after-sitemap-rename'];
  for (const phase of phases) {
    await t.test(phase, async subtest => {
      const fixture = await mkdtemp(path.join(os.tmpdir(), `wrn-article-${phase}-`));
      subtest.after(() => rm(fixture, { recursive: true, force: true }));
      await copyFile(coreSource, path.join(fixture, 'website-portal-core.js'));
      const originalFeed = [{
        quelleName: 'Baseline Source',
        title: 'Historical baseline article',
        link: 'https://example.org/history/baseline',
        pubDate: '2026-08-19T10:00:00Z',
        content: 'Historical content must remain byte-identical.',
        language: 'en'
      }];
      const feedPath = path.join(fixture, 'news-feed.json');
      await writeFile(feedPath, `${JSON.stringify(originalFeed, null, 2)}\n`, 'utf8');
      await runGenerator(fixture, '--write');

      const oldArticleHashes = await articleHashes(fixture);
      const oldManifestHash = digest(await readFile(path.join(fixture, 'article-landing-manifest.json')));
      const oldSitemapHash = digest(await readFile(path.join(fixture, 'sitemap.xml')));
      const nextFeed = [...originalFeed, {
        quelleName: 'New Source',
        title: 'New transactional article',
        link: `https://example.org/new/${phase}`,
        pubDate: '2026-08-20T10:00:00Z',
        content: 'New content is installed only as part of one recoverable transaction.',
        language: 'en'
      }];
      await writeFile(feedPath, `${JSON.stringify(nextFeed, null, 2)}\n`, 'utf8');
      const targetPlan = await createPlan({
        root: fixture,
        feed: feedPath,
        site: 'https://solinaridao.com/'
      });
      const newManifestHash = digest(targetPlan.manifestText);
      const newSitemapHash = digest(targetPlan.sitemapText);
      const expectedNewHashes = new Map(oldArticleHashes);
      for (const [id, html] of targetPlan.newPages) expectedNewHashes.set(id, digest(html));

      const crash = await runGeneratorWithFault(fixture, phase, '--write').catch(error => error);
      assert.equal(crash.code, 86, `fault injection did not terminate at ${phase}`);
      assert.equal(await pathExists(path.join(fixture, '.article-generator-transaction')), true);
      assert.equal(await pathExists(path.join(fixture, '.article-generator.lock')), true);

      const recovered = await runGenerator(fixture, '--check');
      const recoveryReport = JSON.parse(recovered.stdout);
      const liveHashes = await articleHashes(fixture);
      const liveIds = [...liveHashes.keys()].sort();
      const oldIds = [...oldArticleHashes.keys()].sort();
      const newIds = [...expectedNewHashes.keys()].sort();
      const isOld = JSON.stringify(liveIds) === JSON.stringify(oldIds);
      const isNew = JSON.stringify(liveIds) === JSON.stringify(newIds);
      assert.ok(isOld || isNew, `recovery after ${phase} produced a mixed article set`);

      const liveManifest = await readFile(path.join(fixture, 'article-landing-manifest.json'));
      const liveSitemap = await readFile(path.join(fixture, 'sitemap.xml'));
      const manifest = JSON.parse(liveManifest);
      assert.deepEqual([...manifest.ids].sort(), liveIds);
      assert.deepEqual([...sitemapIds(liveSitemap.toString('utf8'))].sort(), liveIds);
      if (isOld) {
        assert.equal(digest(liveManifest), oldManifestHash);
        assert.equal(digest(liveSitemap), oldSitemapHash);
        assert.equal(recoveryReport.newCount, 1);
      } else {
        assert.equal(digest(liveManifest), newManifestHash);
        assert.equal(digest(liveSitemap), newSitemapHash);
        assert.equal(recoveryReport.newCount, 0);
      }
      for (const [id, hash] of oldArticleHashes) {
        assert.equal(liveHashes.get(id), hash, `historical article ${id} changed after ${phase}`);
      }
      if (isNew) {
        for (const [id, hash] of expectedNewHashes) assert.equal(liveHashes.get(id), hash);
      }
      assert.equal(await pathExists(path.join(fixture, '.article-generator-transaction')), false);
      assert.equal(await pathExists(path.join(fixture, '.article-generator.lock')), false);
    });
  }
});

test('read-only check preserves all 935 production article hashes', async () => {
  const before = await articleHashes(repositoryRoot);
  assert.equal(before.size, 935);
  const manifestBefore = digest(await readFile(path.join(repositoryRoot, 'article-landing-manifest.json')));
  const sitemapBefore = digest(await readFile(path.join(repositoryRoot, 'sitemap.xml')));
  await runGenerator(repositoryRoot, '--check');
  const after = await articleHashes(repositoryRoot);
  assert.deepEqual(after, before);
  assert.equal(digest(await readFile(path.join(repositoryRoot, 'article-landing-manifest.json'))), manifestBefore);
  assert.equal(digest(await readFile(path.join(repositoryRoot, 'sitemap.xml'))), sitemapBefore);
  assert.equal(await pathExists(path.join(repositoryRoot, '.article-generator-transaction')), false);
  assert.equal(await pathExists(path.join(repositoryRoot, '.article-generator.lock')), false);
});

test('an active exclusive lock blocks a concurrent generator', async t => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'wrn-article-lock-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await copyFile(coreSource, path.join(fixture, 'website-portal-core.js'));
  await writeFile(path.join(fixture, 'news-feed.json'), '[]\n', 'utf8');
  const lock = path.join(fixture, '.article-generator.lock');
  await mkdir(lock);
  await writeFile(path.join(lock, 'owner.json'), `${JSON.stringify({ pid: process.pid, token: 'active-test-owner' })}\n`, 'utf8');
  const result = await runGenerator(fixture, '--check').catch(error => error);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /another article generator process is active/i);
  assert.equal(await pathExists(lock), true, 'a concurrent process must not remove the active owner lock');
});

test('a declared stable-ID takeover stops before writing', async t => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'wrn-article-collision-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(path.join(fixture, 'articles'), { recursive: true });
  await copyFile(coreSource, path.join(fixture, 'website-portal-core.js'));
  const feed = [{
    stableId: 'wrn-forced-collision',
    title: 'Mismatch',
    link: 'https://example.org/mismatch',
    pubDate: '2026-08-20T10:00:00Z',
    content: 'Mismatch content.'
  }];
  await writeFile(path.join(fixture, 'news-feed.json'), JSON.stringify(feed), 'utf8');
  const result = await runGenerator(fixture).catch(error => error);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /declared-id-does-not-match-original|failed/i);
  assert.deepEqual(await readdir(path.join(fixture, 'articles')), []);
});
