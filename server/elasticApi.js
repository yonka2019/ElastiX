// Shared by vite.config.ts (dev) and server.js (prod).
// Pure ESM JavaScript (no TypeScript syntax) because server.js imports it
// without a build step.

export function makeElasticHandlers(env) {
  const elasticUrl = (env.ELASTIC_URL || env.ELASTICSEARCH_URL || 'https://a1ce5c513dbc471cbe24ff52ba9725e0.us-central1.gcp.cloud.es.io:443').replace(/\/$/, '');
  const username = env.ELASTIC_USERNAME || 'test';
  const password = env.ELASTIC_PASSWORD || 'test!!';
  const apiKey = env.ELASTIC_API_KEY || '';
  const indexPattern = env.ELASTIC_INDEX || env.ELASTIC_INDEX_PATTERN || 'data*';
  const kibanaUrl = (env.KIBANA_URL || 'https://0bb5d34bfb754147948f79c3cfb0fe43.us-central1.gcp.cloud.es.io').replace(/\/$/, '');
  const dataViewId = env.KIBANA_DATA_VIEW_ID || 'e73e0ed4-a079-4850-8087-c5902155d8c6';
  const insecure =
    (env.ELASTIC_INSECURE || '').toLowerCase() === 'true' ||
    (env.NODE_TLS_REJECT_UNAUTHORIZED === '0');

  if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const authHeader = apiKey
    ? `ApiKey ${apiKey}`
    : username
    ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    : '';

  const ready = Boolean(elasticUrl && authHeader);
  // Whether the remote-query proxy is configured (see templatesRemoteApi.js).
  // Surfaced to the browser so the Templates panel can enable/disable its
  // "Fetch from …" button at runtime — no VITE_ build-time baking.
  const templatesRemote = Boolean((env.TEMPLATES_REMOTE_URL || '').trim());
  // Display name of the remote service, shown in the button ("Fetch from
  // <name>"). Empty → the UI falls back to "remote".
  const templatesRemoteName = (env.TEMPLATES_REMOTE_NAME || '').trim();
  // Whether the cobrun proxy is configured (see cobrunApi.js). Gates the
  // header's "Create Cobrun" button at runtime.
  const cobrun = Boolean((env.COBRUN_URL || '').trim());
  // Whether sending a cobrun requires a password (COBRUN_PASSWORD). Only the
  // boolean reaches the browser — the password itself stays server-side.
  const cobrunAuth = Boolean((env.COBRUN_PASSWORD || '').trim());
  // Whether delete cobruns have their own password (COBRUN_DELETE_PASSWORD).
  const cobrunDeleteAuth = Boolean((env.COBRUN_DELETE_PASSWORD || '').trim());
  // Whether the cobrun action catalog is configured (COBRUN_ACTION_LIST_URL).
  // When true the UI's Action field is a dropdown fed by /api/cobrun-actions.
  const cobrunActions = Boolean((env.COBRUN_ACTION_LIST_URL || '').trim());
  // Same for the priority catalog (COBRUN_PRIORITY_LIST_URL →
  // /api/cobrun-priorities → Priority dropdown).
  const cobrunPriorities = Boolean((env.COBRUN_PRIORITY_LIST_URL || '').trim());
  // Name shown in the bottom-right "by <name>" corner credit. Empty → the
  // UI falls back to its built-in default.
  const byName = (env.BY_NAME || '').trim();

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

  function handleConfig(_req, res) {
    json(res, 200, { kibanaUrl, indexPattern, dataViewId, ready, templatesRemote, templatesRemoteName, cobrun, cobrunAuth, cobrunDeleteAuth, cobrunActions, cobrunPriorities, byName });
  }

  async function handleCount(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    if (!elasticUrl || !authHeader) {
      return json(res, 503, {
        error:
          'Elastic creds not configured. Set ELASTIC_URL and ELASTIC_USERNAME/ELASTIC_PASSWORD (or ELASTIC_API_KEY).',
      });
    }
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const idx = encodeURIComponent(payload.index || indexPattern);
      const body = JSON.stringify(payload.query ? { query: payload.query } : {});
      const target = `${elasticUrl}/${idx}/_count`;
      const upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: authHeader,
        },
        body,
      });
      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
      res.end(text);
    } catch (err) {
      json(res, 502, { error: err.message });
    }
  }

  return { handleConfig, handleCount };
}
