// Checklist 'Offer, slots, ToC and delivery': after a first Cancel followed by manual Propose next step the real route produced Chat 'Next card' but Canvas 'Accept'.
// Chat (roadmap-transcript.js entriesOf) and the canvas pill (roadmap-client.js pillOf) must use ONE classification of the pending offer: Accept for the first card
// to accept, Next card once earlier work was accepted (a result exists for another step). Doubles only: contract fixtures, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initialState, pillOf, reduce } from './roadmap-client.js';
import { entriesOf } from './roadmap-transcript.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const body = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const at = (name, patch = v => v) => reduce(initialState(), { type: 'view', view: patch(body(name)) });
const chatLabel = state => entriesOf(state).filter(e => e.kind === 'step').flatMap(e => e.actions).find(a => a.id === 'accept')?.label;

// Step 1 was proposed and Cancelled (no result: nothing was accepted); Propose next step then offered step 2.
const afterFirstCancel = view => {
  const [first, second] = view.steps;
  return { ...view, steps: [{ ...first, state: 'cancelled' }, { ...second, state: 'planned' }], proposal: { ...view.proposal, stepId: second.id }, results: [] };
};

test('after a first Cancel then manual Propose next step Chat and Canvas name the offer the same (nothing was accepted yet: Accept)', () => {
  const state = at('status-active-proposal-pending', afterFirstCancel);
  assert.equal(pillOf(state).label, 'Accept', 'canvas');
  assert.equal(chatLabel(state), pillOf(state).label, 'Chat uses the canvas classification');
});

test('after accepted work the same offer is Next card on both surfaces', () => {
  const state = at('status-delivered-next-ready');
  assert.equal(pillOf(state).label, 'Next card');
  assert.equal(chatLabel(state), 'Next card');
});

test('the first offer is Accept on both surfaces', () => {
  const state = at('status-active-proposal-pending');
  assert.equal(chatLabel(state), 'Accept');
  assert.equal(pillOf(state).label, 'Accept');
});
