// CommandPill (Release B, lead contract B2): one pill for the canvas Chat composer and Ctrl+K. Rendered once on the
// server, as learn-next-steps-ui.test.mjs renders its components (effects never run).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'command-pill-')), outfile = join(dir, 'pill.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CommandPill } from './CommandPill.jsx'; export { SLASH, labelOf } from './agent/slash.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { CommandPill, SLASH, labelOf, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const html = props => renderToStaticMarkup(createElement(CommandPill, { onRemove: () => {}, ...props }));

// Owner, 2026-10-20: a selected command reads as its label, never its /name (/simplify: Simplify), on every surface.
test('the pill is the command\'s label in its tint, with a remove button named by the same label', () => {
  const explain = html({ name: 'explain', onOpen: () => {} });
  assert.match(explain, /^<span data-command-pill="explain" data-command-tone="explain" class="inline-flex shrink-0 items-center border">/);
  assert.match(explain, /<button type="button" title="Change the command" class="[^"]*font-medium">Explain<\/button>/);
  assert.match(explain, /aria-label="Remove Explain" title="Remove Explain"/);
  assert.match(html({ name: 'simplify' }), /font-medium">Simplify<\/span>.*aria-label="Remove Simplify"/);
  assert.match(html({ name: 'cad' }), /font-medium">CAD<\/span>/);
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

test('every registered command (Chat, Ctrl+K, Insert, Home, Library and Project) has a pill label with no leading slash', () => {
  for (const command of SLASH) {
    for (const onOpen of [null, () => {}]) {
      const pill = html({ name: command.name, onOpen });
      const text = pill.match(/font-medium">([^<]*)<\/(?:span|button)>/)?.[1];
      assert.ok(text && text.trim() && !text.startsWith('/'), `/${command.name} pill reads ${JSON.stringify(text)}`);
      assert.equal(text, labelOf(command), `/${command.name}: the registry label`);
      assert.ok(pill.includes(`aria-label="Remove ${text}"`), `/${command.name}: Remove ${text}`);
    }
  }
  assert.ok(SLASH.length >= 30, `${SLASH.length} commands`);
  // The Home, Library and Project bar draws its own pill from the same label (commandLabel), never /{shortcut} or /{mode}.
  const bar = readFileSync(new URL('./agent/AgentBar.jsx', import.meta.url), 'utf8');
  for (const which of ['shortcut', 'mode']) assert.ok(bar.includes(`{commandLabel(${which})}<button type="button" aria-label={\`Remove \${commandLabel(${which})}\`}`), which);
  assert.doesNotMatch(bar, /\/\{(shortcut|mode)\}/);
});
