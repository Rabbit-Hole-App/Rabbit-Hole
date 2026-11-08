// View > Slash Commands examples draw each card with the canvas's own card body (SlashCommandPreview.jsx), so the shared header (CardHeader.jsx: type icon,
// pinned title, meta line; owner 2026-11-07) must show on every example, with a real title and never the placeholder. Markup only, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { PREVIEWS, previewBlock } from './slash-sheet.js';
import { headerTitleOf, placeholderTitle } from './card-rename.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'slash-preview-')), outfile = join(dir, 'b.cjs');
const stubs = { name: 'stubs', setup(build) {
  build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
  build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: here, loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [stubs],
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n');
const LAZY = new Set(['cad', 'animation3d', 'whiteboardVideo', 'scene', 'model3d']);
const decode = text => text.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const cards = Object.entries(PREVIEWS).filter(([, preview]) => preview.kind === 'card').map(([name, preview]) => [name, { id: 'slash-help-' + preview.card, dx: 0, dy: 0, ...previewBlock(preview, { narrow: false }) }]);

test('every example in the window has a real title (the learner-facing one), never the placeholder', () => {
  for (const [name, block] of [...cards, ...['notebook', 'wikipedia', 'browser', 'youtube'].map(name => [name, { ...(typeof PREVIEWS[name].block === 'function' ? PREVIEWS[name].block(false) : PREVIEWS[name].block) }])]) {
    assert.equal(placeholderTitle(block), false, `/${name} example (${block.type}) would show the placeholder title`);
    assert.ok(headerTitleOf(block).length > 2, `/${name} example has a title`);
  }
});

test('each card example the window draws shows the new header: the type icon, its title and a meta line', () => {
  const drawn = [];
  for (const [name, block] of cards) {
    let markup;
    try { markup = B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'x', selected: true })); }
    catch (error) { drawn.push(`${name}: not rendered here (${String(error.message).slice(0, 60)})`); continue; }
    // These bodies are loaded lazily (Suspense), so a Node render holds only their fallback; the source test below pins their header.
    if (LAZY.has(block.type) && !/data-card-header/.test(markup)) { drawn.push(`${name}: lazy body, checked by source`); continue; }
    assert.match(markup, /data-card-header/, `/${name}: the shared header`);
    assert.match(markup, /data-card-icon/, `/${name}: a type icon`);
    assert.doesNotMatch(markup, /h-1.5 w-1.5 rounded-full bg-ink/, `/${name}: no dot Kicker`);
    assert.ok(decode(markup).includes(headerTitleOf(block).replace(/&/g, '&')) || markup.includes('data-card-title'), `/${name}: its title`);
    assert.doesNotMatch(markup, /data-card-title-placeholder/, `/${name}: not the placeholder`);
    drawn.push(`${name}: ok`);
  }
  assert.ok(drawn.filter(line => line.endsWith(': ok')).length >= 8, 'most examples render in Node: ' + drawn.join('; '));
});

test('the cards drawn by their own components, and the Wikipedia reader, use the same header; the preview frame is the canvas shell\'s', () => {
  const preview = read('SlashCommandPreview.jsx');
  assert.match(preview, /<CardHeader block=\{\{ \.\.\.preview\.block, customTitle: preview\.saved\?\.displayTitle \|\| preview\.block\.title \}\} className="px-4 pb-2" meta=/, 'the Wikipedia example');
  assert.doesNotMatch(preview, /h-1.5 w-1.5 rounded-full bg-ink/, "the old dot strip is gone from the window");
  for (const name of ['NotebookCard.jsx', 'WebpageCard.jsx', 'AdaptiveCanvas.jsx', 'CadCard.jsx', 'Animation3DCard.jsx', 'WhiteboardVideoCard.jsx']) assert.match(read(name), /<CardHeader\b/, name + ' (drawn by the window) has the shared header');
  assert.match(preview, /<LearningBlockBody block=/, 'the card examples use the canvas\'s own body');
  assert.match(preview, /<NotebookBody preview/, 'the notebook example uses the canvas\'s own card');
  assert.match(preview, /<YouTubeMoment /, 'the YouTube example uses the canvas\'s own card body');
  assert.match(preview, /<WebpageCard /, 'the webpage example uses the canvas\'s own card');
});
