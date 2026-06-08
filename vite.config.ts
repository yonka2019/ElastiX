import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { makeElasticHandlers } from './server/elasticApi.js';
import { makeTemplatesHandler } from './server/templatesApi.js';
import { makeTemplatesRemoteHandler } from './server/templatesRemoteApi.js';

// Dev-only middleware that exposes:
//   GET  /api/config    → { kibanaUrl, indexPattern, ready }  for the frontend
//   POST /api/count     → forwards {query} to Elasticsearch `_count` with creds
//   GET  /api/templates → templates catalog from MongoDB (404 if no MONGO_URL)
// All handlers come from the shared modules so prod (server.js) and dev
// behave identically. Creds come from env vars (.env or shell) and never
// reach the browser.
function elasticDevApi(env: Record<string, string>): Plugin {
  const { handleConfig, handleCount } = makeElasticHandlers(env);
  const { handleTemplates } = makeTemplatesHandler(env);
  const { handleTemplatesRemote } = makeTemplatesRemoteHandler(env);
  return {
    name: 'elastix:dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/config', handleConfig);
      server.middlewares.use('/api/count', handleCount);
      server.middlewares.use('/api/templates', handleTemplates);
      server.middlewares.use('/api/templates-remote', handleTemplatesRemote);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), elasticDevApi(env)],
    server: { port: 5173, open: true },
  };
});
