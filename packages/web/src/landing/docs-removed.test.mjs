import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isRemovedDocsPath } from './support-routes.js';

// The public Docs were removed (owner 2026-10-26). The HTTP 404 and the rendered pages are proven by e2e/docs-removed-check.mjs.
const web = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, web), 'utf8');

test('/docs and everything under it is a removed page; neighbours are not', () => {
  for (const p of ['/docs', '/docs/', '/docs/quickstart', '/docs/cli', '/docs/configuration', '/docs/api', '/docs/api/runs', '/docs/byoc', '/docs/byoc/private', '/docs/byoc/permissions', '/Docs', '/DOCS/cli']) assert.ok(isRemovedDocsPath(p), p);
  for (const p of ['/', '/docsx', '/documents', '/apps/docs', '/a/docs', '/api/docs', '/blog']) assert.ok(!isRemovedDocsPath(p), p);
});

test('no public page, footer or build entry links to or builds Docs', () => {
  const design = readdirSync(new URL('design/', web)).filter((f) => /^rabbit-hole-.*\.html$/.test(f));
  assert.ok(design.length >= 8, 'the public pages are still found');
  for (const file of design) assert.doesNotMatch(read(`design/${file}`), /href="\/docs|>\s*Docs\s*</i, `${file} links to Docs`);
  for (const file of ['src/landing/content-footer.js', 'src/landing/footer-links.js', 'src/landing/navigation.js']) assert.doesNotMatch(read(file), /\/docs|>\s*Docs\s*</i, `${file} links to Docs`);
  assert.equal(existsSync(new URL('design/rabbit-hole-docs.html', web)), false);
  assert.deepEqual(readdirSync(new URL('src/landing/', web)).filter((f) => /^docs/.test(f) && !f.endsWith('removed.test.mjs')), [], 'docs sources are back');
  for (const file of ['vite.config.js', 'dev-worker.js']) assert.doesNotMatch(read(file), /rabbit-hole-docs|docs-content|DOCS_PATHS/, `${file} still builds or serves Docs`);
});

test('the Worker answers /docs with the not-found page before any shell, for every method', () => {
  const worker = read('dev-worker.js');
  const docs = worker.indexOf('isRemovedDocsPath(path)');
  assert.ok(docs > 0, 'dev-worker.js routes /docs');
  assert.match(worker.slice(docs, docs + 400), /new Response\([^]*SUPPORT[^]*status: 404/);
  for (const later of ['SUPPORT_PATHS.includes', 'const publicPage', 'new Response(SHELL', 'forwardToProduction(req, env)']) assert.ok(worker.indexOf(later) > docs, `${later} comes before the /docs 404`);
});
