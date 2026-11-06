// Fix C part 2: the Tutor's offer as a card on the canvas (ProposalCard.jsx), rendered from the recorded fixtures through roadmap-canvas.js. Markup only (no browser):
// what each state shows, what it must not (a spinner or a timer before acceptance, saturated green/red, a price), and where the strip hangs.
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
const tmp = mkdtempSync(join(tmpdir(), 'proposal-card-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as ProposalCard } from './ProposalCard.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const lib = createRequire(import.meta.url)(outfile);
const SLOT = { id: 'roadmap:st_1', w: 380, h: 420, at: { x: 640, y: 120 }, started: 0 };
const render = (card, actions = {}) => lib.renderToStaticMarkup(lib.createElement(lib.ProposalCard, { slot: SLOT, card, actions }));
const text = markup => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BANNED = /\$|credit|cost|price|estimate|maximum|opus|sonnet|claude|token/i;
const pending = () => canvasCardsOf(view('status-active-proposal-pending'))[0];

test('pending: type, title, description, a quiet source line, pale static lines; no spinner, no timer, no saturated colour, no price', () => {
  const card = pending(), markup = render(card);
  assert.match(markup, /data-roadmap-type[^>]*>Explanation</);
  assert.ok(markup.includes(card.title) && markup.includes(card.description.slice(0, 20)));
  assert.match(markup, /data-roadmap-source[^>]*>From /);
  assert.match(markup, /data-roadmap-placeholder="explanation"/);
  assert.doesNotMatch(markup, /animate-spin|data-slot-elapsed|shimmer|skeleton-line/, 'nothing has started, so nothing spins, counts or shimmers');
  assert.doesNotMatch(markup, /bg-(green|red)-|text-white|bg-black/, 'no saturated blocks');
  assert.doesNotMatch(text(markup), BANNED);
  assert.match(markup, /position:absolute;left:640px;top:120px;width:380px/, 'a world position, so it pans and zooms with the canvas, not pinned to the viewport');
  assert.doesNotMatch(markup, /position:fixed|fixed /);
});

test('the Accept [Tab] | Cancel strip hangs below and outside the frame, square-ended, small, with accessible names', () => {
  const markup = render(pending());
  const frameEnd = markup.indexOf('</section>'), strip = markup.indexOf('data-roadmap-pill');
  assert.ok(frameEnd > 0 && strip > frameEnd, 'the strip follows the frame, it is not inside it');
  assert.match(markup, /data-roadmap-accept[^>]*>Accept<kbd[^>]*>Tab<\/kbd>/);
  assert.match(markup, /data-roadmap-cancel[^>]*>Cancel</);
  assert.match(markup, /h-7/);
  assert.doesNotMatch(markup.slice(strip), /rounded-(md|lg|xl|full)/, 'square ends');
  assert.match(markup, /data-roadmap-overlay=""[^>]*tabindex="-1"/, 'the frame is the keyboard owner, as the old overlay was');
});

test('a table offer shows a table-like outline; an accepting offer disables Accept and says so; a not-yet-acceptable one keeps the name, greyed', () => {
  const card = pending();
  assert.match(render({ ...card, format: 'table' }), /data-roadmap-type[^>]*>Table<.*data-roadmap-placeholder="table"/s);
  const accepting = render({ ...card, accepting: true });
  assert.match(accepting, /data-roadmap-accept="true"[^>]*disabled=""[^>]*aria-busy="true"[^>]*>Accepting</s);
  const held = render({ ...card, acceptable: false });
  assert.match(held, /data-roadmap-accept="true"[^>]*disabled=""[^>]*>Accept</s);
});

test('generating and checking turn the same card into the existing skeleton with an honest stage line, a timer and no strip; checking is not called ready', () => {
  const making = render(canvasCardsOf(view('accept-proposal-response-generating'))[0]);
  assert.match(making, /animate-spin/);
  assert.match(making, /shimmer[^>]*>Making this explanation\./);
  assert.match(making, /data-slot-elapsed/);
  assert.match(making, /skeleton-line/);
  assert.doesNotMatch(making, /data-roadmap-pill|data-roadmap-accept|data-roadmap-cancel/, 'an accepted generation is not an unaccepted offer');
  assert.doesNotMatch(making, /data-roadmap-overlay/, 'Tab belongs to nothing once accepted');
  const checking = render(canvasCardsOf(view('status-held-for-checking'))[0]);
  assert.match(checking, /Checking this explanation before it is added\./);
  assert.doesNotMatch(checking, /\b\d+%|ready/i, 'no invented percentage, never claimed ready');
});

test('failed: the server sentence and only the recoveries it allows, in place of a spinner', () => {
  const [card] = canvasCardsOf(view('status-failed-card'));
  const markup = render(card, { onRecover() {} });
  assert.match(markup, /role="alert"/);
  assert.ok(text(markup).includes(card.failure.message));
  assert.doesNotMatch(markup, /animate-spin|data-slot-elapsed|data-roadmap-pill/);
  for (const which of card.recovery) assert.match(markup, new RegExp(`data-roadmap-recover="${which}"`));
  const policy = render({ ...card, recovery: ['replace', 'omit'], failure: { code: 'policy_block', message: 'Outside what I can create.' } });
  assert.doesNotMatch(policy, /data-roadmap-recover="retry"/, 'a refusal is not retried');
});

test('the Edit box opens only for the pending card, from the controller state, and keeps Accept disabled while open', () => {
  const edit = { open: true, draft: { checkStatus: 'passed', title: 'As a table', description: 'A table.' }, busy: false, onPreview() {}, onApply() {}, onDiscard() {} };
  const markup = render(pending(), { edit });
  assert.match(markup, /data-roadmap-editor/);
  assert.match(markup, /As a table/);
  assert.match(markup, /data-roadmap-accept="true"[^>]*disabled=""/);
  assert.match(markup, /data-roadmap-apply="true"(?![^>]*\sdisabled="")/);
  const held = render(pending(), { edit: { ...edit, draft: { checkStatus: 'held' } } });
  assert.match(held, /data-roadmap-apply="true"[^>]*disabled=""/);
  assert.doesNotMatch(render(canvasCardsOf(view('accept-proposal-response-generating'))[0], { edit }), /data-roadmap-editor/);
  assert.doesNotMatch(markup, /…|\.\.\./, 'no ellipsis in any label');
});
