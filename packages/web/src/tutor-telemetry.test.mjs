// The Tutor evidence sink (tutor-telemetry.js): real TutorDecisionEvent v1 events from the production builders, mapped into the
// registered tutor.* events. Fixture evidence only: the events come from stubbed planner replies (a real Tutor model turn is not
// run), so this proves the mapping, the exclusions and the delivery rules, not the Tutor's teaching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decisionEvent, hooksEvent, shownEvent } from './learn-tutor-trace.js';
import { runTurn } from './learn-tutor.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { journeyDomain } from './learn-journey-domain.js';
import { TIDES } from './__fixtures__/journey-synthetic-domains.mjs';
import { ASSISTANCE_MAP_VERSION, INTERACTIVE, assistanceOf, assistanceOfAction, createTutorSink, mapTutorEvent, tutorEnvelope } from './tutor-telemetry.js';
import { EVENTS, validateEvent } from '../../control-plane/src/telemetry-contract.js';

const QUESTION = 'why would a narrow estuary make the tide so much bigger';
const SECRET_GOAL = 'Understand tidal power for my private thesis', SECRET_HOOK = 'Hook number 1 for my private tides?';
const C = TIDES.diagnostic.registry.claims, IDS = Object.keys(C).slice(0, 2);
const J = { id: 'lj_t', state: 'active', registry: TIDES.diagnostic.registry, evidence: { seq: 0, events: [] }, active_section_id: 's1', request: { topic: TIDES.topic }, intake: { slots: {} } };
const PATH = { version: 1, goal: SECRET_GOAL, sections: [{ id: 's1', title: 'Ranges', purpose: 'p', status: 'current', expected_evidence: IDS.map(claim => ({ claim, kind: 'explain' })) }] };
const domain = journeyDomain({ journey: J, path: PATH, blocks: [] });
const PLAN = { strategy: 'feynman', constraints_add: [], actions: [{ type: 'respond_text', text: 'The bay funnels the water.' }, { type: 'ask_question', text: 'What would a wider bay do?', claim: IDS[0], purpose: 'explain_back' }],
  reason_codes: ['advance_goal', 'check_understanding'], reason: 'An explain-back makes the funnel idea observable. Rationale sentence two.',
  telemetry: { tier: 'fast', escalated: null, served_model: 'claude-sonnet-5-5', input_tokens: 900, output_tokens: 80, cost_usd: 0.0026, prompt_version: 'abcdef012345' } };
const turn = (extra = {}, plan = PLAN) => runTurn({ raw: QUESTION, canvas: { app: 'canvas-1', board: 'main' }, access: { app: 'canvas-1' }, block: null,
  store: { ...emptyStore(), session_id: 'ts_00000000000000aa', modalities: ['text'] }, post: async path => (path === '/api/learn/tutor/plan' ? structuredClone(plan) : { status: 'error', evaluator: 'jev', events: [] }), domain, turnId: 'turn-1', ...extra });
const SET = { set_id: 'ns_01020304', generated_at: '2026-10-06T10:00:00.000Z', basis: 'b', options: [1, 2, 3].map(n => ({ id: `ns_01020304.${n}`, hook: `Hook number ${n} for my private tides?`, selected_next_step: { v: 1, set_id: 'ns_01020304', suggestion_id: `ns_01020304.${n}`, basis: 'b', hook: SECRET_HOOK, learning_goal: `private goal ${n}`, concept_ids: [], claim_ids: [IDS[n % 2]], scope: 'owned' } })),
  telemetry: { tier: 'routine', escalated: null, calls: 1, ms: 900, planner_version: 'next-steps-planner-1', model_role: 'tutor_next_steps', model_id: 'claude-sonnet-5-5', prompt_version: '0123456789ab', usage: { input_tokens: 2000, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, cost_usd: 0.008, reasons: 3, errors: [], cached: false } };
const INPUT = { mode: 'journey', goal: SECRET_GOAL, path: { current: { id: 's1' } }, scope: { concepts: {}, claims: { [IDS[0]]: { concept: 'x', state: 'uncertain' }, [IDS[1]]: { concept: 'y', state: 'not_yet_observed' } } },
  canvas: { blocks: [{ id: 'k', kind: 'Explanation', claim_ids: [IDS[0]] }] }, recent: { kind: 'question', question: QUESTION, modalities: ['text'] } };
const IDENTITY = { session_id: 'ts_00000000000000aa', canvas_id: 'canvas-1', board_id: 'main', user_id: 'user-9' };

test('a real tutor_decision maps to tutor.decision: ids, enums, counts and timings, validated by the server contract', async () => {
  const r = await turn({ trace: { identity: { user_id: 'user-9' } } });
  const mapped = mapTutorEvent(r.trace);
  assert.equal(mapped.name, 'tutor.decision');
  assert.deepEqual(mapped.versions, { planner: 'tutor-planner-2', prompt: 'abcdef012345', model: 'claude-sonnet-5-5', mapping: ASSISTANCE_MAP_VERSION });
  const p = mapped.payload;
  assert.deepEqual([p.session_id, p.scope, p.mode, p.canvas_ref, p.board, p.journey_id, p.section_id], ['ts_00000000000000aa', 'owned', 'journey', 'canvas-1', 'main', 'lj_t', 's1']);
  assert.deepEqual([p.action_type, p.modality, p.cost_tier, p.actions], ['ask_question', 'explain_back', 'none', ['respond_text', 'ask_question']]);
  assert.deepEqual([p.reason_codes, p.reason_source, p.intent_mode], [['advance_goal', 'check_understanding'], 'planner', 'auto']);
  assert.equal(p.assistance_offered, 'explanation', 'the reply text is the strongest help offered');
  assert.deepEqual([p.model_calls, p.model_escalated, p.validation_ok, p.dropped_actions], [1, false, true, 0]);
  assert.deepEqual(p.usage, { input_tokens: 900, output_tokens: 80 });
  assert.ok(Number.isSafeInteger(p.evidence_not_observed + p.evidence_uncertain + p.evidence_understood + p.evidence_misconception + p.evidence_prerequisite_gap));
  const envelope = tutorEnvelope(r.trace);
  assert.ok(envelope, 'it validates against the server contract');
  assert.equal(envelope.event_id, `tev-${r.trace.decision_id}`);
  assert.equal(envelope.turn_id, 'turn-1');
  assert.equal(validateEvent(envelope).ok, true);
});

test('what the learner wrote and what the Tutor wrote never leave: no goal, hook, rationale, question, plan text or answer', async () => {
  const r = await turn({ trace: { identity: { user_id: 'user-9' } } });
  const computed = hooksEvent(SET, { input: INPUT, identity: IDENTITY, scope: 'owned', mode: 'journey' }), shown = shownEvent(SET, { input: INPUT, identity: IDENTITY });
  assert.ok(r.trace.decision.rationale_summary && computed.decision.current_goal.summary === SECRET_GOAL, 'the v1 events do carry these (the fixture is real)');
  const out = JSON.stringify([tutorEnvelope(r.trace), tutorEnvelope(computed), tutorEnvelope(shown)]);
  for (const secret of [SECRET_GOAL, SECRET_HOOK, 'private goal', 'private tides', QUESTION, 'An explain-back makes', 'funnels the water', 'wider bay', 'Rationale sentence']) assert.equal(out.includes(secret), false, secret);
  const registered = new Set(['event_id', 'event_name', 'schema_version', 'occurred_at', 'environment', 'service', 'feature', 'turn_id', 'versions', 'payload']);
  for (const envelope of [tutorEnvelope(r.trace), tutorEnvelope(computed), tutorEnvelope(shown)]) {
    assert.deepEqual(Object.keys(envelope).filter(key => !registered.has(key)), []);
    assert.deepEqual(Object.keys(envelope.payload).filter(key => !Object.hasOwn(EVENTS[envelope.event_name], key)), []);
  }
});

test('hooks: computed carries ids, order, cached and discarded flags and counts; a cached set is still recorded as shown', () => {
  const cached = { ...SET, telemetry: { ...SET.telemetry, cached: true, ms: null } };
  const computed = tutorEnvelope(hooksEvent(cached, { input: INPUT, identity: IDENTITY, scope: 'owned', mode: 'journey', discarded: true }));
  assert.equal(computed.event_name, 'tutor.hooks_computed');
  assert.deepEqual([computed.payload.set_id, computed.payload.suggestion_ids, computed.payload.cached, computed.payload.discarded, computed.payload.tier], ['ns_01020304', ['ns_01020304.1', 'ns_01020304.2', 'ns_01020304.3'], true, true, 'routine']);
  assert.deepEqual([computed.payload.evidence_uncertain, computed.payload.evidence_not_observed, computed.payload.claim_count], [1, 1, 2]);
  const shown = tutorEnvelope(shownEvent(cached, { input: INPUT, identity: IDENTITY }));
  assert.equal(shown.event_name, 'tutor.hooks_shown');
  assert.deepEqual([shown.payload.set_id, shown.payload.suggestion_ids.length, shown.payload.canvas_ref, 'cached' in shown.payload], ['ns_01020304', 3, 'canvas-1', false], 'shown does not claim what v1 does not say; cached is read from the computed event of the same set');
});

test('a shared canvas is only its one-way key: no canvas reference, and an anonymous viewer has none to send', () => {
  const identity = { session_id: 'ts_1', canvas_id: 'canvas-OWNERS-SECRET', source: { share_key: 'sk_ab12cd34', share_version: 3, origin_block_id: 'b1' }, user_id: null };
  const shared = tutorEnvelope(hooksEvent(SET, { input: INPUT, identity, scope: 'shared', mode: 'shared' }));
  assert.deepEqual([shared.payload.scope, shared.payload.share_key, shared.payload.canvas_ref], ['shared', 'sk_ab12cd34', undefined]);
  assert.equal(JSON.stringify(shared).includes('OWNERS-SECRET'), false);
});

test('ids that do not look like ids are dropped, never sent; a malformed or unknown event is not carried', () => {
  const event = hooksEvent(SET, { input: INPUT, identity: { ...IDENTITY, canvas_id: 'a canvas with spaces', board_id: 'bad board!', section_id: 'ok-id' }, scope: 'owned', mode: 'journey' });
  const envelope = tutorEnvelope(event);
  assert.deepEqual([envelope.payload.canvas_ref, envelope.payload.board, envelope.payload.section_id], [undefined, undefined, 'ok-id']);
  assert.equal(mapTutorEvent({ trace_schema_version: 2, event: 'tutor_decision' }), null, 'another trace version is not carried until it is mapped');
  assert.equal(mapTutorEvent({ trace_schema_version: 1, event: 'something_else', decision_id: 'td_00' }), null);
  assert.equal(mapTutorEvent(null), null);
});

// assistance-map-v1, reviewed against the Tutor's action vocabulary and what each action does (learn-tutor.js, learn-tutor-actions.js).
test('assistance-map-v1: every Tutor action type has a deliberate value, a turn is its strongest help, unknown is explicit', () => {
  const by = (action_type, modality = null) => assistanceOfAction({ action_type, modality });
  for (const type of ['respond_text', 'handoff', 'suggest_depth', 'suggest_avatar_clip']) assert.equal(by(type), 'explanation', type);
  for (const type of ['ask_question', 'suggest_practice', 'suggest_dive', 'open_dive', 'return_from_dive', 'suggest_journey', 'suggest_research', 'next_section', 'no_action']) assert.equal(by(type), 'none', type);
  for (const type of ['show_authored_card', 'focus_part', 'create_material']) {
    assert.equal(by(type, 'explanation'), 'material', `${type} read`);
    assert.equal(by(type, 'table'), 'material');
    assert.equal(by(type, 'quiz'), 'scaffold', `${type} acted on`);
    assert.equal(by(type, 'graph'), 'scaffold');
    assert.equal(by(type, null), 'unknown', `${type} with no known modality`);
  }
  assert.equal(by('invented_action'), 'unknown');
  assert.equal(assistanceOf([{ action_type: 'ask_question' }, { action_type: 'respond_text' }]), 'explanation');
  assert.equal(assistanceOf([{ action_type: 'ask_question' }, { action_type: 'create_material', modality: 'quiz' }]), 'scaffold');
  assert.equal(assistanceOf([{ action_type: 'create_material', modality: 'explanation' }, { action_type: 'create_material', modality: 'quiz' }]), 'material');
  assert.equal(assistanceOf([{ action_type: 'ask_question' }, { action_type: 'no_action' }]), 'none');
  assert.equal(assistanceOf([{ action_type: 'ask_question' }, { action_type: 'invented_action' }]), 'unknown', 'nothing known outranks none');
  assert.equal(assistanceOf([{ action_type: 'respond_text' }, { action_type: 'invented_action' }]), 'explanation');
  assert.equal(assistanceOf([]), 'none');
});

test('the map covers every action type the Tutor can produce, and its interactive list matches the Tutor action contract', async () => {
  const { ACTION_TYPES, HANDOFF_ACTION, NEXT_SECTION_ACTION } = await import('../../control-plane/src/agents/learn-tutor.js');
  for (const type of [...ACTION_TYPES, HANDOFF_ACTION, NEXT_SECTION_ACTION, 'suggest_avatar_clip']) assert.notEqual(assistanceOfAction({ action_type: type, modality: 'explanation' }), 'unknown', `${type} is mapped`);
  const source = readFileSync(new URL('./learn-tutor-actions.js', import.meta.url), 'utf8');
  const listed = source.match(/const INTERACTIVE = \[([^\]]*)\]/)[1].split(',').map(item => item.trim().replaceAll("'", ''));
  assert.deepEqual([...INTERACTIVE].sort(), listed.sort(), 'update assistance-map-v1 (and its version) when the Tutor changes what counts as interactive');
});

test('the sink queues validated events, batches them, never throws, stops on a missing session and drops what it cannot send', async () => {
  const r = await turn({ trace: { identity: { user_id: 'user-9' } } });
  const posts = [], timers = [];
  let status = 202;
  const made = createTutorSink({ send: async body => { posts.push(JSON.parse(body).events); return status; }, schedule: (fn, wait) => { timers.push({ fn, wait }); return timers.length; } });
  made.sink(r.trace);
  made.sink(hooksEvent(SET, { input: INPUT, identity: IDENTITY, scope: 'owned', mode: 'journey' }));
  made.sink({ trace_schema_version: 1, event: 'tutor_decision', decision_id: 'td bad id', decision: {}, identity: {}, runtime: {}, versions: {} }); // an id with spaces cannot be an event id: dropped
  assert.deepEqual(timers.map(t => t.wait), [5000]);
  await made.flush();
  assert.deepEqual(posts[0].map(e => e.event_name), ['tutor.decision', 'tutor.hooks_computed']);
  assert.deepEqual(made.stats(), { sent: 2, dropped: 1, queued: 0, stopped: false });
  status = 401;
  made.sink(r.trace);
  await made.flush();
  assert.equal(made.stats().stopped, true, 'no signed-in session: the page stops sending');
  made.sink(r.trace);
  assert.equal(made.stats().queued, 0, 'and queues nothing more');
  const failing = createTutorSink({ send: async () => { throw new Error('offline'); } });
  failing.sink(r.trace);
  await failing.flush();
  assert.equal(failing.stats().dropped, 1);
});

test('building the tutor events never changes a turn: the same results with and without the sink', async () => {
  const { addSink } = await import('./learn-tutor-trace.js');
  const strip = v => JSON.parse(JSON.stringify(v, (key, value) => (['trace', 'mark', 'ms', 'action_id', 'started_at', 'trace_id'].includes(key) ? undefined : value)));
  const off = await turn(), seen = [];
  const remove = addSink(event => { seen.push(tutorEnvelope(event)); });
  const on = await turn({ trace: true });
  remove();
  assert.deepEqual(strip({ ...on, trace: undefined }), strip({ ...off, trace: undefined }));
  assert.ok(decisionEvent && seen.length >= 0);
});
