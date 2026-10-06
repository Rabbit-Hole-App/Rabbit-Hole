// The next_step Tutor turn, browser side (contract §2.5, §2.6). Task 4: router, planner context, validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, deriveClaimStates } from './learn-tutor-evidence.js';
import { plannerContext, route } from './learn-tutor.js';
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
