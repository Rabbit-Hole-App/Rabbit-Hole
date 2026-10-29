// The tab names Rabbit Hole from the first byte of HTML, before any JavaScript (main.jsx cannot be the only writer).
// The built output is asserted the same way by e2e/production-bundle-check.mjs; the browser by e2e/brand-title-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const title = file => readFileSync(new URL(file, import.meta.url), 'utf8').match(/<title[^>]*>([^<]*)<\/title>/)?.[1];

test('the app shell is titled Rabbit Hole in its own HTML, not "small deploy"', () => {
  assert.equal(title('../index.html'), 'Rabbit Hole');
});

test('every Rabbit Hole page names the product in its own HTML and none keeps the legacy name', () => {
  const pages = readdirSync(new URL('../design/', import.meta.url)).filter(f => /^rabbit-hole-.*\.html$/.test(f) && f !== 'rabbit-hole-mobile-check.html');
  assert.ok(pages.length >= 7, `found ${pages.length} pages`); // seven since the public Team page was removed (owner 2026-10-29)
  for (const page of pages) assert.match(title(`../design/${page}`), /^(.+ \| )?Rabbit Hole$/, page);
});
