import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// The worker imports the SPA shell (web/dist/index.html) as a wrangler Text rule; stub any .html import, as auth-fail-closed.test.js does.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) { return s.endsWith('.html') ? { url: 'stub:html', shortCircuit: true } : n(s, c); }
  export async function load(u, c, n) { return u === 'stub:html' ? { format: 'module', source: 'export default ""', shortCircuit: true } : n(u, c); }
`));
const worker = (await import('../src/index.js')).default;

test('the control plane\'s own pages (here its 404) are titled Rabbit Hole, never "small deploy"', async () => {
  const res = await worker.fetch(new Request('https://cp.example.test/no-such-page'), { MASTER_KEY: 'master-key-for-tests' }, { waitUntil() {} });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /<title>Rabbit Hole<\/title>/);
});
