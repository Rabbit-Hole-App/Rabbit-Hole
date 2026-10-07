// Professor Next Steps anti-hardcoding (owner correction 13): the same code on an ML owned canvas, an unrelated non-ML
// owned canvas, an unrelated shared canvas, and each again with renamed and reordered ids and different counts. No model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextStepsController, nextStepsInput } from './learn-next-steps.js';
import { canvasDomain, journeyDomain } from './learn-journey-domain.js';
import { runTurn } from './learn-tutor.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { NANOGPT, cardModule } from './learn-tutor-claims.js';
import { cardBlock } from './nanogpt/board.js';
import { AQUEDUCTS, TIDES, reordered } from './__fixtures__/journey-synthetic-domains.mjs';
import { planNextSteps } from '../../control-plane/src/learn-journey-planners.js';
import { fixtureModel } from '../../control-plane/src/learn-journey-fixtures.js';
import { NEXT_STEPS_LIMITS as L, mintSet, nextStepsOutput } from '../../control-plane/src/agents/learn-next-steps.js';
import { sharedInput } from '../../control-plane/src/learn-next-steps-routes.js';

const rename = (registry, prefix) => {
  const map = new Map(Object.keys(registry.concepts).map((id, i) => [id, `${prefix}-k${i}`]));
  const claims = Object.fromEntries(Object.entries(registry.claims).reverse().map(([id, c], i) => [`${map.get(c.concept)}/q${i}`, { ...c, concept: map.get(c.concept), prerequisites: c.prerequisites.map(p => map.get(p)) }]));
  const concepts = Object.fromEntries([...map].reverse().map(([old, id]) => [id, { ...registry.concepts[old], ...(registry.concepts[old].prerequisites ? { prerequisites: registry.concepts[old].prerequisites.map(p => map.get(p)) } : {}) }]));
  return { concepts, claims };
};
const cut = (registry, n) => ({ concepts: registry.concepts, claims: Object.fromEntries(Object.entries(registry.claims).slice(0, n)) });
// A journey over any registry: a completed section on its last claim, the current one on its first two.
const journeyCase = registry => {
  const ids = Object.keys(registry.claims);
  const journey = { id: 'lj_x', state: 'active', registry, evidence: { seq: 0, events: [] }, active_section_id: 'sB', request: { topic: 'x' }, intake: { slots: {} } };
  const path = { version: 1, goal: 'A goal', current_section_id: 'sB', sections: [{ id: 'sA', title: 'First', purpose: 'p', status: 'completed', expected_evidence: [{ claim: ids.at(-1), kind: 'explain' }] },
    { id: 'sB', title: 'Second', purpose: 'p', status: 'current', expected_evidence: ids.slice(0, 2).map(claim => ({ claim, kind: 'explain' })) }] };
  return { domain: journeyDomain({ journey, path, blocks: [] }), journey: { journey, path, busy: false, trayProps: null }, source: 'journey' };
};
const ML_BLOCKS = NANOGPT.cards.slice(0, 2).map((id, i) => ({ ...cardBlock(cardModule(id)), id: `n${i}` }));
// What the page offers a turn from structural state (LearnTutor.jsx turnOffers): the same on every domain.
const MATERIALS = [{ command: 'flashcards', cards: ['flashcards'], paid: false }];
const OFFERS = ['create_material', 'suggest_research', 'suggest_journey'];

// input (nextStepsInput) -> the fixture planner (planNextSteps) -> mintSet -> controller select -> a next_step runTurn.
// Every id in the set, the step and the turn stays inside this case's own domain; no evaluate call.
async function chain({ domain, journey = null, source = 'registry', blocks = [] }) {
  const built = nextStepsInput({ context: { domain, source }, store: emptyStore(), journey, blocks, record: null, parent: null, title: 'A canvas', lastTurn: null, previous: { hooks: [], goals: [] }, basis: 'b1' });
  assert.equal(built.problem, undefined, 'the case fits the input cap');
  const { input } = built;
  const planned = await planNextSteps({}, input, { callModel: fixtureModel });
  const set = mintSet(planned.options, input);
  const known = new Set([...Object.keys(domain.claims), ...Object.keys(domain.concepts)]);
  for (const o of set.options) for (const id of [...o.selected_next_step.claim_ids, ...o.selected_next_step.concept_ids]) assert.ok(known.has(id), `${id} is outside this domain`);
  const ctl = nextStepsController({ post: async () => set, setTimer: fn => { queueMicrotask(fn); return 1; }, clearTimer: () => {} });
  ctl.update({ basis: 'b1', stop: null, input: () => built });
  for (let i = 0; i < 10 && ctl.view().status !== 'ready'; i++) await new Promise(resolve => setImmediate(resolve));
  const picked = ctl.select(set.options[0].id);
  assert.equal(picked.ok, true);
  const sent = [];
  const post = async path => { sent.push(path); return { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'ok' }] }; };
  const r = await runTurn({ raw: '', nextStep: picked.selected_next_step, materials: MATERIALS, research: true, journeyOffer: true, canvas: { app: 'c', board: 'main' }, access: { app: 'c' }, block: null, store: emptyStore(), post, domain });
  assert.deepEqual(sent, ['/api/learn/tutor/plan'], 'no evaluate call');
  for (const id of r.bench.claims) assert.ok(domain.claims[id], `${id} in the turn is outside this domain`);
  for (const offer of OFFERS) assert.ok(r.routed.allowed.includes(offer), `${offer} is offered on row ${r.routed.row}`);
  return { input, set };
}
const CASES = [
  ['ML owned: the registered course domain, its cards on the canvas', () => ({ domain: NANOGPT, blocks: ML_BLOCKS })],
  ['ML owned: the same registry renamed, reordered and cut to 5 claims, as a journey', () => journeyCase(rename(cut({ concepts: NANOGPT.concepts, claims: NANOGPT.claims }, 5), 'mlx'))],
  ['non-ML owned: the aqueducts journey', () => journeyCase(AQUEDUCTS.diagnostic.registry)],
  ['non-ML owned: the tides journey, reordered', () => journeyCase(reordered(TIDES).diagnostic.registry)],
  ['non-ML owned: renamed with 2 claims', () => journeyCase(rename(cut(TIDES.diagnostic.registry, 2), 'tz'))],
  ['plain canvas, no registry', () => {
    const blocks = [{ id: 'w1', type: 'explanation', title: 'Warp tension' }];
    return { domain: canvasDomain({ goal: 'Weaving on a backstrap loom', blocks }), source: 'canvas', blocks };
  }],
];
for (const [name, make] of CASES) {
  test(`same code path: ${name}`, async () => {
    const { input, set } = await chain(make());
    assert.equal(set.options.length, L.options);
    assert.ok(JSON.stringify(input).length <= 9000);
  });
}
test('a renamed registry reaches the input under its new ids only', async () => {
  const { input } = await chain(CASES[1][1]());
  const text = JSON.stringify(input);
  assert.ok(Object.keys(input.scope.claims).every(id => id.startsWith('mlx-k')), 'every claim id is a renamed one');
  for (const id of [...Object.keys(NANOGPT.claims), ...Object.keys(NANOGPT.concepts)]) assert.equal(text.includes(`"${id}"`), false, `the original id ${id} reached the input`);
});

// A shared canvas has no registry of its own: the same sharedInput, planner and mint on any blocks. Block ids are renamed,
// reordered and counted differently across the cases.
async function sharedChain(state, { origin = { root: true }, title = 'A shared board' } = {}) {
  const built = sharedInput(state, { origin, key: 'k', version: 3, title });
  assert.equal(built.problem, undefined, 'the board fits the input cap');
  const { input } = built;
  assert.equal(input.mode, 'shared');
  const planned = await planNextSteps({}, input, { callModel: fixtureModel });
  assert.equal(nextStepsOutput({ options: planned.options }, input).ok, true);
  const set = mintSet(planned.options, input, { source: { share_version: 3, origin_block_id: ':root' } });
  assert.equal(set.options.length, L.options);
  for (const { selected_next_step: step } of set.options) {
    assert.equal(step.scope, 'shared');
    for (const id of step.claim_ids) assert.ok(Object.hasOwn(input.scope.claims, id), `${id} is outside the shared scope`);
    for (const id of step.concept_ids) assert.ok(Object.hasOwn(input.scope.concepts, id), `${id} is outside the shared scope`);
  }
  return { input, set };
}
const loom = ids => ids.map((id, i) => ({ id, type: i % 2 ? 'quiz' : 'explanation', title: ['Warp tension', 'Heddle lift', 'Weft beat-up'][i % 3], question: 'Which thread stays fixed?' }));
const SHARED = [
  ['ML: the course cards as the shared blocks', { blocks: ML_BLOCKS, exchanges: [] }, 'claims'],
  ['unrelated: two blocks', { blocks: [{ id: 'm1', type: 'explanation', title: 'Mapping star charts' }, { id: 'm2', type: 'quiz', question: 'Which star stays fixed?' }], exchanges: [] }, 'none'],
  ['unrelated: three blocks, renamed ids', { blocks: loom(['z9', 'a2', 'q5']), exchanges: [] }, 'none'],
  ['unrelated: the same three, reordered, with one more', { blocks: loom(['q5', 'a2', 'z9', 'b7']), exchanges: [] }, 'none'],
];
for (const [name, state, scope] of SHARED) {
  test(`same code path: shared ${name}`, async () => {
    const { input } = await sharedChain(state);
    assert.equal(input.canvas.blocks.length, state.blocks.length);
    assert.equal(Object.keys(input.scope.claims).length > 0, scope === 'claims');
  });
}
test('same code path: an unrelated shared canvas with no registry claims gives grounded hooks with empty ids', async () => {
  const { input, set } = await sharedChain(SHARED[1][1]);
  assert.deepEqual([input.mode, Object.keys(input.scope.claims).length, input.canvas.blocks.length], ['shared', 0, 2]);
  assert.ok(set.options.every(o => o.selected_next_step.claim_ids.length === 0));
});

test('the cases differ in their scope counts', async () => {
  const counts = [];
  for (const [, make] of CASES) counts.push(Object.keys((await chain(make())).input.scope.claims).length);
  for (const [, state] of SHARED) counts.push(Object.keys((await sharedChain(state)).input.scope.claims).length);
  assert.ok(new Set(counts).size >= 3, counts.join(','));
});

test('no registry labels, topic words, fixture ids or modality sequences in the new product modules', () => {
  const strip = s => s.replace(/(^|\s)\/\/.*$/gm, '$1');
  // Scanned: the product modules Professor Next Steps and the Tutor handoff added. Left out on purpose: the course registry
  // files, where a course is legitimately registered and named (learn-tutor-domains.js, learn-tutor-claims.js, nanogpt/*), and
  // learn-tutor.js, whose default domain parameter names the registered course (its router is scanned by source below).
  const FILES = ['../../control-plane/src/agents/learn-next-steps.js', '../../control-plane/src/learn-next-steps-routes.js', './learn-next-steps.js', './LearnNextSteps.jsx', './learn-tutor-trace.js',
    '../../control-plane/src/learn-tutor-handoff.js', './learn-tutor-actions.js', '../../control-plane/src/agents/learn-labels.js'];
  const vocab = [NANOGPT, AQUEDUCTS.diagnostic.registry, TIDES.diagnostic.registry].flatMap(r => Object.entries(r.concepts).flatMap(([id, c]) => [id, c.label, ...(c.names || [])]))
    .concat([AQUEDUCTS, TIDES].flatMap(d => d.topic.split(' ')), ['aqueduct', 'softmax', 'logistic regression', 'photosynthesis', 'binary search', 'french revolution', 'nanogpt', 'kitchen chemistry', 'bridge loads', 'karpathy', '-foundations', '-core/', '-practice/', 'c11-', 'depth-attention'])
    .filter(word => String(word).length >= 4);
  for (const file of FILES) {
    const code = strip(readFileSync(new URL(file, import.meta.url), 'utf8')).toLowerCase();
    for (const word of vocab) assert.equal(new RegExp(`(^|[^a-z0-9])${String(word).toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9]|$)`).test(code), false, `${file} names ${word}`);
  }
  // Modality history is read in exactly these places, and the router never reads it.
  const source = file => readFileSync(new URL(file, import.meta.url), 'utf8');
  const route = source('./learn-tutor.js').match(/export function route\([\s\S]*?\n\}/)[0];
  assert.equal(/modalit/i.test(strip(route)), false);
  for (const file of ['./learn-tutor-validate.js', './learn-next-steps.js']) assert.equal(/\bmodalities\b[^\n]*(?:===|includes|\[\d\])/.test(source(file)), false, `${file} branches on modality history`);
  // No literal count of hooks, claims or concepts other than the contract constant.
  assert.equal(/options\.length\s*[!=]==\s*3|length\s*===\s*3\b/.test(strip(source('../../control-plane/src/agents/learn-next-steps.js'))), false, 'use NEXT_STEPS_LIMITS.options');
});

test('no product module decides an offer or an action from the learner words', () => {
  const strip = s => s.replace(/(^|\s)\/\/.*$/gm, '$1');
  const source = file => strip(readFileSync(new URL(file, import.meta.url), 'utf8'));
  // The words: the raw message, and the readers of it that decide an intent, a skeleton or claims.
  const WORDS = /raw_user_message|\braw\b|learnerIntent|wantsCard|selectClaims|statedConstraints/;
  const body = (file, start) => source(file).match(new RegExp(`${start}[\\s\\S]*?\\n\\}`))[0];
  // The router decides the allowed actions, offers included (create_material, suggest_research, suggest_journey), from the
  // row, the constraints and the turn's structural offer flags only.
  assert.equal(WORDS.test(body('./learn-tutor.js', 'export function route\\(')), false, 'route() reads the learner words');
  // The turn's offer fields come from buildTurn's parameters (what the page offers), never from the words.
  const offerLines = body('./learn-tutor.js', 'export function buildTurn\\(').split('\n').filter(line => /available_materials|research_offer|journey_offer/.test(line));
  assert.ok(offerLines.length >= 3, 'buildTurn sets all three offer fields');
  for (const line of offerLines) assert.equal(WORDS.test(line), false, `an offer line reads the learner words: ${line.trim()}`);
  // The page's offer function reads structural page state only.
  assert.equal(/\b(raw|text|message|question|input|words?|utterance)\b/i.test(body('./LearnTutor.jsx', 'export function turnOffers\\(')), false, 'turnOffers reads the learner words');
  // Anywhere the four are named (an action type, an offer flag, the handoff), the same line never reads the words. On the
  // worker side raw is the HTTP body, so only the turn's own field names the learner's message there.
  const FOUR = /suggest_journey|suggest_research|create_material|handoff|journey_offer|research_offer|available_materials/i;
  const scanned = [['./learn-tutor.js', WORDS], ['./learn-tutor-validate.js', WORDS], ['./learn-tutor-actions.js', WORDS], ['./LearnTutor.jsx', WORDS],
    ...['agents/learn-tutor.js', 'learn-tutor-routes.js', 'learn-tutor-handoff.js'].map(file => [`../../control-plane/src/${file}`, /raw_user_message/])];
  for (const [file, words] of scanned) for (const line of source(file).split('\n')) if (FOUR.test(line)) assert.equal(words.test(line), false, `${file}: ${line.trim()}`);
});
