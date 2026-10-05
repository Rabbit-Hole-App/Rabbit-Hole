// Tutor v2 TutorDomain (docs/features/adaptive-learning-path-v1-architecture.md §3, LP1 Task 6). One Tutor, two
// domains: the nanoGPT default must stay byte-identical (§3.4 gate 3: its planner context is pinned against a
// snapshot taken from the code before the change), and a journey canvas runs the same runTurn, router, validator
// and planner context over its own registry, its current section and server-side evidence. No model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardBlock } from './nanogpt/board.js';
import { cardModule } from './learn-tutor-claims.js';
import { appendEvents, emptyStore, deriveClaimStates } from './learn-tutor-evidence.js';
import { buildTurn, executeActions, plannerContext, route, runTurn } from './learn-tutor.js';
import { validateActions } from './learn-tutor-validate.js';
import { selectClaims } from './learn-tutor-select.js';
import { journeyDomain } from './learn-journey-domain.js';
import { fixtureFor } from '../../control-plane/src/learn-journey-fixtures.js';

// ---------- nanoGPT: byte-identical ----------

// learn-tutor-context.test.mjs's contextOn, copied; `card` null means no target block, `canvas` adds a hole.
const contextOn = (card, raw, store = emptyStore(), canvas = {}) => {
  const block = card ? cardBlock(cardModule(card)) : null, states = deriveClaimStates(store.events);
  const { turn, claims, selection } = buildTurn({ raw, canvas: { app: 'a', board: 'b', ...canvas }, block, store: { ...store, turns: Array.from({ length: 6 }, (_, i) => ({ learner: `m${i}`, tutor: `r${i}` })) }, states });
  const selected = selection ? selection.selected : claims;
  const routed = route({ turn, claims: selected, states, evaluation: null, store });
  return plannerContext({ turn, routed, block, states, claims: selected, store });
};
const misconception = { concept: 'score-scaling', claim: 'score-scaling/multiplier-changes-sharpness', result: 'misconception', misconception_id: 'score-zero-weight-zero', kind: null, settled: true, evaluator: 'jev', source: 'free_text', ref: {} };
const SOFTMAX_HOLE = { dive: { dive_id: 'canvas-hole', title: 'Softmax', concept: 'Softmax', created_by: 'tutor_confirmed', origin: { parent: { app: 'a', board: 'b' }, origin_card_id: 'depth-attention-guided', origin_part_id: null, origin_concept_ids: ['softmax'] }, return_point: { pending_question: 'Why add up to one?' } } };
// The six inputs: a question on a card (the context test's), a part of the deep dive, an explanation, a request on
// prior misconception evidence, a hole with no target, and an off-slice question.
const NANOGPT_INPUTS = [
  ['c11-causal-mask', 'Why is the mask applied before softmax?'],
  ['depth-attention-deep', 'Each score is the dot product of the query with that key.'],
  ['c10-weighted-values', 'The output is a weighted average of the values, so it lands between them.'],
  ['c12-score-scaling', 'Show me what a smaller multiplier does.', appendEvents(emptyStore(), [misconception, misconception]).store],
  [null, 'What does softmax do to the scores?', emptyStore(), SOFTMAX_HOLE],
  [null, 'What is a transformer?'],
];
const SNAPSHOT = JSON.parse(readFileSync(new URL('./__fixtures__/nanogpt-planner-context.json', import.meta.url), 'utf8'));

test('nanoGPT: the planner context is byte-identical to the pre-TutorDomain snapshot on all six inputs', () => {
  assert.equal(SNAPSHOT.length, NANOGPT_INPUTS.length);
  NANOGPT_INPUTS.forEach((input, i) => {
    // Compared as JSON text, so key order is pinned too (it is what the planner route receives).
    assert.equal(JSON.stringify(contextOn(...input)), JSON.stringify(SNAPSHOT[i]), `input ${i}: ${input[1]}`);
  });
});

// ---------- Journey domain ----------

// The LR fixture journey (learn-journey-fixtures.js): a registry of 3 concepts, the drafted path accepted, section 1
// current with 2 expected_evidence claims, and two section-1 step blocks stamped `journey` (learn-journey-materialize.js).
const TOPIC = 'logistic regression';
const { registry } = fixtureFor('journey_diagnostic', { topic: TOPIC });
const VOCAB = 'logistic-regression-foundations/vocabulary', WHY = 'logistic-regression-foundations/motivation';
const drafted = fixtureFor('journey_path', { topic: TOPIC, registry }).path;
const PATH = {
  ...drafted, current_section_id: 's1',
  sections: drafted.sections.map(s => (s.id === 's1' ? { ...s, status: 'current', generation_state: 'generated', expected_evidence: [{ claim: VOCAB, kind: 'explain' }, { claim: WHY, kind: 'explain' }] } : s)),
};
const JOURNEY = {
  id: 'lj_test', state: 'active', pending: null, error: null,
  request: { raw_user_message: 'teach me logistic regression', topic: TOPIC, intent: 'learn', channel: 'text' },
  intake: { slots: { goal: 'intuition', familiarity: 'new', depth: 'guided', minutes: 30 }, source: {} },
  registry, evidence: { seq: 0, events: [] }, path_version: 1, active_section_id: 's1',
};
// Stamped as the materializer stamps them: journey_id, section_id, step_id, claims (LP1 Task 15 review round 3).
const step = (id, section, title, claims, journey_id = 'lj_test') => ({ id, type: 'explanation', title, body: `${title} body.`, journey: { journey_id, section_id: section, step_id: id, claims } });
const BLOCKS = [
  { id: 'h1', type: 'heading', level: 1, text: 'Classification vs regression', journey_section_id: 's1', journey_id: 'lj_test' },
  step('b1', 's1', 'Framing', [VOCAB, WHY]),
  step('b2', 's1', 'Explanation', [VOCAB, WHY]),
  step('b9', 's2', 'Not yet', [WHY]), // a later section's block is never the Tutor's card
  { id: 'n1', type: 'note', text: 'my own note' },
];
const HERE = { app: 'a', board: 'b' };
const domainFor = (over = {}) => journeyDomain({ journey: { ...JOURNEY, ...over }, path: PATH, blocks: BLOCKS });
const ev = (seq, claim, result = 'pass') => ({ seq, concept: claim.split('/')[0], claim, result, kind: 'demonstrated_here', settled: true, evaluator: 'jev', source: 'free_text', ref: {} });

test('journey: no target -> the current section expected_evidence claims; states over exactly the registry', () => {
  const domain = domainFor();
  const states = deriveClaimStates([], domain.claims);
  assert.deepEqual(Object.keys(states).sort(), Object.keys(registry.claims).sort());
  const { claims } = buildTurn({ raw: 'Where does this start?', canvas: HERE, block: null, store: emptyStore(), states, domain });
  assert.deepEqual(claims, [VOCAB, WHY]);
  // A section block as the target: its stamped claims.
  const predict = step('b3', 's1', 'Prediction', [WHY]);
  const on = buildTurn({ raw: 'Where does this start?', canvas: HERE, block: predict, store: emptyStore(), states, domain: journeyDomain({ journey: JOURNEY, path: PATH, blocks: [...BLOCKS, predict] }) });
  assert.deepEqual(on.claims, [WHY]);
});

test('journey: the planner context has ten keys, journey_context last, and only the current section cards', () => {
  const domain = domainFor();
  const states = deriveClaimStates([], domain.claims);
  const { turn, claims, selection } = buildTurn({ raw: 'Why do we need a threshold?', canvas: HERE, block: null, store: emptyStore(), states, domain });
  const selected = selection ? selection.selected : claims;
  const routed = route({ turn, claims: selected, states, evaluation: null, store: emptyStore() });
  const context = plannerContext({ turn, routed, block: null, states, claims: selected, store: emptyStore(), domain });
  assert.deepEqual(Object.keys(context), ['learner_intent', 'target', 'relevant_evidence', 'route', 'allowed_actions', 'relevant_authored_content', 'learner_constraints', 'recent_relevant_context', 'dive_context', 'journey_context']);
  assert.deepEqual(context.relevant_authored_content.cards.map(card => card.card), ['b1', 'b2']);
  const jc = context.journey_context;
  assert.equal(jc.phase, 'active');
  assert.deepEqual(jc.section.expected_evidence, [VOCAB, WHY]);
  assert.equal(jc.section.title, 'Classification vs regression');
  assert.ok(jc.upcoming.length <= 6 && !jc.upcoming.includes(jc.section.title));
  assert.deepEqual(jc.constraints, { depth: 'guided', minutes: 30, coding: null, math: null });
  assert.ok(JSON.stringify(jc).length <= 1500, 'bounded to about 1.5 KB');
  assert.ok(!JSON.stringify(context).includes('teach me logistic regression'), 'no raw intake words');
});

test('journey: the validator - only canvas blocks of the current section, no depth ladder', () => {
  const domain = domainFor();
  const states = deriveClaimStates([], domain.claims);
  const { turn } = buildTurn({ raw: 'Show me the framing card', canvas: HERE, block: null, store: emptyStore(), states, domain });
  const routed = route({ turn, claims: [VOCAB], states, evaluation: null, store: emptyStore() });
  assert.equal(routed.row, 'not_yet_observed');
  const decide = action => validateActions({ actions: [action] }, routed, turn, domain).decisions[0];
  assert.deepEqual(decide({ type: 'show_authored_card', card: 'not-on-canvas' }), { type: 'show_authored_card', accepted: false, stage: 'resource', reason: 'unknown card not-on-canvas' });
  assert.equal(decide({ type: 'show_authored_card', card: 'b9' }).stage, 'resource', 'a later section block is not showable');
  assert.equal(decide({ type: 'suggest_depth', card: 'b1', direction: 'deeper' }).stage, 'resource');
  assert.deepEqual(decide({ type: 'show_authored_card', card: 'b1' }), { type: 'show_authored_card', accepted: true, stage: 'accepted', reason: null });
  // Showing a journey card reveals the block already there; nothing is ever inserted.
  const calls = [];
  const canvas = { blocks: () => BLOCKS, revealBlock: id => calls.push(['reveal', id]), insertBlock: () => calls.push(['insert']) };
  const chips = executeActions([{ type: 'show_authored_card', card: 'b1', mode: 'navigate' }, { type: 'show_authored_card', card: 'b2', mode: 'suggest' }], { canvas, suggestDive: () => {}, domain });
  assert.deepEqual(chips.map(chip => chip.label), ['Show Explanation']);
  chips[0].run();
  assert.deepEqual(calls, [['reveal', 'b1'], ['reveal', 'b2']]);
});

test('journey: plan:false stops after evidence and adopts the server events (no local duplicate); the evaluate body names the journey', async () => {
  const domain = domainFor();
  const server = [ev(1, VOCAB), ev(2, WHY), ev(3, WHY, 'fail')];
  const sent = [];
  const post = async (path, body) => {
    sent.push({ path, body });
    if (path === '/api/learn/tutor/evaluate') return { status: 'settled', evaluator: 'jev', events: [{ concept: VOCAB.split('/')[0], claim: VOCAB, result: 'pass', kind: 'demonstrated_here', settled: true }], journey: { events: server, seq: 3 } };
    throw new Error(`unexpected ${path}`);
  };
  const result = await runTurn({ raw: 'A classifier picks a label; regression predicts a number.', canvas: HERE, access: { app: 'a', board: 'b' }, block: null, store: emptyStore(), post, domain, plan: false });
  assert.deepEqual(sent.map(entry => entry.path), ['/api/learn/tutor/evaluate'], 'no planner call');
  assert.deepEqual(result.store.events, server);
  assert.equal(result.store.seq, 3);
  assert.deepEqual(result.actions, []);
  assert.equal(result.text, '');
  assert.deepEqual(Object.keys(result.states).sort(), Object.keys(registry.claims).sort());
  assert.equal(result.states[WHY].state, 'uncertain');
  assert.deepEqual(result.transitions, [{ claim: VOCAB, from: 'not_yet_observed', to: 'uncertain' }, { claim: WHY, from: 'not_yet_observed', to: 'uncertain' }], 'transitions from adopting the server events');
  const body = sent[0].body;
  assert.equal(body.journey_id, 'lj_test');
  assert.deepEqual(body.claims, [VOCAB, WHY]);
  assert.equal(body.message, 'A classifier picks a label; regression predicts a number.');
  assert.equal(body.answering, false);
  assert.ok(!('spec' in body));
});

test('journey setup (intake), no open probe: off_slice, respond_text only, nothing evaluated', async () => {
  const domain = journeyDomain({ journey: { ...JOURNEY, state: 'intake', active_section_id: null, registry: { concepts: {}, claims: {} } }, path: null, blocks: [] });
  const sent = [];
  const post = async (path, body) => { sent.push({ path, body }); return { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'A threshold turns a probability into a label.' }] }; };
  const result = await runTurn({ raw: 'What is a threshold?', canvas: HERE, access: { app: 'a', board: 'b' }, block: null, store: emptyStore(), post, domain });
  assert.equal(result.routed.row, 'off_slice');
  assert.deepEqual(result.routed.allowed, ['respond_text']);
  assert.deepEqual(sent.map(entry => entry.path), ['/api/learn/tutor/plan']);
  assert.equal(sent[0].body.context.journey_context.phase, 'setup');
  assert.equal(sent[0].body.context.journey_context.section, null);
});

// ---------- Review round 1 ----------

const evaluateOnly = (reply, sent = []) => async (path, body) => {
  sent.push({ path, body });
  if (path === '/api/learn/tutor/evaluate') return typeof reply === 'function' ? reply() : reply;
  throw new Error(`unexpected ${path}`);
};
const answer = (extra = {}) => ({ raw: 'A classifier picks a label; regression predicts a number.', canvas: HERE, access: { app: 'a', board: 'b' }, block: null, store: emptyStore(), domain: domainFor(), plan: false, ...extra });

test('journey cues come from the journey registry only, never the nanoGPT CUES of a same-named claim', () => {
  const id = 'softmax/normalizes-to-one';
  const domain = journeyDomain({
    journey: { ...JOURNEY, registry: {
      concepts: { softmax: { label: 'Softmax', names: ['softmax'], prerequisites: [] } },
      claims: { [id]: { concept: 'softmax', statement: 'Weights are probabilities.', ideas: ['they sum to one'], misconceptions: [], prerequisites: [], drawn: 'one row', cues: ['probabilities sum'] } },
    } },
    path: PATH, blocks: [],
  });
  assert.deepEqual(selectClaims('the probabilities sum to one', { candidates: [id] }, domain).matched[id], ['probabilities sum']);
  assert.equal(selectClaims('the weights add up to one', { candidates: [id] }, domain).matched[id], undefined, 'the nanoGPT cue "add up to one" is not this claim\'s');
  assert.deepEqual(selectClaims('the weights add up to one', { candidates: [id] }).matched[id], ['add up to one'], 'nanoGPT keeps its CUES');
});

test('journey: an authored pager card on a journey canvas is no journey card - the planner context does not throw; route takes domain', () => {
  const domain = domainFor();
  const deep = cardBlock(cardModule('depth-attention-deep'));
  const states = deriveClaimStates([], domain.claims);
  const { turn, claims } = buildTurn({ raw: 'What is this?', canvas: HERE, block: deep, store: emptyStore(), states, domain });
  assert.ok(turn.target.part_id, 'the pager card has a part');
  const routed = route({ turn, claims, states, evaluation: null, store: emptyStore(), domain });
  assert.deepEqual(routed, route({ turn, claims, states, evaluation: null, store: emptyStore() }), 'route reads nothing domain-specific');
  const context = plannerContext({ turn, routed, block: deep, states, claims, store: emptyStore(), domain });
  assert.ok(context.target && !('card' in context.target), 'described, not a journey card');
});

test('journey_context stays bounded with a 16-concept registry, long labels, long titles and a long goal', () => {
  const concepts = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`concept-${i}`, { label: `${'a very long concept label '.repeat(8)}${i}`, names: [`concept ${i}`], prerequisites: [] }]));
  const path = {
    ...PATH, goal: 'g'.repeat(500),
    sections: PATH.sections.map(s => (s.id === 's1' ? { ...s, target_concepts: Object.keys(concepts) } : { ...s, title: `${s.title} ${'t'.repeat(200)}` })),
  };
  const jc = journeyDomain({ journey: { ...JOURNEY, registry: { concepts, claims: registry.claims } }, path, blocks: BLOCKS }).context;
  assert.equal(jc.goal.length, 200);
  assert.equal(jc.section.target_concepts.length, 6);
  assert.ok(jc.section.target_concepts.every(label => label.length <= 60));
  assert.ok(jc.upcoming.length <= 6 && jc.upcoming.every(title => title.length <= 80));
  assert.ok(JSON.stringify(jc).length <= 1500, `${JSON.stringify(jc).length} characters`);
});

test('journey: a settled result without the server journey events adds nothing - never a local reconcile', async () => {
  const result = await runTurn({ ...answer(), post: evaluateOnly({ status: 'settled', evaluator: 'jev', events: [{ concept: VOCAB.split('/')[0], claim: VOCAB, result: 'pass', kind: 'demonstrated_here', settled: true }] }) });
  assert.deepEqual(result.store.events, []);
  assert.equal(result.store.seq, 0);
  assert.deepEqual(result.transitions, []);
  assert.equal(result.states[VOCAB].state, 'not_yet_observed');
});

test('journey plan:false closes the probe it answered', async () => {
  const sent = [];
  const store = { ...emptyStore(), open: { action_id: 'q1', claim: VOCAB, text: 'How is classification different from regression?', canvas: HERE } };
  const result = await runTurn({ ...answer({ store }), post: evaluateOnly({ status: 'settled', evaluator: 'jev', events: [], journey: { events: [ev(1, VOCAB)], seq: 1 } }, sent) });
  assert.equal(sent[0].body.answering, true);
  assert.equal(sent[0].body.question, 'How is classification different from regression?');
  assert.equal(result.turn.answering, 'q1');
  assert.equal(result.store.open, null, 'the next free-text turn is not an answer to the old probe');
});

test('journey plan:false waits for an evaluation off the critical path, then returns its evidence', async () => {
  const sent = [];
  let landed = false;
  const reply = () => new Promise(resolve => setTimeout(() => { landed = true; resolve({ status: 'settled', evaluator: 'jev', events: [], journey: { events: [ev(1, WHY)], seq: 1 } }); }, 20));
  // A question that ends in "?" with no prerequisite check is not on the critical path (criticalPath).
  const result = await runTurn({ ...answer({ raw: 'Why would anyone use a classifier here?' }), post: evaluateOnly(reply, sent) });
  assert.ok(landed);
  assert.deepEqual(sent.map(entry => entry.path), ['/api/learn/tutor/evaluate']);
  assert.deepEqual(result.store.events, [ev(1, WHY)]);
  assert.equal(result.bench.evaluated, true);
});

test('journey cards: completed-section blocks are showable; suggest_practice needs a block with an activity', () => {
  const path = { ...PATH, current_section_id: 's2', sections: PATH.sections.map(s => (s.id === 's1' ? { ...s, status: 'completed' } : s.id === 's2' ? { ...s, status: 'current', generation_state: 'generated' } : s)) };
  const practice = { ...step('b4', 's2', 'Practice', [WHY]), activity: { id: 'p1', kind: 'choice' } };
  const domain = journeyDomain({ journey: { ...JOURNEY, active_section_id: 's2' }, path, blocks: [...BLOCKS, practice] });
  assert.deepEqual(domain.cards, ['b1', 'b2', 'b9', 'b4']);
  const states = deriveClaimStates([], domain.claims);
  const { turn } = buildTurn({ raw: 'Can I practise this?', canvas: HERE, block: null, store: emptyStore(), states, domain });
  const routed = { row: 'uncertain', strategy: 'feynman', allowed: ['respond_text', 'focus_part', 'show_authored_card', 'suggest_depth', 'suggest_practice', 'ask_question'], claim: WHY };
  const decide = action => validateActions({ actions: [action] }, routed, turn, domain).decisions[0];
  assert.equal(decide({ type: 'show_authored_card', card: 'b1' }).accepted, true, 'a completed section block');
  assert.equal(decide({ type: 'suggest_practice', card: 'b4' }).accepted, true);
  assert.deepEqual(decide({ type: 'suggest_practice', card: 'b9' }), { type: 'suggest_practice', accepted: false, stage: 'resource', reason: 'b9 has no practice' });
});

test('journey cards: the blocks an archived journey left on the board are never cards of a new journey, even under the same section id (LP1 Task 15 review round 3)', () => {
  // Start new archives the old journey server-side; its stamped blocks stay on the canvas, and section ids repeat.
  const old = [step('o1', 's1', 'Old framing', [VOCAB], 'lj_old'), { ...step('o2', 's1', 'Old practice', [WHY], 'lj_old'), activity: { id: 'p0', kind: 'choice' } }];
  const domain = journeyDomain({ journey: JOURNEY, path: PATH, blocks: [...old, ...BLOCKS] });
  assert.deepEqual(domain.cards, ['b1', 'b2']);
  assert.deepEqual(domain.catalogue().map(c => c.card), ['b1', 'b2']);
  assert.equal(domain.cardModule('o1'), null);
  const revealed = [];
  assert.equal(domain.showCard({ revealBlock: id => revealed.push(id) }, 'o2'), false);
  assert.equal(domain.showCard({ revealBlock: id => revealed.push(id) }, 'b1'), true);
  assert.deepEqual(revealed, ['b1']);
});

// ---------- LP1 Task 12: the journey evaluate body ----------

test('journey evaluate body: the board from the canvas, the turn id, probe_id only on a plan:false probe answer', async () => {
  const sent = [];
  const reply = { status: 'settled', evaluator: 'jev', events: [], journey: { events: [ev(1, VOCAB)], seq: 1 } };
  // The access LearnPage passes is { app } alone: the board comes from the canvas.
  const probe = { ...emptyStore(), open: { action_id: 'p3', claim: VOCAB, text: 'Explain it in your words.', canvas: HERE } };
  await runTurn({ ...answer({ store: probe, access: { app: 'a' }, turnId: 't-probe' }), post: evaluateOnly(reply, sent) });
  assert.deepEqual(sent[0].body, { app: 'a', board: 'b', journey_id: 'lj_test', message: 'A classifier picks a label; regression predicts a number.', claims: [VOCAB], answering: true, question: 'Explain it in your words.', probe_id: 'p3', turn_id: 't-probe' });
  // A planned turn that answers the Tutor's own question names no probe: its action id is no probe id.
  const asked = { ...probe, open: { ...probe.open, action_id: 'tutor-q1' } };
  const plan = { strategy: 'feynman', constraints_add: [], actions: [{ type: 'respond_text', text: 'Yes.' }] };
  await runTurn({ ...answer({ store: asked, access: { app: 'a' }, turnId: 't-asked', plan: true }), post: async (path, body) => { sent.push({ path, body }); return path.endsWith('/evaluate') ? reply : plan; } });
  assert.equal(sent[1].path, '/api/learn/tutor/evaluate');
  assert.equal(sent[1].body.board, 'b');
  assert.equal(sent[1].body.turn_id, 't-asked');
  assert.equal(sent[1].body.answering, true);
  assert.ok(!('probe_id' in sent[1].body));
});

test('journey: a duplicate probe answer (status duplicate) adopts the stored journey evidence and is never an error', async () => {
  const stored = [ev(1, VOCAB), ev(2, WHY)];
  const probe = { ...emptyStore(), open: { action_id: 'p3', claim: VOCAB, text: 'Explain it.', canvas: HERE } };
  const result = await runTurn({ ...answer({ store: probe }), post: evaluateOnly({ status: 'duplicate', evaluator: null, events: [], journey: { events: stored, seq: 2 } }) });
  assert.equal(result.evaluation.status, 'duplicate');
  assert.deepEqual(result.store.events, stored);
  assert.equal(result.store.seq, 2);
  assert.equal(result.store.open, null);
  assert.equal(result.bench.evaluation.status, 'duplicate');
});
