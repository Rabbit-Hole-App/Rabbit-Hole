// Canvas context documents (docs/features/canvas-context-docs.md), browser side: the header the Files panel and the
// composer's Context list show, rendered once on the server from an esbuild bundle (as learn-next-steps-ui.test.mjs does),
// and the browser's switched-on limit pinned to the server's so the two cannot drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { ATTACHED_LIMIT as SERVER_LIMIT } from '../../control-plane/src/learn-context-docs.js';

const dir = mkdtempSync(join(tmpdir(), 'context-docs-')), outfile = join(dir, 'ui.cjs');
await esbuild.build({
  stdin: { contents: ["export { default as ContextDocs } from './ContextDocs.jsx';", "export { ATTACHED_LIMIT } from './context-docs.js';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'),
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  external: ['./learn-paper-figures.js'], // the PDF page counter, dynamically imported on upload only
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

test('context docs: ten on at once, the same limit as the server', () => {
  assert.equal(B.ATTACHED_LIMIT, 10);
  assert.equal(B.ATTACHED_LIMIT, SERVER_LIMIT);
});

test('context docs: the header reads "Context · N of 10 on"', () => {
  const docs = [{ id: 'ctx:000000000001', name: 'Attention.pdf', kind: 'pdf', size: 2 * 1024 * 1024, attached: true }];
  const html = B.renderToStaticMarkup(B.createElement(B.ContextDocs, { context: { docs, busy: false, upload() {}, toggle() {}, remove() {}, on: 4 } }));
  const text = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Context · 4 of 10 on/);
});
