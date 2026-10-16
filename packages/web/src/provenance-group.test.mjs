// The canvas header's provenance group (ProvenanceGroup.jsx; C:/s/spec/hdr-provenance.md decisions 1A-4A, contract C1):
// bundled with esbuild and rendered with react-dom/server, as table-of-contents.test.mjs renders its panel. Opening the
// popover, new-tab destinations and narrow layouts need a browser: e2e/provenance-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'provenance-')), outfile = join(dir, 'provenance.cjs');
await esbuild.build({
  stdin: { contents: "export { default as ProvenanceGroup, ForkHistoryList, forkLabel } from './ProvenanceGroup.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const repository = { label: 'acme/attention', url: 'https://github.com/acme/attention' };
const fork = { ancestors: [{ state: 'accessible', title: 'Attention notes', url: '/b/tok123' }, { state: 'private' }, { state: 'accessible', title: 'Transformers', url: '/e/@ada/transformers' }], complete: true, original: true };
const group = provenance => B.renderToStaticMarkup(B.createElement(B.ProvenanceGroup, { provenance }));
const history = value => B.renderToStaticMarkup(B.createElement(B.ForkHistoryList, { fork: value, id: 'h' }));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('the four display combinations: repository only, fork only, both, and nothing at all for neither', () => {
  assert.equal(group(null), '');
  assert.equal(group({ repository: null, fork: null }), '', 'neither: no empty placeholder');
  assert.equal(group({ repository: null, fork: { ancestors: [], complete: false, original: false } }), '', 'a fork with no recorded entry has nothing to show');
  const repoOnly = group({ repository, fork: null });
  assert.equal((repoOnly.match(/data-repo-badge/g) || []).length, 1);
  assert.doesNotMatch(repoOnly, /data-provenance-fork/);
  const forkOnly = group({ repository: null, fork });
  assert.doesNotMatch(forkOnly, /data-repo-badge/);
  assert.match(forkOnly, /data-provenance-fork/);
  const both = group({ repository, fork });
  assert.ok(both.indexOf('data-repo-badge') < both.indexOf('data-provenance-fork'), 'repository first, fork second');
  assert.match(both, /role="group" aria-label="Canvas provenance"/);
});

test('the repository button is a real new-tab link to the server-validated URL, named and tooltipped in full', () => {
  const html = group({ repository, fork: null });
  assert.match(html, /<a data-repo-badge="true" href="https:\/\/github.com\/acme\/attention" target="_blank" rel="noopener noreferrer" title="Open acme\/attention on GitHub" aria-label="Open acme\/attention on GitHub"/);
  assert.match(text(html), /^acme\/attention$/);
  assert.match(html, /truncate/, 'a long name ellipsizes; the full one stays in the title and the name');
});

test('the fork button names the immediate source as the server sent it, never anything the viewer may not see', () => {
  assert.equal(B.forkLabel(fork), 'Forked from Attention notes');
  assert.equal(B.forkLabel({ ancestors: [{ state: 'private' }] }), 'Forked from a private canvas');
  assert.equal(B.forkLabel({ ancestors: [{ state: 'unavailable' }] }), 'Forked from an unavailable canvas');
  const html = group({ repository: null, fork });
  assert.match(html, /<button type="button" data-provenance-fork="true" title="Forked from Attention notes" aria-label="Forked from Attention notes" aria-expanded="false"/);
  assert.equal(text(html), 'Forked from Attention notes', 'closed: the history is not in the page yet');
  const hidden = group({ repository: null, fork: { ancestors: [{ state: 'private', title: 'Secret plans', url: '/apps/secret' }], complete: true, original: false } });
  assert.doesNotMatch(hidden, /Secret plans|\/apps\/secret/, 'a private entry renders no title or link even if one were sent');
});

test('the history lists the recorded chain in order: accessible ancestors link in a new tab, private ones have no title or link, the original is marked', () => {
  const html = history(fork);
  assert.equal(text(html), 'Fork history 1 Attention notes 2 A private canvas 3 Transformers Original');
  const links = [...html.matchAll(/<a data-ancestor-link="true" href="([^"]+)" target="_blank" rel="noopener noreferrer"/g)].map(m => m[1]);
  assert.deepEqual(links, ['/b/tok123', '/e/@ada/transformers']);
  assert.equal((html.match(/data-ancestor="private"/g) || []).length, 1);
  assert.doesNotMatch(html, /data-fork-history-incomplete/);
});

test('an incomplete history says earlier history is unavailable and marks no original; a missing record is a placeholder', () => {
  const html = history({ ancestors: [{ state: 'accessible', title: 'Attention notes', url: '/apps/canvas-1' }, { state: 'unavailable' }], complete: false, original: false });
  assert.equal(text(html), 'Fork history 1 Attention notes 2 An unavailable canvas Earlier history is unavailable');
  assert.doesNotMatch(html, /data-ancestor-original/);
  assert.equal((html.match(/<a /g) || []).length, 1, 'the placeholder is not a link');
  const unverified = history({ ancestors: [{ state: 'accessible', title: 'Root', url: '/apps/root' }], complete: true, original: false });
  assert.doesNotMatch(unverified, /Original/, 'the original is marked only when the server verified it');
});

test('the header has no second fork label: the title-side Forked from is gone from the canvas page (decision 4A)', () => {
  const learn = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(learn, /<ForkedFrom/);
  for (const page of ['./LearnPage.jsx', './SharedBoardPage.jsx', './comments/MemberBoardPage.jsx']) {
    assert.match(readFileSync(new URL(page, import.meta.url), 'utf8'), /<ProvenanceGroup provenance=\{/, `${page} shows the provenance group`);
  }
});
