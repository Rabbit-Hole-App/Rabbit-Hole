// The real product path behind the evaluation harness (docs/features/tutor-decision-eval.md §8, §16). Free: the provider
// boundary answers Anthropic and JEV from a script and refuses every other host, so no model is called and nothing is spent.
// Every Tutor, hook, evidence and journey step here is the production code at the Learning checkpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateEvent, stateMap } from './events.mjs';
import { loadProfiles, loadTaxonomy, loadTopic, runSession, simulatedIds } from './harness.mjs';
import { HOOK_DEBOUNCE_MS, claimList, decisionOf, optionOf, plannerContextOf, productWorld, providerBoundary, roleOf, stubAnswers } from './product.mjs';
import { actionContract } from '../../../packages/web/src/learn-tutor-actions.js';
import { ACTION_TYPES, PLANNER_SYSTEM, REASON_CODES, TRACE_SCHEMA_VERSION, TUTOR_PLANNER_VERSION } from '../../../packages/control-plane/src/agents/learn-tutor.js';
import { NEXT_STEPS_SYSTEM } from '../../../packages/control-plane/src/agents/learn-next-steps.js';
import { LEARN_TASKS, promptVersion } from '../../../packages/control-plane/src/learn-models.js';
import { fixtureFor } from '../../../packages/control-plane/src/learn-journey-fixtures.js';

const topic = loadTopic('logistic-regression');
const profiles = loadProfiles(), profile = profiles[0];
const taxonomy = loadTaxonomy();
const HERE = new URL('.', import.meta.url);

// The learner's moves for these runs: type, then follow the first hook whenever one is offered, typing otherwise.
const follower = (words = ['It squashes the score into a probability.', 'So the output is a probability, not a class.']) => {
  let typed = 0;
  return { reply: async ({ view }) => (view.options.length && typed ? { selected_option_id: view.options[0].id, response: { kind: 'acknowledge', text: '' } } : { selected_option_id: null, response: { kind: 'answer', text: words[typed++ % words.length] } }) };
};
// A whole simulated session on the real product, through runSession.
async function realSession({ answers = stubAnswers(), maxDecisions = 4, learner = follower() } = {}) {
  const boundary = providerBoundary(answers);
  try {
    const world = await productWorld({ topic, ids: simulatedIds({ runId: 'real', topic, profile }), boundary });
    try {
      const bundle = await runSession({ topic, profile, profiles, tutor: world.tutor, hooks: world.hooks, hookStart: world.hookStart, hookDelayMs: HOOK_DEBOUNCE_MS, materialize: world.materialize, learner, runId: 'real', maxDecisions });
      return { bundle, boundary, world };
    } finally { world.close(); }
  } finally { boundary.restore(); }
}
const roles = bundle => bundle.events.filter(event => event.type === 'model_call_completed').map(event => event.model_role);

test('the real product path: an LP1 journey through its route, typed turns through JEV and the planner, hooks through the controller and the route, a click as a next_step turn', async () => {
  const { bundle, boundary } = await realSession();
  assert.equal(bundle.simulator.stop_reason, 'max_decisions', bundle.simulator.error?.message);
  for (const event of bundle.events) assert.deepEqual(validateEvent(event), [], event.type);
  const steps = bundle.steps;
  assert.equal(steps.length, 4);
  // The journey was created by the LP1 route's own planners (session-level calls), every call through the boundary.
  for (const role of ['journey_diagnostic', 'journey_path', 'journey_section', 'jev', 'tutor']) assert.ok(roles(bundle).includes(role), role);
  assert.ok(roles(bundle).some(role => role.startsWith('tutor_next_steps')));
  assert.ok(bundle.events.filter(event => event.type === 'model_call_completed').every(event => event.transport === 'stub'));
  assert.deepEqual([boundary.blocked, boundary.errors], [[], []]);
  // Every decision carries the product's tutor_decision, as runTurn built it.
  for (const step of steps) {
    assert.equal(step.trace.trace_schema_version, TRACE_SCHEMA_VERSION);
    assert.deepEqual([step.trace.event, step.trace.versions.planner_version, step.trace.identity.mode, step.trace.identity.scope], ['tutor_decision', TUTOR_PLANNER_VERSION, 'journey', 'owned']);
    assert.deepEqual([step.trace.identity.user_id, step.trace.identity.canvas_id, step.trace.identity.journey_id], [bundle.session.user_id, bundle.session.canvas_id, step.journey_id]);
    assert.deepEqual(step.tutor_decision, decisionOf(step.trace)); // A2: renamed product fields, nothing computed
  }
  // The trace describes the request the planner really sent: its prompt_version is the hash of that request's system and tools.
  const sent = boundary.requests.filter(entry => entry.provider === 'anthropic' && roleOf(entry.body) === 'tutor').map(entry => entry.body);
  assert.deepEqual(await Promise.all(sent.map(body => promptVersion(body.system, body.tools))), steps.map(step => step.trace.versions.prompt_version));
  // Decision 2 answers the learner's typed words: JEV evaluated them before the plan (blocking), so the decision was made on
  // that evidence - the eval's snapshot is the product's derived claim states.
  const [, two, three] = steps;
  assert.equal(two.trigger, 'typed');
  assert.ok(two.trace.decision.evidence_transitions.length > 0);
  assert.notDeepEqual(stateMap(two.evidence_before), stateMap(steps[0].evidence_before));
  // Decision 3 is a hook click: the product's next_step turn, with no words, so no JEV request ran for it.
  assert.equal(three.trigger, 'hook');
  assert.equal(three.trace.decision.selected_next_step_id, three.learner_selected_option.id);
  assert.equal(three.trace.decision.route.intent, 'next_step');
  assert.deepEqual(three.trace.decision.next_step_options.map(option => option.suggestion_id), three.next_step_options.map(option => option.id));
  // The hook set is the HookSet the owned route minted; the eval's options are its fields, renamed (A1).
  const ready = bundle.events.filter(event => event.type === 'next_steps_ready' && event.options.length);
  assert.ok(ready.length >= 1);
  for (const event of ready) {
    assert.equal(event.trace.event, 'next_steps_computed');
    assert.deepEqual(event.trace.decision.next_step_options.map(o => [o.suggestion_id, o.position, o.hook, o.learning_goal]), event.options.map(o => [o.id, o.position, o.text, o.learning_goal]));
    assert.ok(event.options.every(option => option.set_id === event.trace.step_id));
  }
  const shown = bundle.events.filter(event => event.type === 'next_steps_shown');
  assert.equal(shown.length, ready.length);
  assert.ok(shown.every(event => event.trace.event === 'next_steps_shown' && event.trace.decision.shown_at));
  // Hooks start after the product's debounce, measured from the material the learner is reading.
  const started = bundle.events.find(event => event.type === 'next_steps_generation_started');
  const consumed = bundle.events.find(event => event.type === 'learner_consumption_started');
  assert.equal(started.t_ms - consumed.t_ms, HOOK_DEBOUNCE_MS);
  // The real anthropic() transport answered, as the product logs it (loggedModel): names and hashes only.
  assert.ok(boundary.logs.some(line => line.task === 'tutor' && line.status === 200));
});

test('the provider boundary: only the Anthropic and JEV hosts are answered, every other host is refused, and nothing reaches the network', async () => {
  const real = globalThis.fetch;
  let reached = 0;
  globalThis.fetch = async () => { reached++; throw Error('the network was reached'); }; // a tripwire under the boundary
  try {
    const { bundle, boundary } = await realSession({ maxDecisions: 2 });
    assert.equal(bundle.session.decisions, 2);
    assert.equal(reached, 0);
    assert.ok(boundary.requests.every(entry => !('headers' in entry))); // bodies only: no key is ever recorded
    const again = providerBoundary();
    try {
      for (const url of ['https://example.com/x', 'https://api.openai.com/v1/chat/completions', 'https://api.anthropic.com/v1/models']) await assert.rejects(fetch(url), { code: 'OUTBOUND_BLOCKED' });
      assert.equal(again.blocked.length, 3);
    } finally { again.restore(); }
    assert.equal(reached, 0);
  } finally { globalThis.fetch = real; }
});

// Seeded randomness and clock for the on/off comparison: ids the product mints (journey, hook set, decision) and timestamps.
function seeded(fn) {
  const RealDate = Date, { randomUUID, getRandomValues } = crypto;
  let n = 7, t = RealDate.UTC(2026, 9, 7, 12);
  const next = () => (n = (n * 1103515245 + 12345) >>> 0);
  crypto.randomUUID = () => { const h = Array.from({ length: 32 }, () => (next() & 15).toString(16)).join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`; };
  // The trace module draws its own ids (decision_id) from its own stream, so the ids the product mints - journeys, hook
  // sets - are the same whether or not a trace was built; with one shared stream they would shift by the trace's draws.
  let m = 11;
  const traceNext = () => (m = (m * 1103515245 + 12345) >>> 0);
  crypto.getRandomValues = array => { const draw = /learn-tutor-trace\.js/.test(Error().stack) ? traceNext : next; for (let i = 0; i < array.length; i++) array[i] = draw() & 0xff; return array; };
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [t += 7])); } static now() { return t += 7; } };
  return fn().finally(() => { Object.assign(crypto, { randomUUID, getRandomValues }); globalThis.Date = RealDate; });
}
async function turns(trace) {
  const boundary = providerBoundary(stubAnswers({ plan: context => ({ strategy: 'none', actions: [{ type: 'respond_text', text: `Row ${context.route?.row}: here is the idea.` }, ...(context.allowed_actions.includes('create_material') ? [{ type: 'create_material', command: context.available_materials[0].command, request: 'A short worked example.' }] : [])], reason_codes: ['advance_goal'], reason: 'Advance the section goal.' }) }));
  const meter = { call: () => {} };
  try {
    const world = await productWorld({ topic, ids: simulatedIds({ runId: 'onoff', topic, profile }), boundary, trace });
    try {
      await world.tutor.start(meter);
      const one = await world.tutor.decide({ kind: 'typed', text: 'What does the sigmoid do?' }, meter);
      const hooks = await world.hooks({}, meter);
      const two = await world.tutor.decide({ kind: 'hook', option: hooks.options[0] }, meter);
      const three = await world.tutor.decide({ kind: 'typed', text: 'So it is a probability.' }, meter);
      const product = [one, two, three].map(({ product: r }) => JSON.stringify({ actions: r.actions, contracts: r.contracts, text: r.text, reason_codes: r.reason_codes, reading: r.reading, states: r.states, transitions: r.transitions, route: r.routed, store: { ...r.store, session_id: null } }));
      return { requests: boundary.requests.map(entry => JSON.stringify(entry.body)), product, hooks: hooks.options, traces: [one, two, three].map(d => d.trace), hookTrace: hooks.trace, input: [one, two, three].map(d => d.tutor_input) };
    } finally { world.close(); }
  } finally { boundary.restore(); }
}

test('tracing on or off: the same provider requests byte for byte and the same product results', async () => {
  const on = await seeded(() => turns(true)), off = await seeded(() => turns(false));
  assert.ok(on.traces.every(Boolean) && on.hookTrace, 'tracing on built every event');
  assert.ok(off.traces.every(trace => trace === null) && off.hookTrace === null, 'tracing off built none');
  assert.equal(on.requests.length, off.requests.length);
  on.requests.forEach((body, i) => assert.equal(body, off.requests[i], `provider request ${i + 1}`));
  assert.deepEqual(on.product, off.product);
  // The hooks match too, ids included: the trace draws its own ids from its own stream.
  assert.deepEqual(on.hooks, off.hooks);
  // The hidden-profile check reads the learner-originated part of each planner request: the words, none on a click.
  assert.deepEqual(on.input.map(list => list.map(entry => entry.learner)), [['What does the sigmoid do?'], [''], ['So it is a probability.']]);
  assert.ok(on.input[2][0].turns.includes('What does the sigmoid do?'));
});

test('the production validators and escalations run, as no eval copy could: a dropped action and an escalated hook set', async () => {
  // The planner proposes an action its route does not allow; the hook planner's routine reply names a format, and its
  // escalation answers with the product's own fixture set. JEV stays unsettled, so no claim contradicts itself.
  const answers = stubAnswers({
    plan: () => ({ strategy: 'none', actions: [{ type: 'respond_text', text: 'Here it is.' }, { type: 'return_from_dive' }], reason_codes: ['advance_goal'], reason: 'Advance.' }),
    hooks: (input, body) => (body.model === LEARN_TASKS.tutor_next_steps.model
      ? { options: [1, 2, 3].map(i => ({ hook: `Watch a quiz about part ${i} of this idea`, learning_goal: `Goal ${i}`, concept_ids: [], claim_ids: [], reason_internal: 'routine' })) }
      : fixtureFor('suggest_next_steps', input)),
    jev: request => ({ answers: Object.fromEntries(Object.keys(request.questions || {}).map(key => [key, { type: 'noul', noul: 0.5 }])) }),
  });
  const { bundle } = await realSession({ answers, maxDecisions: 2 });
  const [one] = bundle.steps;
  assert.equal(one.trace.runtime.validation.ok, false);
  assert.ok(one.trace.runtime.validation.dropped_actions >= 1);
  assert.ok(!one.trace.decision.actions.some(action => action.action_type === 'return_from_dive'));
  const computed = bundle.events.find(event => event.type === 'next_steps_ready' && event.trace).trace;
  assert.deepEqual([computed.runtime.model.escalated, computed.runtime.model.calls, computed.runtime.validation.fallback, computed.versions.model_role], [true, 2, 'escalated:validator', 'tutor_next_steps_escalation']);
  // The product's hook validator named what it refused (rule names only): a command opening and a hook with no ids.
  assert.deepEqual(computed.runtime.validation.repairs.filter(rule => ['command', 'ungrounded'].includes(rule)), ['command', 'ungrounded']);
  assert.deepEqual(roles(bundle).filter(role => role.startsWith('tutor_next_steps')), ['tutor_next_steps', 'tutor_next_steps_escalation']);
});

test('a Tutor question waiting for an answer is not a stopping point: no hooks, so the learner types', async () => {
  const answers = stubAnswers({ plan: context => ({ strategy: 'socrates', actions: [{ type: 'ask_question', text: 'What would the output be for a very large score?', claim: context.relevant_evidence?.[0]?.claim ?? context.allowed_claims?.[0], purpose: 'check' }], reason_codes: ['check_understanding'], reason: 'Check the idea.' }) });
  const { bundle } = await realSession({ answers, maxDecisions: 2 });
  assert.ok(bundle.steps[0].trace.decision.actions.some(action => action.action_type === 'ask_question'), JSON.stringify(bundle.steps[0].trace.runtime.validation));
  assert.equal(bundle.events.filter(event => event.type === 'next_steps_generation_started').length, 0);
  assert.equal(bundle.steps[1].trigger, 'typed');
});

// ---------- No Tutor logic in the evaluator ----------

const SOURCES = readdirSync(HERE).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map(name => [name, readFileSync(new URL(name, HERE), 'utf8')]);

test('no Tutor logic is copied into the evaluator: production functions are imported, never redefined, and no prompt or vocabulary is pasted', () => {
  const product = Object.fromEntries(SOURCES)['product.mjs'];
  // The real path is imported from the product modules.
  for (const [name, module] of [['runTurn', 'web/src/learn-tutor.js'], ['tutorRoute', 'control-plane/src/learn-tutor-routes.js'], ['journeyRoute', 'control-plane/src/learn-journey.js'], ['nextStepsController', 'web/src/learn-next-steps.js'], ['nextStepsInput', 'web/src/learn-next-steps.js'], ['stoppingPoint', 'web/src/learn-next-steps.js'], ['hooksEvent', 'web/src/learn-tutor-trace.js'], ['shownEvent', 'web/src/learn-tutor-trace.js'], ['tutorContext', 'web/src/learn-tutor-domains.js'], ['modalityOf', 'web/src/learn-tutor-actions.js']]) {
    assert.match(product, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\.\\./\\.\\./\\.\\./packages/${module.replace(/[.]/g, '\\.')}'`), `${name} from ${module}`);
  }
  assert.match(product, /export \{ turnOffers \} from '\.\/LearnTutor\.jsx'/); // the page's own offers, bundled
  // No eval source defines a function the Tutor, the hooks, the evidence path or the trace already has.
  const PRODUCT_FUNCTIONS = ['route', 'plannerContext', 'buildTurn', 'validateActions', 'enforce', 'deriveClaimStates', 'claimState', 'evaluateFreeText', 'jevRung', 'planTurn', 'planOnce', 'plannerTier', 'fastPlanProblem', 'plannerRequest', 'learnerIntent', 'criticalPath', 'evaluationSpec', 'turnClaims', 'nextStepsOutput', 'hookProblem', 'trimToFit', 'nextStepsScope', 'planNextSteps', 'mintSet', 'nextStepsBasis', 'goalOf', 'decisionEvent', 'actionContract', 'modalityOf', 'reasonCodes', 'journeyStep', 'turnOffers', 'tutorContext', 'journeyDomain', 'canvasDomain'];
  for (const [file, text] of SOURCES) for (const name of PRODUCT_FUNCTIONS) assert.doesNotMatch(text, new RegExp(`(?:function\\*?|const|let|var)\\s+${name}\\s*[=(]`), `${file} defines ${name}`);
  // No product prompt line, action list or reason-code list is pasted into the evaluator.
  const lines = [...PLANNER_SYSTEM.split('\n'), ...String(NEXT_STEPS_SYSTEM.text ?? NEXT_STEPS_SYSTEM).split('\n')].filter(line => line.length >= 40);
  assert.ok(lines.length > 20);
  for (const [file, text] of SOURCES) {
    for (const line of lines) assert.ok(!text.includes(line), `${file} pastes a product prompt line: ${line.slice(0, 50)}`);
    assert.ok(!text.includes(REASON_CODES.slice(0, 4).map(code => `'${code}'`).join(', ')), `${file} pastes REASON_CODES`);
    assert.ok(!text.includes(ACTION_TYPES.slice(0, 4).map(code => `'${code}'`).join(', ')), `${file} pastes ACTION_TYPES`);
  }
});

test('the eval taxonomy is keyed by product names: reason checks only for product codes, and active or passive as the product expects evidence', () => {
  for (const code of Object.keys(taxonomy.reason_codes)) assert.ok(REASON_CODES.includes(code), code);
  // A shown card of each block type: the product's own contract says whether it expects evidence (active) or nothing (passive).
  const domain = { cardType: () => null, targetClaims: () => ['k1'], claims: { k1: { concept: 'c1' } }, concepts: { c1: {} } };
  const contractOf = (action, modality) => actionContract(action, { domain: { ...domain, cardType: () => modality }, claims: ['k1'] });
  const OWN = { text: { type: 'respond_text', text: 'x' }, question: { type: 'ask_question', claim: 'k1' }, explain_back: { type: 'ask_question', claim: 'k1', purpose: 'explain_back' }, practice: { type: 'suggest_practice', card: 'x' }, depth: { type: 'suggest_depth', card: 'x' }, rabbit_hole: { type: 'suggest_dive' }, avatar: { type: 'suggest_avatar_clip' } };
  for (const [modality, label] of Object.entries(taxonomy.modalities)) {
    const contract = contractOf(OWN[modality] ?? { type: 'show_authored_card', card: 'x' }, modality);
    assert.equal(contract.modality, modality, `${modality} is a product modality name`);
    assert.equal(contract.expected_evidence.length > 0 ? 'active' : 'passive', label.mode, `${modality} mode`);
  }
});

test('mapping helpers rename product fields only (A1, A2, A6): HookSet options, the decision, the claim snapshot', () => {
  const set = { set_id: 'ns_0a1b2c3d', options: [1, 2, 3].map(i => ({ id: `ns_0a1b2c3d.${i}`, hook: `Hook ${i}?`, selected_next_step: { v: 1, learning_goal: `goal ${i}`, concept_ids: ['c1'], claim_ids: ['k1'] } })) };
  assert.deepEqual(set.options.map(optionOf(set))[1], { id: 'ns_0a1b2c3d.2', position: 2, text: 'Hook 2?', set_id: 'ns_0a1b2c3d', learning_goal: 'goal 2', concept_ids: ['c1'], claim_ids: ['k1'] });
  assert.deepEqual(claimList({ k1: { concept: 'c1', claim: 'k1', state: 'uncertain', basis: [3] } }), [{ concept: 'c1', claim: 'k1', state: 'uncertain' }]);
  // The routine and escalation hook roles share a tool and differ by model; an unknown tool is unknown, never guessed.
  assert.equal(roleOf({ tools: [{ name: 'suggest_next_steps' }], model: LEARN_TASKS.tutor_next_steps.model }), 'tutor_next_steps');
  assert.equal(roleOf({ tools: [{ name: 'suggest_next_steps' }], model: LEARN_TASKS.tutor_next_steps_escalation.model }), 'tutor_next_steps_escalation');
  assert.equal(roleOf({ tools: [{ name: 'something_else' }], model: 'm' }), 'unknown');
  assert.deepEqual(plannerContextOf({ messages: [{ content: 'Compose this turn.\n\ncontext = {"a":1}' }] }), { a: 1 });
});
