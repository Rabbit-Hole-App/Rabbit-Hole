// Tutor decision evaluation harness (docs/features/tutor-decision-eval.md): the generic, interface-independent half.
// Fixtures, the hidden-profile guard, the session loop that writes the event stream (events.mjs), the learner and
// reviewer views, prompts and reply schemas, the cost ledger, and the throwaway per-session LEARN_DB. Everything
// that talks to the product - the Tutor turn, the hooks, the material generator, the evidence path - is injected, so
// the loop never knows a topic, a profile or a model. No model is called from this file.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRACE_SCHEMA_VERSION, createEmitter, foldSession } from './events.mjs';
import { stats } from './metrics.mjs';

const HERE = new URL('.', import.meta.url);
export const HARNESS_VERSION = 'tutor-session-eval-0';

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

export const loadTaxonomy = (path = new URL('fixtures/taxonomy.provisional.json', HERE)) => readJson(path);

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

// The learner simulator sees the material summary, the hook texts and its own past exchange - never reason codes,
// rationale, expected evidence, evidence state, hidden learning goals or answers.
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
// strict parsers below re-check every reply anyway.
export const LEARNER_REPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['selected_option_id', 'response'],
  properties: {
    selected_option_id: { type: ['string', 'null'] },
    response: {
      type: 'object', additionalProperties: false, required: ['kind', 'text', 'choice_id'],
      properties: { kind: { type: 'string', enum: RESPONSE_KINDS }, text: { type: 'string' }, choice_id: { type: ['string', 'null'] } },
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
    'Reply with one JSON object: selected_option_id is one of the offered option ids, or null when there are none; response.kind is what you are doing; response.text is what you type; response.choice_id is the option you choose in a multiple-choice activity, or null.',
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
  if (ids.length && !ids.includes(reply.selected_option_id)) throw Error(`selected_option_id ${reply.selected_option_id} is not one of ${ids.join(', ')}`);
  const response = reply.response || {};
  if (!RESPONSE_KINDS.includes(response.kind)) throw Error(`response.kind ${response.kind} is not one of ${RESPONSE_KINDS.join(', ')}`);
  if (typeof response.text !== 'string') throw Error('response.text must be a string');
  assertNoProfileLeak(response.text, terms);
  return { selected_option_id: ids.length ? reply.selected_option_id : null, response: { kind: response.kind, text: response.text.trim(), choice_id: response.choice_id ?? null } };
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

// ---------- Cost ledger with a hard ceiling ----------

// USD per MTok, first-party (claude-api skill, cached 2026-09-25): input, output, cache read; a 5-minute cache write
// is 1.25x input. Same table as e2e/tutor-corpus-run.mjs, which cannot be imported (it runs on import).
export const PRICES = { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-haiku-4-5-20251001': [1, 5, 0.1] };
export function usd(model, usage = {}) {
  const price = PRICES[model];
  if (!price) throw Error(`no price for model ${model}: refusing to account a call the ceiling cannot bound`);
  return ((usage.input_tokens || 0) * price[0] + (usage.output_tokens || 0) * price[1] + (usage.cache_creation_input_tokens || 0) * price[0] * 1.25 + (usage.cache_read_input_tokens || 0) * price[2]) / 1e6;
}

// guard() before a call with its worst case; record() after with the real usage. A call whose worst case would cross
// the ceiling is refused before it is made. The ceiling is the Anthropic model spend only.
// recordExternal(): a non-Anthropic provider (JEV / Typesafe AI), logged apart from the ceiling. Its cost is the
// provider's own billing metadata when it returns one, else cost_usd null and cost_status "unknown" - never a guess.
// ponytail: input tokens estimated as chars / 3 (an over-count for English); use count_tokens if the ceiling gets tight.
export function createLedger(ceilingUsd) {
  const calls = [], external = [];
  const spent = () => calls.reduce((total, call) => total + call.usd, 0);
  const cents = x => Math.round(x * 1e4) / 1e4;
  return {
    calls,
    external,
    spent,
    worstCase: ({ model, inputChars = 0, maxOutputTokens = 0 }) => usd(model, { input_tokens: Math.ceil(inputChars / 3), output_tokens: maxOutputTokens }),
    guard(role, estimateUsd) {
      if (spent() + estimateUsd > ceilingUsd) throw Object.assign(Error(`cost ceiling: ${role} could cost $${estimateUsd.toFixed(4)} with $${spent().toFixed(4)} of $${ceilingUsd} spent`), { code: 'COST_CEILING' });
    },
    record({ role, model, usage = {}, ms = null, effort = null, outcome = 'ok' }) {
      const call = { role, model, effort, ms, outcome, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, cache_creation_input_tokens: usage.cache_creation_input_tokens || 0, cache_read_input_tokens: usage.cache_read_input_tokens || 0, usd: usd(model, usage) };
      calls.push(call);
      return call;
    },
    recordExternal({ role, provider, model = null, version = null, ms = null, outcome = 'ok', billing = null }) {
      const cost = billing?.cost_usd;
      const call = { role, provider, model, version, ms, outcome, cost_usd: Number.isFinite(cost) ? cost : null, cost_status: Number.isFinite(cost) ? 'reported' : 'unknown', billing };
      external.push(call);
      return call;
    },
    summary: () => ({
      anthropic: {
        total_usd: cents(spent()), ceiling_usd: ceilingUsd, calls: calls.length,
        by_role: Object.fromEntries(Object.entries(Object.groupBy(calls, call => call.role)).map(([role, list]) => [role, { calls: list.length, usd: cents(list.reduce((n, call) => n + call.usd, 0)), models: [...new Set(list.map(call => call.model))], latency_ms: stats(list.map(call => call.ms)) }])),
      },
      external: Object.fromEntries(Object.entries(Object.groupBy(external, call => call.role)).map(([role, list]) => {
        const reported = list.filter(call => call.cost_status === 'reported');
        return [role, {
          calls: list.length, ok: list.filter(call => call.outcome === 'ok').length, failed: list.filter(call => call.outcome !== 'ok').length,
          providers: [...new Set(list.map(call => call.provider))], models: [...new Set(list.map(call => call.model).filter(Boolean))], versions: [...new Set(list.map(call => call.version).filter(Boolean))],
          latency_ms: stats(list.map(call => call.ms)),
          cost_usd: reported.length && reported.length === list.length ? cents(reported.reduce((n, call) => n + call.cost_usd, 0)) : null,
          cost_status: !reported.length ? 'unknown' : reported.length === list.length ? 'reported' : 'partial',
          ...(reported.length && reported.length < list.length ? { reported_cost_usd: cents(reported.reduce((n, call) => n + call.cost_usd, 0)), reported_calls: reported.length } : {}),
        }];
      })),
    }),
  };
}

// O1: one throwaway LEARN_DB per simulated session - the same in-memory node:sqlite database the LP1 tests build from
// repository-schema.sql (control-plane test/learn-grade-fixture.js learnDb). Never shared, closed after the session.
export async function freshLearnDb() {
  const { learnDb } = await import('../../../packages/control-plane/test/learn-grade-fixture.js');
  const closers = [];
  const { LEARN_DB, sqlite } = learnDb({ after: close => closers.push(close) });
  return { LEARN_DB, sqlite, close: () => closers.splice(0).forEach(close => close()) };
}

// ---------- The session loop ----------

// Injected (each one a product adapter, or a fake in tests):
//   tutor.start() -> { evidence, context }                       the learner's starting evidence and canvas context
//   tutor.decide({ message, selected_option, history }) -> { decision, estimated_learning_seconds, available_modalities,
//     planner, planner_version, material_summary, context, tutor_input }   tutor_input: what the planner was sent
//   tutor.observe({ response }) -> { evidence }                  the real evidence path on the learner's response
//   hooks({ decisions, history }) -> { options: [{ id, position, text, learning_goal }] }
//   hookStart({ decision }) -> 'with_material' | 'after_evidence'   when the product starts the next hook set: in the
//     background as soon as the material is ready, or once the learner's answer is committed. The product's own
//     recompute policy decides; the default assumes every hook set waits for evidence.
//   learner.choose({ view }) -> { selected_option_id }           learner.respond({ view }) -> { response }
//   materialize({ decision }, marks) -> { timing_source, cache_status, cache_origin, asset_applicable, durations,
//     material_signature, error_code }  marks.started() / first() / asset() stamp t6 / t7 / t9 while it runs; never
//     called when the material is not run. It resolves at t8.
// The session timeline: backend calls advance it by their measured duration; the learner's reading or attempt advances
// it by the Tutor's estimated learning time (learner_consumption_* events say `estimated`); the learner simulator's own
// latency never enters it, and a selection is instant once options are visible and the learner is done. Background
// hooks run while the learner reads: their backend time is real, their place on the timeline starts at material ready.
// Stops when the Tutor's estimated learning time reaches the budget, or at max_decisions (the safety cap). A thrown
// error (cost ceiling, profile leak, adapter failure) ends the session with what was recorded so far.
export async function runSession({ topic, profile, profiles, hooks, hookStart = () => 'after_evidence', learner, tutor, materialize, runId = 'run', clock = () => performance.now(), debugText = true, budgetSeconds = topic.session_budget_seconds, maxDecisions = topic.max_decisions }) {
  const terms = profileTerms(profiles);
  const ids = simulatedIds({ runId, topic, profile });
  const context = {};
  let now = 0; // the session timeline (ms)
  const { events, emit } = createEmitter({ ...ids, clock: () => now, context: () => context });
  const debug = fields => (debugText ? { debug: fields } : {});
  // A backend call: real duration, measured; returns [result, duration].
  const timed = async fn => { const start = clock(); const result = await fn(); return [result, clock() - start]; };
  const history = [];
  let elapsed = 0, decisions = 0, stop = 'max_decisions', error = null, message = topic.opening_message, selected = null;
  const applyContext = (next = {}) => {
    const changed = Object.entries(next).filter(([key, value]) => context[key] !== value);
    if (!changed.length) return;
    const dive = changed.find(([key]) => key === 'dive_id');
    if (dive && context.dive_id) emit('rabbit_hole_left', { dive_id: context.dive_id });
    Object.assign(context, next);
    emit('canvas_context_changed', { changed: changed.map(([key]) => key) });
    if (dive?.[1]) emit('rabbit_hole_entered', { dive_id: dive[1] });
  };
  // One hook set generated from `at` on the timeline: its options and when they were ready.
  const hookSet = async at => {
    const hookSetId = `${ids.session_id}:h${decisions + 1}`;
    emit('next_steps_generation_started', { hook_set_id: hookSetId }, at);
    const [set, ms] = await timed(() => hooks({ decisions, history }));
    const options = set?.options || [];
    emit('next_steps_ready', { hook_set_id: hookSetId, options }, at + ms);
    return { hookSetId, options, ready: at + ms };
  };
  try {
    emit('session_started', debug({ goal: topic.learner_goal }));
    const started = await tutor.start();
    applyContext(started.context);
    emit('evidence_updated', { claims: started.evidence ?? [], cause: 'session_start' });
    assertNoProfileLeak(message, terms);
    emit('learner_message', { kind: 'opening', input: 'typed', chars: message.length, ...debug({ text: message }) });
    while (decisions < maxDecisions) {
      // 1. The Tutor's validated decision (the real planner behind the adapter), on learner-visible input only.
      const decisionId = `${ids.session_id}:d${decisions + 1}`;
      const input = { message, selected_option: selected && { id: selected.id, text: selected.text }, history: history.map(({ material, learner: said }) => ({ material, learner: said })) };
      assertNoProfileLeak({ message: input.message, history: input.history.map(entry => entry.learner) }, terms);
      emit('tutor_decision_started', { decision_id: decisionId, trigger: selected ? 'hook' : decisions ? 'typed' : 'opening' });
      const [decided, decideMs] = await timed(() => tutor.decide(input));
      now += decideMs;
      assertNoProfileLeak(decided.tutor_input ?? '', terms);
      applyContext(decided.context);
      emit('tutor_action_ready', { decision_id: decisionId, decision: decided.decision, estimated_learning_seconds: decided.estimated_learning_seconds ?? null, available_modalities: decided.available_modalities ?? null, planner: decided.planner ?? null, planner_version: decided.planner_version ?? null, ...debug({ material_summary: decided.material_summary ?? null }) });
      decisions++;
      elapsed += decided.estimated_learning_seconds || 0;
      const last = elapsed >= budgetSeconds || decisions >= maxDecisions;
      // 2. The learner-facing material, up to a validated payload; never rendered.
      const base = now, realStart = clock();
      let firstReady = null;
      const at = () => base + (clock() - realStart);
      const marks = {
        started: () => emit('material_generation_started', { decision_id: decisionId }, at()),
        first: () => { firstReady ??= at(); emit('material_first_ready', { decision_id: decisionId }, firstReady); },
        asset: () => emit('asset_ready', { decision_id: decisionId }, at()),
      };
      const material = await materialize({ decision: decided.decision }, marks);
      now = at();
      if (material?.error_code) emit('material_failed', { decision_id: decisionId, error_code: material.error_code });
      else if (material && material.timing_source !== 'not_run') emit('material_complete', { decision_id: decisionId, timing_source: material.timing_source, cache_status: material.cache_status ?? 'not_applicable', cache_origin: material.cache_origin ?? null, asset_applicable: !!material.asset_applicable, durations: material.durations ?? null, material_signature: material.material_signature ?? null });
      // 3. The learner reads or attempts it; the next hook set may already be generating in the background.
      const consumeFrom = material?.timing_source === 'measured' ? firstReady ?? now : now;
      emit('learner_consumption_started', { decision_id: decisionId, timing_source: 'estimated' }, consumeFrom);
      // ponytail: the last decision's background hooks are skipped; nobody would see them.
      const background = !last && hookStart({ decision: decided.decision }) === 'with_material' ? await hookSet(consumeFrom) : null;
      const { response } = await learner.respond({ view: learnerView({ material: decided.material_summary ?? null }, history) });
      assertNoProfileLeak(response.text, terms);
      const done = consumeFrom + (decided.estimated_learning_seconds || 0) * 1000;
      emit('learner_consumption_finished', { decision_id: decisionId, timing_source: 'estimated' }, done);
      emit('learner_message', { decision_id: decisionId, kind: response.kind, input: response.kind === 'activity' ? 'activity' : 'typed', chars: response.text.length, ...(response.choice_id != null ? { choice_id: response.choice_id } : {}), ...debug({ text: response.text }) }, done);
      // 4. The real evidence path reads what they did.
      const [observed, observeMs] = await timed(() => tutor.observe({ response }));
      emit('evidence_updated', { claims: observed.evidence ?? [], cause: 'learner_message', ...(observed.evaluators ? { evaluators: observed.evaluators } : {}) }, done + observeMs);
      now = Math.max(now, done + observeMs);
      history.push({ material: decided.material_summary ?? null, learner: response.text });
      message = response.text;
      selected = null;
      if (elapsed >= budgetSeconds) { stop = 'learning_budget'; break; }
      if (decisions >= maxDecisions) break;
      // 5. Professor Next Steps for the next decision, and the learner's pick (instant once visible and done reading).
      const set = background ?? await hookSet(now);
      if (set.options.length) {
        const { selected_option_id } = await learner.choose({ view: learnerView({ material: decided.material_summary ?? null, options: set.options }, history) });
        selected = set.options.find(option => option.id === selected_option_id);
        if (!selected) throw Error(`the learner chose ${selected_option_id}, not an offered option`);
        const click = Math.max(set.ready, done);
        emit('next_step_selected', { hook_set_id: set.hookSetId, option_id: selected.id, position: selected.position }, click);
        now = Math.max(now, click);
      } else now = Math.max(now, set.ready);
    }
  } catch (thrown) {
    stop = thrown.code === 'COST_CEILING' ? 'cost_ceiling' : thrown.code === 'PROFILE_LEAK' ? 'profile_leak' : 'error';
    error = { code: thrown.code ?? null, message: thrown.message };
  }
  emit('session_ended', { reason: stop, decisions, learning_seconds_estimated: elapsed });
  const folded = foldSession(events);
  return {
    trace_schema_version: TRACE_SCHEMA_VERSION,
    harness_version: HARNESS_VERSION,
    // Simulator-only: never sent to the Tutor, the hooks, or the reviewer.
    simulator: { topic: topic.id, profile: profile.id, run_id: runId, config_hash: configHash({ topic, profile }), budget_seconds: budgetSeconds, max_decisions: maxDecisions, stop_reason: stop, ...(error ? { error } : {}) },
    session: folded.meta,
    events,
    // Derived from events for reading convenience; aggregate.json recomputes everything from `events`.
    steps: folded.steps,
  };
}

// ---------- Results ----------

export const sessionFile = bundle => `${bundle.simulator.topic}-${bundle.simulator.profile}.json`;
export function writeSession(dir, bundle) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, sessionFile(bundle)), `${JSON.stringify(bundle, null, 2)}\n`);
}
export const readSessions = dir => readdirSync(dir).filter(name => name.endsWith('.json') && name !== 'aggregate.json').sort().map(name => readJson(join(dir, name)));
