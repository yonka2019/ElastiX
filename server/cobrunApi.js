// Shared by vite.config.ts (dev) and server.js (prod) — same pattern as
// templatesRemoteApi.js. Pure ESM JavaScript (no TypeScript syntax) because
// server.js imports it without a build step.
//
// POST /api/cobrun → forwards the JSON body untouched to the cobrun service:
//   browser → POST /api/cobrun
//   server  → POST ${COBRUN_URL}
// Body shape (assembled by the browser, see CreateCobrun.tsx):
//   { "actions": ["..."], "title": "...", "priority": 1,
//     "query": { ...generated query... },
//     "options": { "entitiesPerSecond": 200 }, "user": "...", "total": 0 }
// ("total" is always 0 on creation — part of the service contract.)
//
// Catalog endpoints — when the env URL is configured, the matching form
// field becomes a dropdown limited to the catalog; unset → 404 and the
// field stays free input:
//   GET /api/cobrun-actions    → ${COBRUN_ACTION_LIST_URL}
//     upstream answers a JSON array of action names, e.g. ["rerun", "delete"]
//     → normalised to { "actions": [...] }
//   GET /api/cobrun-priorities → ${COBRUN_PRIORITY_LIST_URL}
//     upstream answers a JSON array of numbers, e.g. [1, 2, 3]
//     → normalised to { "priorities": [...] }
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
  // Optional catalog URLs — see the catalog-endpoints note above.
  const actionListUrl = (env.COBRUN_ACTION_LIST_URL || '').trim();
  const priorityListUrl = (env.COBRUN_PRIORITY_LIST_URL || '').trim();

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
      // regular one. The body carries "actions" (array); the legacy singular
      // "action" is still checked so an old client can't bypass the gate.
      const actionNames = Array.isArray(parsed?.actions) ? parsed.actions : [parsed?.action];
      const isDelete = actionNames.some(
        (a) => typeof a === 'string' && a.trim().toLowerCase() === 'delete'
      );
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

  // Both catalogs are the same GET-only proxy, differing only in the source
  // URL, the response key and how items are validated/normalised: `pick`
  // maps a raw upstream item to a clean one, or null to drop it.
  function makeCatalogHandler({ catalogUrl, envName, key, label, pick }) {
    return async function handleCatalog(req, res) {
      if (req.method !== 'GET') {
        res.setHeader('allow', 'GET');
        return json(res, 405, { error: 'GET only' });
      }
      if (!catalogUrl) {
        return json(res, 404, { error: `Cobrun ${label} list not configured. Set ${envName}.` });
      }
      try {
        const headers = { accept: 'application/json' };
        if (authToken) headers.authorization = `Bearer ${authToken}`;
        const upstream = await fetch(catalogUrl, { headers });
        const text = await upstream.text();
        if (upstream.status === 401 || upstream.status === 403) {
          return json(res, 502, {
            error: `Cobrun ${label} list auth failed (HTTP ${upstream.status})${authToken ? '' : ' — set COBRUN_TOKEN'}`,
          });
        }
        if (!upstream.ok) {
          return json(res, 502, { error: `Cobrun ${label} list failed (HTTP ${upstream.status})` });
        }
        let list;
        try {
          list = JSON.parse(text);
        } catch {
          return json(res, 502, { error: `Cobrun ${label} list returned invalid JSON.` });
        }
        if (!Array.isArray(list)) {
          return json(res, 502, { error: `Cobrun ${label} list must be a JSON array.` });
        }
        json(res, 200, { [key]: list.map(pick).filter((v) => v !== null) });
      } catch (err) {
        json(res, 502, { error: `Cobrun ${label} list request failed: ${err.message}` });
      }
    };
  }

  const handleCobrunActions = makeCatalogHandler({
    catalogUrl: actionListUrl,
    envName: 'COBRUN_ACTION_LIST_URL',
    key: 'actions',
    label: 'action',
    pick: (a) => (typeof a === 'string' ? a : null),
  });
  const handleCobrunPriorities = makeCatalogHandler({
    catalogUrl: priorityListUrl,
    envName: 'COBRUN_PRIORITY_LIST_URL',
    key: 'priorities',
    label: 'priority',
    // Upstream may answer numbers or numeric strings (["1", "2"]) — the
    // browser always receives numbers (the cobrun body's priority must be
    // a number).
    pick: (p) => {
      const n = typeof p === 'string' ? Number(p.trim()) : p;
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    },
  });

  return { handleCobrun, handleCobrunActions, handleCobrunPriorities };
}
