// Shared by vite.config.ts (dev) and server.js (prod) — same pattern as
// elasticApi.js / templatesApi.js. Pure ESM JavaScript (no TypeScript syntax)
// because server.js imports it without a build step.
//
// GET /api/templates-remote?name=<name> → proxies to a remote query service:
//   server → GET ${TEMPLATES_REMOTE_URL}/<name>   (name URL-encoded into path)
// and returns the upstream JSON body untouched (expected shape:
// { "query": { ... } }); the browser unwraps `.query` into a draggable card.
//
// Server-side var (NOT VITE_-prefixed): the base URL is read from the
// container env at runtime — set it like MONGO_URL / KIBANA_URL, no rebuild —
// and the fetch is server-to-server, so the remote service needs no CORS for
// the browser. Not configured (no TEMPLATES_REMOTE_URL) → 404, and the
// frontend disables the "Fetch from remote" button.

export function makeTemplatesRemoteHandler(env) {
  const baseUrl = (env.TEMPLATES_REMOTE_URL || '').trim().replace(/\/+$/, '');

  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  async function handleTemplatesRemote(req, res) {
    if (req.method && req.method !== 'GET') {
      res.setHeader('allow', 'GET');
      return json(res, 405, { error: 'GET only' });
    }
    if (!baseUrl) {
      return json(res, 404, {
        error: 'Remote query service not configured. Set TEMPLATES_REMOTE_URL.',
      });
    }
    // Dev (connect) strips the mount prefix → req.url is "/?name=foo"; prod
    // passes the full "/api/templates-remote?name=foo". Parsing against a
    // dummy origin handles both.
    const name = (new URL(req.url ?? '', 'http://localhost').searchParams.get('name') || '').trim();
    if (!name) return json(res, 400, { error: 'Missing "name" query parameter.' });

    const target = `${baseUrl}/${encodeURIComponent(name)}`;
    try {
      const upstream = await fetch(target, { headers: { accept: 'application/json' } });
      const text = await upstream.text();
      if (upstream.status === 404) {
        // The remote has no query by this name — surface it as a clean 404 so
        // the UI can say "not found" rather than a generic gateway error.
        return json(res, 404, { error: `Query "${name}" not found` });
      }
      if (!upstream.ok) {
        return json(res, 502, { error: `Remote service returned HTTP ${upstream.status}` });
      }
      // Pass the upstream JSON through untouched; the browser unwraps `.query`.
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(text);
    } catch (err) {
      json(res, 502, { error: `Remote fetch failed: ${err.message}` });
    }
  }

  return { handleTemplatesRemote };
}
