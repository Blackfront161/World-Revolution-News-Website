import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const qaDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(qaDir);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function loadScript(name, extra = {}) {
  const context = {
    window: {},
    document: { documentElement: { lang: 'de' } },
    Intl,
    ...extra
  };
  vm.createContext(context);
  vm.runInContext(read(name), context, { filename: name });
  return context.window;
}

test('editorial teaser returns exactly the first complete sentence', () => {
  const helper = loadScript('website-editorial-text.js').WRNWebsiteEditorialText;
  assert.equal(
    helper.firstCompleteSentence('Der erste Satz ist vollständig. Danach folgt ein zweiter Satz.', 'de'),
    'Der erste Satz ist vollständig.'
  );
  assert.equal(
    helper.firstCompleteSentence('„Auch ein zitierter Satz funktioniert.“ Danach geht es weiter.', 'de'),
    '„Auch ein zitierter Satz funktioniert.“'
  );
  assert.equal(
    helper.firstCompleteSentence('Die Stiftung heißt Jones Jr. Foundation und arbeitet international. Danach folgt mehr.', 'de'),
    'Die Stiftung heißt Jones Jr. Foundation und arbeitet international.'
  );
  assert.equal(
    helper.firstCompleteSentence('Kommt am 10. Oktober 2026, dem Internationalen Tag gegen die Todesstrafe, von 19–20:00 Uhr vor die US-Botschaft, Pariser Pl. 2 – U5-Brandenburger Tor. Noch immer ...', 'de'),
    'Kommt am 10. Oktober 2026, dem Internationalen Tag gegen die Todesstrafe, von 19–20:00 Uhr vor die US-Botschaft, Pariser Pl. 2 – U5-Brandenburger Tor.'
  );
});

test('editorial teaser omits incomplete, ellipsis and overlong text', () => {
  const helper = loadScript('website-editorial-text.js').WRNWebsiteEditorialText;
  assert.equal(helper.firstCompleteSentence('Dieser Teaser endet mitten im Satz', 'de'), '');
  assert.equal(helper.firstCompleteSentence('Dieser Teaser wurde abgeschnitten …', 'de'), '');
  assert.equal(helper.firstCompleteSentence(`${'Sehr '.repeat(60)}lang.`, 'de'), '');
});

test('fallback sentence parser handles date ordinals and abbreviations without Intl.Segmenter', () => {
  const brokenIntl = Object.create(Intl);
  brokenIntl.Segmenter = class { constructor() { throw new Error('unsupported'); } };
  const helper = loadScript('website-editorial-text.js', { Intl: brokenIntl }).WRNWebsiteEditorialText;
  assert.equal(
    helper.firstCompleteSentence('Kommt am 10. Oktober 2026, dem Internationalen Tag gegen die Todesstrafe, von 19–20:00 Uhr vor die US-Botschaft, Pariser Pl. 2 – U5-Brandenburger Tor. Noch immer ...', 'de'),
    'Kommt am 10. Oktober 2026, dem Internationalen Tag gegen die Todesstrafe, von 19–20:00 Uhr vor die US-Botschaft, Pariser Pl. 2 – U5-Brandenburger Tor.'
  );
});

test('machine translation label uses one natural origin phrase and rejects invalid origin', () => {
  const language = loadScript('website-language-origin.js').WRNLanguageOrigin;
  assert.equal(language.machineTranslationLabel('en', 'de'), 'Maschinell übersetzt aus Englisch');
  for (const invalid of ['UND', 'unknown', 'garbage', '', 'mul', 'zxx']) {
    assert.equal(language.machineTranslationLabel(invalid, 'de'), 'Maschinell übersetzt');
  }
});

test('auto translation reuses and reconciles one canonical status node', () => {
  const source = read('website-auto-translate.js');
  assert.match(source, /\.translation-note\[data-machine-translation="true"\], \.website-translation-status/);
  assert.match(source, /node\.classList\.add\('translation-note', 'website-translation-status'\)/);
  assert.doesNotMatch(source, /node\.dataset\.machineTranslation\s*=\s*'true'/);
  assert.match(source, /note\?\.matches\('\.translation-note\[data-machine-translation="true"\]'\)/);
  assert.match(source, /const machineCandidate = candidates\.find/);
  assert.match(source, /let node = machineCandidate \|\| candidates\.find/);
  assert.match(source, /candidates\.filter\(candidate => candidate !== node\)\.forEach/);
  assert.doesNotMatch(read('news-app-2-website.css'), /\.website-translation-status\s*\{[^}]*display\s*:\s*none/is);
});

test('card rendering uses the editorial teaser and has no line clamp in final desktop layer', () => {
  const app = read('news-app-2.js');
  const css = read('news-app-2-website.css');
  assert.match(app, /const intro = editorialTeaser\(translation\?\.intro \|\| article\.intro\)/);
  assert.match(app, /\$\{intro \? `<p>\$\{escapeHtml\(intro\)\}<\/p>` : ''\}/);
  assert.match(app, /news-card\$\{article\.image \? ' news-card--with-image' : ''\}/);
  assert.match(css, /\.website-portal \.news-card p\s*\{[^}]*-webkit-line-clamp:unset/is);
  assert.match(css, /\.article-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
});

test('index and service worker use identical revised shell URLs', () => {
  const html = read('index.html');
  const worker = read('service-worker.js');
  const expected = [
    'news-app-2.css?release=40',
    'news-app-2-website.css?release=32',
    'solidarity-network-21.js?release=3',
    'website-language-origin.js?release=3',
    'website-editorial-text.js?release=2',
    'news-app-2.js?release=46-web13',
    'news-app-2-website.js?release=18',
    'website-auto-translate.js?release=10'
  ];
  for (const url of expected) {
    assert.ok(html.includes(url), `index missing ${url}`);
    assert.ok(worker.includes(`./${url}`), `service worker missing ${url}`);
  }
  assert.match(worker, /wrn-web-portal-2026-08-16-r10j-r36/);
});

test('desktop scrolled state includes 200%-zoom equivalent widths and compact touch targets', () => {
  const js = read('news-app-2-website.js');
  const css = read('news-app-2-website.css');
  assert.match(js, /max-width: 700px/);
  assert.match(css, /website-scrolled \.next-header__inner\s*\{[^}]*min-height:62px/is);
  assert.match(css, /website-scrolled \.bottom-nav button\s*\{[^}]*min-height:44px/is);
});

test('desktop card actions are compact, ordered and keep 44px targets without affecting mobile', () => {
  const css = read('news-app-2-website.css');
  assert.match(css, /@media \(min-width:920px\)[\s\S]*\.news-card \.card-actions > \*[\s\S]*flex:0 0 auto;[\s\S]*min-height:44px;/);
  assert.match(css, /\.news-card \.card-actions \.save-card\s*\{[^}]*width:44px;[^}]*min-width:44px;/s);
  assert.match(css, /\.news-card \.card-actions \.translate-card[\s\S]*border-color:transparent;/);
});

test('SEO, article landing pages, feed snapshot and share core stay unchanged in scope', () => {
  const expectedUntouched = [
    'article-landing.css', 'sitemap.xml', 'robots.txt',
    'news-feed.json', 'website-portal-core.js', 'website-link-security.js'
  ];
  const sourceRoot = path.resolve(root, '..', 'wrn-web-portal-2026-08-15-r10i-package');
  for (const name of expectedUntouched) {
    assert.deepEqual(
      fs.readFileSync(path.join(root, name)),
      fs.readFileSync(path.join(sourceRoot, name)),
      `${name} changed unexpectedly`
    );
  }
  assert.equal(fs.readdirSync(path.join(root, 'articles')).length, 935);
});
