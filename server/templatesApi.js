// Shared by vite.config.ts (dev) and server.js (prod) — same pattern as
// elasticApi.js. Pure ESM JavaScript (no TypeScript syntax) because
// server.js imports it without a build step.
//
// GET /api/templates → the templates catalog read from a MongoDB collection.
// Documents are mapped to the app's Template shape:
//   { id, name, description?, query }
// `_id` (stringified) backfills a missing `id`; docs without a usable
// name/query are skipped rather than crashing the catalog.
//
// Not configured (no MONGO_URL) → 404, and the frontend silently falls back
// to the inline ConfigMap catalog / public/templates.json — so air-gapped
// deployments without Mongo keep working unchanged.
//
// Results are cached for TTL_MS: page reloads don't hammer Mongo, but
// collection edits show up within seconds on the next load — no pod restart
// needed (unlike the ConfigMap inlining path).

export function makeTemplatesHandler(env) {
  const mongoUrl = env.MONGO_URL || env.MONGODB_URI || 'mongodb+srv://yonka:qwe123@yonka.fp3ieym.mongodb.net/?appName=yonka';
  const dbName = env.MONGO_DB || 'test';
  const collectionName = env.MONGO_TEMPLATES_COLLECTION || 'test';
  const TTL_MS = 30_000;

  let client = null; // lazy singleton MongoClient, reused across requests
  let cache = null; // { at: number, body: Template[] }

  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  async function getCollection() {
    if (!client) {
      // Dynamic import keeps `mongodb` an optional dependency: deployments
      // that never set MONGO_URL don't need the driver installed at all.
      const { MongoClient } = await import('mongodb');
      const next = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 3000 });
      await next.connect();
      client = next;
    }
    return client.db(dbName).collection(collectionName);
  }

  function toTemplate(doc) {
    const id = typeof doc.id === 'string' && doc.id ? doc.id : String(doc._id ?? '');
    const name = typeof doc.name === 'string' ? doc.name.trim() : '';
    const query =
      doc.query && typeof doc.query === 'object' && !Array.isArray(doc.query) ? doc.query : null;
    if (!id || !name || !query) return null;
    const out = { id, name, query };
    if (typeof doc.description === 'string' && doc.description) out.description = doc.description;
    return out;
  }

  // Graceful shutdown: server.js calls this on SIGINT/SIGTERM so the pooled
  // Mongo connection doesn't keep the pod hanging into its grace period.
  async function closeTemplates() {
    const c = client;
    client = null;
    if (c) {
      try {
        await c.close();
      } catch {
        /* ignore — shutting down anyway */
      }
    }
  }

  async function handleTemplates(req, res) {
    if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD');
      return json(res, 405, { error: 'GET only' });
    }
    if (!mongoUrl) {
      return json(res, 404, {
        error: 'MongoDB catalog not configured. Set MONGO_URL (+ MONGO_DB / MONGO_TEMPLATES_COLLECTION).',
      });
    }
    if (cache && Date.now() - cache.at < TTL_MS) {
      return json(res, 200, cache.body);
    }
    try {
      const col = await getCollection();
      const docs = await col.find({}).limit(1000).toArray();
      const templates = docs.map(toTemplate).filter(Boolean);
      cache = { at: Date.now(), body: templates };
      json(res, 200, templates);
    } catch (err) {
      // Drop the client so the next request reconnects fresh instead of
      // reusing a wedged connection. Errors are NOT cached — a transient
      // outage retries on the next catalog load.
      try {
        await client?.close();
      } catch {
        /* ignore */
      }
      client = null;
      json(res, 502, { error: `MongoDB: ${err.message}` });
    }
  }

  return { handleTemplates, closeTemplates };
}
