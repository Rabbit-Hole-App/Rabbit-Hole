// Tutor decision evaluation harness (docs/features/tutor-decision-eval.md): the generic half.
// Fixtures, the hidden-profile guard, the session loop that writes the event stream (events.mjs), the learner and
// reviewer views, prompts and reply schemas, the cost ledger, and the throwaway per-session LEARN_DB. Everything
// that talks to the product - the Tutor turn, the hooks, the material generator, the evidence path - is injected
// (product.mjs is the real product; the tests also use a scripted fake), so the loop never knows a topic, a profile
// or a model. No model is called from this file.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVAL_SCHEMA_VERSION, createEmitter, foldSession, round, stats, sum } from './events.mjs';
import { money, priceCall, requestWorstCase } from './cost.mjs';
import { graphMetrics, learningGraph } from './graph.mjs';
import { groupMetrics } from './metrics.mjs';

const HERE = new URL('.', import.meta.url);
export const HARNESS_VERSION = 'tutor-session-eval-1';

// ---------- Fixtures (data, never code branches) ----------

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const need = (cond, message) => { if (!cond) throw Error(`fixture: ${message}`); };

export function loadTopic(id, dir = new URL('fixtures/topics/', HERE)) {
  const topic = readJson(new URL(`${id}.json`, dir));
  need(topic.id === id, `topic file ${id}.json has id ${topic.id}`);
  for (const key of ['title', 'learner_goal', 'opening_message']) need(typeof topic[key] === 'string' && topic[key].trim(), `topic ${id} needs ${key}`);
  need(Number.isFinite(topic.session_budget_seconds) && topic.session_budget_seconds > 0, `topic ${id} needs session_budget_seconds`);
  need(Number.isInteger(topic.max_decisions) && topic.max_decisions > 0, `topic ${id} needs max_decisions`);
  return topic;
}

export function loadProfiles(path = new URL('fixtures/profiles.json', HERE)) {
  const { profiles } = readJson(path);
  need(Array.isArray(profiles) && profiles.length, 'profiles.json needs profiles');
  for (const profile of profiles) for (const key of ['id', 'prior_knowledge', 'answer_style', 'question_style', 'hook_preference']) need(typeof profile[key] === 'string' && profile[key].trim(), `profile ${profile.id} needs ${key}`);
  need(new Set(profiles.map(profile => profile.id)).size === profiles.length, 'profile ids are unique');
  return profiles;
}

export const loadTaxonomy = (path = new URL('fixtures/taxonomy.json', HERE)) => readJson(path);
export const loadRoles = (path = new URL('fixtures/cost-roles.json', HERE)) => readJson(path);

export const configHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

// Synthetic ids are opaque hashes: a profile name inside a user or canvas id would reach the product.
export const simulatedIds = ({ runId, topic, profile }) => ({
  user_id: `sim-user-${configHash(['user', runId, profile.id]).slice(0, 10)}`,
  canvas_id: `sim-canvas-${configHash(['canvas', runId, topic.id, profile.id]).slice(0, 10)}`,
  session_id: `sim-session-${configHash(['session', runId, topic.id, profile.id]).slice(0, 10)}`,
});

// ---------- Hidden-profile guard ----------

// The Tutor never receives a profile label. Learner-originated text and whatever the Tutor adapter reports it sent
// to the planner are scanned for every profile's id and hidden terms (word-bounded); a hit stops the session.
// ponytail: the Tutor's own words may legitimately use a level word, so only learner-originated payload is scanned
// for the generic terms; the adapter's tutor_input is checked the same way and must not echo Tutor text back.
export const profileTerms = profiles => [...new Set(profiles.flatMap(profile => [profile.id, ...(profile.hidden_terms || [])]))];
export function assertNoProfileLeak(payload, terms) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hit = terms.find(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  if (hit) throw Object.assign(Error(`profile label "${hit}" would reach the Tutor`), { code: 'PROFILE_LEAK' });
}

// ---------- Views: what each model may see ----------

// The learner simulator sees the material summary, the hook texts and its own past exchange (learner null where it
// clicked a hook) - never reason codes, rationale, expected evidence, evidence state, hidden learning goals or answers.
export const learnerView = ({ material = null, options = [] }, history) => ({
  material,
  options: options.map(({ id, position, text }) => ({ id, position, text })),
  history: history.map(({ material: shown, learner }) => ({ material: shown, learner })),
});

// The session reviewer sees the folded structured trace (decisions with reason codes and rationale summaries,
// evidence, hooks, learner responses, timing), never hidden model reasoning or the simulator profile.
const REVIEW_STEP_KEYS = ['step', 'elapsed_learning_seconds', 'canvas_summary', 'evidence_before', 'next_step_options', 'learner_selected_option', 'tutor_decision', 'available_modalities', 'learner_response', 'evidence_after', 'estimated_learning_seconds', 'timing'];
export function reviewerView({ topic, steps, flagged = [] }) {
  return {
    topic: topic.title, learner_goal: topic.learner_goal,
    steps: steps.map(step => Object.fromEntries(REVIEW_STEP_KEYS.filter(key => key in step).map(key => [key, step[key]]))),
    flagged_sequences: flagged.map(({ id, steps: refs, pattern }) => ({ id, steps: refs.map(entry => entry.step), pattern })),
  };
}

// ---------- Prompts, reply schemas and strict parsers ----------

export const REVIEW_DIMENSIONS = ['pedagogical_coherence', 'responsiveness_to_evidence', 'modality_appropriateness', 'modality_variety', 'pacing', 'cognitive_load_balance', 'engagement', 'hook_quality', 'progress_toward_goal', 'unnecessary_repetition'];
export const RESPONSE_KINDS = ['answer', 'explanation', 'question', 'activity', 'confusion', 'acknowledge'];

// Structured-output schemas (output_config.format = { type: 'json_schema', schema }) for the two simulator calls; the
// strict parsers below re-check every reply anyway. Nullable fields use anyOf, a documented structured-output form.
export const LEARNER_REPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['selected_option_id', 'response'],
  properties: {
    selected_option_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    response: {
      type: 'object', additionalProperties: false, required: ['kind', 'text', 'choice_id'],
      properties: { kind: { type: 'string', enum: RESPONSE_KINDS }, text: { type: 'string' }, choice_id: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
    },
  },
};
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['scores', 'findings', 'flagged_sequences'],
  properties: {
    scores: { type: 'object', additionalProperties: false, required: REVIEW_DIMENSIONS, properties: Object.fromEntries(REVIEW_DIMENSIONS.map(key => [key, { type: 'integer', enum: [1, 2, 3, 4, 5] }])) },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['steps', 'text'], properties: { steps: { type: 'array', items: { type: 'integer' } }, text: { type: 'string' } } } },
    flagged_sequences: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'justified', 'note'], properties: { id: { type: 'string' }, justified: { type: 'boolean' }, note: { type: 'string' } } } },
  },
};

// terms: every hidden profile label (profileTerms), so the prompt forbids them without the code naming any.
export function learnerPrompt({ topic, profile, view, terms }) {
  const system = [
    'You are role-playing one learner in a tutoring session, for an offline evaluation. Stay in character.',
    `Topic: ${topic.title}. Your goal, in your own words: ${topic.learner_goal}`,
    `What you already know: ${profile.prior_knowledge}`,
    `How you answer: ${profile.answer_style}`,
    `How you ask questions: ${profile.question_style}`,
    `How you pick what to explore next: ${profile.hook_preference}`,
    ...(topic.simulator_misconceptions?.length ? [`Mistakes a learner like you may make, only if they fit what you know: ${topic.simulator_misconceptions.join('; ')}`] : []),
    `Never describe yourself with a skill-level label (for example ${terms.join(', ')}). Show your level only through what you say.`,
    'You do not know the answers to the tutor\'s questions unless your knowledge above covers them. Never grade yourself.',
    'Each turn you make one move: either click one of the offered options to explore it next, or type a reply. Clicking sends no words.',
    'Reply with one JSON object: selected_option_id is the offered option id you click, or null when you type instead (always null when none are offered); response.kind is what you are doing (acknowledge when you click); response.text is what you type (empty when you click); response.choice_id is the option you choose in a multiple-choice activity, or null.',
  ].join('\n');
  return { system, user: JSON.stringify(view) };
}

const jsonIn = text => {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw Error('no JSON object in the reply');
  return JSON.parse(text.slice(start, end + 1));
};

export function parseLearnerReply(text, view, terms) {
  const reply = jsonIn(text);
  const ids = view.options.map(option => option.id);
  // One move: an offered option (a click) or null (typed words); an option that was not offered is refused.
  if (reply.selected_option_id != null && !ids.includes(reply.selected_option_id)) throw Error(`selected_option_id ${reply.selected_option_id} is not one of ${ids.join(', ') || 'the (no) offered options'}`);
  const response = reply.response || {};
  if (!RESPONSE_KINDS.includes(response.kind)) throw Error(`response.kind ${response.kind} is not one of ${RESPONSE_KINDS.join(', ')}`);
  if (typeof response.text !== 'string') throw Error('response.text must be a string');
  assertNoProfileLeak(response.text, terms);
  return { selected_option_id: reply.selected_option_id ?? null, response: { kind: response.kind, text: response.text.trim(), choice_id: response.choice_id ?? null } };
}

export function reviewerPrompt(view) {
  const system = [
    'You review one recorded tutoring session for an offline evaluation of the Tutor\'s decisions. You do not rewrite the session.',
    `Score each dimension 1 (poor) to 5 (excellent): ${REVIEW_DIMENSIONS.join(', ')}. For unnecessary_repetition, 5 means no unnecessary repetition.`,
    'Give concise findings, each citing the step numbers it is about. For every flagged sequence say whether the repetition was pedagogically justified.',
    'Reply with one JSON object: scores (every dimension, an integer 1-5), findings (each with the step numbers it cites and its text), flagged_sequences (each flagged id with justified true or false and a short note).',
  ].join('\n');
  return { system, user: JSON.stringify(view) };
}

export function parseReview(text, view) {
  const review = jsonIn(text);
  const scores = {};
  for (const key of REVIEW_DIMENSIONS) {
    const score = review.scores?.[key];
    if (!Number.isInteger(score) || score < 1 || score > 5) throw Error(`scores.${key} must be an integer 1-5`);
    scores[key] = score;
  }
  const steps = new Set(view.steps.map(step => step.step));
  const findings = (review.findings || []).map(finding => {
    const refs = (finding.steps || []).filter(n => steps.has(n));
    if (!refs.length || typeof finding.text !== 'string') throw Error('every finding cites at least one recorded step and has text');
    return { steps: refs, text: finding.text.trim() };
  });
  const flaggedIds = new Set(view.flagged_sequences.map(entry => entry.id));
  const judged = (review.flagged_sequences || []).filter(entry => flaggedIds.has(entry.id)).map(entry => ({ id: entry.id, justified: entry.justified === true, note: String(entry.note || '') }));
  return { scores, findings, flagged_sequences: judged };
}

// ---------- Cost ledger: a conservative reservation guard ----------

// The ceiling covers Anthropic spend only (owner O2), the learner simulator and the reviewer included. Every Anthropic
// request reserves its offline worst case (cost.mjs requestWorstCase: the complete request, priced at its own max_tokens)
// BEFORE it is sent, and a reservation that would take settled spend plus every reservation still open past the ceiling is
// refused - so requests in flight together (an evaluation beside the planner) count together, and a retry or an escalation,
// being another request, reserves again. settle() replaces a reservation with the priced usage. A request that reports no
// usage (a failure, a timeout) keeps its whole reservation as possible spend; one that costs more than its reservation
// breaks the bound: it is recorded in `violations` and the session stops. A parent ledger (the run's limit) reserves
// alongside a per-session one. Other providers (JEV / Typesafe AI, avatar or video) are outside the ceiling: their cost is
// the provider's report or unknown, never $0, so the all-provider total stays null while any is unknown. The ledger never
// infers a remaining account balance. It guards what is sent; it is not a billing cap: a request already sent cannot be
// recalled, and the token bound rests on a tokenizer assumption (docs/features/tutor-decision-eval.md §18).
export function createLedger(ceilingUsd, { date, parent = null } = {}) {
  const lines = [], open = new Map(), violations = [];
  let next = 0, refused = 0, peak = 0;
  const anthropic = () => lines.filter(line => line.provider === 'anthropic');
  const settled = () => sum(anthropic().map(line => line.cost_usd ?? line.held_usd ?? 0));
  const reserved = () => sum([...open.values()].map(ticket => ticket.usd));
  const refuse = error => { refused++; throw error; };
  const groups = (list, keyOf) => Object.fromEntries(Object.entries(Object.groupBy(list, keyOf)).map(([key, group]) => [key, {
    ...money(group), ok: group.filter(line => line.outcome === 'ok').length, failed: group.filter(line => line.outcome !== 'ok').length,
    models: [...new Set(group.map(line => line.model_id))], versions: [...new Set(group.map(line => line.model_version).filter(Boolean))], latency_ms: stats(group.map(line => line.latency_ms)),
  }]));
  const price = (fields, ticket) => {
    const priced = { outcome: 'ok', ...fields, ...priceCall({ ...fields, date }) };
    if (fields.provider !== 'anthropic') return priced;
    if (priced.cost_usd == null) {
      if (!ticket) throw Error(`no price for anthropic model ${fields.model_id}: refusing a call the ceiling cannot bound`);
      priced.held_usd = ticket.usd; // no usage reported: the reservation stays as possible spend
    } else if (ticket && priced.cost_usd > ticket.usd + 1e-9) {
      priced.bound_violation = true;
      violations.push({ model_role: fields.model_role ?? ticket.role, reserved_usd: ticket.usd, cost_usd: priced.cost_usd, input_tokens_bound: ticket.bound.input_tokens_bound, usage: priced.usage });
    }
    return priced;
  };
  return {
    lines, violations,
    spent: settled,
    reserved,
    get refused() { return refused; },
    // One request about to be sent: { provider, body, role }. Anthropic: its worst case is reserved, or COST_CEILING (or
    // UNBOUNDED_REQUEST) is thrown and nothing may be sent. Another provider: a ticket with no reservation.
    reserve({ provider = 'anthropic', body, role = 'call' }) {
      if (provider !== 'anthropic') return { id: ++next, provider, role, usd: null };
      let bound;
      try { bound = requestWorstCase(body, { date }); } catch (error) { refuse(error); }
      if (settled() + reserved() + bound.usd > ceilingUsd + 1e-12) refuse(Object.assign(Error(`cost ceiling: ${role} could cost up to $${bound.usd.toFixed(4)}, with $${settled().toFixed(4)} spent and $${reserved().toFixed(4)} reserved of $${ceilingUsd}`), { code: 'COST_CEILING' }));
      let upstream = null;
      if (parent) try { upstream = parent.reserve({ provider, body, role }); } catch (error) { refuse(error); }
      const ticket = { id: ++next, provider, role, usd: bound.usd, bound, upstream };
      open.set(ticket.id, ticket);
      peak = Math.max(peak, open.size);
      return ticket;
    },
    // A reservation given back unsent (the reviewer's holdback, swapped for its real request): no spend, no line.
    release(ticket) {
      open.delete(ticket.id);
      if (ticket.upstream) parent.release(ticket.upstream);
    },
    // The request's reported usage replaces its reservation.
    settle(ticket, fields) {
      open.delete(ticket.id);
      const priced = { ...price(fields, ticket), ...(ticket.usd != null ? { reserved_usd: ticket.usd } : {}) };
      lines.push(priced);
      if (ticket.upstream) parent.settle(ticket.upstream, fields);
      return priced;
    },
    // A line with no reservation (tests, and providers outside the ceiling).
    record(fields) { const priced = price(fields, null); lines.push(priced); return priced; },
    summary() {
      const external = lines.filter(line => line.provider !== 'anthropic');
      const unknown = external.filter(line => line.cost_usd == null).length, known = sum(external.map(line => line.cost_usd ?? 0));
      return {
        anthropic: {
          total_usd: round(sum(anthropic().map(line => line.cost_usd ?? 0)), 6), held_usd: round(sum(anthropic().map(line => (line.cost_usd == null ? line.held_usd ?? 0 : 0))), 6),
          open_reservations_usd: round(reserved(), 6), ceiling_usd: ceilingUsd, calls: anthropic().length, refused, bound_violations: violations.length, peak_open_reservations: peak,
          by_role: groups(anthropic(), line => line.model_role), by_model: groups(anthropic(), line => line.model_id),
        },
        external: groups(external, line => `${line.provider}:${line.model_role}`),
        // The ceiling covers Anthropic only; across all providers the total is unknown while any provider cost is.
        all_providers: { usd: unknown ? null : round(settled() + known, 6), lower_bound_usd: round(settled() + known, 6), unknown_cost_calls: unknown, ceiling_scope: 'anthropic' },
      };
    },
  };
}

// The complete requests the paid run sends for the eval's own two calls, so they are bounded and reserved like any other.
// Both models think by default and thinking counts against max_tokens, so each leaves room for it before the JSON: the
// simulator at effort low (a short in-character move), the reviewer at the model's default effort.
export const LEARNER_MODEL = 'claude-sonnet-5-5', REVIEWER_MODEL = 'claude-opus-5-5', LEARNER_MAX_TOKENS = 1500, REVIEWER_MAX_TOKENS = 8000;
const structured = (model, maxTokens, { system, user }, schema, effort = null) => ({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], output_config: { ...(effort ? { effort } : {}), format: { type: 'json_schema', schema } } });
export const learnerRequest = prompt => structured(LEARNER_MODEL, LEARNER_MAX_TOKENS, prompt, LEARNER_REPLY_SCHEMA, 'low');
export const reviewerRequest = prompt => structured(REVIEWER_MODEL, REVIEWER_MAX_TOKENS, prompt, REVIEW_SCHEMA);

// The eval's own model calls (the learner simulator, the reviewer): one complete request, reserved before it is sent (or
// under a ticket the caller already holds), sent through `transport`, and settled with the usage it reports.
// transport(request) -> a Messages API reply ({ id, model, usage, content }); transport.kind labels its cost lines. Free runs
// pass a scripted transport; the paid run passes product.mjs anthropicTransport.
export async function evalCall({ request, role, meter, transport, ticket = meter.reserve({ body: request, role }) }) {
  const started = performance.now();
  const settle = fields => meter.call({ provider: 'anthropic', transport: transport.kind ?? 'unknown', model_id: request.model, model_role: role, latency_ms: round(performance.now() - started, 1), ...fields }, ticket);
  let reply;
  try { reply = await transport(request); } catch (error) { settle({ outcome: 'failed', error_code: error.code ?? 'transport_error' }); throw error; }
  settle({ model_id: reply.model ?? request.model, usage: reply.usage ?? null, request_id: reply.id ?? null, outcome: 'ok' });
  return (reply.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
}

// The learner simulator as runSession's `learner`: one reserved call per move, its reply re-checked by parseLearnerReply.
export function modelLearner({ topic, profile, profiles, transport }) {
  const terms = profileTerms(profiles);
  return { reply: async ({ view }, meter) => parseLearnerReply(await evalCall({ request: learnerRequest(learnerPrompt({ topic, profile, view, terms })), role: 'learner_simulator', meter, transport }), view, terms) };
}

// The reviewer's budget is held from the session's start (owner, 2026-10-07), so a session that stops early, on the cost
// ceiling included, can still be reviewed inside the same session and run limits. The holdback is the worst case of a
// reviewer request carrying REVIEW_STEP_BYTES per step for every step the session may record, plus one step's worth for
// the topic, the goal and the flagged sequences. A real 15-step trace measured about 4.2 kB of request per step on the stub
// path; the allowance leaves room for real-model text. A review whose request outgrows the holdback reserves again and is
// recorded as refused when that does not fit; it is never sent over the limit.
export const REVIEW_STEP_BYTES = 6000;
export const reviewHoldback = ({ topic, maxDecisions, stepBytes = REVIEW_STEP_BYTES }) => reviewerRequest({ system: reviewerPrompt(reviewerView({ topic, steps: [] })).system, user: 'x'.repeat(stepBytes * (maxDecisions + 1)) });

// O1: one throwaway LEARN_DB per simulated session - the same in-memory node:sqlite database the LP1 tests build from
// repository-schema.sql (control-plane test/learn-grade-fixture.js learnDb). Never shared, closed after the session.
export async function freshLearnDb() {
  const { learnDb } = await import('../../../packages/control-plane/test/learn-grade-fixture.js');
  const closers = [];
  const { LEARN_DB, sqlite } = learnDb({ after: close => closers.push(close) });
  return { LEARN_DB, sqlite, close: () => closers.splice(0).forEach(close => close()) };
}

// ---------- The session loop ----------

// Injected (each one a product adapter - product.mjs is the real one - or a fake in tests). Each gets a `meter` for its
// provider calls: meter.reserve({ provider, body, role }) before a request (its complete body; the ledger reserves its worst
// case or throws COST_CEILING), meter.call({ provider, model_id, model_role, usage, provider_reported_cost_usd, latency_ms,
// outcome, retry_number, escalation, fallback, output_accepted, request_id, transport }, ticket) after it. The meter stamps
// the attribution (decision, hook set, material) and writes the cost event. model_role is the product's task name
// (LEARN_TASKS) or a provider role. A refusal or a broken bound stops the session even when the product swallowed the
// error (a hook set that came back unavailable, a planner 502): the loop checks the ledger after each product call.
//   tutor.start(meter) -> { evidence, context }                 starting evidence and canvas context (journey creation)
//   tutor.decide(input, meter) -> { decision, trace, estimated_learning_seconds, available_modalities, planner,
//     planner_version, material_summary, context, rabbit_hole, tutor_input, evaluated }
//     input: { kind: 'typed', text } (the learner's words; the opening first) or { kind: 'hook', option } (a hook click: no
//     words, no evidence - contract §1.4). trace: the product's tutor_decision event, carried verbatim. evaluated:
//     { evidence, evaluation, ms, blocking } when the turn evaluated the learner's words first (the product's typed turn;
//     evaluation: its status, escalation and event shapes, no text, carried on the evidence_updated event); blocking
//     means the planner waited for it (else it ran beside the planner). tutor_input: what the planner was sent.
//   tutor.observe({ response }, meter) -> { evidence }   optional: an adapter whose evidence path is separate from its turns
//     (the fake world) evaluates a typed reply here; the product evaluates it inside the next turn instead.
//   hooks({ decisions, history }, meter) -> { options: [{ id, position, text, learning_goal, ... }], trace, shown }
//   hookStart({ decision, decided }) -> 'with_material' (requested while the learner reads) | 'after_consumption' (once
//     the learner is done: blocking) | 'none' (no hooks after this decision: the product's not-a-stopping-point). The
//     product never waits for evidence first: a Tutor question waiting for an answer is not a stopping point (none), and
//     the answer is a turn whose end recomputes the hooks.
//   hookDelayMs: the product's recompute debounce, added before a hook set starts
//   learner.reply({ view }, meter) -> { selected_option_id, response }   the simulator's one move per decision: pick an
//     offered hook (a click: its words are never sent) or type (selected_option_id null)
//   materialize({ decision, material_id }, marks, meter) -> { timing_source, cache_status, cache_origin,
//     asset_applicable, durations, material_type, modality, concept_ids, claim_ids, expected_evidence, descriptors,
//     structure, node_id, links, fresh_generation_cost_usd, error_code } or { materials: [...] }   marks.started() / first()
//     / asset() stamp t6 / t7 / t9 while it runs; never called when the material is not run. It resolves at t8.
// One learner move per decision, as in the product: after the Tutor's turn the learner reads or attempts its material, then
// either clicks one of the hooks shown (the next turn is a next_step turn with no words) or types (the next turn is a typed
// turn, whose words are evaluated before they are planned). Never both: a click is never evidence and never a faked message.
// The session timeline: backend calls advance it by their measured duration; the learner's reading or attempt advances
// it by the Tutor's estimated learning time (every learner-side event says `estimated`); the learner simulator's own
// latency never enters it, and a selection is instant once options are visible and the learner is done. Background
// hooks run while the learner reads: their backend time is real, their place on the timeline starts at material ready.
// Graph: one node per generated material; edges only as the product links them, plus the learner's hook selection
// (previous node -> the node the Tutor made from it). Offered hooks stay candidate options, never nodes.
// Stops when the Tutor's estimated learning time reaches the budget, or at max_decisions (the safety cap). A thrown
// error (cost ceiling, profile leak, adapter failure) ends the session with what was recorded so far.
// reviewer: a transport for the one session review (evalCall), or null for none. With a ledger, its holdback
// (reviewHoldback) is reserved before anything else and swapped for the real request at the end, so every request of the
// session is refused before the review could stop fitting. A session with no decision, a profile leak or a broken bound is
// not reviewed.
const CALL_EVENT_FIELDS = ['reserved_usd', 'held_usd', 'bound_violation', 'provider', 'transport', 'model_id', 'model_version', 'model_role', 'decision_id', 'hook_set_id', 'material_id', 'usage', 'provider_reported_cost_usd', 'computed_cost_usd', 'cost_usd', 'cost_status', 'pricing_version', 'pricing_effective_date', 'prompt_cache_saved_usd', 'latency_ms', 'retry_number', 'escalation', 'fallback', 'output_accepted', 'speed', 'request_id', 'error_code'];
const MATERIAL_EVENT_FIELDS = ['material_type', 'modality', 'concept_ids', 'claim_ids', 'expected_evidence', 'estimated_learning_seconds', 'descriptors', 'structure', 'parent_material_id', 'material_group_id', 'fresh_generation_cost_usd', 'material_signature'];
const LEARNER_INTERACTION = { answer: 'attempt', explanation: 'attempt', activity: 'attempt', question: 'ask_about_this', confusion: 'message', acknowledge: 'message' };
export async function runSession({ topic, profile, profiles, hooks, hookStart = () => 'after_consumption', hookDelayMs = 0, learner, tutor, materialize = async () => null, reviewer = null, reviewStepBytes = REVIEW_STEP_BYTES, ledger = null, coverage = null, taxonomy = loadTaxonomy(), runId = 'run', clock = () => performance.now(), debugText = true, budgetSeconds = topic.session_budget_seconds, maxDecisions = topic.max_decisions }) {
  const terms = profileTerms(profiles);
  const ids = simulatedIds({ runId, topic, profile });
  const context = {};
  let now = 0; // the session timeline (ms)
  const { events, emit } = createEmitter({ ...ids, clock: () => now, context: () => context });
  const debug = fields => (debugText ? { debug: fields } : {});
  // A backend call: real duration, measured; returns [result, duration].
  const timed = async fn => { const start = clock(); const result = await fn(); return [result, clock() - start]; };
  let calls = 0;
  const meter = (attribution, at = () => now) => ({
    reserve: ({ provider = 'anthropic', body, role }) => (ledger ? ledger.reserve({ provider, body, role: role ?? attribution.model_role ?? 'call' }) : null),
    call(fields, ticket = null) {
      const call = { ...attribution, ...fields };
      const priced = ledger ? (ticket ? ledger.settle(ticket, call) : ledger.record(call)) : { outcome: 'ok', ...call, ...priceCall(call) };
      emit(priced.outcome !== 'ok' ? 'model_call_failed' : 'model_call_completed', { call_id: `${ids.session_id}:c${++calls}`, ...Object.fromEntries(CALL_EVENT_FIELDS.filter(key => priced[key] != null).map(key => [key, priced[key]])) }, at());
      return priced;
    },
  });
  // A refusal the product swallowed, or a request that cost more than its bound, ends the session at the next check.
  const budget = () => {
    if (ledger?.violations.length) throw Object.assign(Error('a request cost more than its reserved worst case'), { code: 'BOUND_VIOLATION' });
    if (ledger?.refused) throw Object.assign(Error('a request was refused by the cost ceiling'), { code: 'COST_CEILING' });
  };
  const history = [];
  let elapsed = 0, decisions = 0, stop = 'max_decisions', error = null, lastNode = null;
  let input = { kind: 'typed', text: topic.opening_message }, holdback = null;
  const applyContext = (next = {}, hole = null) => {
    const changed = Object.entries(next).filter(([key, value]) => context[key] !== value);
    if (!changed.length) return;
    const dive = changed.find(([key]) => key === 'dive_id');
    if (dive && context.dive_id) emit('rabbit_hole_returned', { rabbit_hole_id: context.dive_id });
    Object.assign(context, next);
    emit('canvas_context_changed', { changed: changed.map(([key]) => key) });
    // Who opened it comes from the product's Dive record (created_by); never invented.
    if (dive?.[1]) emit('rabbit_hole_opened', { ...(hole || {}), rabbit_hole_id: dive[1], opened_by: hole?.opened_by ?? 'unknown' });
  };
  // One hook set generated from `at` on the timeline: its options, when they were ready, and the product's own
  // next_steps_computed / next_steps_shown events (carried verbatim when the adapter has them).
  const hookSet = async at => {
    const hookSetId = `${ids.session_id}:h${decisions + 1}`;
    emit('next_steps_generation_started', { hook_set_id: hookSetId }, at);
    const [set, ms] = await timed(() => hooks({ decisions, history }, meter({ hook_set_id: hookSetId }, () => at)));
    budget();
    const options = set?.options || [];
    emit('next_steps_ready', { hook_set_id: hookSetId, options, ...(set?.unavailable ? { unavailable: set.unavailable } : {}), ...(set?.trace ? { trace: set.trace } : {}) }, at + ms);
    if (options.length) emit('next_steps_shown', { hook_set_id: hookSetId, ...(set?.shown ? { trace: set.shown } : {}) }, at + ms);
    return { hookSetId, options, ready: at + ms };
  };
  try {
    emit('session_started', debug({ goal: topic.learner_goal }));
    if (reviewer && ledger) holdback = ledger.reserve({ body: reviewHoldback({ topic, maxDecisions, stepBytes: reviewStepBytes }), role: 'session_reviewer' });
    const started = await tutor.start(meter({}));
    budget();
    applyContext(started.context);
    emit('evidence_updated', { claims: started.evidence ?? [], cause: 'session_start' });
    assertNoProfileLeak(input.text, terms);
    emit('learner_message', { kind: 'opening', input: 'typed', chars: input.text.length, ...debug({ text: input.text }) });
    while (decisions < maxDecisions) {
      // 1. The Tutor's turn (the real runTurn behind the adapter) on learner-visible input only.
      const decisionId = `${ids.session_id}:d${decisions + 1}`;
      const sent = { ...input, history: history.map(({ material, learner: said }) => ({ material, learner: said })) };
      assertNoProfileLeak({ text: sent.text ?? null, history: sent.history.map(entry => entry.learner) }, terms);
      const startAt = now, trigger = input.kind === 'hook' ? 'hook' : decisions ? 'typed' : 'opening';
      let decided, decideMs;
      try { [decided, decideMs] = await timed(() => tutor.decide(sent, meter({ decision_id: decisionId }, () => startAt))); }
      catch (thrown) { emit('tutor_decision_started', { decision_id: decisionId, trigger }, startAt); budget(); throw thrown; } // recorded as incomplete
      budget();
      assertNoProfileLeak(decided.tutor_input ?? '', terms);
      // A typed turn evaluates the words first. Evaluation the planner waited for ends before the plan starts (t4), so the
      // decision was made on it; one that ran beside the planner lands during the turn, after the decision began.
      const evaluated = decided.evaluated ?? null, evaluatedAt = startAt + (evaluated?.ms ?? 0);
      const judged = evaluated?.evaluation ? { evaluation: evaluated.evaluation } : {};
      if (evaluated?.blocking) emit('evidence_updated', { claims: evaluated.evidence, cause: 'learner_message', ...judged }, evaluatedAt);
      emit('tutor_decision_started', { decision_id: decisionId, trigger }, evaluated?.blocking ? evaluatedAt : startAt);
      if (evaluated && !evaluated.blocking) emit('evidence_updated', { claims: evaluated.evidence, cause: 'learner_message', ...judged }, evaluatedAt);
      now = startAt + decideMs;
      applyContext(decided.context, decided.rabbit_hole);
      emit('tutor_action_ready', { decision_id: decisionId, decision: decided.decision, estimated_learning_seconds: decided.estimated_learning_seconds ?? null, available_modalities: decided.available_modalities ?? null, planner: decided.planner ?? null, planner_version: decided.planner_version ?? null, ...(decided.trace ? { trace: decided.trace } : {}), ...debug({ material_summary: decided.material_summary ?? null }) });
      decisions++;
      elapsed += decided.estimated_learning_seconds || 0;
      const last = elapsed >= budgetSeconds || decisions >= maxDecisions;
      // 2. The learner-facing material, up to a validated payload; never rendered.
      const materialId = `${decisionId}:m1`;
      const base = now, realStart = clock();
      let firstReady = null;
      const at = () => base + (clock() - realStart);
      const tag = { decision_id: decisionId, material_id: materialId };
      const marks = {
        started: () => emit('material_generation_started', tag, at()),
        first: () => { firstReady ??= at(); emit('material_first_ready', tag, firstReady); },
        asset: () => emit('provider_asset_generated', tag, at()),
      };
      const material = await materialize({ decision: decided.decision, decided, material_id: materialId }, marks, meter(tag, at));
      now = at();
      // One decision may produce one material or several related ones ({ materials: [...] }): each keeps its own id,
      // events, node and links; the cardinality is the product's, never assumed here. A material's subcards stay its
      // structure. The adapter attributes a generation call to another material by passing material_id to meter.call.
      const items = Array.isArray(material?.materials)
        ? material.materials.map((item, i) => ({ timing_source: material.timing_source, cache_status: material.cache_status, ...item, material_id: item.material_id ?? `${decisionId}:m${i + 1}` }))
        : material ? [{ ...material, material_id: materialId }] : [];
      const made = items.filter(item => !item.error_code && item.timing_source !== 'not_run');
      let firstNode = true;
      for (const item of items) {
        const own = { decision_id: decisionId, material_id: item.material_id };
        if (item.error_code) { emit('material_failed', { ...own, error_code: item.error_code }); continue; }
        if (item.timing_source === 'not_run') continue;
        emit('material_complete', { ...own, timing_source: item.timing_source, cache_status: item.cache_status ?? 'not_applicable', cache_origin: item.cache_origin ?? null, asset_applicable: !!item.asset_applicable, durations: item.durations ?? null, ...Object.fromEntries(MATERIAL_EVENT_FIELDS.filter(key => item[key] != null).map(key => [key, item[key]])) });
        const nodeId = item.node_id ?? item.material_id;
        emit('material_node_created', { node_id: nodeId, ...own, material_type: item.material_type ?? null, modality: item.modality ?? decided.decision?.modality ?? null, concept_ids: item.concept_ids ?? [], claim_ids: item.claim_ids ?? [], planner_version: decided.planner_version ?? null, ...(context.dive_id ? { rabbit_hole_id: context.dive_id } : {}) });
        let edges = 0;
        const link = fields => emit('material_link_created', { edge_id: `${nodeId}:e${++edges}`, to_node_id: nodeId, decision_id: decisionId, ...fields });
        // The learner's selection leads to the decision's first material; the product links the rest.
        if (firstNode && input.kind === 'hook' && lastNode) link({ from_node_id: lastNode, relation_type: 'next_step_selection', created_by: 'learner' });
        for (const edge of item.links || []) link({ reason_codes: [], ...edge });
        firstNode = false;
        lastNode = nodeId;
      }
      const generated = made.length > 0;
      // 3. The learner reads or attempts it; the next hook set may already be generating in the background.
      const consumeFrom = material?.timing_source === 'measured' ? firstReady ?? now : now;
      emit('learner_consumption_started', { decision_id: decisionId, timing_source: 'estimated' }, consumeFrom);
      // The first material is visible from its first ready payload; the others once they are complete.
      made.forEach((item, i) => emit('material_visibility', { material_id: item.material_id, visible: true, timing_source: 'estimated' }, i ? now : consumeFrom));
      const done = consumeFrom + (decided.estimated_learning_seconds || 0) * 1000;
      emit('learner_consumption_finished', { decision_id: decisionId, timing_source: 'estimated' }, done);
      // 4. Professor Next Steps after this turn, as the product decides: requested while the learner reads, once they are
      // done, or not at all (not a stopping point). None after the last decision: nobody would see them.
      const policy = last ? 'none' : hookStart({ decision: decided.decision, decided });
      const set = policy === 'with_material' ? await hookSet(consumeFrom + hookDelayMs) : policy === 'after_consumption' ? await hookSet(done + hookDelayMs) : null;
      // 5. The learner's one move: a hook click, or typed words. The simulator moves once it is done and has seen the
      // options it is given, so a typed reply after visible options overrides them, and waiting for them is a wait.
      const options = set?.options || [];
      const moveAt = set ? Math.max(set.ready, done) : done;
      const { selected_option_id, response } = await learner.reply({ view: learnerView({ material: decided.material_summary ?? null, options }, history) }, meter({ decision_id: decisionId }));
      const picked = selected_option_id != null ? options.find(option => option.id === selected_option_id) : null;
      if (selected_option_id != null && !picked) throw Error(`the learner chose ${selected_option_id}, not an offered option`);
      if (generated) for (const item of made) emit('material_visibility', { material_id: item.material_id, visible: false, timing_source: 'estimated' }, done);
      if (picked) {
        emit('next_step_selected', { hook_set_id: set.hookSetId, option_id: picked.id, position: picked.position }, moveAt);
        now = Math.max(now, moveAt);
        history.push({ material: decided.material_summary ?? null, learner: null });
        input = { kind: 'hook', option: { id: picked.id, position: picked.position, text: picked.text } };
      } else {
        assertNoProfileLeak(response.text, terms);
        emit('learner_message', { decision_id: decisionId, kind: response.kind, input: response.kind === 'activity' ? 'activity' : 'typed', chars: response.text.length, ...(response.choice_id != null ? { choice_id: response.choice_id } : {}), ...debug({ text: response.text }) }, moveAt);
        if (generated) {
          // ponytail: the simulated reply is attributed to the decision's last material (the one that asks for it).
          const target = made.at(-1).material_id;
          const interaction = LEARNER_INTERACTION[response.kind] ?? 'message';
          emit('material_interaction', { material_id: target, interaction, meaningful: true, timing_source: 'estimated' }, done);
          // Only an attempt completes a material; reading time alone is exposure, never completion.
          if (interaction === 'attempt') emit('material_completed', { material_id: target, timing_source: 'estimated' }, done);
        }
        now = Math.max(now, moveAt);
        // An adapter with a separate evidence path evaluates the reply now; the product evaluates it in the next turn.
        if (tutor.observe) {
          const [observed, observeMs] = await timed(() => tutor.observe({ response }, meter({ decision_id: decisionId }, () => moveAt)));
          emit('evidence_updated', { claims: observed.evidence ?? [], cause: 'learner_message', ...(observed.evaluators ? { evaluators: observed.evaluators } : {}) }, moveAt + observeMs);
          now = Math.max(now, moveAt + observeMs);
        }
        history.push({ material: decided.material_summary ?? null, learner: response.text });
        input = { kind: 'typed', text: response.text };
      }
      if (elapsed >= budgetSeconds) { stop = 'learning_budget'; break; }
    }
  } catch (thrown) {
    // The ledger knows when a refusal or a broken bound caused the failure, even when the product reported it as a 502.
    const code = thrown.code === 'PROFILE_LEAK' ? thrown.code : ledger?.violations.length ? 'BOUND_VIOLATION' : ledger?.refused ? 'COST_CEILING' : thrown.code;
    stop = code === 'BOUND_VIOLATION' ? 'cost_bound_violation' : code === 'COST_CEILING' ? 'cost_ceiling' : code === 'PROFILE_LEAK' ? 'profile_leak' : 'error';
    error = { code: code ?? null, message: thrown.message };
  }
  // The review: the holdback is given back and the real request reserved in the same tick, so nothing can take the room.
  let review = null;
  if (holdback) ledger.release(holdback);
  if (reviewer) {
    const skip = !decisions ? 'no_decisions' : ['profile_leak', 'cost_bound_violation'].includes(stop) ? stop : null;
    if (skip) review = { status: 'skipped', reason: skip };
    else {
      const steps = foldSession(events).steps;
      const view = reviewerView({ topic, steps, flagged: groupMetrics([steps], taxonomy).repetition.flagged_sequences });
      try {
        review = { status: 'ok', ...parseReview(await evalCall({ request: reviewerRequest(reviewerPrompt(view)), role: 'session_reviewer', meter: meter({}), transport: reviewer }), view) };
      } catch (thrown) {
        review = { status: thrown.code === 'COST_CEILING' ? 'refused' : 'failed', error: { code: thrown.code ?? null, message: thrown.message } };
      }
    }
    if (holdback) review.holdback_usd = holdback.usd;
  }
  emit('session_ended', { reason: stop, decisions, learning_seconds_estimated: elapsed });
  const folded = foldSession(events);
  const graph = learningGraph(events);
  return {
    eval_schema_version: EVAL_SCHEMA_VERSION,
    harness_version: HARNESS_VERSION,
    // Simulator-only: never sent to the Tutor, the hooks, or the reviewer.
    simulator: { topic: topic.id, profile: profile.id, run_id: runId, config_hash: configHash({ topic, profile }), budget_seconds: budgetSeconds, max_decisions: maxDecisions, stop_reason: stop, ...(error ? { error } : {}) },
    session: folded.meta,
    events,
    // Derived from events for reading convenience; aggregate.json recomputes everything from `events`.
    steps: folded.steps,
    learning_graph: { ...graph, metrics: graphMetrics(graph, { steps: folded.steps, taxonomy }) },
    ...(review ? { review } : {}),
    ...(ledger ? { cost: ledger.summary() } : {}),
    // What the adapter exercised and did not (product.mjs COVERAGE): carried so a report can never read more into a run.
    ...(coverage ? { coverage } : {}),
  };
}

// ---------- Results ----------

export const sessionFile = bundle => `${bundle.simulator.topic}-${bundle.simulator.profile}.json`;
export function writeSession(dir, bundle) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, sessionFile(bundle)), `${JSON.stringify(bundle, null, 2)}\n`);
}
// The session bundles only: aggregate.json and the paid run's run.json manifest share the directory.
export const readSessions = dir => readdirSync(dir).filter(name => name.endsWith('.json') && !['aggregate.json', 'run.json'].includes(name)).sort().map(name => readJson(join(dir, name)));
