import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');

test('website home keeps app sections while preserving complete web teasers', () => {
  const app = read('news-app-2.js');
  const css = read('news-app-2-website.css');
  assert.match(app, /const HOME_COUNT = 15;/);
  assert.match(app, /de: 'Das Wichtigste'/);
  assert.match(app, /de: \['Sport & Fankultur'/);
  assert.match(app, /const briefingItems = quickArticles\.filter/);
  assert.match(app, /data-briefing-id="\$\{escapeHtml\(article\.id\)\}"/);
  assert.match(app, /const sentence = homeHeadlineSentence\(article\);/);
  assert.match(css, /\.website-portal \.briefing-item small \{\s*display:block;\s*overflow:visible;\s*-webkit-line-clamp:unset;/);
  assert.match(css, /\.website-portal \.home-sports li p/);
});
