// The written Explanation draws a new diagram as a TutorDiagram (an rh-diagram fence in the body or a More section) and keeps the legacy
// Mermaid reader for saved content. Static markup only, no browser: Md is bundled with esbuild as the other card tests do.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'explanation-illustration-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, 'md.cjs');
await esbuild.build({
  stdin: { contents: "export { Md } from './Md.jsx'; export { LearningBlockBody } from './LearningBlocks.jsx'; export { createElement } from 'react'; export { validCallouts } from './IllustrationFigure.jsx'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^(mermaid|shiki|mathlive)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render() { return { svg: "<svg data-stub-diagram></svg>" }; } }; export class MathfieldElement {} export async function codeToHtml() { throw new Error("no shiki"); }' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);

import { splitLead } from './explanation-lead.js';
import { assetKeysOf } from './learn-board-assets.js';
const { validCallouts } = B;

const card = block => B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'x', selected: true }));
const ILLUSTRATION = { cacheKey: 'illus:wood-maps', alt: 'Three wood maps beside a chair back', caption: 'Base color, normal and roughness maps of one wood.' };
const BODY = 'A wood surface is described by three maps.\n\nThe base color holds the grain, the normal map bends the light.';

test('the opening paragraph is found: after any heading, before the first blank line outside a fence; a body with no opening paragraph puts the figure first', () => {
  assert.deepEqual(splitLead(BODY), { lead: 'A wood surface is described by three maps.', rest: 'The base color holds the grain, the normal map bends the light.' });
  assert.equal(splitLead('# Wood\n\nFirst line\ncontinues.\n\nSecond.').lead, '# Wood\n\nFirst line\ncontinues.');
  for (const body of ['| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.', '```rh-diagram\n{}\n```\n\nAfter.', '- one\n- two', '']) assert.equal(splitLead(body).lead, '', JSON.stringify(body));
  assert.equal(splitLead('Only one paragraph.').rest, '');
});

test('an Explanation with an illustration draws the opening paragraph, then the figure in its own container with the caption below, then the rest', () => {
  const html = card({ type: 'explanation', title: 'Wood', body: BODY, illustration: ILLUSTRATION });
  const at = text => html.indexOf(text);
  assert.ok(at('A wood surface is described') >= 0 && at('data-illustration-frame') > at('A wood surface is described'), 'the figure follows the opening paragraph');
  assert.ok(at('The base color holds the grain') > at('data-illustration-caption'), 'the rest follows the figure');
  assert.ok(at('Base color, normal and roughness maps of one wood.') > at('data-illustration-frame'), 'the caption is below the container');
  assert.match(html, /<figure data-illustration="true" data-illustration-state="loading"/, 'the container is there before the image arrives');
  assert.match(html, /aspect-ratio:\s*1/, 'and its square is reserved');
  assert.doesNotMatch(html, /data-illustration-callouts/, 'no callouts: the slot works on its own');
});

test('an Explanation without an illustration, or one with no usable asset, is the body it always was', () => {
  for (const illustration of [undefined, {}, { caption: 'x' }]) {
    const html = card({ type: 'explanation', title: 'Wood', body: BODY, ...(illustration ? { illustration } : {}) });
    assert.doesNotMatch(html, /data-illustration/);
    assert.match(html, /A wood surface is described by three maps\./);
  }
});

test('the illustration is saved with the board: its asset key is listed and survives a JSON round trip; callouts are kept only when well formed', () => {
  const block = { id: 'c1', type: 'explanation', title: 'Wood', body: BODY, illustration: { ...ILLUSTRATION, callouts: [{ text: 'Normal', px: 29, py: 49, lx: 70, ly: 49 }] } };
  const saved = JSON.parse(JSON.stringify({ blocks: [block] }));
  assert.deepEqual(assetKeysOf(saved), ['illus:wood-maps']);
  assert.deepEqual(saved.blocks[0].illustration, block.illustration);
  assert.equal(validCallouts([{ text: 'Normal', px: 29, py: 49, lx: 70, ly: 49 }]).length, 1);
  for (const bad of [{ text: '', px: 1, py: 1, lx: 1, ly: 1 }, { text: 'x', px: 101, py: 1, lx: 1, ly: 1 }, { text: 'x', px: 'a', py: 1, lx: 1, ly: 1 }, null, { text: 'x', px: 1, py: 1 }]) assert.equal(validCallouts([bad]).length, 0, JSON.stringify(bad));
  assert.equal(validCallouts('nope').length, 0);
});
