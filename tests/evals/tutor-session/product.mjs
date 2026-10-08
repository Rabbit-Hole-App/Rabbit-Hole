// The real product behind the harness's injected interface (docs/features/tutor-decision-eval.md §8). Nothing here plans,
// routes, validates, evaluates, gates hooks or builds a trace: the LP1 journey route, runTurn, the worker's tutorRoute (the
// evaluate, plan and next-steps routes), the hook controller and input builder, the stopping-point rule, turnOffers and the
// TutorDecisionTrace builders are the production modules, imported, never copied. This file wires the browser half to the
// worker half in one Node process, as e2e/tutor-corpus-run.mjs and e2e/next-steps-check.mjs do, and maps their outputs onto
// the eval's event fields (field names only; every value is the product's).
// The one thing replaced is the provider boundary. providerBoundary() swaps globalThis.fetch: the Anthropic Messages API and
// the JEV hosts are answered from a script, and every other host is refused. A missing key alone would not stop a request;
// this does. The paid run (owner approval 2026-10-08: the dev Anthropic workspace, JEV where needed) swaps the script for
// realAnswers: the product's own Anthropic and JEV requests go to the real providers, still reserved and metered here.
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { learnerIntent, runTurn } from '../../../packages/web/src/learn-tutor.js';
import { tutorContext } from '../../../packages/web/src/learn-tutor-domains.js';
import { deriveClaimStates, emptyStore } from '../../../packages/web/src/learn-tutor-evidence.js';
import { goalOf, nextStepsBasis, nextStepsController, nextStepsInput, stoppingPoint } from '../../../packages/web/src/learn-next-steps.js';
import { hooksEvent, newSessionId, shownEvent } from '../../../packages/web/src/learn-tutor-trace.js';
import { modalityOf } from '../../../packages/web/src/learn-tutor-actions.js';
import { tutorRoute } from '../../../packages/control-plane/src/learn-tutor-routes.js';
import { journeyRoute } from '../../../packages/control-plane/src/learn-journey.js';
import { fixtureFor } from '../../../packages/control-plane/src/learn-journey-fixtures.js';
import { JEV_TRANSPORTS } from '../../../packages/control-plane/src/learn-grade-jev.js';
import { LEARN_TASKS } from '../../../packages/control-plane/src/learn-models.js';
import { JOURNEY_TOOLS } from '../../../packages/control-plane/src/agents/learn-journey.js';
import { NEXT_STEPS_LIMITS, NEXT_STEPS_TOOL } from '../../../packages/control-plane/src/agents/learn-next-steps.js';
import { TUTOR_TOOL } from '../../../packages/control-plane/src/agents/learn-tutor.js';
import { freshLearnDb } from './harness.mjs';
import { requestWorstCase } from './cost.mjs';

// The product's recompute debounce (contract §2.3): a hook set is requested this long after the turn that changed its basis.
export const HOOK_DEBOUNCE_MS = NEXT_STEPS_LIMITS.debounce_ms;

// What a run on this adapter exercises, written into every session bundle (runSession coverage) so no report reads more
// into it. With the stub transport no model answers: the plumbing, routing, validation and evidence rules are the product's,
// teaching quality is not measured. The paid run's (paidCoverage) has the real models answer; without a JEV key typed answers
// are never evaluated, so evidence never moves.
export const COVERAGE = Object.freeze({
  transport: 'stub',
  teaching_quality: 'not established: the Tutor, hook and LP1 planners answer from scripts and the keyless product fixtures, never a model',
  exercised: ['lp1_journey_start', 'typed_turn', 'jev_evaluation', 'planner_routing_and_validation', 'hook_click_turn', 'hook_controller_and_route', 'stopping_point', 'decision_trace', 'budget_reservation'],
  not_exercised: ['material_generation', 'section_materialization', 'larger_evaluator_answer', 'lp1_tray_resolver', 'streamed_first_sentence', 'rabbit_holes', 'shared_canvas', 'voice', 'repository_handoff', 'owned_reply_edge_cache', 'stopped_turns'],
});
// jev: whether the paid world has a JEV key. With one, the larger evaluator may answer too (when JEV is uncertain).
export const paidCoverage = jev => Object.freeze({
  transport: 'anthropic',
  teaching_quality: `one simulated learner per profile on the real Tutor, hook and LP1 planners${jev ? ' and the real JEV' : '; no JEV key, so typed answers are never evaluated and evidence never moves'}; review scores are one model reading, not a learning outcome`,
  exercised: jev ? [...COVERAGE.exercised, 'larger_evaluator_answer'] : COVERAGE.exercised.filter(name => name !== 'jev_evaluation'),
  not_exercised: jev ? COVERAGE.not_exercised.filter(name => name !== 'larger_evaluator_answer') : ['jev_evaluation', ...COVERAGE.not_exercised],
});

// ---------- The provider boundary ----------

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const JEV_ORIGINS = new Set(Object.values(JEV_TRANSPORTS).map(transport => new URL(transport.url).origin));
// A request's product role (LEARN_TASKS), from what the product sent: one tool per task, the model telling a task's
// routine and escalation roles apart. Unknown when nothing matches; never guessed.
const TOOL_ROLES = [[TUTOR_TOOL.name, ['tutor']], [NEXT_STEPS_TOOL.name, ['tutor_next_steps', 'tutor_next_steps_escalation']], ...Object.entries(JOURNEY_TOOLS).map(([role, tool]) => [tool.name, [role]])];
export function roleOf(body) {
  const tool = body?.tools?.[0]?.name ?? null;
  const roles = tool ? TOOL_ROLES.filter(([name]) => name === tool).flatMap(([, list]) => list) : ['tutor_evaluator'];
  const matching = roles.filter(role => roles.length === 1 || LEARN_TASKS[role]?.model === body?.model);
  return matching.length === 1 ? matching[0] : 'unknown';
}
const tokens = value => Math.ceil(JSON.stringify(value ?? '').length / 4);
// Stub usage: a token count of what was sent and answered; 'worst' reports each request's full worst case (requestWorstCase:
// every input token it could carry, and its whole max_tokens), so settled spend climbs as fast as the reservations do.
const USAGE = {
  stub: (body, input) => ({ input_tokens: tokens(body), output_tokens: tokens(input) }),
  worst: body => ({ input_tokens: requestWorstCase(body).input_tokens_bound, output_tokens: body.max_tokens }),
};
const message = (body, name, input, usage) => Response.json({
  id: `msg_stub_${createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 12)}`, type: 'message', role: 'assistant', model: body.model,
  stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_stub', name, input }],
  usage: { ...USAGE[usage](body, input), cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});
// The planner context as the product sent it (plannerRequest: `context = <json>` in the user message).
export const plannerContextOf = body => {
  const content = body?.messages?.[0]?.content;
  const text = typeof content === 'string' ? content : (content || []).map(part => part.text || '').join('');
  return JSON.parse(text.slice(text.indexOf('context = ') + 'context = '.length));
};
// Scripted answers. plan(context, body): the Tutor's tool input for that planner context (a test scripts it). hooks(input,
// body): the hook planner's; it and the LP1 planners default to the product's own keyless fixtures (fixtureFor, the
// JOURNEY_MODEL_STUB=fixtures replies), so their validators see well-formed input. jev(request): JEV's reply body. usage:
// 'stub' (default) or 'worst' (USAGE above); either way it is labelled transport 'stub' on every cost line, so stub spend
// can never be read as real spend.
export function stubAnswers({ usage = 'stub', plan = () => ({ strategy: 'none', actions: [{ type: 'respond_text', text: 'A stub reply: no model was called.' }], reason_codes: ['respond_to_question'], reason: 'A stub plan.' }), hooks = input => fixtureFor('suggest_next_steps', input), jev = request => ({ answers: Object.fromEntries(Object.keys(request.questions || {}).map(key => [key, { type: 'noul', noul: 0.95 }])) }) } = {}) {
  return {
    anthropic: body => {
      const name = body?.tools?.[0]?.name;
      if (name === TUTOR_TOOL.name) return message(body, name, plan(plannerContextOf(body), body), usage);
      if (!name) return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'the stub answers tool calls only' } }, { status: 400 });
      const text = body.messages[0].content, input = JSON.parse(text.slice(text.indexOf('input = ') + 'input = '.length));
      return message(body, name, name === NEXT_STEPS_TOOL.name ? hooks(input, body) : fixtureFor(roleOf(body), input), usage);
    },
    jev: request => Response.json(jev(request)),
  };
}

// The paid run's answers: the product's own Anthropic or JEV request (its URL, headers and body, exactly as it built them)
// sent with the fetch the boundary replaced. JEV is outside the Anthropic ceiling: its cost is the provider's report or unknown.
const passThrough = send => (body, { input, init }) => send(input, init);
export const realAnswers = send => ({ kind: 'anthropic', anthropic: passThrough(send), jev: passThrough(send) });

// The eval's own paid calls (the learner simulator, the reviewer) as evalCall's transport: one Messages API request each,
// sent with boundary.realFetch so they are never counted as product requests. A non-2xx answer throws (the reservation stays
// held); a reply cut off by max_tokens or a refusal fails its strict parser instead.
export function anthropicTransport({ key, send }) {
  const transport = async request => {
    const response = await send(ANTHROPIC, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(request), signal: AbortSignal.timeout(180_000) });
    const reply = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(Error(`Messages API ${response.status}: ${reply?.error?.message ?? 'no error body'}`), { code: `http_${response.status}` });
    return reply;
  };
  return Object.assign(transport, { kind: 'anthropic' });
}

// Installs the boundary on globalThis.fetch. Every Anthropic or JEV request is first handed to onRequest, which reserves its
// complete body against the budget (meter.reserve); a refusal rejects the request unsent and is listed in `refused`. Then it
// is recorded (the request body, never a header), answered by `answers`, and handed to onCall as one cost line settling that
// reservation (labelled with answers.kind, 'stub' for a script). Anything else throws OUTBOUND_BLOCKED and
// is recorded in `blocked`. realFetch is the fetch it replaced, for the eval's own paid calls. The product's own model log lines (loggedModel's learn_model events: names, statuses and prompt
// hashes, never content) are kept in `logs` instead of printed. restore() puts the previous fetch and console.log back.
export function providerBoundary(answers = stubAnswers()) {
  const previous = globalThis.fetch, print = console.log, requests = [], blocked = [], logs = [], errors = [], refused = [];
  const transport = answers.kind ?? 'stub';
  const boundary = { transport, realFetch: previous, requests, blocked, logs, errors, refused, onRequest: null, onCall: null, restore: () => { globalThis.fetch = previous; console.log = print; } };
  console.log = (...args) => {
    let line = null;
    try { line = args.length === 1 && typeof args[0] === 'string' ? JSON.parse(args[0]) : null; } catch { /* not a product log line */ }
    if (line?.event === 'learn_model') logs.push(line); else print(...args);
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const provider = url.href === ANTHROPIC ? 'anthropic' : JEV_ORIGINS.has(url.origin) && answers.jev ? 'typesafe' : null;
    if (!provider) {
      blocked.push(url.origin);
      throw Object.assign(Error(`outbound request to ${url.origin} blocked by the evaluation provider boundary`), { code: 'OUTBOUND_BLOCKED' });
    }
    const body = JSON.parse(init.body);
    let ticket = null;
    if (boundary.onRequest) try { ticket = boundary.onRequest({ provider, body }); } catch (error) { refused.push({ provider, role: provider === 'anthropic' ? roleOf(body) : 'jev', code: error.code ?? null }); throw error; }
    requests.push({ provider, body });
    const started = performance.now();
    const response = provider === 'anthropic' ? await answers.anthropic(body, { input, init }) : await answers.jev(body, { input, init });
    const reply = await response.clone().json().catch(() => null);
    // The meter never fails a product call (as the product's own telemetry never fails a turn): a meter error is kept in
    // `errors`, and the run checks it.
    try { boundary.onCall?.({
      provider, transport, model_id: provider === 'anthropic' ? reply?.model ?? body.model ?? 'unknown' : body.model ?? 'jev', model_role: provider === 'anthropic' ? roleOf(body) : 'jev',
      usage: reply?.usage ?? null, latency_ms: Math.round((performance.now() - started) * 10) / 10, outcome: response.ok ? 'ok' : 'failed', request_id: transport === 'stub' ? `stub-${requests.length}` : reply?.id ?? null,
    }, ticket); } catch (error) { errors.push(error.message); }
    return response;
  };
  return boundary;
}

// ---------- The page's own functions (JSX, bundled as next-steps-check.mjs bundles them) ----------

let page;
const pageFunctions = () => (page ??= (async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tutor-eval-'));
  try {
    await esbuild.build({
      stdin: { contents: "export { turnOffers } from './LearnTutor.jsx';", resolveDir: fileURLToPath(new URL('../../../packages/web/src/', import.meta.url)), loader: 'jsx' },
      bundle: true, outfile: join(dir, 'page.cjs'), format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
    });
    return createRequire(import.meta.url)(join(dir, 'page.cjs'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
})());

// ---------- Mapping (field names only) ----------

// The eval's claim list from the product's derived states (deriveClaimStates), without the evidence basis.
export const claimList = states => Object.values(states || {}).map(({ basis, ...state }) => state);
// HookSet option -> the eval's option (A1): the hook text verbatim, its screen position, and the structured identity the
// creator analytics aggregate by (learning_goal plus ids, contract §5.2). The learner view keeps only id, position, text.
export const optionOf = set => (option, i) => ({ id: option.id, position: i + 1, text: option.hook, set_id: set.set_id, learning_goal: option.selected_next_step?.learning_goal ?? null, concept_ids: option.selected_next_step?.concept_ids ?? [], claim_ids: option.selected_next_step?.claim_ids ?? [] });
// A tutor_decision event -> the eval's decision fields (A2). The product has no separate card type: a shown or made card's
// modality is its block type (contract §3.2), so card_type is that modality on a card action and null otherwise.
const CARD_ACTIONS = ['show_authored_card', 'focus_part', 'create_material'];
export function decisionOf(event) {
  const d = event.decision, chosen = d.chosen_action;
  return {
    action_type: chosen?.action_type ?? null, command: chosen?.command ?? null, capability: chosen?.capability ?? null, modality: chosen?.modality ?? null,
    card_type: CARD_ACTIONS.includes(chosen?.action_type) ? chosen.modality : null, cost_tier: chosen?.cost_tier ?? null,
    actions: d.actions, reason_codes: d.reason_codes, reason_source: d.reason_source, rationale_summary: d.rationale_summary,
    target_concepts: chosen?.target_concept_ids ?? d.target_concept_ids, target_claims: chosen?.target_claim_ids ?? d.target_claim_ids, expected_evidence: d.expected_evidence,
    route_row: d.route?.row ?? null, intent_mode: d.intent_mode, inferred_intent: d.inferred_intent, intent_status: d.intent_status, offered_actions: d.offered_actions,
  };
}
// What the turn could have produced: the modality of every action its route allowed, every material it offered and every card
// the domain can show - each named by the product's modalityOf. Normalized modality entropy divides by this count.
export function availableModalities(result, domain, materials) {
  const allowed = result.routed?.allowed || [];
  const actions = allowed.flatMap(type => (type === 'create_material' ? materials.map(material => ({ type, command: material.command }))
    : ['show_authored_card', 'focus_part'].includes(type) ? (domain.cards || []).map(card => ({ type, card }))
      : type === 'ask_question' ? [{ type }, { type, purpose: 'explain_back' }] : [{ type }]));
  return [...new Set(actions.map(action => modalityOf(action, { domain, materials })).filter(Boolean))];
}

// ---------- One simulated learner's product world ----------

// A fresh LP1 world per session (O1): its own LEARN_DB, user, canvas and Tutor store. The worker sees an authorized canvas
// owner (deps.authorize, as the route tests inject it); the product's limiter keys a viewer by email, so access carries a
// synthetic .invalid address that never reaches an event. trace: false runs the product with telemetry off (runTurn gets no
// trace and no hook event is built), for the tracing-on/off proof. keys: the worker's provider keys; the paid run passes the
// real ones from its env file (without a JEV key the product sends no JEV request: "no key" is its own evaluate answer).
export async function productWorld({ topic, ids, boundary, board = 'main', trace = true, keys = { ANTHROPIC_API_KEY: 'eval-stub-not-a-key', TYPESAFE_API_KEY: 'eval-stub-not-a-key' } }) {
  const db = await freshLearnDb();
  const app = ids.canvas_id;
  const env = { LEARN_DB: db.LEARN_DB, ...keys };
  const access = { org: 'eval-org', user_id: ids.user_id, email: `${ids.user_id}@eval.invalid`, app, kind: 'canvas' };
  const request = (route, path, body) => route(path, new Request(`https://eval.invalid${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, { authorize: async () => access });
  // The browser's post: a non-2xx answer throws with its status, as the page's api() does.
  const post = async (path, body) => {
    const response = await request(tutorRoute, path, body);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(Error(data?.error || `${path} answered ${response.status}`), { status: response.status });
    return data;
  };
  const journeyPost = async body => {
    const response = await request(journeyRoute, '/api/learn/journey', { app, board, ...body });
    const data = await response.json();
    if (!response.ok) throw Error(`journey ${body.action}: ${response.status} ${data?.error ?? ''}`);
    return data;
  };
  const { turnOffers } = await pageFunctions();
  let view = null, store = { ...emptyStore(), session_id: newSessionId() }, lastTurn = null, shown = [], turns = 0, clock = 0;
  const blocks = () => []; // ponytail: section materialization (artifact generation) is not run, so the canvas has no blocks
  const here = { app, board };
  const context = () => tutorContext({ app, board, journey: view, blocks: blocks(), title: topic.title });
  const identity = () => ({ user_id: ids.user_id, session_id: store.session_id, canvas_id: app, board_id: board, canvas_version: null, journey_id: view?.journey?.id ?? null, section_id: view?.journey?.active_section_id ?? null, dive_id: null });
  const evidence = () => claimList(deriveClaimStates(store.events, context()?.domain?.claims || {}));
  const where = () => ({ journey_id: view?.journey?.id ?? null, section_id: view?.journey?.active_section_id ?? null, board_id: board });
  const attribute = meter => {
    boundary.onRequest = ({ provider, body }) => meter.reserve({ provider, body, role: provider === 'anthropic' ? roleOf(body) : 'jev' });
    boundary.onCall = (call, ticket) => meter.call(call, ticket);
  };

  // The production hook controller with a manual timer: the harness places the debounce on its own timeline.
  let due = null, landed = null;
  const controller = nextStepsController({
    post: input => post('/api/learn/tutor/next-steps', { app, input }),
    onSet: (set, input, trim, { discarded }) => { landed = { set, input, trim, event: trace ? hooksEvent(set, { input, trim, identity: identity(), scope: 'owned', mode: input.mode, discarded }) : null }; },
    onShown: set => { if (landed?.set.set_id === set.set_id) landed.shown = trace ? shownEvent(set, { input: landed.input, trim: landed.trim, identity: identity(), scope: 'owned', mode: landed.input.mode }) : null; },
    setTimer: fire => { due = fire; return 1; }, clearTimer: () => { due = null; }, now: () => clock,
  });
  const snapshot = () => ({ context: context(), store, journey: view, blocks: blocks(), title: topic.title, lastTurn });

  return {
    close: db.close,
    coverage: boundary.transport === 'stub' ? COVERAGE : paidCoverage(!!(keys.TYPESAFE_API_KEY || keys.VERCEL_TYPESAFE_API_KEY)),
    store: () => store,
    // The decision's materials are its create_material actions (contract §2.5: several per turn, distinct commands), in the
    // product's own names. ponytail: generation is not run - runMaterials and /api/learn/artifact are not wired yet - so
    // each is not_run and records no material events; a paid run wires the generator before it measures materials.
    materialize: async ({ decided }) => ({ materials: (decided?.product?.contracts || []).filter(c => c.action_type === 'create_material').map(c => ({ timing_source: 'not_run', material_type: c.modality, modality: c.modality, command: c.command, cost_tier: c.cost_tier, concept_ids: c.target_concept_ids, claim_ids: c.target_claim_ids, expected_evidence: c.expected_evidence })) }),
    tutor: {
      // The learner asked for this topic's learning path (the Start a learning path chip): the real LP1 start, then the setup
      // steps the learner skips (intake and diagnostic: no level ever reaches the Tutor) and the drafted path accepted.
      async start(meter) {
        attribute(meter);
        let reply = await journeyPost({ action: 'start', text: topic.opening_message });
        for (let step = 0; step < 6 && reply.journey?.state !== 'active'; step++) reply = await journeyPost({ action: reply.journey?.state === 'path_review' ? 'accept' : 'cancel', revision: reply.journey?.revision });
        if (reply.journey?.state !== 'active') throw Error(`the journey did not become active (${reply.journey?.state ?? 'none'})`);
        view = { journey: reply.journey, path: reply.path, start: () => ({ handled: false }) };
        return { evidence: evidence(), context: where() };
      },
      // One real Tutor turn: typed words (evaluated first by the real evidence path) or a hook click (no words, no evidence).
      async decide(input, meter) {
        attribute(meter);
        const ctx = context(), domain = ctx.domain;
        const nextStep = input.option ? controller.select(input.option.id).selected_next_step ?? null : null;
        if (input.option && !nextStep) throw Error(`the hook ${input.option.id} could not be selected`);
        const offers = turnOffers({ journey: view, record: null, opening: false, nextStep, openResearch: null, repository: false });
        const turnId = `eval-${ids.session_id}-${++turns}`;
        const sentBefore = boundary.requests.length;
        const onScreen = shown;
        const result = await runTurn({
          raw: nextStep ? '' : input.text, canvas: here, access: { app }, block: null, store, post, domain, turnId, nextStep, ...offers,
          trace: trace && { identity: { user_id: ids.user_id, canvas_version: null }, blocks: blocks(), next_step_options: onScreen, selected_at: null },
        });
        store = result.store;
        // The page's lastTurn (LearnTutor.jsx setLastTurn): what the next hook input reads of this turn.
        const kind = learnerIntent(result.turn).kind;
        lastTurn = { seq: turns, turn_id: result.turn.turn_id, kind, ...(['question', 'request'].includes(kind) ? { question: result.turn.raw_user_message.slice(0, 300) } : {}), transitions: result.transitions.map(({ claim, from, to }) => ({ claim, from, to })) };
        shown = [];
        const planned = boundary.requests.slice(sentBefore).filter(entry => entry.provider === 'anthropic' && roleOf(entry.body) === 'tutor');
        const event = result.trace ?? null;
        return {
          product: result,
          trace: event,
          decision: event ? decisionOf(event) : null,
          estimated_learning_seconds: event?.decision.estimated_learning_seconds ?? null,
          available_modalities: availableModalities(result, domain, offers.materials),
          planner: event ? { model_id: event.versions.model_id, tier: event.runtime.model.tier, escalated: event.runtime.model.escalated } : null,
          planner_version: event?.versions.planner_version ?? null,
          material_summary: result.text || null,
          context: where(),
          evaluated: result.evaluation ? { evidence: claimList(result.states), ms: result.bench.ms?.evidence ?? null, blocking: !!result.bench.critical_path?.blocking } : null,
          // The learner-originated part of what the planner was sent (its words and the learner side of the recent turns), for
          // the hidden-profile check; the Tutor's own replies may use any word and are not scanned.
          tutor_input: planned.map(entry => { const c = plannerContextOf(entry.body); return { learner: c.learner_intent?.raw_user_message ?? null, turns: (c.recent_relevant_context?.turns || []).map(t => t?.learner ?? null) }; }),
        };
      },
    },
    // The product's stopping point after a turn (contract §1.2): with one, hooks are requested after the debounce while the
    // learner reads; without one (a Tutor question waiting, setup, nothing to ground on) there are none.
    hookStart: () => (stoppingPoint({ busy: false, journey: view, store, here, blocks: blocks(), goal: goalOf({ context: context(), title: topic.title }).goal, plain: context()?.source === 'canvas' }) ? 'none' : 'with_material'),
    // One recompute through the production controller (basis, previous hooks, one request per basis) and the owned route.
    async hooks(_, meter) {
      attribute(meter);
      const s = snapshot();
      const basis = nextStepsBasis({ lastTurn, store, journey: view, canvasState: null, graded: 0, context: s.context, title: topic.title });
      landed = null;
      controller.update({ basis, stop: null, input: previous => nextStepsInput({ ...s, previous, basis }) });
      clock += HOOK_DEBOUNCE_MS;
      if (due) { const fire = due; due = null; await fire(); }
      const now = controller.view();
      if (now.status !== 'ready') return { options: [], unavailable: now.reason ?? now.status };
      shown = now.options;
      return { set_id: now.set_id, options: now.options.map(optionOf(now)), trace: landed?.event ?? null, shown: landed?.shown ?? null };
    },
  };
}
