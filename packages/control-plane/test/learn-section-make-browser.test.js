import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/learn-section-make/browser.js';

// C §10 names no validator unit case (10f.4 is the browser's and compose's); this pins the 10e recency rule so the module has a check (check-map.json).
const ctx = { item: { id: 'i8' }, beat: { anchors: [], material: { kind: 'article', reason: 'recency' } }, earlier: [], snapshot: { files: {} }, turn: { web: [{ url: 'https://example.org/release', text: 'Version 3 changed the default to eight workers.' }] } };
const input = lead => ({ url: 'https://example.org/release', quotes: ['Version 3 changed the default to eight workers.'], pageDate: 'March 2026', lead });

test('C §10e: a recency beat shows the page date in the lead', async () => {
  assert.match((await validate(input('Here is what changed.'), ctx)).error, /as of March 2026/);
  const ok = await validate(input('As of March 2026, the release notes say this.'), ctx);
  assert.deepEqual(ok.perform, { op: 'webpage', url: 'https://example.org/release', quotes: ['Version 3 changed the default to eight workers.'] });
});
