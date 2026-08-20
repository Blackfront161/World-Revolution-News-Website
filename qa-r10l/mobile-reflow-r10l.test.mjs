import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const releaseWidths = [320, 360, 390, 430, 560, 600, 700];

async function source(name) {
  return readFile(new URL(name, root), 'utf8');
}

function mediaBlocks(css) {
  const blocks = [];
  let cursor = 0;
  while ((cursor = css.indexOf('@media', cursor)) !== -1) {
    const open = css.indexOf('{', cursor);
    if (open === -1) break;
    let depth = 1;
    let end = open + 1;
    while (end < css.length && depth) {
      if (css[end] === '{') depth += 1;
      if (css[end] === '}') depth -= 1;
      end += 1;
    }
    blocks.push({
      query: css.slice(cursor + 6, open).trim(),
      body: css.slice(open + 1, end - 1)
    });
    cursor = end;
  }
  return blocks;
}

function matchesWidth(query, width) {
  const minimum = query.match(/min-width\s*:\s*(\d+)px/i);
  const maximum = query.match(/max-width\s*:\s*(\d+)px/i);
  return (!minimum || width >= Number(minimum[1]))
    && (!maximum || width <= Number(maximum[1]));
}

function activeResponsiveCss(css, width) {
  return mediaBlocks(css)
    .filter(block => matchesWidth(block.query, width))
    .map(block => block.body)
    .join('\n');
}

test('section archive action reflows within every supported 200% viewport', async () => {
  const css = await source('news-app-2-website.css');
  const mainCss = await source('news-app-2.css');
  const markup = await source('news-app-2.js');

  assert.match(mainCss, /\*\s*\{\s*box-sizing:\s*border-box;/);
  assert.match(
    markup,
    /<div class="section-heading">[\s\S]*?<button class="section-text-action"[^>]+data-action="open-archive"/
  );

  for (const width of releaseWidths) {
    const active = activeResponsiveCss(css, width);
    assert.match(
      active,
      /:root\.website-portal\[data-font-size="200"\] \.section-heading\s*\{[\s\S]*?flex-direction:column;[\s\S]*?flex-wrap:wrap;[\s\S]*?align-items:stretch;/,
      `${width}px misses the single-column section-heading contract`
    );
    assert.match(
      active,
      /:root\.website-portal\[data-font-size="200"\] \.section-heading > \.section-text-action\s*\{[\s\S]*?width:100%;[\s\S]*?max-width:100%;[\s\S]*?min-width:0;[\s\S]*?white-space:normal;[\s\S]*?overflow-wrap:anywhere;/,
      `${width}px misses the bounded archive-action contract`
    );
    assert.match(
      active,
      /:root\.website-portal\[data-font-size="200"\] \.home-today-updates\s*\{[\s\S]*?width:100%;[\s\S]*?max-width:100%;[\s\S]*?min-width:0;[\s\S]*?grid-template-columns:minmax\(0,1fr\);/,
      `${width}px misses the bounded updates grid`
    );
    assert.match(
      active,
      /\.home-today-updates > :is\(a,button\),[\s\S]*?\.home-today-updates :is\(strong,small\)[\s\S]*?width:100%;[\s\S]*?max-width:100%;[\s\S]*?min-width:0;[\s\S]*?white-space:normal;[\s\S]*?overflow-wrap:anywhere;[\s\S]*?word-break:break-word;/,
      `${width}px misses the bounded updates-link contract`
    );
  }
});

test('r10l stylesheet and service-worker revisions are atomic', async () => {
  const index = await source('index.html');
  const worker = await source('service-worker.js');
  const stylesheet = 'news-app-2-website.css?release=35';

  assert.ok(index.includes(stylesheet), 'index misses the r10l stylesheet');
  assert.ok(worker.includes(stylesheet), 'service worker misses the r10l stylesheet');
  assert.match(worker, /wrn-web-portal-2026-08-20-r10l-r42/);
  assert.match(worker, /wrn-web-data-2026-08-20-r10l-r42/);
});
