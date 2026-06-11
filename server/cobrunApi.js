// Shared by vite.config.ts (dev) and server.js (prod) — same pattern as
// templatesRemoteApi.js. Pure ESM JavaScript (no TypeScript syntax) because
// server.js imports it without a build step.
//
// POST /api/cobrun → forwards the JSON body untouched to the cobrun service:
//   browser → POST /api/cobrun
//   server  → POST ${COBRUN_URL}
// Body shape (assembled by the browser, see CreateCobrun.tsx):
//   { "action": "...", "title": "...", "query": { ...generated query... },
//     "options": { "entitiesPerSecond": 200 }, "user": "..." }
//
// Server-side var (NOT VITE_-prefixed): the URL is read from the container
// env at runtime — set it like TEMPLATES_REMOTE_URL, no rebuild — and the
// fetch is server-to-server, so the cobrun service needs no CORS for the
// browser. Not configured (no COBRUN_URL) → 404, and the frontend disables
// the "Create Cobrun" button.

export function makeCobrunHandler(env) {
  const url = (env.COBRUN_URL || '').trim();
  // Optional bearer token, same convention as TEMPLATES_REMOTE_TOKEN. When
  // set, the proxy sends `Authorization: Bearer <token>` upstream.
  const authToken = (env.COBRUN_TOKEN || '').trim();
  // Optional send-gate: when COBRUN_PASSWORD is set, the browser must supply
  // the matching `x-cobrun-password` header or the proxy answers 401 and
  // nothing is forwarded. Checked server-side so the password never ships to
  // the browser. /api/config exposes only the boolean (cobrunAuth) so the UI
  // knows to ask for it.
  const password = (env.COBRUN_PASSWORD || '').trim();
  // Separate gate for delete actions (COBRUN_DELETE_PASSWORD). When set, a
  // body with action "delete" must carry THIS password — the regular one is
  // rejected. Unset → deletes fall back to the regular password rule.
  const deletePassword = (env.COBRUN_DELETE_PASSWORD || '').trim();

  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function handleCobrun(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return json(res, 405, { error: 'POST only' });
    }
    if (!url) {
      return json(res, 404, {
        error: 'Cobrun service not configured. Set COBRUN_URL.',
      });
    }
    try {
      const raw = await readBody(req);
      // Reject malformed JSON here with a clear 400 rather than letting the
      // upstream service answer with an opaque error.
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: 'Body must be valid JSON.' });
      }
      // Delete actions check against the delete password when one is set;
      // everything else (and deletes without a dedicated password) uses the
      // regular one.
      const isDelete =
        typeof parsed?.action === 'string' && parsed.action.trim().toLowerCase() === 'delete';
      const required = isDelete ? deletePassword || password : password;
      if (required) {
        const given = (req.headers['x-cobrun-password'] ?? '').toString();
        if (given !== required) {
          return json(res, 401, {
            error: isDelete && deletePassword ? 'Invalid delete password.' : 'Invalid password.',
          });
        }
      }
      const headers = { 'content-type': 'application/json', accept: 'application/json' };
      if (authToken) headers.authorization = `Bearer ${authToken}`;
      const upstream = await fetch(url, { method: 'POST', headers, body: raw });
      const text = await upstream.text();
      if (upstream.status === 401 || upstream.status === 403) {
        return json(res, 502, {
          error: `Cobrun auth failed (HTTP ${upstream.status})${authToken ? '' : ' — set COBRUN_TOKEN'}`,
        });
      }
      // Pass the upstream status and body through so the UI can show what
      // the service actually answered.
      res.statusCode = upstream.status;
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
      res.end(text);
    } catch (err) {
      json(res, 502, { error: `Cobrun request failed: ${err.message}` });
    }
  }

  return { handleCobrun };
}
