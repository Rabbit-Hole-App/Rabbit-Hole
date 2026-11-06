// Tutor lane T8 (C:/s/spec/tutor-workflow): integrator ruling Q5 and owner decision 3a at the action-execution layer, and the
// journey exit of draft Task 04 bullet 4. Real router, validator, runTurn and useTutor; the network is stubbed and no model
// is called. The controls are the canonical ones, read through the contract's mayRun.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { cardBlock } from './nanogpt/board.js';
import { cardModule, CLAIMS } from './learn-tutor-claims.js';
import { appendEvents, emptyStore } from './learn-tutor-evidence.js';
import { GATED_ACTIONS, askedFor, heldActions, route, runTurn } from './learn-tutor.js';
import { mayRun } from './learn-coaching-contract.js';
import { materialCommands } from './learn-slash.js';
import { journeyDomain } from './learn-journey-domain.js';
import { TIDES, AQUEDUCTS } from './__fixtures__/journey-synthetic-domains.mjs';
import { fixtureFor } from '../../control-plane/src/learn-journey-fixtures.js';
import { journeySpec } from '../../control-plane/src/learn-tutor-routes.js';
import { evaluationFrom, tutorJevRequest } from '../../control-plane/src/agents/learn-tutor.js';
import { escalation } from '../../control-plane/src/agents/learn-tutor-escalation.js';
import { THRESHOLDS } from '../../control-plane/src/learn-grade-jev.js';

const ON = { mode: 'tutor', tutorEnabled: true, suggestionsPaused: false, revision: 3 };
// Every state where proactive Tutor actions must not run (owner 3a; ruling Q5), and the one where they may.
const QUIET = { auto: { ...ON, mode: 'auto' }, ask: { ...ON, mode: 'ask' }, off: { ...ON, tutorEnabled: false }, paused: { ...ON, suggestionsPaused: true } };
const mayIn = (controls, chatOpen = true) => kind => mayRun(kind, controls, { chatOpen, ready: true });
const GATED = Object.keys(GATED_ACTIONS).sort();
const say = text => ({ type: 'respond_text', text });
const ASK = { type: 'ask_question', text: 'Which positions can token three attend to?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'diagnose' };
const PRACTICE = { type: 'suggest_practice', card: 'c11-causal-mask' };
const DEEPER = { type: 'suggest_depth', card: 'c11-causal-mask', direction: 'deeper' };
const MATERIAL = { type: 'create_material', command: materialCommands()[0].command, request: 'how the causal mask hides later tokens' };
const C11 = 'causal-mask/reads-self-and-earlier';
// The claim is uncertain (only demonstrated_here), so the router's uncertain row allows practice, depth and a question.
const uncertain = () => appendEvents(emptyStore(), [{ concept: CLAIMS[C11].concept, claim: C11, result: 'pass', kind: 'demonstrated_here', settled: true, evaluator: 'jev', source: 'free_text', idea: 0, ref: {} }]).store;
const NO_EVENTS = { status: 'settled', evaluator: 'jev', events: [] };

// One nanoGPT turn on the causal-mask card. may: the controls as read now (a function of the call count when a test changes them
// mid-turn); plan: the stubbed planner's response.
async function turn({ may, plan, raw = 'Why does the mask matter here?', materials = [] }) {
  const sent = [];
  const post = async (path, body) => { sent.push(path); return path === '/api/learn/tutor/plan' ? structuredClone(plan) : NO_EVENTS; };
  const result = await runTurn({ raw, canvas: { app: 'canvas-aaaa1111', board: 'main' }, access: { app: 'canvas-aaaa1111' }, block: cardBlock(cardModule('c11-causal-mask')), store: uncertain(), post, may, materials });
  return { ...result, sent };
}
const types = result => result.actions.map(action => action.type);

test('q5: every gated type is held in Auto, Ask, Tutor Off and paused Tutor, and with Chat closed; none in Tutor On', () => {
  const plain = { raw_user_message: 'Why does the mask matter here?' };
  for (const [name, controls] of Object.entries(QUIET)) assert.deepEqual([...heldActions(plain, mayIn(controls))].sort(), GATED, name);
  assert.deepEqual([...heldActions(plain, mayIn(ON, false))].sort(), GATED, 'Chat closed suspends coaching');
  assert.deepEqual([...heldActions(plain, mayIn(ON))], [], 'Tutor selected, On and unpaused');
  assert.deepEqual([...heldActions(plain, null)], [], 'no controls (a bench outside the page): nothing held');
  // The gate checks each type as its contract kind.
  assert.deepEqual(GATED_ACTIONS, { ask_question: 'unrequested_question', suggest_practice: 'suggest_practice', create_material: 'unrequested_material', suggest_depth: 'next_step_offer', suggest_dive: 'next_step_offer' });
});

test('q5: what the learner asked for is never held - a hook click, a guided opening, their own slash, or the plan\'s verified explicit_request', () => {
  const auto = mayIn(QUIET.auto);
  assert.equal(heldActions({ raw_user_message: '', next_step: { suggestion_id: 's' } }, auto).size, 0, 'a hook click');
  assert.equal(heldActions({ raw_user_message: '', opening: true }, auto).size, 0, 'the guided opening the learner pressed');
  assert.equal(heldActions({ raw_user_message: 'go on', mode: 'teach' }, auto).size, 0, '/teach');
  const words = { raw_user_message: 'Can you quiz me on the mask?' };
  assert.equal(heldActions(words, auto, { explicit_request: 'quiz me on the mask' }).size, 0, 'the plan quotes the learner');
  assert.deepEqual([...heldActions(words, auto, { explicit_request: 'give me practice' })].sort(), GATED, 'a quote the learner never typed is ignored');
  assert.equal(askedFor(words), false, 'the words alone decide nothing (owner fourteenth message: no keyword router)');
});

test('q5: in each quiet state the plan\'s unrequested follow-up question and practice offer are dropped; the answer stays and no question is left open', async () => {
  const plan = { strategy: 'feynman', constraints_add: [], actions: [say('It hides every later position.'), ASK, PRACTICE] };
  for (const [name, controls] of Object.entries(QUIET)) {
    const r = await turn({ may: mayIn(controls), plan });
    assert.deepEqual(types(r), ['respond_text'], name);
    assert.equal(r.text, 'It hides every later position.', `${name}: the question's words are not in the reply`);
    assert.equal(r.store.open, null, `${name}: no open question to answer`);
    assert.deepEqual(r.decisions.filter(d => d.stage === 'controls').map(d => d.type), ['ask_question', 'suggest_practice'], name);
    assert.notEqual(r.routed.strategy, 'socrates', `${name}: the move explains`);
    assert.ok(r.routed.allowed.includes('respond_text'), name);
  }
  const on = await turn({ may: mayIn(ON), plan });
  assert.deepEqual(types(on), ['respond_text', 'ask_question', 'suggest_practice'], 'Tutor On keeps them');
  assert.equal(on.store.open?.text, ASK.text);
});

test('q5: unrequested material and next-step offers are dropped in Auto and kept in Tutor On; an explicitly requested card is kept in Auto', async () => {
  const plan = { strategy: 'feynman', constraints_add: [], actions: [say('Here is the idea.'), DEEPER, MATERIAL] };
  const auto = await turn({ may: mayIn(QUIET.auto), plan, materials: materialCommands() });
  assert.deepEqual(types(auto), ['respond_text']);
  const on = await turn({ may: mayIn(ON), plan, materials: materialCommands() });
  assert.deepEqual(types(on), ['respond_text', 'suggest_depth', 'create_material']);
  const raw = 'Make a diagram of the causal mask';
  const asked = await turn({ may: mayIn(QUIET.off), raw, materials: materialCommands(), plan: { ...plan, explicit_request: raw, actions: [say('Here it is.'), MATERIAL] } });
  assert.deepEqual(types(asked), ['respond_text', 'create_material'], 'requested material runs with Tutor Off');
});

test('q5: controls are read again after the plan - Off pressed while the plan was coming drops what Tutor On had allowed', async () => {
  let controls = ON;
  const plan = { strategy: 'socrates', constraints_add: [], actions: [say('Look at row three.'), ASK] };
  const sent = [];
  const post = async path => { sent.push(path); if (path === '/api/learn/tutor/plan') { controls = QUIET.off; return structuredClone(plan); } return NO_EVENTS; };
  const r = await runTurn({ raw: 'Why does the mask matter here?', canvas: { app: 'canvas-aaaa1111', board: 'main' }, access: { app: 'canvas-aaaa1111' }, block: cardBlock(cardModule('c11-causal-mask')), store: uncertain(), post, may: kind => mayRun(kind, controls, { chatOpen: true, ready: true }) });
  assert.ok(r.routed.allowed.includes('ask_question'), 'planned under Tutor On');
  assert.deepEqual(types(r), ['respond_text'], 'applied under Tutor Off');
  assert.equal(r.store.open, null);
  assert.deepEqual(r.decisions.filter(d => d.stage === 'controls').map(d => d.type), ['ask_question']);
});

test('q5: the router explains instead of asking when questions are held - misconception, return from a hole and an unsettled answer all allow respond_text', () => {
  const base = { constraints: [], canvas: {}, raw_user_message: 'x' };
  const held = new Set(['ask_question']);
  const wrong = { [C11]: { state: 'misconception' } };
  assert.deepEqual([route({ turn: base, claims: [C11], states: wrong, evaluation: null, store: { socratic: {} } }).row], ['misconception']);
  const quiet = route({ turn: base, claims: [C11], states: wrong, evaluation: null, store: { socratic: {} }, held });
  assert.deepEqual([quiet.row, quiet.strategy], ['misconception_explain', 'feynman']);
  const back = route({ turn: { ...base, returned_from: { claim: C11 } }, claims: [C11], states: wrong, evaluation: null, store: { socratic: {} }, held });
  assert.deepEqual([back.strategy, back.allowed.includes('respond_text')], ['feynman', true]);
  const unsettled = route({ turn: base, claims: [C11], states: { [C11]: { state: 'uncertain' } }, evaluation: { status: 'uncertain', escalation: { uncertain: ['c0_idea0'] } }, store: { socratic: {}, probes: {} }, held });
  assert.deepEqual([unsettled.row, unsettled.allowed.includes('respond_text')], ['uncertain_unsettled', true]);
});

// ---------- The journey exit (draft Task 04 bullet 4; "Context and model boundaries") ----------

// A live journey, its current section's claims as expected evidence; evaluate answers with the server's journey shape, as
// JEV answers words that engage none of the claims: no events.
function journeyTurn(fixture, { raw, store = emptyStore(), plan = true, may = null }) {
  const registry = fixture.registry, ids = Object.keys(registry.claims).slice(0, 2);
  const journey = { id: 'lj_x', state: 'active', registry, evidence: { seq: 0, events: [] }, active_section_id: 's1', request: { topic: fixture.topic }, intake: { slots: {} } };
  const path = { version: 1, goal: fixture.topic, sections: [{ id: 's1', title: 'First', purpose: 'p', status: 'current', expected_evidence: ids.map(claim => ({ claim, kind: 'explain' })) }] };
  const sent = [];
  const post = async (route, body) => {
    sent.push({ route, body });
    if (route === '/api/learn/tutor/plan') return { strategy: 'none', constraints_add: [], actions: [say('A short answer.'), { type: 'suggest_journey', request: 'volcanoes' }] };
    return { status: 'settled', evaluator: 'jev', events: [], journey: { events: [], seq: 0 } };
  };
  return runTurn({ raw, canvas: { app: 'canvas-bbbb2222', board: 'main' }, access: { app: 'canvas-bbbb2222' }, block: null, store, post, domain: journeyDomain({ journey, path, blocks: [] }), plan, journeyOffer: true, may })
    .then(result => ({ ...result, sent, routes: sent.map(s => s.route), ids }));
}
const LR = { topic: 'logistic regression', registry: fixtureFor('journey_diagnostic', { topic: 'logistic regression' }).registry };
const tides = { topic: TIDES.topic, registry: TIDES.diagnostic.registry }, aqueduct = { topic: AQUEDUCTS.topic, registry: AQUEDUCTS.diagnostic.registry };

// Integrator ruling 2026-10-21 (evalfix): the exit is JEV's attempt and engagement checks, not a word rule. Untied words that
// name none of the journey's claims are read against the current section, so an on-topic answer in the learner's own words
// is still evidence (next test); words about another subject engage no claim, so nothing lands on the journey.
test('journey exit: a request about another subject is answered, never refused, and adds no evidence to the journey (KNN on logistic regression; volcanoes on tides and on aqueducts)', async () => {
  for (const [fixture, raw] of [
    [LR, 'Teach me KNN instead'], [LR, 'Help me understand how KNN chooses a class.'],
    [tides, 'How do volcanoes erupt?'], [tides, 'Magma rises because it is less dense than the rock around it.'],
    [aqueduct, 'Why do clouds form?'],
  ]) {
    const r = await journeyTurn(fixture, { raw });
    const evaluate = r.sent.filter(s => s.route === '/api/learn/tutor/evaluate');
    assert.deepEqual(evaluate.map(s => [s.body.journey_id, s.body.claims]), [['lj_x', r.ids]], `${raw}: JEV reads it once, against the current section`);
    assert.equal(r.routes.filter(route => route === '/api/learn/tutor/plan').length, 1, `${raw}: one plan`);
    assert.deepEqual([r.transitions, r.store.events], [[], []], `${raw}: no claim engaged, so nothing lands on the journey`);
    assert.equal(r.text, 'A short answer.', `${raw}: answered, not refused`);
    assert.ok(r.actions.some(a => a.type === 'suggest_journey'), `${raw}: a new guided goal is offered (Start a learning path)`);
  }
  // In Auto the learning-path offer stays: it answers a learning request and starts nothing until clicked (fix B1).
  const auto = await journeyTurn(LR, { raw: 'Teach me KNN instead', may: mayIn(QUIET.auto) });
  assert.ok(auto.actions.some(a => a.type === 'suggest_journey'));
});

test('journey exit: the journey still evaluates what is tied to it - an answer in words that name none of its cues, a cue in the words, an answer to its open question, a probe answer', async () => {
  // The regression the ruling names: an untied answer about the current section in the learner's own words, with no cue.
  const own = await journeyTurn(LR, { raw: 'It squashes the score into a probability.' });
  assert.equal(own.bench.selection.fallback, true, 'no cue matched');
  assert.deepEqual(own.sent.filter(s => s.route === '/api/learn/tutor/evaluate').map(s => s.body.claims), [own.ids], 'evaluated against the current section');
  const cue = await journeyTurn(tides, { raw: TIDES.cueMessage });
  assert.ok(cue.routes.includes('/api/learn/tutor/evaluate'), 'a claim cue');
  assert.equal(cue.sent.find(s => s.route === '/api/learn/tutor/evaluate').body.journey_id, 'lj_x');
  const claim = Object.keys(tides.registry.claims)[0];
  const open = { ...emptyStore(), open: { action_id: 'q1', claim, text: 'How many high tides a day?', canvas: { app: 'canvas-bbbb2222', board: 'main' } } };
  const answer = await journeyTurn(tides, { raw: 'Hmm, I would guess something else entirely.', store: open });
  assert.ok(answer.routes.includes('/api/learn/tutor/evaluate'), 'an answer to the open question');
  const probe = await journeyTurn(aqueduct, { raw: 'Water just goes where it goes.', plan: false });
  assert.deepEqual(probe.routes, ['/api/learn/tutor/evaluate'], 'a diagnostic probe answer (plan: false)');
});

// ---------- The journey exit on recorded JEV answers (lane jev, 2026-10-21: C:/s/spec/day-1021/jev-report.md) ----------
// The tests above stub evaluate with "no events". Here evaluate answers as journeyEvaluate does: the route's own journeySpec,
// tutorJevRequest, evaluationFrom and escalation, with the answers JEV gave on the real path to that exact request (state and
// questions; __fixtures__/jev-recorded-tides.json, the real tides path's claims). A request with no recording is reported, so
// a changed question set needs a new real-path recording. A result that would escalate keeps JEV's events, as the route does
// when the larger evaluator is unavailable.
const CASSETTE = JSON.parse(readFileSync(new URL('./__fixtures__/jev-recorded-tides.json', import.meta.url), 'utf8'));
const jevKey = request => createHash('sha256').update(JSON.stringify({ state: request.state, questions: request.questions })).digest('hex').slice(0, 16);
async function recordedTurn(name, { section, open = false }) {
  const { message, claims, question } = CASSETTE.turns[name], registry = CASSETTE.registry;
  const journey = { id: 'lj_x', state: 'active', registry, evidence: { seq: 0, events: [] }, active_section_id: 's1', request: { topic: CASSETTE.topic }, intake: { slots: {} } };
  const path = { version: 1, goal: CASSETTE.topic, sections: [{ id: 's1', title: 'First', purpose: 'p', status: 'current', expected_evidence: section.map(claim => ({ claim, kind: 'explain' })) }] };
  const store = open ? { ...emptyStore(), open: { action_id: 'q1', claim: claims[0], text: question, canvas: { app: 'canvas-bbbb2222', board: 'main' } } } : emptyStore();
  const unrecorded = [];
  const post = async (route, body) => {
    if (route === '/api/learn/tutor/plan') return { strategy: 'none', constraints_add: [], actions: [say('A short answer.')] };
    const spec = journeySpec(journey, body).value, request = tutorJevRequest(spec, body.message, 'typesafe-ai/jev');
    const recorded = CASSETTE.recordings.find(r => r.key === jevKey(request));
    if (!recorded) { unrecorded.push(jevKey(request)); throw Error('no recorded JEV answer for this request'); }
    const evaluation = { ...evaluationFrom(spec, recorded.answers, THRESHOLDS, 'jev'), evaluator: 'jev', escalation: escalation(spec, recorded.answers, THRESHOLDS) };
    const events = evaluation.events.map((event, i) => ({ ...event, seq: i + 1, ref: { turn_id: body.turn_id } }));
    return { ...evaluation, journey: { events, seq: events.length, revision: 2 } };
  };
  const r = await runTurn({ raw: message, canvas: { app: 'canvas-bbbb2222', board: 'main' }, access: { app: 'canvas-bbbb2222' }, block: null, store, post, domain: journeyDomain({ journey, path, blocks: [] }), journeyOffer: true });
  assert.deepEqual(unrecorded, [], `${name}: JEV's answer to this exact request was recorded on the real path`);
  return { stored: r.store.events.map(e => `${e.claim} ${e.result}${e.idea != null ? `:${e.idea}` : ''}${e.prerequisite ? ` ${e.prerequisite}` : ''}${e.settled ? '' : ' (unsettled)'}`), transitions: r.transitions.map(t => `${t.claim}: ${t.from} -> ${t.to}`) };
}
const S1 = ['gravity-distance/pull-weakens-with-distance'], S2 = ['tidal-force/differential-pull'];

test("journey exit, recorded JEV: an explicit topic switch typed while the Tutor's question is open adds no evidence to the journey", async () => {
  // Real path on 3134c69a: the switch went out as the open question's answer, JEV's non_attempt check said 0.95, and a settled
  // non_attempt landed on the section's claim (not_yet_observed -> uncertain). An on-topic answer on the same section still lands.
  assert.deepEqual((await recordedTurn('onTopicS1', { section: S1 })).stored, [`${S1[0]} pass:0`, `${S1[0]} pass:1`], 'control: an on-topic answer');
  assert.deepEqual(await recordedTurn('switch', { section: S1, open: true }), { stored: [], transitions: [] }, 'another subject adds nothing, question open or not');
});

test('journey exit, recorded JEV: an unrelated aside on a section whose claim has a prerequisite records no prerequisite gap', async () => {
  // Real path on 3134c69a: both aqueduct asides on section 2 stored a settled gap (g0 0.76, 0.77) on its claim. With the
  // prerequisite not yet understood that makes the claim prerequisite_gap: route()'s gap row, a Rabbit Hole offer (suggest_dive).
  assert.deepEqual(CASSETTE.registry.claims[S2[0]].prerequisites, ['gravity-distance'], 'the claim rests on a prerequisite');
  assert.deepEqual((await recordedTurn('onTopicS2', { section: S2, open: true })).stored, [`${S2[0]} pass:0`, `${S2[0]} pass:1`], 'control: an on-topic answer');
  for (const name of ['asideStatement', 'asideQuestion']) assert.deepEqual(await recordedTurn(name, { section: S2 }), { stored: [], transitions: [] }, `${name}: an aside adds nothing`);
});

// ---------- useTutor: material that arrives after Off is not inserted ----------

const dir = mkdtempSync(join(tmpdir(), 'tutor-gating-'));
const outfile = join(dir, 'tutor.cjs');
await esbuild.build({
  stdin: { contents: ["export { useTutor } from './LearnTutor.jsx';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'), resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const bundled = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// A plain canvas Tutor turn whose plan makes one card. coaching: the page's controls reader; onArtifact runs as the card's
// generation request arrives (a test turns Tutor Off there). Returns the inserted blocks and the routes called.
// refused: the card's generation is refused by the AI allowance (L12: 429 with code allowance_limited).
async function plainTurn({ coaching, plan, raw = 'How does bread dough rise?', onArtifact = () => {}, refused = false }) {
  const storage = new Map(), calls = [], inserted = [];
  const globals = {
    window: { dispatchEvent: () => true },
    console: { ...console, info: () => {} },
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    localStorage: { getItem: () => null },
    fetch: async (path, options) => {
      calls.push(path);
      if (path === '/api/learn/artifact') onArtifact();
      if (path === '/api/learn/artifact' && refused) return new Response(JSON.stringify({ error: 'You have used your monthly AI allowance.', code: 'allowance_limited', reason: 'exhausted' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      const reply = path === '/api/learn/tutor/plan' ? { strategy: 'none', constraints_add: [], ...plan } : path === '/api/learn/artifact' ? { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't' } } : { status: 'error', events: [] };
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    let tutor = null;
    const app = { name: 'canvas-0000aaaa', title: 'Bread notes', org: 'o', email: 'e@x.com' };
    const dive = { tree: { path: [{ app: app.name, board: 'main', title: app.title, kind: 'canvas' }], children: [], dive: null }, suggestionCard: null, navigator: null };
    const canvasApi = { current: { blocks: () => [], block: () => null, insertBlock: block => { inserted.push(block); return 'blk-new'; }, reserve: () => null, release: () => {} } };
    const Page = () => { tutor = bundled.useTutor({ app, board: 'main', access: { app: app.name }, canvasApi, canvasState: { card: null }, dive, coaching }); return null; };
    bundled.renderToStaticMarkup(bundled.createElement(Page));
    await tutor.ask({ raw });
    await new Promise(resolve => setTimeout(resolve, 50)); // runMaterials runs after the reply
    return { inserted, calls };
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
}
const MAKE = { actions: [say('Yeast makes gas.'), { type: 'create_material', command: 'explain', request: 'how yeast gas lifts dough' }] };

test('q5 in the page: unrequested material is made and inserted in Tutor On, never started in Auto, and not inserted when Off comes while it is made', async () => {
  const on = await plainTurn({ coaching: mayIn(ON), plan: MAKE });
  assert.equal(on.inserted.length, 1, 'Tutor On: the card goes in');
  const auto = await plainTurn({ coaching: mayIn(QUIET.auto), plan: MAKE });
  assert.deepEqual([auto.inserted.length, auto.calls.includes('/api/learn/artifact')], [0, false], 'Auto: never generated');
  let controls = ON;
  const late = await plainTurn({ coaching: kind => mayRun(kind, controls, { chatOpen: true, ready: true }), plan: MAKE, onArtifact: () => { controls = QUIET.off; } });
  assert.deepEqual([late.calls.includes('/api/learn/artifact'), late.inserted.length], [true, 0], 'Off while it was made: kept out of the canvas');
  const raw = 'Make a card on how yeast lifts dough';
  const asked = await plainTurn({ coaching: mayIn(QUIET.off), raw, plan: { ...MAKE, explicit_request: raw } });
  assert.equal(asked.inserted.length, 1, 'requested material goes in with Tutor Off');
});

test('q5 in the page: a requested card refused by the AI allowance (429 allowance_limited) is never counted as made - nothing is inserted', async () => {
  const raw = 'Make a card on how yeast lifts dough';
  const refused = await plainTurn({ coaching: mayIn(QUIET.auto), raw, plan: { ...MAKE, explicit_request: raw }, refused: true });
  assert.deepEqual([refused.calls.includes('/api/learn/artifact'), refused.inserted.length], [true, 0]);
});
