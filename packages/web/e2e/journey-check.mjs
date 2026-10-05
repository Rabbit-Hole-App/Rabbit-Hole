// Adaptive Learning Path LP1 acceptance J1-J8 (docs/features/adaptive-learning-path-v1-architecture.md §16), in a real
// browser against the KEYLESS local stack only (e2e/journey-local-stack.md): no model key is bound, the journey planners
// run their fixtures (JOURNEY_MODEL_STUB=fixtures), and every request that could reach a model from the page is answered
// here (/api/learn/ask a canned SSE reply, /api/learn/home-ask a canned answer; artifact, voice, assess, image refused).
//   node e2e/journey-check.mjs --base http://127.0.0.1:8868 --cp http://127.0.0.1:8869 --vars <stack .dev.vars> --out <dir>
// --vars is the stack's own vars file; only its TEST_BYPASS_SECRET is read, never printed. Sessions are minted on the
// control plane's origin (the app's barrier refuses /test/session there).
// Each check prints PASS, FAIL or BLOCKED-UNTIL-TASK-7 with its reason; <out>/journey-results.json holds the table and
// <out>/journey-network.json the API requests per check (method, path, status, body keys - never learner text).
// Blocked is decided by what the stack answers, not by a flag: while /api/learn/tutor/evaluate refuses the journey
// contract (400, until Task 7), the checks that need stored evidence say so instead of failing.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const BASE = arg('base', 'http://127.0.0.1:8868'), CP = arg('cp', 'http://127.0.0.1:8869'), OUT = arg('out', 'journey-shots'), VARS = arg('vars', process.env.JOURNEY_VARS);
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
  await context.route(/\/api\/(learn\/(artifact|voice\/|assess|transcribe|image)|chat)/, route => route.abort());
  const page = await context.newPage();
  const net = network[label] = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (!pathname.startsWith('/api/')) return;
    let body = null; try { body = request.postDataJSON(); } catch { /* not JSON */ }
    const entry = { method: request.method(), path: pathname, status: null, body };
    net.push(entry);
    request.response().then(response => { entry.status = response?.status() ?? null; }).catch(() => {});
  });
  const calls = (path, method = 'POST') => net.filter(entry => entry.path === path && entry.method === method);
  return { page, net, errors, calls, close: () => context.close() };
}

const shot = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', `${OUT}/${name}.png`); };
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
let evaluateRefused = false;

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
  for (let i = 0; i < 4 && t?.mode === 'diagnostic_probe'; i++) {
    const { journey } = await journeyOf(lr);
    const probe = journey.diagnostic.probes.find(p => p.prompt === t.label);
    if (!probe) throw Error('the open tray matches no stored probe');
    const before = calls('/api/learn/tutor/evaluate').length;
    if (probe.kind === 'explain_back') {
      const asks = calls('/api/learn/ask').length;
      await send(page, EXPLAIN);
      await until(page, () => calls('/api/learn/tutor/evaluate').length > before || calls('/api/learn/ask').length > asks);
      await page.waitForTimeout(1500);
      // The real routing: rules 1-4 leave a free-text answer to rule 5 (resolve), whose answer here is the fixture's.
      const sent = calls('/api/learn/tutor/evaluate').slice(before), body = sent.at(-1)?.body;
      check('J2 explain-back posts evaluate', !!body?.journey_id && Array.isArray(body?.claims) && body.claims.length > 0 && calls('/api/learn/ask').length === asks,
        'the typed explain-back posts evaluate with journey_id and claims, and nothing goes to /api/learn/ask',
        `${sent.length} evaluate request(s) (body keys ${keys(body).join(',') || 'none'}), ${calls('/api/learn/ask').length - asks} /api/learn/ask request(s) took the words`);
      if (sent.at(-1)?.status === 400) { evaluateRefused = true; record('J2 explain-back JEV error', 'BLOCKED-UNTIL-TASK-7', 'evaluate answered 400: the journey evaluate path arrives in Task 7'); }
      else if (sent.length) check('J2 explain-back JEV error', sent.at(-1).status === 200, 'evaluate answered (JEV error is the keyless conservative path)', `evaluate HTTP ${sent.at(-1).status}`);
    } else {
      if (probe.kind === 'mcq') await shot(page, 'J2-mcq-probe');
      await page.locator('[data-tray-option="a"]').click();
      await page.waitForTimeout(500);
      const sent = calls('/api/learn/tutor/evaluate').slice(before), body = sent.at(-1)?.body;
      check(`J2 ${probe.kind} posts evaluate`, !!body?.journey_id && body?.probe_id === probe.id, `the ${probe.kind} option posts evaluate with journey_id and probe_id`, `body keys ${keys(body).join(',') || 'none'}`);
      if (sent.at(-1)?.status === 400) evaluateRefused = true;
    }
    const was = t;
    t = await nextTray(page, was);
    check(`J2 ${probe.kind} advances`, t?.label !== was.label || t?.mode !== was.mode, `the UI moves on to ${t?.mode === 'diagnostic_probe' ? 'the next probe' : t?.mode}`, 'the tray did not move');
  }
  const { journey } = await journeyOf(lr), events = journey.evidence?.events?.length ?? 0;
  if (evaluateRefused) record('J2 stored event', 'BLOCKED-UNTIL-TASK-7', `evaluate answered 400 (journey contract arrives in Task 7); ${events} stored events`);
  else check('J2 stored event', events >= 1, `${events} stored event(s)`, 'no stored event');
});

await group('J3', async () => {
  const { page, calls } = flow;
  await waitTray(page, 'path_preview');
  const entries = await page.locator('[data-contents-rail] [data-path-entry]').evaluateAll(list => list.map(li => li.dataset.status));
  check('J3 path tray and rail', entries.length === 8 && entries.every(s => s === 'upcoming'), 'path_preview tray, 8 rail entries, all upcoming', `${entries.length} entries: ${entries.join(',')}`);
  const stored = await blocksOf(page, lr);
  check('J3 no blocks', stored.length === 0 && await domBlocks(page) === 0, '0 canvas blocks', `${stored.length} blocks`);
  // A question during path review is answered in the chat sheet (no card before acceptance), so the sheet is open for
  // the geometry below: the case where the pinned list once covered it.
  const asks = calls('/api/learn/ask').length;
  await send(page, 'What is a sigmoid?');
  await page.getByText(CANNED).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  check('J3 setup question in the sheet', calls('/api/learn/ask').length === asks + 1 && await page.locator('[data-chat-sheet]').isVisible() && (await trayState(page))?.mode === 'path_preview',
    'a question during path review is answered in the chat sheet; the path tray stays', 'the question did not land in the sheet beside the path tray');
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
    const hits = await covered(page, list, ['[data-learn-dock] [data-chat-composer]', '[data-tutor-prompt-tray]', '[data-chat-sheet]', '[data-dive-gutter] > *', '[data-gutter-top] > *', '[data-canvas-minimap]']);
    const at = `${width}x${height} panel ${open ? 'open' : 'closed'}`, size = list ? `list ${Math.round(list.width)}x${Math.round(list.height)}` : 'list closed (no room)';
    check(`J3 geometry ${at}`, inside && !hits.length, `rail inside the viewport, ${size}, covering nothing`, `rail ${inside ? 'inside' : 'outside'} the viewport, ${size}, covers ${hits.join(', ') || 'nothing'}`);
    await shot(page, width === 1440 && open ? 'J3-path-rail-panel-open' : `J3-geometry-${width}-${open ? 'open' : 'closed'}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Collapse chat' }).click(); // the learner closes the sheet before starting
});

await group('J4', async () => {
  const { page, calls } = flow;
  await page.locator('[data-tray-option="start"]').click();
  const { blocks, headings, own } = await waitSection(page, lr, 's1');
  await page.waitForTimeout(1500); // section_materialized
  const explanations = own.filter(b => b.type === 'explanation');
  check('J4 one heading', headings.length === 1 && headings[0].journey_section_id === 's1', 'exactly one heading, journey_section_id s1', `headings for ${headings.map(h => h.journey_section_id).join(',') || 'none'}`);
  check('J4 three explanations', explanations.length === 3 && own.length === 3, "section 1's 3 explanation blocks", `${own.length} s1 blocks (${explanations.length} explanations) of ${blocks.length}`);
  const { journey, path } = await journeyOf(lr);
  const s1 = path.sections.find(s => s.id === 's1'), rest = path.sections.filter(s => s.id !== 's1');
  check('J4 section 1 current', s1?.status === 'current' && journey.active_section_id === 's1' && await page.locator('[data-path-entry="s1"][data-status="current"]').count() === 1,
    'section 1 is current (route and rail)', `s1 ${s1?.status}, active ${journey.active_section_id}`);
  check('J4 later sections not generated', rest.length === 7 && rest.every(s => s.generation_state === 'not_generated') && !blocks.some(b => b.journey_section_id && b.journey_section_id !== 's1'),
    'sections 2-8 have no heading and are not_generated', rest.map(s => `${s.id}:${s.generation_state}`).join(','));
  check('J4 one section plan', journey.section_plan?.section_id === 's1', 'the one section plan is for s1', `section_plan ${journey.section_plan?.section_id}`);
  check('J4 heading recorded', journey.section_plan?.heading_block_id === headings[0]?.id, 'section_materialized recorded the heading', `recorded ${journey.section_plan?.heading_block_id ? 'another id' : 'nothing'}`);
  check('J4 no artifact', !calls('/api/learn/artifact').length, 'text steps make no artifact request', `${calls('/api/learn/artifact').length} artifact requests`);
  const hits = await covered(page, (await railBox(page)).box, ['[data-block-id]', '[data-tutor-prompt-tray]', '[data-learn-dock] [data-chat-composer]']);
  check('J4 rail clear of cards', !hits.length, 'the rail covers no card, tray or composer', `the rail covers ${hits.join(', ')}`);
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
  check('J8 no home-ask', !calls('/api/learn/home-ask').length, 'Home asked no model (no /api/learn/home-ask)', `${calls('/api/learn/home-ask').length} home-ask requests`);
  await shot(page, 'J8-home-to-learn');
});
await current.close();
await browser.close();

// ---- the table ----
const groupStatus = id => {
  const mine = results.filter(r => r.id === id || r.id.startsWith(`${id} `));
  return mine.some(r => r.status === 'FAIL') ? 'FAIL' : mine.find(r => r.status.startsWith('BLOCKED'))?.status || (mine.length ? 'PASS' : 'NOT RUN');
};
const table = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8'].map(id => ({ id, status: groupStatus(id) }));
writeFileSync(`${OUT}/journey-results.json`, JSON.stringify({ table, checks: results }, null, 2));
writeFileSync(`${OUT}/journey-network.json`, JSON.stringify(Object.fromEntries(Object.entries(network).map(([label, list]) => [label, list.map(({ method, path, status, body }) => ({ method, path, status, keys: keys(body), action: body?.action }))])), null, 2));
console.log('\n' + table.map(row => `${row.id}  ${row.status}`).join('\n'));
process.exitCode = table.some(row => row.status === 'FAIL') ? 1 : 0;
