import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { AUTH_PATHS } from './src/landing/auth-routes.js';
import { SUPPORT_PATHS } from './src/landing/support-routes.js';
import { DOCS_PATHS } from './src/landing/docs-content.js';

// Dev proxies /api (and the login pages) to the Rabbit Hole dev control plane so the
// session cookie lands on localhost (docs/features/rabbit-hole-dev.md). Never production small-cp:
// the repo-root SMALL_API is the CLI's production target and is deliberately not read here.
function smallApi() {
  return process.env.RABBIT_HOLE_DEV_CP || 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
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
    // Landing, sign-in and the support/docs pages are in every build except private BYOC: production
    // (app-worker.js) serves them without the dev flag. The legacy small-cp serves none of them.
    ...(process.env.VITE_PRIVATE_BYOC !== 'true' ? {
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
