// Tiny static server for the production image. Replaces nginx.
//
// At startup, reads the templates catalog from one of:
//   1. /etc/templates/templates.json   ← K8s ConfigMap mount
//   2. ./web/templates.json            ← bundled fallback
// …then inlines the JSON into index.html under
//   <script id="elastix-templates" type="application/json">…</script>.
// The browser reads it from the DOM — no separate HTTP request for templates.
//
// Restart the pod (or container) to pick up a ConfigMap change.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(__dirname, 'web');
const PORT = Number.parseInt(process.env.PORT ?? '4000', 10);

const PLACEHOLDER = '${ELASTIX_TEMPLATES_JSON}';

function loadCatalogJSON() {
  const candidates = [
    '/etc/templates/templates.json',
    path.join(WEB_ROOT, 'templates.json'),
  ];
  for (const p of candidates) {
    try {
      const data = fs.readFileSync(p, 'utf8');
      JSON.parse(data); // validate
      console.log(`elastix: loaded templates from ${p} (${data.length} bytes)`);
      return data.trim();
    } catch {
      /* try next */
    }
  }
  console.log('elastix: no templates file found, using empty catalog');
  return '[]';
}

const TEMPLATES_JSON = loadCatalogJSON();
const indexTmpl = fs.readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');
if (!indexTmpl.includes(PLACEHOLDER)) {
  console.warn(`elastix: WARNING — index.html is missing the ${PLACEHOLDER} placeholder`);
}
const INDEX_HTML = indexTmpl.split(PLACEHOLDER).join(TEMPLATES_JSON);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function sendIndex(res) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache',
  });
  res.end(INDEX_HTML);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/' || pathname === '/index.html') {
    sendIndex(res);
    return;
  }

  // Reject path traversal: resolve under WEB_ROOT and verify the prefix.
  const safe = path.normalize(path.join(WEB_ROOT, pathname));
  if (!safe.startsWith(WEB_ROOT + path.sep) && safe !== WEB_ROOT) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  fs.stat(safe, (err, stat) => {
    if (err || !stat.isFile()) {
      // 404 hashed assets honestly; SPA-fallback everything else to index.html.
      if (pathname.startsWith('/assets/')) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      sendIndex(res);
      return;
    }
    const ext = path.extname(safe).toLowerCase();
    const headers = {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': stat.size,
    };
    if (pathname.startsWith('/assets/')) {
      headers['cache-control'] = 'public, max-age=31536000, immutable';
    } else if (ext === '.html') {
      headers['cache-control'] = 'no-cache';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(safe).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`elastix listening on :${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`elastix: received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}
