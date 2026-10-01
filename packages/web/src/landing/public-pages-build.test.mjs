import { test } from 'node:test';
import assert from 'node:assert/strict';

// Production (rabbit-hole-app) serves Landing, sign-in and the support/docs pages from the build, so they are
// in every build, not only the VITE_COACHING_DEV one (docs/features/rabbit-hole-production.md). Private BYOC never gets them.
const inputs = async (env, tag) => {
  const saved = { ...process.env };
  delete process.env.VITE_COACHING_DEV; delete process.env.VITE_PRIVATE_BYOC;
  Object.assign(process.env, env);
  try { return (await import(`../../vite.config.js?${tag}`)).default.build.rolldownOptions?.input; }
  finally { process.env = saved; }
};
const PAGES = ['app', 'landing', 'blog', 'features', 'pricing', 'manifesto', 'auth', 'team', 'support', 'docs'];

test('a build without VITE_COACHING_DEV still emits Landing, the auth page and the support/docs pages', async () => {
  const input = await inputs({}, 'plain');
  assert.deepEqual(Object.keys(input || {}).sort(), [...PAGES].sort());
  assert.match(input.landing.replace(/\\/g, '/'), /\/design\/rabbit-hole-hero\.html$/);
  assert.match(input.app.replace(/\\/g, '/'), /\/index\.html$/);
});

test('the dev build has the same pages; the private BYOC build has none of them', async () => {
  assert.deepEqual(Object.keys(await inputs({ VITE_COACHING_DEV: 'true' }, 'dev')).sort(), [...PAGES].sort());
  assert.equal(await inputs({ VITE_PRIVATE_BYOC: 'true' }, 'byoc'), undefined);
});
