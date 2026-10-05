// Adaptive Learning Path LP1 acceptance J1-J8 (docs/features/adaptive-learning-path-v1-architecture.md §16), in a real
// browser against the KEYLESS local stack only (e2e/journey-local-stack.md): no model key is bound, the journey planners
// run their fixtures (JOURNEY_MODEL_STUB=fixtures), and every request that could reach a model from the page is answered
// here (/api/learn/ask a canned SSE reply, /api/learn/home-ask a canned answer, the Tutor planner /api/learn/tutor/plan
// a canned respond_text plan; artifact, voice, assess, image refused). /api/learn/tutor/evaluate reaches the stack: with
// no JEV key its free-text rung answers status 'error' without a call, and a keyed probe option is graded server-side.
// Since LP1 Task 12 every typed turn on a journey canvas is the Tutor's (useTutor.turn, resolver first): none may reach
// /api/learn/ask.
//   node e2e/journey-check.mjs --base http://127.0.0.1:8868 --cp http://127.0.0.1:8869 --vars <stack .dev.vars> --out <dir>
// --vars is the stack's own vars file; only its TEST_BYPASS_SECRET is read, never printed. Sessions are minted on the
// control plane's origin (the app's barrier refuses /test/session there). --prefix starts every file name written to
// <out> (default none).
// Each check prints PASS or FAIL with its reason; <out>/journey-results.json holds the table and <out>/journey-network.json
// the API requests per check (method, path, status, body keys, the evaluate result status - never learner text).
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('base', 'http://127.0.0.1:8868'), CP = arg('cp', 'http://127.0.0.1:8869'), OUT = arg('out', 'journey-shots'), VARS = arg('vars', process.env.JOURNEY_VARS), PREFIX = arg('prefix', '');
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('journey-check runs against the local stack only');
if (!VARS) throw Error('--vars <the local stack .dev.vars> is required (e2e/journey-local-stack.md)');
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim();
if (!secret) throw Error(`no TEST_BYPASS_SECRET in ${VARS}`);

const REQUEST = 'I want to learn logistic regression';
const EXPLAIN = 'It squashes a weighted sum through the sigmoid so the output reads as a probability.';
const CANNED = 'A canned answer from journey-check: no model was called.';
const SSE = `event: chunk\ndata: ${JSON.stringify({ text: CANNED })}\n\nevent: done\ndata: {}\n\n`;

const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'journey-learner@example.com', secret }) })).json();
if (!session) throw Error('the control plane minted no session (is the stack up with SMALL_ENV=test?)');
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...init.headers } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${r.status} ${d.error || ''}`);
  return d;
};
const who = await api('/api/apps');
const journeyOf = name => api(`/api/learn/journey?app=${name}&board=main`);
const newCanvas = async title => (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).name;

// ---- results ----
const results = [], network = {};
const record = (id, status, reason) => { results.push({ id, status, reason }); console.log(`${status.padEnd(20)} ${id}: ${reason}`); };
const check = (id, ok, pass, fail = pass) => record(id, ok ? 'PASS' : 'FAIL', ok ? pass : fail);

// ---- the browser ----
const browser = await chromium.launch();
async function learnerPage(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  // What the page showed over time: each tray (mode | prompt) in order, and when the first path entry and the first
  // canvas block appeared (J7: the rail before any block).
  await context.addInitScript(() => {
    const seen = window.__journeySeen = { trays: [], rail: null, block: null }, t0 = performance.now();
    new MutationObserver(() => {
      const tray = document.querySelector('[data-tutor-prompt-tray]');
      const key = tray && `${tray.dataset.mode || 'status'}|${tray.getAttribute('aria-label') || ''}`;
      if (key && seen.trays.at(-1) !== key) seen.trays.push(key);
      if (seen.rail == null && document.querySelector('[data-contents-rail] [data-path-entry]')) seen.rail = performance.now() - t0;
      if (seen.block == null && document.querySelector('[data-block-id]:not([data-chat-block])')) seen.block = performance.now() - t0;
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  // No model call leaves the page, even on a misconfigured stack.
  await context.route('**/api/learn/ask', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: SSE }));
  await context.route('**/api/learn/home-ask', route => route.fulfill({ json: { answer: CANNED, references: [], offer_rabbit_hole: false } }));
  // The Tutor's planner: a keyless stack would still send the context to the provider unauthenticated, so it is answered here.
  await context.route('**/api/learn/tutor/plan', route => route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [{ type: 'respond_text', text: CANNED }] } }));
  await context.route(/\/api\/(learn\/(artifact|voice\/|assess|transcribe|image)|chat)/, route => route.abort());
  const page = await context.newPage();
  const net = network[label] = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (!pathname.startsWith('/api/')) return;
    let body = null; try { body = request.postDataJSON(); } catch { /* not JSON */ }
    const entry = { method: request.method(), path: pathname, status: null, body, result: null };
    net.push(entry);
    // An evaluate reply's result status (settled | uncertain | error | duplicate): the keyless conservative path is visible.
    request.response().then(async response => {
      entry.status = response?.status() ?? null;
      if (pathname === '/api/learn/tutor/evaluate') entry.result = (await response.json().catch(() => null))?.status ?? null;
    }).catch(() => {});
  });
  const calls = (path, method = 'POST') => net.filter(entry => entry.path === path && entry.method === method);
  return { page, net, errors, calls, close: () => context.close() };
}

const shot = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${PREFIX}${name}.png` }); console.log('shot', `${OUT}/${PREFIX}${name}.png`); };
// The dock composer is an <input> (ChatComposer without multiline); a textarea if that ever changes.
const composer = page => page.locator('[data-learn-dock] [data-chat-composer] :is(textarea, input:not([type="file"]))').first();
async function openCanvas(page, name) {
  await page.goto(`${BASE}/apps/${name}?tab=learn`);
  await page.locator('[data-tool-gutter]').waitFor({ timeout: 60000 });
  await composer(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500); // the board GET settles, canvasReady runs
}
const send = async (page, text) => { await composer(page).fill(text); await composer(page).press('Enter'); };
// The canvas as Learn saves it (AdaptiveCanvas, 400 ms after a change), by the main board's storage key.
const blocksOf = (page, name) => page.evaluate(key => { try { return JSON.parse(localStorage.getItem(key) || '{}').blocks || []; } catch { return []; } },
  `small.adaptive-canvas:${who.org}:${who.email}:${name}:ink`);
const domBlocks = page => page.locator('[data-block-id]:not([data-chat-block])').count();
const trayState = page => page.evaluate(() => {
  const t = document.querySelector('[data-tutor-prompt-tray]');
  return t && { mode: t.dataset.mode || null, label: t.getAttribute('aria-label'), busy: !!t.querySelector('[data-tray-busy]'),
    options: [...t.querySelectorAll('[data-tray-option]')].map(b => b.dataset.trayOption) };
});
// The next settled tray: not busy, and a different mode or prompt from `before`.
async function nextTray(page, before, timeout = 30000) {
  await page.waitForFunction(([mode, label]) => {
    const t = document.querySelector('[data-tutor-prompt-tray]');
    if (!t) return mode !== null || label !== null;
    return !t.querySelector('[data-tray-busy]') && ((t.dataset.mode || null) !== mode || t.getAttribute('aria-label') !== label);
  }, [before?.mode ?? null, before?.label ?? null], { timeout });
  return trayState(page);
}
const waitTray = (page, mode, timeout = 30000) => page.locator(`[data-tutor-prompt-tray][data-mode="${mode}"]`).waitFor({ timeout }).then(() => trayState(page));
const seen = page => page.evaluate(() => window.__journeySeen);
const until = async (page, ok, timeout = 10000) => { for (const end = Date.now() + timeout; !ok() && Date.now() < end;) await page.waitForTimeout(250); };
async function waitSection(page, name, sectionId, steps = 3, timeout = 30000) {
  const end = Date.now() + timeout;
  for (;;) {
    const blocks = await blocksOf(page, name);
    const headings = blocks.filter(b => b.type === 'heading' && b.journey_section_id);
    const own = blocks.filter(b => b.journey?.section_id === sectionId);
    if ((headings.length && own.length >= steps) || Date.now() > end) return { blocks, headings, own };
    await page.waitForTimeout(500);
  }
}
// The rail's box, and whether it lies inside the viewport.
const railBox = async page => {
  const box = await page.locator('[data-contents-rail][data-placement="canvas"]').boundingBox();
  const view = page.viewportSize();
  return { box, inside: !!box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width && box.y + box.height <= view.height };
};
// What the rail (or its open list) covers among the given visible elements: their selectors.
const meets = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
async function covered(page, box, selectors) {
  const hits = [];
  for (const selector of selectors) for (const element of await page.locator(selector).all()) {
    const other = await element.isVisible() ? await element.boundingBox() : null;
    if (box && other && meets(box, other)) hits.push(selector);
  }
  return [...new Set(hits)];
}
const panelOpen = page => page.locator('[aria-pressed][aria-label$="the right panel"]').getAttribute('aria-pressed').then(v => v === 'true');
const keys = body => (body && typeof body === 'object' ? Object.keys(body) : []);

// One check group; a throw is that group's FAIL, with a screenshot of where it stopped.
async function group(id, run) {
  const seenErrors = current?.errors.length ?? 0;
  try { await run(); } catch (error) {
    record(id, 'FAIL', `stopped: ${error.message.split('\n')[0]}`);
    const page = current?.page;
    if (page) await page.screenshot({ path: `${OUT}/${id}-stopped.png` }).catch(() => {});
  }
  const errors = current?.errors.slice(seenErrors) ?? [];
  check(`${id} page errors`, !errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
}
let current = null;

// ---- J1-J4: one canvas, one journey, from the request to section 1 on the canvas ----
const flow = current = await learnerPage('J1-J4');
const lr = await newCanvas('Journey check J1-J4');

await group('J1', async () => {
  const { page, calls } = flow;
  await openCanvas(page, lr);
  await send(page, REQUEST);
  await waitTray(page, 'intent_intake');
  await page.waitForTimeout(900);
  check('J1 intake tray', true, 'the tray opens in intent_intake');
  const stored = await blocksOf(page, lr), shown = await domBlocks(page);
  check('J1 no blocks', stored.length === 0 && shown === 0, '0 canvas blocks (storage and DOM)', `${stored.length} stored, ${shown} shown`);
  check('J1 no ask or artifact', !calls('/api/learn/ask').length && !calls('/api/learn/artifact').length, 'no /api/learn/ask or /api/learn/artifact request',
    `${calls('/api/learn/ask').length} ask, ${calls('/api/learn/artifact').length} artifact requests`);
  const hits = await covered(page, await page.locator('[data-tutor-prompt-tray]').boundingBox(), ['[data-learn-dock] [data-chat-composer]']);
  check('J1 tray clear of composer', !hits.length, 'the tray sits above the composer, not over it', 'the tray overlaps the composer');
  await shot(page, 'J1-intake-tray');
});

await group('J2', async () => {
  const { page, calls } = flow;
  let t = await trayState(page);
  for (const option of ['intuition', 'seen', 'guided']) {
    await page.locator(`[data-tray-option="${option}"]`).click();
    t = await nextTray(page, t);
  }
  check('J2 diagnostic tray', t?.mode === 'diagnostic_probe', 'goal, familiarity and depth lead to diagnostic_probe', `tray is ${t?.mode}`);
  // The walker starts mid-ladder (an explain-back), so the mcq comes second: every probe is answered in the order asked.
  // Stored evidence is read back from GET /api/learn/journey after each answer (server evidence, LP1 Task 7/12).
  const stored = async () => (await journeyOf(lr)).journey.evidence?.events ?? [];
  const replied = (entry, timeout = 15000) => until(page, () => !!entry && entry.status != null && (entry.status !== 200 || entry.result != null), timeout);
  const answered = [];
  for (let i = 0; i < 4 && t?.mode === 'diagnostic_probe'; i++) {
    const { journey } = await journeyOf(lr);
    const probe = journey.diagnostic.probes.find(p => p.prompt === t.label);
    if (!probe) throw Error('the open tray matches no stored probe');
    const before = calls('/api/learn/tutor/evaluate').length, eventsBefore = (await stored()).length;
    answered.push(probe.kind);
    if (probe.kind === 'explain_back') {
      const asks = calls('/api/learn/ask').length, plans = calls('/api/learn/tutor/plan').length;
      await send(page, EXPLAIN);
      await until(page, () => calls('/api/learn/tutor/evaluate').length > before || calls('/api/learn/ask').length > asks);
      const sent = calls('/api/learn/tutor/evaluate').slice(before), entry = sent.at(-1), body = entry?.body;
      await replied(entry);
      // The real routing: useTutor.turn runs the resolver first; rules 1-4 leave a free-text answer to rule 5 (resolve,
      // the fixture's tray_answer), and the Tutor's plan:false probe turn posts evaluate with the probe it answers and its
      // turn_id (the Tutor's own turn: proof the words went through useTutor, not the journey-only path).
      check('J2 explain-back posts evaluate', !!body?.journey_id && Array.isArray(body?.claims) && body.claims.length > 0 && body?.probe_id === probe.id
        && typeof body?.turn_id === 'string' && !!body.turn_id && calls('/api/learn/ask').length === asks && calls('/api/learn/tutor/plan').length === plans,
        'the typed explain-back posts evaluate with journey_id, claims, probe_id and the Tutor turn_id (plan:false: no planner request), and nothing goes to /api/learn/ask',
        `${sent.length} evaluate request(s) (body keys ${keys(body).join(',') || 'none'}, probe ${body?.probe_id === probe.id ? 'matches' : 'differs'}), ${calls('/api/learn/ask').length - asks} ask, ${calls('/api/learn/tutor/plan').length - plans} plan request(s)`);
      // No JEV key: the free-text rung answers status 'error' without a call, and nothing settled is stored (§3.3).
      const after = (await stored()).length;
      check('J2 explain-back JEV error stores nothing', entry?.status === 200 && (entry.result === 'error' ? after === eventsBefore : after > eventsBefore),
        entry?.result === 'error' ? `evaluate answered status error (no JEV key: the conservative path); stored events stay ${after}` : `evaluate answered ${entry?.result}; ${after} stored event(s)`,
        `evaluate HTTP ${entry?.status}, result ${entry?.result}, stored events ${eventsBefore} -> ${after}`);
    } else {
      if (probe.kind === 'mcq') await shot(page, 'J2-mcq-probe');
      await page.locator('[data-tray-option="a"]').click();
      await until(page, () => calls('/api/learn/tutor/evaluate').length > before);
      const sent = calls('/api/learn/tutor/evaluate').slice(before), entry = sent.at(-1), body = entry?.body;
      await replied(entry);
      check(`J2 ${probe.kind} posts evaluate`, !!body?.journey_id && body?.probe_id === probe.id, `the ${probe.kind} option posts evaluate with journey_id and probe_id`, `body keys ${keys(body).join(',') || 'none'}`);
      // The option is graded from the probe's server-only key: settled, stored once, tagged with the probe.
      const events = await stored(), own = events.filter(e => e.ref?.probe_id === probe.id);
      check(`J2 ${probe.kind} stored evidence`, entry?.status === 200 && entry.result === 'settled' && own.length >= 1 && own.length === probe.claims.length && events.length === eventsBefore + own.length,
        `evaluate settled; GET shows ${own.length} event(s) tagged ${probe.id} (${events.length} stored in all)`,
        `evaluate HTTP ${entry?.status}, result ${entry?.result}; ${own.length} event(s) tagged ${probe.id} for ${probe.claims.length} claim(s); stored ${eventsBefore} -> ${events.length}`);
    }
    const was = t;
    t = await nextTray(page, was);
    check(`J2 ${probe.kind} advances`, t?.label !== was.label || t?.mode !== was.mode, `the UI moves on to ${t?.mode === 'diagnostic_probe' ? 'the next probe' : t?.mode}`, 'the tray did not move');
  }
  // Both kinds the brief names were answered, whatever order the fixture asks them in: J2 never passes on a skipped kind.
  check('J2 explain-back and mcq answered', answered.includes('explain_back') && answered.includes('mcq'), `probes answered in order: ${answered.join(', ')}`,
    `probes answered: ${answered.join(', ') || 'none'} (explain_back and mcq are both required)`);
  const events = await stored(), mcq = (await journeyOf(lr)).journey.diagnostic.probes.find(p => p.kind === 'mcq');
  check('J2 stored event', events.length >= 1 && events.some(e => e.ref?.probe_id === mcq?.id) && events.every(e => !!e.ref?.probe_id),
    `GET /api/learn/journey shows ${events.length} stored event(s), the mcq's among them, each tagged with its probe`,
    `${events.length} stored event(s); mcq tagged ${events.some(e => e.ref?.probe_id === mcq?.id)}; untagged ${events.filter(e => !e.ref?.probe_id).length}`);
  check('J2 no ask', calls('/api/learn/ask').length === 0, 'no /api/learn/ask request on the journey canvas', `${calls('/api/learn/ask').length} ask requests`);
});

await group('J3', async () => {
  const { page, calls } = flow;
  await waitTray(page, 'path_preview');
  const entries = await page.locator('[data-contents-rail] [data-path-entry]').evaluateAll(list => list.map(li => li.dataset.status));
  check('J3 path tray and rail', entries.length === 8 && entries.every(s => s === 'upcoming'), 'path_preview tray, 8 rail entries, all upcoming', `${entries.length} entries: ${entries.join(',')}`);
  const stored = await blocksOf(page, lr);
  check('J3 no blocks', stored.length === 0 && await domBlocks(page) === 0, '0 canvas blocks', `${stored.length} blocks`);
  // A question during path review is the Tutor's (resolver: unrelated_question), answered in the chat sheet with no card
  // before acceptance, so the sheet is open for the geometry below: the case where the pinned list once covered it.
  const asks = calls('/api/learn/ask').length, plans = calls('/api/learn/tutor/plan').length;
  await send(page, 'What is a sigmoid?');
  await page.getByText(CANNED).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const plan = calls('/api/learn/tutor/plan').at(-1)?.body;
  check('J3 setup question to the Tutor, in the sheet', calls('/api/learn/ask').length === asks && calls('/api/learn/tutor/plan').length === plans + 1 && plan?.context?.journey_context != null
    && await page.locator('[data-chat-sheet]').isVisible() && (await trayState(page))?.mode === 'path_preview' && (await blocksOf(page, lr)).length === 0,
    'a question during path review is one Tutor plan request with journey_context, answered in the chat sheet; the path tray stays and no card is drawn',
    `${calls('/api/learn/ask').length - asks} ask, ${calls('/api/learn/tutor/plan').length - plans} plan request(s) (journey_context ${plan?.context?.journey_context != null}); sheet, tray or canvas not as expected`);
  // The pinned list never meets the composer, the tray, the sheet, the Rabbit Hole navigator or the minimap: two
  // viewports, right panel open and closed. A list with no room stays closed (ContentsRail flyoutRect), which passes.
  // The navigator is what [data-dive-gutter] (or [data-gutter-top]) draws, its children: the gutter itself is an 84 px
  // full-height layout column whose empty part also holds the rail strip.
  for (const [width, height] of [[1440, 1000], [1720, 1100]]) for (const open of [true, false]) {
    await page.setViewportSize({ width, height });
    if (await panelOpen(page) !== open) await page.getByRole('button', { name: open ? 'Show the right panel' : 'Hide the right panel' }).click();
    await page.waitForTimeout(900);
    const { box, inside } = await railBox(page);
    const nav = page.locator('nav[aria-label="Learning path"]'), list = await nav.isVisible() ? await nav.boundingBox() : null;
    const hits = await covered(page, list, ['[data-learn-dock] [data-chat-composer]', '[data-tutor-prompt-tray]', '[data-chat-sheet]', '[data-dive-gutter] > *', '[data-gutter-top] > *', '[data-canvas-minimap]', '[data-tool-gutter]', '[data-block-id]']);
    const at = `${width}x${height} panel ${open ? 'open' : 'closed'}`, size = list ? `list ${Math.round(list.width)}x${Math.round(list.height)}` : 'list closed (no room)';
    check(`J3 geometry ${at}`, inside && !hits.length, `rail inside the viewport, ${size}, covering nothing`, `rail ${inside ? 'inside' : 'outside'} the viewport, ${size}, covers ${hits.join(', ') || 'nothing'}`);
    // Narrow side room (1440, panel open) on this empty canvas: the list takes the free canvas above the composer, full width.
    if (width === 1440 && open) check('J3 pinned list width 1440 panel open', !!list && list.width >= 240 && !hits.length, `the pinned list is ${size.slice(5)} (at least 240 px wide) and meets nothing`,
      `${size}${hits.length ? `, covers ${hits.join(', ')}` : ''}`);
    await shot(page, width === 1440 && open ? 'J3-path-rail-panel-open' : `J3-geometry-${width}-${open ? 'open' : 'closed'}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Collapse chat' }).click(); // the learner closes the sheet before starting
});

await group('J4', async () => {
  const { page, calls } = flow;
  // section_materialized is posted only after the board save (LP1 Task 15): hold that one POST, read the GET while it is
  // held (section 1 still 'planning'), then let it through.
  let held = null;
  const hold = async route => {
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    if (body?.action === 'section_materialized' && !held) {
      const { journey, path } = await journeyOf(lr);
      held = { plan: journey.section_plan?.generation_state ?? null, s1: path.sections.find(s => s.id === 's1')?.generation_state, saved: (await blocksOf(page, lr)).length };
    }
    await route.continue();
  };
  await page.route('**/api/learn/journey', hold);
  await page.locator('[data-tray-option="start"]').click();
  const { blocks, headings, own } = await waitSection(page, lr, 's1');
  await until(page, () => !!held && calls('/api/learn/journey').some(e => e.body?.action === 'section_materialized' && e.status != null), 15000);
  await page.unroute('**/api/learn/journey', hold);
  await page.waitForTimeout(800);
  check('J4 planning until saved', held?.s1 === 'planning' && held.plan !== 'generated' && held.saved >= 4,
    `while section_materialized was in flight this browser's copy was saved (${held?.saved} blocks; private board, no server board PUT) and the GET read section 1 planning`,
    held ? `in flight: s1 ${held.s1}, section_plan ${held.plan}, ${held.saved} saved blocks` : 'no section_materialized request');
  const explanations = own.filter(b => b.type === 'explanation');
  check('J4 one heading', headings.length === 1 && headings[0].journey_section_id === 's1', 'exactly one heading, journey_section_id s1', `headings for ${headings.map(h => h.journey_section_id).join(',') || 'none'}`);
  check('J4 three explanations', explanations.length === 3 && own.length === 3, "section 1's 3 explanation blocks", `${own.length} s1 blocks (${explanations.length} explanations) of ${blocks.length}`);
  const { journey, path } = await journeyOf(lr);
  const s1 = path.sections.find(s => s.id === 's1'), rest = path.sections.filter(s => s.id !== 's1');
  check('J4 section 1 current', s1?.status === 'current' && journey.active_section_id === 's1' && await page.locator('[data-path-entry="s1"][data-status="current"]').count() === 1,
    'section 1 is current (route and rail)', `s1 ${s1?.status}, active ${journey.active_section_id}`);
  check('J4 section 1 generated', s1?.generation_state === 'generated' && journey.section_plan?.generation_state === 'generated' && !!headings[0]?.id && s1?.heading_block_id === headings[0].id,
    'after the save and section_materialized the GET reads section 1 generated, with its heading', `s1 ${s1?.generation_state}, section_plan ${journey.section_plan?.generation_state}, heading ${s1?.heading_block_id ? 'set' : 'none'}`);
  check('J4 later sections not generated', rest.length === 7 && rest.every(s => s.generation_state === 'not_generated' && !s.heading_block_id) && !blocks.some(b => b.journey_section_id && b.journey_section_id !== 's1'),
    'sections 2-8 have no heading (route or canvas) and are not_generated', rest.map(s => `${s.id}:${s.generation_state}${s.heading_block_id ? '+heading' : ''}`).join(','));
  check('J4 one section plan', journey.section_plan?.section_id === 's1', 'the one section plan is for s1', `section_plan ${journey.section_plan?.section_id}`);
  check('J4 heading recorded', !!headings[0]?.id && journey.section_plan?.heading_block_id === headings[0].id, 'section_materialized recorded the heading', `recorded ${journey.section_plan?.heading_block_id ? 'another id' : 'nothing'}`);
  check('J4 no artifact', !calls('/api/learn/artifact').length, 'text steps make no artifact request', `${calls('/api/learn/artifact').length} artifact requests`);
  const hits = await covered(page, (await railBox(page)).box, ['[data-block-id]', '[data-tutor-prompt-tray]', '[data-learn-dock] [data-chat-composer]']);
  check('J4 rail clear of cards', !hits.length, 'the rail covers no card, tray or composer', `the rail covers ${hits.join(', ')}`);
  check('J4 no ask on the journey canvas', !calls('/api/learn/ask').length, 'J1-J4 made no /api/learn/ask request', `${calls('/api/learn/ask').length} ask requests`);
  await shot(page, 'J4-section-1');
});
await flow.close();

// ---- J5: a question on a blank canvas is the Learn chat's: no tray, one ask ----
current = await learnerPage('J5');
await group('J5', async () => {
  const { page, calls } = current, name = await newCanvas('Journey check J5');
  await openCanvas(page, name);
  await send(page, 'What is logistic regression?');
  await page.getByText(CANNED).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const { journey } = await journeyOf(name);
  check('J5 no tray', await page.locator('[data-tutor-prompt-tray]').count() === 0 && !journey, 'no tray and no journey', `tray ${await page.locator('[data-tutor-prompt-tray]').count()}, journey ${!!journey}`);
  check('J5 one ask', calls('/api/learn/ask').length === 1, 'exactly one /api/learn/ask (canned reply)', `${calls('/api/learn/ask').length} ask requests`);
});
await current.close();

// ---- J6: a quick overview asks at most one question and drafts at most 3 sections ----
current = await learnerPage('J6');
await group('J6', async () => {
  const { page } = current, name = await newCanvas('Journey check J6');
  await openCanvas(page, name);
  await send(page, 'Give me a 10-minute visual overview of logistic regression');
  let t = await nextTray(page, null);
  for (let i = 0; i < 4 && t?.mode === 'intent_intake'; i++) { await page.locator(`[data-tray-option="${t.options[0]}"]`).click(); t = await nextTray(page, t); }
  const intake = new Set((await seen(page)).trays.filter(k => k.startsWith('intent_intake|'))).size;
  const entries = await page.locator('[data-contents-rail] [data-path-entry]').count();
  check('J6 at most one question', intake <= 1, `${intake} intake question(s)`);
  check('J6 no ask', !current.calls('/api/learn/ask').length, 'no /api/learn/ask request', `${current.calls('/api/learn/ask').length} ask requests`);
  check('J6 at most 3 sections', t?.mode === 'path_preview' && entries >= 1 && entries <= 3, `path_preview with ${entries} rail entries`, `tray ${t?.mode}, ${entries} entries`);
});
await current.close();

// ---- J7: skip setup: the rail shows the path before any block, then section 1 is drawn ----
current = await learnerPage('J7');
await group('J7', async () => {
  const { page } = current, name = await newCanvas('Journey check J7');
  await openCanvas(page, name);
  await send(page, 'Teach me logistic regression, skip setup and just start');
  const { headings, own } = await waitSection(page, name, 's1');
  const s = await seen(page);
  check('J7 no setup trays', !s.trays.some(k => /^(intent_intake|diagnostic_probe|path_preview)\|/.test(k)), 'no intake, diagnostic or path tray', `trays: ${s.trays.map(k => k.split('|')[0]).join(',')}`);
  check('J7 rail before blocks', s.rail != null && s.block != null && s.rail <= s.block, `the rail showed the path ${Math.round(s.block - s.rail)} ms before the first block`, `rail at ${s.rail}, first block at ${s.block}`);
  check('J7 section 1 drawn', headings.length === 1 && headings[0].journey_section_id === 's1' && own.length === 3, 'section 1: one heading and 3 steps', `${headings.length} headings, ${own.length} s1 blocks`);
  const hits = await covered(page, (await railBox(page)).box, ['[data-block-id]', '[data-learn-dock] [data-chat-composer]']);
  check('J7 rail clear of cards', !hits.length, 'the rail covers no card or composer', `the rail covers ${hits.join(', ')}`);
  check('J7 no ask', !current.calls('/api/learn/ask').length, 'no /api/learn/ask request', `${current.calls('/api/learn/ask').length} ask requests`);
  await shot(page, 'J7-fast-start');
});
await current.close();

// ---- J8: Home's Agent Bar starts the journey and opens Learn on its tray ----
current = await learnerPage('J8');
await group('J8', async () => {
  const { page, calls } = current;
  await page.goto(`${BASE}/apps`);
  await page.waitForTimeout(3000);
  const bar = page.locator('textarea').last();
  await bar.fill(REQUEST);
  await bar.press('Enter');
  await page.waitForURL(url => /^\/apps\/canvas-[a-f0-9]{8}$/.test(url.pathname) && url.searchParams.get('tab') === 'learn', { timeout: 30000 });
  const name = new URL(page.url()).pathname.split('/').pop();
  await waitTray(page, 'intent_intake');
  await page.waitForTimeout(1000);
  const title = await page.getByRole('textbox', { name: 'Canvas title' }).inputValue().catch(() => null);
  const { journey } = await journeyOf(name);
  check('J8 Learn with the tray', true, 'arrives on Learn with the intake tray open');
  check('J8 canvas title', title === 'Logistic regression', 'the canvas is titled Logistic regression', `title is ${JSON.stringify(title)}`);
  check('J8 exact request', journey?.request?.raw_user_message === REQUEST, 'journey.request.raw_user_message is the typed request', 'raw_user_message differs from the typed request');
  check('J8 no home-ask or ask', !calls('/api/learn/home-ask').length && !calls('/api/learn/ask').length, 'Home asked no model (no /api/learn/home-ask) and Learn no /api/learn/ask',
    `${calls('/api/learn/home-ask').length} home-ask, ${calls('/api/learn/ask').length} ask requests`);
  await shot(page, 'J8-home-to-learn');
});
await current.close();
await browser.close();

// ---- the table ----
const groupStatus = id => {
  const mine = results.filter(r => r.id === id || r.id.startsWith(`${id} `));
  return mine.some(r => r.status === 'FAIL') ? 'FAIL' : mine.length ? 'PASS' : 'NOT RUN';
};
const table = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8'].map(id => ({ id, status: groupStatus(id) }));
writeFileSync(`${OUT}/${PREFIX}journey-results.json`, JSON.stringify({ table, checks: results }, null, 2));
writeFileSync(`${OUT}/${PREFIX}journey-network.json`, JSON.stringify(Object.fromEntries(Object.entries(network).map(([label, list]) => [label, list.map(({ method, path, status, body, result }) => ({ method, path, status, keys: keys(body), action: body?.action, ...(result ? { result } : {}) }))])), null, 2));
console.log('\n' + table.map(row => `${row.id}  ${row.status}`).join('\n'));
process.exitCode = table.some(row => row.status === 'FAIL') ? 1 : 0;
