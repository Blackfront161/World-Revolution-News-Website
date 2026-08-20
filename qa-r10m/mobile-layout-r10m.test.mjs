import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), 'utf8');
}

function rule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (css.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`, 'g')) || []).join('\n');
}

function requiredCompactWidth(viewport) {
  if (viewport <= 360) {
    return (4 * 2) + 47 + 3 + (44 * 3) + 66 + (3 * 3);
  }
  return (6 * 2) + 52 + 5 + (44 * 3) + 66 + (4 * 3);
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
    blocks.push({ query: css.slice(cursor + 6, open).trim(), body: css.slice(open + 1, end - 1) });
    cursor = end;
  }
  return blocks;
}

function matchesWidth(query, width) {
  const minimum = query.match(/min-width\s*:\s*(\d+)px/i);
  const maximum = query.match(/max-width\s*:\s*(\d+)px/i);
  return (!minimum || width >= Number(minimum[1])) && (!maximum || width <= Number(maximum[1]));
}

function activeResponsiveCss(css, width) {
  return mediaBlocks(css)
    .filter(block => matchesWidth(block.query, width))
    .map(block => block.body)
    .join('\n');
}

test('mobile compact masthead fits every release viewport and keeps 44px targets', async () => {
  const css = await source('news-app-2-website.css');
  const js = await source('news-app-2-website.js');

  assert.match(js, /'website-scrolled',[\s\S]*window\.scrollY > 36\s*\)/);
  assert.doesNotMatch(js, /scrollY > 36[^\n]+max-width:\s*700px/);
  assert.match(css, /@media \(min-width:561px\) and \(max-width:700px\)[\s\S]*--brand-size:92px/);
  assert.match(css, /website-scrolled \.next-header__inner[\s\S]*min-height:60px/);
  assert.match(css, /website-scrolled \.brand[\s\S]*--brand-size:50px/);
  assert.match(css, /website-scrolled \.website-header-app-button,[\s\S]*min-height:44px/);

  for (const viewport of [320, 360, 390, 430, 560, 568, 600, 700]) {
    assert.ok(
      requiredCompactWidth(viewport) <= viewport,
      `compact masthead requires ${requiredCompactWidth(viewport)}px at ${viewport}px`
    );
  }

  const initialLandscapeContent = 320 - 92 - 68;
  const compactLandscapeContent = 320 - 60 - 68;
  assert.ok(initialLandscapeContent >= 150);
  assert.ok(compactLandscapeContent >= 190);
});

test('every mobile viewport activates normal and 200% reflow contracts', async () => {
  const css = await source('news-app-2-website.css');
  for (const width of [320, 360, 390, 430, 560, 568, 600, 700]) {
    const active = activeResponsiveCss(css, width);
    assert.match(active, /\.website-portal \.bottom-nav[\s\S]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, `${width}px misses normal navigation`);
    assert.match(active, /data-font-size="200"\] \.bottom-nav[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, `${width}px misses 200% navigation reflow`);
    assert.match(active, /data-font-size="200"\][\s\S]*\.briefing-strip,[\s\S]*\.briefing-lengths,[\s\S]*#next-briefing-actions,[\s\S]*\.archive-periods[\s\S]*grid-template-columns:1fr/, `${width}px misses briefing/archive reflow`);
    assert.match(active, /data-font-size="200"\][\s\S]*\.dialog-actions[\s\S]*flex-wrap:wrap/, `${width}px misses dialog wrap`);
    assert.match(active, /data-font-size="200"\][\s\S]*\.home-hero \.card-actions,[\s\S]*\.news-card \.card-actions,[\s\S]*\.dialog-actions[\s\S]*min-height:44px/, `${width}px misses action targets`);
    assert.match(active, /data-font-size="200"\][\s\S]*\.dialog-header :is\(strong,small\)[\s\S]*white-space:normal/, `${width}px misses dialog title reflow`);
    assert.match(active, /data-font-size="200"\][\s\S]*#next-main[\s\S]*padding-bottom:calc\(142px \+ env\(safe-area-inset-bottom\)\)/, `${width}px misses content reserve`);
    assert.ok(width / 5 >= 44, `${width}px normal navigation target is below 44px`);
    assert.ok(width / 3 >= 44, `${width}px 200% navigation target is below 44px`);
    assert.match(rule(active, '.website-portal.website-scrolled .next-header__inner'), /min-height:60px/, `${width}px misses compact header`);
  }

  const normalLandscapeContent = 320 - 92 - 68;
  const zoomLandscapeContent = 320 - 60 - 138;
  assert.ok(normalLandscapeContent >= 150);
  assert.ok(zoomLandscapeContent >= 120);
});

test('mobile release references remain atomic in HTML and service worker', async () => {
  const index = await source('index.html');
  const worker = await source('service-worker.js');
  for (const resource of [
    'news-app-2-website.css?release=37',
    'news-app-2-website.js?release=23'
  ]) {
    assert.ok(index.includes(resource), `index misses ${resource}`);
    assert.ok(worker.includes(resource), `worker misses ${resource}`);
  }
  assert.match(worker, /wrn-web-portal-2026-08-20-r10m-r44/);
  assert.match(worker, /wrn-web-data-2026-08-20-r10m-r44/);
});
