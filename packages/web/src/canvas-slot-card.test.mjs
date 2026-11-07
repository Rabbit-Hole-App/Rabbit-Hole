// The Tutor's slot on the canvas (AdaptiveCanvas SlotCard with slot.roadmap): one frame through pending, generating and failed, rendered from the recorded fixtures
// (roadmap-canvas.js). Markup only, no browser: what each state shows and where the pill stands. Owner spec 2026-11-06.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { canvasCardsOf } from './roadmap-canvas.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const tmp = mkdtempSync(join(tmpdir(), 'slot-card-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { SlotCard } from './SlotCard.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);
const slotOf = card => ({ id: 'roadmap:s', w: 380, h: 420, at: { x: 640, y: 96 }, started: 0, label: card.title, roadmap: card });
const render = card => lib.renderToStaticMarkup(lib.createElement(lib.SlotCard, { slot: slotOf(card), actions: { onAccept() {}, onCancel() {} } }));
const [pending] = canvasCardsOf(view('status-active-proposal-pending'));

test('pending: the skeleton with the proposed title and description; the pill outside the frame, 8px below; no spinner or timer; keyboard owner', () => {
  const markup = render(pending);
  assert.match(markup, /width:380px;position:absolute;left:640px;top:96px/, 'its own canvas coordinates');
  assert.match(markup, /class="flex flex-col gap-2 /, 'gap-2: the pill stands 8px below the frame');
  assert.ok(markup.includes(pending.title) && markup.includes(pending.description));
  assert.match(markup, /skeleton-line/);
  const frameEnd = markup.indexOf('height:420px'), pill = markup.indexOf('data-roadmap-pill');
  assert.ok(pill > frameEnd && markup.lastIndexOf('</div>', pill) > frameEnd, 'the pill follows the frame, outside it');
  assert.match(markup, /data-roadmap-pill="true" class="inline-flex h-7[^"]*rounded border/, '28px, 4px corners');
  assert.match(markup, />Accept<kbd[^>]*>Tab<\/kbd>/);
  assert.doesNotMatch(markup, /animate-spin|data-slot-elapsed|bg-green-|bg-red-/);
  assert.match(markup, /data-roadmap-overlay=""[^>]*tabindex="-1"/);
});

test('generating: the same frame, title and size; a 16px spinner inside the placeholder; a non-interactive Generating status in the pill place, no buttons', () => {
  const [making] = canvasCardsOf(view('accept-proposal-response-generating'));
  const markup = render(making);
  assert.match(markup, /height:420px/);
  assert.ok(markup.includes(making.title));
  assert.match(markup, /<svg[^>]*width="16"[^>]*height="16"[^>]*animate-spin/);
  assert.match(markup, /role="status" data-roadmap-generating="true" class="inline-flex h-7[^"]*">Generating</);
  assert.doesNotMatch(markup, /data-roadmap-accept|data-roadmap-cancel|data-roadmap-overlay|data-slot-elapsed|\d+%/);
  assert.match(render(canvasCardsOf(view('status-held-for-checking'))[0]), /data-roadmap-generating="true"[^>]*>Checking</, 'checking is still the same slot, never ready; its stage says so (UI.04)');
});

test('failed: the same frame shows the error in place, nothing spins, no controls (Retry is the existing toast)', () => {
  const [failed] = canvasCardsOf(view('status-failed-card'));
  const markup = render(failed);
  assert.match(markup, /height:420px/);
  assert.match(markup, /role="alert"[^>]*>[^<]+</);
  assert.ok(markup.includes(failed.failure.message));
  assert.doesNotMatch(markup, /animate-spin|data-roadmap-pill|data-roadmap-generating/);
});

test('a plain slot (no roadmap) renders exactly as before: spinner, label, timer, in the column', () => {
  const markup = lib.renderToStaticMarkup(lib.createElement(lib.SlotCard, { slot: { id: 'slot:1', w: 380, h: 420, top: 0, started: 0, label: 'Making a card' } }));
  assert.match(markup, /data-slot-elapsed/);
  assert.match(markup, /animate-spin/);
  assert.match(markup, /mx-auto/);
  assert.doesNotMatch(markup, /position:absolute|data-roadmap/);
});

test('privacy: a Tutor slot is hidden from the board thumbnail and from area crops', async () => {
  const { CHROME } = await import('./card-thumbnail.js');
  assert.ok(CHROME.includes('[data-thumbnail-hide]'));
  for (const card of [pending, canvasCardsOf(view('accept-proposal-response-generating'))[0]]) assert.match(render(card), /^<div data-slot-id="roadmap:s" data-roadmap-slot="[a-z]+" data-thumbnail-hide="true"/);
  const source = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(source, /const skip = el => [^\n]*hasAttribute\?\.\('data-roadmap-slot'\)/, 'the area crop filter skips it');
});

test('the pending wrapper (frame and pill) is the keyboard owner, so the pill is inside [data-roadmap-overlay]; a not-yet-acceptable offer shows no Generating', () => {
  const markup = render(pending);
  assert.match(markup, /^<div [^>]*data-roadmap-overlay=""[^>]*tabindex="-1"/);
  const checking = render({ ...pending, acceptable: false });
  assert.doesNotMatch(checking, /Generating|animate-spin/);
  assert.match(checking, /data-roadmap-accept="true"[^>]*disabled=""/);
});

test('the pending slot shows the existing source line (SourceRefLine) for its step passage; no ref or not pending: no line', () => {
  const withLine = lib.renderToStaticMarkup(lib.createElement(lib.SlotCard, { slot: slotOf(pending), actions: { app: 'demo', onAccept() {}, onCancel() {}, onPassage() {} } }));
  assert.match(withLine, /data-source-ref="true"[^>]*data-source-ref-status="unknown"/, 'the same row a delivered card shows, its status not read yet');
  assert.match(withLine, /From Gradient descent notes\.md/);
  assert.ok(withLine.indexOf('data-source-ref=') < withLine.indexOf('data-roadmap-pill'), 'inside the frame, above the pill');
  assert.doesNotMatch(render({ ...pending, sourceRef: null }), /data-source-ref=/);
  assert.doesNotMatch(render({ ...pending, passage: null }), /data-source-ref=/);
  assert.doesNotMatch(render(canvasCardsOf(view('accept-proposal-response-generating'))[0]), /data-source-ref=/);
});

test('View passage from a slot carries the step range (raw), moves the camera to the file card; the first-appearance emphasis is quiet and never moves it', async () => {
  const { viewPassage, emphasizePassage } = await import('./source-refs.js');
  const ref = pending.sourceRef, file = { id: 'f1', kind: 'markdown', fileRef: { source: { id: ref.source.key.slice(5), rev: ref.source.rev } } };
  const sent = [], focused = [];
  assert.equal(viewPassage(ref, { blocks: [file], focus: id => focused.push(id), emit: event => sent.push(event.detail), wait: fn => fn(), range: pending.passage, raw: true }), 'opened');
  assert.deepEqual([focused, sent[0].range, sent[0].raw, sent[0].cardId], [['f1'], pending.passage, true, 'f1']);
  assert.equal(emphasizePassage(ref, pending.passage, { blocks: [file], emit: event => sent.push(event.detail) }), true);
  assert.deepEqual([sent[1].quiet, sent[1].range, focused.length], [true, pending.passage, 1], 'quiet: no camera');
  assert.equal(emphasizePassage(ref, pending.passage, { blocks: [], emit: event => sent.push(event.detail) }), false, 'no file card: nothing');
  assert.equal(sent.length, 2);
});

// UI.04 / UI.05 (file 02): one frame from proposal to saved card with the same words; the first offer's Accept [Tab] | Cancel in the approved green / muted red;
// a later offer has no attached pill (the bottom Next card | Cancel is the canvas's); the stage text follows the server's results[].stage.
test('the slot shows format, the 17px title, description and the exact excerpt in every stage; the first offer pill is green Accept [Tab] | muted-red Cancel', () => {
  const card = { ...pending, excerpt: 'A split is useful when it creates child groups.' };
  const markup = render(card);
  assert.match(markup, /data-slot-format="true"[^>]*text-\[11px\] leading-4[^>]*>Explanation</);
  assert.match(markup, /text-\[17px\] leading-\[1\.35\] font-semibold[^>]*>[^<]+</);
  assert.match(markup, /data-slot-excerpt="true"[^>]*>A split is useful when it creates child groups\.</);
  assert.match(markup, /data-roadmap-accept="true"[^>]*bg-success\/10[^>]*>Accept<kbd/);
  assert.match(markup, /data-roadmap-cancel="true"[^>]*bg-danger\/10[^>]*>Cancel</);
  for (const state of ['generating', 'checking', 'saving', 'failed']) {
    const shown = render({ ...card, state, failure: state === 'failed' ? { message: 'Not made.' } : undefined });
    assert.ok(shown.includes(card.title) && shown.includes(card.description) && shown.includes(card.excerpt), `${state}: the same words`);
    assert.match(shown, /height:420px/);
  }
  assert.match(render({ ...card, state: 'checking' }), /data-roadmap-generating="true"[^>]*>Checking</);
  assert.match(render({ ...card, state: 'saving' }), /data-roadmap-generating="true"[^>]*>Saving</);
  assert.match(render({ ...card, format: 'table' }), /data-slot-format="true"[^>]*>Table</);
  assert.doesNotMatch(render({ ...pending, excerpt: null }), /data-slot-excerpt/, 'no excerpt: no invented quote');
});

test('a later offer (next) keeps the keyboard-owning frame but has no attached pill: Next card | Cancel is the bottom pill', () => {
  const markup = render({ ...pending, next: true });
  assert.match(markup, /^<div [^>]*data-roadmap-overlay=""/);
  assert.doesNotMatch(markup, /data-roadmap-pill|data-roadmap-accept/);
});
