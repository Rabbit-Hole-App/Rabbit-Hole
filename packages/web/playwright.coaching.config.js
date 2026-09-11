import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'coaching.preview.js', timeout: 30_000, workers: 1,
  outputDir: '../../.small/coaching-ui/browser',
  use: { baseURL: 'http://127.0.0.1:5186', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'npm run preview -- --outDir dist-dev --host 127.0.0.1 --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186', reuseExistingServer: false,
    // The browser mocks all APIs; any missed proxy request stays local too.
    env: { SMALL_API: 'http://127.0.0.1:1' },
  },
});
