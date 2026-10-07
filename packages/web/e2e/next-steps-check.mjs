// Professor Next Steps acceptance N1-N7 (docs/features/professor-next-steps.md) against the KEYLESS local stack only
// (e2e/journey-local-stack.md §6): no model key is bound and the hook planner answers from its fixtures
// (JOURNEY_MODEL_STUB=fixtures). Node + HTTP for N1-N6; the browser only for N7. The Tutor planner is never reached: N2's
// next_step turn runs in Node, its /api/learn/tutor/plan answered in process (as journey-check.mjs answers it in the page),
// every other request it makes goes to the stack.
//   node e2e/next-steps-check.mjs --base http://127.0.0.1:8868 --cp http://127.0.0.1:8869 --vars <stack .dev.vars> --out <dir>
// --vars is the stack's own vars file; only its TEST_BYPASS_SECRET is read, never printed. Sessions are minted on the
// control plane's origin (the app's barrier refuses /test/session there).
// Each check prints PASS, FAIL or SKIP with its reason; <out>/next-steps-results.json holds the table and
// <out>/next-steps-network.json the requests per check (method, path, status, request body keys - never learner text; a
// share token in a path is replaced by <token>).
// Each check is a named function in CHECKS; later checks (Auto-Tutor, repository handoff) are appended there.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { nextStepsInput } from '../src/learn-next-steps.js';
import { journeyDomain } from '../src/learn-journey-domain.js';
import { emptyStore } from '../src/learn-tutor-evidence.js';
import { runTurn } from '../src/learn-tutor.js';
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
  state.canvas = { name, title };
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
// (learn-tutor-trace.test.mjs): decision.evidence_transitions, decision.shown_at, decision.selected_at, runtime.planner_input.
const TRACE = {
  top: ['trace_schema_version', 'event', 'decision_id', 'step_id', 'generated_at', 'identity', 'versions', 'decision', 'runtime', 'flags'],
  identity: ['user_id', 'session_id', 'canvas_id', 'board_id', 'canvas_version', 'journey_id', 'section_id', 'dive_id', 'source', 'scope', 'mode'],
  versions: ['planner_version', 'prompt_version', 'model_role', 'model_id'],
  decision: ['current_goal', 'current_section_id', 'target_concept_ids', 'target_claim_ids', 'evidence_summary', 'evidence_transitions', 'canvas_summary', 'recent_modality_history', 'next_step_options', 'shown_at', 'selected_next_step_id', 'selected_at', 'route', 'chosen_action', 'actions', 'reason_codes', 'reason_source', 'rationale_summary', 'expected_evidence', 'estimated_learning_seconds'],
  runtime: ['timing', 'model', 'usage', 'validation', 'planner_input'],
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

// ---- run ----
// Append later checks here (Auto-Tutor after Task 11b, repository handoff after Task 11c).
const CHECKS = [['N1', n1], ['N2', n2], ['N3', n3], ['N4', n4], ['N5', n5], ['N6', n6], ['N7', n7]];
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
