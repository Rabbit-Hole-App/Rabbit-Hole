// The next_step Tutor turn, browser side (contract §2.5, §2.6). Task 4: router, planner context, validator. Task 5: the
// turn end to end, the action contract and the modality history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, deriveClaimStates, appendEvents } from './learn-tutor-evidence.js';
import { learnerIntent, plannerContext, route, runTurn } from './learn-tutor.js';
import { actionContract, modalityOf } from './learn-tutor-actions.js';
import { validateActions } from './learn-tutor-validate.js';
import { canvasDomain, journeyDomain } from './learn-journey-domain.js';
import { tutorContext } from './learn-tutor-domains.js';
import { nextStepsInput } from './learn-next-steps.js';
import { NANOGPT } from './learn-tutor-claims.js';
import { AQUEDUCTS, TIDES } from './__fixtures__/journey-synthetic-domains.mjs';
import { CANVAS_SYSTEM, NEXT_STEP_SYSTEM, TUTOR_TOOL, plannerRequest } from '../../control-plane/src/agents/learn-tutor.js';

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
const misreadStore = (claim = IDS[1]) => {
  const wrong = { concept: CLAIMS[claim].concept, claim, result: 'misconception', misconception_id: CLAIMS[claim].misconceptions[0]?.id ?? 'm', kind: null, settled: true, evaluator: 'jev', source: 'free_text' };
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
  // Only the selected claims decide: a misconception on a claim the hook does not select leaves the row on the step claim.
  const elsewhere = misreadStore(IDS[0]);
  assert.equal(deriveClaimStates(elsewhere.events, CLAIMS)[IDS[0]].state, 'misconception');
  const c = await turnWith(elsewhere, byRoute);
  assert.deepEqual([c.routed.row, c.routed.claim, c.actions.at(-1).command, c.store.modalities], ['not_yet_observed', IDS[1], 'flashcards', ['text', 'flashcards']]);
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
    { action_type: 'ask_question', command: null, modality: 'explain_back', target_concept_ids: [c(IDS[0])], target_claim_ids: [IDS[0]], expected_evidence: [{ claim_id: IDS[0], via: 'explain_back' }], estimated_learning_seconds: 120 });
  assert.deepEqual(actionContract({ type: 'ask_question', text: 'What next?', claim: IDS[1], purpose: 'predict' }, ctx).expected_evidence, [{ claim_id: IDS[1], via: 'answer' }]);
  assert.deepEqual(actionContract({ type: 'show_authored_card', card: 'b7', mode: 'suggest' }, ctx),
    { action_type: 'show_authored_card', command: null, modality: 'explanation', target_concept_ids: [c(IDS[0])], target_claim_ids: [IDS[0]], expected_evidence: [], estimated_learning_seconds: 90 });
  assert.deepEqual(actionContract({ type: 'respond_text', text: 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen.' }, ctx),
    { action_type: 'respond_text', command: null, modality: 'text', target_concept_ids: [c(IDS[1])], target_claim_ids: [IDS[1]], expected_evidence: [], estimated_learning_seconds: 6 });
  assert.deepEqual(actionContract({ type: 'create_material', command: 'animate', request: 'x' }, ctx),
    { action_type: 'create_material', command: 'animate', modality: 'video', target_concept_ids: [c(IDS[1])], target_claim_ids: [IDS[1]], expected_evidence: [], estimated_learning_seconds: 90 });
  assert.deepEqual(actionContract({ type: 'suggest_dive', concept: concepts[1], title: 'Turbines', from: { anchor: { topic: 'Turbines' } } }, ctx),
    { action_type: 'suggest_dive', command: null, modality: 'rabbit_hole', target_concept_ids: [concepts[1]], target_claim_ids: [], expected_evidence: [], estimated_learning_seconds: null });
  assert.equal(actionContract({ type: 'suggest_avatar_clip', moment: 'orientation', concept: concepts[0], max_duration_seconds: 12, offer: 'play' }, ctx).estimated_learning_seconds, 12);
});

// Review fix 1: a Motion (maths animation) and a generated video are both video blocks; the contract tells them apart by command.
test('actionContract: command names the Learn command of a made card, null for every other action', () => {
  const materials = [...MATERIALS, { command: 'video', cards: ['videoGenerate'], paid: true }, { command: 'walkthrough', cards: ['walkthrough'], paid: false }, { command: '3d', cards: ['scene'], paid: true }];
  const ctx = { domain, materials, claims: [IDS[1]] };
  const made = command => actionContract({ type: 'create_material', command, request: 'x' }, ctx);
  assert.deepEqual(['animate', 'video', 'walkthrough', '3d'].map(command => [made(command).modality, made(command).command]), [['video', 'animate'], ['video', 'video'], ['scene', 'walkthrough'], ['scene', '3d']]);
  for (const action of [{ type: 'respond_text', text: 'x' }, { type: 'ask_question', text: 'x?', claim: IDS[1], purpose: 'predict' }, { type: 'suggest_dive', concept: null, title: 't', from: {} }, { type: 'return_from_dive' }]) assert.equal(actionContract(action, ctx).command, null, action.type);
  assert.deepEqual(Object.keys(made('animate')), ['action_type', 'command', 'modality', 'target_concept_ids', 'target_claim_ids', 'expected_evidence', 'estimated_learning_seconds']);
});

// Review fix 2: one rule for shown and made cards - the block type decides the expected evidence, never how the card arrived.
test('expected_evidence: a shown and a made card of the same block type expect the same; passive types expect nothing', () => {
  const stamp = id => ({ journey_id: 'lj_t', section_id: 's1', step_id: id, claims: [IDS[1]] });
  const blocks = [{ id: 'f1', type: 'flashcards', cards: [], journey: stamp('f1') }, { id: 'x1', type: 'explanation', title: 'Range', journey: stamp('x1') }, { id: 'v1', type: 'video', mode: 'generate', title: 'Basin', journey: stamp('v1') },
    { id: 'e1', type: 'challenge', mode: 'explain_back', prompt: 'Say it back', journey: stamp('e1') }, { id: 'g1', type: 'graph', title: 'Range', journey: stamp('g1') }, { id: 'q1', type: 'quiz', question: 'q', journey: stamp('q1') }];
  const materials = [{ command: 'flashcards', cards: ['flashcards'], paid: false }, { command: 'explain', cards: ['explanation', 'table'], paid: false }, { command: 'animate', cards: ['mathAnimation'], paid: true },
    { command: 'practice', cards: ['explainBack'], paid: false }, { command: 'graph', cards: ['graph', 'plot'], paid: false }, { command: 'quiz', cards: ['quiz'], paid: false }];
  const ctx = { domain: journeyDomain({ journey: J, path: PATH, blocks }), materials, claims: [IDS[1]] };
  const pairs = [['f1', 'flashcards', 'interaction'], ['x1', 'explain', null], ['v1', 'animate', null], ['e1', 'practice', 'explain_back'], ['g1', 'graph', 'interaction'], ['q1', 'quiz', 'interaction']];
  for (const [card, command, via] of pairs) {
    const shown = actionContract({ type: 'show_authored_card', card, mode: 'suggest' }, ctx), made = actionContract({ type: 'create_material', command, request: 'x' }, ctx);
    assert.equal(shown.modality, made.modality, card);
    assert.deepEqual(shown.expected_evidence, made.expected_evidence, card);
    assert.deepEqual(made.expected_evidence, via ? [{ claim_id: IDS[1], via }] : [], card);
  }
  assert.deepEqual(actionContract({ type: 'respond_text', text: 'x' }, ctx).expected_evidence, []);
  // Task 5 re-review: a plain challenge (the practice command's first card, as materialCommands lists it) expects interaction too.
  const plain = { domain: journeyDomain({ journey: J, path: PATH, blocks: [{ id: 'c1', type: 'challenge', prompt: 'Guess', journey: stamp('c1') }] }), materials: [{ command: 'practice', cards: ['challenge', 'explainBack', 'quiz'], paid: false }], claims: [IDS[1]] };
  const shown = actionContract({ type: 'show_authored_card', card: 'c1', mode: 'suggest' }, plain), made = actionContract({ type: 'create_material', command: 'practice', request: 'x' }, plain);
  assert.deepEqual([shown.modality, made.modality], ['challenge', 'challenge']);
  assert.deepEqual([shown.expected_evidence, made.expected_evidence], [[{ claim_id: IDS[1], via: 'interaction' }], [{ claim_id: IDS[1], via: 'interaction' }]]);
});

// Review fix 3: contract metadata never fails a turn - a domain without its optional members gives null or [] for that field.
test('actionContract and modalityOf never throw on a domain missing cardType, ladderStep, targetClaims, concepts or claims', () => {
  const actions = [{ type: 'respond_text', text: 'x' }, { type: 'ask_question', text: 'x?', claim: IDS[1], purpose: 'explain_back' }, { type: 'show_authored_card', card: 'b7', mode: 'suggest' }, { type: 'focus_part', card: 'b7', part_id: 'p' },
    { type: 'suggest_depth', card: 'b7', direction: 'deeper' }, { type: 'suggest_practice', card: 'b7' }, { type: 'suggest_dive', concept: 'k', title: 't', from: {} }, { type: 'return_from_dive' },
    { type: 'suggest_avatar_clip', moment: 'orientation', concept: 'k', to_concept: 'k2', offer: 'play' }, { type: 'create_material', command: 'flashcards', request: 'x' }];
  for (const minimal of [{}, { claims: CLAIMS }, null]) for (const action of actions) {
    const contract = actionContract(action, { domain: minimal, materials: MATERIALS, claims: [IDS[1]] });
    assert.equal(contract.action_type, action.type);
    if (action.type === 'show_authored_card' || action.type === 'focus_part') assert.deepEqual([contract.modality, contract.target_claim_ids, contract.expected_evidence, contract.estimated_learning_seconds], [null, [], [], null], action.type);
    if (action.type === 'suggest_depth' || action.type === 'suggest_dive' || action.type === 'suggest_avatar_clip') assert.deepEqual([contract.target_claim_ids, contract.target_concept_ids], [[], []], action.type);
    assert.doesNotThrow(() => modalityOf(action, { domain: minimal, materials: MATERIALS }));
  }
  assert.deepEqual(actionContract({ type: 'ask_question', text: 'x?', claim: IDS[1], purpose: 'predict' }, { domain: { claims: CLAIMS }, claims: [] }).target_concept_ids, [CLAIMS[IDS[1]].concept], 'claims alone still name their concepts');
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

// Task 6 (owner anti-hardcoding): the TutorDecisionEvent is built the same way on every domain; only the mode follows it.
test('the decision event is the same on nanoGPT, TIDES, AQUEDUCTS and renamed ids (mode course or journey)', async () => {
  const seen = await Promise.all(WORLDS.map(async ({ domain: d, claim }) => {
    const plan = { strategy: 'feynman', constraints_add: [], reason_codes: ['vary_modality'], reason: 'A prediction makes the idea observable.', actions: [{ type: 'respond_text', text: 'Here is one way in.' }, { type: 'ask_question', text: 'What would change?', claim, purpose: 'predict' }, { type: 'create_material', command: 'flashcards', request: 'the terms' }] };
    const { trace: e } = await turnWith(emptyStore(), plan, { domain: d, nextStep: { ...STEP, claim_ids: [claim] }, trace: true });
    const own = ids => ids.map(id => id === claim);
    return {
      mode: e.identity.mode, keys: [e, e.identity, e.versions, e.decision, e.runtime].map(Object.keys), route: e.decision.route, selected: e.decision.selected_next_step_id, goal: e.decision.current_goal,
      actions: e.decision.actions.map(a => ({ ...a, target_concept_ids: a.target_concept_ids.length, target_claim_ids: own(a.target_claim_ids) })), chosen: e.decision.chosen_action.action_type,
      reason: [e.decision.reason_codes, e.decision.reason_source, e.flags, e.decision.rationale_summary], expected: e.decision.expected_evidence.map(x => [x.claim_id === claim, x.via]), seconds: e.decision.estimated_learning_seconds,
    };
  }));
  assert.deepEqual(seen.map(world => world.mode), ['course', 'journey', 'journey', 'journey', 'journey']);
  assert.deepEqual([seen[0].chosen, seen[0].reason[2], seen[0].goal], ['ask_question', ['vary_modality_alone'], { id: STEP.suggestion_id, summary: STEP.learning_goal }]);
  seen.slice(1).forEach((world, i) => assert.deepEqual({ ...world, mode: 'course' }, seen[0], WORLDS[i + 1].name));
});

// ---------- Task 10: the canvas domain (plain canvases and holes from shared canvases) ----------

// Ruling F4: a canvas with no journey and no registered course gets the canvas domain, for hook clicks only.
test('plain canvas: a hook click runs a Tutor turn with no registry - off_slice words plus create_material, canvas_context, no evidence', async () => {
  const d = canvasDomain({ goal: 'How sourdough rises', origin: null });
  const plan = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Wild yeast makes gas.' }, { type: 'create_material', command: MATERIALS[0].command, request: 'yeast lifecycle' }], reason_codes: ['follow_learner_interest'] };
  const w = worker(plan), store = emptyStore();
  const r = await runTurn({ raw: '', nextStep: { ...STEP, claim_ids: [] }, materials: MATERIALS, canvas: { app: 'canvas-9', board: 'main' }, access: { app: 'canvas-9' }, block: null, store, post: w.post, domain: d, trace: true });
  const context = w.sent[0].body.context;
  assert.deepEqual(w.sent.map(s => s.path), ['/api/learn/tutor/plan'], 'no evaluate: a click writes no evidence');
  assert.deepEqual([r.store.events, r.store.seq], [store.events, store.seq]);
  assert.equal(r.routed.row, 'off_slice');
  assert.deepEqual(r.routed.allowed, ['respond_text', 'create_material']);
  assert.deepEqual(context.canvas_context, { goal: 'How sourdough rises', origin: null });
  assert.equal('journey_context' in context, false);
  assert.deepEqual([context.relevant_evidence, context.relevant_authored_content.cards], [{ claims: [], concepts: {} }, []], 'an empty registry: empty scope');
  assert.deepEqual(r.actions.map(a => a.type), ['respond_text', 'create_material']);
  assert.deepEqual(r.contracts.map(c => [c.action_type, c.command, c.target_claim_ids, c.target_concept_ids]), [['respond_text', null, [], []], ['create_material', MATERIALS[0].command, [], []]]);
  assert.deepEqual(r.store.modalities, ['text', 'flashcards']);
  assert.equal(r.trace.identity.mode, 'canvas', 'TutorDecisionEvent mode canvas');
  assert.deepEqual(r.trace.decision.current_goal, { id: STEP.suggestion_id, summary: STEP.learning_goal });
  // The planner request takes the canvas prompt, chosen by the context key alone.
  const request = plannerRequest(context, 2000, [], { cache: true });
  assert.deepEqual(request.system.map(b => b.text), [CANVAS_SYSTEM, NEXT_STEP_SYSTEM]);
});

test('canvasDomain: the members the router, contract and trace read; goal and origin capped; one prompt for any subject', () => {
  const d = canvasDomain({ goal: 'g'.repeat(300), origin: 'o'.repeat(300) });
  assert.deepEqual([d.claims, d.concepts, d.cards, d.ladder, d.targetClaims({ card_id: 'x' }), d.defaultClaims({}), d.conceptOf('anything'), d.cardType('x'), d.ladderStep('x', 'deeper'), d.catalogue(), d.cardModule('x'), d.practice()],
    [{}, {}, [], [], [], [], null, null, null, [], null, null]);
  assert.deepEqual([d.contextKey, d.evidence, d.sectionId, d.context.goal.length, d.context.origin.length], ['canvas_context', { mode: 'session' }, null, 200, 200]);
  assert.deepEqual(canvasDomain().context, { goal: null, origin: null });
  // Anti-hardcoding: the system prefix is byte-identical for unrelated subjects; only the user message carries them.
  const seen = new Set(), turn = turnOf({ next_step: NEXT, available_materials: MATERIALS });
  for (const goal of ['Weaving on a backstrap loom', 'Causal self-attention in nanoGPT', 'Tidal power']) {
    const routed = route({ turn, claims: [], states: {}, evaluation: null, store: emptyStore() });
    const context = plannerContext({ turn, routed, block: null, states: {}, claims: [], store: emptyStore(), domain: canvasDomain({ goal, origin: 'A shared canvas' }) });
    const request = plannerRequest(context, 2000, [], { cache: true });
    seen.add(request.system[0].text);
    assert.ok(request.messages[0].content.includes(goal));
  }
  assert.deepEqual([...seen], [CANVAS_SYSTEM]);
});

// Review Focus: holes and records from before this feature - no learning_goal, no source, a deleted shared source.
test('old hole records: no learning_goal, no source, a deleted shared source - the hole title is the goal and a hook turn still runs', async () => {
  const record = { dive_id: 'canvas-0000old1', title: 'Exploring from Somewhere', concept: 'Exploring from Somewhere', origin: { parent: { app: 'share:0f0f', board: 'main' }, origin_block_id: ':root' } };
  const root = { app: 'share:0f0f', board: 'main', title: 'Shared canvas', kind: 'shared' };
  const context = tutorContext({ board: 'main', root, record, title: 'Something else' });
  assert.deepEqual([context.source, context.capabilities, context.domain.context], ['canvas', { tutor: false, hook_turns: true }, { goal: 'Exploring from Somewhere', origin: null }]);
  const { input } = nextStepsInput({ context, store: emptyStore(), journey: null, blocks: [], record, parent: null, title: '', lastTurn: null, previous: { hooks: [], goals: [] }, basis: 'b' });
  assert.deepEqual([input.mode, input.goal, input.dive.title, input.dive.parent_states, input.scope.claims], ['dive', 'Exploring from Somewhere', 'Exploring from Somewhere', {}, {}]);
  const w = worker({ strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Start with the basics.' }] });
  const r = await runTurn({ raw: '', nextStep: { ...STEP, claim_ids: [] }, materials: [], canvas: { app: record.dive_id, board: 'main', dive: record }, access: { app: record.dive_id }, block: null, store: emptyStore(), post: w.post, domain: context.domain, trace: true });
  assert.equal(r.routed.row, 'off_slice');
  assert.ok(r.routed.allowed.includes('return_from_dive'), 'a hole can still climb back');
  assert.equal(r.text, 'Start with the basics.');
  assert.deepEqual([w.sent[0].body.context.canvas_context, w.sent[0].body.context.dive_context.dive_id], [{ goal: 'Exploring from Somewhere', origin: null }, record.dive_id]);
  assert.equal(r.trace.identity.mode, 'dive');
  // A newer hole: its learning_goal leads, and the shared canvas it came from is its origin.
  const newer = { ...record, learning_goal: 'Understand why rising dough traps gas', source: { title: 'Bread science' } };
  assert.deepEqual(tutorContext({ board: 'main', root, record: newer, title: 'x' }).domain.context, { goal: 'Understand why rising dough traps gas', origin: 'Bread science' });
});
