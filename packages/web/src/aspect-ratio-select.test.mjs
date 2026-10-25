// The shared aspect ratio table and dropdown (owner brief 2026-10-23). AspectRatioSelect.jsx is bundled with esbuild and
// rendered with react-dom/server, as generation-proposal-card.test.mjs renders the card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { ASPECT_RATIOS, aspectRatioLabel, ratiosFor } from './aspect-ratios.js';

const dir = mkdtempSync(join(tmpdir(), 'aspect-select-')), outfile = join(dir, 'select.cjs');
await esbuild.build({
  stdin: { contents: "export { default as Select } from './AspectRatioSelect.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const html = props => B.renderToStaticMarkup(B.createElement(B.Select, props));

test('the table: the owner labels and meanings, in the owner order', () => {
  assert.deepEqual(ASPECT_RATIOS.map(r => r.label), ['9:16 portrait', '1:1 square', '16:9 landscape', '3:4 portrait', '4:3', '2:3', '3:2', '4:5', '5:4']);
  assert.equal(aspectRatioLabel('16:9'), '16:9 landscape');
  assert.equal(aspectRatioLabel('4:5'), '4:5');
});

test('ratiosFor keeps only what the consumer supports, in canonical order; no list means all', () => {
  assert.deepEqual(ratiosFor(['16:9', '9:16']).map(r => r.id), ['9:16', '16:9']);
  assert.deepEqual(ratiosFor(['16:9', '7:3']).map(r => r.id), ['16:9'], 'an unknown id is ignored');
  assert.equal(ratiosFor().length, 9);
  assert.equal(ratiosFor([]).length, 0);
});

test('the dropdown lists the supported options, selects the value, and can be disabled', () => {
  const out = html({ value: '1:1', options: ['16:9', '1:1', '4:3'], label: 'Aspect ratio', id: 'ar', onChange: () => {} });
  assert.deepEqual([...out.matchAll(/<option[^>]*value="([^"]+)"/g)].map(m => m[1]), ['1:1', '16:9', '4:3']);
  assert.match(out, /<option[^>]*value="1:1"[^>]*selected=""|<option[^>]*selected=""[^>]*value="1:1"/);
  assert.match(out, /id="ar"/);
  assert.match(out, />1:1 square</);
  assert.doesNotMatch(out, /disabled=""/);
  assert.match(html({ value: '1:1', options: ['1:1'], disabled: true }), /disabled=""/);
});

test('a change calls onChange with the ratio id', () => {
  const seen = [];
  let tree = null;
  const Probe = () => { tree = B.Select({ value: '1:1', options: ['1:1', '16:9'], onChange: v => seen.push(v) }); return tree; };
  B.renderToStaticMarkup(B.createElement(Probe));
  const find = (n, pred) => { if (!n || typeof n !== 'object') return null; if (Array.isArray(n)) { for (const x of n) { const h = find(x, pred); if (h) return h; } return null; } return pred(n) ? n : find(n.props?.children, pred); };
  find(tree, n => n.type === 'select').props.onChange({ target: { value: '16:9' } });
  assert.deepEqual(seen, ['16:9']);
});
