import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { AUTH_PATHS } from './src/landing/auth-routes.js';
import { SUPPORT_PATHS } from './src/landing/support-routes.js';
import { DOCS_PATHS } from './src/landing/docs-content.js';

// Dev proxies /api (and the login pages) to the real control plane so the
// session cookie lands on localhost. Target comes from repo-root .env SMALL_API.
function smallApi() {
  if (process.env.SMALL_API) return process.env.SMALL_API;
  try {
    const env = readFileSync(fileURLToPath(new URL('../../.env', import.meta.url)), 'utf8');
    const m = env.match(/^SMALL_API=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return 'http://127.0.0.1:8787';
}

// '^/a/' is a regex key — a plain '/a' prefix would swallow /apps itself.
// A private preview must never proxy Cognito credentials to hosted Small.
const proxy = process.env.VITE_PRIVATE_BYOC === 'true' ? undefined
  : Object.fromEntries(['/api', '/login', '/auth', '^/a/'].map((p) => [p, { target: smallApi(), changeOrigin: true }]));

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'rabbit-hole-public-pages',
    configureServer(server) {
      if (process.env.VITE_COACHING_DEV !== 'true' || process.env.VITE_PRIVATE_BYOC === 'true') return;
      server.middlewares.use((req, _res, next) => {
        if (DOCS_PATHS.includes(req.url?.split('?')[0].replace(/\/$/, ''))) req.url = '/design/rabbit-hole-docs.html';
        if (AUTH_PATHS.includes(req.url?.split('?')[0].replace(/\/$/, ''))) req.url = '/design/rabbit-hole-auth.html';
        if (req.url?.split('?')[0].replace(/\/$/, '') === '/team') req.url = '/design/rabbit-hole-team.html';
        if (SUPPORT_PATHS.includes(req.url?.split('?')[0].replace(/\/$/, ''))) req.url = '/design/rabbit-hole-support.html';
        next();
      });
    },
  }],
  // /assets/* is cache-poisoned on workers.dev (stale edge entries that outlive deploys); /static is virgin
  build: {
    assetsDir: 'static',
    // The existing Rabbit Hole landing belongs to the regular dev preview only.
    ...(process.env.VITE_COACHING_DEV === 'true' && process.env.VITE_PRIVATE_BYOC !== 'true' ? {
      rolldownOptions: { input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        landing: fileURLToPath(new URL('./design/rabbit-hole-hero.html', import.meta.url)),
        blog: fileURLToPath(new URL('./design/rabbit-hole-blog.html', import.meta.url)),
        features: fileURLToPath(new URL('./design/rabbit-hole-features.html', import.meta.url)),
        pricing: fileURLToPath(new URL('./design/rabbit-hole-pricing.html', import.meta.url)),
        manifesto: fileURLToPath(new URL('./design/rabbit-hole-manifesto.html', import.meta.url)),
        auth: fileURLToPath(new URL('./design/rabbit-hole-auth.html', import.meta.url)),
        team: fileURLToPath(new URL('./design/rabbit-hole-team.html', import.meta.url)),
        support: fileURLToPath(new URL('./design/rabbit-hole-support.html', import.meta.url)),
        docs: fileURLToPath(new URL('./design/rabbit-hole-docs.html', import.meta.url)),
      } },
    } : {}),
  },
  server: { proxy },
  preview: { proxy }, // `vite preview` = production bundle against the same control plane
});
