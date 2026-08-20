import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

async function chromePath() {
  for (const candidate of chromeCandidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  throw new Error('Chrome executable is required for the r10m browser reflow contract');
}

function contentType(target) {
  if (target.endsWith('.html')) return 'text/html; charset=utf-8';
  if (target.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

async function withServer(run) {
  const server = http.createServer(async (request, response) => {
    try {
      const requested = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
      const target = path.resolve(root, requested || 'index.html');
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(target), 'Cache-Control': 'no-store' });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  try {
    await run(server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function resultFromDump(dump) {
  const match = dump.match(/<pre id="qa-result">([^<]+)<\/pre>/);
  return match
    ? JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
    : null;
}

async function measure(chrome, port, profileRoot, width, query) {
  let lastDump = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const profile = await mkdtemp(path.join(profileRoot, `wrn-r10m-${width}-`));
    try {
      const { stdout } = await execFileAsync(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profile}`,
        '--window-size=900,900',
        '--virtual-time-budget=5000',
        '--dump-dom',
        `http://127.0.0.1:${port}/qa-r10m/reflow-fixture.html?${query}&viewport=${width}`
      ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true });
      lastDump = stdout;
      const result = resultFromDump(stdout);
      if (result) return result;
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
  assert.fail(`browser fixture did not emit measurements after 3 attempts: ${lastDump.slice(-2000)}`);
}

function assertFits(result, label) {
  assert.ok(result.measurements.length, `${label} produced no measurements`);
  const failures = result.measurements.filter(item => !item.fits);
  assert.deepEqual(failures, [], `${label} overflowed: ${JSON.stringify(failures)}`);
}

test('real Chrome keeps today cards inside their client widths at 200%', { timeout: 120_000 }, async () => {
  const chrome = await chromePath();
  await withServer(async port => {
    for (const width of [320, 360, 390, 430, 560, 568, 600, 700]) {
      const result = await measure(chrome, port, os.tmpdir(), width, 'mode=200');
      assert.equal(result.viewport, width, `Chrome viewport differs at ${width}px`);
      assertFits(result, `${width}px/200% today cards`);
    }
  });
});

test('real Chrome keeps 568px normal actions and desktop 200% cards visible', { timeout: 120_000 }, async () => {
  const chrome = await chromePath();
  await withServer(async port => {
    const normal = await measure(chrome, port, os.tmpdir(), 568, 'mode=normal');
    assertFits(normal, '568px normal news-card actions');
    const mobileDialog = await measure(chrome, port, os.tmpdir(), 390, 'mode=normal&scope=dialog');
    assertFits(mobileDialog, '390px normal article dialog');
    for (const width of [1024, 1440]) {
      const desktop = await measure(chrome, port, os.tmpdir(), width, 'mode=200&scope=desktop');
      assertFits(desktop, `${width}px/200% hero and news cards`);
    }
  });
});
