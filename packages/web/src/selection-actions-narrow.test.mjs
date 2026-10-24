// The controls row above a CAD card (host mode) keeps Add to chat and Quick Edit inside a 280 px card: their shortcut hints show only
// where the row's container is at least 320 px wide (cad-controls-check step 14, narrow-100-light overflowed by 16 px on Linux fonts).
// SelectionActions.jsx is bundled with esbuild and rendered with react-dom/server, as generation-proposal-card.test.mjs does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'selection-actions-')), outfile = join(dir, 'actions.cjs');
await esbuild.build({
  stdin: { contents: "export { SelectionActionsProvider, SelectionActionsHost } from './SelectionActions.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, platform: 'node', format: 'cjs', outfile, jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

test('in the card controls row the shortcut hints leave below 320 px; labels, tooltips and key announcements stay', () => {
  const { createElement: h, renderToStaticMarkup } = B;
  const html = renderToStaticMarkup(h(B.SelectionActionsProvider, { sole: 'c1', onAddToChat() {}, onQuickEdit() {} }, h(B.SelectionActionsHost, { id: 'c1', divider: true })));
  const hints = [...html.matchAll(/<kbd[^>]*class="([^"]*)"[^>]*>([^<]*)<\/kbd>/g)];
  assert.deepEqual(hints.map(m => m[2]), ['Ctrl+L', 'Ctrl+K']);
  for (const [, cls] of hints) assert.match(cls, /(^| )hidden( |$)/), assert.match(cls, /@\[320px\]\/chrome:inline/);
  assert.match(html, /aria-label="Add to chat"[^>]*title="Add to chat \(Ctrl\+L\)"/);
  assert.match(html, /aria-keyshortcuts="Control\+K"/);
});

test('the floating bar keeps its hints at every width, and the row is the container the hint query asks', () => {
  const actions = readFileSync(new URL('./SelectionActions.jsx', import.meta.url), 'utf8');
  assert.equal((actions.match(/compact=\{mode === 'host'\}/g) || []).length, 2, 'only host mode is compact');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /data-card-chrome-row [^>]*className="@container\/chrome /);
});
