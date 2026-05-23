import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';

// Dev-only middleware that exposes:
//   GET  /api/config   → { kibanaUrl, indexPattern, ready }  for the frontend
//   POST /api/count    → forwards {query} to Elasticsearch `_count` with creds
// Creds come from env vars (.env or shell). Never sent to the browser.
function elasticDevApi(env: Record<string, string>): Plugin {
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

  // Honor insecure flag for fetch via undici default agent.
  if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const authHeader = apiKey
    ? `ApiKey ${apiKey}`
    : username
    ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    : '';

  function json(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  async function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  return {
    name: 'elastix:dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/config', (_req, res) => {
        json(res, 200, {
          kibanaUrl,
          indexPattern,
          dataViewId,
          ready: Boolean(elasticUrl && authHeader),
        });
      });

      server.middlewares.use('/api/count', async (req, res) => {
        if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
        if (!elasticUrl || !authHeader) {
          return json(res, 503, {
            error:
              'Elastic creds not configured. Set ELASTIC_URL and ELASTIC_USERNAME/ELASTIC_PASSWORD (or ELASTIC_API_KEY).',
          });
        }
        try {
          const raw = await readBody(req);
          const payload = raw ? (JSON.parse(raw) as { query?: unknown; index?: string }) : {};
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
          json(res, 502, { error: (err as Error).message });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Pull EVERY env var (no VITE_ prefix filter) so server-side middleware
  // can see ELASTIC_* / KIBANA_* without leaking them into client bundles.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), elasticDevApi(env)],
    server: { port: 5173, open: true },
  };
});
