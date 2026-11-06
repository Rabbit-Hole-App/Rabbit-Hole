// Professor Next Steps acceptance (docs/features/professor-next-steps.md): N1 the owned-canvas hook route, N2 a hook click in the
// page (one plain Chat turn), N3 the dock (a typed broad request is one plain Chat turn, no journey start), N4-N6 the shared-canvas
// routes (anonymous and signed-in viewers, Start Rabbit Hole with a step), against the KEYLESS local stack only
// (e2e/journey-local-stack.md §6): no model key is bound and the hook planner answers from its fixtures (JOURNEY_MODEL_STUB=fixtures).
// Node + HTTP for N1 and N4-N6; N2 and N3 use the browser, with the chat route and Learn ask answered in the page. Since Tutor cleanup
// P2 nothing in the browser calls the Tutor routes (plan, evaluate, handoff), so none is answered and the page is checked for them.
//   node e2e/next-steps-check.mjs --base http://127.0.0.1:8868 --cp http://127.0.0.1:8869 --vars <stack cp/.dev.vars> [--app-vars <stack app/.dev.vars>] [--out <dir>]
// --vars is the control plane's vars file and --app-vars the app worker's (default: app/.dev.vars beside the control plane's folder).
// The run is refused before any request unless every line of every vars file the stack loads is one of the five stack names (a strict
// per-line allowlist), the configs' vars declare no model, voice or subscription name, and the environment carries none (a refusal
// prints file and line numbers, never text from a vars file); only TEST_BYPASS_SECRET is read as a value, never printed. Sessions are minted on the
// control plane's origin (the app's barrier refuses /test/session there). --out defaults to e2e/shots/next-steps (gitignored).
// Each check prints PASS, FAIL or SKIP with its reason; <out>/next-steps-results.json holds the table and
// <out>/next-steps-network.json the requests per check (method, path, status, request body keys - never learner text; a
// share token in a path is replaced by <token>).
// Each check is a named function in CHECKS; later checks are appended there.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertKeyless, defaultAppVars } from './keyless-guard.mjs';
import { mockChatRoute } from './dev-cp.mjs';
import { nextStepsInput } from '../src/learn-next-steps.js';
import { rabbitOrigin } from '../src/shared-rabbit-hole.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
// --out defaults to e2e/shots/next-steps, which is gitignored (a run never leaves untracked files in the tree).
const BASE = arg('base', 'http://127.0.0.1:8868'), CP = arg('cp', 'http://127.0.0.1:8869'), OUT = arg('out', fileURLToPath(new URL('./shots/next-steps', import.meta.url))), VARS = arg('vars', process.env.JOURNEY_VARS);
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('next-steps-check runs against the local stack only');
if (!VARS) throw Error('--vars <the local stack .dev.vars> is required (e2e/journey-local-stack.md)');

/// ---- keyless only: every vars file the stack loads (keyless-guard.mjs) ----
// The run is refused before any request unless every line of every vars file the stack loads is one of the five stack names, the
// configs' vars declare no model, voice or subscription name, and the environment carries none; see keyless-guard.mjs.
const APP_VARS = arg('app-vars', defaultAppVars(VARS));
assertKeyless({ who: 'next-steps-check', vars: VARS, appVars: APP_VARS });
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim();
if (!secret) throw Error(`no TEST_BYPASS_SECRET in ${VARS}`);

const REQUEST = 'I want to learn logistic regression';
const CANNED = 'A canned answer from next-steps-check: no model was called.';
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
const state = { canvas: null, cacheWorks: null, boards: null };
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
  const built = nextStepsInput({ blocks: saved, title, basis: `n1-${run}` });
  if (!built.input) throw Error(`nextStepsInput: ${built.problem}`);
  const first = await call(owner, 'POST', '/api/learn/tutor/next-steps', { app: name, input: built.input });
  const problem = first.status === 200 ? setProblem(first.body, 'owned') : `HTTP ${first.status} ${first.body?.error || ''}`;
  check('N1 hook set', !problem, `200, 3 owned hooks with ${first.body?.set_id}.1-3 ids (${saved.length} saved blocks, mode ${built.input.mode})`, problem);
  // The key name, and the stub's value (learn-journey-fixtures.js: "fixture <kind>") under any other key.
  check('N1 no reason_internal', !/reason_internal|"fixture /.test(first.text), 'neither reason_internal nor its fixture value is in the reply text', 'the reply text carries reason_internal or its fixture value');
  const again = await call(owner, 'POST', '/api/learn/tutor/next-steps', { app: name, input: built.input });
  state.cacheWorks = again.body?.telemetry?.cached === true;
  check('N1 same basis, same set', again.status === 200 && !!first.body?.set_id && again.body?.set_id === first.body.set_id,
    `a repeat with the same basis returns ${again.body?.set_id} (cached ${state.cacheWorks})`, `HTTP ${again.status}, set ${again.body?.set_id} after ${first.body?.set_id} (cached ${state.cacheWorks})`);
}

// ---- shared canvases (N4-N6) ----
const BOARD = blocks => ({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks, exchanges: [] });
async function shareCanvas(title, blocks) {
  const { name } = await ok(owner, 'POST', '/api/canvases', { title });
  const shared = await ok(owner, 'POST', `/api/learn/boards/${name}/main/share`, { shared: true, view: true, public_view: true, state: BOARD(blocks) });
  return { name, token: shared.sharing.view, state: BOARD(blocks) };
}
// The two unrelated boards of shared-rabbit-hole-check.mjs, and a third one signed-in viewers share (N5).
const REG_BLOCK = { id: 'reg1', type: 'explanation', dx: 0, dy: 0, title: 'Attention weights', body: 'Each token scores every other token.' };
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
// generate: an explicit ask; a view alone reads the saved set or is idle (owner priority 1, 2026-10-21).
const sharedHooks = (who, board, body) => call(who, 'POST', `/api/learn/boards/shared/${board.token}/next-steps`, { generate: true, ...body });
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

// ---- N5: signed-in viewers; their own evidence states are ignored (Tutor cleanup P1) ----
async function n5() {
  const { course } = await boards();
  const a = await sessionFor(`pns-viewer-a-${run}@example.org`), b = await sessionFor(`pns-viewer-b-${run}@example.org`);
  const anonymous = await sharedHooks(null, course, { origin: null });
  if (noRoute(anonymous)) return skip('N5 viewer states', `${NO_ROUTE} (HTTP ${anonymous.status})`);
  // With the edge cache off every set id is fresh, so the shared set could never repeat whatever the product does: the cache is
  // what this check is about, so without it it would only pass.
  if (!state.cacheWorks) return skip('N5 viewer states', `the local Cache API is unavailable (N1's repeat was not a cache hit), so a shared set cannot be told from a fresh one here`);
  const states = { 'any/claim': 'uncertain' };
  const mine = await sharedHooks(a, course, { origin: null, viewer_states: states });
  const plain = await sharedHooks(b, course, { origin: null });
  const problem = mine.status === 200 ? setProblem(mine.body, 'shared') : `HTTP ${mine.status} ${mine.body?.error || ''}`;
  check('N5 viewer states are ignored', anonymous.status === 200 && !problem && mine.body.set_id === anonymous.body?.set_id && plain.body?.set_id === anonymous.body?.set_id,
    `A with states, B without and the anonymous viewer all get ${anonymous.body?.set_id}: one content-only set`, problem || `A ${mine.body?.set_id}, B ${plain.body?.set_id} (HTTP ${plain.status}), anonymous ${anonymous.body?.set_id} (HTTP ${anonymous.status})`);
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

// ---- N2, N3: the browser. A hook click and the dock are ordinary Chat turns ----
// This drives the real composer, which is allowed only because (1) the stack is KEYLESS - every vars file it loads was checked on
// startup, so no model, voice or subscription key exists for any worker to use - and (2) every model route is answered or aborted
// IN THE PAGE: the chat route (/api/learn/chat/route) and Learn ask (/api/learn/ask, server-sent events) are fulfilled with a
// canned answer, and every other non-GET /api/ request is aborted unless it is one of the stack's own keyless routes (canvases,
// boards, coaching controls, saved chat threads and the hook planner, which answers from its fixtures without a call).
// The keyless stack's own resource errors on every page load, with or without the flag, and nothing else: the dev worker
// refuses /auth/session (the P0-B barrier) and BYOC is not configured. Any other console error fails the check.
const STACK_NOISE = [['/auth/session', 403], ['/api/byoc/connection', 503], ['/api/me', 403]];
// Owned board saves (boards/<app>/<board>, never boards/shared/..., whose ask is a model route), canvases, the coaching controls,
// saved chat threads and the hook planner. Everything else non-GET is aborted.
const LOCAL_WRITES = /^\/api\/(canvases|learn\/(boards\/(?!shared\/)[^/]+\/[^/]+$|coaching$|chat\/(threads\/|active$)|tutor\/next-steps$))/;
const TUTOR_ROUTES = /^\/api\/learn\/tutor\/(plan|evaluate|handoff)$/;
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
async function pageFor(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
  const aborted = [], seen = [], errors = [], ignored = [];
  await context.route(/\/api\//, route => {
    const method = route.request().method(), url = new URL(route.request().url());
    if (method === 'GET' || method === 'HEAD' || LOCAL_WRITES.test(url.pathname)) return route.fallback();
    aborted.push(`${method} ${url.pathname}`);
    return route.abort();
  });
  // Registered last, so they win over the catch-all. A plain Auto or Ask turn asks the chat route, then posts /api/learn/ask.
  await mockChatRoute(context);
  await context.route('**/api/learn/ask', route => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: frame('chunk', { text: CANNED }) + frame('done', { ok: true, threadId: `ns-thread-${run}`, messageId: `ns-m-${seen.length}` }) }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location()?.url, at = url ? new URL(url).pathname : '', status = Number(message.text().match(/status of (\d{3})/)?.[1]);
    if (STACK_NOISE.some(([path, code]) => path === at && code === status)) ignored.push(`${at} ${status}`); else errors.push(message.text());
  });
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/')) seen.push({ method: request.method(), path: pathname, body: (() => { try { return request.postDataJSON(); } catch { return null; } })() });
  });
  page.on('response', response => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith('/api/')) log({ method: response.request().method(), path: pathname, status: response.status(), keys: keys((() => { try { return response.request().postDataJSON(); } catch { return null; } })()) });
  });
  return { context, page, errors, ignored, seen, aborted };
}
const posted = (seen, path) => seen.filter(entry => entry.method === 'POST' && entry.path === path);
const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] :is(textarea, input:not([type="file"]))').first();
const BROAD = 'Teach me backpropagation from scratch.';
const noiseOf = ignored => (ignored.length ? ` (keyless-stack resource errors left out: ${[...new Set(ignored)].join(', ')})` : '');

// N2: Professor Next Steps in the page. The owner picks Tutor (its saved canvas control, so hooks may ask); the card's Suggest
// asks the keyless hook planner; a click on a hook is one plain Chat turn - the hook sentence is the message, nothing rides with
// it, and no Tutor route (plan, evaluate, handoff) is called.
async function n2() {
  if (!state.canvas) return record('N2 hook click', 'FAIL', 'no canvas from N1');
  const { name } = state.canvas;
  const { state: coaching } = await ok(owner, 'GET', `/api/learn/coaching?app=${name}&board=main`);
  await ok(owner, 'POST', '/api/learn/coaching', { app: name, board: 'main', actionId: `tutor-${run}`, expectedRevision: coaching.revision, action: 'save_controls', payload: { event: { type: 'select_mode', mode: 'tutor' } } });
  const browser = await chromium.launch();
  try {
    const { context, page, errors, ignored, seen, aborted } = await pageFor(browser);
    await page.goto(`${BASE}/apps/${name}?tab=learn`);
    await composerOf(page).waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.locator('[data-hooks-slot] section[data-next-steps="empty"]').getByRole('button', { name: 'Suggest next steps' }).click({ timeout: 30000 });
    await page.locator('[data-next-steps="ready"] [data-next-step]').first().waitFor({ timeout: 60000 });
    const hooks = await page.locator('[data-next-steps] [data-next-step]').allInnerTexts();
    const hook = hooks[0];
    const asked = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/learn/ask', { timeout: 20000 });
    await page.locator('[data-next-step]').first().click();
    await asked.catch(() => null);
    const shown = await page.getByText(CANNED).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    await page.waitForTimeout(1000);
    const asks = posted(seen, '/api/learn/ask'), tutorCalls = seen.filter(entry => TUTOR_ROUTES.test(entry.path));
    check('N2 hook click', hooks.length === 3 && asks.length === 1 && asks[0].body?.message === hook && !JSON.stringify(asks[0].body).includes('selected_next_step') && shown,
      'a click on the first of 3 hooks sent exactly one /api/learn/ask whose message is the hook sentence, with no selected_next_step beside it, and the reply showed',
      `${hooks.length} hooks; ${asks.length} ask(s); message ${asks[0]?.body?.message === hook ? 'matches' : 'differs'}; selected_next_step ${JSON.stringify(asks[0]?.body ?? {}).includes('selected_next_step')}; reply shown ${shown}`);
    check('N2 no Tutor routes', !tutorCalls.length, 'the page made no request to /api/learn/tutor/plan, /evaluate or /handoff', tutorCalls.map(entry => entry.path).join(', '));
    check('N2 clean page', !errors.length && !aborted.length, `no console errors and no request aborted in the page${noiseOf(ignored)}`, `${errors.slice(0, 2).join(' | ')} aborted: ${aborted.join(', ') || 'none'}`);
    await page.screenshot({ path: `${OUT}/N2-hook-click.png` });
    await context.close();
  } finally { await browser.close(); }
}

// N3: the dock. The broad learning request typed into the composer of a plain canvas and sent is one plain Chat turn: one
// /api/learn/ask with the words, no Tutor route, no /api/learn/journey POST, no journey on the canvas, no tray in the DOM.
async function n3() {
  if (!state.canvas) return record('N3 dock', 'FAIL', 'no canvas from N1');
  const browser = await chromium.launch();
  try {
    const dock = await pageFor(browser);
    await dock.page.goto(`${BASE}/apps/${state.canvas.name}?tab=learn`);
    await composerOf(dock.page).waitFor({ timeout: 30000 });
    await dock.page.waitForTimeout(1500);
    const asked = dock.page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/learn/ask', { timeout: 20000 });
    await composerOf(dock.page).fill(BROAD);
    await composerOf(dock.page).press('Enter');
    await asked.catch(() => null);
    const shown = await dock.page.getByText(CANNED).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    await dock.page.waitForTimeout(1000);
    const asks = posted(dock.seen, '/api/learn/ask'), trays = await dock.page.locator('[data-tutor-prompt-tray]').count(), tutorCalls = dock.seen.filter(entry => TUTOR_ROUTES.test(entry.path));
    check('N3 dock: one Chat turn', asks.length === 1 && asks[0].body?.message === BROAD && !tutorCalls.length && shown,
      'typing the broad request in the composer sent exactly one /api/learn/ask with the words, no Tutor route, and the reply showed',
      `${asks.length} ask(s); words ${asks[0]?.body?.message === BROAD ? 'match' : 'differ'}; Tutor routes ${tutorCalls.map(entry => entry.path).join(', ') || 'none'}; reply shown ${shown}`);
    const starts = posted(dock.seen, '/api/learn/journey');
    check('N3 dock: no journey start', !starts.length, 'the page made no POST to /api/learn/journey', `${starts.length} journey POST(s), actions ${starts.map(entry => entry.body?.action).join(',')}`);
    const view = await ok(owner, 'GET', `/api/learn/journey?app=${state.canvas.name}&board=main`);
    check('N3 dock: no journey, no tray', !view.journey && trays === 0, 'the canvas has no journey record and the DOM has no prompt tray', `journey on the canvas ${!!view.journey}; ${trays} tray(s)`);
    check('N3 dock: nothing else left the page', !dock.errors.length && !dock.aborted.length, `no console errors and no request aborted in the page${noiseOf(dock.ignored)}`,
      `${dock.errors.slice(0, 2).join(' | ')} aborted: ${dock.aborted.join(', ') || 'none'}`);
    await dock.page.screenshot({ path: `${OUT}/N3-dock.png` });
    await dock.context.close();
    // Control: the observer does see a journey start when one is posted. Home's Agent Bar used to start one from a typed request;
    // the bar is gone from Home (owner, 2026-10-22), so the control posts the same start from the page itself (the page aborts
    // it, as it does any non-local write; the observer logs the request before that) and its POST /api/learn/journey is in the log.
    const home = await pageFor(browser);
    await home.page.goto(`${BASE}/apps`);
    await home.page.waitForTimeout(3000);
    await home.page.evaluate(async (text) => { await fetch('/api/learn/journey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'start', text }) }).catch(() => null); }, REQUEST);
    await home.page.waitForTimeout(1500);
    const homeStarts = posted(home.seen, '/api/learn/journey').filter(entry => entry.body?.action === 'start');
    check('N3 dock control', homeStarts.length === 1, 'control: a journey start posted from the page, and the same observer sees its one POST /api/learn/journey start', `${homeStarts.length} journey start POST(s) seen from Home (page at ${new URL(home.page.url()).pathname})`);
    await home.context.close();
  } finally { await browser.close(); }
}

// ---- run ----
// The checks run in this order, one entry per group. A group's rows are the results whose id starts with its id.
const CHECKS = [['N1', n1], ['N2', n2], ['N3', n3], ['N4', n4], ['N5', n5], ['N6', n6]];
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
