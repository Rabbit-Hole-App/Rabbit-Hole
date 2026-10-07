// Task 11c-B: the Tutor-action half of the repository_context handoff (task-11c-brief.md; owner thirteenth, fourteenth, fifteenth,
// sixteenth and nineteenth messages). The router offers handoff only from structured state (turn.handoff_offer: the canvas
// reads a repository), never from words; the validator accepts one, bounded like create_material; runTurn runs it after the plan
// through the 11c-A route with a selection and card built from the selected block, shows its answer as the reply, and on any
// failure says the source context could not be retrieved; the decision event records what ran (handoff, capability), the
// handoff timing apart from the planner's, and forces retrieval_failed on a failure. Stand-in planner and route: no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HANDOFF_FAILED, buildTurn, route, runTurn } from './learn-tutor.js';
import { validateActions } from './learn-tutor-validate.js';
import { actionContract } from './learn-tutor-actions.js';
import { canvasDomain } from './learn-journey-domain.js';
import { NANOGPT } from './learn-tutor-claims.js';
import { emptyStore } from './learn-tutor-evidence.js';
import { HANDOFF_CAPABILITY_NAMES } from '../../control-plane/src/agents/learn-tutor.js';
import { HANDOFF_CAPABILITIES, HANDOFF_PATH } from '../../control-plane/src/learn-tutor-handoff.js';
import { CANVAS_TARGET_LIMIT } from '../../control-plane/src/learn-ask-context.js';

const ID = Object.keys(NANOGPT.claims)[0];
// Comments out, so only code is grepped (learn-tutor-auto.test.mjs J does the same).
const strip = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const turnOf = (over = {}) => ({ turn_id: 't', raw_user_message: 'why?', input_modality: 'text', slash: null, canvas: { app: 'a', board: 'main' }, target: null, card_state: null, evidence: [], constraints: [], recent_turns: [], recent_actions: [], ...over });
const stateOf = state => ({ [ID]: { claim: ID, concept: NANOGPT.claims[ID].concept, state, ...(state === 'prerequisite_gap' ? { prerequisite: 'p' } : {}) } });
const ROWS = [
  ['slash', { turn: { slash: 'deeper' }, states: stateOf('not_yet_observed') }],
  ['returned', { turn: { returned_from: { claim: ID } }, states: stateOf('not_yet_observed') }],
  ['off_slice', { claims: [], states: {} }],
  ['gap', { states: stateOf('prerequisite_gap') }],
  ['gap_inline', { turn: { dive_choice: { choice: 'inline', concept: 'p' } }, states: stateOf('prerequisite_gap') }],
  ['misconception', { states: stateOf('misconception') }],
  ['misconception_explain', { states: stateOf('misconception'), store: { ...emptyStore(), socratic: { [ID]: 2 } } }],
  ['uncertain_unsettled', { states: stateOf('uncertain'), evaluation: { status: 'uncertain', escalation: { uncertain: [] } } }],
  ['uncertain', { states: stateOf('uncertain') }],
  ['not_yet_observed', { states: stateOf('not_yet_observed') }],
  ['understood', { states: stateOf('understood') }],
];
const routeAt = ([, args], over = {}) => route({ claims: [ID], evaluation: null, store: emptyStore(), ...args, turn: turnOf({ ...args.turn, ...over }) });
// Rows whose existing rule fixes the move (Task 11b MATERIAL_FIXED): no handoff there either.
const FIXED = ['slash', 'returned', 'uncertain_unsettled'];
const HANDOFF = { type: 'handoff', capability: 'repository_context', request: 'Where is this function called?' };
const SAY = { type: 'respond_text', text: 'Here is how to read the question.' };

test('router: handoff is offered only where the canvas reads a repository (turn.handoff_offer), on every row whose rule does not fix the move', () => {
  for (const row of ROWS) {
    const plain = routeAt(row);
    assert.equal(plain.allowed.includes('handoff'), false, `${row[0]}: no repository, no handoff`);
    for (const input_modality of ['text', 'voice']) {
      const offered = routeAt(row, { input_modality, handoff_offer: true });
      assert.deepEqual(offered, { ...plain, allowed: FIXED.includes(row[0]) ? plain.allowed : [...plain.allowed, 'handoff'] }, `${row[0]} ${input_modality}`);
    }
  }
  const hook = turnOf({ raw_user_message: '', next_step: { suggestion_id: 's', hook: 'h', learning_goal: 'g', concept_ids: [], claim_ids: [] }, handoff_offer: true });
  assert.deepEqual(route({ turn: hook, claims: [], states: {}, evaluation: null, store: emptyStore() }).allowed, ['respond_text', 'handoff'], 'hook turns too');
});

test('buildTurn: the offer is the structured repository flag; the words never make one', () => {
  const store = emptyStore(), canvas = { app: 'repo-0000aaaa-sorting', board: 'main' }, domain = canvasDomain({ goal: 'g' });
  assert.equal(buildTurn({ raw: 'why?', canvas, block: null, store, states: {}, domain, repository: true }).turn.handoff_offer, true);
  for (const raw of ['What does this function do?', 'Show me the code in the repository.', 'Who calls forward in model.py?'])
    assert.equal('handoff_offer' in buildTurn({ raw, canvas, block: null, store, states: {}, domain }).turn, false, raw);
});

test('validator: one handoff, a known capability and a non-blank 1-1000 character request (code allowed); never on a turn that does not offer it', () => {
  const offered = { row: 'off_slice', strategy: 'none', allowed: ['respond_text', 'handoff'], claim: null };
  const run = (actions, routed = offered) => validateActions({ actions }, routed, turnOf({ handoff_offer: true }), canvasDomain({ goal: 'g' }));
  assert.deepEqual(run([SAY, { ...HANDOFF, request: '  Where is this function called?  ', title: 'extra' }]).actions, [SAY, HANDOFF], 'normalized to capability and request');
  assert.deepEqual(run([HANDOFF]).actions, [HANDOFF], 'a handoff alone is a whole turn');
  for (const capability of ['research', 'do', 'Repository_Context', undefined]) assert.equal(run([{ ...HANDOFF, capability }]).decisions[0].stage, 'schema', String(capability));
  for (const request of ['', '   ', 'x'.repeat(1001), undefined, 7]) assert.equal(run([{ ...HANDOFF, request }]).decisions[0].stage, 'schema', String(request));
  // Fix round 1 (A-I1, B-I4): a question for the source reader may hold code, identifiers, file names and => (handoffProblem).
  for (const request of ['what does `merge_sort` do in sort.py?', 'where does merge(a, b) => list get b?']) assert.deepEqual(run([{ ...HANDOFF, request }]).actions, [{ ...HANDOFF, request }], request);
  assert.equal(run([HANDOFF, { ...HANDOFF, request: 'And the other one?' }]).decisions[1].reason, 'a second handoff');
  const refused = run([SAY, HANDOFF], { ...offered, allowed: ['respond_text'] });
  assert.deepEqual([refused.actions, refused.decisions[1].accepted], [[SAY], false], 'not offered: dropped');
  assert.deepEqual(HANDOFF_CAPABILITY_NAMES, Object.keys(HANDOFF_CAPABILITIES));
});

test('action contract: handoff carries its capability, modality text, cost_tier model; every other action has capability null', () => {
  const ctx = { domain: NANOGPT, materials: [], claims: [ID] };
  const contract = actionContract(HANDOFF, ctx);
  assert.deepEqual(contract, { action_type: 'handoff', command: null, capability: 'repository_context', modality: 'text', cost_tier: 'model', target_concept_ids: [NANOGPT.claims[ID].concept], target_claim_ids: [ID], expected_evidence: [], estimated_learning_seconds: null });
  for (const action of [SAY, { type: 'suggest_research', request: 'x' }, { type: 'create_material', command: 'explain', request: 'x' }]) assert.equal(actionContract(action, ctx).capability, null, action.type);
});

// ---------- runTurn: the handoff runs after the plan, through the route ----------

const SHA = 'c'.repeat(40);
const CODE_CARD = { id: 'blk-code', type: 'snippet', title: 'merge_sort', body: 'def merge_sort(xs): ...', sources: [{ kind: 'code', repo: 'example/sorting', revision: SHA, path: 'sort.py', lines: [10, 24] }] };
const REPO = { canvas: { app: 'repo-0000aaaa-sorting', board: 'main' }, access: { app: 'repo-0000aaaa-sorting' }, domain: canvasDomain({ goal: 'example/sorting' }) };
const ANSWER = 'merge_sort is called by sort_file in cli.py, once per input file.';
const OK = { capability: 'repository_context', answer: ANSWER, telemetry: { started_at: '2026-10-07T10:00:00.000Z', completed_at: '2026-10-07T10:00:01.200Z', ms: 1200, outcome: 'ok', failure: null, served_model: 'claude-opus-5', calls: 2, input_tokens: 2400, output_tokens: 160, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: null } };
const failedReply = (failure, outcome = 'failed') => ({ capability: 'repository_context', answer: null, telemetry: { ...OK.telemetry, outcome, failure, calls: 0, input_tokens: 0, output_tokens: 0 } });
function worker(plan, handoff = OK) {
  const sent = [];
  const post = async (path, body) => {
    sent.push({ path, body });
    if (path === '/api/learn/tutor/plan') return { strategy: 'none', constraints_add: [], ...plan };
    if (path === HANDOFF_PATH) { if (typeof handoff === 'function') return handoff(); return handoff; }
    throw new Error(`unexpected ${path}`);
  };
  return { sent, post };
}
const turnWith = async (plan, { handoff = OK, ...extra } = {}) => {
  const w = worker(plan, handoff);
  const r = await runTurn({ raw: 'Who calls this?', block: CODE_CARD, store: emptyStore(), post: w.post, repository: true, trace: true, ...REPO, ...extra });
  return { ...r, sent: w.sent, posted: w.sent.find(s => s.path === HANDOFF_PATH)?.body ?? null };
};

test('success: the route gets the action and structured grounding; its answer is the reply; nothing else is posted', async () => {
  const r = await turnWith({ actions: [SAY, HANDOFF], grounding_status: 'grounded', source_types_used: ['selected_material'] });
  assert.deepEqual(r.sent.map(s => s.path), ['/api/learn/tutor/plan', HANDOFF_PATH], 'no evaluate or journey POST from the handoff');
  assert.ok(r.sent[0].body.context.allowed_actions.includes('handoff'));
  assert.deepEqual(r.posted, { app: 'repo-0000aaaa-sorting', capability: 'repository_context', request: HANDOFF.request,
    selection: { repository: 'example/sorting', revision: SHA, file: 'sort.py', line_range: { start: 10, end: 24 } },
    context: { card: { id: 'blk-code', title: 'merge_sort', text: 'merge_sort\ndef merge_sort(xs): ...' } } });
  assert.equal(r.text, `${SAY.text}\n\n${ANSWER}`, 'the lead-in first, then the handoff answer');
  assert.deepEqual(r.store.turns.at(-1).tutor, r.text);
  const d = r.trace.decision;
  assert.deepEqual(d.actions.map(a => [a.action_type, a.command, a.capability, a.modality, a.cost_tier]), [['respond_text', null, null, 'text', 'none'], ['handoff', null, 'repository_context', 'text', 'model']]);
  assert.deepEqual([d.chosen_action.action_type, d.chosen_action.capability], ['handoff', 'repository_context']);
  assert.deepEqual([d.grounding_status, d.source_types_used], ['grounded', ['selected_material', 'repository']], 'a successful handoff adds repository');
  assert.deepEqual(r.trace.runtime.handoff, { started_at: r.trace.runtime.handoff.started_at, completed_at: r.trace.runtime.handoff.completed_at, ms: r.trace.runtime.handoff.ms, outcome: 'ok', failure: null, model_id: 'claude-opus-5', usage: { input_tokens: 2400, output_tokens: 160, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: null } });
  assert.match(r.trace.runtime.handoff.started_at, /^\d{4}-\d\d-\d\dT/);
  const event = JSON.stringify(r.trace);
  for (const secret of [ANSWER, HANDOFF.request, 'merge_sort is called']) assert.equal(event.includes(secret), false, 'the event never carries the answer or the request');
});

test('selection: a selected code card gives the route its source identity; no code source, no selection; words never make one', async () => {
  const plain = { id: 'blk-note', type: 'explanation', title: 'Divide and conquer', body: 'Split, sort each half, merge.' };
  const noCode = await turnWith({ actions: [HANDOFF] }, { block: plain, raw: 'Where is merge in sort.py lines 30-40 called?' });
  assert.deepEqual(noCode.posted, { app: 'repo-0000aaaa-sorting', capability: 'repository_context', request: HANDOFF.request, context: { card: { id: 'blk-note', title: 'Divide and conquer', text: 'Divide and conquer\nSplit, sort each half, merge.' } } });
  const none = await turnWith({ actions: [HANDOFF] }, { block: null, raw: 'Who calls merge_sort in example/sorting sort.py:10-24?' });
  assert.deepEqual(none.posted, { app: 'repo-0000aaaa-sorting', capability: 'repository_context', request: HANDOFF.request }, 'no selection and no card');
  const invalid = await turnWith({ actions: [HANDOFF] }, { block: { ...CODE_CARD, sources: [{ kind: 'code', repo: 'example/sorting', revision: 'HEAD', path: 'sort.py', lines: [1, 2] }] } });
  assert.equal('selection' in invalid.posted, false, 'only a well-formed code source (card-sources.js) is a selection');
  const long = await turnWith({ actions: [HANDOFF] }, { block: { ...CODE_CARD, title: 't'.repeat(400), body: 'b'.repeat(9000) } });
  assert.deepEqual([long.posted.context.card.title.length, long.posted.context.card.text.length], [300, CANVAS_TARGET_LIMIT], 'bounded as the route bounds the card');
});

// Requirement 4 and Addendum 3: a failure never yields a code-grounded answer; the reply keeps only the plan's own words and says
// the source context could not be retrieved; the trace records retrieval_failed whatever the planner declared.
test('failure honesty: every failed, refused or unreachable handoff says the source could not be retrieved and records retrieval_failed', async () => {
  const cases = [
    ['no repository', failedReply('no_repository_context'), 'failed', 'no_repository_context'],
    ['retrieval error', failedReply('retrieval_error'), 'failed', 'retrieval_error'],
    ['route timeout', failedReply('timeout'), 'failed', 'timeout'],
    ['model error', failedReply('model_error'), 'failed', 'model_error'],
    ['answer cut', failedReply('too_large'), 'failed', 'too_large'],
    ['model refusal', failedReply('refused', 'refused'), 'refused', 'refused'],
    ['over the cap (429)', () => { throw Object.assign(new Error('This lookup is paused for now; try again later.'), { status: 429, data: failedReply('limited', 'refused') }); }, 'refused', 'limited'],
    ['body over the limit (400)', () => { throw Object.assign(new Error('too big'), { status: 400, data: { error: 'too big', failure: 'too_large' } }); }, 'failed', 'too_large'],
    ['browser timeout', () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); }, 'failed', 'timeout'],
    ['network error', () => { throw new TypeError('Failed to fetch'); }, 'failed', 'request_error'],
    ['ok without an answer', { ...OK, answer: '  ' }, 'failed', 'model_error'],
    ['a failure carrying stray text', { ...failedReply('model_error'), answer: 'merge_sort is probably called by main.' }, 'failed', 'model_error'],
  ];
  for (const [name, handoff, outcome, failure] of cases) {
    const r = await turnWith({ actions: [SAY, HANDOFF], grounding_status: 'grounded', source_types_used: ['selected_material', 'repository'] }, { handoff });
    assert.equal(r.text, `${SAY.text}\n\n${HANDOFF_FAILED}`, `${name}: the plan's own words, then the plain message`);
    assert.equal(r.text.includes(ANSWER), false, name);
    const d = r.trace.decision;
    assert.deepEqual([d.grounding_status, d.source_types_used], ['retrieval_failed', ['selected_material']], `${name}: retrieval_failed, never repository`);
    assert.deepEqual([r.trace.runtime.handoff.outcome, r.trace.runtime.handoff.failure], [outcome, failure], name);
    assert.deepEqual(d.actions.map(a => a.action_type), ['respond_text', 'handoff'], `${name}: the trace shows what ran`);
  }
  const alone = await turnWith({ actions: [HANDOFF] }, { handoff: failedReply('model_error') });
  assert.equal(alone.text, HANDOFF_FAILED, 'no words of its own: only the plain message');
  assert.match(HANDOFF_FAILED, /source context could not be retrieved/);
  assert.doesNotMatch(HANDOFF_FAILED, /I (found|looked|checked|read)|the code (says|shows)/i, 'never claims the code was inspected');
});

// Requirement 6: planner_ms, handoff_ms and the learner's blocking wait, measured apart on a stubbed clock, never one aggregate.
test('latency: planner_ms, handoff_ms and blocking_wait_ms are measured apart (stubbed clock); a spoken lead-in is the first text', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let clock = 0;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });
  try {
    const post = async (path, body, stream) => {
      if (path === '/api/learn/tutor/plan') {
        clock += 300; stream?.onSentence?.({ text: 'Here is how to read the question.', action: 'respond_text', constraints_add: [], explicit_request: null });
        clock += 500; return { strategy: 'none', constraints_add: [], actions: [SAY, HANDOFF] };
      }
      clock += 1500; return OK;
    };
    const run = extra => runTurn({ raw: 'Who calls this?', block: CODE_CARD, store: emptyStore(), post, repository: true, trace: true, ...REPO, ...extra });
    clock = 0;
    const typed = await run({});
    assert.deepEqual(typed.trace.runtime.timing, { total_ms: 2300, planner_ms: 800, first_text_ms: 2300, handoff_ms: 1500, blocking_wait_ms: 2300 });
    assert.deepEqual([typed.bench.ms.planner, typed.bench.ms.handoff, typed.bench.ms.to_answer], [800, 1500, 2300]);
    assert.equal(typed.trace.runtime.handoff.ms, 1500);
    clock = 0;
    const spoken = [];
    const voice = await run({ inputModality: 'voice', onSpeakable: text => spoken.push(text) });
    assert.deepEqual(spoken, ['Here is how to read the question.']);
    assert.deepEqual(voice.trace.runtime.timing, { total_ms: 2300, planner_ms: 800, first_text_ms: 300, handoff_ms: 1500, blocking_wait_ms: 2300 }, 'the lead-in is heard first; the answer still waits for the handoff');
    clock = 0;
    const words = await runTurn({ raw: 'What is a tensor?', block: null, store: emptyStore(), post: async () => { clock += 700; return { strategy: 'none', constraints_add: [], actions: [SAY] }; }, repository: true, trace: true, ...REPO });
    assert.deepEqual(words.trace.runtime.timing, { total_ms: 700, planner_ms: 700, first_text_ms: 700, handoff_ms: null, blocking_wait_ms: 700 }, 'no handoff: no handoff time');
    assert.equal(words.trace.runtime.handoff, null);
  } finally { if (saved) Object.defineProperty(globalThis, 'performance', saved); else delete globalThis.performance; }
});

test('an offered handoff the plan does not choose runs nothing; a plain canvas never offers it, so a planned one is dropped', async () => {
  const respond = await turnWith({ actions: [SAY], grounding_status: 'grounded', source_types_used: ['model_knowledge'] }, { raw: 'What is a tensor?', block: null });
  assert.deepEqual([respond.sent.map(s => s.path), respond.text, respond.trace.runtime.handoff, respond.trace.decision.source_types_used], [['/api/learn/tutor/plan'], SAY.text, null, ['model_knowledge']]);
  const plain = await turnWith({ actions: [SAY, HANDOFF] }, { repository: false, raw: 'What does a function mean in mathematics?', block: null });
  assert.equal(plain.sent[0].body.context.allowed_actions.includes('handoff'), false, 'the router proves it: not offered');
  assert.deepEqual([plain.sent.map(s => s.path), plain.actions.map(a => a.type), plain.text], [['/api/learn/tutor/plan'], ['respond_text'], SAY.text]);
});

// No keyword router: the same plan on words full of code, function and repository vocabulary gives the same route, allowed actions
// and execution; and no Tutor product module offers or triggers the handoff from the learner's words.
test('anti-hardcoding: the handoff offer and its run never read the learner words', async () => {
  const seen = [];
  for (const raw of ['Why?', 'What does this function do in the repository code?', 'Show me where the code calls it.']) {
    const r = await turnWith({ actions: [SAY] }, { raw, block: null });
    seen.push(JSON.stringify([r.routed, r.actions, r.contracts, r.sent.map(s => s.path)]));
  }
  assert.equal(new Set(seen).size, 1);
  // The offer is set only from the structured flag and read only by the router (both lines pinned); the flag is app data
  // (canvasRepository) or the page's own prop; and no Tutor product module tests the words a code question uses.
  const tutor = strip(readFileSync(new URL('learn-tutor.js', import.meta.url), 'utf8'));
  assert.equal(tutor.match(/handoff_offer/g).length, 2);
  assert.match(tutor, /\.\.\.\(repository \? \{ handoff_offer: true \} : \{\}\),/);
  assert.match(tutor, /if \(turn\.handoff_offer && !MATERIAL_FIXED\.includes\(row\) && !list\.includes\(HANDOFF_ACTION\)\)/);
  assert.match(strip(readFileSync(new URL('LearnTutor.jsx', import.meta.url), 'utf8')), /export const canvasRepository = app => typeof app\?\.name === 'string' && \(app\.name\.startsWith\('repo-'\) \|\| !!app\.project\);/);
  const WORDS = /\b(code|function|repositor\w*|source|calls?|called|defined|class|implementation)\b/i;
  for (const file of ['learn-tutor.js', 'learn-tutor-validate.js', 'learn-tutor-actions.js', 'learn-tutor-trace.js', 'LearnTutor.jsx', '../../control-plane/src/learn-tutor-routes.js']) {
    const code = strip(readFileSync(new URL(file, import.meta.url), 'utf8'));
    const regexes = code.split('\n').map(line => line.match(/(^|[=(,:\s])\/(?![/*\s])(?:\\.|[^/\n])+\/[dgimsuyv]*/)?.[0] || '').filter(literal => WORDS.test(literal));
    assert.deepEqual(regexes, [], `${file}: a regex tests code-question words`);
    assert.equal(/\.(?:includes|startsWith|endsWith|indexOf|search|match)\(\s*['"`][^'"`]*\b(?:code|function|repositor\w*|calls?)\b/i.test(code), false, `${file}: a string test of code-question words`);
  }
});
