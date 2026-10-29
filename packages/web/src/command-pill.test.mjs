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
  stdin: { contents: "export { default as CommandPill } from './CommandPill.jsx'; export { SLASH, labelOf, typedOf } from './agent/slash.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { CommandPill, SLASH, labelOf, typedOf, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const html = props => renderToStaticMarkup(createElement(CommandPill, { onRemove: () => {}, ...props }));

// Owner spec 2026-10-29: a display pill shows the canonical typed name without its slash (explain, photos, image, 3d); the slash
// stays only in typed syntax. The x is named by the command's title.
test('the pill is the command\'s typed name in its tint, with a remove button named by its title', () => {
  const explain = html({ name: 'explain', onOpen: () => {} });
  assert.match(explain, /^<span data-command-pill="explain" data-command-tone="explain" class="inline-flex shrink-0 items-center border">/);
  assert.match(explain, /<button type="button" title="Change the command" class="[^"]*font-medium">explain<\/button>/);
  assert.match(explain, /aria-label="Remove Explanation" title="Remove Explanation"/);
  assert.match(html({ name: '3d' }), /font-medium">3d<\/span>.*aria-label="Remove 3D scene"/);
  // Stable ids keep their meaning (owner, 2026-10-26): id image is typed /photos, id generate-image is typed /image.
  assert.match(html({ name: 'image' }), /font-medium">photos<\/span>.*aria-label="Remove Photo search"/);
  assert.match(html({ name: 'generate-image' }), /font-medium">image<\/span>.*aria-label="Remove Image generation"/);
  // A saved draft or message naming a removed command still renders, neutral, never a /name and never a crash.
  assert.match(html({ name: 'simplify' }), /font-medium">simplify<\/span>.*aria-label="Remove Simplify"/);
  assert.match(html({ name: 'video' }), /^<span data-command-pill="video" class="[^"]*border-line bg-hover text-ink">/);
  assert.match(html({ name: 'cad' }), /font-medium">cad<\/span>/);
  assert.match(html({ name: 'motion' }), /data-command-pill="motion"[^>]*>.*font-medium">motion<\/span>.*aria-label="Remove Animated explainer"/);
  assert.doesNotMatch(html({ name: 'motion', onOpen: () => {} }), />\/motion</);
  assert.match(html({ name: 'youtube' }), /aria-label="Remove YouTube search"/);
  // Without onOpen the name is text, not a button: only the x acts.
  assert.equal((html({ name: 'arxiv' }).match(/<button/g) || []).length, 1);
  // Each composer sizes it; disabled (Voice on) disables both buttons.
  const sized = html({ name: 'graph', onOpen: () => {}, disabled: true, className: 'h-8 rounded-lg pl-2 text-sm', removeClassName: 'mx-0.5 h-6 w-6' });
  assert.match(sized, /class="inline-flex shrink-0 items-center border h-8 rounded-lg pl-2 text-sm"/);
  assert.equal((sized.match(/disabled=""/g) || []).length, 2);
  assert.match(sized, /mx-0\.5 h-6 w-6/);
});

test('every registered command (Chat, Ctrl+K and Insert) has a pill with its typed name and no leading slash', () => {
  for (const command of SLASH) {
    for (const onOpen of [null, () => {}]) {
      const pill = html({ name: command.name, onOpen });
      const text = pill.match(/font-medium">([^<]*)<\/(?:span|button)>/)?.[1];
      assert.equal(text, typedOf(command.name), `/${command.name}: the typed name`);
      assert.ok(!text.startsWith('/'));
      assert.ok(pill.includes(`aria-label="Remove ${labelOf(command)}"`), `/${command.name}: Remove ${labelOf(command)}`);
    }
  }
  assert.equal(SLASH.length, 18);
  // The Home, Library and Project bar has no slash commands since 2026-10-20 (owner), so it draws no command pill at all.
  const bar = readFileSync(new URL('./agent/AgentBar.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(bar, /data-command-pill|commandLabel/);
});
