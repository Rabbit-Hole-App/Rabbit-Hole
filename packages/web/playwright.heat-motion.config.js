import { defineConfig } from '@playwright/test';

// Dev server, not build+preview: heat-motion-harness.html is never a build
// entry (see its own comment), and Vite's dev server serves any .html file
// on disk without one. No auth, no network, no small-cp-dev - AnimatedScene
// is a leaf component, mounted directly.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'heat-motion-invariant.spec.js',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5219' }, // localhost, not 127.0.0.1 - Vite binds ::1 on Windows
  webServer: {
    command: 'npm run dev -- --port 5219 --strictPort',
    url: 'http://localhost:5219',
    reuseExistingServer: false,
  },
});
