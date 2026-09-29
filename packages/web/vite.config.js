import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

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
  plugins: [react(), tailwindcss()],
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
      } },
    } : {}),
  },
  server: { proxy },
  preview: { proxy }, // `vite preview` = production bundle against the same control plane
});
