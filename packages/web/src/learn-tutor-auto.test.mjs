// Task 11b: Auto is the primary interface (owner eighth, ninth, eleventh, thirteenth, fourteenth and nineteenth messages).
// Natural typing and Voice reach the same Tutor planner on every canvas, plain canvases included, and may make material when
// the Tutor judges it helps; /ask and /teach are explicit overrides through the same runTurn; the decision trace records what
// the Tutor read the learner as wanting (inferred_intent) apart from what it did (actions). Stand-in planners only: no model
// call, no network. These tests check plumbing and obvious constraints, never one expected modality for a natural-language
// prompt - judging the real model's choices belongs to the Tutor Evaluation agent after the final SHA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { SLASHES, buildTurn, executeActions, plannerContext, route, runTurn } from './learn-tutor.js';
import { validateActions } from './learn-tutor-validate.js';
import { actionContract } from './learn-tutor-actions.js';
import { decisionEvent, hooksEvent, shownEvent } from './learn-tutor-trace.js';
import { canvasDomain } from './learn-journey-domain.js';
import { tutorContext } from './learn-tutor-domains.js';
import { nextStepsBasis } from './learn-next-steps.js';
import { NANOGPT, cardModule } from './learn-tutor-claims.js';
import { cardBlock } from './nanogpt/board.js';
import { emptyStore, deriveClaimStates } from './learn-tutor-evidence.js';
import { insertsWithoutModel, materialCommands, runMaterials } from './learn-slash.js';
import { plannerTier } from '../../control-plane/src/learn-tutor-routes.js';
import { commandsFor } from './agent/slash.js';
import { CANVAS_SYSTEM, EXPLICIT_MODE, MODE_SLASHES, PLANNER_SYSTEM, plannerRequest, plannerSystem } from '../../control-plane/src/agents/learn-tutor.js';
import { HANDOFF_FAILED } from './learn-tutor.js';

const MATERIALS = materialCommands();
const FREE = MATERIALS.find(m => m.command === 'explain'), PAID = MATERIALS.find(m => m.command === 'animate');
const ID = Object.keys(NANOGPT.claims)[0];
const turnOf = (over = {}) => ({ turn_id: 't', raw_user_message: 'why?', input_modality: 'text', slash: null, canvas: { app: 'a', board: 'main' }, target: null, card_state: null, evidence: [], constraints: [], recent_turns: [], recent_actions: [], ...over });
const stateOf = state => ({ [ID]: { claim: ID, concept: NANOGPT.claims[ID].concept, state, ...(state === 'prerequisite_gap' ? { prerequisite: 'p' } : {}) } });
// Every router row, reached through its own inputs.
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
// Rows whose existing rule fixes the move (11b reading of brief item 1): a return re-asks its question, an unsettled
// explanation gets one clarifying question, /deeper and /simplify navigate authored cards. Every other row may make material.
const FIXED = ['slash', 'returned', 'uncertain_unsettled'];

test('router: create_material on typed and voice turns whenever materials exist, on every row whose rule does not fix the move', () => {
  for (const row of ROWS) {
    const plain = routeAt(row);
    assert.equal(plain.row, row[0]);
    assert.equal(plain.allowed.includes('create_material'), false, `${row[0]}: no materials, no create_material`);
    for (const input_modality of ['text', 'voice']) {
      const offered = routeAt(row, { input_modality, available_materials: MATERIALS });
      const want = FIXED.includes(row[0]) ? plain.allowed : [...plain.allowed, 'create_material'];
      assert.deepEqual(offered, { ...plain, allowed: want }, `${row[0]} ${input_modality}: create_material is the only addition`);
    }
  }
});

test('router: suggest_research is offered on every row, only where the page can open Research (turn.research_offer)', () => {
  for (const row of ROWS) {
    const plain = routeAt(row);
    assert.equal(plain.allowed.includes('suggest_research'), false, row[0]);
    assert.deepEqual(routeAt(row, { research_offer: true }), { ...plain, allowed: [...plain.allowed, 'suggest_research'] }, row[0]);
  }
  const hook = turnOf({ raw_user_message: '', next_step: { suggestion_id: 's', hook: 'h', learning_goal: 'g', concept_ids: [], claim_ids: [] }, available_materials: MATERIALS, research_offer: true });
  assert.deepEqual(route({ turn: hook, claims: [], states: {}, evaluation: null, store: emptyStore() }).allowed, ['respond_text', 'create_material', 'suggest_research'], 'hook turns too');
});

test('planner context: available_materials is the last key whenever create_material is allowed, absent otherwise', () => {
  for (const row of ROWS) {
    const turn = turnOf({ ...row[1].turn, available_materials: MATERIALS });
    const routed = routeAt(row, { available_materials: MATERIALS });
    const context = plannerContext({ turn, routed, block: null, states: { ...deriveClaimStates([], NANOGPT.claims), ...row[1].states }, claims: row[1].claims ?? [ID], store: emptyStore() });
    if (FIXED.includes(row[0])) assert.equal('available_materials' in context, false, row[0]);
    else { assert.deepEqual(context.available_materials, MATERIALS, row[0]); assert.equal(Object.keys(context).at(-1), 'available_materials'); }
  }
  const typed = turnOf();
  assert.equal('available_materials' in plannerContext({ turn: typed, routed: route({ turn: typed, claims: [ID], states: stateOf('not_yet_observed'), evaluation: null, store: emptyStore() }), block: null, states: deriveClaimStates([], NANOGPT.claims), claims: [ID], store: emptyStore() }), false, 'no materials, no key');
});

test('buildTurn: a typed turn carries the materials it is offered; /ask and /teach are the turn slash, /research and /do are not', () => {
  const store = emptyStore(), states = {}, canvas = { app: 'a', board: 'main' }, domain = canvasDomain({ goal: 'g' });
  assert.deepEqual(buildTurn({ raw: 'why?', canvas, block: null, store, states, domain, materials: MATERIALS }).turn.available_materials, MATERIALS);
  assert.equal('available_materials' in buildTurn({ raw: 'why?', canvas, block: null, store, states, domain }).turn, false);
  assert.equal(buildTurn({ raw: 'why?', canvas, block: null, store, states, domain, research: true }).turn.research_offer, true);
  assert.deepEqual(MODE_SLASHES, ['ask', 'teach']);
  for (const name of MODE_SLASHES) assert.ok(SLASHES.includes(name));
  // Fix A3: /ask and /teach are a marker (turn.mode) on an ordinary turn; fix B5: /deeper and /simplify keep the turn slash
  // only on a domain with a depth ladder (nanoGPT here), so on this plain canvas they are ordinary turns too.
  for (const name of ['ask', 'teach']) assert.deepEqual([buildTurn({ raw: 'x', slash: name, canvas, block: null, store, states, domain }).turn.slash, buildTurn({ raw: 'x', slash: name, canvas, block: null, store, states, domain }).turn.mode], [null, name]);
  for (const name of ['deeper', 'simplify']) assert.deepEqual([buildTurn({ raw: 'x', slash: name, canvas, block: null, store, states, domain: NANOGPT }).turn.slash, buildTurn({ raw: 'x', slash: name, canvas, block: null, store, states, domain }).turn.slash], [name, null]);
  for (const name of ['research', 'do', 'motion', 'quiz']) assert.deepEqual([buildTurn({ raw: `/${name} x`, slash: name, canvas, block: null, store, states, domain }).turn.slash, buildTurn({ raw: `/${name} x`, slash: name, canvas, block: null, store, states, domain }).turn.mode ?? null], [null, null], name);
});

test('validator: suggest_research needs the route and a plain 1-1000 character request; it only ever offers', () => {
  const turn = turnOf({ research_offer: true });
  const routed = { row: 'off_slice', strategy: 'none', allowed: ['respond_text', 'suggest_research'], claim: null };
  const run = (actions, r = routed) => validateActions({ actions }, r, turn, canvasDomain({ goal: 'g' }));
  const ok = run([{ type: 'respond_text', text: 'I do not have reliable current information on that yet.' }, { type: 'suggest_research', request: ' the newest long-context methods ' }]);
  assert.deepEqual(ok.actions, [{ type: 'respond_text', text: 'I do not have reliable current information on that yet.' }, { type: 'suggest_research', request: 'the newest long-context methods' }]);
  assert.equal(run([{ type: 'suggest_research', request: 'x' }], { ...routed, allowed: ['respond_text'] }).decisions[0].stage, 'route');
  for (const request of ['', '   ', 'x'.repeat(1001), 'run `ls`', 'a => b', undefined]) assert.equal(run([{ type: 'suggest_research', request }]).decisions[0].stage, 'schema', String(request));
  assert.deepEqual(run([{ type: 'suggest_research', request: 'cases where p > 0.5 and the set {a, b}' }]).actions, [{ type: 'suggest_research', request: 'cases where p > 0.5 and the set {a, b}' }]);
});

test('validator: the reading fields are bounded; unknown values drop to null with a repair log line, never failing the turn', () => {
  const routed = { row: 'off_slice', strategy: 'none', allowed: ['respond_text'], claim: null };
  const say = [{ type: 'respond_text', text: 'Here is the idea.' }];
  const read = response => validateActions({ actions: say, ...response }, routed, turnOf(), canvasDomain({ goal: 'g' }));
  const clean = read({ inferred_intent: 'teach', modality_override: 'motion', clarification_requested: true, grounding_status: 'partially_grounded', source_types_used: ['selected_material', 'model_knowledge'] });
  assert.deepEqual(clean.reading, { inferred_intent: 'teach', modality_override: 'motion', clarification_requested: true, grounding_status: 'partially_grounded', source_types_used: ['selected_material', 'model_knowledge'] });
  assert.deepEqual(clean.log, []);
  assert.deepEqual(read({}).reading, { inferred_intent: null, modality_override: null, clarification_requested: null, grounding_status: null, source_types_used: null }, 'missing stays null');
  const bad = read({ inferred_intent: 'quiz', modality_override: 'video', clarification_requested: 'yes', grounding_status: 'retrieval_failed', source_types_used: ['canvas', 'research', 'canvas', 7] });
  assert.deepEqual(bad.reading, { inferred_intent: null, modality_override: null, clarification_requested: null, grounding_status: null, source_types_used: ['canvas'] });
  assert.deepEqual(bad.log, ['dropped reading field inferred_intent', 'dropped reading field modality_override', 'dropped reading field clarification_requested', 'dropped reading field grounding_status', 'dropped reading field source_types_used'], 'field names only, never the values');
  assert.deepEqual(bad.actions, say, 'the turn itself is untouched');
  assert.equal(read({ source_types_used: 'canvas' }).reading.source_types_used, null);
});

test('action contract: cost_tier none for in-turn actions and offers, model for a free material, paid for one behind Generate / Not now', () => {
  const ctx = { domain: NANOGPT, materials: MATERIALS, claims: [ID] };
  const tier = action => actionContract(action, ctx).cost_tier;
  assert.equal(tier({ type: 'create_material', command: FREE.command, request: 'x' }), 'model');
  assert.equal(tier({ type: 'create_material', command: PAID.command, request: 'x' }), 'paid');
  for (const action of [{ type: 'respond_text', text: 'a b' }, { type: 'ask_question', text: 'q?', claim: ID, purpose: 'diagnose' }, { type: 'show_authored_card', card: NANOGPT.cards[0], mode: 'suggest' }, { type: 'focus_part', card: NANOGPT.cards[0], part_id: 'x' }, { type: 'suggest_depth', card: NANOGPT.cards[0] }, { type: 'suggest_dive', concept: null, title: 't' }, { type: 'suggest_research', request: 'x' }, { type: 'return_from_dive' }])
    assert.equal(tier(action), 'none', action.type);
  assert.deepEqual(Object.keys(actionContract({ type: 'respond_text', text: 'a' }, ctx)), ['action_type', 'command', 'capability', 'modality', 'cost_tier', 'target_concept_ids', 'target_claim_ids', 'expected_evidence', 'estimated_learning_seconds']);
  assert.equal(actionContract({ type: 'suggest_research', request: 'x' }, ctx).modality, null, 'an offer to research is no learning material');
});

// ---------- The decision trace ----------

const NEW_KEYS = ['intent_mode', 'inferred_intent', 'explicit_modality_override', 'intent_status', 'clarification_requested', 'grounding_status', 'source_types_used', 'research_offered', 'research_executed'];
const fields = e => Object.fromEntries(NEW_KEYS.map(k => [k, e.decision[k]]));
function worker(plan) {
  const sent = [];
  const post = async (path, body) => {
    sent.push({ path, body });
    if (path === '/api/learn/tutor/plan') return typeof plan === 'function' ? plan(body.context) : plan;
    if (path === '/api/learn/tutor/evaluate') return { status: 'error', evaluator: 'jev', events: [] };
    if (path === '/api/learn/tutor/handoff') return HANDOFF_OK; // Task 11c-B: the 11c-A route, stubbed
    throw new Error(`unexpected ${path}`);
  };
  return { sent, post };
}
// Task 11c-B: a stubbed handoff route reply (learn-tutor-handoff.js shape) and a repository canvas with a selectable code card.
const HANDOFF_ANSWER = 'From the source: sort_file calls it once per input file.';
const HANDOFF_OK = { capability: 'repository_context', answer: HANDOFF_ANSWER, telemetry: { started_at: '2026-10-07T10:00:00.000Z', completed_at: '2026-10-07T10:00:01.000Z', ms: 1000, outcome: 'ok', failure: null, served_model: 'claude-opus-5', calls: 2, input_tokens: 2000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost_usd: null } };
const REPO_APP = 'repo-0000aaaa-sorting';
const SORT_CODE = { id: 'blk-sort', type: 'snippet', title: 'merge_sort', body: 'def merge_sort(xs): ...', sources: [{ kind: 'code', repo: 'example/sorting', revision: 'c'.repeat(40), path: 'sort.py', lines: [10, 24] }] };
const repoCanvas = () => ({ canvas: { app: REPO_APP, board: 'main' }, access: { app: REPO_APP }, domain: tutorContext({ title: 'example/sorting' }).domain, repository: true });
const plainCanvas = (goal = 'Notes') => ({ canvas: { app: 'canvas-0000aaaa', board: 'main' }, access: { app: 'canvas-0000aaaa' }, domain: tutorContext({ title: goal }).domain });
const turnWith = async (plan, extra = {}) => { const w = worker(plan); const r = await runTurn({ raw: 'why?', block: null, store: emptyStore(), post: w.post, materials: MATERIALS, research: true, trace: true, ...plainCanvas(), ...extra }); return { ...r, sent: w.sent }; };
const SAY = { type: 'respond_text', text: 'Here is the short answer.' };

test('trace: Auto turns record the planner\'s reading, or missing; explicit /ask and /teach record the command; nothing claims research ran', async () => {
  const declared = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY, { type: 'suggest_research', request: 'newer methods' }], inferred_intent: 'research', modality_override: 'motion', clarification_requested: false, grounding_status: 'insufficient_evidence', source_types_used: ['model_knowledge'] });
  assert.deepEqual(fields(declared.trace), { intent_mode: 'auto', inferred_intent: 'research', explicit_modality_override: 'motion', intent_status: 'declared', clarification_requested: false, grounding_status: 'insufficient_evidence', source_types_used: ['model_knowledge'], research_offered: true, research_executed: false });
  assert.deepEqual(declared.trace.decision.actions.map(a => a.action_type), ['respond_text', 'suggest_research'], 'the executed actions stay apart from the intent');
  const missing = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY] });
  assert.deepEqual(fields(missing.trace), { intent_mode: 'auto', inferred_intent: null, explicit_modality_override: null, intent_status: 'missing', clarification_requested: null, grounding_status: null, source_types_used: null, research_offered: false, research_executed: false });
  const unknown = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY], inferred_intent: 'quiz' });
  assert.deepEqual([unknown.trace.decision.inferred_intent, unknown.trace.decision.intent_status], [null, 'missing'], 'an unknown value is never a classification');
  assert.ok(unknown.trace.runtime.validation.repairs.includes('reading_value_dropped'));
  for (const name of MODE_SLASHES) {
    const explicit = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY], inferred_intent: name === 'ask' ? 'teach' : 'ask' }, { raw: `/${name} why?`, slash: name });
    assert.deepEqual([explicit.trace.decision.intent_mode, explicit.trace.decision.inferred_intent, explicit.trace.decision.intent_status], ['explicit_slash', name, 'explicit'], `${name}: the planner's own field never overwrites the command`);
  }
  const deeper = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY], inferred_intent: 'teach' }, { raw: '/deeper', slash: 'deeper', domain: NANOGPT, canvas: { app: 'a', board: 'main' }, access: { app: 'a' } });
  assert.deepEqual([deeper.trace.decision.intent_mode, deeper.trace.decision.inferred_intent, deeper.trace.decision.intent_status], ['explicit_slash', 'teach', 'declared'], '/deeper is a slash but names no intent');
});

test('trace: the actions and chosen_action carry cost_tier; hook clicks and hook sets record auto with no intent unless declared', async () => {
  const made = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY, { type: 'create_material', command: PAID.command, request: 'the mechanism moving' }] });
  assert.deepEqual(made.trace.decision.actions.map(a => [a.action_type, a.cost_tier]), [['respond_text', 'none'], ['create_material', 'paid']]);
  assert.deepEqual([made.trace.decision.chosen_action.action_type, made.trace.decision.chosen_action.cost_tier], ['create_material', 'paid']);
  const STEP = { suggestion_id: 'ns_01010101.1', set_id: 'ns_01010101', hook: 'h?', learning_goal: 'g', concept_ids: [], claim_ids: [] };
  const hook = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY] }, { raw: '', nextStep: STEP });
  assert.deepEqual([hook.trace.decision.intent_mode, hook.trace.decision.inferred_intent, hook.trace.decision.intent_status], ['auto', null, 'missing']);
  const hookDeclared = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY], inferred_intent: 'teach' }, { raw: '', nextStep: STEP });
  assert.deepEqual([hookDeclared.trace.decision.inferred_intent, hookDeclared.trace.decision.intent_status], ['teach', 'declared']);
  const set = { set_id: 'ns_02020202', options: [], telemetry: {} };
  for (const e of [hooksEvent(set), shownEvent(set)]) assert.deepEqual(fields(e), { intent_mode: 'auto', inferred_intent: null, explicit_modality_override: null, intent_status: 'missing', clarification_requested: null, grounding_status: null, source_types_used: null, research_offered: false, research_executed: false }, e.event);
});

// Item 3: the reading fields are telemetry. Changing them never changes the route, the allowed actions, the validation or the
// executed actions; only the trace fields that report them change.
test('the reading fields never change the route, the allowed actions, the validation or the executed actions', async () => {
  const base = { strategy: 'none', constraints_add: [], actions: [SAY, { type: 'create_material', command: FREE.command, request: 'a short card' }] };
  const readings = [{}, { inferred_intent: 'ask' }, { inferred_intent: 'do', modality_override: 'motion', clarification_requested: true }, { grounding_status: 'grounded', source_types_used: ['canvas'] }, { inferred_intent: 'nonsense', grounding_status: 7 }];
  const seen = [];
  for (const reading of readings) {
    const r = await turnWith({ ...base, ...reading });
    seen.push(JSON.stringify([r.routed, r.actions, r.contracts, r.decisions, r.sent[0].body.context]));
  }
  assert.equal(new Set(seen).size, 1);
});

// ---------- Item 7: the Auto matrix (__fixtures__/auto-matrix.mjs) ----------
// Each prompt runs through runTurn with its stand-in plan. Checked: the trace carries exactly the stand-in's reading
// (intent_mode auto); the executed actions are its validated plan; material runs only through the material runner (a paid
// card waits for Generate); nothing claims research ran; the planner context carries the learner's words, the selected card,
// the recent modalities and the offered materials; the same prompt as an explicit /ask or /teach records explicit_slash and
// the command. TUTOR_AUTO_MATRIX=<file> writes the rows as markdown (task-11b-matrix.md is made from it).
const CODE = { id: 'blk-code', type: 'snippet', title: 'forward', body: 'def forward(self, x): return self.proj(x)' };
const CARD = { id: 'blk-card', type: 'explanation', title: 'Vanishing gradients', body: 'Each layer multiplies the gradient by a small factor, so early layers barely learn.' };
const NANO_CARD = cardBlock(cardModule('depth-attention-overview'));
const NANO = { canvas: { app: 'nano', board: 'main' }, access: { app: 'nano' }, domain: NANOGPT };
const CONTEXTS = {
  blank: { label: 'blank plain canvas, no journey', ...plainCanvas(), block: null },
  code: { label: 'plain canvas, selected code card', ...plainCanvas(), block: CODE },
  card: { label: 'plain canvas, selected card', ...plainCanvas(), block: CARD },
  nano: { label: 'nanoGPT course canvas', ...NANO, block: null },
  nanoCard: { label: 'nanoGPT course canvas, selected card', ...NANO, block: NANO_CARD },
  repo: { label: 'repository canvas', ...repoCanvas(), block: null },
  repoCode: { label: 'repository canvas, selected source card', ...repoCanvas(), block: SORT_CODE },
};
const HISTORY = ['text', 'question', 'text'];

// The material runner as the page wires it (LearnTutor.jsx runMaterials) on a stub artifact route: a paid command answers a
// proposal, any other a card.
async function runCards(actions) {
  const posted = [], inserted = [], proposals = [];
  const post = async (path, body) => { posted.push(body.command); return MATERIALS.find(m => m.command === body.command)?.paid ? { result: 'paid_proposal', primitive: 'maths_animation', message: 'Generate?', block: { type: 'video' } } : { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't' } }; };
  const canvas = { insertBlock: block => { inserted.push(block.type); return `blk-${inserted.length}`; }, insertNotebook: () => inserted.push('notebook'), reserve: () => null, release: () => {} };
  await runMaterials(actions, { app: 'a', canvas, post, openSearch: () => {}, offer: proposal => { proposals.push(proposal); return Promise.resolve(); } });
  return { posted, inserted, proposals };
}
async function matrixRow([, prompt, where, plan, modality = 'text'], slash = null) {
  const at = CONTEXTS[where];
  const w = worker({ strategy: 'none', constraints_add: [], ...plan });
  const r = await runTurn({ raw: prompt, slash, block: at.block, store: { ...emptyStore(), modalities: HISTORY }, post: w.post, materials: MATERIALS, research: true, journeyOffer: true, repository: !!at.repository, trace: true, inputModality: modality, canvas: at.canvas, access: at.access, domain: at.domain });
  return { r, context: w.sent.find(s => s.path === '/api/learn/tutor/plan').body.context, at, handoffs: w.sent.filter(s => s.path === '/api/learn/tutor/handoff').map(s => s.body) };
}
async function checkRow(entry, i) {
  const [, prompt, , plan, modality = 'text'] = entry;
  const { r, context, at, handoffs } = await matrixRow(entry);
  const d = r.trace.decision, handed = plan.actions.find(a => a.type === 'handoff');
  // Intent: the stand-in's reading, never a guess from the words.
  assert.deepEqual([d.intent_mode, d.inferred_intent, d.intent_status, d.explicit_modality_override, d.clarification_requested], ['auto', plan.inferred_intent ?? null, plan.inferred_intent ? 'declared' : 'missing', plan.modality_override ?? null, plan.clarification_requested ?? null]);
  // Task 11c-B: a successful handoff adds repository to the declared sources (Addendum 3).
  assert.deepEqual([d.grounding_status, d.source_types_used], [plan.grounding_status ?? null, handed ? [...new Set([...(plan.source_types_used || []), 'repository'])] : plan.source_types_used ?? null]);
  // Pedagogy: the executed actions are the stand-in's plan, every action accepted; a respond-only plan makes nothing.
  assert.deepEqual(r.actions.map(a => a.type), plan.actions.map(a => a.type));
  assert.ok(r.decisions.every(x => x.accepted), JSON.stringify(r.decisions));
  assert.deepEqual(d.actions.map(a => a.action_type), plan.actions.map(a => a.type));
  const wanted = plan.actions.filter(a => a.type === 'create_material'), paid = wanted.filter(a => MATERIALS.find(m => m.command === a.command).paid);
  const cards = await runCards(r.actions);
  // A deterministic command (notebook, whiteboard) inserts its card without the artifact route; every other one posts it.
  assert.deepEqual(cards.posted, wanted.filter(a => !commandsFor('learn').find(c => c.name === a.command)?.deterministic).map(a => a.command), 'material runs only through the material runner');
  assert.deepEqual([cards.proposals.length, cards.inserted.length], [paid.length, wanted.length - paid.length], 'a paid card waits for Generate');
  cards.proposals.forEach(p => p.generate());
  assert.equal(cards.inserted.length, wanted.length, 'Generate inserts the paid card');
  // Nothing implies research ran; only an offer may exist; a cite outside the supplied sources is stripped.
  assert.deepEqual([d.research_executed, d.research_offered], [false, plan.actions.some(a => a.type === 'suggest_research')]);
  assert.ok(r.actions.filter(a => a.cites).every(a => a.cites.length === 0));
  // Context: the learner's words, the selected card, the recent modalities and the offered materials reach the planner.
  assert.deepEqual([context.learner_intent.raw_user_message, context.learner_intent.input_modality], [prompt, modality === 'voice' ? 'voice' : undefined]);
  assert.deepEqual(context.recent_relevant_context.recent_modalities, HISTORY);
  assert.ok(['create_material', 'suggest_research', 'suggest_journey'].every(type => context.allowed_actions.includes(type)), context.allowed_actions.join());
  assert.deepEqual(context.available_materials, MATERIALS);
  // Task 11c-B: the router offers the handoff only on a repository canvas (structured state); a chosen one runs through the route
  // with the selected card's source identity, and its answer follows the plan's own words.
  assert.equal(context.allowed_actions.includes('handoff'), !!at.repository, 'handoff offered exactly where the canvas reads a repository');
  assert.deepEqual(handoffs.map(b => [b.app, b.capability, b.request, b.selection?.file ?? null]), handed ? [[at.access.app, 'repository_context', handed.request, at.block?.sources?.[0]?.path ?? null]] : []);
  assert.equal(r.text.endsWith(HANDOFF_ANSWER), !!handed);
  assert.equal(r.trace.runtime.handoff?.outcome ?? null, handed ? 'ok' : null);
  assert.equal(r.text.includes(HANDOFF_FAILED), false);
  if (at.block) assert.ok(JSON.stringify(context.target).includes(at.block.title ?? cardModule('depth-attention-overview').scene.title), 'the selected card grounds the turn');
  else assert.equal(context.target, null);
  // The same prompt as an explicit override: the same Tutor path, recorded as the command.
  const name = MODE_SLASHES[i % 2], explicit = await matrixRow(entry, name), e = explicit.r.trace.decision;
  assert.deepEqual([e.intent_mode, e.inferred_intent, e.intent_status, explicit.context.learner_intent.kind, explicit.context.learner_intent.slash], ['explicit_slash', name, 'explicit', context.learner_intent.kind, name]);
  const { slash: marker, ...words } = explicit.context.learner_intent;
  assert.deepEqual({ ...explicit.context, learner_intent: words }, context, 'fix A3: the slash marker is the only context difference');
  assert.ok(plannerRequest(explicit.context, 2000).system.includes(`\n${EXPLICIT_MODE}`)); // Task 11c-B: a handoff block may follow it
  assert.equal(plannerRequest(context, 2000).system.includes(EXPLICIT_MODE), false, 'an Auto turn gets no explicit block');
  return { context: at.label + (modality === 'voice' ? ' (Voice)' : ''), d };
}

test('Auto matrix: intent is exactly what the stand-in declared, pedagogy exactly its validated plan; nothing classifies the words', async () => {
  const { MATRIX } = await import('./__fixtures__/auto-matrix.mjs');
  const rows = [], failures = [];
  for (const [i, entry] of MATRIX.entries()) {
    try { rows.push({ entry, ...await checkRow(entry, i), pass: true }); }
    catch (error) { failures.push(`${entry[1]}: ${error.message}`); rows.push({ entry, context: CONTEXTS[entry[2]].label, d: null, pass: false }); }
  }
  if (process.env.TUTOR_AUTO_MATRIX) {
    const cell = s => String(s ?? 'null').replace(/\|/g, '\|');
    const chosen = d => (d?.chosen_action ? `${d.chosen_action.action_type}${d.chosen_action.command ? ` /${d.chosen_action.command}` : ''}${d.chosen_action.capability ? ` ${d.chosen_action.capability}` : ''} (${d.chosen_action.cost_tier})` : 'null');
    const line = ({ entry: [group, prompt], context, d, pass }) => `| ${cell(group)} | ${cell(prompt)} | ${cell(context)} | ${cell(d?.inferred_intent)}${d?.explicit_modality_override ? ` (override ${d.explicit_modality_override})` : ''} | ${cell(chosen(d))} | ${cell(d?.chosen_action?.modality)} | ${cell(d?.reason_codes.join(', '))} | ${pass ? 'PASS' : 'FAIL'} |`;
    (await import('node:fs')).writeFileSync(process.env.TUTOR_AUTO_MATRIX, `${rows.map(line).join('\n')}\n`);
  }
  assert.deepEqual(failures, []);
  assert.equal(rows.length, MATRIX.length);
});

// ---------- Tests A-K (owner eleventh message 11, thirteenth message): through useTutor, bundled and rendered once ----------
// They replace the Task 0 / Task 10 assertions that plain-canvas typed turns stayed the Learn chat (Ruling F4's baseline).
const dir = mkdtempSync(join(tmpdir(), 'tutor-auto-'));
const outfile = join(dir, 'tutor.cjs');
await esbuild.build({
  stdin: { contents: ["export { useTutor, turnOffers, canvasRepository } from './LearnTutor.jsx';", "export { journeyStartsHere, startRequest } from './LearnJourney.jsx';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'), resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const bundled = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// A plain canvas (its dives record landed, no dive, no journey, no registered course), with optional blocks to select.
// plan(context) answers the plan route; every request is recorded.
// Task 11c-B: app (default the plain canvas), repository (the page's flag) and handoff (the handoff route's reply) as options.
async function plainTutor(plan, run, { blocks = [], openResearch = null, journey = null, app: appOver = null, repository = null, handoff = HANDOFF_OK } = {}) {
  const storage = new Map(), calls = [];
  const globals = {
    window: { dispatchEvent: () => true },
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    localStorage: { getItem: () => null },
    fetch: async (path, options) => {
      const body = JSON.parse(options.body);
      calls.push({ path, body });
      const reply = path === '/api/learn/tutor/plan' ? { strategy: 'none', constraints_add: [], ...plan(body.context) } : path === '/api/learn/tutor/handoff' ? handoff : path === '/api/learn/artifact' ? { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't' } } : { status: 'error', events: [] };
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    let tutor = null;
    const app = { name: 'canvas-0000aaaa', title: 'Gradient notes', org: 'o', email: 'e@x.com', ...appOver };
    const dive = { tree: { path: [{ app: app.name, board: 'main', title: app.title, kind: 'canvas' }], children: [], dive: null }, suggestionCard: null, navigator: null };
    const canvasApi = { current: { blocks: () => blocks, block: id => blocks.find(b => b.id === id) || null, insertBlock: () => 'blk-new', reserve: () => null, release: () => {} } };
    const Page = () => { tutor = bundled.useTutor({ app, board: 'main', access: { app: app.name }, canvasApi, canvasState: { card: null }, dive, journey, openResearch, ...(repository == null ? {} : { repository }) }); return null; };
    bundled.renderToStaticMarkup(bundled.createElement(Page));
    const out = await run(tutor);
    await new Promise(done => setTimeout(done, 0)); // runMaterials is not awaited by the turn
    return { out, calls, tutor };
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
}
const planOf = calls => calls.find(c => c.path === '/api/learn/tutor/plan')?.body.context;
const say = text => ({ type: 'respond_text', text });
const RESPOND = () => ({ actions: [say('A step that is too large jumps past the lowest point.')] });

test('A + I: on a plain canvas with no journey, a natural typed question is an Auto Tutor turn (canvas_context, materials offered)', async () => {
  assert.deepEqual(tutorContext({ title: 'x' }).capabilities, { tutor: true, hook_turns: true }, 'plain canvases: the Tutor answers typed and voice turns');
  const { out, calls, tutor } = await plainTutor(RESPOND, t => t.ask({ raw: 'Why does gradient descent overshoot?' }));
  assert.equal(tutor.active, true);
  assert.equal(out, 'A step that is too large jumps past the lowest point.');
  const context = planOf(calls);
  assert.deepEqual([context.learner_intent.kind, context.learner_intent.raw_user_message, context.canvas_context.goal, 'journey_context' in context], ['question', 'Why does gradient descent overshoot?', 'Gradient notes', false]);
  assert.deepEqual(context.available_materials, materialCommands(), 'the same materialCommands source hook turns use');
  assert.ok(context.allowed_actions.includes('create_material'));
  assert.deepEqual(calls.map(c => c.path), ['/api/learn/tutor/plan'], 'no claims on a plain canvas: no evaluate call, no evidence');
});

test('B: Voice reaches the same Auto Tutor path, input_modality voice, create_material allowed', async () => {
  const { out, calls } = await plainTutor(RESPOND, t => t.voiceTurn({ raw: 'Why does gradient descent overshoot?', turnId: 'v1' }));
  assert.equal(out.speech, 'A step that is too large jumps past the lowest point.');
  const context = planOf(calls);
  assert.deepEqual([context.learner_intent.kind, context.learner_intent.input_modality, context.allowed_actions.includes('create_material')], ['question', 'voice', true]);
});

test('C + D: /ask and /teach are explicit overrides through the same Tutor turn; the command reaches the planner as an input constraint', async () => {
  for (const name of MODE_SLASHES) {
    const { calls } = await plainTutor(RESPOND, t => { t.slash(name, `/${name} why does it overshoot?`); return t.ask({ raw: 'why does it overshoot?' }); });
    const context = planOf(calls);
    assert.deepEqual([context.learner_intent.kind, context.learner_intent.slash, context.learner_intent.raw_user_message], ['question', name, 'why does it overshoot?'], 'fix A3: the words keep their own kind');
    assert.ok(plannerRequest(context, 2000, [], { cache: true }).system.some(block => block.text === EXPLICIT_MODE));
  }
});

test('E: /research and /do are not Canvas Tutor commands; research-like and do-like words are telemetry only, nothing executed or claimed', async () => {
  for (const name of ['research', 'do']) {
    const { calls } = await plainTutor(RESPOND, t => { t.slash(name, `/${name} the latest methods`); return t.ask({ raw: 'the latest methods' }); });
    const context = planOf(calls);
    assert.deepEqual([context.learner_intent.kind, 'slash' in context.learner_intent, context.learner_intent.raw_user_message], ['explanation', false, 'the latest methods'], `/${name} is refused as a slash: an Auto turn`);
    assert.equal(plannerRequest(context, 2000).system.includes(EXPLICIT_MODE), false);
  }
  for (const [intent, prompt] of [['research', 'Find the latest approaches to long-context attention.'], ['do', 'Build a small classifier from this idea.']]) {
    const r = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY], inferred_intent: intent }, { raw: prompt });
    assert.deepEqual([r.trace.decision.inferred_intent, r.trace.decision.intent_status, r.trace.decision.research_executed], [intent, 'declared', false]);
    assert.deepEqual(r.actions.map(a => a.type), ['respond_text'], 'the executed action stays a reply');
    assert.ok(r.contracts.every(c => c.cost_tier === 'none'));
  }
});

test('F: a selected card on a plain canvas grounds the turn - its title and text reach the Tutor as context.target', async () => {
  const { calls } = await plainTutor(RESPOND, t => t.ask({ raw: 'This part confuses me.', targetId: CARD.id }), { blocks: [CARD] });
  assert.equal(planOf(calls).target.description, `${CARD.title}\n${CARD.body}`);
  assert.equal(calls.length, 1);
});

const make = (command, request) => ({ type: 'create_material', command, request });
const offerResearch = request => ({ type: 'suggest_research', request });

test('G + H: a simple question can stay respond-only (no card); Auto can choose material, made through the Learn command path', async () => {
  const simple = await plainTutor(RESPOND, t => t.ask({ raw: 'What is a tensor?' }));
  assert.deepEqual(simple.calls.map(c => c.path), ['/api/learn/tutor/plan'], 'respond-only: no artifact call');
  const made = await plainTutor(() => ({ actions: [say('Here is a card for it.'), make('explain', 'why the step overshoots')] }), t => t.ask({ raw: 'Teach me why the step overshoots.' }));
  const artifact = made.calls.find(c => c.path === '/api/learn/artifact');
  assert.deepEqual([artifact.body.command, artifact.body.args], ['explain', 'why the step overshoots']);
});

test('suggest_research: offered only when the page wires openResearch; the chip calls it with the request and nothing else runs', async () => {
  const opened = [];
  const offered = await plainTutor(() => ({ actions: [say("I don't have reliable current information on that yet."), offerResearch('the newest optimizer results')] }), t => t.ask({ raw: 'What did the newest optimizer paper find?' }), { openResearch: request => opened.push(request) });
  assert.ok(planOf(offered.calls).allowed_actions.includes('suggest_research'));
  assert.deepEqual(offered.calls.map(c => c.path), ['/api/learn/tutor/plan'], 'no research call inside the turn');
  const chips = executeActions([offerResearch('the newest optimizer results')], { canvas: {}, openResearch: request => opened.push(request) });
  assert.deepEqual(chips.map(c => c.label), ['Research this']);
  chips[0].run();
  assert.deepEqual(opened, ['the newest optimizer results']);
  const without = await plainTutor(RESPOND, t => t.ask({ raw: 'What did the newest optimizer paper find?' }));
  assert.equal(planOf(without.calls).allowed_actions.includes('suggest_research'), false, 'no openResearch: never offered');
  assert.deepEqual(executeActions([offerResearch('x')], { canvas: {} }), [], 'no callback: no chip');
});


// K: an explicit Motion request is the planner's declared override; the topic word motion is not. The product reads neither:
// the same plan gives the same turn whatever the words, and only the declared field reaches explicit_modality_override.
test('K: an explicit Motion request is told apart from the domain word motion by the planner\'s declared field, never by words', async () => {
  const plan = reading => ({ strategy: 'none', constraints_add: [], actions: [SAY, make('graph', 'the arc over time')], inferred_intent: 'teach', ...reading });
  const topic = await turnWith(plan({}), { raw: 'Explain projectile motion.' });
  const asked = await turnWith(plan({ modality_override: 'motion' }), { raw: 'Show me this with motion.' });
  assert.deepEqual([topic.trace.decision.explicit_modality_override, asked.trace.decision.explicit_modality_override], [null, 'motion']);
  const swapped = await turnWith(plan({}), { raw: 'Show me this with motion.' });
  assert.equal(swapped.trace.decision.explicit_modality_override, null, 'the words alone never set the override');
  assert.deepEqual([topic.routed, topic.actions], [swapped.routed, swapped.actions]);
});

// J: no keyword router. The same plan on words full of intent and format vocabulary gives the same route, allowed actions,
// executed actions and trace intent; and no Auto-path product module tests learner text for those words.
test('J: no keyword router - intent and format words change nothing but the words the planner reads', async () => {
  const plan = { strategy: 'none', constraints_add: [], actions: [SAY] };
  const prompts = ['What is a tensor?', 'Research this for me with motion.', 'Teach me with flashcards and a quiz.', 'Do it: animate the research.'];
  const seen = [];
  for (const raw of prompts) {
    const r = await turnWith(plan, { raw });
    seen.push(JSON.stringify([r.routed, r.actions, r.contracts, r.trace.decision.inferred_intent, r.trace.decision.intent_status, r.trace.decision.explicit_modality_override]));
  }
  assert.equal(new Set(seen).size, 1, seen.join('\n'));
  const WORDS = /\b(motion|research|teach|quiz|flashcards?)\b/i;
  // learn-tutor-validate.js STATED_NO_QUIZ binds the explicit "don't quiz me" constraint (Tutor v1, locked): it removes
  // questions and never reads intent or modality, so it is the one allowed match.
  // Fix B1 and fix round 2: the LP1 journey files are in the grep too. Their word rules (learner-intent-journey.js BROAD and
  // FOCUSED, read through journeyIntent) never take a Tutor turn: journeyStartsHere opens with !tutor, and handleText skips its
  // second-broad-intent check when the Tutor calls it (tutor: true) - all three pinned here. They still read a topic typed into
  // an open topic tray, the Tutor's Start a learning path request after the learner's click (startRequest, then the server's
  // start route), and the composer's words on a canvas with no Tutor; the Tutor offers a learning path (suggest_journey).
  const journeyCode = readFileSync(new URL('LearnJourney.jsx', import.meta.url), 'utf8'), tutorCode = readFileSync(new URL('LearnTutor.jsx', import.meta.url), 'utf8');
  assert.match(journeyCode, /export const journeyStartsHere = \(raw, \{ tutor = null, journeyStarter = null \} = \{\}\) => !tutor && /);
  assert.match(journeyCode, /const t = open\(\), j = s\.data\.journey, it = tutor \? null : journeyIntent\(raw\);/);
  assert.match(tutorCode, /const routed = await live\.handleText\(raw, \{ answerProbe, tutor: true \}\);/);
  // CANCEL is LP1's open-tray rule (rules 1-4 of the interaction resolver: skip or cancel the step the open tray asks, like skip
  // the quiz): with no tray it matches nothing, and it never sets intent, modality or a Tutor action.
  const allowed = ['STATED_NO_QUIZ', 'const BROAD', 'const FOCUSED', 'const CANCEL'];
  for (const file of ['LearnJourney.jsx', '../../control-plane/src/learner-intent-journey.js', 'learn-tutor.js', 'learn-tutor-validate.js', 'learn-tutor-actions.js', 'learn-tutor-trace.js', 'learn-tutor-domains.js', 'learn-journey-domain.js', 'LearnTutor.jsx', '../../control-plane/src/learn-tutor-routes.js']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    const regexes = code.split('\n').filter(line => /(^|[=(,:\s])\/(?![/*\s])(?:\\.|[^/\n])+\/[dgimsuyv]*/.test(line) && WORDS.test(line.match(/\/(?![/*\s])(?:\\.|[^/\n])+\/[dgimsuyv]*/)?.[0] || ''));
    assert.deepEqual(regexes.filter(line => !allowed.some(name => line.includes(name))), [], `${file}: a regex tests intent or format words`);
    assert.equal(/\.(?:includes|startsWith|endsWith|indexOf|search|match)\(\s*['"`][^'"`]*\b(?:motion|research|teach|quiz|flashcards?)\b/i.test(code), false, `${file}: a string test of intent or format words`);
  }
});

// ---------- Owner nineteenth message: never invent missing facts (stand-in planner; plumbing and obvious constraints) ----------
test('grounding: supported -> grounded; unknown or newer -> insufficient_evidence with Research offered, never run, no citations; partial -> partially_grounded', async () => {
  const supported = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY], grounding_status: 'grounded', source_types_used: ['selected_material'] }, { raw: 'Why does this happen?', block: CARD });
  assert.deepEqual([supported.trace.decision.grounding_status, supported.trace.decision.source_types_used], ['grounded', ['selected_material']]);
  const fictional = await turnWith({ strategy: 'none', constraints_add: [], actions: [{ ...say("I don't have reliable current information on that model yet."), cites: [{ card: 'made-up', source_index: 2 }] }, offerResearch('the model released this week')], grounding_status: 'insufficient_evidence', source_types_used: ['model_knowledge', 'research'] }, { raw: 'What did the model released this week score?' });
  const d = fictional.trace.decision;
  assert.deepEqual([d.grounding_status, d.research_offered, d.research_executed, d.source_types_used], ['insufficient_evidence', true, false, ['model_knowledge']], 'research is never a source of a Tutor turn');
  assert.deepEqual(fictional.actions[0].cites, [], 'the validator strips a cite outside the supplied sources');
  assert.ok(fictional.log.includes('removed 1 citation(s) to no source'));
  const partial = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY], grounding_status: 'partially_grounded', source_types_used: ['selected_material', 'model_knowledge'] }, { raw: 'Is this always true?', block: CARD });
  assert.equal(partial.trace.decision.grounding_status, 'partially_grounded');
  // The prompt carries the grounding rules on every Tutor prompt (pinned by task-11b-repin-review.md).
  for (const text of [PLANNER_SYSTEM, plannerSystem(false, 'journey'), CANVAS_SYSTEM]) {
    assert.match(text, /Never invent facts the context does not support/);
    assert.match(text, /never say "I found" or "current research shows"/);
  }
});

// ---------- Fix round 1 (task-11b-fix1.md), step 1 ----------

// A3: an explicit /ask or /teach is the same turn as its words typed without the slash - learner_intent kind, claim selection,
// evaluation and planner tier - plus the slash marker, EXPLICIT_MODE and intent_mode explicit_slash. Only /deeper, /simplify
// and /dive keep the no-words gates.
test('fix A3: /teach on a registry card evaluates, selects claims and takes the Auto tier, exactly as the same words without the slash', async () => {
  const words = 'The mask stops each token from looking at later tokens.';
  const run = async slash => {
    const w = worker({ strategy: 'none', constraints_add: [], actions: [SAY] });
    const r = await runTurn({ raw: words, slash, block: NANO_CARD, store: emptyStore(), post: w.post, materials: MATERIALS, trace: true, ...NANO });
    return { r, w, context: w.sent.find(s => s.path === '/api/learn/tutor/plan').body.context };
  };
  const plain = await run(null);
  for (const name of MODE_SLASHES) {
    const explicit = await run(name);
    assert.ok(explicit.w.sent.some(s => s.path === '/api/learn/tutor/evaluate'), `${name}: evaluated`);
    assert.deepEqual([!!explicit.r.selection, explicit.r.selection?.selected], [true, plain.r.selection.selected], `${name}: claims selected as typed`);
    assert.deepEqual(plannerTier(explicit.context), plannerTier(plain.context));
    const { slash, ...intent } = explicit.context.learner_intent;
    assert.deepEqual([slash, intent], [name, plain.context.learner_intent]);
    assert.deepEqual({ ...explicit.context, learner_intent: intent }, plain.context, `${name}: the slash marker is the only context difference`);
    assert.ok(plannerRequest(explicit.context, 2000).system.endsWith(`\n${EXPLICIT_MODE}`));
    assert.deepEqual([explicit.r.trace.decision.intent_mode, explicit.r.trace.decision.inferred_intent, explicit.r.trace.decision.intent_status], ['explicit_slash', name, 'explicit']);
  }
  assert.equal(plannerRequest(plain.context, 2000).system.includes(EXPLICIT_MODE), false);
  // /deeper on a ladder keeps its no-words gates: no evaluation, no claim selection, row slash.
  const deeper = await run('deeper');
  assert.deepEqual([deeper.r.routed.row, deeper.r.selection, deeper.w.sent.some(s => s.path === '/api/learn/tutor/evaluate')], ['slash', null, false]);
});

// B5: /deeper and /simplify fix the move only where the domain has a depth ladder; elsewhere they are ordinary turns from
// their words (the composer sends the command's prompt), never weaker than natural language.
test('fix B5: /deeper and /simplify fix the move only on a depth ladder; on a plain canvas they run as ordinary turns from their words', async () => {
  for (const name of ['deeper', 'simplify']) {
    const nano = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY] }, { raw: `/${name}`, slash: name, ...NANO });
    assert.equal(nano.routed.row, 'slash', `${name} on nanoGPT`);
    const plain = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY] }, { raw: 'Go one level deeper on the current concept.', slash: name });
    assert.deepEqual([plain.routed.row, plain.turn.slash, 'slash' in plain.sent[0].body.context.learner_intent, plain.trace.decision.intent_mode], ['off_slice', null, false, 'auto'], `${name} on a plain canvas`);
    assert.ok(plain.routed.allowed.includes('create_material'), 'an ordinary row may make material');
  }
  const { calls } = await plainTutor(RESPOND, t => { t.slash('deeper', '/deeper into the maths'); return t.ask({ raw: 'Go one level deeper on the current concept. Focus: into the maths.' }); });
  assert.deepEqual([planOf(calls).learner_intent.kind, planOf(calls).learner_intent.raw_user_message], ['request', 'Go one level deeper on the current concept. Focus: into the maths.'], 'the composer words, not the bare command');
});

// B3: a command that inserts without the model (deterministic, or /image's photo search) costs nothing; one registry helper.
test('fix B3: cost_tier none for a command that inserts without the model, from the one registry helper', () => {
  assert.deepEqual(['notebook', 'whiteboard', 'image', 'explain', 'animate'].map(insertsWithoutModel), [true, true, true, false, false]);
  const ctx = { domain: NANOGPT, materials: MATERIALS, claims: [ID] };
  assert.deepEqual(['notebook', 'whiteboard', 'image', 'explain', 'animate'].map(command => actionContract({ type: 'create_material', command, request: 'x' }, ctx).cost_tier), ['none', 'none', 'none', 'model', 'paid']);
});

// B4 and A1: what a turn is offered beyond words is structural page state (turnOffers): a hole's automatic opening gets no
// material (the learner has not asked yet), a carried hook keeps it; a journey in setup gets neither material nor Research,
// so the journey prompt's "setup: respond_text only" matches the router.
test('fix B4 and A1: no material on a hole opening, kept on a carried hook; nothing beyond words while a journey is in setup', async () => {
  const open = () => {};
  assert.deepEqual(bundled.turnOffers({ opening: true }).materials, []);
  assert.deepEqual(bundled.turnOffers({ nextStep: { suggestion_id: 's' } }).materials, materialCommands());
  assert.deepEqual(bundled.turnOffers({}).materials, materialCommands());
  const setup = bundled.turnOffers({ journey: { journey: { state: 'intake' } }, openResearch: open });
  assert.deepEqual([setup.materials, setup.research], [[], false]);
  const active = bundled.turnOffers({ journey: { journey: { state: 'active' } }, openResearch: open });
  assert.deepEqual([active.materials, active.research], [materialCommands(), true]);
  const opening = await plainTutor(RESPOND, t => t.ask({ raw: 'Take me into Gradients.', opening: true }));
  assert.deepEqual(['available_materials' in planOf(opening.calls), planOf(opening.calls).allowed_actions.includes('create_material')], [false, false]);
});

// ---------- Fix round 1, step 2 (task-11b-fix1.md B1, B2) ----------

// B1 (owner fourteenth message: routing is never keyword-based): a learning path is a Tutor offer, suggest_journey { request },
// allowed only where a journey can start - structural page state (turn.journey_offer), never words - and started only by the
// learner's click, through the existing journey start.
test('fix B1: suggest_journey is offered only where a journey can start, on every row; validated as an offer; the chip starts nothing on its own', () => {
  for (const row of ROWS) {
    const plain = routeAt(row);
    assert.equal(plain.allowed.includes('suggest_journey'), false, row[0]);
    assert.deepEqual(routeAt(row, { journey_offer: true }), { ...plain, allowed: [...plain.allowed, 'suggest_journey'] }, row[0]);
  }
  const turn = turnOf({ journey_offer: true }), routed = { row: 'off_slice', strategy: 'none', allowed: ['respond_text', 'suggest_journey'], claim: null };
  const run = (actions, r = routed) => validateActions({ actions }, r, turn, canvasDomain({ goal: 'g' }));
  assert.deepEqual(run([SAY, { type: 'suggest_journey', request: ' backpropagation ' }]).actions, [SAY, { type: 'suggest_journey', request: 'backpropagation' }]);
  for (const request of ['', 'x'.repeat(1001), 'run `ls`', undefined]) assert.equal(run([{ type: 'suggest_journey', request }]).decisions[0].stage, 'schema', String(request));
  assert.equal(run([{ type: 'suggest_journey', request: 'a' }, { type: 'suggest_journey', request: 'b' }]).decisions[1].reason, 'a second suggest_journey');
  assert.equal(run([{ type: 'suggest_journey', request: 'a' }], { ...routed, allowed: ['respond_text'] }).decisions[0].stage, 'route');
  const contract = actionContract({ type: 'suggest_journey', request: 'a' }, { domain: NANOGPT, materials: MATERIALS });
  assert.deepEqual([contract.modality, contract.cost_tier], [null, 'none']);
  const started = [];
  const chips = executeActions([{ type: 'suggest_journey', request: 'backpropagation' }], { canvas: {}, startJourney: request => started.push(request) });
  assert.deepEqual([chips.map(c => c.label), started], [['Start a learning path'], []], 'nothing starts on its own');
  chips[0].run();
  assert.deepEqual(started, ['backpropagation']);
  assert.deepEqual(executeActions([{ type: 'suggest_journey', request: 'x' }], { canvas: {} }), [], 'no starter: no chip');
});

test('fix B1: turnOffers offers a learning path only where one can start - not in a hole, not in setup', () => {
  const start = () => {};
  assert.equal(bundled.turnOffers({ journey: { journey: null, start } }).journeyOffer, true);
  assert.equal(bundled.turnOffers({ journey: { journey: { state: 'active' }, start } }).journeyOffer, true, 'fix round 2: a live journey too (the click meets LP1 continue-or-start)');
  assert.equal(bundled.turnOffers({ journey: { journey: { state: 'intake' }, start } }).journeyOffer, false, 'setup');
  assert.equal(bundled.turnOffers({ journey: { journey: null, start }, record: { dive_id: 'canvas-0000hole' } }).journeyOffer, false, 'a hole');
  assert.equal(bundled.turnOffers({ journey: { journey: null, start: null } }).journeyOffer, false, 'no journey support');
  assert.equal(bundled.turnOffers({}).journeyOffer, false);
});

test('fix B1: on a Tutor canvas the LP1 word gate never intercepts; the Auto Tutor offers the path and the click runs the existing journey start', async () => {
  const started = [];
  const journey = { journey: null, busy: false, start: async text => { started.push(text); return { handled: true }; } };
  const plan = () => ({ actions: [say('Here is the core idea in two sentences.'), { type: 'suggest_journey', request: 'backpropagation' }] });
  const { calls, tutor } = await plainTutor(plan, t => t.ask({ raw: 'Teach me backpropagation from scratch.' }), { journey });
  assert.equal(bundled.journeyStartsHere('Teach me backpropagation from scratch.', { tutor, journeyStarter: journey.start }), false, 'an active Tutor: the word gate never intercepts');
  const context = planOf(calls);
  assert.deepEqual([context.learner_intent.raw_user_message, context.allowed_actions.includes('suggest_journey')], ['Teach me backpropagation from scratch.', true]);
  assert.deepEqual(started, [], 'nothing starts on its own');
  const nodes = node => (!node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]);
  const chip = nodes(tutor.extras).find(n => n.type === 'button' && n.props.children === 'Start a learning path');
  chip.props.onClick();
  assert.deepEqual(started, ['Teach me backpropagation'], 'the existing journey start, which reads a learning request');
  // Voice behaves the same: the same Tutor turn offers it.
  const voice = await plainTutor(plan, t => t.voiceTurn({ raw: 'Teach me backpropagation from scratch.', turnId: 'v2' }), { journey });
  assert.ok(planOf(voice.calls).allowed_actions.includes('suggest_journey'));
});

// B2: plain-canvas grounding - the selected card is the target, and up to six of the newest other cards travel as
// canvas_context.cards (id, kind, title, text), in canvas order, chat cards by their question only; never in the hook basis.
test('fix B2: a plain canvas sends up to six of its newest other cards as canvas_context.cards; the selected one is the target', async () => {
  const blocks = [...Array(8)].map((_, i) => ({ id: `b${i}`, type: 'explanation', title: `Card ${i}`, body: `Body ${i} `.repeat(40) }));
  blocks.push({ id: 'chat1', question: 'Why does it overshoot?', answer: 'Because the step is too large.' });
  const d = canvasDomain({ goal: 'g', blocks, selected: 'b7' });
  assert.deepEqual(d.context.cards.map(c => c.id), ['b2', 'b3', 'b4', 'b5', 'b6', 'chat1']);
  assert.deepEqual(d.context.cards[0], { id: 'b2', kind: 'explanation', title: 'Card 2', text: 'Body 2 '.repeat(40).slice(0, 200) });
  assert.deepEqual(d.context.cards.at(-1), { id: 'chat1', kind: 'chat', title: 'Why does it overshoot?', text: null }, 'a chat card: its question, never its answer');
  assert.deepEqual(canvasDomain({ goal: 'g', blocks: [{ id: 'x', type: 'graph', prompt: 'p'.repeat(100) }] }).context.cards, [{ id: 'x', kind: 'graph', title: 'p'.repeat(80), text: null }], 'title fallback, capped');
  assert.deepEqual(canvasDomain({ goal: 'g' }).context, { goal: 'g', origin: null }, 'no other cards: no key');
  assert.deepEqual(tutorContext({ title: 'g', blocks, selected: 'b7' }).domain.context.cards.map(c => c.id), ['b2', 'b3', 'b4', 'b5', 'b6', 'chat1']);
  assert.equal(nextStepsBasis({ context: tutorContext({ title: 'g', blocks }), title: 'g' }), nextStepsBasis({ context: tutorContext({ title: 'g', blocks: [] }), title: 'g' }), 'not in the hook basis');
  const OTHER = { id: 'blk-other', type: 'explanation', title: 'Learning rate', body: 'The step size.' };
  const { calls } = await plainTutor(RESPOND, t => t.ask({ raw: 'This part confuses me.', targetId: CARD.id }), { blocks: [OTHER, CARD] });
  assert.deepEqual([planOf(calls).target.description, planOf(calls).canvas_context.cards], [`${CARD.title}\n${CARD.body}`, [{ id: OTHER.id, kind: 'explanation', title: OTHER.title, text: OTHER.body }]]);
});

const PLAIN_AT = plainCanvas();
// ---------- Fix round 2 (coordinator rulings after the re-review) ----------

// Item 3: a typed slash is a command, never an answer to the Tutor's open question - on a depth ladder or not, explicit or not.
test('fix round 2 item 3: a typed /deeper, /simplify, /ask or /teach while a Tutor question is open does not answer it', async () => {
  const open = store => ({ ...store, open: { action_id: 'q1', claim: ID, text: 'Why look back only?', canvas: { app: 'nano', board: 'main' } } });
  const words = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY] }, { raw: 'Because later tokens are unknown.', store: open(emptyStore()), ...NANO });
  assert.equal(words.turn.answering, 'q1', 'the same words typed without a slash answer it');
  for (const [slash, at] of [['deeper', NANO], ['simplify', NANO], ['deeper', PLAIN_AT], ['simplify', PLAIN_AT], ['ask', NANO], ['teach', NANO]]) {
    const r = await turnWith({ strategy: 'none', constraints_add: [], actions: [SAY] }, { raw: 'Because later tokens are unknown.', slash, store: open(emptyStore()), ...at, canvas: { ...at.canvas, app: 'nano' } });
    assert.equal('answering' in r.turn, false, `${slash} on ${at === NANO ? 'nanoGPT' : 'a plain canvas'}`);
  }
});

// Item 4: the chip's request reaches the existing journey start through LP1's own start-wrapping rule (startRequest: wrapped
// only when it is not already a start request), and a start the server refuses here says so.
test('fix round 2 item 4: the learning-path chip wraps only a bare topic, and a refused start shows a notice', async () => {
  assert.deepEqual(['backpropagation', 'I want to learn backpropagation', 'Teach me how softmax works'].map(bundled.startRequest), ['Teach me backpropagation', 'I want to learn backpropagation', 'Teach me how softmax works']);
  for (const [handled, notice] of [[true, false], [false, true]]) {
    const started = [];
    const journey = { journey: null, busy: false, start: async text => { started.push(text); return { handled }; } };
    const plan = () => ({ actions: [say('Here is the idea.'), { type: 'suggest_journey', request: 'I want to learn backpropagation' }] });
    const { tutor } = await plainTutor(plan, t => t.ask({ raw: 'Teach me backpropagation from scratch.' }), { journey });
    const nodes = node => (!node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]);
    await nodes(tutor.extras).find(n => n.type === 'button' && n.props.children === 'Start a learning path').props.onClick();
    await new Promise(done => setTimeout(done, 0));
    assert.deepEqual(started, ['I want to learn backpropagation'], 'already a start request: unwrapped');
    const text = nodes(tutor.extras).filter(n => n.type === 'p').map(n => n.props.children).join(' ');
    assert.equal(/That request cannot start a learning path here/.test(text), notice, `handled ${handled}`);
  }
});

// ---------- Task 11c-B: the repository_context handoff through useTutor ----------

// The offer is the canvas's structured repository state (canvasRepository: a repository app or a canvas in a project), or the
// page's own flag (false once the learner detached the repository source); typed and Voice turns run the handoff the same way.
test('11c-B: canvasRepository and turnOffers decide the handoff offer from app data and page state, never in journey setup', () => {
  assert.deepEqual([{ name: 'repo-0000aaaa-sorting' }, { name: 'canvas-0000aaaa', project: 'repo-0000aaaa-sorting' }, { name: 'canvas-0000aaaa' }, { name: 'canvas-0000aaaa', project: null }, { name: 'ops-tool', kind: 'app' }, null].map(bundled.canvasRepository), [true, true, false, false, false, false]);
  assert.equal(bundled.turnOffers({ repository: true }).repository, true);
  assert.equal(bundled.turnOffers({}).repository, false);
  assert.equal(bundled.turnOffers({ repository: true, journey: { journey: { state: 'intake' } } }).repository, false, 'setup allows words only');
  assert.equal(bundled.turnOffers({ repository: true, journey: { journey: { state: 'active' } } }).repository, true);
});

test('11c-B: on a repository canvas a typed or spoken question may hand off; the answer is the dock reply and the speech; elsewhere it is never offered', async () => {
  const lead = 'Callers are the places in the code that use the selected function.';
  const plan = () => ({ actions: [say(lead), { type: 'handoff', capability: 'repository_context', request: 'which functions call the selected function' }] });
  const repo = { name: REPO_APP, title: 'example/sorting' };
  const typed = await plainTutor(plan, t => t.ask({ raw: 'Who calls this?', targetId: SORT_CODE.id }), { app: repo, blocks: [SORT_CODE] });
  assert.equal(typed.out, `${lead}\n\n${HANDOFF_ANSWER}`);
  assert.ok(planOf(typed.calls).allowed_actions.includes('handoff'));
  const body = typed.calls.find(c => c.path === '/api/learn/tutor/handoff').body;
  assert.deepEqual([body.app, body.capability, body.selection], [REPO_APP, 'repository_context', { repository: 'example/sorting', revision: 'c'.repeat(40), file: 'sort.py', line_range: { start: 10, end: 24 } }]);
  assert.equal(typed.calls.some(c => c.path === '/api/learn/tutor/evaluate' || c.path === '/api/learn/journey'), false, 'never evidence');
  const voice = await plainTutor(plan, t => t.voiceTurn({ raw: 'Who calls this?', targetId: SORT_CODE.id, turnId: 'v3' }), { app: repo, blocks: [SORT_CODE] });
  assert.equal(voice.out.speech, `${lead}\n\n${HANDOFF_ANSWER}`, 'spoken through the existing voice reply');
  const project = await plainTutor(plan, t => t.ask({ raw: 'Who calls this?' }), { app: { project: REPO_APP } });
  assert.ok(planOf(project.calls).allowed_actions.includes('handoff'), 'a canvas in a project reads its repository');
  for (const [name, options] of [['a plain canvas', {}], ['a detached repository source', { app: repo, repository: false }]]) {
    const off = await plainTutor(plan, t => t.ask({ raw: 'What does this function do in the repository code?' }), options);
    assert.equal(planOf(off.calls).allowed_actions.includes('handoff'), false, name);
    assert.deepEqual([off.out, off.calls.map(c => c.path)], [lead, ['/api/learn/tutor/plan']], `${name}: the planned handoff is dropped, nothing is read`);
  }
  const failed = await plainTutor(plan, t => t.ask({ raw: 'Who calls this?' }), { app: repo, handoff: { capability: 'repository_context', answer: null, telemetry: { ...HANDOFF_OK.telemetry, outcome: 'failed', failure: 'retrieval_error' } } });
  assert.equal(failed.out, `${lead}\n\n${HANDOFF_FAILED}`, 'a failure says the source context could not be retrieved');
});
