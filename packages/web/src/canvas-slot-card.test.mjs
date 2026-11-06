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
  assert.match(render(canvasCardsOf(view('status-held-for-checking'))[0]), /Generating/, 'checking is still the same slot, never ready');
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

test('the pending wrapper (frame and pill) is the keyboard owner, so the pill is inside [data-roadmap-overlay]; a checking offer shows no Generating', () => {
  const markup = render(pending);
  assert.match(markup, /^<div [^>]*data-roadmap-overlay=""[^>]*tabindex="-1"/);
  const checking = render({ ...pending, acceptable: false });
  assert.doesNotMatch(checking, /Generating|animate-spin/);
  assert.match(checking, /data-roadmap-accept="true"[^>]*disabled=""/);
});
