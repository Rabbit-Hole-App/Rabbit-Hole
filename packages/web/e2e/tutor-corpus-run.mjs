// Tutor architecture v2: the FREE corpus runner (docs/features/tutor-architecture-v2.md). Runs every
// trace in tutor-corpus.mjs through the real Tutor modules - runTurn in the browser code, and the
// worker's own /evaluate path (validateEvaluateBody + evaluateFreeText, so the escalation policy is
// the real one) - with JEV, the larger evaluator and the planner answered by the corpus stubs. No
// network, no model call, no cost. Scores the deterministic pipeline (selection, evaluation ladder,
// evidence, routing, validation) against each turn's expectations and counts calls and planner
// context size. Latency here is not model latency.
// --live: PAID. The same corpus on the real JEV, larger evaluator and planner (keys from
// packages/web/.dev.vars, gitignored), with per-rung latency and tokens; the stub answers are unused
// and the expectations then score the real models. Refused unless TUTOR_BENCH_PAID=GO is set, which
// only the owner's GO BENCHMARK authorises; never from make.
// --candidate (live only): the benchmark arm, i.e. the worker's planner knobs for this run (CANDIDATES
// below, owner decisions 3 and 5). The stub run reports which tier a fast arm would pick per turn
// without calling anything. Live, the arm decides streaming (--stream is for stub runs only).
// Groups (owner): routine / evaluation-independent, evidence-dependent and structural turns, by
// category (GROUP_OF); never one average. e2e/tutor-bench-gates.mjs applies decision 6 to the rows.
// --stream (v2 checkpoint I): turns ask for the plan's first sentence early (runTurn onSpeakable). Stub:
// the scripted plan, written as the planner is asked to (Decision 4: constraints_add, the other control
// fields and strategy first, then actions), is streamed through the real planTurn as SSE;
// live: the real streamed planner, with the time to the first sentence.
// Usage: node e2e/tutor-corpus-run.mjs [--stage A] [--out dir] [--stream] [--live [--candidate G-default]]
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cardBlock } from '../src/nanogpt/board.js';
import { applyCheck, applyNewAttempt, enterPractice, setActivityAnswer } from '../src/scene-activity.js';
import { applyInputToBlock } from '../src/scene-evaluate.js';
import { resolveTarget } from '../src/learn-target.js';
import { CLAIMS, SLICE_CARDS, cardModule, ladderStep } from '../src/learn-tutor-claims.js';
import { statedConstraints } from '../src/learn-tutor-validate.js';
import { partIndex } from '../src/nanogpt/depth/board.js';
import { emptyStore } from '../src/learn-tutor-evidence.js';
import { arriveAt, enterHole, keepHere, markOpened, openingQuestion, runTurn } from '../src/learn-tutor.js';
import { evaluateFreeText, FAST_PLANNER_MODELS, plannerTier, planTurn, validateEvaluateBody } from '../../control-plane/src/learn-tutor-routes.js';
import { LEARN_TASKS } from '../../control-plane/src/learn-models.js';
import { firstSentence, PLANNER_SYSTEM, TUTOR_TOOL, tutorQuestions } from '../../control-plane/src/agents/learn-tutor.js';
import { CORPUS } from './tutor-corpus.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const STAGE = flag('stage', 'A'), OUT = flag('out', 'tutor-bench-out'), LIVE = args.includes('--live');
// USD per MTok, first-party rates (claude-api skill, cached 2026-09-25): input, output, cache read.
// A 5-minute cache write is 1.25x input. Opus 5.5 fast mode is $8 / $40 (2x); its cache prices are taken
// as 2x too (assumption: the skill gives only the fast input and output rates).
const PRICES = { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-haiku-4-5-20251001': [1, 5, 0.1] };
const FAST_MODE_X = 2, CACHE_WRITE_X = 1.25;
const usd = t => { const p = PRICES[t.model]; if (!p) return 0; const x = t.speed === 'fast' ? FAST_MODE_X : 1; return x * ((t.in || 0) * p[0] + (t.out || 0) * p[1] + (t.cw || 0) * p[0] * CACHE_WRITE_X + (t.cr || 0) * p[2]) / 1e6; };
if (LIVE && process.env.TUTOR_BENCH_PAID !== 'GO') throw Error('--live makes paid model calls: set TUTOR_BENCH_PAID=GO only after the owner typed GO BENCHMARK');
// The benchmark arms (owner decisions 3 and 5, 2026-10-01). Same corpus, same JEV and the same larger
// evaluator (5C: fixed, Opus 5.5) in every arm; only the planner knobs differ. Opus effort stays at the
// model default (medium) everywhere, so each arm changes one thing.
//   A  Opus 5.5 as Baseline A: no streaming, no caching (the v2 pipeline: compact state, critical path)
//   B  optimized Opus 5.5: first-sentence streaming + prompt caching (5A)
//   C  B + Opus 5.5 fast mode (5B; documented, first-party API only)
//   D  B + Haiku 4.5 fast tier, Opus escalation (no cache below Haiku's 4096-token minimum; Haiku 4.5
//      takes no effort parameter, so none is sent)
//   E  B + Sonnet 5.5 fast tier at its DEFAULT effort (high), Opus escalation
//   F  B + Sonnet 5.5 fast tier at effort low (documented for Sonnet 5.5), Opus escalation: E and F
//      separate the model from the effort (owner answer D)
const CANDIDATES = {
  A: { stream: false, env: {} },
  B: { stream: true, env: { TUTOR_PLANNER_CACHE: 'on' } },
  C: { stream: true, env: { TUTOR_PLANNER_CACHE: 'on', TUTOR_PLANNER_SPEED: 'fast' } },
  D: { stream: true, env: { TUTOR_PLANNER_CACHE: 'on', TUTOR_PLANNER_FAST_MODEL: 'claude-haiku-4-5-20251001' } },
  E: { stream: true, env: { TUTOR_PLANNER_CACHE: 'on', TUTOR_PLANNER_FAST_MODEL: 'claude-sonnet-5-5' } },
  F: { stream: true, env: { TUTOR_PLANNER_CACHE: 'on', TUTOR_PLANNER_FAST_MODEL: 'claude-sonnet-5-5', TUTOR_PLANNER_FAST_EFFORT: 'low' } },
};
const CANDIDATE = flag('candidate', 'B');
if (!CANDIDATES[CANDIDATE]) throw Error(`--candidate is one of ${Object.keys(CANDIDATES).join(', ')}`);
// Decision 3: the exact model ids, never substituted.
const EXPECTED_MODELS = { planner: 'claude-opus-5-5', evaluator: 'claude-opus-5-5' };
if (LEARN_TASKS.tutor.model !== EXPECTED_MODELS.planner || LEARN_TASKS.tutor_evaluator.model !== EXPECTED_MODELS.evaluator) throw Error('the planner and larger evaluator must be claude-opus-5-5 (decision 3)');
for (const { env } of Object.values(CANDIDATES)) {
  if (env.TUTOR_PLANNER_FAST_MODEL && !FAST_PLANNER_MODELS.includes(env.TUTOR_PLANNER_FAST_MODEL)) throw Error(`unknown fast model ${env.TUTOR_PLANNER_FAST_MODEL}`);
  if (env.TUTOR_PLANNER_FAST_EFFORT && env.TUTOR_PLANNER_FAST_MODEL?.startsWith('claude-haiku')) throw Error('Haiku 4.5 takes no effort parameter: never send one');
}
// --group routine: only the traces made entirely of that group's turns (owner answer C: routine turns
// get 5 repetitions per arm, i.e. 3 full-corpus runs + 2 routine-only runs; evidence and structural 3).
const GROUP = flag('group', null);
// Paid runs (owner GO BENCHMARK 2026-10-01): rows are appended to the JSONL trace by trace, so a stop keeps
// every completed observation; --resume skips the traces already in this run's file (a trace cut midway
// is run again from its start, since its turns depend on each other). --budget USD stops the run once the
// Anthropic cost of every live run in --out, this one included, reaches it.
const RESUME = args.includes('--resume'), BUDGET = Number(flag('budget', 'NaN'));
if (LIVE && !(BUDGET > 0)) throw Error('--live needs --budget USD (the owner spend guard)');
// A refused request is never retried (owner): a planner HTTP 4xx other than 429, or fast mode not served
// on arm C, stops the run; its rows are stamped run_aborted and the gates mark the arm unavailable.
let ABORTED = null;
// A 429 that reports a rate limit of 0 is an account without the feature (fast mode: "rate limit of 0
// fast mode input tokens per minute"), not congestion: also a refusal.
const refused = message => /model HTTP 4(?!29)\d\d|model HTTP 429: [^)]*rate limit of 0 /.test(String(message || ''));
const STREAM = LIVE ? CANDIDATES[CANDIDATE].stream : args.includes('--stream');
const ENV = LIVE ? Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]).concat(Object.entries(CANDIDATES[CANDIDATE].env))) : null;
// Owner's result groups. A category missing here stops the run, so a new corpus turn is always grouped.
const GROUP_OF = {
  question_request: 'routine', slash_deeper: 'routine', slash_simplify: 'routine', explicit_implementation: 'routine', action_validation: 'routine',
  correct_explanation: 'evidence', partial_explanation: 'evidence', ambiguous_explanation: 'evidence', misconception: 'evidence', repeated_misconception: 'evidence',
  evaluator_disagreement: 'evidence', evaluator_error: 'evidence', practice_evidence: 'evidence', prerequisite_gap: 'evidence',
  rabbit_hole: 'structural', rabbit_hole_keep: 'structural', child_entry: 'structural', child_turn: 'structural', return_to_parent: 'structural',
};
for (const trace of CORPUS) for (const step of trace.turns) if (!GROUP_OF[step.category || trace.category]) throw Error(`no group for category ${step.category || trace.category}`);

// ponytail: a cross-check that is 0 by construction while the validator holds; a non-zero count means the
// validator regressed. Decision 6 hard gates, checked on the ACCEPTED actions independently of the validator (which should
// already make every count 0): consent, critical policy and nonexistent authored resources.
function audit(result, inHole) {
  const { actions, routed, turn, response } = result;
  const done = actions.filter(action => action.type !== 'no_action');
  const quoted = typeof response.explicit_request === 'string' ? response.explicit_request.trim().toLowerCase() : '';
  const explicit = !!quoted && turn.raw_user_message.toLowerCase().includes(quoted);
  const allowed = new Set([...routed.allowed, ...(explicit ? ['respond_text', 'show_authored_card', 'focus_part'] : [])]);
  const constraints = [...turn.constraints, ...(response.constraints_add || [])].filter(item => !(response.constraints_remove || []).includes(item)).concat(statedConstraints(turn.raw_user_message));
  const count = test => done.filter(test).length;
  const consent = count(action => action.type === 'open_dive' || (action.mode === 'navigate' && !(explicit || routed.row === 'slash' || routed.row === 'gap_inline')));
  const before = done.some(action => action.type === 'suggest_dive') ? done.filter(action => action.type === 'respond_text').reduce((n, action) => n + action.text.trim().split(/(?<=[.!?])\s+/).length, 0) : 0;
  const policy = count(action => !allowed.has(action.type)) + count(action => action.type === 'ask_question' && (constraints.includes('no_quiz') || constraints.includes('just_answer')))
    + Math.max(0, count(action => action.type === 'ask_question') - 1) + Math.max(0, done.length - 3) + (before > 2 ? 1 : 0);
  const resource = count(action => ['show_authored_card', 'focus_part', 'suggest_depth', 'suggest_practice'].includes(action.type) && !SLICE_CARDS.includes(action.card))
    + count(action => action.type === 'focus_part' && SLICE_CARDS.includes(action.card) && partIndex(cardModule(action.card), action.part_id) == null)
    + count(action => action.type === 'suggest_depth' && SLICE_CARDS.includes(action.card) && !ladderStep(action.card, action.direction || 'deeper'))
    + count(action => action.type === 'suggest_practice' && SLICE_CARDS.includes(action.card) && !cardModule(action.card).activity)
    + count(action => action.type === 'return_from_dive' && !inHole)
    + done.reduce((n, action) => n + (action.cites || []).filter(cite => !SLICE_CARDS.includes(cite.card) || !(cite.source_index < (cardModule(cite.card).sources || []).length)).length, 0);
  return { consent, policy, resource };
}
// Decision 6 "no evidence corruption": free-text evidence stored from a failed evaluation, on a claim
// that was not evaluated, or naming an idea the claim does not have.
function corruption(added, evaluation, selected) {
  const free = added.filter(event => event.source === 'free_text');
  return (evaluation?.status === 'error' ? free.length : 0) + free.filter(event => !selected.includes(event.claim)).length
    + free.filter(event => event.idea != null && !(event.idea < CLAIMS[event.claim].ideas.length)).length;
}
const MODE = LIVE ? 'live' : 'stub';
const PARENT = { app: 'canvas-aaaa1111', board: 'nanogpt-attention-tutor' };
const AUTHORED = ['show_authored_card', 'focus_part', 'suggest_depth', 'suggest_practice'];

// Stub answers: a script -> one probability per JEV question (missing: "no"; attempt: "yes").
function answersFor(spec, script = {}) {
  const answers = Object.fromEntries(Object.keys(tutorQuestions(spec)).map(key => [key, 0]));
  if ('attempt' in answers) answers.attempt = script.attempt ?? 1;
  if ('non_attempt' in answers) answers.non_attempt = script.non_attempt ?? 0;
  spec.claims.forEach((claim, c) => {
    const s = script[claim.id];
    if (!s) return;
    (s.ideas || []).forEach((p, i) => { answers[`c${c}_idea${i}`] = p; });
    (s.contra || []).forEach((p, i) => { if (`c${c}_contra${i}` in answers) answers[`c${c}_contra${i}`] = p; });
    claim.misconceptions.forEach((wrong, m) => { if (s.mis?.[wrong.id] != null) answers[`c${c}_mis${m}`] = s.mis[wrong.id]; });
    if (s.transfer != null) answers[`c${c}_transfer`] = s.transfer;
  });
  spec.gaps.forEach((gap, g) => { if (script.gaps?.[gap.concept] != null) answers[`g${g}`] = script.gaps[gap.concept]; });
  return answers;
}

function startBlock(start) {
  let block = cardBlock(cardModule(start.card));
  if (start.part) block = applyInputToBlock(block, 'part', partIndex(cardModule(start.card), start.part));
  if (start.selected) block = { ...block, selectedObject: start.selected };
  return practise(block, start.practice || []);
}
function practise(block, answers) {
  let b = block;
  answers.forEach(answer => {
    b = (b.attemptLog || []).length ? applyNewAttempt(b) : enterPractice(b);
    b = applyCheck(setActivityAnswer(b, answer));
  });
  return b;
}
const hole = parent => ({
  dive_id: 'canvas-bbbb2222', title: 'Softmax', concept: 'Softmax', created_by: 'tutor_confirmed',
  origin: { parent: PARENT, ...Object.fromEntries(Object.entries(resolveTarget(parent)).map(([key, value]) => [`origin_${key}`, value])) },
  return_point: { block_id: parent.id, part_id: null, pending_question: null, viewport: null },
});

// A scripted plan as an Anthropic SSE stream of its tutor_response input, in small fragments.
function stubSse(json) {
  const events = [{ type: 'message_start', message: { model: 'stub', usage: {} } }, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', name: TUTOR_TOOL.name, input: {} } }];
  for (let at = 0; at < json.length; at += 8) events.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 8) } });
  events.push({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: {} });
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
}
// How far into the plan's output the first sentence is ready: prefix characters / all characters.
const sentenceAt = json => { for (let n = 1; n <= json.length; n++) if (firstSentence(json.slice(0, n))) return +(n / json.length).toFixed(3); return null; };

const negativeResult = event => event.result === 'fail' || event.result === 'misconception';
const eventKey = event => `${event.claim}:${event.result}${event.settled ? '' : '?'}`;
const sameBag = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const sentences = text => String(text || '').trim().split(/(?<=[.!?])\s+/).filter(Boolean).length;

// expectation -> { dimension: pass }
function score(expect, got) {
  const checks = {};
  if (expect.selected_includes || expect.selected_excludes) checks.selection = (expect.selected_includes || []).every(id => got.selected.includes(id)) && !(expect.selected_excludes || []).some(id => got.selected.includes(id));
  if ('jev' in expect || 'larger' in expect) checks.evaluation = (!('jev' in expect) || expect.jev === got.jev) && (!('larger' in expect) || expect.larger === got.larger);
  if (expect.events || expect.states) checks.evidence = (!expect.events || sameBag(expect.events, got.events)) && Object.entries(expect.states || {}).every(([id, state]) => got.states[id] === state);
  if (expect.row) checks.route = expect.row === got.row;
  if (expect.actions) {
    const shown = got.actions.find(action => action.type === 'show_authored_card' || action.type === 'focus_part');
    checks.actions = sameBag(expect.actions, got.actions.map(action => action.type))
      && Object.entries(expect.modes || {}).every(([type, mode]) => got.actions.find(action => action.type === type)?.mode === mode)
      && (!expect.card || shown?.card === expect.card) && (!expect.part || shown?.part_id === expect.part)
      && (!expect.max_sentences || got.actions.filter(action => action.type === 'respond_text').reduce((n, action) => n + sentences(action.text), 0) <= expect.max_sentences);
  }
  return checks;
}

const pct = (list, q) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const stats = list => list.length ? { count: list.length, mean: Math.round(list.reduce((a, b) => a + b, 0) / list.length), p50: pct(list, 0.5), p95: pct(list, 0.95), max: Math.max(...list) } : { count: 0 };

async function runTrace(trace) {
  const rows = [];
  let block = startBlock(trace.start), store = emptyStore(), canvas = PARENT, inHole = null;
  for (const [index, step] of trace.turns.entries()) {
    if (step.practice) block = practise(block, step.practice);
    if (step.keep) store = keepHere(store, PARENT);
    let raw = step.raw || '';
    if (step.enter_hole) {
      inHole = hole(block);
      store = enterHole(store, inHole);
      canvas = { app: inHole.dive_id, board: 'main', dive: inHole };
    }
    if (step.opening) { raw = openingQuestion(store, inHole); store = markOpened(store, inHole); }
    if (step.climb) { store = arriveAt(store, PARENT); canvas = PARENT; inHole = null; }
    const calls = { firstOutputMs: null, jev: 0, larger: 0, planner: 0, plannerChars: 0, jevQuestions: 0, selected: [], escalation: null, invalid: 0, jevMs: null, jevOutcome: null, largerMs: null, largerOutcome: null, largerTokens: null, plannerMs: null, plannerTokens: null, plannerOutcome: null, tier: null, servedTier: null, escalated: null, sentenceAt: null, firstSentenceMs: null };
    const post = async (path, body, options = {}) => {
      if (path === '/api/learn/tutor/evaluate') {
        const input = validateEvaluateBody(body);
        if (input.error) { calls.invalid++; throw new Error(input.error); }
        calls.selected = input.value.spec.claims.map(claim => claim.id);
        const ask = async (env, request) => {
          calls.jev++; calls.jevQuestions += Object.keys(request.questions).length;
          if (step.stub.jev?.error) throw new Error(step.stub.jev.error);
          return { body: { answers: Object.fromEntries(Object.entries(answersFor(input.value.spec, step.stub.jev)).map(([key, noul]) => [key, { type: 'noul', noul }])) } };
        };
        const callModel = async () => {
          calls.larger++;
          if (step.stub.larger?.error) throw new Error(step.stub.larger.error);
          const words = Object.fromEntries(Object.entries(answersFor(input.value.spec, step.stub.larger || step.stub.jev)).map(([key, p]) => [key, p >= 0.7 ? 'yes' : p <= 0.3 ? 'no' : 'unclear']));
          return Response.json({ content: [{ type: 'text', text: JSON.stringify(words) }] });
        };
        const result = LIVE ? await evaluateFreeText(ENV, input.value.spec, input.value.message)
          : await evaluateFreeText({ TYPESAFE_API_KEY: 'stub' }, input.value.spec, input.value.message, { ask, callModel });
        const { jev, larger } = result.telemetry || {};
        Object.assign(calls, { jev: jev?.called ? 1 : 0, jevQuestions: jev?.questions ?? 0, jevMs: jev?.ms ?? null, jevOutcome: jev?.outcome ?? null, jevError: jev?.error ? String(jev.error).slice(0, 160) : null,
          larger: larger?.called ? 1 : 0, largerMs: larger?.ms ?? null, largerOutcome: larger?.outcome ?? null,
          largerTokens: larger?.called ? { in: larger.input_tokens, out: larger.output_tokens, model: larger.requested_model } : null, escalation: result.escalation?.reason ?? larger?.reason ?? null });
        return result;
      }
      calls.planner++;
      calls.plannerChars = JSON.stringify(body.context).length;
      calls.tier = plannerTier(body.context).tier;
      if (!LIVE && !STREAM) return step.stub.plan;
      if (!LIVE) {
        const { constraints_add = [], constraints_remove, explicit_request, strategy, actions, ...rest } = step.stub.plan;
        const json = JSON.stringify({ constraints_add, ...(constraints_remove ? { constraints_remove } : {}), ...(explicit_request ? { explicit_request } : {}), strategy, actions, ...rest });
        calls.sentenceAt = sentenceAt(json);
        return planTurn({}, body.context, { onSentence: options.onSentence, callModel: async () => stubSse(json) });
      }
      try {
        const planned = await planTurn(ENV, body.context, STREAM ? { onSentence: options.onSentence } : {});
        calls.firstSentenceMs = planned.telemetry.first_sentence_ms ?? null;
        // The planner's first output (any delta), from the start of planTurn: a fast call that escalated came first.
        calls.firstOutputMs = (planned.telemetry.escalated && planned.telemetry.fast ? planned.telemetry.fast.ms : 0) + (planned.telemetry.first_output_ms ?? planned.telemetry.ms);
        if (refused(planned.telemetry.escalated)) ABORTED = `fast tier refused: ${planned.telemetry.escalated}`;
        if (CANDIDATES[CANDIDATE].env.TUTOR_PLANNER_SPEED === 'fast' && planned.telemetry.speed !== 'fast') ABORTED = `fast mode not served (usage.speed ${planned.telemetry.speed})`;
        const tokens = t => ({ in: t.input_tokens, out: t.output_tokens, cw: t.cache_creation_input_tokens, cr: t.cache_read_input_tokens, model: t.requested_model, served: t.served_model, speed: t.speed ?? null, requested_speed: t.requested_speed ?? null });
        Object.assign(calls, { plannerMs: planned.telemetry.ms, plannerOutcome: 'ok', plannerTokens: tokens(planned.telemetry), fastTokens: planned.telemetry.escalated && planned.telemetry.fast ? tokens(planned.telemetry.fast) : null,
          fastInvalid: planned.telemetry.escalated && planned.telemetry.fast?.outcome === 'invalid' ? 1 : 0,
          servedTier: planned.telemetry.tier ?? 'opus', escalated: planned.telemetry.escalated ?? null });
        return planned;
      } catch (error) {
        Object.assign(calls, { plannerMs: error.telemetry?.ms ?? null, plannerOutcome: error.telemetry?.outcome ?? 'error' });
        // A failed turn is still a failed plan for decision 6 (invalid or errored), never silently dropped.
        throw error;
      }
    };
    const before = store.events.length;
    const started = performance.now();
    let result;
    try { result = await runTurn({ raw, slash: step.slash || null, opening: !!step.opening, canvas, access: { app: canvas.app }, block: inHole ? null : block, store, post, onSpeakable: STREAM ? () => {} : null }); }
    catch (error) {
      // A failed turn (the planner errored or returned no turn) ends its trace: later turns depend on it.
      rows.push({ stage: STAGE, mode: MODE, trace: trace.id, turn: index, category: step.category || trace.category, golden: !!trace.golden, error: String(error.message).slice(0, 200),
        jev_calls: calls.jev, jev_questions: calls.jevQuestions, larger_calls: calls.larger, planner_calls: calls.planner, jev_ms: calls.jevMs, larger_ms: calls.largerMs, planner_ms: calls.plannerMs, planner_outcome: calls.plannerOutcome,
        turn_ms: Math.round(performance.now() - started), selected: calls.selected, checks: { turn: false }, pass: false, proposed: 0, accepted: 0, rejected: 0, authored_actions: 0, text_actions: 0,
        group: GROUP_OF[step.category || trace.category], planner_invalid: calls.plannerOutcome === 'invalid' ? 1 : 0, planner_tier: calls.tier,
        jev_outcome: calls.jevOutcome, jev_error: calls.jevError ?? null, larger_tokens: calls.largerTokens, cost_usd: +[calls.fastTokens, calls.largerTokens].filter(Boolean).reduce((n, t) => n + usd(t), 0).toFixed(6) });
      if (LIVE && refused(error.message)) ABORTED = `planner refused: ${String(error.message).slice(0, 160)}`;
      break;
    }
    const turnMs = Math.round(performance.now() - started);
    const added = result.store.events.slice(before);
    store = result.store;
    const got = {
      selected: calls.selected, jev: calls.jev > 0, larger: calls.larger > 0,
      events: store.events.slice(before).map(eventKey), free_text_negative: store.events.slice(before).filter(event => event.source === 'free_text' && negativeResult(event)).map(event => event.result), states: Object.fromEntries(Object.entries(result.states).map(([id, state]) => [id, state.state])),
      row: result.routed.row, actions: result.actions.filter(action => action.type !== 'no_action'),
    };
    const checks = score(step.expect, got);
    const proposed = (Array.isArray(result.response.actions) ? result.response.actions : []).length, accepted = got.actions.length;
    rows.push({
      stage: STAGE, mode: MODE, trace: trace.id, turn: index, category: step.category || trace.category, golden: !!trace.golden,
      selected: got.selected, claims_available: result.selection?.available ?? null, selection_ms: result.selection?.ms ?? null, selection_fallback: result.selection?.fallback ?? null,
      jev_calls: calls.jev, jev_questions: calls.jevQuestions, larger_calls: calls.larger, escalation: calls.escalation,
      evaluation: result.evaluation ? result.evaluation.status : null, events: got.events, free_text_negative: got.free_text_negative, row: got.row,
      actions: got.actions.map(action => ({ type: action.type, ...(action.mode ? { mode: action.mode } : {}), ...(action.card ? { card: action.card } : {}), ...(action.part_id ? { part_id: action.part_id } : {}) })),
      proposed, accepted, rejected: Math.max(0, proposed - accepted), log: result.log,
      rejections: (result.decisions || []).filter(decision => !decision.accepted).map(decision => `${decision.type}@${decision.stage}: ${decision.reason}`),
      transitions: result.transitions || [], critical_path: result.bench?.critical_path ?? null,
      // Owner answer A: evidence that landed after the reply was planned (off the critical path).
      late_evidence_events: result.bench?.critical_path && !result.bench.critical_path.blocking ? added.filter(event => event.source === 'free_text').length : null,
      turn_trace: result.bench?.trace ? { trace_id: result.bench.trace.trace_id, stages: result.bench.trace.stages.map(stage => `${stage.stage}:${stage.status}:${stage.result}`) } : null,
      turn_ms: turnMs, jev_ms: calls.jevMs, jev_outcome: calls.jevOutcome, larger_ms: calls.largerMs, larger_outcome: calls.largerOutcome, larger_tokens: calls.largerTokens,
      planner_ms: calls.plannerMs, planner_outcome: calls.plannerOutcome, planner_tokens: calls.plannerTokens, fast_tokens: calls.fastTokens ?? null,
      spoken: result.bench?.spoken ?? null, first_sentence_at: calls.sentenceAt, first_sentence_ms: calls.firstSentenceMs,
      // Decision 1: three timings from the turn's start (live: real; stub: stub wall-clock only).
      to_first_safe_sentence: result.bench?.ms.to_first_safe_sentence ?? null, to_evidence_ready: result.bench?.ms.to_evidence_ready ?? null,
      to_first_evidence_action: result.bench?.ms.to_first_evidence_action ?? null,
      // turn-relative: where the planner started + its first output (live; stub: null)
      to_first_planner_output: calls.firstOutputMs != null && result.bench ? +(result.bench.ms.to_planner_ready - result.bench.ms.planner + calls.firstOutputMs).toFixed(1) : null,
      expects_card: !!step.expect.card, jev_error: calls.jevError ?? null,
      evidence_dropped: (result.decisions || []).filter(decision => decision.stage === 'evidence').length,
      opens_with: result.actions.find(action => action.type === 'respond_text' || action.type === 'ask_question')?.type ?? null,
      group: GROUP_OF[step.category || trace.category], to_planner_ready: result.bench?.ms.to_planner_ready ?? null,
      audit: audit(result, !!inHole), evidence_corruption: corruption(added, result.evaluation, calls.selected),
      planner_invalid: (calls.plannerOutcome === 'invalid' ? 1 : 0) + (calls.fastInvalid || 0),
      cost_usd: +[calls.plannerTokens, calls.fastTokens, calls.largerTokens].filter(Boolean).reduce((n, t) => n + usd(t), 0).toFixed(6),
      planner_calls: calls.planner, planner_context_chars: calls.plannerChars, planner_tier: calls.tier, planner_served_tier: calls.servedTier, planner_escalated: calls.escalated,
      planner_input_tokens_est: calls.planner ? Math.round((calls.plannerChars + PLANNER_SYSTEM.length + JSON.stringify(TUTOR_TOOL).length) / 4) : 0,
      authored_actions: got.actions.filter(action => AUTHORED.includes(action.type)).length, text_actions: got.actions.filter(action => action.type === 'respond_text').length,
      invalid_requests: calls.invalid, checks, pass: Object.values(checks).every(Boolean),
    });
  }
  return rows;
}

const TRACES = GROUP ? CORPUS.filter(trace => trace.turns.every(step => GROUP_OF[step.category || trace.category] === GROUP)) : CORPUS;
if (GROUP) {
  const all = CORPUS.flatMap(trace => trace.turns.map(step => GROUP_OF[step.category || trace.category])).filter(group => group === GROUP).length;
  const here = TRACES.reduce((n, trace) => n + trace.turns.length, 0);
  if (!here || here !== all) throw Error(`--group ${GROUP}: ${here} of its ${all} turns sit in traces of their own; only a group whose traces hold nothing else can be repeated alone`);
}
mkdirSync(OUT, { recursive: true });
const FILE = `${OUT}/corpus-${MODE}-${STAGE}.jsonl`;
const read = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
if (existsSync(FILE) && LIVE && !RESUME) throw Error(`${FILE} exists: paid rows are never overwritten (use --resume or a new --stage)`);
const rows = existsSync(FILE) && RESUME ? read(FILE) : [];
if (!RESUME || !existsSync(FILE)) writeFileSync(FILE, '');
const done = new Set(rows.map(row => row.trace));
const spentBefore = LIVE ? readdirSync(OUT).filter(name => /^corpus-live-.*\.jsonl$/.test(name) && `${OUT}/${name}` !== FILE).reduce((n, name) => n + read(`${OUT}/${name}`).reduce((m, row) => m + (row.cost_usd || 0), 0), 0) : 0;
const spent = () => spentBefore + rows.reduce((n, row) => n + (row.cost_usd || 0), 0);
for (const trace of TRACES) {
  if (ABORTED) break;
  if (done.has(trace.id)) continue;
  if (LIVE && spent() >= BUDGET) { ABORTED = `budget: $${spent().toFixed(2)} of $${BUDGET} spent`; break; }
  const traced = await runTrace(trace);
  rows.push(...traced);
  appendFileSync(FILE, traced.map(row => JSON.stringify(row)).join('\n') + '\n');
  if (LIVE) console.error(`${trace.id}: ${traced.length} turns, run $${traced.reduce((n, row) => n + (row.cost_usd || 0), 0).toFixed(3)}, all live runs $${spent().toFixed(2)}`);
}
if (ABORTED) { rows.forEach(row => { row.run_aborted = ABORTED; }); writeFileSync(FILE, rows.map(row => JSON.stringify(row)).join('\n') + '\n'); }
const dims = ['selection', 'evaluation', 'evidence', 'route', 'actions'];
const rate = (list, test) => list.length ? +(list.filter(test).length / list.length).toFixed(3) : null;
const turnsWithActions = rows.filter(row => row.accepted);
const jevTurns = rows.filter(row => row.jev_calls);
const golden = [...new Set(rows.filter(row => row.golden).map(row => row.trace))];
const tokens = rows.flatMap(row => [row.planner_tokens, row.fast_tokens, row.larger_tokens]).filter(Boolean);
const unpriced = [...new Set(tokens.filter(t => !PRICES[t.model]).map(t => t.model))];
const cost = tokens.length ? tokens.reduce((n, t) => n + usd(t), 0) : null;
const values = key => rows.map(row => key(row)).filter(value => value != null);
// MODELED, not measured: speech end -> first Tutor audio from Baseline A's live component means
// (owner brief 2026-10-01: STT commit 602, JEV 188, larger evaluator 4150, Opus planner 7707, Fish
// first byte 210 ms), applied to each turn's calls. Baseline policy: evaluation always blocks; this
// stage: only when the critical-path policy says so. The planner is held at Baseline A's mean.
const BASE_MS = { stt: 602, jev: 188, larger: 4150, planner: 7707, fish: 210 };
const evalMs = row => row.jev_calls ? BASE_MS.jev + (row.larger_calls ? BASE_MS.larger : 0) : 0;
const modeled = blocking => rows.filter(row => !row.error).map(row => BASE_MS.stt + (blocking(row) ? evalMs(row) : 0) + BASE_MS.planner + BASE_MS.fish);
const evaluatedRows = rows.filter(row => row.critical_path);
const summary = {
  stage: STAGE, mode: MODE, ...(LIVE ? { candidate: CANDIDATE } : {}), group: GROUP, traces: TRACES.length, turns: rows.length, errored_turns: rows.filter(row => row.error).length, aborted: ABORTED,
  // Owner answer A: late evidence (off-path turns whose evaluation landed after planning) and what it cost.
  late_evidence: (() => {
    const off = rows.filter(row => row.critical_path && !row.critical_path.blocking);
    return { off_path_turns: off.length, with_evidence: off.filter(row => row.late_evidence_events > 0).length, route_changed: off.filter(row => row.critical_path.miss).length,
      route_changed_rate: rate(off, row => !!row.critical_path.miss), dependent_actions_dropped: rows.reduce((n, row) => n + (row.evidence_dropped || 0), 0) };
  })(),
  ...(LIVE ? {
    speed: {
      jev_ms: stats(values(row => row.jev_ms)), jev_timeout_rate: rate(jevTurns, row => row.jev_outcome === 'timeout'), jev_error_rate: rate(jevTurns, row => row.jev_outcome === 'error'),
      larger_ms: stats(values(row => row.larger_ms)), larger_errors: rows.filter(row => row.larger_outcome === 'error' || row.larger_outcome === 'timeout').length,
      planner_ms: stats(values(row => row.planner_ms)),
      // Routine: evaluation off the critical path or not run; graded: evaluation blocks the reply.
      planner_ms_routine: stats(values(row => (row.critical_path?.blocking ? null : row.planner_ms))), planner_ms_graded: stats(values(row => (row.critical_path?.blocking ? row.planner_ms : null))),
      first_sentence_ms: stats(values(row => row.first_sentence_ms)),
      first_sentence_ms_routine: stats(values(row => (row.critical_path?.blocking ? null : row.first_sentence_ms))), first_sentence_ms_graded: stats(values(row => (row.critical_path?.blocking ? row.first_sentence_ms : null))),
      planner_errors: rows.filter(row => row.planner_outcome && row.planner_outcome !== 'ok').length,
      turn_ms: stats(values(row => row.turn_ms)),
    },
    tokens: {
      planner_in: stats(values(row => row.planner_tokens?.in)), planner_out: stats(values(row => row.planner_tokens?.out)),
      larger_in: stats(values(row => row.larger_tokens?.in)), larger_out: stats(values(row => row.larger_tokens?.out)),
    },
    cost_usd: cost == null ? null : { anthropic_total: +cost.toFixed(4), per_turn: +(cost / rows.length).toFixed(5), per_100_turns: +(cost / rows.length * 100).toFixed(3), unpriced_models: unpriced, note: 'Anthropic calls only, per model at PRICES incl. cache writes/reads and fast mode; JEV (TypeSafe) is not priced here' },
    // Decision 5A: cold (cache write) vs warm (cache read) planner requests; claim nothing until measured.
    cache: {
      cold: { calls: rows.filter(row => row.planner_tokens?.cw > 0).length, planner_ms: stats(values(row => (row.planner_tokens?.cw > 0 ? row.planner_ms : null))), input_tokens: stats(values(row => (row.planner_tokens?.cw > 0 ? row.planner_tokens.in + row.planner_tokens.cw : null))) },
      warm: { calls: rows.filter(row => row.planner_tokens?.cr > 0).length, planner_ms: stats(values(row => (row.planner_tokens?.cr > 0 ? row.planner_ms : null))), cached_tokens: stats(values(row => row.planner_tokens?.cr || null)) },
      uncached: { calls: rows.filter(row => row.planner_tokens && !row.planner_tokens.cw && !row.planner_tokens.cr).length, planner_ms: stats(values(row => (row.planner_tokens && !row.planner_tokens.cw && !row.planner_tokens.cr ? row.planner_ms : null))) },
    },
    // Decisions 3 and 5B: what actually served each call, so no model or speed is ever substituted silently.
    served_model_mismatches: tokens.filter(t => t.served && t.served !== t.model).map(t => `${t.model} -> ${t.served}`),
    speed_mismatches: tokens.filter(t => t.requested_speed && t.speed !== t.requested_speed).length,
    // Decision 6 latency, per group: the first validated speakable sentence (to_first_safe_sentence) and the full plan.
    latency_by_group: Object.fromEntries(['all', 'routine', 'evidence', 'structural'].map(group => {
      const list = rows.filter(row => !row.error && (group === 'all' || row.group === group));
      return [group, { turns: list.length, first_validated_sentence_ms: stats(list.map(row => row.to_first_safe_sentence).filter(v => v != null)), full_plan_ms: stats(list.map(row => row.planner_ms).filter(v => v != null)) }];
    })),
    model_calls_per_turn: +((rows.reduce((n, row) => n + row.jev_calls + row.larger_calls + row.planner_calls + (row.fast_tokens ? 1 : 0), 0)) / rows.length).toFixed(3),
  } : {}),
  pass_rate: rate(rows, row => row.pass),
  groups: Object.fromEntries(['routine', 'evidence', 'structural'].map(group => [group, { turns: rows.filter(row => row.group === group).length, categories: rows.filter(row => row.group === group).reduce((acc, row) => { acc[row.category] = (acc[row.category] || 0) + 1; return acc; }, {}) }])),
  // Decision 6 hard-gate inputs for this run (e2e/tutor-bench-gates.mjs judges across arms and repetitions).
  gate_inputs: {
    audit: ['consent', 'policy', 'resource'].reduce((acc, key) => ({ ...acc, [key]: rows.reduce((n, row) => n + (row.audit?.[key] || 0), 0) }), {}),
    evidence_corruption: rows.reduce((n, row) => n + (row.evidence_corruption || 0), 0),
    spoken_then_replaced: rows.filter(row => row.spoken && !row.spoken.consistent).length,
    invalid_plans: rows.reduce((n, row) => n + (row.planner_invalid || 0), 0),
    routine_fast_escalations: `${rows.filter(row => row.planner_tier === 'fast' && row.planner_escalated).length}/${rows.filter(row => row.planner_tier === 'fast').length}`,
  },
  golden_traces: { total: golden.length, passed: golden.filter(id => rows.filter(row => row.trace === id).every(row => row.pass)).length },
  by_dimension: Object.fromEntries(dims.map(dim => { const scored = rows.filter(row => dim in row.checks); return [dim, { scored: scored.length, pass_rate: rate(scored, row => row.checks[dim]) }]; })),
  jev_calls_per_turn: +(rows.reduce((n, row) => n + row.jev_calls, 0) / rows.length).toFixed(3),
  jev_questions_per_call: jevTurns.length ? +(jevTurns.reduce((n, row) => n + row.jev_questions, 0) / jevTurns.reduce((n, row) => n + row.jev_calls, 0)).toFixed(2) : null,
  claims_selected_per_jev_turn: jevTurns.length ? +(jevTurns.reduce((n, row) => n + row.selected.length, 0) / jevTurns.length).toFixed(2) : null,
  larger_calls_per_turn: +(rows.reduce((n, row) => n + row.larger_calls, 0) / rows.length).toFixed(3),
  larger_evaluator_escalation_rate: rate(jevTurns, row => row.larger_calls > 0),
  // Decision 7: negative free-text evidence (JEV / larger evaluator), for before/after comparison.
  free_text_negative_events: ['fail', 'misconception'].reduce((acc, result) => ({ ...acc, [result]: rows.reduce((n, row) => n + (row.free_text_negative || []).filter(r => r === result).length, 0) }), {}),
  critical_path: {
    evaluated_turns: evaluatedRows.length, off_critical_path: evaluatedRows.filter(row => !row.critical_path.blocking).length,
    skip_rate: rate(evaluatedRows, row => !row.critical_path.blocking), misses: evaluatedRows.filter(row => row.critical_path.miss).map(row => `${row.trace}#${row.turn}`),
    reasons: evaluatedRows.reduce((acc, row) => { acc[row.critical_path.reason] = (acc[row.critical_path.reason] || 0) + 1; return acc; }, {}),
  },
  // Decision 1: first safe sentence, evidence ready and first evidence-dependent action, separately.
  evaluation_dependency: {
    to_first_safe_sentence_ms: stats(values(row => row.to_first_safe_sentence)), to_evidence_ready_ms: stats(values(row => row.to_evidence_ready)),
    to_first_evidence_action_ms: stats(values(row => row.to_first_evidence_action)),
    turns_with_evidence_actions: rows.filter(row => row.to_first_evidence_action != null).length, evidence_actions_dropped: rows.reduce((n, row) => n + (row.evidence_dropped || 0), 0),
    note: LIVE ? 'ms from the turn start' : 'stub: wall-clock of stubbed calls, not model latency',
  },
  modeled_first_audio_ms: { note: 'MODELED from Baseline A component means, planner fixed at 7707 ms', baseline_policy: stats(modeled(() => true)), this_stage: stats(modeled(row => !row.critical_path || row.critical_path.blocking)) },
  planner_calls_per_turn: +(rows.reduce((n, row) => n + row.planner_calls, 0) / rows.length).toFixed(3),
  ...(STREAM ? { first_sentence: {
    early_rate: rate(rows.filter(row => row.planner_calls && !row.error), row => !!row.spoken),
    consistent_rate: rate(rows.filter(row => row.spoken), row => row.spoken.consistent),
    at_fraction_of_output: stats(values(row => (row.spoken ? Math.round(row.first_sentence_at * 1000) : null))),
    // Decision 4: question turns (the validated reply opens with ask_question) measured on their own.
    question_turns: (() => {
      const asking = rows.filter(row => !row.error && row.opens_with === 'ask_question');
      return { turns: asking.length, early: asking.filter(row => row.spoken).length, early_rate: rate(asking, row => !!row.spoken),
        at_fraction_of_output: stats(values(row => (row.spoken?.action === 'ask_question' ? Math.round(row.first_sentence_at * 1000) : null))),
        first_sentence_ms: stats(values(row => (row.spoken?.action === 'ask_question' ? row.first_sentence_ms : null))) };
    })(),
    note: 'at_fraction_of_output in thousandths of the tool-input characters written before the first sentence is ready (stub: scripted plans, control fields then actions)',
  } } : {}),
  planner_fast_tier_share: rate(rows.filter(row => row.planner_tier), row => row.planner_tier === 'fast'),
  ...(LIVE ? { planner_escalations: rows.filter(row => row.planner_escalated).map(row => `${row.trace}#${row.turn}: ${row.planner_escalated}`) } : {}),
  planner_input_tokens_est: stats(rows.filter(row => row.planner_calls).map(row => row.planner_input_tokens_est)),
  claims_available_per_jev_turn: jevTurns.some(row => row.claims_available != null) ? +(jevTurns.reduce((n, row) => n + (row.claims_available || 0), 0) / jevTurns.length).toFixed(2) : null,
  rejections_by_stage: rows.flatMap(row => row.rejections || []).reduce((acc, entry) => { const stage = entry.split('@')[1].split(':')[0]; acc[stage] = (acc[stage] || 0) + 1; return acc; }, {}),
  actions: { proposed: rows.reduce((n, row) => n + row.proposed, 0), accepted: rows.reduce((n, row) => n + row.accepted, 0), rejected: rows.reduce((n, row) => n + row.rejected, 0) },
  authored_content_reuse_rate: rate(turnsWithActions, row => row.authored_actions > 0),
  generated_text_rate: rate(turnsWithActions, row => row.text_actions > 0 && !row.authored_actions),
  failed: rows.filter(row => !row.pass).map(row => `${row.trace}#${row.turn}: ${Object.entries(row.checks).filter(([, ok]) => !ok).map(([dim]) => dim).join(',')}`),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/corpus-${MODE}-${STAGE}.jsonl`, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
writeFileSync(`${OUT}/corpus-${MODE}-${STAGE}.summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
