// Minimize an Explanation card to a tile (explanation-minimize.js, LearningBlocks ExplanationTile, SelectionActions Minimize, AdaptiveCanvas wiring).
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

import { SUMMARY_CHARS, capSummary, isMinimized, landSummary, minimizable, minimizedVisual, requestSummary, summaryInput, tileSummary, tileWidth } from './explanation-minimize.js';
import { patchBlock } from './card-layout.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const SPEC = JSON.stringify(Object.values(JSON.parse(read('./tutor-diagrams/examples.json')))[0]);
const fence = (info, text) => '```' + info + '\n' + text + '\n```';
const PICTURE = fence('rh-illustration', JSON.stringify({ version: 1, id: 'fig1', prompt: 'a cup', alt: 'A steaming cup', caption: 'A cup' }));
const FIGURES = { fig1: { status: 'ready', src: 'data:image/png;base64,AAAA', aspect: 1 } };
const PROSE = 'A hot cup loses heat faster at first because the gap to the room is larger. As the coffee nears room temperature the gap shrinks and the cooling slows down.';
const card = (extra = {}) => ({ id: 'c1', type: 'explanation', title: 'Why coffee cools', body: PROSE, w: 440, h: 700, cardLayout: { mode: 'scrollable', scrollableSize: { w: 440, h: 700 }, fullWidth: 720, slot: { w: 440, h: 700 } }, ...extra });
const draw = block => B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'x', selected: true }));

test('the tile: title, summary clamped to three lines, the picture when there is one, Open; the full card is not drawn', () => {
  const html = draw(card({ minimized: true, summary: 'A hot cup cools fastest first.', body: `${PROSE}\n\n${PICTURE}`, figures: FIGURES }));
  assert.match(html, /data-explanation-tile/);
  assert.match(html, /Why coffee cools/);
  assert.match(html, /<p data-tile-summary="true" class="[^"]*line-clamp-3[^"]*">A hot cup cools fastest first\.<\/p>/);
  assert.match(html, /data-tile-visual="picture"/);
  assert.match(html, /<img src="data:image\/png;base64,AAAA" alt="A steaming cup"/);
  assert.doesNotMatch(html, /data-illustration-caption/, 'no caption on the tile');
  assert.match(html, /<button[^>]*data-explanation-open[^>]*>Open<\/button>/);
  assert.doesNotMatch(html, /data-explanation(?!-)|data-explanation-flow|data-explain-more/, 'the full card is not drawn under the tile');
});

test('the picture wins over an earlier diagram; with no picture the first diagram is drawn at the tile\'s width; with neither, title, summary and Open only', () => {
  const both = draw(card({ minimized: true, body: `${fence('rh-diagram', SPEC)}\n\n${PROSE}\n\n${PICTURE}`, figures: FIGURES }));
  assert.match(both, /data-tile-visual="picture"/);
  assert.doesNotMatch(both, /data-tutor-diagram/);
  const diagram = draw(card({ minimized: true, body: `${PROSE}\n\n${fence('rh-diagram', SPEC)}` }));
  assert.match(diagram, /data-tile-visual="diagram"/);
  assert.match(diagram, /<svg[^>]*data-tutor-diagram/);
  const none = draw(card({ minimized: true }));
  assert.doesNotMatch(none, /data-tile-visual/);
  assert.match(none, /data-tile-summary/);
  assert.match(none, /data-explanation-open/);
  const css = read('./index.css');
  assert.match(css, /\[data-explanation-tile\] \[data-tile-visual="diagram"\] > div \{ overflow: hidden !important; \}/, 'a dense diagram scales down, it does not scroll sideways, in the tile');
  assert.match(css, /\[data-explanation-tile\] \[data-tile-visual="diagram"\] svg \{ width: 100%; height: auto; max-width: 100% !important; \}/);
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

test('the summary: the saved one, else the first sentences of the body cut at 220 characters at a sentence, else at a word', () => {
  assert.equal(tileSummary(card({ summary: 'Saved words.' })), 'Saved words.');
  assert.equal(tileSummary(card()), PROSE, 'under the cap the body is whole');
  const long = card({ body: `# Heading\n\n${fence('rh-diagram', SPEC)}\n\n${'Heat leaves a hot cup quickly at first, since the gap to the room is wide. '.repeat(6)}` });
  const fallback = tileSummary(long);
  assert.ok(fallback.length <= SUMMARY_CHARS && fallback.endsWith('.') && !/Heading|rh-diagram/.test(fallback), fallback);
  assert.ok(capSummary('word '.repeat(100)).length <= 220 && !capSummary('word '.repeat(100)).endsWith(' '));
  assert.equal(capSummary('It is $x^2$ here.'), 'It is here.');
});

test('minimized round-trips through the card save path and Open restores the full card at its saved size', () => {
  const before = [card(), { id: 'other', type: 'explanation', title: 'Other', body: PROSE }];
  const saved = JSON.parse(JSON.stringify(patchBlock(before, 'c1', { minimized: true })));
  assert.equal(isMinimized(saved[0]), true, 'it survives the board being saved and loaded');
  assert.equal(isMinimized(saved[1]), false, 'the default is false');
  assert.deepEqual({ w: saved[0].w, h: saved[0].h, cardLayout: saved[0].cardLayout }, { w: 440, h: 700, cardLayout: before[0].cardLayout }, 'its own size is untouched, so Open restores it');
  assert.equal(tileWidth(saved[0]), 408);
  assert.equal(tileWidth({ w: 300 }), 320);
  assert.equal(tileWidth({ w: 380 }), 380);
  const opened = { ...saved[0], minimized: false };
  assert.match(draw(opened), /data-explanation="true"/);
  assert.doesNotMatch(draw(opened), /data-explanation-tile/);
  assert.match(read('./LearningBlocks.jsx'), /onClick=\{\(\) => onChange\(\{ \.\.\.block, minimized: false \}\)\}>Open<\/Button>/, 'Open un-minimizes through the card\'s own change');
  for (const not of [{ type: 'explanation', anchor: { source: 'x' }, minimized: true }, { type: 'explanation', excerpt: { kind: 'text' }, minimized: true }, { type: 'quiz', minimized: true }]) assert.equal(isMinimized(not), false);
  assert.equal(minimizable({ type: 'explanation' }), true);
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
  assert.deepEqual(Object.keys(sent[0][1]).sort(), ['app', 'body', 'title']);
  assert.ok(!sent[0][1].body.includes('rh-diagram'), 'no diagram JSON');
  assert.equal(await requestSummary(async () => { throw new Error('HTTP 502'); }, { app: 'canvas', block: card() }), null);
  assert.equal(await requestSummary(async () => ({ summary: null }), { app: 'canvas', block: card() }), null);
  assert.equal(await requestSummary(async () => { throw new Error('never called'); }, { app: 'canvas', block: { type: 'explanation', anchor: { source: 'x' }, body: PROSE } }), null);
  assert.equal(summaryInput(card({ body: '```rh-diagram\n{}\n```' })), null, 'a card with no prose has nothing to summarise');
});

test('the tile\'s footprint: its own width and the content\'s height, no saved size or layout, no resize handle, no footer rows; the saved size stays on the block', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /const tile = isMinimized\(block\);/);
  assert.match(canvas, /width=\{tile \? tileWidth\(block\) : sized\?\.width \?\? BLOCK_TYPES\[block\.type\]\?\.width\} resizable=\{!tile\}/);
  assert.match(canvas, /cardLayout=\{supportsCardLayout\(block\) && !tile \? block\.cardLayout : null\} saved=\{tile \? null : \{ w: block\.w, h: block\.h \}\}/);
  assert.match(canvas, /\{block\.sources && !tile && <SourcesDisclosure/);
  assert.match(canvas, /!cadPermissions\.localCopy && !tile && <CardFeedback/);
});
