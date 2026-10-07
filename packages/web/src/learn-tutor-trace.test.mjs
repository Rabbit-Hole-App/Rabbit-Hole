// Tutor v2 turn trace: one trace_id, per-stage timing, status and result category. TutorDecisionEvent v1 below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { turnTrace, decisionEvent, hooksEvent, shownEvent, emitDecision, addSink, tracing, harnessSink, newSessionId, inputSummary, ROW_REASON } from './learn-tutor-trace.js';
import { runTurn } from './learn-tutor.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { journeyDomain } from './learn-journey-domain.js';
import { NANOGPT } from './learn-tutor-claims.js';
import { TIDES } from './__fixtures__/journey-synthetic-domains.mjs';
import { REASON_CODES, TRACE_SCHEMA_VERSION, TUTOR_PLANNER_VERSION } from '../../control-plane/src/agents/learn-tutor.js';

test('stages record ok, error and timeout; errors are rethrown; marks are offsets', async () => {
  let clock = 0;
  const tracer = turnTrace(() => clock);
  assert.deepEqual(tracer.step('router', () => { clock += 2; return { row: 'gap' }; }, value => value.row), { row: 'gap' }, 'a sync stage stays sync');
  await assert.rejects(tracer.step('planner', async () => { clock += 5; throw new Error('The tutor timed out'); }));
  assert.throws(() => tracer.step('evaluate', () => { throw new Error('500'); }));
  tracer.add('jev', 120, 'ok', 'settled');
  tracer.mark('first_visible_response');
  const { trace } = tracer;
  assert.match(trace.trace_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(trace.stages.map(stage => [stage.stage, stage.status, stage.result, stage.ms]), [
    ['router', 'ok', 'gap', 2], ['planner', 'timeout', 'The tutor timed out', 5], ['evaluate', 'error', '500', 0], ['jev', 'ok', 'settled', 120],
  ]);
  assert.equal(trace.marks.first_visible_response, 7);
});

// ---------- TutorDecisionEvent v1 (docs/features/professor-next-steps.md §3; owner 2026-10-06, third message) ----------

const KEYS = ['trace_schema_version', 'event', 'decision_id', 'step_id', 'generated_at', 'identity', 'versions', 'decision', 'runtime', 'flags'];
const IDENTITY = ['user_id', 'session_id', 'canvas_id', 'board_id', 'canvas_version', 'journey_id', 'section_id', 'dive_id', 'source', 'scope', 'mode'];
const VERSIONS = ['planner_version', 'prompt_version', 'model_role', 'model_id'];
const DECISION = ['current_goal', 'current_section_id', 'target_concept_ids', 'target_claim_ids', 'evidence_summary', 'evidence_transitions', 'canvas_summary', 'recent_modality_history', 'next_step_options', 'shown_at', 'selected_next_step_id', 'selected_at', 'route', 'chosen_action', 'actions', 'reason_codes', 'reason_source', 'rationale_summary', 'expected_evidence', 'estimated_learning_seconds'];
const RUNTIME = ['timing', 'model', 'usage', 'validation', 'planner_input'];
const ACTION = ['action_type', 'command', 'modality', 'target_concept_ids', 'target_claim_ids'];
const EVIDENCE = ['understood', 'uncertain', 'misconception', 'prerequisite_gap', 'not_yet_observed'];
const QUESTION = 'why would a narrow estuary make the tide so much bigger';
const C = TIDES.diagnostic.registry.claims, IDS = Object.keys(C).slice(0, 2);
const J = { id: 'lj_t', state: 'active', registry: TIDES.diagnostic.registry, evidence: { seq: 0, events: [] }, active_section_id: 's1', request: { topic: TIDES.topic }, intake: { slots: {} } };
const PATH = { version: 1, goal: 'Understand tidal power', sections: [{ id: 's1', title: 'Ranges', purpose: 'p', status: 'current', expected_evidence: IDS.map(claim => ({ claim, kind: 'explain' })) }] };
const domain = journeyDomain({ journey: J, path: PATH, blocks: [] });
const PLAN = { strategy: 'feynman', constraints_add: [], actions: [{ type: 'respond_text', text: 'The bay funnels the water.' }, { type: 'ask_question', text: 'What would a wider bay do?', claim: IDS[0], purpose: 'explain_back' }],
  reason_codes: ['vary_modality'], reason: 'An explain-back makes the funnel idea observable. It follows two explanations. A third sentence is cut.',
  telemetry: { tier: 'fast', escalated: null, served_model: 'claude-sonnet-5-5', input_tokens: 900, output_tokens: 80, cost_usd: 0.0026, prompt_version: 'abcdef012345' } };
const worker = (plan = PLAN) => {
  const sent = [];
  const post = async (path, body) => { sent.push({ path, body }); return path === '/api/learn/tutor/plan' ? structuredClone(plan) : { status: 'error', evaluator: 'jev', events: [] }; };
  return { sent, post };
};
const turn = (extra = {}, plan = PLAN) => {
  const w = worker(plan);
  return runTurn({ raw: QUESTION, canvas: { app: 'canvas-1', board: 'main' }, access: { app: 'canvas-1' }, block: null, store: { ...emptyStore(), session_id: 'ts_00000000000000aa', modalities: ['text', 'text'] }, post: w.post, domain, turnId: 'turn-1', ...extra }).then(r => ({ ...r, sent: w.sent }));
};
// Two runs differ only in timings, fresh uuids (ask_question action ids) and the timing trace; everything else must match.
const VOLATILE = new Set(['trace', 'mark', 'ms', 'action_id', 'started_at', 'trace_id']);
const strip = r => JSON.parse(JSON.stringify(r, (key, value) => (VOLATILE.has(key) ? undefined : value)));
const errors = () => globalThis.__smallTutorTraceErrors || 0;

// Owner extra test 12c and the coordinator regression: tracing on or off, the same requests and results.
test('trace on or off: identical planner requests and identical results; no trace key when off', async () => {
  const off = await turn(), on = await turn({ trace: { identity: { user_id: 'u-7' } } }), bare = await turn({ trace: true });
  assert.equal(JSON.stringify(on.sent), JSON.stringify(off.sent), 'byte-identical requests (the turn id is fixed)');
  assert.equal(JSON.stringify(bare.sent), JSON.stringify(off.sent));
  assert.deepEqual(strip(on), strip(off));
  assert.deepEqual(strip(bare), strip(off));
  assert.equal('trace' in off, false);
  assert.equal(on.trace.event, 'tutor_decision');
});

// Owner extra test 12e: the event captures the chosen action, modality and reason codes, from the production contract.
test('tutor_decision: exactly the contract keys, the chosen action from the contracts, reason codes with the vary_modality guard', async () => {
  const blocks = [{ id: 'x', type: 'explanation', title: 'Range', journey: { journey_id: 'lj_t', section_id: 's1', step_id: 'x', claims: [IDS[1]] } }, { id: 'y', type: 'heading', text: 'h' }];
  const r = await turn({ domain: journeyDomain({ journey: J, path: PATH, blocks }), trace: { identity: { user_id: 'u-7', canvas_version: 12 }, blocks } }), e = r.trace;
  assert.deepEqual(Object.keys(e), KEYS);
  assert.deepEqual([Object.keys(e.identity), Object.keys(e.versions), Object.keys(e.decision), Object.keys(e.runtime)], [IDENTITY, VERSIONS, DECISION, RUNTIME]);
  assert.deepEqual(Object.keys(e.decision.evidence_summary), EVIDENCE);
  assert.equal(e.runtime.planner_input, null, 'trim counts belong to hook recomputes only');
  assert.deepEqual(e.decision.actions.map(a => Object.keys(a)), [ACTION, ACTION]);
  assert.deepEqual(Object.keys(e.decision.chosen_action), ACTION);
  assert.deepEqual([e.trace_schema_version, TRACE_SCHEMA_VERSION, TUTOR_PLANNER_VERSION], [1, 1, 'tutor-planner-1']);
  assert.match(e.decision_id, /^td_[0-9a-f]{16}$/);
  assert.ok(!Number.isNaN(Date.parse(e.generated_at)));
  assert.deepEqual(e.identity, { user_id: 'u-7', session_id: 'ts_00000000000000aa', canvas_id: 'canvas-1', board_id: 'main', canvas_version: 12, journey_id: 'lj_t', section_id: 's1', dive_id: null, source: null, scope: 'owned', mode: 'journey' });
  assert.equal(e.step_id, 'turn-1');
  // Consumed, never recomputed: the actions are the turn's contracts minus their per-action evidence and time.
  assert.deepEqual(e.decision.actions, r.contracts.map(({ action_type, command, modality, target_concept_ids, target_claim_ids }) => ({ action_type, command, modality, target_concept_ids, target_claim_ids })));
  assert.deepEqual(e.decision.chosen_action, { action_type: 'ask_question', command: null, modality: 'explain_back', target_concept_ids: [C[IDS[0]].concept], target_claim_ids: [IDS[0]] });
  assert.deepEqual(e.decision.actions.map(a => [a.action_type, a.modality]), [['respond_text', 'text'], ['ask_question', 'explain_back']]);
  assert.deepEqual([e.decision.reason_codes, e.decision.reason_source, e.flags], [['advance_goal', 'vary_modality'], 'planner', ['vary_modality_alone']]);
  assert.ok(e.decision.reason_codes.every(code => REASON_CODES.includes(code)));
  assert.equal(e.decision.rationale_summary, 'An explain-back makes the funnel idea observable. It follows two explanations.');
  assert.deepEqual(e.decision.route, { row: 'not_yet_observed', strategy: 'feynman', intent: 'question' });
  assert.deepEqual(e.decision.recent_modality_history, ['text', 'text']);
  assert.deepEqual(e.decision.expected_evidence, [{ claim_id: IDS[0], via: 'explain_back' }]);
  assert.equal(e.decision.estimated_learning_seconds, 125, 'the contracts summed: a 5-word reply (5 s) and an Explain Back (120 s)');
  assert.deepEqual([e.decision.target_claim_ids, e.decision.target_concept_ids], [r.bench.claims, [...new Set(r.bench.claims.map(id => C[id].concept))]]);
  assert.deepEqual(e.decision.evidence_summary, { understood: [], uncertain: [], misconception: [], prerequisite_gap: [], not_yet_observed: r.turn.evidence.map(state => state.claim) });
  assert.deepEqual(e.decision.canvas_summary, { blocks: 2, kinds: { explanation: 1, heading: 1 }, presented_claim_ids: [IDS[1]] });
  assert.deepEqual([e.decision.current_goal, e.decision.current_section_id, e.decision.next_step_options, e.decision.selected_next_step_id], [{ id: null, summary: 'Understand tidal power' }, 's1', [], null]);
  assert.deepEqual([e.decision.selected_at, e.decision.shown_at, e.decision.evidence_transitions], [null, null, []], 'a typed turn: no click, no impression, no state change here');
  assert.deepEqual(e.versions, { planner_version: TUTOR_PLANNER_VERSION, prompt_version: 'abcdef012345', model_role: 'tutor', model_id: 'claude-sonnet-5-5' });
  assert.deepEqual(e.runtime.usage, { input_tokens: 900, output_tokens: 80, cache_creation_input_tokens: null, cache_read_input_tokens: null, cost_usd: 0.0026 }, 'cache counts not reported: null');
  assert.deepEqual(e.runtime.model, { tier: 'fast', escalated: false, calls: 1 });
  assert.deepEqual(e.runtime.validation, { ok: true, dropped_actions: 0, repairs: [], fallback: null });
  assert.deepEqual([typeof e.runtime.timing.total_ms, typeof e.runtime.timing.planner_ms, typeof e.runtime.timing.first_text_ms], ['number', 'number', 'number']);
});

test('reason codes: the planner codes as given; none -> the route row code (reason_source router, fallback router_reason)', async () => {
  const two = await turn({ trace: true }, { ...PLAN, reason_codes: ['increase_interactivity', 'vary_modality'] });
  assert.deepEqual([two.trace.decision.reason_codes, two.trace.decision.reason_source, two.trace.flags], [['increase_interactivity', 'vary_modality'], 'planner', []]);
  const none = await turn({ trace: true }, { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'ok' }] });
  assert.deepEqual([none.trace.decision.reason_codes, none.trace.decision.reason_source, none.trace.runtime.validation.fallback], [['advance_goal'], 'router', 'router_reason']);
  assert.deepEqual([none.trace.versions.prompt_version, none.trace.versions.model_id, none.trace.runtime.usage.cost_usd, none.trace.decision.rationale_summary], [null, null, null, null], 'no telemetry: unknown, never 0');
  assert.deepEqual(none.trace.runtime.usage, { input_tokens: null, output_tokens: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, cost_usd: null }, 'no usage reported: null token counts, never 0');
  assert.deepEqual(Object.keys(ROW_REASON).filter(row => !REASON_CODES.includes(ROW_REASON[row])), [], 'every row code is a generic reason code');
  assert.equal(Object.values(ROW_REASON).includes('vary_modality'), false);
});

test('validation: dropped actions, repairs by rule name, and fallback from an escalation or a lost tail', async () => {
  const plan = { ...PLAN, actions: [{ type: 'respond_text', text: 'Look.' }, { type: 'show_authored_card', card: 'nope', mode: 'suggest' }, { type: 'open_dive', concept: 'x' }],
    telemetry: { tier: 'opus', escalated: 'an action outside the allowed types', served_model: 'claude-opus-5-5', input_tokens: 2000, output_tokens: 100, cost_usd: 0.01, prompt_version: 'abcdef012345', fast: { input_tokens: 900, output_tokens: 40, cost_usd: 0.0022 } } };
  const e = (await turn({ trace: true }, plan)).trace;
  assert.equal(e.runtime.validation.dropped_actions, 2);
  assert.deepEqual([e.runtime.validation.ok, e.runtime.validation.fallback], [false, 'escalated:invalid_plan']);
  assert.deepEqual(e.runtime.model, { tier: 'opus', escalated: true, calls: 2 });
  assert.deepEqual(e.runtime.usage, { input_tokens: 2900, output_tokens: 140, cache_creation_input_tokens: null, cache_read_input_tokens: null, cost_usd: 0.0122 }, 'both calls counted');
  const lost = (await turn({ trace: true }, { ...PLAN, reason: null, reason_codes: null, telemetry: { ...PLAN.telemetry, tail_lost: true } })).trace;
  assert.deepEqual([lost.runtime.validation.fallback, lost.decision.reason_source, lost.decision.rationale_summary], ['tail_lost', 'router', null]);
});

// Review fix 7: the fallback is a low-cardinality category, never upstream error text.
test('validation.fallback: escalated:<category> for every planner escalation reason; an API error message never reaches the event', async () => {
  const reasons = [['an action outside the allowed types', 'invalid_plan'], ['no words', 'no_words'], ['The tutor returned no turn', 'no_tool'],
    ['The tutor is unavailable (model HTTP 529: Overloaded upstream-detail-7f3a for org acme)', 'model_error'], ['fetch failed: socket hang up upstream-detail-7f3a', 'model_error']];
  for (const [escalated, category] of reasons) {
    const e = (await turn({ trace: true }, { ...PLAN, telemetry: { ...PLAN.telemetry, tier: 'opus', escalated } })).trace;
    assert.equal(e.runtime.validation.fallback, `escalated:${category}`, escalated);
    assert.equal(/upstream-detail|socket|HTTP 529|acme/.test(JSON.stringify(e)), false, escalated);
  }
  for (const escalated of ['no_tool', 'validator', 'ambiguous', 'contradictory']) assert.equal(hooksEvent({ ...SET, telemetry: { ...SET.telemetry, escalated } }, { input: INPUT }).runtime.validation.fallback, `escalated:${escalated}`);
  assert.equal(hooksEvent({ ...SET, telemetry: { ...SET.telemetry, escalated: 'The next steps planner is unavailable (model HTTP 500: upstream-detail-7f3a)' } }, { input: INPUT }).runtime.validation.fallback, 'escalated:model_error');
});

// Review fixes 1 (rounds 1 and 2): a message of two to four words is not covered by the five-word rule, so the whole
// message is checked too, word by word (the learning-goal normalization): punctuation, case and spacing never hide it, and a
// one-word reply is never treated as quotable.
const built = (turnOver = {}, extra = {}) => decisionEvent({ result: { turn: { turn_id: 't', raw_user_message: '', canvas: { app: 'c', board: 'main' }, evidence: [], ...turnOver }, store: emptyStore(), contracts: [], bench: {}, ...extra }, domain });
test('a short learner message quoted in the rationale is dropped as rationale_dropped, whatever its punctuation or spacing; one-word replies and unrelated rationales are kept', () => {
  const quoted = [['quiz me on softmax', 'The learner said quiz me on softmax.'], ['Show me the basin', 'They wrote show me the basin, so a card helps.'], ['Quiz me on softmax?', 'The learner said quiz me on softmax.'],
    ['what is softmax?', 'They asked what is softmax, so a definition comes first.'], ['show  me   the basin', 'They wrote show me the basin.']];
  for (const [raw, reason] of quoted) {
    const e = built({ raw_user_message: raw }, { response: { reason } });
    assert.deepEqual([e.decision.rationale_summary, e.runtime.validation.repairs], [null, ['rationale_dropped']], raw);
  }
  for (const [raw, reason] of [['no', 'This helps the learner now.'], ['ok', 'A short look makes the idea observable.'], ['quiz me on softmax', 'A short check makes the idea observable.'], ['what is softmax?', 'Softmax is what the next card shows.']]) {
    const kept = built({ raw_user_message: raw }, { response: { reason } });
    assert.deepEqual([kept.decision.rationale_summary, kept.runtime.validation.repairs], [reason, []], raw);
  }
});

// Review fix 2: with no planner codes, a hook click is the learner following an interest; a slash names its own move.
test('router codes: a hook click leads with follow_learner_interest (never beside respond_to_question); deeper and simplify name their move', async () => {
  const step = SET.options[1].selected_next_step, words = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Here is a way in.' }] };
  const click = (plan, d = domain, nextStep = step) => runTurn({ raw: '', nextStep, materials: [], canvas: { app: 'canvas-1', board: 'main' }, access: { app: 'canvas-1' }, block: null, store: emptyStore(), post: worker(plan).post, domain: d, trace: true });
  const onRow = await click(words);
  assert.deepEqual([onRow.routed.row, onRow.trace.decision.reason_codes, onRow.trace.decision.reason_source, onRow.trace.runtime.validation.fallback], ['not_yet_observed', ['follow_learner_interest', 'advance_goal'], 'router', 'router_reason']);
  const offSlice = await click(words, NANOGPT, { ...step, claim_ids: [] });
  assert.deepEqual([offSlice.routed.row, offSlice.trace.decision.reason_codes], ['off_slice', ['follow_learner_interest']]);
  const vary = await click({ ...words, reason_codes: ['vary_modality'] });
  assert.deepEqual([vary.trace.decision.reason_codes, vary.trace.decision.reason_source, vary.trace.flags], [['follow_learner_interest', 'advance_goal', 'vary_modality'], 'planner', ['vary_modality_alone']]);
  const planned = await click({ ...words, reason_codes: ['test_transfer'] });
  assert.deepEqual([planned.trace.decision.reason_codes, planned.trace.decision.reason_source], [['test_transfer'], 'planner'], 'planner codes stand as given');
  for (const [slash, code] of [['deeper', 'deepen_mechanism'], ['simplify', 'reduce_cognitive_load']]) {
    const e = built({ slash }, { routed: { row: 'slash', strategy: 'none' } });
    assert.deepEqual([e.decision.reason_codes, e.decision.reason_source], [[code], 'router'], slash);
  }
  assert.deepEqual(built({}, { routed: { row: 'off_slice', strategy: 'none' } }).decision.reason_codes, ['respond_to_question'], 'a typed off-slice question keeps its code');
});

// Review fix 3: an event shares no object with the result or the HookSet it was built from.
test('events are deep copies: a sink that mutates an event never changes the contracts, the claims or the live HookSet', async () => {
  const step = SET.options[1].selected_next_step;
  const plan = { strategy: 'feynman', constraints_add: [], reason_codes: ['advance_goal'], actions: [{ type: 'respond_text', text: 'Try this.' }, { type: 'ask_question', text: 'Say it back?', claim: step.claim_ids[0], purpose: 'explain_back' }, { type: 'create_material', command: 'animate', request: 'a basin filling' }] };
  const r = await runTurn({ raw: '', nextStep: step, materials: [{ command: 'animate', cards: ['mathAnimation'], paid: true }], canvas: { app: 'canvas-1', board: 'main' }, access: { app: 'canvas-1' }, block: null, store: emptyStore(), post: worker(plan).post, domain, trace: { next_step_options: SET.options } });
  const contracts = structuredClone(r.contracts), claims = [...r.bench.claims], options = structuredClone(SET.options), set = structuredClone(SET), input = structuredClone(INPUT);
  assert.ok(r.trace.decision.expected_evidence.length && r.trace.decision.next_step_options.length);
  const before = errors(), mutated = [];
  const remove = addSink(e => {
    if (e.event === 'tutor_decision') {
      for (const a of [...e.decision.actions, e.decision.chosen_action]) { a.target_claim_ids.push('x'); a.target_concept_ids.push('x'); }
      for (const x of e.decision.expected_evidence) x.via = 'mutated';
    }
    // Both events: the hooks they carry, the goal and the targets.
    for (const o of e.decision.next_step_options) { o.suggestion_id = 'z'; o.set_id = 'z'; o.position = 9; o.hook = 'z'; o.learning_goal = 'z'; o.claim_ids.push('z'); o.concept_ids.push('z'); }
    e.decision.current_goal.summary = 'mutated';
    e.decision.target_claim_ids.push('w');
    e.decision.target_concept_ids.push('w');
    e.decision.recent_modality_history.push('w');
    e.decision.canvas_summary.presented_claim_ids.push('w');
    mutated.push(e.event);
  });
  emitDecision(r.trace);
  emitDecision(hooksEvent(SET, { input: INPUT }));
  await new Promise(resolve => setImmediate(resolve));
  remove();
  assert.deepEqual([mutated, errors()], [['tutor_decision', 'next_steps_computed'], before], 'the sink mutated both events and never threw');
  assert.deepEqual(r.contracts, contracts);
  assert.deepEqual(r.bench.claims, claims);
  assert.deepEqual(SET.options, options);
  assert.deepEqual(SET, set);
  assert.deepEqual(INPUT, input);
});

// Coordinator item 5: no learner words, prompts or chat history in an event.
test('an event never carries the learner question, the store turns or a prompt; a quoting rationale is dropped as a repair', async () => {
  const store = { ...emptyStore(), turns: [{ learner: 'an earlier private question about my notes', tutor: 'an earlier reply' }] };
  const { trace: e } = await turn({ trace: true, store });
  const text = JSON.stringify(e);
  for (const forbidden of [QUESTION, 'earlier private question', 'an earlier reply', 'Compose this turn', 'The bay funnels the water', 'What would a wider bay do']) assert.equal(text.includes(forbidden), false, forbidden);
  assert.equal(/raw_user_message|learner_intent|recent_turns|reason_internal|statement|misconceptions/.test(text), false);
  const quoting = (await turn({ trace: true }, { ...PLAN, reason: `They asked ${QUESTION}.` })).trace;
  assert.equal(quoting.decision.rationale_summary, null);
  assert.deepEqual(quoting.runtime.validation.repairs, ['rationale_dropped']);
  assert.equal(JSON.stringify(quoting).includes(QUESTION), false);
});

// Coordinator item 1: telemetry failure never fails or changes a turn or a recompute.
test('a builder that throws: the turn succeeds unchanged, trace null, the error counted', async () => {
  const before = errors();
  const boom = { identity: { get user_id() { throw new Error('boom'); } } };
  const off = await turn(), broken = await turn({ trace: boom }), worse = await turn({ trace: { get identity() { throw new Error('boom'); } } });
  assert.deepEqual([broken.trace, worse.trace], [null, null]);
  assert.deepEqual(strip(broken), strip(off));
  assert.deepEqual(strip(worse), strip(off));
  assert.equal(errors(), before + 2);
  assert.equal(hooksEvent(null, { identity: boom.identity }), null, 'the hook builder never throws either');
  assert.equal(errors(), before + 3);
});

test('emitDecision: sinks run after the fact; a throwing or rejecting sink is swallowed and counted; null is ignored', async () => {
  const before = errors(), got = [];
  const removes = [addSink(() => { throw new Error('sync'); }), addSink(async () => { throw new Error('async'); }), addSink(event => { got.push(event); })];
  assert.equal(tracing(), true);
  assert.doesNotThrow(() => emitDecision({ event: 'tutor_decision' }));
  assert.doesNotThrow(() => emitDecision(null));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(got, [{ event: 'tutor_decision' }]);
  assert.equal(errors(), before + 2);
  removes.forEach(remove => remove());
  assert.equal(tracing(), false);
});

test('harnessSink: the newest 500, a small:tutor-trace event, user_id from /api/me, never the email', async () => {
  const target = { dispatchEvent: e => { target.last = e; return true; } };
  const sink = harnessSink({ target, me: async () => ({ user_id: 'u-42', email: 'learner@example.org' }) });
  for (let i = 0; i < 502; i++) await sink({ event: 'tutor_decision', step_id: String(i), identity: { user_id: null } });
  assert.equal(target.__smallTutorTraces.length, 500);
  assert.equal(target.__smallTutorTraces[0].step_id, '2');
  assert.equal(target.__smallTutorTraces.at(-1).identity.user_id, 'u-42');
  assert.equal(JSON.stringify(target.__smallTutorTraces).includes('learner@example.org'), false);
  assert.deepEqual([target.last.type, target.last.detail.step_id], ['small:tutor-trace', '501']);
  const signedOut = {};
  await harnessSink({ target: signedOut, me: async () => null })({ event: 'x', identity: { user_id: null } });
  assert.equal(signedOut.__smallTutorTraces[0].identity.user_id, null);
});

const SET = { set_id: 'ns_01020304', generated_at: '2026-10-06T10:00:00.000Z', basis: 'b', options: [1, 2, 3].map(n => ({ id: `ns_01020304.${n}`, hook: `Hook number ${n} for tides?`, selected_next_step: { v: 1, set_id: 'ns_01020304', suggestion_id: `ns_01020304.${n}`, basis: 'b', hook: `Hook number ${n} for tides?`, learning_goal: `goal ${n}`, concept_ids: [], claim_ids: [IDS[n % 2]], scope: 'owned' } })),
  telemetry: { tier: 'routine', escalated: null, calls: 1, ms: 900, planner_version: 'next-steps-planner-1', model_role: 'tutor_next_steps', model_id: 'claude-sonnet-5-5', prompt_version: '0123456789ab', usage: { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, cost_usd: 0.008, reasons: 3, errors: [], cached: false } };
// Owner tenth message: every option as its structured identity, its set and its position on screen (1-3, in order).
const OPTIONS = SET.options.map((o, i) => ({ suggestion_id: o.id, set_id: 'ns_01020304', position: i + 1, hook: o.hook, learning_goal: o.selected_next_step.learning_goal, concept_ids: [], claim_ids: o.selected_next_step.claim_ids }));
const INPUT = { mode: 'journey', goal: 'Understand tidal power', path: { current: { id: 's1' } }, scope: { concepts: {}, claims: { [IDS[0]]: { concept: 'x', state: 'uncertain' }, [IDS[1]]: { concept: 'y', state: 'not_yet_observed' } } },
  canvas: { blocks: [{ id: 'k', kind: 'Explanation', claim_ids: [IDS[0]] }] }, recent: { kind: 'question', question: QUESTION, modalities: ['text'] } };

// Owner second message: all 3 hooks at every recomputation, each with its goal and ids.
test('hooksEvent: all three hooks with goals and ids, the same keys, no reason_internal, no learner question', () => {
  const e = hooksEvent(SET, { input: INPUT, identity: { session_id: 'ts_1', canvas_id: 'c', user_id: 'u-1' }, scope: 'owned', mode: 'journey' });
  assert.deepEqual(Object.keys(e), KEYS);
  assert.deepEqual([Object.keys(e.identity), Object.keys(e.versions), Object.keys(e.decision), Object.keys(e.runtime)], [IDENTITY, VERSIONS, DECISION, RUNTIME]);
  assert.deepEqual([e.event, e.step_id, e.identity.scope, e.identity.mode, e.identity.section_id], ['next_steps_computed', 'ns_01020304', 'owned', 'journey', null]);
  assert.deepEqual(e.decision.next_step_options, OPTIONS);
  assert.deepEqual([e.decision.chosen_action, e.decision.route, e.decision.actions, e.decision.reason_codes, e.decision.expected_evidence, e.decision.selected_next_step_id], [null, null, [], [], [], null]);
  assert.deepEqual([e.decision.shown_at, e.decision.selected_at, e.decision.evidence_transitions], [null, null, []]);
  assert.deepEqual([e.decision.current_goal, e.decision.current_section_id], [{ id: null, summary: 'Understand tidal power' }, 's1']);
  assert.deepEqual(e.decision.evidence_summary, { understood: [], uncertain: [IDS[0]], misconception: [], prerequisite_gap: [], not_yet_observed: [IDS[1]] });
  assert.deepEqual(e.decision.canvas_summary, { blocks: 1, kinds: { Explanation: 1 }, presented_claim_ids: [IDS[0]] });
  assert.deepEqual(e.decision.recent_modality_history, ['text']);
  assert.deepEqual(e.versions, { planner_version: 'next-steps-planner-1', prompt_version: '0123456789ab', model_role: 'tutor_next_steps', model_id: 'claude-sonnet-5-5' });
  assert.deepEqual(e.runtime, { timing: { total_ms: 900, planner_ms: 900, first_text_ms: null }, model: { tier: 'routine', escalated: false, calls: 1 },
    usage: { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: 0.008 }, validation: { ok: true, dropped_actions: 0, repairs: [], fallback: null }, planner_input: null });
  assert.deepEqual(e.flags, []);
  assert.deepEqual(inputSummary(INPUT).target_claim_ids, IDS);
  const text = JSON.stringify(e);
  assert.equal(text.includes(QUESTION) || /reason_internal|reasons/.test(text), false);
});

test('hooksEvent: escalation rule names and reason, a cached reply (zero usage, its producing call kept), shared provenance only as the one-way key', () => {
  const escalated = hooksEvent({ ...SET, telemetry: { ...SET.telemetry, tier: 'escalation', escalated: 'validator', calls: 2, errors: ['answer_reveal', 'distinct'], model_role: 'tutor_next_steps_escalation', model_id: 'claude-opus-5-5' } }, { input: INPUT });
  assert.deepEqual(escalated.runtime.validation, { ok: false, dropped_actions: 0, repairs: ['answer_reveal', 'distinct'], fallback: 'escalated:validator' });
  assert.deepEqual([escalated.runtime.model, escalated.identity.mode, escalated.identity.scope], [{ tier: 'escalation', escalated: true, calls: 2 }, 'canvas', 'owned']);
  const cached = hooksEvent({ ...SET, telemetry: { ...SET.telemetry, cached: true, calls: 0, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, cost_usd: 0 } }, { input: INPUT });
  assert.deepEqual([cached.flags, cached.runtime.usage, cached.runtime.model.calls], [['cached'], { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: 0 }, 0], 'a cached reply genuinely used nothing');
  const { usage, cost_usd, ...unreported } = SET.telemetry;
  assert.deepEqual(hooksEvent({ ...SET, telemetry: unreported }, { input: INPUT }).runtime.usage, { input_tokens: null, output_tokens: null, cache_creation_input_tokens: null, cache_read_input_tokens: null, cost_usd: null }, 'no usage reported: null, never 0');
  assert.deepEqual([usage.input_tokens, cost_usd], [2000, 0.008]);
  assert.deepEqual([cached.versions.prompt_version, cached.versions.model_id, cached.runtime.timing.planner_ms], ['0123456789ab', 'claude-sonnet-5-5', null], 'the producing call is named; no planner ran now');
  const shared = hooksEvent(SET, { input: { ...INPUT, mode: 'shared', goal: undefined }, scope: 'shared', mode: 'shared', identity: { source: { share_key: 'a1b2c3', share_version: 4, origin_block_id: ':root', token: 'raw-token', owner: 'sharer@example.org' } } });
  assert.deepEqual([shared.identity.source, shared.identity.scope, shared.identity.mode, shared.identity.user_id, shared.decision.current_goal], [{ share_key: 'a1b2c3', share_version: 4, origin_block_id: ':root' }, 'shared', 'shared', null, { id: null, summary: null }]);
  assert.equal(/raw-token|sharer@example/.test(JSON.stringify(shared)), false);
});

test('newSessionId: ts_ and 16 hex, never sent to the planner', async () => {
  assert.match(newSessionId(), /^ts_[0-9a-f]{16}$/);
  assert.notEqual(newSessionId(), newSessionId());
  assert.equal(emptyStore().session_id, null);
  const r = await turn();
  assert.equal(JSON.stringify(r.sent).includes('ts_00000000000000aa'), false);
  assert.equal(r.store.session_id, 'ts_00000000000000aa', 'the store keeps it');
});

// Event mode follows the contract (Ruling F12): registry course course, plain canvas canvas, journey journey, hole dive.
test('identity and mode: a course, a hole from a shared canvas (provenance as the one-way key only), a plain canvas, a diagnostic turn', async () => {
  const words = text => ({ strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text }] });
  const course = (await runTurn({ raw: 'what does softmax do?', canvas: { app: 'repo-x', board: 'main' }, access: { app: 'repo-x' }, block: null, store: emptyStore(), post: worker(words('It normalises.')).post, domain: NANOGPT, trace: true })).trace;
  assert.deepEqual([course.identity.mode, course.identity.journey_id, course.identity.section_id, course.decision.current_goal], ['course', null, null, { id: null, summary: null }]);
  const record = { dive_id: 'canvas-hole1', title: 'Exploring from Pottery', concept: 'Exploring from Pottery', created_by: 'shared_start', origin: { parent: { app: 'share:a1b2c3', board: 'main' }, origin_block_id: 'blk-9' },
    source: { share_key: 'a1b2c3', version: 4, share_url: '/b/RAW-SHARE-TOKEN', creator: { name: 'sharer@example.org', source_owner_verified: false }, title: 'Pottery' } };
  const hole = (await runTurn({ raw: 'why does clay crack?', canvas: { app: 'canvas-hole1', board: 'main', dive: record }, access: { app: 'canvas-hole1' }, block: null, store: emptyStore(), post: worker(words('Drying.')).post, domain: NANOGPT, trace: true })).trace;
  assert.deepEqual([hole.identity.mode, hole.identity.dive_id, hole.identity.canvas_id, hole.identity.scope, hole.identity.source], ['dive', 'canvas-hole1', 'canvas-hole1', 'owned', { share_key: 'a1b2c3', share_version: 4, origin_block_id: 'blk-9' }]);
  assert.equal(/RAW-SHARE-TOKEN|sharer@example/.test(JSON.stringify(hole)), false, 'never the token or the sharer');
  const canvasTurn = { turn_id: 't9', raw_user_message: '', canvas: { app: 'canvas-9', board: 'main' }, evidence: [], next_step: { suggestion_id: 'ns_1.1', learning_goal: 'See why bread rises', claim_ids: [], concept_ids: [] } };
  const plain = decisionEvent({ result: { turn: canvasTurn, store: emptyStore(), contracts: [], bench: {} }, domain: { claims: {}, contextKey: 'canvas_context', context: { goal: 'Baking', origin: null } } });
  assert.deepEqual([plain.identity.mode, plain.decision.current_goal, plain.decision.selected_next_step_id, plain.decision.actions, plain.decision.chosen_action, plain.decision.route, plain.decision.reason_codes, plain.decision.estimated_learning_seconds],
    ['canvas', { id: 'ns_1.1', summary: 'See why bread rises' }, 'ns_1.1', [], null, null, [], null]);
  // A diagnostic answer (plan: false) plans nothing: no contracts, so [] and null, never a throw.
  const diag = (await turn({ plan: false, trace: true })).trace;
  assert.deepEqual(Object.keys(diag), KEYS);
  assert.deepEqual([diag.decision.actions, diag.decision.chosen_action, diag.decision.route, diag.decision.reason_codes, diag.decision.reason_source, diag.runtime.model.calls, diag.versions.prompt_version], [[], null, null, [], null, 0, null]);
});

test('a hook click: the selected id and goal, the shown options, a made card with its command as the chosen action', async () => {
  const STEP = SET.options[1].selected_next_step;
  const plan = { strategy: 'feynman', constraints_add: [], reason_codes: ['follow_learner_interest', 'increase_interactivity'], reason: 'A moving basin shows the range change.', actions: [{ type: 'respond_text', text: 'Watch the basin.' }, { type: 'create_material', command: 'animate', request: 'a basin filling' }] };
  const r = await runTurn({ raw: '', nextStep: STEP, materials: [{ command: 'animate', cards: ['mathAnimation'], paid: true }], canvas: { app: 'canvas-1', board: 'main' }, access: { app: 'canvas-1' }, block: null, store: emptyStore(), post: worker(plan).post, domain, trace: { next_step_options: SET.options } });
  const e = r.trace;
  assert.deepEqual([e.decision.selected_next_step_id, e.decision.current_goal, e.decision.route.intent], [STEP.suggestion_id, { id: STEP.suggestion_id, summary: 'goal 2' }, 'next_step']);
  assert.deepEqual(e.decision.next_step_options, OPTIONS, 'the shown options with their set and positions');
  assert.match(e.decision.selected_at, /^\d{4}-\d\d-\d\dT/, 'a hook click without a click time: the turn start');
  assert.deepEqual([e.decision.shown_at, e.decision.evidence_transitions], [null, []], 'a click is never evidence');
  const clicked = await runTurn({ raw: '', nextStep: STEP, canvas: { app: 'canvas-1', board: 'main' }, access: { app: 'canvas-1' }, block: null, store: emptyStore(), post: worker(plan).post, domain, trace: { next_step_options: SET.options, selected_at: '2026-10-06T10:00:05.000Z' } });
  assert.equal(clicked.trace.decision.selected_at, '2026-10-06T10:00:05.000Z', 'the click time the page passed');
  assert.deepEqual(e.decision.chosen_action, { action_type: 'create_material', command: 'animate', modality: 'video', target_concept_ids: [C[STEP.claim_ids[0]].concept], target_claim_ids: STEP.claim_ids });
  assert.deepEqual([e.decision.reason_codes, e.decision.reason_source, e.flags], [['follow_learner_interest', 'increase_interactivity'], 'planner', []]);
  assert.equal(JSON.stringify(e).includes('a basin filling'), false, 'a create_material request is never in the event');
});

// Owner sixth message (4): the input trim as structured counts only, at runtime.planner_input, never the planner input itself.
test('hooksEvent: the trim counts at runtime.planner_input, picked field by field, never the input', () => {
  const trim = { before: { block_count: 20, claim_count: 12 }, after: { block_count: 6, claim_count: 7 }, trimmed: { block_count: 14, claim_count: 5 }, current_section_claims_kept: true, repair_claims_kept: false };
  const e = hooksEvent(SET, { input: INPUT, trim: { ...trim, input: INPUT, before: { ...trim.before, titles: ['x'] } } });
  assert.deepEqual(e.runtime.planner_input, trim);
  assert.deepEqual(Object.keys(e.runtime), RUNTIME);
  assert.equal(JSON.stringify(e.runtime).includes(QUESTION), false, 'no raw planner input');
  assert.deepEqual(hooksEvent(SET, { input: INPUT, trim: { before: { block_count: 1, claim_count: 1 } } }).runtime.planner_input,
    { before: { block_count: 1, claim_count: 1 }, after: { block_count: null, claim_count: null }, trimmed: { block_count: null, claim_count: null }, current_section_claims_kept: null, repair_claims_kept: null });
});

// Fix round 1b (owner: all 3 hooks at every recomputation): a set whose basis moved on before it landed is still recorded, flagged.
test('hooksEvent: a discarded set keeps the same keys, all three hooks, and the flag discarded after cached', () => {
  const e = hooksEvent(SET, { input: INPUT, discarded: true });
  assert.deepEqual([Object.keys(e), e.flags, e.decision.next_step_options.length], [KEYS, ['discarded'], 3]);
  assert.deepEqual(hooksEvent({ ...SET, telemetry: { ...SET.telemetry, cached: true } }, { input: INPUT, discarded: true }).flags, ['cached', 'discarded']);
  assert.deepEqual(hooksEvent(SET, { input: INPUT, discarded: false }).flags, []);
});

// Owner tenth message: the structured state changes of a turn, never words.
test('tutor_decision: evidence_transitions are the turn transitions as { claim_id, from, to }, nothing else', async () => {
  const pass = { seq: 1, concept: C[IDS[0]].concept, claim: IDS[0], result: 'pass', kind: 'demonstrated_in_transfer', settled: true, evaluator: 'jev', source: 'free_text', ref: {} };
  const post = async (path, body) => (path === '/api/learn/tutor/plan' ? structuredClone(PLAN) : { status: 'settled', evaluator: 'jev', events: [pass], journey: { events: [pass], seq: 1 } });
  const r = await runTurn({ raw: QUESTION, canvas: { app: 'canvas-1', board: 'main' }, access: { app: 'canvas-1' }, block: null, store: emptyStore(), post, domain, turnId: 'turn-2', trace: true });
  assert.ok(r.transitions.length > 0, 'the evaluation moved a claim');
  assert.deepEqual(r.trace.decision.evidence_transitions, r.transitions.map(({ claim, from, to }) => ({ claim_id: claim, from, to })));
  assert.deepEqual(r.trace.decision.evidence_transitions.map(Object.keys), r.transitions.map(() => ['claim_id', 'from', 'to']));
  assert.equal(r.trace.decision.selected_at, null);
});

// Owner tenth message: an impression, so selections can be read against what was shown and where.
test('shownEvent: next_steps_shown with the same keys, the set id as step, positions, shown_at, no decision and no cost', () => {
  const e = shownEvent(SET, { input: INPUT, identity: { session_id: 'ts_1', canvas_id: 'c' }, scope: 'owned', mode: 'journey', trim: { before: { block_count: 1, claim_count: 1 } } });
  assert.deepEqual(Object.keys(e), KEYS);
  assert.deepEqual([Object.keys(e.identity), Object.keys(e.versions), Object.keys(e.decision), Object.keys(e.runtime)], [IDENTITY, VERSIONS, DECISION, RUNTIME]);
  assert.deepEqual([e.event, e.step_id, e.identity.session_id, e.identity.mode, e.identity.section_id], ['next_steps_shown', 'ns_01020304', 'ts_1', 'journey', null]);
  assert.match(e.decision.shown_at, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(e.decision.next_step_options, OPTIONS);
  assert.deepEqual([e.decision.chosen_action, e.decision.actions, e.decision.reason_codes, e.decision.route, e.decision.selected_next_step_id, e.decision.selected_at, e.decision.evidence_transitions], [null, [], [], null, null, null, []]);
  assert.deepEqual(e.versions, hooksEvent(SET, { input: INPUT }).versions, 'the planner that produced the hooks shown');
  assert.deepEqual(e.runtime, { timing: { total_ms: null, planner_ms: null, first_text_ms: null }, model: { tier: null, escalated: false, calls: 0 },
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: 0 }, validation: { ok: true, dropped_actions: 0, repairs: [], fallback: null }, planner_input: null }, 'an impression costs nothing: never a double count');
  assert.deepEqual(e.flags, []);
  assert.notEqual(e.decision_id, shownEvent(SET, { input: INPUT }).decision_id);
  assert.equal(JSON.stringify(e).includes(QUESTION) || /reason_internal/.test(JSON.stringify(e)), false);
  const before = errors();
  assert.equal(shownEvent(SET, { get input() { throw new Error('boom'); } }), null, 'never throws');
  assert.equal(errors(), before + 1);
});
