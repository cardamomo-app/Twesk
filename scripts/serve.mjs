// Local server for Twesk (npm start). Every response says "no-cache", so browsers always check for a
// newer file (a cheap 304 when nothing changed) instead of reusing a stale copy.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
export function serve({ port = 4187, host = '127.0.0.1', quiet = false } = {}) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = resolve(ROOT, '.' + (path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(ROOT + '/') || /\/\.(git|claude)\//.test(file)) return res.writeHead(403).end();
    try {
      const info = await stat(file);
      const modified = info.mtime.toUTCString();
      const headers = {
        'content-type': TYPES[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
        'last-modified': modified,
      };
      if (req.headers['if-modified-since'] === modified) return res.writeHead(304, headers).end();
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : await readFile(file));
      if (!quiet) console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.url}`);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    }
  });
  return new Promise(done => server.listen(port, host, () => done(server)));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || process.argv[2] || 4187);
  serve({ port }).then(() =>
    console.log(`Twesk is running at http://127.0.0.1:${port}  (Control-C to stop)`),
  );
}
