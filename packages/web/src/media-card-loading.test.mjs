// A stored image card's first paint (task b4b89fb0): while its original is being read it says so with a spinner, and only a read
// that stays impossible after the retries says "could not be read here", with a Retry that reads the stored file again.
// MediaCard.jsx is bundled with esbuild and rendered with react-dom/server (no effects run: this is the state before any read).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'media-card-')), outfile = join(dir, 'media-card.cjs');
await esbuild.build({
  stdin: { contents: "export { default as MediaBody, Missing } from './MediaCard.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const M = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const generated = { id: 'k1', type: 'file', kind: 'image', label: 'generated-image', fileRef: { v: 1, source: { id: `fs_${'c'.repeat(24)}`, rev: 'd'.repeat(64) }, family: 'image', meta: { name: 'generated-image.png', type: 'image/png' } } };
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('a stored image card shows a spinner and Loading image while its original is read, never "could not be read here"', () => {
  const html = M.renderToStaticMarkup(M.createElement(M.MediaBody, { block: generated, onChange: () => {} }));
  assert.match(html, /data-media-state="loading"/);
  assert.match(html, /role="status"/);
  assert.match(html, /animate-spin/, 'a spinner');
  assert.match(text(html), /Loading image/);
  assert.doesNotMatch(html, /could not be read here/);
  assert.doesNotMatch(html, /\.\.\.|…/, 'no ellipsis in UI text');
});

test('after the retries a stored file says it could not be read, with Retry loading image; a local-only file keeps its own words', () => {
  let pressed = 0;
  const el = M.Missing({ stored: true, noun: 'image', onRetry: () => { pressed++; } });
  const html = M.renderToStaticMarkup(el);
  assert.match(text(html), /This stored file could not be read here\./);
  assert.match(html, /<button type="button"[^>]*data-media-retry-load[^>]*>[\s\S]*Retry loading image<\/button>/);
  const button = [el].flat().flatMap(function walk(node) { return !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat().flatMap(walk)]; }).find(node => node.type === 'button');
  button.props.onClick(); assert.equal(pressed, 1);
  assert.equal(text(M.renderToStaticMarkup(M.Missing({ stored: false }))), 'This file is not in this browser or saved with the board yet.');
  assert.doesNotMatch(M.renderToStaticMarkup(M.Missing({ stored: false })), /<button/, 'nothing to retry for a file never saved');
});
