// Minimize and expand were removed for cards (owner 2026-11-17). A card saved with `minimized: true` is drawn as its full card at its saved size and layout; the field stays in the data.
// The pure tile helpers (explanation-minimize.js) are unused by the canvas now and stay tested until they are cleaned up.
// Static markup and source reads, no browser: the card body is bundled with esbuild as the other card tests do.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'explanation-minimize-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody } from './LearningBlocks.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
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

import { SUMMARY_CHARS, capSummary, goodSummary, isMinimized, landSummary, minimizable, minimizedVisual, requestSummary, summaryInput, tileSummary, tileWidth } from './explanation-minimize.js';
import { patchBlock } from './card-layout.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const SPEC = JSON.stringify(Object.values(JSON.parse(read('./tutor-diagrams/examples.json')))[0]);
const fence = (info, text) => '```' + info + '\n' + text + '\n```';
const PICTURE = fence('rh-illustration', JSON.stringify({ version: 1, id: 'fig1', prompt: 'a cup', alt: 'A steaming cup', caption: 'A cup' }));
const FIGURES = { fig1: { status: 'ready', src: 'data:image/png;base64,AAAA', aspect: 1 } };
const PROSE = 'A hot cup loses heat faster at first because the gap to the room is larger. As the coffee nears room temperature the gap shrinks and the cooling slows down.';
const card = (extra = {}) => ({ id: 'c1', type: 'explanation', title: 'Why coffee cools', body: PROSE, w: 440, h: 700, cardLayout: { mode: 'scrollable', scrollableSize: { w: 440, h: 700 }, fullWidth: 720, slot: { w: 440, h: 700 } }, ...extra });
const draw = block => B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'x', selected: true }));

test('a card saved as minimized is drawn as its full card: no tile, no Expand button, nothing to restore it with', () => {
  const html = draw(card({ minimized: true, summary: 'A hot cup cools fastest first.', body: `${PROSE}\n\n${PICTURE}`, figures: FIGURES }));
  assert.match(html, /data-explanation="true"/, 'the full card');
  assert.doesNotMatch(html, /data-explanation-tile|data-tile-summary|data-tile-visual|data-explanation-open|Expand card|>Expand</);
  assert.equal(draw(card({ minimized: true })), draw(card()), 'identical to the same card that was never minimized');
});

test('minimizedVisual: the legacy illustration, a ready figure or a diagram; never a figure that is not ready or a diagram that does not parse; More sections count', () => {
  assert.deepEqual(minimizedVisual(card({ illustration: { cacheKey: 'k', alt: 'a', caption: 'c' } })), { kind: 'picture', illustration: { cacheKey: 'k', alt: 'a', caption: '' } });
  assert.equal(minimizedVisual(card({ body: PICTURE, figures: { fig1: { status: 'pending' } } })), null, 'a picture still being made is not a visual yet');
  assert.equal(minimizedVisual(card({ body: PICTURE })), null);
  assert.equal(minimizedVisual(card({ body: fence('rh-diagram', '{"not":"a diagram"}') })), null);
  assert.equal(minimizedVisual(card({ body: PROSE, more: [{ label: 'Worked example', text: fence('rh-diagram', SPEC) }] })).kind, 'diagram');
  assert.equal(minimizedVisual(card({ body: fence('rh-diagram', SPEC), more: [{ label: 'Picture', text: PICTURE }], figures: FIGURES })).kind, 'picture', 'the first picture beats a diagram that comes before it');
  assert.equal(minimizedVisual(card()), null);
});

test('the summary (owner 2026-11-08): the saved one when it is good, else the first whole sentence(s) of the body that fit in 160 characters; never an ellipsis, never a dangling clause', () => {
  assert.equal(tileSummary(card({ summary: 'Saved words.' })), 'Saved words.');
  assert.equal(tileSummary(card()), PROSE, 'under the cap the body is whole');
  const long = card({ body: `# Heading\n\n${fence('rh-diagram', SPEC)}\n\n${'Heat leaves a hot cup quickly at first, since the gap to the room is wide. '.repeat(6)}` });
  const fallback = tileSummary(long);
  assert.ok(fallback.length <= SUMMARY_CHARS && fallback.endsWith('.') && !/Heading|rh-diagram/.test(fallback), fallback);
  assert.ok(capSummary('word '.repeat(100)).length <= SUMMARY_CHARS + 1 && capSummary('word '.repeat(100)).endsWith('word.'));
  assert.equal(SUMMARY_CHARS, 160);
  // a stored summary that is too long or does not end in . ! or ? is bad: the tile shows the body's first whole sentence(s) instead, and a new one may land
  assert.equal(goodSummary('A whole sentence.'), true);
  assert.equal(goodSummary('Cross entropy tells how many extra bits are needed when we encode real data using a model; it adds the ideal bits of the true distribution to a penalty for...'), false);
  assert.equal(goodSummary('x'.repeat(161) + '.'), false);
  const bad = card({ summary: 'Cross entropy tells how many extra bits are needed when we encode real data using a model; it adds the ideal bits of the true distribution to a penalty for...' });
  assert.equal(tileSummary(bad), PROSE, 'the body\'s first sentence(s), not the trailing-off summary');
  assert.equal(landSummary([bad], 'c1', 'A new whole sentence.')[0].summary, 'A new whole sentence.', 'a bad stored summary is replaced when a new one lands');
  assert.equal(landSummary([card({ summary: 'Kept as it is.' })], 'c1', 'Other words.')[0].summary, 'Kept as it is.');
  assert.ok(tileSummary(card({ summary: 'It ends here.' })).endsWith('.'));
  assert.equal(capSummary('It is $x^2$ here.'), 'It is here.');
});

test('minimized is saved data only: it round-trips untouched, no card reads it as minimized, and the card keeps its saved size and layout', () => {
  const before = [card(), { id: 'other', type: 'explanation', title: 'Other', body: PROSE }];
  const saved = JSON.parse(JSON.stringify(patchBlock(before, 'c1', { minimized: true })));
  assert.equal(saved[0].minimized, true, 'the saved field is left as it is: no migration');
  assert.equal(isMinimized(saved[0]), false, 'but no card is minimized any more');
  assert.deepEqual({ w: saved[0].w, h: saved[0].h, cardLayout: saved[0].cardLayout }, { w: 440, h: 700, cardLayout: before[0].cardLayout }, 'its own size and layout are untouched, so it lays out as the full card');
  assert.equal(minimizable({ type: 'explanation' }), false);
  assert.equal(isMinimized({ type: 'explanation', minimized: true }), false);
});

test('the summary lands only on a card still there with none of its own, and as that one field', () => {
  const blocks = [card({ title: 'Edited by the learner' }), card({ id: 'c2', summary: 'Already here.' })];
  const landed = landSummary(blocks, 'c1', 'New summary.');
  assert.deepEqual(landed[0], { ...blocks[0], summary: 'New summary.' }, 'nothing else on the card changes');
  assert.equal(landSummary(blocks, 'c2', 'Other.')[1].summary, 'Already here.', 'never overwritten');
  assert.deepEqual(landSummary(blocks, 'gone', 'Nobody\'s.'), blocks, 'a deleted card is skipped');
});

test('requestSummary: sends the title and prose only; an old card with no summary is asked once; a failure or an empty answer is null, never a throw', async () => {
  const sent = [];
  const ok = await requestSummary(async (path, init) => { sent.push([path, JSON.parse(init.body)]); return { summary: 'A short one.' }; }, { app: 'canvas', block: card({ body: `${PROSE}\n\n${fence('rh-diagram', SPEC)}` }) });
  assert.equal(ok, 'A short one.');
  assert.equal(sent[0][0], '/api/learn/explanation-summary');
  assert.deepEqual(Object.keys(sent[0][1]).sort(), ['app', 'body', 'id', 'title']);
  assert.equal(sent[0][1].id, 'c1', 'the card id rides with the request: the server answers one call per card');
  assert.ok(!sent[0][1].body.includes('rh-diagram'), 'no diagram JSON');
  assert.equal(await requestSummary(async () => { throw new Error('HTTP 502'); }, { app: 'canvas', block: card() }), null);
  assert.equal(await requestSummary(async () => ({ summary: null }), { app: 'canvas', block: card() }), null);
  assert.equal(await requestSummary(async () => { throw new Error('never called'); }, { app: 'canvas', block: { type: 'explanation', anchor: { source: 'x' }, body: PROSE } }), null);
  assert.equal(summaryInput(card({ body: '```rh-diagram\n{}\n```' })), null, 'a card with no prose has nothing to summarise');
});

test('the canvas has no tile footprint and no minimize or expand wiring: a saved-minimized card uses the normal card rules, and nothing can minimize or expand it', () => {
  const canvas = read('./AdaptiveCanvas.jsx'), blocks = read('./LearningBlocks.jsx'), bar = read('./SelectionActions.jsx');
  assert.doesNotMatch(canvas, /isMinimized|minimizable|tileWidth|minimizeCard|expandTileRef|soleMinimize|onMinimize|\btile\b/, 'AdaptiveCanvas');
  assert.match(canvas, /width=\{cardWidth\} wide=\{cardWidth > COLUMN\}\s/, 'always resizable: no tile exception');
  assert.match(canvas, /cardLayout=\{supportsCardLayout\(block\) \? block\.cardLayout : null\} saved=\{\{ w: block\.w, h: block\.h \}\}/, 'the saved size and layout are used');
  assert.match(canvas, /const cardWidth = sized\?\.width \?\? explanationCardWidth\(block\)/);
  assert.doesNotMatch(blocks, /isMinimized|ExplanationTile|Expand card|data-explanation-open/, 'LearningBlocks');
  assert.doesNotMatch(bar, /Minimize|ChevronsDownUp|onMinimize|data-minimize-button/, 'SelectionActions');
  assert.doesNotMatch(read('./connector.js'), /\.minimized/, 'a formerly minimized card can be linked again');
});
