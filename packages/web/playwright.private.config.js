import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'private-login.spec.js', timeout: 30_000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5185' },
  webServer: {
    command: 'npm run preview -- --outDir dist-private --host 127.0.0.1 --port 5185 --strictPort',
    url: 'http://127.0.0.1:5185', reuseExistingServer: false,
    env: { VITE_PRIVATE_BYOC: 'true' },
  },
});
