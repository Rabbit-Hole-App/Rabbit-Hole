// CommandPill (Release B, lead contract B2): one pill for the canvas Chat composer and Ctrl+K. Rendered once on the
// server, as learn-next-steps-ui.test.mjs renders its components (effects never run).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'command-pill-')), outfile = join(dir, 'pill.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CommandPill } from './CommandPill.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { CommandPill, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const html = props => renderToStaticMarkup(createElement(CommandPill, { onRemove: () => {}, ...props }));

test('the pill is the literal /command in its tint, with a remove button named by the command\'s label', () => {
  const explain = html({ name: 'explain', onOpen: () => {} });
  assert.match(explain, /^<span data-command-pill="explain" data-command-tone="explain" class="inline-flex shrink-0 items-center border">/);
  assert.match(explain, /<button type="button" title="Change the command" class="[^"]*font-medium">\/explain<\/button>/);
  assert.match(explain, /aria-label="Remove Explain" title="Remove Explain"/);
  assert.match(html({ name: 'video' }), /aria-label="Remove Generate video"/);
  assert.match(html({ name: 'youtube' }), /aria-label="Remove Search YouTube"/);
  // Without onOpen the name is text, not a button: only the x acts.
  assert.equal((html({ name: 'arxiv' }).match(/<button/g) || []).length, 1);
  // Each composer sizes it; disabled (Voice on) disables both buttons.
  const sized = html({ name: 'graph', onOpen: () => {}, disabled: true, className: 'h-8 rounded-lg pl-2 text-sm', removeClassName: 'mx-0.5 h-6 w-6' });
  assert.match(sized, /class="inline-flex shrink-0 items-center border h-8 rounded-lg pl-2 text-sm"/);
  assert.equal((sized.match(/disabled=""/g) || []).length, 2);
  assert.match(sized, /mx-0\.5 h-6 w-6/);
});
