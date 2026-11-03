import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { AUTH_PATHS } from './src/landing/auth-routes.js';
import { SUPPORT_PATHS } from './src/landing/support-routes.js';
import { readFileSync } from 'node:fs';
import { FEATURES } from './src/landing/features-data.js';
import { renderCatalogue } from './src/landing/features-catalogue.js';

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
        if (AUTH_PATHS.includes(req.url?.split('?')[0].replace(/\/$/, ''))) req.url = '/design/rabbit-hole-auth.html';
        if (SUPPORT_PATHS.includes(req.url?.split('?')[0].replace(/\/$/, ''))) req.url = '/design/rabbit-hole-support.html';
        next();
      });
    },
  }, {
    // The static Features catalogue, rendered into its page at build time (src/landing/features-catalogue.js). A preview
    // build (VITE_COACHING_DEV: dev clones, review builds) also shows staged entries; production (scripts/prod-release.mjs
    // BUILD_ENV, which never sets it) shows only published ones.
    name: 'rabbit-hole-features-catalogue',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => !ctx.filename.replace(/\\/g, '/').endsWith('/design/rabbit-hole-features.html') ? html
        : html.replace('<!-- features-catalogue -->', renderCatalogue(FEATURES, JSON.parse(readFileSync(new URL('./src/landing/features-images.json', import.meta.url), 'utf8')), { preview: process.env.VITE_COACHING_DEV === 'true' })),
    },
  }],
  // /assets/* is cache-poisoned on workers.dev (stale edge entries that outlive deploys); /static is virgin
  build: {
    assetsDir: 'static',
    // Landing, sign-in and the support pages are in every build except private BYOC: production
    // (app-worker.js) serves them without the dev flag. The legacy small-cp serves none of them.
    ...(process.env.VITE_PRIVATE_BYOC !== 'true' ? {
      rolldownOptions: { input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        explainProgram: fileURLToPath(new URL('./src/explain-program/host.js', import.meta.url)), // bundles the program host, its runtime Worker and WASM (disabled: nothing imports it until ProgramScene, Task 4)
        landing: fileURLToPath(new URL('./design/rabbit-hole-hero.html', import.meta.url)),
        blog: fileURLToPath(new URL('./design/rabbit-hole-blog.html', import.meta.url)),
        features: fileURLToPath(new URL('./design/rabbit-hole-features.html', import.meta.url)),
        pricing: fileURLToPath(new URL('./design/rabbit-hole-pricing.html', import.meta.url)),
        manifesto: fileURLToPath(new URL('./design/rabbit-hole-manifesto.html', import.meta.url)),
        auth: fileURLToPath(new URL('./design/rabbit-hole-auth.html', import.meta.url)),
        support: fileURLToPath(new URL('./design/rabbit-hole-support.html', import.meta.url)),
        render: fileURLToPath(new URL('./render/scene.html', import.meta.url)), // /explain render entry (EXP-T18)
        animation3dRender: fileURLToPath(new URL('./render/animation3d.html', import.meta.url)), // /animation review capture entry (AN-05)
      } },
    } : {}),
  },
  // Module workers, so the file parser worker (src/file-parse.worker.js) loads SheetJS or mammoth only for the format it opens.
  worker: { format: 'es' },
  server: { proxy },
  preview: { proxy }, // `vite preview` = production bundle against the same control plane
});
