// The next_step Tutor turn, browser side (contract §2.5, §2.6). Task 4: router, planner context, validator. Task 5: the
// turn end to end, the action contract and the modality history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, deriveClaimStates, appendEvents } from './learn-tutor-evidence.js';
import { learnerIntent, plannerContext, route, runTurn } from './learn-tutor.js';
import { actionContract, modalityOf } from './learn-tutor-actions.js';
import { validateActions } from './learn-tutor-validate.js';
import { journeyDomain } from './learn-journey-domain.js';
import { NANOGPT } from './learn-tutor-claims.js';
import { AQUEDUCTS, TIDES } from './__fixtures__/journey-synthetic-domains.mjs';
import { TUTOR_TOOL, plannerRequest } from '../../control-plane/src/agents/learn-tutor.js';

const CLAIMS = TIDES.diagnostic.registry.claims, ID = Object.keys(CLAIMS)[0], IDS = Object.keys(CLAIMS).slice(0, 2);
const MATERIALS = [{ command: 'flashcards', cards: ['flashcards'], paid: false }, { command: 'animate', cards: ['mathAnimation'], paid: true }];
// A journey on the TIDES registry (no fixture or prompt uses it), one current section expecting two claims.
const J = { id: 'lj_t', state: 'active', registry: TIDES.diagnostic.registry, evidence: { seq: 0, events: [] }, active_section_id: 's1', request: { topic: TIDES.topic }, intake: { slots: {} } };
const PATH = { version: 1, goal: 'Understand tidal power', sections: [{ id: 's1', title: 'Ranges', purpose: 'p', status: 'current', expected_evidence: IDS.map(claim => ({ claim, kind: 'explain' })) }] };
const domain = journeyDomain({ journey: J, path: PATH, blocks: [] });
const turnOf = (over = {}) => ({ turn_id: 't', raw_user_message: '', input_modality: 'text', slash: null, canvas: { app: 'a', board: 'main' }, target: null, card_state: null, evidence: [], constraints: [], recent_turns: [], recent_actions: [], ...over });
const NEXT = { suggestion_id: 'ns_00000000.1', hook: 'h', learning_goal: 'g', concept_ids: [], claim_ids: [] };
const states = deriveClaimStates([], CLAIMS);

test('route: create_material only on a next_step turn with materials, on any row', () => {
  const typed = route({ turn: turnOf(), claims: [ID], states, evaluation: null, store: emptyStore() });
  assert.equal(typed.allowed.includes('create_material'), false);
  const step = turnOf({ next_step: { ...NEXT, claim_ids: [ID] }, available_materials: MATERIALS });
  assert.ok(route({ turn: step, claims: [ID], states, evaluation: null, store: emptyStore() }).allowed.includes('create_material'));
  assert.ok(route({ turn: step, claims: [], states, evaluation: null, store: emptyStore() }).allowed.includes('create_material'), 'off_slice too');
  assert.equal(route({ turn: { ...step, available_materials: [] }, claims: [ID], states, evaluation: null, store: emptyStore() }).allowed.includes('create_material'), false);
  assert.equal(route({ turn: { ...turnOf(), available_materials: MATERIALS }, claims: [ID], states, evaluation: null, store: emptyStore() }).allowed.includes('create_material'), false, 'materials without a hook click: never');
});

// Owner test 12d: recent modality history is generic input, evidence only.
test('recent_modalities: carried verbatim, at most 8, never read by the router', () => {
  const history = ['text', 'text', 'text', 'question', 'flashcards', 'text', 'depth', 'text', 'animation'];
  const store = { ...emptyStore(), modalities: history };
  const a = route({ turn: turnOf(), claims: [ID], states, evaluation: null, store });
  const b = route({ turn: turnOf(), claims: [ID], states, evaluation: null, store: emptyStore() });
  assert.deepEqual(a, b, 'the route ignores the history');
  const context = plannerContext({ turn: turnOf(), routed: a, block: null, states, claims: [ID], store, domain });
  assert.deepEqual(context.recent_relevant_context.recent_modalities, history.slice(-8));
  assert.equal(Object.keys(context.recent_relevant_context).at(-1), 'recent_modalities');
  assert.equal('available_materials' in context, false, 'typed turns: no materials key');
  const step = turnOf({ next_step: NEXT, available_materials: MATERIALS });
  const onStep = plannerContext({ turn: step, routed: route({ turn: step, claims: [ID], states, evaluation: null, store }), block: null, states, claims: [ID], store, domain });
  assert.deepEqual(onStep.available_materials, MATERIALS);
  assert.equal(Object.keys(onStep).at(-1), 'available_materials');
  const empty = { ...step, available_materials: [] };
  assert.equal('available_materials' in plannerContext({ turn: empty, routed: route({ turn: empty, claims: [ID], states, evaluation: null, store }), block: null, states, claims: [ID], store, domain }), false, 'a hook turn with no materials: no key');
  assert.deepEqual(plannerContext({ turn: turnOf(), routed: b, block: null, states, claims: [ID], store: null, domain }).recent_relevant_context.recent_modalities, [], 'no store: an empty history');
});

// Owner 2026-10-06: several materials may come from one decision; distinct commands, inside the 3-action cap.
test('validator: create_material needs an offered command, a request and the route; several per turn, distinct commands', () => {
  const step = turnOf({ next_step: NEXT, available_materials: MATERIALS });
  const routed = { row: 'off_slice', strategy: 'none', allowed: ['respond_text', 'create_material'], claim: null };
  const plan = (actions, turn = step) => validateActions({ actions }, routed, turn);
  const two = plan([{ type: 'respond_text', text: 'Here is a set to try.' }, { type: 'create_material', command: 'flashcards', request: 'tidal range terms' }, { type: 'create_material', command: 'animate', request: ' a basin filling at half tide ' }]);
  assert.deepEqual(two.actions, [{ type: 'respond_text', text: 'Here is a set to try.' }, { type: 'create_material', command: 'flashcards', request: 'tidal range terms' }, { type: 'create_material', command: 'animate', request: 'a basin filling at half tide' }]);
  assert.ok(two.decisions.every(d => d.accepted), 'two create_material actions validate');
  const same = plan([{ type: 'create_material', command: 'flashcards', request: 'a' }, { type: 'create_material', command: 'flashcards', request: 'b' }]);
  assert.deepEqual(same.actions, [{ type: 'create_material', command: 'flashcards', request: 'a' }]);
  assert.deepEqual(same.decisions[1], { type: 'create_material', accepted: false, stage: 'route', reason: 'a second create_material for flashcards' });
  const three = [...MATERIALS, { command: 'graph', cards: ['graph'], paid: false }];
  const capped = plan([{ type: 'respond_text', text: 'Three things.' }, ...three.map(m => ({ type: 'create_material', command: m.command, request: 'x' }))], { ...step, available_materials: three });
  assert.equal(capped.actions.length, 3);
  assert.deepEqual(capped.decisions.at(-1), { type: 'create_material', accepted: false, stage: 'route', reason: 'more than 3 actions' });
  assert.equal(plan([{ type: 'create_material', command: 'video', request: 'x' }]).decisions[0].stage, 'resource');
  assert.equal(plan([{ type: 'create_material', command: 'flashcards', request: '' }]).decisions[0].stage, 'schema');
  assert.equal(plan([{ type: 'create_material', command: 'flashcards', request: 'x'.repeat(1001) }]).decisions[0].stage, 'schema');
  assert.deepEqual(plan([{ type: 'create_material', command: 'flashcards', request: 'cases where p > 0.5, q < 1 and the set {a, b}' }]).actions, [{ type: 'create_material', command: 'flashcards', request: 'cases where p > 0.5, q < 1 and the set {a, b}' }], 'maths in a request is fine');
  assert.equal(plan([{ type: 'create_material', command: 'flashcards', request: 'run `rm -rf`' }]).decisions[0].stage, 'schema');
  assert.equal(plan([{ type: 'create_material', command: 'flashcards', request: 'x => y' }]).decisions[0].stage, 'schema');
  assert.equal(plan([{ type: 'create_material', request: 'x' }]).decisions[0].stage, 'schema');
  assert.equal(validateActions({ actions: [{ type: 'create_material', command: 'flashcards', request: 'x' }] }, { ...routed, allowed: ['respond_text'] }, turnOf()).decisions[0].stage, 'route', 'typed turns: never');
});

// ---------- Unrelated domains (owner 2026-10-06, anti-hardcoding) ----------

// Concept, claim and card ids renamed to opaque ones: the registry keeps its shape, nothing else changes.
function renamed(registry) {
  const concept = Object.fromEntries(Object.keys(registry.concepts).map((id, i) => [id, `zq${i}`]));
  const claim = Object.fromEntries(Object.entries(registry.claims).map(([id, c], i) => [id, `${concept[c.concept]}/k${i}`]));
  return {
    concepts: Object.fromEntries(Object.entries(registry.concepts).map(([id, c]) => [concept[id], { ...c, prerequisites: c.prerequisites.map(p => concept[p]) }])),
    claims: Object.fromEntries(Object.entries(registry.claims).map(([id, c]) => [claim[id], { ...c, concept: concept[c.concept], prerequisites: c.prerequisites.map(p => concept[p]) }])),
  };
}
// A journey world on any registry: one current section expecting its first two claims, one stamped card in it.
function journeyWorld(name, registry, topic, cardId = 'b1') {
  const ids = Object.keys(registry.claims).slice(0, 2);
  const journey = { id: 'lj_w', state: 'active', registry, evidence: { seq: 0, events: [] }, active_section_id: 's1', request: { topic }, intake: { slots: {} } };
  const path = { version: 1, goal: `Understand ${topic}`, sections: [{ id: 's1', title: 'First', purpose: 'p', status: 'current', expected_evidence: ids.map(claim => ({ claim, kind: 'explain' })) }] };
  const blocks = [{ id: cardId, type: 'explanation', title: 'Step', body: 'b', journey: { journey_id: 'lj_w', section_id: 's1', step_id: cardId, claims: ids } }];
  return { name, domain: journeyDomain({ journey, path, blocks }), claim: ids[0], words: [topic, ...Object.keys(registry.claims), ...Object.keys(registry.concepts)] };
}
const WORLDS = [
  { name: 'nanoGPT', domain: NANOGPT, claim: Object.keys(NANOGPT.claims)[0], words: [] },
  journeyWorld('TIDES', TIDES.diagnostic.registry, TIDES.topic),
  journeyWorld('AQUEDUCTS', AQUEDUCTS.diagnostic.registry, AQUEDUCTS.topic),
  journeyWorld('TIDES renamed', renamed(TIDES.diagnostic.registry), 'topic one', 'blk-77'),
  journeyWorld('AQUEDUCTS renamed', renamed(AQUEDUCTS.diagnostic.registry), 'topic two', 'blk-78'),
];

test('router, planner context, validator and tool behave the same on nanoGPT, TIDES, AQUEDUCTS and renamed ids', () => {
  const history = ['text', 'question', 'flashcards', 'text', 'animation', 'text', 'depth', 'text', 'text', 'explain_back'];
  const PLAN = [{ type: 'respond_text', text: 'Try these.' }, { type: 'create_material', command: 'flashcards', request: 'the terms' }, { type: 'create_material', command: 'animate', request: 'the mechanism' }];
  const seen = WORLDS.map(({ name, domain: d, claim, words }) => {
    const st = deriveClaimStates([], d.claims), store = { ...emptyStore(), modalities: history };
    const typedTurn = turnOf(), stepTurn = turnOf({ next_step: { ...NEXT, claim_ids: [claim] }, available_materials: MATERIALS });
    const typed = route({ turn: typedTurn, claims: [claim], states: st, evaluation: null, store, domain: d });
    const step = route({ turn: stepTurn, claims: [claim], states: st, evaluation: null, store, domain: d });
    assert.deepEqual(step, { ...typed, allowed: [...typed.allowed, 'create_material'] }, `${name}: a hook click only adds create_material`);
    const offSlice = route({ turn: stepTurn, claims: [], states: st, evaluation: null, store, domain: d });
    const typedContext = plannerContext({ turn: typedTurn, routed: typed, block: null, states: st, claims: [claim], store, domain: d });
    const stepContext = plannerContext({ turn: stepTurn, routed: step, block: null, states: st, claims: [claim], store, domain: d });
    for (const context of [typedContext, stepContext]) {
      const request = plannerRequest(context, 2000, [], { cache: true });
      assert.deepEqual(request.tools, [TUTOR_TOOL], `${name}: one tool for every domain`);
      for (const word of words) assert.equal(request.system[0].text.toLowerCase().includes(word.toLowerCase()), false, `${name}: the prompt names ${word}`);
    }
    const typedPlan = validateActions({ actions: PLAN }, typed, typedTurn, d), stepPlan = validateActions({ actions: PLAN }, step, stepTurn, d);
    return {
      row: typed.row, typed: typed.allowed, step: step.allowed, offSlice: offSlice.allowed,
      history: typedContext.recent_relevant_context.recent_modalities, typedKeys: Object.keys(typedContext).filter(k => k !== 'journey_context'),
      stepKeys: Object.keys(stepContext).filter(k => k !== 'journey_context'), materials: stepContext.available_materials,
      typedPlan: typedPlan.decisions, stepPlan: stepPlan.actions,
    };
  });
  const [nano, ...others] = seen;
  assert.equal(nano.row, 'not_yet_observed');
  assert.ok(nano.step.includes('create_material') && nano.offSlice.includes('create_material'));
  assert.deepEqual(nano.history, history.slice(-8));
  assert.deepEqual(nano.stepPlan, PLAN);
  assert.deepEqual(nano.typedPlan.filter(d => !d.accepted).map(d => d.stage), ['route', 'route'], 'typed turns: create_material refused at the route');
  others.forEach((world, i) => assert.deepEqual(world, nano, WORLDS[i + 1].name));
});

// ---------- Task 5: the next_step turn end to end ----------

const STEP = { v: 1, set_id: 'ns_0a0b0c0d', suggestion_id: 'ns_0a0b0c0d.2', basis: 'b', hook: 'Why do some coasts barely see a tide?', learning_goal: 'Explain how basin shape changes tidal range', concept_ids: [], claim_ids: [IDS[1]], scope: 'owned' };
function worker(plan) {
  const sent = [];
  const post = async (path, body) => { sent.push({ path, body }); if (path === '/api/learn/tutor/plan') return typeof plan === 'function' ? plan(body.context) : plan; throw new Error(`unexpected ${path}`); };
  return { sent, post };
}
const turnWith = (store, plan, extra = {}) => { const w = worker(plan); return runTurn({ raw: '', nextStep: STEP, materials: MATERIALS, canvas: { app: 'a', board: 'main' }, access: { app: 'a' }, block: null, store, post: w.post, domain, ...extra }).then(r => ({ ...r, sent: w.sent })); };
const TEXT_ONLY = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Basin shape matters.' }] };
const misreadStore = () => {
  const wrong = { concept: CLAIMS[IDS[1]].concept, claim: IDS[1], result: 'misconception', misconception_id: CLAIMS[IDS[1]].misconceptions[0]?.id ?? 'm', kind: null, settled: true, evaluator: 'jev', source: 'free_text' };
  return appendEvents(emptyStore(), [wrong, { ...wrong }]).store;
};

// Owner test 7 (and privacy test 12 for holes): a click is never evidence.
test('next_step: no evaluate call, the store events and seq unchanged by reference', async () => {
  const store = appendEvents({ ...emptyStore() }, [{ concept: CLAIMS[IDS[0]].concept, claim: IDS[0], result: 'pass', kind: 'demonstrated_here', settled: true, evaluator: 'jev', source: 'free_text' }]).store;
  const r = await turnWith(store, TEXT_ONLY);
  assert.deepEqual(r.sent.map(s => s.path), ['/api/learn/tutor/plan']);
  assert.equal(r.store.events, store.events);
  assert.equal(r.store.seq, store.seq);
  assert.equal(r.evaluation, null);
});

test('next_step: the turn carries the step as structured data, never as learner prose', async () => {
  const r = await turnWith(emptyStore(), TEXT_ONLY);
  const context = r.sent[0].body.context;
  assert.deepEqual(context.learner_intent, { kind: 'next_step', raw_user_message: '', selected_next_step: { hook: STEP.hook, learning_goal: STEP.learning_goal, concept_ids: [], claim_ids: [IDS[1]] } });
  assert.equal(r.turn.raw_user_message, '');
  assert.deepEqual(context.relevant_evidence.claims.map(c => c.claim)[0], IDS[1], 'the step claims lead the turn claims');
  assert.deepEqual(context.available_materials, MATERIALS);
  assert.deepEqual(r.store.turns.at(-1), { learner: '', next_step: STEP.suggestion_id, tutor: 'Basin shape matters.' });
  assert.deepEqual(r.bench.next_step, { suggestion_id: STEP.suggestion_id, set_id: STEP.set_id });
  // Owner extra test 12b: the hook planner never picks a modality, so nothing beyond the step's four fields reaches the Tutor.
  const extra = await turnWith(emptyStore(), TEXT_ONLY, { nextStep: { ...STEP, modality: 'animation', command: 'animate' } });
  assert.deepEqual(extra.sent[0].body.context.learner_intent, context.learner_intent);
});

// Owner test 8 and owner extra test 12a: the same hook, different evidence, a different route and a different modality.
test('next_step: the Tutor picks the material after the click, from the evidence', async () => {
  const followRoute = context => context.allowed_actions.includes('ask_question') && context.route.row === 'misconception'
    ? { strategy: 'socrates', constraints_add: [], actions: [{ type: 'ask_question', text: 'What would a narrow bay do to the water?', claim: IDS[1], purpose: 'predict' }], reason_codes: ['repair_misconception'] }
    : { strategy: 'feynman', constraints_add: [], actions: [{ type: 'respond_text', text: 'Here is a set to try.' }, { type: 'create_material', command: 'flashcards', request: 'tidal range by basin shape' }], reason_codes: ['increase_interactivity'] };
  const a = await turnWith(misreadStore(), followRoute), b = await turnWith(emptyStore(), followRoute);
  assert.notEqual(a.routed.row, b.routed.row);
  assert.deepEqual(a.store.modalities, ['question']);
  assert.deepEqual(b.store.modalities, ['text', 'flashcards']);
  assert.deepEqual(b.actions.at(-1), { type: 'create_material', command: 'flashcards', request: 'tidal range by basin shape' });
});

// Owner ruling (Task 5): the selected hook says WHAT; the planner decides HOW, so the same hook can make different material.
test('next_step: the same hook makes different material under different evidence', async () => {
  const byRoute = context => ({ strategy: 'feynman', constraints_add: [], actions: context.route.row === 'misconception'
    ? [{ type: 'ask_question', text: 'What would a narrow bay do?', claim: IDS[1], purpose: 'predict' }, { type: 'create_material', command: 'animate', request: 'water entering a narrow bay' }]
    : [{ type: 'respond_text', text: 'Here is a set to try.' }, { type: 'create_material', command: 'flashcards', request: 'tidal range by basin shape' }] });
  const a = await turnWith(misreadStore(), byRoute), b = await turnWith(emptyStore(), byRoute);
  assert.deepEqual([a.routed.row, b.routed.row], ['misconception', 'not_yet_observed']);
  assert.deepEqual([a.actions.at(-1).command, b.actions.at(-1).command], ['animate', 'flashcards']);
  assert.deepEqual([a.store.modalities, b.store.modalities], [['question', 'video'], ['text', 'flashcards']]);
});

test('next_step: navigation is the click consent; typed turns keep the explicit-request rule', async () => {
  const blocks = [{ id: 'b7', type: 'explanation', title: 'Range', journey: { journey_id: 'lj_t', section_id: 's1', step_id: 'b7', claims: [IDS[1]] } }];
  const d = journeyDomain({ journey: J, path: PATH, blocks });
  const plan = { strategy: 'feynman', constraints_add: [], actions: [{ type: 'respond_text', text: 'Look here.' }, { type: 'show_authored_card', card: 'b7', mode: 'navigate' }] };
  const r = await turnWith(emptyStore(), plan, { domain: d });
  assert.equal(r.actions.find(a => a.type === 'show_authored_card')?.mode, 'navigate');
  const typed = await turnWith(emptyStore(), plan, { domain: d, nextStep: null, raw: 'what sets the range' });
  assert.equal(typed.actions.find(a => a.type === 'show_authored_card')?.mode, 'suggest');
});

test('modalityOf: the product names; a card is the block type it is shown or inserted as; an Explain Back challenge is explain_back', () => {
  assert.equal(modalityOf({ type: 'respond_text', text: 'x' }), 'text');
  assert.equal(modalityOf({ type: 'ask_question', purpose: 'explain_back' }), 'explain_back');
  assert.equal(modalityOf({ type: 'ask_question', purpose: 'predict' }), 'question');
  // /animate inserts its maths animation as a video block (learn-primitives.js maths_animation), never a mathAnimation block.
  assert.equal(modalityOf({ type: 'create_material', command: 'animate' }, { materials: MATERIALS }), 'video');
  assert.equal(modalityOf({ type: 'create_material', command: 'flashcards' }, { materials: MATERIALS }), 'flashcards');
  assert.equal(modalityOf({ type: 'create_material', command: 'graph' }, { materials: MATERIALS }), null, 'a command the turn did not offer');
  assert.equal(modalityOf({ type: 'suggest_depth' }), 'depth');
  assert.equal(modalityOf({ type: 'suggest_practice' }), 'practice');
  assert.equal(modalityOf({ type: 'suggest_dive' }), 'rabbit_hole');
  assert.equal(modalityOf({ type: 'return_from_dive' }), 'rabbit_hole');
  assert.equal(modalityOf({ type: 'suggest_avatar_clip' }), 'avatar');
  assert.equal(modalityOf({ type: 'no_action' }), null);
  const stamp = id => ({ journey_id: 'lj_t', section_id: 's1', step_id: id, claims: [] });
  const blocks = [{ id: 'e1', type: 'challenge', mode: 'explain_back', prompt: 'Say it back', journey: stamp('e1') }, { id: 'c1', type: 'challenge', prompt: 'Guess', journey: stamp('c1') }, { id: 's2', type: 'scene', title: 'Steps', journey: stamp('s2') }];
  const d = journeyDomain({ journey: J, path: PATH, blocks });
  assert.deepEqual(['e1', 'c1', 's2', 'gone'].map(card => modalityOf({ type: 'show_authored_card', card }, { domain: d })), ['explain_back', 'challenge', 'scene', null]);
  assert.equal(modalityOf({ type: 'focus_part', card: NANOGPT.cards[0], part_id: 'p' }, { domain: NANOGPT }), 'animation', 'an authored card is inserted as an animation block');
});

test('typed turns are unchanged: no next_step key, intent as before', () => {
  assert.equal(learnerIntent(turnOf({ raw_user_message: 'why?' })).kind, 'question');
  assert.equal('selected_next_step' in learnerIntent(turnOf({ raw_user_message: 'why?' })), false);
});

// Owner 2026-10-06 (fourth message): the production action fields the product and the trace both read.
test('actionContract: action_type, modality, targets, expected evidence and a rough time, per action', () => {
  const concepts = Object.keys(TIDES.diagnostic.registry.concepts);
  const blocks = [{ id: 'b7', type: 'explanation', title: 'Range', journey: { journey_id: 'lj_t', section_id: 's1', step_id: 'b7', claims: [IDS[0]] } }];
  const ctx = { domain: journeyDomain({ journey: J, path: PATH, blocks }), materials: MATERIALS, claims: [IDS[1]] };
  const c = id => CLAIMS[id].concept;
  assert.deepEqual(actionContract({ type: 'ask_question', text: 'Say it back?', claim: IDS[0], purpose: 'explain_back' }, ctx),
    { action_type: 'ask_question', modality: 'explain_back', target_concept_ids: [c(IDS[0])], target_claim_ids: [IDS[0]], expected_evidence: [{ claim_id: IDS[0], via: 'explain_back' }], estimated_learning_seconds: 120 });
  assert.deepEqual(actionContract({ type: 'ask_question', text: 'What next?', claim: IDS[1], purpose: 'predict' }, ctx).expected_evidence, [{ claim_id: IDS[1], via: 'answer' }]);
  assert.deepEqual(actionContract({ type: 'show_authored_card', card: 'b7', mode: 'suggest' }, ctx),
    { action_type: 'show_authored_card', modality: 'explanation', target_concept_ids: [c(IDS[0])], target_claim_ids: [IDS[0]], expected_evidence: [], estimated_learning_seconds: 90 });
  assert.deepEqual(actionContract({ type: 'respond_text', text: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen.' }, ctx),
    { action_type: 'respond_text', modality: 'text', target_concept_ids: [c(IDS[1])], target_claim_ids: [IDS[1]], expected_evidence: [], estimated_learning_seconds: 6 });
  assert.deepEqual(actionContract({ type: 'create_material', command: 'animate', request: 'x' }, ctx),
    { action_type: 'create_material', modality: 'video', target_concept_ids: [c(IDS[1])], target_claim_ids: [IDS[1]], expected_evidence: [{ claim_id: IDS[1], via: 'interaction' }], estimated_learning_seconds: 90 });
  assert.deepEqual(actionContract({ type: 'suggest_dive', concept: concepts[1], title: 'Turbines', from: { anchor: { topic: 'Turbines' } } }, ctx),
    { action_type: 'suggest_dive', modality: 'rabbit_hole', target_concept_ids: [concepts[1]], target_claim_ids: [], expected_evidence: [], estimated_learning_seconds: null });
  assert.equal(actionContract({ type: 'suggest_avatar_clip', moment: 'orientation', concept: concepts[0], max_duration_seconds: 12, offer: 'play' }, ctx).estimated_learning_seconds, 12);
});

test('runTurn: one contract per accepted action (never collapsed), the turn reason codes, and the history from the contracts', async () => {
  const plan = { strategy: 'feynman', constraints_add: [], reason: 'Two kinds of material for one hook.', reason_codes: ['increase_interactivity', 'not_a_code', 'advance_goal', 'increase_interactivity'],
    actions: [{ type: 'respond_text', text: 'Basin shape sets the range.' }, { type: 'create_material', command: 'flashcards', request: 'tidal range terms' }, { type: 'create_material', command: 'animate', request: 'a basin filling' }] };
  const r = await turnWith(emptyStore(), plan);
  assert.deepEqual(r.contracts.map(x => [x.action_type, x.modality]), [['respond_text', 'text'], ['create_material', 'flashcards'], ['create_material', 'video']]);
  assert.deepEqual(r.contracts, r.actions.map(action => actionContract(action, { domain, materials: MATERIALS, claims: r.bench.claims })));
  assert.deepEqual(r.reason_codes, ['increase_interactivity', 'advance_goal'], 'known codes only, once each, at most 3');
  assert.deepEqual(r.store.modalities, r.contracts.map(x => x.modality));
  const none = await turnWith(emptyStore(), { strategy: 'none', constraints_add: [], actions: [] });
  assert.deepEqual([none.contracts, none.reason_codes, none.store.modalities], [[], [], []]);
});

// Owner section 5: bounded history, generic, evidence for the planner only.
test('modality history: every turn appends, oldest first, at most 8; no_action adds nothing; the next planner context carries it', async () => {
  assert.deepEqual(emptyStore().modalities, []);
  const store = { ...emptyStore(), modalities: ['text', 'text', 'text', 'text', 'text', 'text', 'question'] };
  const two = { strategy: 'feynman', constraints_add: [], actions: [{ type: 'respond_text', text: 'Try these.' }, { type: 'create_material', command: 'flashcards', request: 'terms' }] };
  const r1 = await turnWith(store, two);
  assert.deepEqual(r1.store.modalities, ['text', 'text', 'text', 'text', 'text', 'question', 'text', 'flashcards']);
  const r2 = await turnWith(r1.store, { strategy: 'none', constraints_add: [], actions: [{ type: 'no_action' }] });
  assert.deepEqual(r2.store.modalities, r1.store.modalities);
  const typed = await turnWith(r2.store, TEXT_ONLY, { nextStep: null, raw: 'what sets the range' });
  assert.deepEqual(typed.sent.find(s => s.path === '/api/learn/tutor/plan').body.context.recent_relevant_context.recent_modalities, r1.store.modalities);
  assert.deepEqual(typed.store.modalities, [...r1.store.modalities, 'text'].slice(-8));
});

test('the next_step turn, its contracts and its history are the same on nanoGPT, TIDES, AQUEDUCTS and renamed ids', async () => {
  const seen = await Promise.all(WORLDS.map(async ({ domain: d, claim }) => {
    const plan = { strategy: 'feynman', constraints_add: [], reason_codes: ['advance_goal'], actions: [{ type: 'respond_text', text: 'Here is one way in.' }, { type: 'ask_question', text: 'What would change?', claim, purpose: 'predict' }, { type: 'create_material', command: 'flashcards', request: 'the terms' }] };
    const r = await turnWith(emptyStore(), plan, { domain: d, nextStep: { ...STEP, claim_ids: [claim] } });
    return {
      paths: r.sent.map(s => s.path), row: r.routed.row, intent: r.sent[0].body.context.learner_intent.kind, modalities: r.store.modalities, reason_codes: r.reason_codes,
      contracts: r.contracts.map(x => ({ ...x, target_concept_ids: x.target_concept_ids.length, target_claim_ids: x.target_claim_ids.map(id => id === claim), expected_evidence: x.expected_evidence.map(e => e.via) })),
    };
  }));
  assert.deepEqual(seen[0].modalities, ['text', 'question', 'flashcards']);
  seen.slice(1).forEach((world, i) => assert.deepEqual(world, seen[0], WORLDS[i + 1].name));
});
