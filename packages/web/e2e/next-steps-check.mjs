// Professor Next Steps acceptance N1-N7 (docs/features/professor-next-steps.md), then the Auto Tutor N8-N13 (Task 11b) and the
// Tutor handoff route N14-N16 (Task 11c-A) and the Tutor-side handoff N17-N22 (Task 11c-B and its fix round 1), against the
// KEYLESS local stack only (e2e/journey-local-stack.md §6): no model key is bound and the hook planner answers from its fixtures
// (JOURNEY_MODEL_STUB=fixtures). Node + HTTP for everything but N7, which uses the browser. The Tutor planner is never reached:
// the turns of N2, N8-N13 and N17-N22 run in Node, their /api/learn/tutor/plan answered in process (as journey-check.mjs
// answers it in the page), every other request they make goes to the stack. The handoff checks use only paths that call no
// model: a successful handoff needs one, and the stack has none.
//   node e2e/next-steps-check.mjs --base http://127.0.0.1:8868 --cp http://127.0.0.1:8869 --vars <stack .dev.vars> --out <dir>
// --vars is the stack's own vars file; only its TEST_BYPASS_SECRET is read, never printed. Sessions are minted on the
// control plane's origin (the app's barrier refuses /test/session there).
// Each check prints PASS, FAIL or SKIP with its reason; <out>/next-steps-results.json holds the table and
// <out>/next-steps-network.json the requests per check (method, path, status, request body keys - never learner text; a
// share token in a path is replaced by <token>).
// Each check is a named function in CHECKS; later checks are appended there.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { nextStepsInput } from '../src/learn-next-steps.js';
import { journeyDomain } from '../src/learn-journey-domain.js';
import { emptyStore } from '../src/learn-tutor-evidence.js';
import { HANDOFF_FAILED, executeActions, runTurn } from '../src/learn-tutor.js';
import { tutorContext } from '../src/learn-tutor-domains.js';
import { materialCommands, runMaterials } from '../src/learn-slash.js';
import { STARTS, journeyIntent } from '../../control-plane/src/learner-intent-journey.js';
import { HANDOFF_SYSTEM, MODE_SLASHES, plannerRequest } from '../../control-plane/src/agents/learn-tutor.js';
import { NANOGPT, cardModule } from '../src/learn-tutor-claims.js';
import { cardBlock } from '../src/nanogpt/board.js';
import { resolveTarget } from '../src/learn-target.js';
import { rabbitOrigin } from '../src/shared-rabbit-hole.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('base', 'http://127.0.0.1:8868'), CP = arg('cp', 'http://127.0.0.1:8869'), OUT = arg('out', 'next-steps-shots'), VARS = arg('vars', process.env.JOURNEY_VARS);
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('next-steps-check runs against the local stack only');
if (!VARS) throw Error('--vars <the local stack .dev.vars> is required (e2e/journey-local-stack.md)');
mkdirSync(OUT, { recursive: true });
const vars = readFileSync(VARS, 'utf8');
// Keyless only: a vars file that binds a model or voice key is refused before any request.
if (/_API_KEY=|ELEVENLABS_/.test(vars)) throw Error(`${VARS} binds a model or voice key: next-steps-check runs only against the keyless stack (e2e/journey-local-stack.md)`);
const secret = vars.match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim();
if (!secret) throw Error(`no TEST_BYPASS_SECRET in ${VARS}`);

const REQUEST = 'I want to learn logistic regression';
const CANNED = 'A canned answer from next-steps-check: no model was called.';
const PLAN = { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: CANNED }] };
const NO_ROUTE = 'shared route not in this base';
// No handler for the path: a 404, or on the app origin the dev write barrier's 403 (dev-forwarding.js), which answers only
// requests no local route took. Either is a SKIP, never a PASS.
const noRoute = r => r.status === 404 || (r.status === 403 && r.body?.error === 'Blocked on this preview: it would change live state.');
const run = Date.now().toString(36); // the local D1 persists across runs: fresh identities each run

// ---- results and network ----
const results = [], network = {};
const record = (id, status, reason) => { results.push({ id, status, reason }); console.log(`${status.padEnd(5)} ${id}: ${reason}`); };
const check = (id, ok, pass, fail = pass) => record(id, ok ? 'PASS' : 'FAIL', ok ? pass : fail);
const skip = (id, reason) => record(id, 'SKIP', reason);
const keys = body => (body && typeof body === 'object' ? Object.keys(body) : []);
const redact = path => path.replace(/\/shared\/[^/]+/, '/shared/<token>');
let label = null; // the check whose requests are being logged
const log = entry => (network[label] ||= []).push({ ...entry, path: redact(entry.path) });

// ---- HTTP ----
const sessionFor = async email => {
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json();
  if (!session) throw Error('the control plane minted no session (is the stack up with SMALL_ENV=test?)');
  return { session };
};
// who: a { session } or null (anonymous). -> { status, body, text }; never throws on an HTTP status.
async function call(who, method, path, body) {
  const response = await fetch(`${BASE}${path}`, { method, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  let parsed = null; try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  log({ method, path: new URL(path, BASE).pathname, status: response.status, keys: keys(body) });
  return { status: response.status, body: parsed, text };
}
const ok = async (who, method, path, body) => {
  const r = await call(who, method, path, body);
  if (r.status < 200 || r.status > 299) throw Error(`${method} ${redact(path)}: HTTP ${r.status} ${r.body?.error || ''}`);
  return r.body;
};

// ---- shared state between checks ----
const owner = await sessionFor(`pns-owner-${run}@example.com`);
const state = { canvas: null, cacheWorks: null, journey: null, turn: null, boards: null };
const SET_ID = /^ns_[0-9a-f]{8}$/;
// A HookSet as contract §1.1: an ns_ set id, exactly 3 options with ids <set_id>.<1|2|3>, each step in the given scope.
const setProblem = (set, scope) => {
  if (!SET_ID.test(set?.set_id || '')) return `set_id ${JSON.stringify(set?.set_id)}`;
  if (set.options?.length !== 3) return `${set.options?.length ?? 0} options`;
  const bad = set.options.findIndex((o, i) => o.id !== `${set.set_id}.${i + 1}` || typeof o.hook !== 'string' || !o.hook || o.selected_next_step?.suggestion_id !== o.id || o.selected_next_step?.scope !== scope);
  return bad >= 0 ? `option ${bad + 1} is not a ${scope} hook with its id` : null;
};

// ---- N1: an owned plain canvas ----
async function n1() {
  const title = `Next steps check ${run}`;
  const { name } = await ok(owner, 'POST', '/api/canvases', { title });
  const blocks = [
    { id: 'n1-a', type: 'explanation', dx: 0, dy: 0, title: 'Why bread dough rises', body: 'Yeast ferments sugars and the gas is trapped by gluten.' },
    { id: 'n1-b', type: 'explanation', dx: 0, dy: 0, title: 'What kneading changes', body: 'Kneading aligns gluten strands into a stretchy network.' },
  ];
  await ok(owner, 'PUT', `/api/learn/boards/${name}/main`, { state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] } });
  const saved = (await ok(owner, 'GET', `/api/learn/boards/${name}/main`)).state?.blocks || [];
  state.canvas = { name, title, blocks: saved };
  const built = nextStepsInput({ context: null, store: emptyStore(), blocks: saved, title, basis: `n1-${run}` });
  if (!built.input) throw Error(`nextStepsInput: ${built.problem}`);
  const first = await call(owner, 'POST', '/api/learn/tutor/next-steps', { app: name, input: built.input });
  const problem = first.status === 200 ? setProblem(first.body, 'owned') : `HTTP ${first.status} ${first.body?.error || ''}`;
  check('N1 hook set', !problem, `200, 3 owned hooks with ${first.body?.set_id}.1-3 ids (${saved.length} saved blocks, mode ${built.input.mode})`, problem);
  check('N1 no reason_internal', !/reason_internal/.test(first.text), 'reason_internal is not in the reply text', 'the reply text carries reason_internal');
  const again = await call(owner, 'POST', '/api/learn/tutor/next-steps', { app: name, input: built.input });
  state.cacheWorks = again.body?.telemetry?.cached === true;
  check('N1 same basis, same set', again.status === 200 && !!first.body?.set_id && again.body?.set_id === first.body.set_id,
    `a repeat with the same basis returns ${again.body?.set_id} (cached ${state.cacheWorks})`, `HTTP ${again.status}, set ${again.body?.set_id} after ${first.body?.set_id} (cached ${state.cacheWorks})`);
}

// ---- N2: an owned journey canvas; a hook click is never evidence ----
async function n2() {
  const { name } = await ok(owner, 'POST', '/api/canvases', { title: `Next steps journey ${run}` });
  const journeyOf = () => ok(owner, 'GET', `/api/learn/journey?app=${name}&board=main`);
  // The route's own actions (learn-journey.js): start, cancel skips the intake and the diagnostic, accept the path.
  let view = await ok(owner, 'POST', '/api/learn/journey', { app: name, board: 'main', action: 'start', text: REQUEST });
  for (let i = 0; i < 6 && view.journey?.state !== 'active'; i++) {
    const action = view.journey?.state === 'path_review' ? 'accept' : 'cancel';
    view = await ok(owner, 'POST', '/api/learn/journey', { app: name, board: 'main', action, revision: view.journey?.revision });
  }
  check('N2 journey active', view.journey?.state === 'active', `start, cancel, cancel, accept: journey ${view.journey?.id} is active`, `journey is ${view.journey?.state}`);
  view = await journeyOf();
  const { journey, path } = view, registry = journey.registry || { concepts: {}, claims: {} };
  const domain = journeyDomain({ journey, path, blocks: [] });
  const built = nextStepsInput({ context: { domain, source: 'journey' }, store: emptyStore(), journey: view, blocks: [], title: `Next steps journey ${run}`, basis: `n2-${run}` });
  if (!built.input) throw Error(`nextStepsInput: ${built.problem}`);
  const set = await call(owner, 'POST', '/api/learn/tutor/next-steps', { app: name, input: built.input });
  const problem = set.status === 200 ? setProblem(set.body, 'owned') : `HTTP ${set.status} ${set.body?.error || ''}`;
  const steps = set.body?.options?.map(o => o.selected_next_step) || [];
  const claimIds = steps.flatMap(s => s.claim_ids), conceptIds = steps.flatMap(s => s.concept_ids);
  const foreign = [...claimIds.filter(id => !Object.hasOwn(registry.claims, id)), ...conceptIds.filter(id => !Object.hasOwn(registry.concepts, id))];
  check('N2 hooks carry registry ids only', !problem && claimIds.length > 0 && !foreign.length, `3 journey hooks naming ${new Set(claimIds).size} registry claim(s), nothing else`,
    problem || (foreign.length ? `ids outside the registry: ${foreign.join(', ')}` : 'no claim ids on a journey with a registry'));
  // The click: one next_step turn; /plan answered here, anything else to the stack.
  const sent = [];
  const post = async (route, body) => {
    sent.push(route);
    if (route === '/api/learn/tutor/plan') { log({ method: 'POST', path: route, status: 'in-process', keys: keys(body) }); return PLAN; }
    return ok(owner, 'POST', route, body);
  };
  const step = steps[0];
  state.turn = await runTurn({ raw: '', canvas: { app: name, board: 'main' }, access: { app: name }, block: null, store: emptyStore(), post, domain, nextStep: step, materials: [], trace: true });
  state.journey = { id: journey.id, step };
  const evaluate = sent.filter(r => r === '/api/learn/tutor/evaluate').length, journeyPosts = sent.filter(r => r === '/api/learn/journey').length;
  check('N2 click posts no evidence', evaluate === 0 && journeyPosts === 0 && sent.includes('/api/learn/tutor/plan') && state.turn.text === CANNED,
    `the next_step turn made 0 /evaluate and 0 /api/learn/journey POSTs (requests: ${sent.join(', ')})`, `${evaluate} evaluate, ${journeyPosts} journey POSTs; requests ${sent.join(', ')}; reply ${state.turn.text ? 'present' : 'missing'}`);
  const after = (await journeyOf()).journey;
  check('N2 journey unchanged', after.evidence?.seq === journey.evidence?.seq && after.revision === journey.revision,
    `evidence.seq ${after.evidence?.seq} and revision ${after.revision} unchanged`, `seq ${journey.evidence?.seq} -> ${after.evidence?.seq}, revision ${journey.revision} -> ${after.revision}`);
}

// ---- N3: the decision trace of N2's turn ----
// Contract §3.1 (trace_schema_version 1), with the owner's additions the code and its unit test carry
// (learn-tutor-trace.test.mjs): decision.evidence_transitions, decision.shown_at, decision.selected_at, runtime.planner_input;
// Task 11b's nine intent keys, last in decision (intent_mode .. research_executed); and Task 11c-B's runtime.handoff (last in runtime).
const TRACE = {
  top: ['trace_schema_version', 'event', 'decision_id', 'step_id', 'generated_at', 'identity', 'versions', 'decision', 'runtime', 'flags'],
  identity: ['user_id', 'session_id', 'canvas_id', 'board_id', 'canvas_version', 'journey_id', 'section_id', 'dive_id', 'source', 'scope', 'mode'],
  versions: ['planner_version', 'prompt_version', 'model_role', 'model_id'],
  decision: ['current_goal', 'current_section_id', 'target_concept_ids', 'target_claim_ids', 'evidence_summary', 'evidence_transitions', 'canvas_summary', 'recent_modality_history', 'next_step_options', 'shown_at', 'selected_next_step_id', 'selected_at', 'route', 'chosen_action', 'actions', 'reason_codes', 'reason_source', 'rationale_summary', 'expected_evidence', 'estimated_learning_seconds',
    'intent_mode', 'inferred_intent', 'explicit_modality_override', 'intent_status', 'clarification_requested', 'grounding_status', 'source_types_used', 'research_offered', 'research_executed'],
  runtime: ['timing', 'model', 'usage', 'validation', 'planner_input', 'handoff'],
};
async function n3() {
  const e = state.turn?.trace;
  if (!e) return record('N3 trace', 'FAIL', state.turn ? 'runTurn returned no trace' : 'no turn from N2');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const wrong = Object.entries(TRACE).filter(([part, list]) => !same(Object.keys(part === 'top' ? e : e[part] || {}), list)).map(([part]) => part);
  check('N3 event keys', !wrong.length && e.trace_schema_version === 1 && e.event === 'tutor_decision', 'tutor_decision v1 with exactly the contract keys at every level', `keys differ at ${wrong.join(', ') || 'none'}; version ${e.trace_schema_version}, event ${e.event}`);
  const text = JSON.stringify(e);
  check('N3 no learner text', !text.includes(REQUEST) && !text.includes(CANNED) && !/reason_internal/.test(text), 'neither the request, the reply nor reason_internal is in the event', 'the event carries learner or reply text');
  check('N3 journey identity', e.identity?.journey_id === state.journey.id && e.decision?.selected_next_step_id === state.journey.step.suggestion_id,
    `identity.journey_id is ${state.journey.id}; selected_next_step_id is the clicked hook`, `journey_id ${e.identity?.journey_id}, selected ${e.decision?.selected_next_step_id}`);
}

// ---- shared canvases (N4-N6) ----
const BOARD = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] });
async function shareCanvas(title, blocks) {
  const { name } = await ok(owner, 'POST', '/api/canvases', { title });
  const shared = await ok(owner, 'POST', `/api/learn/boards/${name}/main/share`, { shared: true, view: true, public_view: true, state: BOARD(blocks) });
  return { name, token: shared.sharing.view, state: BOARD(blocks) };
}
// The two unrelated boards of shared-rabbit-hole-check.mjs, and one carrying a card of the public registered course, so
// the server-built scope has claims a viewer's own states can name (N5).
const REG_CARD = NANOGPT.cards.find(id => NANOGPT.targetClaims({ card_id: id }).length);
const REG_BLOCK = { ...cardBlock(cardModule(REG_CARD)), id: 'reg1' };
const REG_CLAIM = NANOGPT.targetClaims(resolveTarget(REG_BLOCK))[0];
async function boards() {
  return state.boards ||= {
    kitchen: await shareCanvas('Kitchen chemistry', [
      { id: 'k-exp', type: 'explanation', dx: 0, dy: 0, title: 'Why salt melts ice', body: 'Salt dissolves into the thin film of water on ice and lowers its freezing point.' },
      { id: 'k-quiz', type: 'quiz', dx: 0, dy: 0, question: 'What does salt do to the freezing point of water?', options: [{ key: 'A', text: 'Lowers it', correct: true }, { key: 'B', text: 'Raises it' }], why: 'Dissolved particles get in the way of the crystal forming.', choice: null },
    ]),
    bridges: await shareCanvas('Bridge loads', [
      { id: 'b-cards', type: 'flashcards', dx: 0, dy: 0, cards: [{ front: 'What is a truss?', back: 'A frame of triangles that carries load as tension and compression.' }, { front: 'Where is the bending moment largest?', back: 'At mid-span, for a simply supported beam under a uniform load.' }] },
    ]),
    course: await shareCanvas('Attention notes', [REG_BLOCK]),
  };
}
const sharedHooks = (who, board, body) => call(who, 'POST', `/api/learn/boards/shared/${board.token}/next-steps`, body);
const ownerBoard = async board => (await call(owner, 'GET', `/api/learn/boards/${board.name}/main`)).text;

// ---- N4: anonymous viewers on two unrelated shared canvases ----
async function n4() {
  const { kitchen, bridges } = await boards();
  const cases = [['root', kitchen, null, ':root'], ['card', bridges, { block_id: 'b-cards' }, 'b-cards']];
  const sets = {};
  for (const [kind, board, origin, expected] of cases) {
    const r = await sharedHooks(null, board, { origin });
    if (noRoute(r)) return skip('N4 shared hooks', `${NO_ROUTE} (HTTP ${r.status})`);
    const problem = r.status === 200 ? setProblem(r.body, 'shared') : `HTTP ${r.status} ${r.body?.error || ''}`;
    const origins = (r.body?.options || []).map(o => o.selected_next_step?.source?.origin_block_id);
    check(`N4 ${kind} hooks`, !problem && origins.length === 3 && origins.every(o => o === expected), `3 shared hooks, origin_block_id ${expected}`, problem || `origin_block_id ${origins.join(', ')}`);
    sets[kind] = { board, origin, set_id: r.body?.set_id };
  }
  // The content-only reply is served from the edge cache. N1's repeat shows whether the local Cache API works at all.
  if (!state.cacheWorks) return skip('N4 cache repeat', `the local Cache API is unavailable (N1's repeat was not a cache hit), so the edge cache cannot be shown here`);
  for (const [kind, { board, origin, set_id }] of Object.entries(sets)) {
    const again = await sharedHooks(null, board, { origin });
    check(`N4 ${kind} cache repeat`, again.status === 200 && !!set_id && again.body?.set_id === set_id, `a repeat returns the same set ${set_id}`, `HTTP ${again.status}, set ${again.body?.set_id} after ${set_id}`);
  }
}

// ---- N5: signed-in viewers with their own evidence ----
async function n5() {
  const { course } = await boards();
  const a = await sessionFor(`pns-viewer-a-${run}@example.org`), b = await sessionFor(`pns-viewer-b-${run}@example.org`);
  const anonymous = await sharedHooks(null, course, { origin: null });
  if (noRoute(anonymous)) return skip('N5 personalized hooks', `${NO_ROUTE} (HTTP ${anonymous.status})`);
  const states = { [REG_CLAIM]: 'uncertain' };
  const mine = await sharedHooks(a, course, { origin: null, viewer_states: states });
  const problem = mine.status === 200 ? setProblem(mine.body, 'shared') : `HTTP ${mine.status} ${mine.body?.error || ''}`;
  check('N5 viewer A personal set', anonymous.status === 200 && !problem && mine.body.set_id !== anonymous.body?.set_id && mine.body.telemetry?.cached !== true,
    `A's set ${mine.body?.set_id} differs from the anonymous ${anonymous.body?.set_id} and is not from the cache`, problem || `A ${mine.body?.set_id}, anonymous ${anonymous.body?.set_id} (HTTP ${anonymous.status}), cached ${mine.body?.telemetry?.cached}`);
  const plain = await sharedHooks(b, course, { origin: null }), same = await sharedHooks(b, course, { origin: null, viewer_states: states });
  const got = [plain.body?.set_id, same.body?.set_id];
  check('N5 viewer B never gets A', plain.status === 200 && same.status === 200 && !!mine.body?.set_id && !got.includes(mine.body.set_id),
    `B without and with the same states gets ${got.join(' and ')}, never A's ${mine.body?.set_id}`, `B HTTP ${plain.status}/${same.status}, sets ${got.join(', ')}, A ${mine.body?.set_id}`);
}

// ---- N6: Start Rabbit Hole with a step; a board save makes it stale ----
async function n6() {
  const { kitchen } = await boards();
  const viewer = await sessionFor(`pns-viewer-c-${run}@example.org`);
  const set = await sharedHooks(viewer, kitchen, { origin: { block_id: 'k-quiz' } });
  if (noRoute(set)) return skip('N6 rabbit hole with a step', `${NO_ROUTE} (HTTP ${set.status})`);
  if (set.status !== 200) throw Error(`shared hooks: HTTP ${set.status} ${set.body?.error || ''}`);
  const step = set.body.options[0].selected_next_step, origin = rabbitOrigin(kitchen.state, 'k-quiz');
  const before = await ownerBoard(kitchen);
  const started = await call(viewer, 'POST', `/api/learn/boards/shared/${kitchen.token}/rabbit-hole`, { origin, selected_next_step: step });
  check('N6 start with a step', started.status === 201 && started.body?.next_step?.suggestion_id === step.suggestion_id, `201 with next_step ${step.suggestion_id}`,
    `HTTP ${started.status} ${started.body?.error || ''}, next_step ${started.body?.next_step?.suggestion_id}`);
  check('N6 start writes nothing to the source', await ownerBoard(kitchen) === before, "the owner's board GET is byte-identical after the start", "the owner's board changed on the start");
  const board = JSON.parse(before);
  const saved = await call(owner, 'PUT', `/api/learn/boards/${kitchen.name}/main`, { state: board.state, version: board.version });
  check('N6 owner save', saved.status === 200 && saved.body?.version === board.version + 1, `the owner's save takes the board to version ${board.version + 1}`, `HTTP ${saved.status}, version ${saved.body?.version} after ${board.version}`);
  const afterSave = await ownerBoard(kitchen);
  const stale = await call(viewer, 'POST', `/api/learn/boards/shared/${kitchen.token}/rabbit-hole`, { origin, selected_next_step: step });
  check('N6 old step is stale', stale.status === 409 && stale.body?.error === 'stale_hook', '409 stale_hook for the step from the old version', `HTTP ${stale.status} ${stale.body?.error || ''}`);
  check('N6 source unchanged but for the save', await ownerBoard(kitchen) === afterSave && JSON.stringify(JSON.parse(afterSave).state) === JSON.stringify(board.state),
    "the owner's board GET is byte-identical after the 409, and its state is the one the check saved", "the owner's board changed beyond the check's own save");
}

// ---- N7: the browser trace sink is off by default ----
// The keyless stack's own resource errors on every page load, with or without the flag, and nothing else: the dev worker
// refuses /auth/session (the P0-B barrier) and BYOC is not configured. Any other console error fails N7.
const STACK_NOISE = [['/auth/session', 403], ['/api/byoc/connection', 503]];
async function n7() {
  if (!state.canvas) return record('N7 trace sink', 'FAIL', 'no canvas from N1');
  const browser = await chromium.launch();
  try {
    for (const traced of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
      if (traced) await context.addInitScript(() => { window.__SMALL_TUTOR_TRACE__ = true; });
      // No model call leaves the page, even on a misconfigured stack.
      await context.route('**/api/learn/tutor/plan', route => route.fulfill({ json: PLAN }));
      await context.route(/\/api\/(learn\/(ask|home-ask|artifact|voice\/|assess|transcribe|image)|chat)$/, route => route.abort());
      const page = await context.newPage(), errors = [], ignored = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        const url = message.location()?.url, at = url ? new URL(url).pathname : '', status = Number(message.text().match(/status of (\d{3})/)?.[1]);
        if (STACK_NOISE.some(([path, code]) => path === at && code === status)) ignored.push(`${at} ${status}`); else errors.push(message.text());
      });
      page.on('response', response => {
        const { pathname } = new URL(response.url());
        if (pathname.startsWith('/api/')) log({ method: response.request().method(), path: pathname, status: response.status(), keys: keys((() => { try { return response.request().postDataJSON(); } catch { return null; } })()) });
      });
      await page.goto(`${BASE}/apps/${state.canvas.name}?tab=learn`);
      await page.locator('[data-tool-gutter]').waitFor({ timeout: 60000 });
      await page.waitForTimeout(1500);
      const sink = await page.evaluate(() => (window.__smallTutorTraces === undefined ? 'undefined' : Array.isArray(window.__smallTutorTraces) ? 'array' : typeof window.__smallTutorTraces));
      const id = traced ? 'N7 trace flag on' : 'N7 trace flag off';
      check(id, sink === (traced ? 'array' : 'undefined'), traced ? 'with the init script window.__smallTutorTraces is an array' : 'with no init script window.__smallTutorTraces is undefined', `window.__smallTutorTraces is ${sink}`);
      check(`${id} console`, !errors.length, `no console errors on the load${ignored.length ? ` (keyless-stack resource errors left out: ${[...new Set(ignored)].join(', ')})` : ''}`, errors.slice(0, 3).join(' | '));
      await page.screenshot({ path: `${OUT}/${traced ? 'N7-trace-on' : 'N7-trace-off'}.png` });
      await context.close();
    }
  } finally { await browser.close(); }
}

// ---- N8-N13: the Auto Tutor (Task 11b), no model ----
// N2's pattern: runTurn in Node, /api/learn/tutor/plan answered in process by a canned plan, every other route to the stack.
// The turn options are the page's own (LearnTutor.jsx turnOffers): the materials always, a Research offer only when the page can
// open Research (research), a learning-path offer where the journey controller can start one (journeyOffer, true on a canvas).
// The canvas is the owned plain canvas of N1 (two saved blocks, no journey, no registered course).
const say = text => ({ type: 'respond_text', text });
const planOf = (...actions) => ({ ...PLAN, actions });
const AUTO_RAW = 'Why does the dough need time to rise?', BROAD = 'Teach me backpropagation from scratch.';
// LearnJourney.jsx startRequest (a JSX file, not importable in Node): a start request as it is, a bare topic as Teach me <topic>.
const startRequest = text => { const it = journeyIntent(text); return STARTS.has(it.kind) && it.topic ? text : `Teach me ${text}`; };
// plan: the canned plan, or a function of the plan request body that returns or awaits one. signal: a real AbortSignal that every
// request to the stack carries (as the page's post carries the turn's Stop signal). stops: the turn may reject (a Stop); the
// rejection comes back as error, with the requests made so far in sent. Each entry of sent keeps the stack's reply.
async function autoTurn(where, { raw, plan = PLAN, slash = null, research = false, journeyOffer = true, repository = false, block = null, signal = null, stops = false }) {
  const sent = [];
  const post = async (route, body) => {
    const entry = { route, body, reply: null }; sent.push(entry);
    if (route === '/api/learn/tutor/plan') { log({ method: 'POST', path: route, status: 'in-process', keys: keys(body) }); return typeof plan === 'function' ? plan(body) : plan; }
    if (!signal) return (entry.reply = await ok(owner, 'POST', route, body));
    try {
      const r = await fetch(`${BASE}${route}`, { method: 'POST', headers: { cookie: `small_session=${owner.session}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
      log({ method: 'POST', path: route, status: r.status, keys: keys(body) });
      if (!r.ok) throw Error(`POST ${route}: HTTP ${r.status}`);
      return (entry.reply = await r.json());
    } catch (error) { if (error.name === 'AbortError') log({ method: 'POST', path: route, status: 'aborted', keys: keys(body) }); throw error; }
  };
  const { domain } = tutorContext({ app: where.name, board: 'main', title: where.title, blocks: where.blocks });
  let result = null, error = null;
  try { result = await runTurn({ raw, slash, canvas: { app: where.name, board: 'main' }, access: { app: where.name }, block, store: emptyStore(), post, domain, materials: materialCommands(), research, journeyOffer, repository, trace: true }); }
  catch (thrown) { if (!stops) throw thrown; error = thrown; }
  return { result, error, post, domain, sent, routes: sent.map(s => s.route), context: sent.find(s => s.route === '/api/learn/tutor/plan')?.body.context, decision: result?.trace?.decision };
}
const journeyAt = name => ok(owner, 'GET', `/api/learn/journey?app=${name}&board=main`);
const noCanvas = id => { if (state.canvas) return false; record(id, 'FAIL', 'no canvas from N1'); return true; };
const ONLY_PLAN = routes => routes.length === 1 && routes[0] === '/api/learn/tutor/plan';
const chipsOf = (actions, domain, extra = {}) => executeActions(actions, { canvas: {}, suggestDive: () => {}, climb: () => {}, domain, ...extra });

// N8: a plain canvas typed turn goes to the Tutor plan request with the canvas's cards, and starts no journey.
async function n8() {
  if (noCanvas('N8')) return;
  const c = state.canvas, { result, routes, context, decision } = await autoTurn(c, { raw: AUTO_RAW });
  check('N8 plan request', ONLY_PLAN(routes) && context?.learner_intent?.raw_user_message === AUTO_RAW && !('journey_context' in context) && result.text === CANNED,
    'a typed turn made exactly one request, to /api/learn/tutor/plan, with the words and no journey context (no /evaluate, no /api/learn/journey)', `requests ${routes.join(', ') || 'none'}; reply ${result.text ? 'present' : 'missing'}`);
  const cards = context?.canvas_context?.cards || [];
  check('N8 canvas cards', JSON.stringify(cards.map(x => x.id)) === JSON.stringify(c.blocks.map(b => b.id)) && cards.every(x => x.kind === 'explanation' && x.title && x.text),
    `canvas_context.cards holds the ${cards.length} saved blocks, in canvas order, with kind, title and text`, `cards ${JSON.stringify(cards.map(x => [x.id, x.kind]))}`);
  check('N8 auto reading', decision?.intent_mode === 'auto' && result.trace?.identity?.mode === 'canvas' && context?.allowed_actions?.includes('respond_text') && context.allowed_actions.includes('create_material'),
    'trace: intent_mode auto, mode canvas; the planner may reply or make material', `intent_mode ${decision?.intent_mode}, mode ${result.trace?.identity?.mode}, allowed ${context?.allowed_actions?.join(',')}`);
  check('N8 no journey', !(await journeyAt(c.name)).journey, 'the canvas has no journey after the turn', 'a journey exists on the canvas');
}

// N9: a broad learning request (one LP1's word gate would have started a journey on) reaches the planner, which may offer a path.
async function n9() {
  if (noCanvas('N9')) return;
  const c = state.canvas, premise = STARTS.has(journeyIntent(BROAD).kind);
  const { routes, context } = await autoTurn(c, { raw: BROAD });
  check('N9 broad request reaches the planner', premise && ONLY_PLAN(routes) && context?.learner_intent?.raw_user_message === BROAD && context.allowed_actions?.includes('suggest_journey'),
    'a request LP1 reads as a journey start made one /api/learn/tutor/plan request, with suggest_journey allowed', `word rule reads a start ${premise}; requests ${routes.join(', ') || 'none'}; allowed ${context?.allowed_actions?.join(',')}`);
  check('N9 no tray', !(await journeyAt(c.name)).journey, 'no journey (so no tray) exists on the canvas', 'a journey was started on the canvas');
}

// N10: a suggest_journey plan yields a Start a learning path chip; nothing starts until the click, which posts the existing start.
async function n10() {
  const title = `Next steps chip ${run}`, { name } = await ok(owner, 'POST', '/api/canvases', { title });
  const request = 'logistic regression', plan = planOf(say(CANNED), { type: 'suggest_journey', request });
  const { result, post, domain, sent } = await autoTurn({ name, title, blocks: [] }, { raw: BROAD, plan });
  const starts = () => sent.filter(s => s.route === '/api/learn/journey');
  const chips = chipsOf(result.actions, domain, { startJourney: text => post('/api/learn/journey', { app: name, board: 'main', action: 'start', text: startRequest(text) }) });
  check('N10 chip, nothing started', chips.length === 1 && chips[0].label === 'Start a learning path' && !starts().length && !(await journeyAt(name)).journey,
    'the plan yields one Start a learning path chip, and before the click no journey POST was made and no journey exists', `chips ${chips.map(x => x.label).join(' | ') || 'none'}; journey POSTs ${starts().length}`);
  await chips[0]?.run();
  const view = await journeyAt(name);
  check('N10 click posts the journey start', starts().length === 1 && starts()[0].body.action === 'start' && starts()[0].body.text === `Teach me ${request}` && !!view.journey?.state,
    `the click posted one /api/learn/journey start (Teach me ${request}); the journey is now ${view.journey?.state}`, `journey POSTs ${starts().length}, body ${JSON.stringify(starts()[0]?.body && { action: starts()[0].body.action, text: starts()[0].body.text })}, journey ${view.journey?.state}`);
}

// N11: suggest_research is offered only where the page can open Research.
async function n11() {
  if (noCanvas('N11')) return;
  const c = state.canvas, request = 'the latest approaches to long-context attention', plan = planOf(say(CANNED), { type: 'suggest_research', request });
  const off = await autoTurn(c, { raw: AUTO_RAW, plan, research: false });
  check('N11 not allowed without openResearch', !off.context?.allowed_actions?.includes('suggest_research') && off.result.actions.every(a => a.type !== 'suggest_research') && off.decision?.research_offered === false
    && !chipsOf([{ type: 'suggest_research', request }], off.domain, { openResearch: null }).length,
    'with no openResearch suggest_research is not in allowed_actions, a plan offering it is cut, and it makes no chip', `allowed ${off.context?.allowed_actions?.join(',')}; actions ${off.result.actions.map(a => a.type).join(',')}; research_offered ${off.decision?.research_offered}`);
  const opened = [], on = await autoTurn(c, { raw: AUTO_RAW, plan, research: true });
  const chips = chipsOf(on.result.actions, on.domain, { openResearch: text => opened.push(text) });
  chips[0]?.run();
  check('N11 allowed with openResearch', on.context?.allowed_actions?.includes('suggest_research') && on.decision?.research_offered === true && on.decision.research_executed === false && ONLY_PLAN(on.routes)
    && chips.length === 1 && chips[0].label === 'Research this' && opened.length === 1 && opened[0] === request,
    'control: with openResearch it is allowed, one Research this chip calls openResearch(request), and the turn itself researched nothing', `allowed ${on.context?.allowed_actions?.join(',')}; chips ${chips.map(x => x.label).join(' | ') || 'none'}; opened ${opened.length}; requests ${on.routes.join(', ')}`);
}

// N12: typed /ask and /teach take the same plan route as Auto; only the explicit marker differs.
async function n12() {
  if (noCanvas('N12')) return;
  const c = state.canvas, auto = await autoTurn(c, { raw: AUTO_RAW });
  check('N12 auto control', auto.decision?.intent_mode === 'auto' && !('slash' in (auto.context?.learner_intent || {})), 'an Auto turn has intent_mode auto and no slash marker', `intent_mode ${auto.decision?.intent_mode}`);
  if (MODE_SLASHES.join() !== 'ask,teach') return record('N12 slash list', 'FAIL', `MODE_SLASHES is ${MODE_SLASHES.join()}, not ask,teach`);
  for (const name of MODE_SLASHES) {
    const { routes, context, decision } = await autoTurn(c, { raw: AUTO_RAW, slash: name });
    check(`N12 /${name}`, ONLY_PLAN(routes) && context?.learner_intent?.slash === name && context.learner_intent.raw_user_message === AUTO_RAW && context.learner_intent.kind === auto.context?.learner_intent?.kind
      && decision?.intent_mode === 'explicit_slash' && decision.inferred_intent === name && decision.intent_status === 'explicit',
      `/${name} made the same one /api/learn/tutor/plan request with the composer's words and slash ${name}; trace intent_mode explicit_slash, intent_status explicit`,
      `requests ${routes.join(', ') || 'none'}; slash ${context?.learner_intent?.slash}; intent_mode ${decision?.intent_mode}, inferred ${decision?.inferred_intent}, status ${decision?.intent_status}`);
  }
}

// N13: create_material for a command that inserts without the model runs from the plan alone, cost_tier none in the trace.
async function n13() {
  if (noCanvas('N13')) return;
  const c = state.canvas, create = command => planOf(say(CANNED), { type: 'create_material', command, request: 'how bread dough rises' });
  for (const command of ['whiteboard', 'notebook']) {
    const { result, decision } = await autoTurn(c, { raw: AUTO_RAW, plan: create(command) });
    const made = decision?.actions?.find(a => a.action_type === 'create_material'), inserted = [], posted = [];
    await runMaterials(result.actions, {
      app: c.name, openSearch: () => {}, offer: async () => {},
      canvas: { insertBlock: block => { inserted.push(block.type); return 'blk'; }, insertNotebook: () => inserted.push('notebook'), reserve: () => null, release: () => {} },
      post: async route => { posted.push(route); throw Error('a model route was reached'); },
    });
    check(`N13 /${command}`, made?.command === command && made.cost_tier === 'none' && decision.chosen_action?.command === command && decision.chosen_action.cost_tier === 'none' && inserted.length === 1 && inserted[0] === command && !posted.length,
      `/${command} ran from the plan: one ${command} inserted, no artifact request; trace cost_tier none (also chosen_action)`,
      `cost_tier ${made?.cost_tier}, chosen ${decision?.chosen_action?.command}/${decision?.chosen_action?.cost_tier}; inserted ${inserted.join(',') || 'none'}; requests ${posted.join(',') || 'none'}`);
  }
  const model = (await autoTurn(c, { raw: AUTO_RAW, plan: create('explain') })).decision?.actions?.find(a => a.action_type === 'create_material');
  check('N13 model command control', model?.cost_tier === 'model', 'control: /explain, which needs the model, is cost_tier model (it is not run)', `cost_tier ${model?.cost_tier}`);
}

// ---- N14-N16: the Tutor handoff route (Task 11c-A), only paths that call no model ----
// POST /api/learn/tutor/handoff { app, capability: 'repository_context', request, selection? }. A plain canvas holds no repository,
// so N14 stops before any retrieval, usage row or model call; N15 and N16 are refused at validation.
const HANDOFF = '/api/learn/tutor/handoff', NO_HANDOFF = 'handoff route not in this base';
const QUESTION = 'What does this function do?';
async function n14() {
  if (noCanvas('N14')) return;
  const c = state.canvas, selection = { repository: 'karpathy/nanoGPT', revision: 'master', file: 'model.py', line_range: { start: 1, end: 3 } };
  for (const [kind, extra] of [['no selection', {}], ['a selection naming a repository', { selection }]]) {
    const r = await call(owner, 'POST', HANDOFF, { app: c.name, capability: 'repository_context', request: QUESTION, ...extra });
    if (noRoute(r)) return skip('N14 no repository context', `${NO_HANDOFF} (HTTP ${r.status})`);
    const t = r.body?.telemetry;
    check(`N14 ${kind}`, r.status === 200 && r.body.capability === 'repository_context' && r.body.answer === null && t?.outcome === 'failed' && t.failure === 'no_repository_context' && t.calls === 0 && !t.input_tokens && !t.output_tokens,
      `a plain canvas answers 200, failure no_repository_context, no answer, 0 model calls${extra.selection ? ' (the selection never picks the repository)' : ''}`, `HTTP ${r.status} ${r.body?.error || ''}; outcome ${t?.outcome}, failure ${t?.failure}, calls ${t?.calls}`);
  }
}
async function n15() {
  if (noCanvas('N15')) return;
  const bad = [];
  for (const capability of ['research', 'do', 'constructor', 'Repository_Context']) {
    const r = await call(owner, 'POST', HANDOFF, { app: state.canvas.name, capability, request: QUESTION });
    if (noRoute(r)) return skip('N15 unknown capability', `${NO_HANDOFF} (HTTP ${r.status})`);
    if (r.status !== 400 || typeof r.body?.error !== 'string' || r.body.telemetry) bad.push(`${capability}: HTTP ${r.status}`);
  }
  check('N15 unknown capability', !bad.length, 'research, do, constructor and a case variant each answer 400 with an error and no telemetry', bad.join('; '));
}
async function n16() {
  if (noCanvas('N16')) return;
  // The raw body is bounded at 64000 characters before it is parsed.
  const big = await call(owner, 'POST', HANDOFF, { app: state.canvas.name, capability: 'repository_context', request: 'x'.repeat(70000) });
  if (noRoute(big)) return skip('N16 oversized body', `${NO_HANDOFF} (HTTP ${big.status})`);
  check('N16 oversized body', big.status === 400 && big.body?.failure === 'too_large' && !big.body.telemetry, 'a 70000-character body answers 400, failure too_large, before any read', `HTTP ${big.status}, failure ${big.body?.failure}`);
  const long = await call(owner, 'POST', HANDOFF, { app: state.canvas.name, capability: 'repository_context', request: 'x'.repeat(1001) });
  check('N16 request over 1000 characters', long.status === 400 && !long.body?.telemetry, 'a request of 1001 characters answers 400', `HTTP ${long.status}`);
}

// ---- N17-N19: the Tutor-side handoff (Task 11c-B), no model ----
// The offer is the page's: LearnTutor.jsx canvasRepository reads the app's data alone (a repo-* app, or a canvas in a project) and
// useTutor hands it to runTurn as repository (a JSX file, mirrored here). A turn that runs the handoff posts to the real 11c-A
// route on the stack. The stack is KEYLESS, so a SUCCESSFUL handoff (the route's model reading the repository, the answer after
// the plan's words, source_types_used repository, runtime.handoff outcome ok) cannot run here, and no check pretends it does:
// only the offer, the failure path and the grounding of the route body are checked.
const canvasRepository = app => typeof app?.name === 'string' && (app.name.startsWith('repo-') || !!app.project);
const LEAD = 'Good question about this code.';
const CODE_WORDS = 'What does the sort function in sort.py do? Where is it defined and who calls it in this repository?';
const REPO_APP = `repo-pns${run}-sorting`; // a repository app by name only: its turns call no route but the plan
const ASK = 'What does the sort function do?';
const handoffPlan = (...before) => ({ ...PLAN, grounding_status: 'grounded', source_types_used: ['canvas', 'repository'], actions: [...before, { type: 'handoff', capability: 'repository_context', request: ASK }] });
const plannerReq = context => plannerRequest(context, 2000);
const toolTypes = context => plannerReq(context).tools[0].input_schema.properties.actions.items.properties.type.enum;
const bodyOf = (sent, route) => sent.find(s => s.route === route)?.body;

// N17: the handoff is offered from the canvas's repository state, never from the words.
async function n17() {
  if (noCanvas('N17')) return;
  const forms = [[{ name: 'canvas-x' }, false], [{ name: 'repo-x' }, true], [{ name: 'canvas-x', project: 'p' }, true]];
  check('N17 page rule', forms.every(([app, want]) => canvasRepository(app) === want), 'canvasRepository: a canvas is not a repository canvas; a repo-* app and a canvas in a project are', 'the mirrored page rule gave an unexpected answer');
  const plain = state.canvas, repo = { name: REPO_APP, title: 'Sorting', blocks: [] }, problems = { plain: [], repository: [] };
  for (const [raw, words] of [[CODE_WORDS, 'code words'], [AUTO_RAW, 'no code words']]) {
    // A plain canvas: not offered, so not in the tool or the prompt, and a plan that carries one has it cut; the route is never called.
    const none = await autoTurn(plain, { raw, repository: canvasRepository(plain), plan: handoffPlan(say(LEAD)) }), c = none.context;
    if (!c || c.allowed_actions.includes('handoff') || toolTypes(c).includes('handoff') || plannerReq(c).system.includes(HANDOFF_SYSTEM)
      || none.result.actions.some(a => a.type === 'handoff') || !ONLY_PLAN(none.routes) || none.result.trace?.runtime?.handoff !== null) problems.plain.push(`${words}: allowed ${c?.allowed_actions?.join(',')}; requests ${none.routes.join(',')}`);
    // A repository canvas: offered, in the tool and the prompt; a plan that does not choose it hands nothing off.
    const some = await autoTurn(repo, { raw, repository: canvasRepository(repo), plan: PLAN }), d = some.context;
    if (!d || !d.allowed_actions.includes('handoff') || !toolTypes(d).includes('handoff') || !plannerReq(d).system.includes(HANDOFF_SYSTEM) || !ONLY_PLAN(some.routes) || some.result.trace?.runtime?.handoff !== null) problems.repository.push(`${words}: allowed ${d?.allowed_actions?.join(',')}; requests ${some.routes.join(',')}`);
  }
  check('N17 plain canvas, code words', !problems.plain.length, 'a canvas with no repository context: handoff is not in allowed_actions, the derived tool or the prompt, with or without code words in the message; a plan carrying one is cut and no handoff request is made', problems.plain.join(' | '));
  check('N17 repository canvas', !problems.repository.length, 'a repo-* canvas: handoff is in allowed_actions, the derived tool and the prompt, with or without code words; a plan that does not choose it makes no handoff request', problems.repository.join(' | '));
}

// N18: a handoff the stack cannot answer. The page offers it (repository: true) on the owned plain canvas, whose repository the
// server cannot resolve; the REAL 11c-A route answers no_repository_context, and the turn says so honestly.
async function n18() {
  if (noCanvas('N18')) return;
  const c = state.canvas, { result, routes, sent, decision } = await autoTurn(c, { raw: CODE_WORDS, repository: true, plan: handoffPlan(say(LEAD)) });
  const body = bodyOf(sent, HANDOFF), t = result.trace, h = t?.runtime?.handoff, timing = t?.runtime?.timing;
  check('N18 requests', routes.join() === `/api/learn/tutor/plan,${HANDOFF}` && Object.keys(body || {}).join() === 'app,capability,request' && body.capability === 'repository_context' && body.request === ASK,
    'the turn made the plan request, then one handoff request with app, capability and the planner request only; no /evaluate', `requests ${routes.join(', ')}; handoff body keys ${Object.keys(body || {}).join(',')}`);
  const only = (await autoTurn(c, { raw: CODE_WORDS, repository: true, plan: handoffPlan() })).result.text;
  check('N18 honest reply', result.text === `${LEAD}\n\n${HANDOFF_FAILED}` && only === HANDOFF_FAILED,
    'the reply is the plan words then the plain failure line (just the line when the plan has no words); no repository text', `reply ${result.text ? 'present' : 'missing'}, matches ${result.text === `${LEAD}\n\n${HANDOFF_FAILED}`}; handoff-only reply matches ${only === HANDOFF_FAILED}`);
  const chosen = decision?.chosen_action, listed = decision?.actions?.map(a => `${a.action_type}/${a.capability}`).join();
  check('N18 trace action', chosen?.action_type === 'handoff' && chosen.capability === 'repository_context' && listed === 'respond_text/null,handoff/repository_context',
    'chosen_action and actions: action_type handoff with capability repository_context, after the respond_text lead-in', `chosen ${chosen?.action_type}/${chosen?.capability}; actions ${listed}`);
  // tool_errors (fix round 1, coordinator ruling): the route's own count of failed source reads, null when it reports none.
  const reported = sent.find(s => s.route === HANDOFF)?.reply?.telemetry?.tool_errors ?? null;
  check('N18 runtime.handoff', Object.keys(h || {}).join() === 'started_at,completed_at,ms,outcome,failure,model_id,usage,tool_errors' && h.outcome === 'failed' && h.failure === 'no_repository_context' && h.model_id === null
    && [0, null].includes(h.tool_errors) && h.tool_errors === reported,
    `runtime.handoff: outcome failed, failure no_repository_context, no model served, tool_errors ${h?.tool_errors} as the route reported it`, `runtime.handoff ${JSON.stringify(h && { keys: Object.keys(h), outcome: h.outcome, failure: h.failure, model_id: h.model_id, tool_errors: h.tool_errors })}; route reported ${reported}`);
  // The handoff is the chosen action whenever one ran, even beside material or a learning-path offer (fix round 1, B-I3).
  const beside = [['create_material', { type: 'create_material', command: 'whiteboard', request: 'how bread dough rises' }], ['suggest_journey', { type: 'suggest_journey', request: 'logistic regression' }]], misses = [];
  for (const [type, extra] of beside) {
    const turn = await autoTurn(c, { raw: CODE_WORDS, repository: true, plan: handoffPlan(say(LEAD), extra) }), pick = turn.decision?.chosen_action;
    if (pick?.action_type !== 'handoff' || pick.capability !== 'repository_context' || !turn.decision.actions.some(a => a.action_type === type)) misses.push(`${type}: chosen ${pick?.action_type}/${pick?.capability}; actions ${turn.decision?.actions?.map(a => a.action_type).join(',')}`);
  }
  check('N18 chosen_action beside other actions', !misses.length, 'with a create_material or a suggest_journey in the same plan, chosen_action is still the handoff (and the other action is listed)', misses.join(' | '));
  check('N18 grounding', decision?.grounding_status === 'retrieval_failed' && decision.source_types_used?.join() === 'canvas',
    'grounding_status retrieval_failed, source_types_used canvas: the planner declared grounded and repository, and the failure overrode both', `grounding_status ${decision?.grounding_status}, source_types_used ${decision?.source_types_used?.join()}`);
  const numbers = ['planner_ms', 'handoff_ms', 'blocking_wait_ms'].map(k => timing?.[k]);
  check('N18 timing', Object.keys(timing || {}).join() === 'total_ms,planner_ms,first_text_ms,handoff_ms,blocking_wait_ms' && numbers.every(Number.isFinite) && timing.blocking_wait_ms >= timing.handoff_ms,
    `planner_ms ${numbers[0]}, handoff_ms ${numbers[1]} and blocking_wait_ms ${numbers[2]} are separate numbers (the wait includes the handoff)`, `timing ${JSON.stringify(timing)}`);
  const text = JSON.stringify(t);
  check('N18 no text in the trace', !!t && [CODE_WORDS, ASK, LEAD, HANDOFF_FAILED].every(s => !text.includes(s)), 'neither the learner words, the handoff request, the plan words nor the failure line is in the event', 'the event carries learner, request or reply text');
}

// N19: a keyword never creates a selection. The route body's selection comes from the selected card's structured code source only.
async function n19() {
  if (noCanvas('N19')) return;
  const c = state.canvas, WORDS = 'What does sort.py lines 30-40 in example/sorting do? Compare it with model.py:2-3 of nanogpt/nanogpt.';
  const SHA = 'a'.repeat(40), source = { kind: 'code', repo: 'example/sorting', revision: SHA, path: 'bubble.py', lines: [5, 9] };
  const bodyFor = async block => bodyOf((await autoTurn(c, { raw: WORDS, repository: true, block, plan: handoffPlan() })).sent, HANDOFF);
  const bare = await bodyFor(null), plainCard = await bodyFor(c.blocks[0]);
  const coded = await bodyFor({ id: 'code1', type: 'explanation', title: 'Bubble sort', body: 'It swaps neighbours.', sources: [source] });
  check('N19 no card, no selection', !!bare && !('selection' in bare) && !('context' in bare), 'a message naming sort.py lines 30-40 and a repository, with no selected card, sends no selection and no context', `body keys ${Object.keys(bare || {}).join(',')}`);
  check('N19 card without a code source', !!plainCard && !('selection' in plainCard) && plainCard.context?.card?.id === c.blocks[0].id, 'a selected card with no code source sends its text as context.card and still no selection', `body keys ${Object.keys(plainCard || {}).join(',')}`);
  check('N19 selection from the source', JSON.stringify(coded?.selection) === JSON.stringify({ repository: 'example/sorting', revision: SHA, file: 'bubble.py', line_range: { start: 5, end: 9 } }),
    'a card with a code source sends that source as the selection (bubble.py 5-9), not the file and lines the message names', `selection ${JSON.stringify(coded?.selection)}`);
}

// ---- N20-N22: the handoff after 11c-B fix round 1 (Stop, invalid_action, code in the request), no model ----
const planWith = (handoff, ...before) => ({ ...PLAN, grounding_status: 'grounded', source_types_used: ['canvas', 'repository'], actions: [...before, { type: 'handoff', ...handoff }] });
const SOON = ms => new Promise(resolve => setTimeout(resolve, ms));

// N20: a Stop during the handoff ends the turn as a Stop during the planner does: the turn rejects (so the page saves nothing, runs
// no canvas action or material and emits no decision event), the stopped handoff record rides on the error, and nothing more is
// requested. The abort is a real AbortController whose signal the request to the stack carries, fired 4 ms after the plan: the
// route takes tens of milliseconds, so the abort lands in flight.
async function n20() {
  if (noCanvas('N20')) return;
  const c = state.canvas, stop = new AbortController();
  const plan = () => { setTimeout(() => stop.abort(), 4); return planWith({ capability: 'repository_context', request: ASK }, say(LEAD), { type: 'create_material', command: 'explain', request: 'how bread dough rises' }); };
  const h = await autoTurn(c, { raw: CODE_WORDS, repository: true, plan, signal: stop.signal, stops: true });
  const settled = h.sent.length;
  await SOON(300);
  const rec = h.error?.handoff, ran = h.sent.map(s => s.route);
  check('N20 stop in the handoff', !h.result && h.error?.name === 'AbortError' && rec?.outcome === 'failed' && rec.failure === 'stopped' && rec.model_id === null && rec.usage === null && !!h.error.trace && h.error.trace.event === undefined
    && ran.join() === `/api/learn/tutor/plan,${HANDOFF}` && h.sent.length === settled,
    'the turn rejected with AbortError and no result; the error carries the handoff record (failed, stopped) and the turn trace, not a decision event; only the plan and the handoff were requested (no artifact call) and nothing after the abort',
    `${h.result ? 'the turn resolved (the route answered before the abort)' : `rejected ${h.error?.name}`}; handoff ${JSON.stringify(rec && { outcome: rec.outcome, failure: rec.failure })}; requests ${ran.join(', ')}; after the abort ${h.sent.length - settled}`);
  // Control: a Stop while the planner works ends the turn the same way (a real AbortController again), with no handoff.
  const plannerStop = new AbortController();
  const waiting = () => new Promise((_, reject) => { plannerStop.signal.addEventListener('abort', () => reject(plannerStop.signal.reason)); setTimeout(() => plannerStop.abort(), 4); });
  const p = await autoTurn(c, { raw: CODE_WORDS, repository: true, plan: waiting, signal: plannerStop.signal, stops: true });
  check('N20 planner Stop control', !p.result && p.error?.name === 'AbortError' && !!p.error.trace && p.error.trace.event === undefined && p.error.handoff === undefined && ONLY_PLAN(p.routes),
    'control: a Stop during the planner rejects the same way (AbortError, a turn trace, no decision event) and makes no handoff request', `${p.result ? 'resolved' : `rejected ${p.error?.name}`}; requests ${p.routes.join(', ')}`);
}

// N21: the canvas offers the handoff and the plan proposes one the validator drops: the turn records failure invalid_action, says the
// source context could not be retrieved, records retrieval_failed, and makes no handoff request.
async function n21() {
  if (noCanvas('N21')) return;
  const c = state.canvas, bad = [];
  const shapes = [['a blank request', { capability: 'repository_context', request: '   ' }], ['an unknown capability', { capability: 'research', request: ASK }], ['a request over 1000 characters', { capability: 'repository_context', request: 'x'.repeat(1001) }]];
  for (const [name, handoff] of shapes) {
    const { result, routes, context, decision } = await autoTurn(c, { raw: CODE_WORDS, repository: true, plan: planWith(handoff, say(LEAD)) });
    const h = result.trace?.runtime?.handoff;
    const fine = context?.allowed_actions?.includes('handoff') && ONLY_PLAN(routes) && result.text === `${LEAD}\n\n${HANDOFF_FAILED}` && !result.actions.some(a => a.type === 'handoff')
      && JSON.stringify(h && { ms: h.ms, outcome: h.outcome, failure: h.failure, model_id: h.model_id, usage: h.usage, tool_errors: h.tool_errors }) === JSON.stringify({ ms: 0, outcome: 'failed', failure: 'invalid_action', model_id: null, usage: null, tool_errors: null })
      && decision.grounding_status === 'retrieval_failed' && decision.source_types_used?.join() === 'canvas';
    if (!fine) bad.push(`${name}: requests ${routes.join(',')}; failure ${h?.failure}; grounding ${decision?.grounding_status}; reply ${result.text === `${LEAD}\n\n${HANDOFF_FAILED}`}`);
  }
  check('N21 invalid_action', !bad.length, 'a blank request, an unknown capability and a 1001-character request each: handoff offered, dropped by the validator; runtime.handoff failed/invalid_action (ms 0, no model, no usage, tool_errors null); the failure line follows the plan words; retrieval_failed, no repository source; no handoff request', bad.join(' | '));
}

// N22: code is a valid request. Backticks and => reach the route unchanged (a question for the source reader, not a command).
async function n22() {
  if (noCanvas('N22')) return;
  const c = state.canvas, CODE = 'What does `sort(items)` do, and is `(a, b) => a - b` its comparator?';
  const { result, routes, sent } = await autoTurn(c, { raw: AUTO_RAW, repository: true, plan: planWith({ capability: 'repository_context', request: CODE }, say(LEAD)) });
  const reply = sent.find(s => s.route === HANDOFF)?.reply, h = result.trace?.runtime?.handoff;
  check('N22 code in the request', routes.join() === `/api/learn/tutor/plan,${HANDOFF}` && sent.at(-1).body.request === CODE && result.decisions.every(d => d.accepted) && reply?.telemetry?.failure === 'no_repository_context' && h?.failure === 'no_repository_context',
    'a handoff request with backticks and => is valid: accepted by the validator, sent to the route unchanged, and answered by the route itself (no_repository_context here), not dropped (invalid_action) and not refused (400)',
    `requests ${routes.join(', ')}; accepted ${result.decisions.every(d => d.accepted)}; route failure ${reply?.telemetry?.failure}; runtime.handoff failure ${h?.failure}`);
}

// ---- run ----
// The checks run in this order, one entry per group. A group's rows are the results whose id starts with its id.
const CHECKS = [['N1', n1], ['N2', n2], ['N3', n3], ['N4', n4], ['N5', n5], ['N6', n6], ['N7', n7], ['N8', n8], ['N9', n9], ['N10', n10], ['N11', n11], ['N12', n12], ['N13', n13], ['N14', n14], ['N15', n15], ['N16', n16], ['N17', n17], ['N18', n18], ['N19', n19], ['N20', n20], ['N21', n21], ['N22', n22]];
for (const [id, fn] of CHECKS) {
  label = id;
  try { await fn(); } catch (error) { record(id, 'FAIL', `stopped: ${error.message.split('\n')[0]}`); }
}
const groupStatus = id => {
  const mine = results.filter(r => r.id === id || r.id.startsWith(`${id} `));
  return mine.some(r => r.status === 'FAIL') ? 'FAIL' : mine.some(r => r.status === 'SKIP') ? 'SKIP' : mine.length ? 'PASS' : 'NOT RUN';
};
const table = CHECKS.map(([id]) => ({ id, status: groupStatus(id) }));
writeFileSync(`${OUT}/next-steps-results.json`, JSON.stringify({ table, checks: results }, null, 2));
writeFileSync(`${OUT}/next-steps-network.json`, JSON.stringify(network, null, 2));
console.log('\n' + table.map(row => `${row.id}  ${row.status}`).join('\n'));
process.exitCode = table.some(row => row.status === 'FAIL') ? 1 : 0;
