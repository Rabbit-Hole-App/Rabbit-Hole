// Text card height (FX-EB-10, owner 2026-10-30: a Challenge resized tall showed its question and controls in the top half and a
// large blank area below). A text card (BLOCK_TYPES fitContent: Challenge, Explanation, Quiz, Flashcards) is never taller than its
// content: a saved or dragged height is only a ceiling (card-layout.js fitFrame), and the corner handle never stores more than the
// content needs (naturalHeight). Against the LOCAL stack only, on the dev-flag build the Explain-back checks use (ExplainBackService
// on). The board is seeded in this browser's copy (no Insert menu labels). The Explain-back attempt routes are stubbed with one
// contract-valid reviewed attempt (validated below, as explain-back-sketch-check does); every model-capable non-GET route is
// aborted and counted. "Blank" is the space between the last thing in a card's body and the card's bottom edge, beyond the body's
// own padding, in layout px (the camera's zoom divided out).
// Owner rule 2026-10-21: Claude does not run browser checks; CI runs this one (runner fork). `--self-test` checks only the stub
// review against the contract (no stack, no browser).
// Prints `ok <label>` per step, then `N/total checks passed`; exits 1 on a failure.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<cp .dev.vars>] node e2e/text-card-height-check.mjs [shotsDir]
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validateExplainBackReview } from '../src/explain-back-contract.js';
import { review as fixtureReview } from '../src/explain-back-contract.fixtures.mjs';

// One reviewed, typed attempt on the Explain-back card: its Tutor feedback is longer than its answer, so switching the tabs grows
// and shrinks the card. The EB-01 fixture review renamed to the criteria bind returns (explain-back-sketch-check stubReview).
const ANSWER = { v: 1, kind: 'explain_back', text: 'The id picks a row of the embedding table, then the blocks mix the vectors.', voice: [], resources: [], assistance: [] };
const base = fixtureReview(), cites = [{ evidenceId: 'text', locator: { start: 0, end: 6 } }];
const REVIEW = {
  ...base, attemptId: 'at_1', assessmentId: 'as_1',
  judgments: [{ ...base.judgments[0], criterionId: 'c_row', citations: cites }, { ...base.judgments[1], criterionId: 'c_position', citations: [] }],
  coverage: [{ evidenceId: 'text', status: 'read' }],
  feedback: {
    strengths: { text: 'You say the id picks a row of the embedding table, and that the transformer blocks mix the vectors.', citations: cites },
    revisit: { text: 'What adds the position? Without it the model could not tell the first token from the last one in the context.', citations: [] },
    next: { text: 'Say what the LM head does with the final vector, and why there is one score per vocabulary token.', citations: [] },
  },
  rating: { ...base.rating, criteria: [{ ...base.rating.criteria[0], criterionId: 'c_row' }, { ...base.rating.criteria[1], criterionId: 'c_position' }] },
};
const valid = validateExplainBackReview(REVIEW, ANSWER);
if (!valid.ok) throw Error(`stub review is not contract-valid: ${valid.errors.join('; ')}`);
if (process.argv.includes('--self-test')) { console.log('stub review is contract-valid'); process.exit(0); }

const { chromium } = await import('@playwright/test');
const total = 8; // the number of check() steps below; keep it equal
const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('text-card-height-check runs against the local stack only');
const SHOTS = process.argv[2] || 'text-card-height-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `text-height-${run}@example.com`, secret }) })).json();
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } })).json();

const PROMPT = 'nanoGPT receives token IDs, plain integers like `42`. What has to happen between these integers and the next-token predictions the model makes at the end of its forward pass? Name each step and what it does to the vectors.';
const BLOCKS = [
  // The owner's screenshot case: a Challenge saved 1000 px tall before this fix.
  { id: 'ch', type: 'challenge', dx: 0, dy: 0, w: 440, h: 1000, prompt: PROMPT, hint: 'Commit a guess before we look.', expects: ['embedding lookup'], reveal: '', answer: null },
  { id: 'ex', type: 'explanation', dx: 0, dy: 0, title: 'An id is an index, not a meaning', body: 'Token ids are positions in the vocabulary, nothing more.',
    more: [{ label: 'Worked example', text: 'Token id 42 selects row 42 of `wte`. Change the id to 43 and a completely different row comes out: the vectors are not ordered by id. '.repeat(3) }] },
  // The Explain-back card, saved 1000 px tall too, with one reviewed attempt (the stubbed store).
  { id: 'eb', type: 'challenge', mode: 'explain_back', dx: 0, dy: 0, w: 440, h: 1000, prompt: 'In your own words: what happens between token id `2` entering nanoGPT and the next-token scores?', hint: 'Two or three sentences.', expects: ['the id selects a row'], reveal: '', answer: null },
  // A working surface: its frame is the learner's, not its content's.
  { id: 'fl', type: 'flow', dx: 0, dy: 0, title: 'Where a token goes', spec: { direction: 'DOWN', nodes: [{ id: 'a', label: 'token ids', tone: 'input' }, { id: 'b', label: 'logits', tone: 'output' }], edges: [{ source: 'a', target: 'b' }] } },
];
const LINKS = [{ id: 'k', from: 'ch', fromSide: 'bottom', to: 'ex', toSide: 'top', color: '#37352f', route: 'straight', head: true }];
const STATE = { strokes: [], shapes: [], items: [], links: LINKS, groups: [], areas: [], exchanges: [], blocks: BLOCKS };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Text card height ${run}` }) });
const catalog = await api('/api/apps');
const INK = `small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`;

const model = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|artifact|assess|grade|home-ask|image|inline\/|journey|scene|transcribe|tts|voice\/|tutor\/|dive|explore|next-steps|selection|plan|course))/;
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const drafts = new Map();
const router = route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE) return route.abort();
  // The durable attempt store (learn-attempt-routes.js), read-only here: bind, eb's one reviewed attempt, no server draft.
  if (url.pathname.startsWith('/api/learn/tutor/attempts')) {
    const path = url.pathname.replace(/^\/api\/learn\/tutor\/attempts/, '');
    if (request.method() === 'POST' && path === '/bind') {
      const { cardId } = JSON.parse(request.postData());
      return json(route, 200, { goalId: 'goal_eb', activityId: `act_${cardId}`, activityRevision: 1, criterionRefs: ['c_row@1', 'c_position@1'], rubricVersion: 'r1' });
    }
    if (request.method() === 'GET' && path === '') return json(route, 200, { attempts: url.searchParams.get('cardId') === 'eb' ? [{ attemptId: 'at_1' }] : [] });
    if (request.method() === 'GET' && path === '/at_1') return json(route, 200, { attempt: { attemptId: 'at_1', submittedContent: ANSWER }, assessment: { assessmentId: 'as_1', status: 'completed', provenance: { review: REVIEW } } });
    // The server draft (explain-back-drafts.js), as explain-back-sketch-check keeps it: one per card, its revision counted.
    if (path === '/drafts') {
      if (request.method() === 'GET') return json(route, 200, { draft: drafts.get(url.searchParams.get('cardId')) || null });
      const { cardId, answer } = JSON.parse(request.postData()), revision = (drafts.get(cardId)?.revision || 0) + 1;
      if (answer === null) { drafts.delete(cardId); return json(route, 200, { draft: null }); }
      drafts.set(cardId, { cardId, revision, answer, updatedAt: new Date().toISOString() });
      return json(route, 200, { draft: drafts.get(cardId) });
    }
    model.push(`${request.method()} ${url.pathname}`);
    return json(route, 404, { error: 'unknown_attempt' });
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && MODEL.test(url.pathname)) { model.push(`${request.method()} ${url.pathname}`); return route.abort(); }
  return route.fallback();
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// Seeded once per tab (sessionStorage survives a reload), as study-resize-persist-check seeds it.
await context.addInitScript(([key, seed]) => { try { if (!sessionStorage.getItem('seeded') && !localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(seed)); sessionStorage.setItem('seeded', '1'); } } catch { /* a sandboxed frame */ } }, [INK, STATE]);
await context.route('**/*', router);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message.slice(0, 200)));

const results = [], failures = [];
const check = async (label, fn) => {
  try { await fn(); results.push(label); console.log(`ok ${label}`); }
  catch (error) { failures.push(label); console.log(`FAIL ${label}: ${String(error.message).split('\n').slice(0, 4).join(' / ')}`); await page.screenshot({ path: `${SHOTS}/fail-${failures.length}.png` }).catch(() => {}); }
};
const until = async (fn, what, ms = 15000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw Error(what); await page.waitForTimeout(100); } };
const same = (actual, expected, what) => assert.ok(JSON.stringify(actual) === JSON.stringify(expected), `${what}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
const card = id => page.locator(`[data-block-id="${id}"]`);
// A card's fit, in layout px: its height, the blank under the last thing in its body (beyond the body's padding), and how much of
// the body is scrolled out of sight. A card without a scroll body (a working surface) reports its height only.
const fit = id => page.evaluate(id => {
  const node = document.querySelector(`[data-block-id="${id}"]`), body = node.querySelector('[data-scroll]');
  if (!body) return { h: node.offsetHeight };
  const r = node.getBoundingClientRect(), scale = r.height / node.offsetHeight;
  const kids = [...body.children].filter(el => getComputedStyle(el).position !== 'absolute' && el.getClientRects().length);
  const bottom = Math.max(...kids.map(el => el.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(el).marginBottom) || 0) * scale));
  return { h: node.offsetHeight, blank: Math.round((r.bottom - bottom) / scale - parseFloat(getComputedStyle(body).paddingBottom)), overflow: body.scrollHeight - body.clientHeight };
}, id);
const BLANK = 6; // the card's 1 px border and rounding; the screenshot case had about 690
const fitted = async (id, what) => { const f = await fit(id); assert.ok(f.blank <= BLANK, `${what}: ${f.blank} px blank under the content of ${id} (${JSON.stringify(f)})`); return f; };
const saved = id => page.evaluate(([key, id]) => { const block = (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).find(b => b.id === id); return block ? { w: block.w ?? null, h: block.h ?? null } : null; }, [INK, id]);
// The canvas camera at rest (study-resize-persist-check): a press made while the world glides lands where the card was.
const atRest = () => page.evaluate(frames => new Promise(resolve => {
  const world = document.querySelector('[data-canvas-world]');
  const read = () => getComputedStyle(world).transform;
  let last = read(), still = 0, over = false;
  const tick = () => { if (over) return; const now = read(); still = now === last && world.getAnimations().length === 0 ? still + 1 : 0; last = now; if (still >= frames) { over = true; resolve(true); } else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setTimeout(() => { over = true; resolve(false); }, 10000);
}), 15);
const handleOf = id => page.evaluate(sel => {
  const button = document.querySelector(sel);
  if (!button) return { missing: true };
  const r = button.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, top = document.elementFromPoint(x, y);
  return { x, y, hit: !!top && button.contains(top) };
}, `[data-block-id="${id}"] button[title="Resize block"]`);
// Press a card's corner handle and move it by (dx, dy) screen px; `during` runs with the button still down. While the corner is
// off screen or covered, the camera zooms out with the zoom control (study-resize-persist-check's way). The camera zooms about
// the canvas centre, so a card below it never rises far: the vertical move is shortened to the room left in the viewport, and
// must keep at least `least` px (any move past the content tests the clamp; a working surface needs a real change). The press
// always uses the handle position read at the camera it is made at (fast-e2e 41108024288: a position read before the last
// zoom-out pressed the Flow card instead of the Explain-back corner).
const VIEW_BOTTOM = 985, VIEW_TOP = 15;
const drag = async (id, dx, dy, during = null, least = 60) => {
  let at, move = dy;
  for (let step = 0; ; step++) {
    assert.ok(await atRest(), 'the canvas camera is still moving after 10 s');
    at = await handleOf(id);
    assert.ok(!at.missing, `${id} has no corner handle`);
    move = dy > 0 ? Math.min(dy, VIEW_BOTTOM - at.y) : dy < 0 ? Math.max(dy, VIEW_TOP - at.y) : 0;
    if (at.hit && (dy === 0 || Math.abs(move) >= Math.min(least, Math.abs(dy)))) break;
    assert.ok(step < 6, `${id}: no pressable corner with ${least} px of room after 6 zoom-outs: ${JSON.stringify(at)}`);
    await page.locator('[data-zoom] button[title="Zoom out"]').click();
  }
  dy = move;
  await page.mouse.move(at.x, at.y); await page.mouse.down();
  await page.mouse.move(at.x + dx / 2, at.y + dy / 2, { steps: 4 }); await page.mouse.move(at.x + dx, at.y + dy, { steps: 4 });
  await page.waitForTimeout(150);
  const seen = during ? await during() : null;
  await page.mouse.up(); await page.waitForTimeout(500);
  return seen;
};
// The connector from ch's bottom: the nearer end of its drawn route, against the card's bottom centre, in screen px.
const anchorGap = () => page.evaluate(() => {
  const path = document.querySelector('[data-connection="k"] path[stroke="transparent"]'), node = document.querySelector('[data-block-id="ch"]');
  if (!path || !node) return null;
  const m = path.getScreenCTM(), r = node.getBoundingClientRect();
  return Math.min(...[0, path.getTotalLength()].map(at => { const p = path.getPointAtLength(at); return Math.hypot(p.x * m.a + p.y * m.c + m.e - (r.left + r.width / 2), p.x * m.b + p.y * m.d + m.f - r.bottom); }));
});
const anchored = async what => { await page.waitForTimeout(400); const gap = await anchorGap(); assert.ok(gap != null && gap <= 4, `${what}: the connector starts ${gap == null ? 'nowhere' : `${gap.toFixed(1)} px`} from the Challenge's bottom edge`); };
const zoomTo = async (out, steps) => { await page.locator('[title="Reset zoom"]').click(); for (let i = 0; i < steps; i++) { await page.locator(`[data-zoom] button[title="${out ? 'Zoom out' : 'Zoom in'}"]`).click(); await page.waitForTimeout(120); } await page.waitForTimeout(500); };
const open = async () => { for (const id of ['ch', 'ex', 'eb', 'fl']) await card(id).waitFor({ timeout: 60000 }); await card('eb').locator('[data-feedback-tab], [data-attempt-select], [data-attempt-label]').first().waitFor({ timeout: 20000 }); await page.waitForTimeout(800); };
// The card's own answer control: Commit on the one-line Challenge, Submit answer on the Explain-back design.
const submitOf = id => card(id).locator('[data-eb-submit], button:text-is("Commit")').first();

await page.goto(`${BASE}/apps/${canvas.name}`);
await open();

await check('1 reopened: a Challenge and an Explain-back card saved 1000 px tall draw at their content height, no blank under the controls; drawing rewrites no saved size', async () => {
  await page.screenshot({ path: `${SHOTS}/reopened.png` });
  for (const id of ['ch', 'eb']) { const f = await fitted(id, 'reopened'); assert.ok(f.h < 900, `${id} still draws ${f.h} px tall`); assert.equal(f.overflow, 0, `${id} hides content`); }
  same([await saved('ch'), await saved('eb')], [{ w: 440, h: 1000 }, { w: 440, h: 1000 }], 'saved sizes after drawing');
  await anchored('reopened');
});

await check('2 dragging the Challenge 300 px taller opens no blank space, during the drag or after release; it stores its content height; Undo restores the old size, still without blank', async () => {
  const before = await fit('ch');
  const during = await drag('ch', 0, 300, () => fit('ch'));
  assert.ok(during.blank <= BLANK, `during the drag: ${during.blank} px blank (height ${during.h})`);
  const after = await fitted('ch', 'after release');
  assert.ok(Math.abs(after.h - before.h) <= 2, `the card grew from ${before.h} to ${after.h} with nothing to show`);
  await until(async () => (await saved('ch')).h !== 1000, 'the resize was not saved');
  const kept = await saved('ch');
  assert.ok(Math.abs(kept.h - after.h) <= 2, `stored ${kept.h}, drawn ${after.h}: the commit stored more than the content needs`);
  await anchored('after release');
  await card('ch').locator('[data-drag-handle]').click(); await page.keyboard.press('Control+z');
  await until(async () => (await saved('ch')).h === 1000, `Undo did not restore the saved 1000 (now ${JSON.stringify(await saved('ch'))})`);
  await fitted('ch', 'after Undo');
});

await check('3 the Challenge dragged shorter than its content scrolls with its answer control reachable; dragged tall again it returns to its content height', async () => {
  const natural = (await fit('ch')).h;
  await drag('ch', 0, -220);
  const short = await fit('ch');
  assert.ok(short.h < natural - 20 && short.overflow > 0, `the shorter card scrolls: ${JSON.stringify(short)} (content ${natural})`);
  await card('ch').locator('[data-scroll]').first().evaluate(body => { body.scrollTop = body.scrollHeight; });
  const reachable = await submitOf('ch').evaluate(button => { const body = button.closest('[data-scroll]'), r = button.getBoundingClientRect(), box = body.getBoundingClientRect(); return r.top >= box.top - 1 && r.bottom <= box.bottom + 1; });
  assert.ok(reachable, 'the answer control is not inside the scrolled body');
  await drag('ch', 0, 300);
  const back =await fitted('ch', 'dragged tall again');
  assert.ok(Math.abs(back.h - natural) <= 2 && back.overflow === 0, `back at ${back.h}, content ${natural}`);
});

await check('4 narrow and wide: at 280 px the text wraps and the card may open to the taller content; widened again it shrinks with no blank', async () => {
  const wide = await fit('ch');
  await drag('ch', -400, 0);
  assert.ok((await saved('ch')).w <= 300, `narrowed to ${(await saved('ch')).w}`);
  await fitted('ch', 'narrow');
  await drag('ch', 0, 300);
  const narrow =await fitted('ch', 'narrow, dragged tall');
  assert.ok(narrow.h > wide.h + 20 && narrow.overflow === 0, `the wrapped text needs more height: ${narrow.h} vs ${wide.h} wide`);
  await drag('ch', 500, 0);
  const wider = await fitted('ch', 'widened again');
  assert.ok(wider.h < narrow.h - 20 && wider.overflow === 0, `widened: ${wider.h} (narrow ${narrow.h})`);
  await anchored('widened');
});

await check('5 Explain-back feedback and history: Tutor feedback grows the card, Your answer shrinks it, Revise answer (a draft in the history) and back to the attempt, never with blank space', async () => {
  const eb = card('eb');
  // A review already saved when the board loads is not new (FX-EB-11): the card opens on Your answer and announces nothing.
  // Before the fix the late-loading attempt list counted as a fresh review and opened Tutor feedback (fast-e2e 41108024288).
  assert.equal(await eb.locator('[data-feedback-tab="answer"]').getAttribute('aria-selected'), 'true', 'a saved review does not open Tutor feedback on load');
  assert.equal((await eb.locator('p.sr-only[role="status"]').textContent()).trim(), '', 'no "Tutor feedback is ready" announcement for a saved review');
  await eb.locator('[data-feedback-tab="answer"]').click(); await page.waitForTimeout(300);
  assert.equal(await eb.locator('[data-feedback-tab="answer"]').getAttribute('aria-selected'), 'true', 'Your answer is shown');
  const answerTab = await fitted('eb', 'Your answer');
  await eb.locator('[data-feedback-tab="feedback"]').click(); await page.waitForTimeout(300);
  const feedback = await fitted('eb', 'Tutor feedback');
  assert.ok(feedback.h > answerTab.h + 30 || feedback.overflow > 0, `Tutor feedback showed nothing more: ${JSON.stringify(feedback)} vs ${JSON.stringify(answerTab)}`);
  await eb.locator('[data-feedback-tab="answer"]').click(); await page.waitForTimeout(300);
  const back = await fitted('eb', 'Your answer again');
  assert.ok(Math.abs(back.h - answerTab.h) <= 2, `Your answer again at ${back.h} (was ${answerTab.h})`);
  await eb.locator('[data-challenge-retry]').click(); await eb.locator('[data-eb-answer]').waitFor({ timeout: 5000 }); await page.waitForTimeout(300);
  await fitted('eb', 'a revision draft');
  await eb.locator('[data-attempt-select]').selectOption('at_1'); await eb.locator('[data-feedback-tab]').first().waitFor({ timeout: 5000 }); await page.waitForTimeout(300);
  await fitted('eb', 'the reviewed attempt chosen in the history');
});

await check('6 the Explain-back card and an Explanation dragged taller open no blank space; the Explanation\'s section opens and closes with no blank', async () => {
  const during = await drag('eb', 0, 300, () => fit('eb'));
  assert.ok(during.blank <= BLANK, `Explain-back during the drag: ${during.blank} px blank`);
  const after = await fitted('eb', 'Explain-back after release');
  await until(async () => (await saved('eb')).h !== 1000, 'the Explain-back resize was not saved');
  assert.ok(Math.abs((await saved('eb')).h - after.h) <= 2, `stored ${(await saved('eb')).h}, drawn ${after.h}`);
  // The Explain-back drag leaves that card selected; its selection bar sits on the Explanation's corner just above it
  // (fast-e2e 41111771895 fail-1.png). Escape clears the canvas selection first, as a learner would.
  await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  assert.equal(await page.locator('[aria-roledescription="card"][aria-current="true"]').count(), 0, 'nothing is selected before the Explanation drag');
  await drag('ex', 0, 300);
  const closed = await fitted('ex', 'Explanation dragged taller');
  await card('ex').locator('[data-explain-more]').click(); await page.waitForTimeout(300);
  const opened = await fitted('ex', 'section open');
  assert.ok(opened.h > closed.h + 20 || opened.overflow > 0, `opening the section showed nothing more: ${JSON.stringify(opened)}`);
  await card('ex').locator('[data-explain-more]').click(); await page.waitForTimeout(300);
  const shut = await fitted('ex', 'section closed');
  assert.ok(Math.abs(shut.h - closed.h) <= 2, `closed again at ${shut.h} (was ${closed.h})`);
});

await check('7 after a reload in the dark theme, at zoom ~50 %, 100 % and ~200 %, the text cards keep their stored sizes, show no blank, and the connector stays on the Challenge\'s bottom edge', async () => {
  const want = { ch: await saved('ch'), ex: await saved('ex'), eb: await saved('eb') };
  await page.evaluate(() => localStorage.setItem('small.theme', 'dark'));
  await page.reload();
  await open();
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'the dark theme is on');
  same({ ch: await saved('ch'), ex: await saved('ex'), eb: await saved('eb') }, want, 'stored sizes after the reload');
  try {
    for (const [out, steps, name] of [[false, 0, '100'], [true, 3, '50'], [false, 6, '200']]) {
      await zoomTo(out, steps);
      for (const id of ['ch', 'ex', 'eb']) await fitted(id, `dark, zoom ~${name} %`);
      await anchored(`dark, zoom ~${name} %`);
      await page.screenshot({ path: `${SHOTS}/dark-zoom-${name}.png` });
    }
  } finally { await zoomTo(false, 0); await page.evaluate(() => localStorage.setItem('small.theme', 'light')); }
});

await check('8 a working surface (Flow) keeps the taller frame it is dragged to; no model call and no page error', async () => {
  const before = (await fit('fl')).h;
  await drag('fl', 0, 200, null, 80);
  await until(async () => (await saved('fl'))?.h != null, 'the Flow resize was not saved');
  const after = (await fit('fl')).h;
  assert.ok(after > before + 60, `the Flow frame did not keep its dragged height: ${before} -> ${after}`);
  assert.deepEqual(model, [], 'no model-capable request');
  assert.deepEqual(errors.filter(error => !/ResizeObserver/.test(error)), []);
});

await browser.close();
console.log(`${results.length}/${total} checks passed${failures.length ? `; failed: ${failures.join(' | ')}` : ''}`);
process.exit(results.length === total ? 0 : 1);
