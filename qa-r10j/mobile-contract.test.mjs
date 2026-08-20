import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qaRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(qaRoot);
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');
const css = read('news-app-2-website.css');
const app = read('news-app-2.js');
const html = read('index.html');
const worker = read('service-worker.js');

assert.match(css, /\.bottom-nav button:hover span:first-child[\s\S]*?color:#05080b;[\s\S]*?-webkit-text-fill-color:#05080b;/);
assert.match(css, /\.bottom-nav button\.active:hover span:first-child[\s\S]*?-webkit-text-fill-color:#05080b;[\s\S]*?-webkit-text-stroke-color:var\(--red\)/);
assert.match(app, /const INITIAL_LIVE_DEADLINE_MS = 6000;/);
assert.match(app, /await liveNewsCandidates\(\{[\s\S]*?foregroundLiveDeadline[\s\S]*?signal: loadController\.signal/);
assert.match(app, /timeoutMs: background \? 25000 : Math\.max\(1, foregroundLiveTimeoutMs\)/);
assert.match(app, /window\.addEventListener\('pagehide',[\s\S]*?event\.persisted[\s\S]*?activeDataLoadController\?\.abort\(\)[\s\S]*?prepareRestoredStartup/);
assert.match(app, /window\.addEventListener\('pageshow',[\s\S]*?loadAfterRestore\(\)/);
assert.match(html, /news-app-2-website\.css\?release=32/);
assert.match(html, /news-app-2\.js\?release=46-web13/);
assert.match(worker, /wrn-web-portal-2026-08-16-r10j-r36/);
assert.match(worker, /news-app-2-website\.css\?release=32/);
assert.match(worker, /news-app-2\.js\?release=46-web13/);

const articlePages = fs.readdirSync(path.join(root, 'articles'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .length;
assert.equal(articlePages, 935);

console.log(JSON.stringify({ ok: true, articlePages, files: [
  'news-app-2-website.css', 'news-app-2.js', 'index.html', 'service-worker.js'
] }, null, 2));
