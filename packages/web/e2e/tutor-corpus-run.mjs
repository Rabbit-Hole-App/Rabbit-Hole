// Tutor architecture v2: the FREE corpus runner (docs/features/tutor-architecture-v2.md). Runs every
// trace in tutor-corpus.mjs through the real Tutor modules - runTurn in the browser code, and the
// worker's own /evaluate path (validateEvaluateBody + evaluateFreeText, so the escalation policy is
// the real one) - with JEV, the larger evaluator and the planner answered by the corpus stubs. No
// network, no model call, no cost. Scores the deterministic pipeline (selection, evaluation ladder,
// evidence, routing, validation) against each turn's expectations and counts calls and planner
// context size. Latency here is not model latency; the paid run (tutor-bench.mjs) measures that.
// Usage: node e2e/tutor-corpus-run.mjs [--stage A] [--out tutor-bench-out]
import { mkdirSync, writeFileSync } from 'node:fs';
import { cardBlock } from '../src/nanogpt/board.js';
import { applyCheck, applyNewAttempt, enterPractice, setActivityAnswer } from '../src/scene-activity.js';
import { applyInputToBlock } from '../src/scene-evaluate.js';
import { resolveTarget } from '../src/learn-target.js';
import { cardModule } from '../src/learn-tutor-claims.js';
import { partIndex } from '../src/nanogpt/depth/board.js';
import { emptyStore } from '../src/learn-tutor-evidence.js';
import { arriveAt, enterHole, keepHere, markOpened, openingQuestion, runTurn } from '../src/learn-tutor.js';
import { evaluateFreeText, validateEvaluateBody } from '../../control-plane/src/learn-tutor-routes.js';
import { PLANNER_SYSTEM, TUTOR_TOOL, tutorQuestions } from '../../control-plane/src/agents/learn-tutor.js';
import { CORPUS } from './tutor-corpus.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const STAGE = flag('stage', 'A'), OUT = flag('out', 'tutor-bench-out');
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
    checks.actions = JSON.stringify(expect.actions) === JSON.stringify(got.actions.map(action => action.type))
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
    const calls = { jev: 0, larger: 0, planner: 0, plannerChars: 0, jevQuestions: 0, selected: [], escalation: null, invalid: 0 };
    const post = async (path, body) => {
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
        const result = await evaluateFreeText({ TYPESAFE_API_KEY: 'stub' }, input.value.spec, input.value.message, { ask, callModel });
        calls.escalation = result.escalation?.reason ?? null;
        return result;
      }
      calls.planner++;
      calls.plannerChars = JSON.stringify(body.context).length;
      return step.stub.plan;
    };
    const before = store.events.length;
    const result = await runTurn({ raw, slash: step.slash || null, opening: !!step.opening, canvas, access: { app: canvas.app }, block: inHole ? null : block, store, post });
    store = result.store;
    const got = {
      selected: calls.selected, jev: calls.jev > 0, larger: calls.larger > 0,
      events: store.events.slice(before).map(eventKey), states: Object.fromEntries(Object.entries(result.states).map(([id, state]) => [id, state.state])),
      row: result.routed.row, actions: result.actions.filter(action => action.type !== 'no_action'),
    };
    const checks = score(step.expect, got);
    const proposed = (step.stub.plan.actions || []).length, accepted = got.actions.length;
    rows.push({
      stage: STAGE, trace: trace.id, turn: index, category: step.category || trace.category, golden: !!trace.golden,
      selected: got.selected, claims_available: result.selection?.available ?? null, selection_ms: result.selection?.ms ?? null, selection_fallback: result.selection?.fallback ?? null,
      jev_calls: calls.jev, jev_questions: calls.jevQuestions, larger_calls: calls.larger, escalation: calls.escalation,
      evaluation: result.evaluation ? result.evaluation.status : null, events: got.events, row: got.row,
      actions: got.actions.map(action => ({ type: action.type, ...(action.mode ? { mode: action.mode } : {}), ...(action.card ? { card: action.card } : {}), ...(action.part_id ? { part_id: action.part_id } : {}) })),
      proposed, accepted, rejected: Math.max(0, proposed - accepted), log: result.log,
      rejections: (result.decisions || []).filter(decision => !decision.accepted).map(decision => `${decision.type}@${decision.stage}: ${decision.reason}`),
      transitions: result.transitions || [],
      planner_calls: calls.planner, planner_context_chars: calls.plannerChars,
      planner_input_tokens_est: calls.planner ? Math.round((calls.plannerChars + PLANNER_SYSTEM.length + JSON.stringify(TUTOR_TOOL).length) / 4) : 0,
      authored_actions: got.actions.filter(action => AUTHORED.includes(action.type)).length, text_actions: got.actions.filter(action => action.type === 'respond_text').length,
      invalid_requests: calls.invalid, checks, pass: Object.values(checks).every(Boolean),
    });
  }
  return rows;
}

const rows = [];
for (const trace of CORPUS) rows.push(...await runTrace(trace));
const dims = ['selection', 'evaluation', 'evidence', 'route', 'actions'];
const rate = (list, test) => list.length ? +(list.filter(test).length / list.length).toFixed(3) : null;
const turnsWithActions = rows.filter(row => row.accepted);
const jevTurns = rows.filter(row => row.jev_calls);
const golden = [...new Set(rows.filter(row => row.golden).map(row => row.trace))];
const summary = {
  stage: STAGE, mode: 'stub', traces: CORPUS.length, turns: rows.length,
  pass_rate: rate(rows, row => row.pass),
  golden_traces: { total: golden.length, passed: golden.filter(id => rows.filter(row => row.trace === id).every(row => row.pass)).length },
  by_dimension: Object.fromEntries(dims.map(dim => { const scored = rows.filter(row => dim in row.checks); return [dim, { scored: scored.length, pass_rate: rate(scored, row => row.checks[dim]) }]; })),
  jev_calls_per_turn: +(rows.reduce((n, row) => n + row.jev_calls, 0) / rows.length).toFixed(3),
  jev_questions_per_call: jevTurns.length ? +(jevTurns.reduce((n, row) => n + row.jev_questions, 0) / jevTurns.reduce((n, row) => n + row.jev_calls, 0)).toFixed(2) : null,
  claims_selected_per_jev_turn: jevTurns.length ? +(jevTurns.reduce((n, row) => n + row.selected.length, 0) / jevTurns.length).toFixed(2) : null,
  larger_calls_per_turn: +(rows.reduce((n, row) => n + row.larger_calls, 0) / rows.length).toFixed(3),
  larger_evaluator_escalation_rate: rate(jevTurns, row => row.larger_calls > 0),
  planner_calls_per_turn: +(rows.reduce((n, row) => n + row.planner_calls, 0) / rows.length).toFixed(3),
  planner_input_tokens_est: stats(rows.filter(row => row.planner_calls).map(row => row.planner_input_tokens_est)),
  claims_available_per_jev_turn: jevTurns.some(row => row.claims_available != null) ? +(jevTurns.reduce((n, row) => n + (row.claims_available || 0), 0) / jevTurns.length).toFixed(2) : null,
  rejections_by_stage: rows.flatMap(row => row.rejections || []).reduce((acc, entry) => { const stage = entry.split('@')[1].split(':')[0]; acc[stage] = (acc[stage] || 0) + 1; return acc; }, {}),
  actions: { proposed: rows.reduce((n, row) => n + row.proposed, 0), accepted: rows.reduce((n, row) => n + row.accepted, 0), rejected: rows.reduce((n, row) => n + row.rejected, 0) },
  authored_content_reuse_rate: rate(turnsWithActions, row => row.authored_actions > 0),
  generated_text_rate: rate(turnsWithActions, row => row.text_actions > 0 && !row.authored_actions),
  failed: rows.filter(row => !row.pass).map(row => `${row.trace}#${row.turn}: ${Object.entries(row.checks).filter(([, ok]) => !ok).map(([dim]) => dim).join(',')}`),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/corpus-stub-${STAGE}.jsonl`, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
writeFileSync(`${OUT}/corpus-stub-${STAGE}.summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
