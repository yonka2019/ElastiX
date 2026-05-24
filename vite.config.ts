import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { makeElasticHandlers } from './server/elasticApi.js';

// Dev-only middleware that exposes:
//   GET  /api/config   → { kibanaUrl, indexPattern, ready }  for the frontend
//   POST /api/count    → forwards {query} to Elasticsearch `_count` with creds
// Both handlers come from the shared module so prod (server.js) and dev
// behave identically. Creds come from env vars (.env or shell) and never
// reach the browser.
function elasticDevApi(env: Record<string, string>): Plugin {
  const { handleConfig, handleCount } = makeElasticHandlers(env);
  return {
    name: 'elastix:dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/config', handleConfig);
      server.middlewares.use('/api/count', handleCount);
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
