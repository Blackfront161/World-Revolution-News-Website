import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const types = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'], ['.xml', 'application/xml; charset=utf-8']
]);

http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (relative.endsWith('/')) relative += 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(target).pipe(response);
  });
}).listen(8768, '127.0.0.1', () => {
  console.log('WRN r10n QA: http://127.0.0.1:8768/');
});
