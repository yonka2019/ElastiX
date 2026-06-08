// Throwaway dev mock for the "Fetch from remote" feature.
// Answers GET /<name> with { "query": { ... } } — exactly what
// server/templatesRemoteApi.js expects to proxy. Run: node mock-remote.mjs
// Stop it when done; safe to delete this file.
import http from 'node:http';

const PORT = Number(process.env.MOCK_REMOTE_PORT || 4555);

// A few canned queries keyed by the name you type in ElastiX. Anything else
// falls back to a simple match on the requested name so every name "works".
const CANNED = {
  'active-users': {
    query: {
      bool: {
        must: [
          { term: { status: 'active' } },
          { range: { lastSeen: { gte: 'now-7d' } } },
        ],
      },
    },
  },
  'errors-today': {
    query: {
      bool: {
        filter: [
          { match: { level: 'error' } },
          { range: { '@timestamp': { gte: 'now/d' } } },
        ],
      },
    },
  },
  'high-value-orders': {
    query: {
      bool: {
        must: [{ range: { amount: { gte: 1000 } } }],
        must_not: [{ term: { refunded: true } }],
      },
    },
  },
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  res.setHeader('content-type', 'application/json');
  console.log(`[mock-remote] ${req.method} ${url.pathname} -> name="${name}"`);
  if (!name) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'name required in path' }));
    return;
  }
  const body = CANNED[name];
  if (!body) {
    // Realistic: an unknown query name is a 404 — the app should NOT create a
    // card for a query that doesn't exist.
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `No query named "${name}"` }));
    return;
  }
  res.statusCode = 200;
  res.end(JSON.stringify(body));
});

server.listen(PORT, () => {
  console.log(`mock-remote query service on http://localhost:${PORT}`);
  console.log('Names: active-users, errors-today, high-value-orders (others -> match on the name)');
});
