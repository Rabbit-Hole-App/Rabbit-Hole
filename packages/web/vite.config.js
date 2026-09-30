import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

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
  plugins: [react(), tailwindcss()],
  // /assets/* is cache-poisoned on workers.dev (stale edge entries that outlive deploys); /static is virgin
  build: { assetsDir: 'static' },
  server: { proxy },
  preview: { proxy }, // `vite preview` = production bundle against the same control plane
});
