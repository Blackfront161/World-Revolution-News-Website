import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qaRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(qaRoot);
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('news-app-2.js');
const html = read('index.html');
const css = read('news-app-2-website.css');
const baseCss = read('news-app-2.css');
const worker = read('service-worker.js');
const websiteRuntime = read('news-app-2-website.js');
const profiles = JSON.parse(read('solidarity-network.json')).profiles;

test('final revisions are unique and identical in HTML and worker shell', () => {
  const assets = [
    'news-app-2.css?release=40',
    'news-app-2-website.css?release=32',
    'solidarity-network-21.js?release=3',
    'website-language-origin.js?release=3',
    'website-editorial-text.js?release=2',
    'news-app-2.js?release=46-web13',
    'news-app-2-website.js?release=18',
    'website-auto-translate.js?release=10'
  ];
  for (const asset of assets) {
    assert.ok(html.includes(asset), `HTML missing ${asset}`);
    assert.ok(worker.includes(`./${asset}`), `worker missing ${asset}`);
  }
  assert.match(worker, /const APP_CACHE = 'wrn-web-portal-2026-08-16-r10j-r36'/);
  assert.match(worker, /const DATA_CACHE = 'wrn-web-data-2026-08-16-r10j-r36'/);
  assert.doesNotMatch(`${html}\n${worker}`, /desktop-r35|mobile-r35|release=44-web12|release=45-web12/);
});

test('desktop editorial and mobile live-first contracts coexist', () => {
  assert.match(app, /WRNWebsiteEditorialText\?\.firstCompleteSentence/);
  assert.match(app, /news-card\$\{article\.image \? ' news-card--with-image' : ''\}/);
  assert.match(css, /r10j integration:[\s\S]*?\.website-portal \.news-card p[\s\S]*?-webkit-line-clamp:unset/);
  assert.match(app, /const INITIAL_LIVE_DEADLINE_MS = 6000/);
  assert.match(app, /foregroundLiveDeadline[\s\S]*?signal: loadController\.signal/);
  assert.match(app, /pagehide[\s\S]*?activeDataLoadController\?\.abort\(\)[\s\S]*?prepareRestoredStartup/);
  assert.match(css, /bottom-nav button:hover span:first-child[\s\S]*?color:#05080b/);
});

test('help search is complete, volatile and has explicit Swiss emergency boundary', () => {
  for (const id of ['next-help-query', 'next-help-region', 'next-help-location', 'next-help-language', 'next-help-topic']) {
    assert.ok(app.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.match(app, /helpFilters: \{ query: '', region: '', location: '', language: '', topic: '' \}/);
  assert.match(app, /data-action="help-clear"/);
  assert.match(app, /data-view-target="help">\$\{escapeHtml\(t\('helpFind'\)\)\}/);
  assert.match(html, /id="next-menu-help" data-view-target="help"/);
  assert.match(app, /help-result-count" role="status" aria-live="polite"/);
  assert.match(app, /href="tel:117"/);
  assert.match(app, /href="tel:144"/);
  assert.doesNotMatch(app, /localStorage\.(?:setItem|getItem)\([^\n]*(?:helpFilters|next-help-query|solidarity-search)/);
  assert.doesNotMatch(app, /searchParams\.(?:set|append)\([^\n]*(?:help|region|location|language|topic)/);
  assert.match(baseCss, /\.help-filters \{[^}]*grid-template-columns: repeat\(2/);
  assert.match(baseCss, /@media \(max-width: 720px\)[\s\S]*?\.help-filters \{ grid-template-columns: 1fr/);
  assert.match(websiteRuntime, /url\.protocol === 'tel:'[\s\S]*?\^\\\+\?\[0-9\]/);
  assert.match(websiteRuntime, /url\.protocol === 'tel:' \|\| url\.protocol === 'mailto:'/);
});

test('ten verified profiles retain conservative language and emergency semantics', () => {
  assert.equal(profiles.length, 10);
  const byId = new Map(profiles.map(profile => [profile.id, profile]));
  assert.equal(byId.get('opferhilfe-schweiz-142').officialContact, 'tel:142');
  assert.equal(byId.get('opferhilfe-schweiz-142').emergency, false);
  assert.ok(byId.get('opferhilfe-schweiz-142').notResponsibleFor.some(value => value.includes('keine Notrufnummer')));
  assert.equal(byId.get('dargebotene-hand-143').officialContact, 'tel:143');
  assert.equal(byId.get('pro-juventute-147').officialContact, 'tel:147');
  assert.deepEqual(byId.get('queer-base-vienna').confirmedCounsellingLanguages, []);
  assert.ok(byId.get('queer-base-vienna').informationLanguages.includes('uk'));
  assert.equal(new Set(profiles.map(profile => profile.id)).size, 10);
});

test('all nine UI languages have help copy with English fallback code path', () => {
  for (const language of ['de','en','es','fr','it','pt','ru','el','tr']) {
    assert.match(app, new RegExp(`${language}:\\{ helpSearch:`));
  }
  assert.match(app, /HELP_LANGUAGE_COPY\[state\.language\] \|\| HELP_LANGUAGE_COPY\.en/);
  assert.match(app, /HELP_TOPIC_LABELS\[state\.language\] \|\| HELP_TOPIC_LABELS\.en/);
});

test('release scope keeps 935 article landings and excludes hidden content changes', () => {
  const articleCount = fs.readdirSync(path.join(root, 'articles'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).length;
  assert.equal(articleCount, 935);
  assert.ok(fs.existsSync(path.join(root, 'robots.txt')));
  assert.ok(fs.existsSync(path.join(root, 'sitemap.xml')));
  assert.ok(fs.existsSync(path.join(root, 'privacy.html')));
});
