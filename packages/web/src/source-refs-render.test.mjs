// The source line under a card as markup (SourceRefChip.jsx SourceRefLine, Tutor release R3.04): rendered with react-dom/server the way
// study-compact.test.mjs renders LearnPaper. What a status shows, and that the keyboard reaches every action without hover. Interaction
// and focus movement need a browser: e2e/source-ref-mvp-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { sourceRefOf } from './source-ref.js';

const dir = mkdtempSync(join(tmpdir(), 'source-ref-chip-')), outfile = join(dir, 'chip.cjs');
await esbuild.build({
  stdin: { contents: "export { SourceRefLine } from './SourceRefChip.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const REV = 'a'.repeat(64);
const ref = sourceRefOf({ sourceRef: { v: 1, id: `sref_${'1'.repeat(24)}`, kind: 'pdf', source: { key: 'doc:ctx:0123456789ab', rev: REV, name: 'paper.pdf', home: null },
  anchor: { kind: 'text', page: { index: 3, label: 'iii' }, rects: [[1, 1, 2, 2]], rotate: 0, view: [0, 0, 612, 792], quote: { exact: 'x', prefix: '', suffix: '' } } } });
const render = props => B.renderToStaticMarkup(B.createElement(B.SourceRefLine, { ref_: ref, onOpen() {}, ...props }));

test('a current source offers View passage as a plain button the keyboard reaches: always shown, never hover-only, never out of the tab order', () => {
  const html = render({ status: 'current' });
  assert.match(html, /From paper\.pdf, p\. iii/);
  const button = html.match(/<button[^>]*>/)[0];
  assert.match(button, /type="button"/);
  assert.match(button, /aria-label="View passage"/);
  assert.doesNotMatch(button, /tabindex|disabled/i, 'Tab reaches it, Enter and Space press it');
  assert.doesNotMatch(html, /group-hover|opacity-0|class="[^"]*(invisible|hidden)/, 'nothing about it waits for a pointer');
  assert.match(button, /focus-visible:outline/);
});

test('a changed, missing or unavailable source states the limitation and offers nothing to open; a label and an unasked status never do', () => {
  for (const [status, words] of [['changed', 'Source changed'], ['missing', 'Source not available'], ['unavailable', 'Source not available']]) {
    const html = render({ status });
    assert.match(html, new RegExp(`>${words}<`));
    assert.doesNotMatch(html, /<button/);
    assert.match(html, /aria-label="[^"]+"/, 'the long form is the accessible name');
  }
  assert.doesNotMatch(render({ status: null }), /<button/, 'before the status is known nothing opens');
  const label = sourceRefOf({ sourceRef: { v: 1, kind: 'pdf', source: { name: 'paper.pdf' }, anchor: { page: { label: 'iii' } } } });
  assert.doesNotMatch(render({ ref_: label, status: 'current' }), /<button/, 'a shared reader sees only where it came from');
  assert.match(render({ ref_: label, status: 'current' }), /From paper\.pdf, p\. iii/);
  assert.match(render({ status: 'current', note: 'The file this passage is in is not on this canvas.' }), /not on this canvas/);
});
