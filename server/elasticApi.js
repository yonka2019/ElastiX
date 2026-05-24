// Shared by vite.config.ts (dev) and server.js (prod).
// Pure ESM JavaScript (no TypeScript syntax) because server.js imports it
// without a build step.

export function makeElasticHandlers(env) {
  const elasticUrl = (env.ELASTIC_URL || env.ELASTICSEARCH_URL || '').replace(/\/$/, '');
  const username = env.ELASTIC_USERNAME || '';
  const password = env.ELASTIC_PASSWORD || '';
  const apiKey = env.ELASTIC_API_KEY || '';
  const indexPattern = env.ELASTIC_INDEX || env.ELASTIC_INDEX_PATTERN || '*';
  const kibanaUrl = (env.KIBANA_URL || '').replace(/\/$/, '');
  const dataViewId = env.KIBANA_DATA_VIEW_ID || '';
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
    json(res, 200, { kibanaUrl, indexPattern, dataViewId, ready });
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
