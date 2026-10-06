// Tutor v1 visual acceptance (docs/features/tutor-v1-implementation-map.md §7) against the LOCAL
// stack only - the same one /dive uses (docs/features/dive-v1.md "Run it locally"):
//   the app on 8788 and the control plane on 8790, as docs/features/dive-v1.md "Run it locally" starts them
// Default: the two Tutor routes are stubbed in the browser, so the flows are deterministic and
// every assertion is on the UI and the context the page sends. --live sends real requests (JEV
// and the planner need their keys in packages/web/.dev.vars, gitignored) and only reports.
// Usage: node e2e/tutor-slice-check.mjs [outDir] [--live]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { cardModule, TUTOR_BOARD } from '../src/learn-tutor-claims.js';

const BASE = process.env.TUTOR_BASE || 'http://127.0.0.1:8788';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('tutor-slice-check runs against the local stack only');
const args = process.argv.slice(2), LIVE = args.includes('--live'), GAP_ONLY = args.includes('--gap'); // --live --gap: only the prerequisite-gap turn
const OUT = args.find(arg => !arg.startsWith('--')) || 'tutor-shots';
mkdirSync(OUT, { recursive: true });
// TEST_BYPASS_SECRET in the environment (another local stack, e.g. e2e/journey-local-stack.md) wins over the file.
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
// Sessions are minted on the control plane's own origin (the app origin's P0-B barrier refuses /test/session):
// the standalone local control plane, SMALL_CP (default http://127.0.0.1:8790).
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const cookie = `small_session=${session}`;
const root = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Attention (Tutor)' }) })).json();
const ROOT_URL = `/apps/${root.name}?board=${TUTOR_BOARD}`;
const TITLE = id => cardModule(id).scene.title;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(() => { window.__tutorBench = []; window.addEventListener('small:tutor-bench', event => window.__tutorBench.push(event.detail)); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const open = async url => { await page.goto(`${BASE}${url}`); await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 }); await page.waitForTimeout(1500); };
const cardEl = id => page.locator('[data-block-id]:not([data-chat-block])', { hasText: TITLE(id) }).first();
// The chat sheet and a focused card can leave the target off screen: collapse the sheet, fit the
// board (Shift+1), then press the card's drag strip.
const select = async id => {
  const collapse = page.getByRole('button', { name: 'Collapse chat' });
  if (await collapse.count() && await collapse.first().isVisible()) await collapse.first().click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(600);
  await cardEl(id).locator('[data-drag-zone]').last().click(); await page.waitForTimeout(300);
};
const selected = id => cardEl(id).evaluate(node => node.className.includes('ring-2'));
const composer = () => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
const ask = async text => { await composer().click(); await composer().fill(text); if (text.startsWith('/')) await page.waitForTimeout(150); await composer().press('Enter'); };
const chips = () => page.locator('[data-tutor-chips]');

// ---- the Tutor routes: scripted in the browser (default) or real (--live) ----
const plans = [], evaluations = [];
let nextPlan = null, nextEvaluation = null;
if (!LIVE) {
  await page.route('**/api/learn/tutor/evaluate', async route => {
    const body = route.request().postDataJSON();
    evaluations.push(body);
    await route.fulfill({ json: nextEvaluation ? nextEvaluation(body) : { status: 'settled', evaluator: 'jev', events: [] } });
    nextEvaluation = null;
  });
  await page.route('**/api/learn/tutor/plan', async route => {
    const { context: sent } = route.request().postDataJSON();
    plans.push(sent);
    await route.fulfill({ json: nextPlan(sent) });
  });
} else {
  page.on('response', async response => {
    if (!response.url().includes('/api/learn/tutor/')) return;
    const body = await response.json().catch(() => null);
    console.log('live', new URL(response.url()).pathname, JSON.stringify(body).slice(0, 600));
  });
}
const say = text => ({ type: 'respond_text', text });
const waitPlan = async count => { await page.waitForFunction(() => true); for (let i = 0; i < 100 && plans.length < count; i++) await page.waitForTimeout(100); assert.ok(plans.length >= count, `plan request ${count} sent`); await page.waitForTimeout(800); };
const event = (claim, concept, extra) => ({ concept, claim, settled: true, evaluator: 'jev', source: 'free_text', kind: null, ...extra });

await open(ROOT_URL);
await shot('01-slice-board');
for (const id of ['depth-attention-overview', 'depth-attention-guided', 'depth-attention-deep', 'c11-causal-mask', 'c12-score-scaling', 'c10-weighted-values']) assert.ok(await cardEl(id).count(), `${id} on the slice board`);

if (LIVE) {
  // Real JEV, larger evaluator and planner behind the real routes. Every turn must come back: a
  // 200 plan with actions, and a reply that is neither the spinner nor an error. Which moves a real
  // planner picks is printed per turn; the flows it must support are asserted.
  const turns = [];
  const liveTurn = async (label, text) => {
    const sent = page.waitForRequest(request => request.url().endsWith('/api/learn/tutor/plan'), { timeout: 120000 });
    const planned = page.waitForResponse(response => response.url().endsWith('/api/learn/tutor/plan'), { timeout: 120000 });
    const evaluated = page.waitForResponse(response => response.url().endsWith('/api/learn/tutor/evaluate'), { timeout: 120000 }).catch(() => null);
    const start = Date.now();
    await ask(text);
    const [request, response] = await Promise.all([sent, planned]);
    const evaluation = await Promise.race([evaluated, page.waitForTimeout(100).then(() => null)]);
    const plan = await response.json().catch(() => null);
    await page.getByText('Thinking...').first().waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
    const reply = (await page.locator('[data-learn-dock]').innerText()).split('\n').filter(Boolean).slice(-3).join(' | ');
    const row = request.postDataJSON().context?.route?.row;
    await page.waitForTimeout(300);
    const bench = await page.evaluate(() => window.__tutorBench?.at(-1) || null); // the passive small:tutor-bench record
    const turn = { label, ms: Date.now() - start, row, status: response.status(), strategy: plan?.strategy, actions: plan?.actions?.map(action => action.type), accepted: bench?.accepted_actions, rejected: bench?.rejected, planner: plan?.telemetry && { requested_model: plan.telemetry.requested_model, served_model: plan.telemetry.served_model, outcome: plan.telemetry.outcome, ms: plan.telemetry.ms, input_tokens: plan.telemetry.input_tokens, output_tokens: plan.telemetry.output_tokens }, evaluation: evaluation && await evaluation.json().then(body => `${body.evaluator}:${body.status}${body.error ? ` (${body.error})` : ''}`).catch(() => 'unreadable'), reply };
    console.log('live', JSON.stringify(turn));
    turns.push(turn);
    assert.equal(response.status(), 200, `${label}: the planner answered (${JSON.stringify(plan).slice(0, 200)})`);
    assert.ok(Array.isArray(plan.actions), `${label}: the planner returned actions`);
    assert.equal(await page.getByText('Thinking...').count(), 0, `${label}: the reply is not left spinning`);
    assert.doesNotMatch(reply, /✗/, `${label}: the reply is not an error`);
    return plan;
  };

  if (!GAP_ONLY) {
  // An unprompted explanation: JEV judges only the ideas it touches (the approved v1 rule).
  await select('c10-weighted-values');
  await liveTurn('L1 explanation', 'So the output is a weighted average of the values: softmax turns the scores into weights that add up to one.');
  await shot('live-01-explanation');
  // A misconception, twice: the router can only reach socrates/feynman through the evaluator's events.
  await select('c11-causal-mask');
  await liveTurn('L2 misconception 1', 'The mask is applied after softmax, it just zeroes the weights of the later characters.');
  const second = await liveTurn('L2 misconception 2', 'I still think the mask comes after softmax and sets the later weights to zero.');
  await shot('live-02-misconception');
  assert.ok(turns.slice(-2).some(turn => ['socrates', 'feynman'].includes(turn.strategy)), `a misconception or uncertainty routes to Feynman or Socrates (${turns.slice(-2).map(turn => `${turn.row}/${turn.strategy}`).join(', ')})`);
  // An explicit request: the authored Deep card.
  await select('depth-attention-overview');
  const deep = await liveTurn('L3 explicit request', "Don't simplify this. Show me the implementation.");
  await shot('live-03-implementation');
  assert.ok(deep.actions.some(action => ['show_authored_card', 'focus_part', 'suggest_depth', 'suggest_practice'].includes(action.type)), 'the planner produced an authored-card, practice or depth action');
  // /deeper and /simplify go through the Tutor as the turn's slash.
  await select('depth-attention-guided');
  await liveTurn('L4 /deeper', '/deeper into the scaling');
  await shot('live-04-deeper');
  await select('depth-attention-guided');
  await liveTurn('L5 /simplify', '/simplify the masking step');
  await shot('live-05-simplify');
  }
  // A prerequisite gap: the dive suggestion, the hole, its opening turn, and back to the parent.
  await select('depth-attention-guided');
  await liveTurn('L6 gap', "I get that q·k gives a score, but why do the weights add up to one? Why isn't the score just the weight?");
  const suggested = await page.locator('[data-dive-suggestion]').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  await shot('live-06-gap');
  // The words right before the suggestion: at most two sentences (locked gap row; enforce() in learn-tutor.js).
  // The reply bubble is the dock's last accent-bordered answer (ask.jsx, learnChat).
  const before = await page.evaluate(() => [...document.querySelectorAll('[data-learn-dock] div')].filter(node => String(node.className).includes('border-accent/30')).at(-1)?.innerText || '');
  const sentences = before.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  console.log('live L6 reply before the suggestion', sentences.length, 'sentence(s):', JSON.stringify(before.slice(0, 400)));
  if (suggested) assert.ok(sentences.length >= 1 && sentences.length <= 2, `at most two sentences before the Rabbit Hole suggestion (${sentences.length})`);
  if (GAP_ONLY) { await browser.close(); assert.ok(suggested, 'the real planner suggested a dive'); console.log('tutor-slice-check --live --gap ok'); process.exit(0); }
  if (suggested) {
    const opening = page.waitForResponse(response => response.url().endsWith('/api/learn/tutor/plan'), { timeout: 120000 });
    await page.getByRole('button', { name: 'Go down a Rabbit Hole' }).click();
    await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 15000 });
    const hole = new URL(page.url()).searchParams.get('hole');
    assert.equal((await opening).status(), 200, 'the hole opening turn answered');
    await page.getByText('Thinking...').first().waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
    await shot('live-07-hole-opening');
    await liveTurn('L7 in the hole', 'With scores 2, 1, 0: e² ≈ 7.4, e ≈ 2.7 and 1; divided by their sum 11.1 they are 0.67, 0.24 and 0.09, and they add up to one.');
    await shot('live-08-in-hole');
    const back = chips().getByText('Back up the Rabbit Hole');
    if (await back.count()) await back.click();
    else await page.locator('[data-dive-navigator]').getByRole('button', { name: 'Up to the parent hole' }).click();
    await page.waitForFunction(name => location.pathname === `/apps/${name}` && !location.search.includes('hole='), root.name, { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1500);
    assert.ok(await page.locator(`[data-dive-portal]`).count(), 'back on the parent, the origin card is a portal');
    await select('depth-attention-guided');
    const returnedSent = page.waitForRequest(request => request.url().endsWith('/api/learn/tutor/plan'), { timeout: 120000 });
    await liveTurn('L8 back on the parent', 'I am back.');
    const returned = (await returnedSent).postDataJSON().context;
    console.log('live returned_from', JSON.stringify(returned.turn?.returned_from || null), 'row', returned.route?.row, 'hole', hole);
    await shot('live-09-back-on-parent');
  } else console.log('live L6: the real planner did not suggest a dive on this run');
  await browser.close();
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  console.log(`tutor-slice-check --live ok: ${turns.length} turns${suggested ? ', dive round trip' : ', NO dive suggestion'}`);
  process.exit(0);
}

// ---- GT-04: an explicit request navigates to the authored Deep card at its first part ----
await select('depth-attention-overview');
nextPlan = () => ({ strategy: 'none', move: 'go_deeper', reason: 'explicit request', explicit_request: 'Show me the implementation', constraints_add: ['no_simplify', 'implementation'],
  actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, say('Here is CausalSelfAttention.forward, from the split into heads onwards.')] });
await ask("Don't simplify this. Show me the implementation.");
await waitPlan(1);
assert.equal(plans[0].target.card, 'depth-attention-overview');
assert.equal(plans[0].learner_intent.raw_user_message.length > 0, true);
await page.getByText('Here is CausalSelfAttention.forward').first().waitFor();
assert.ok(await selected('depth-attention-deep'), 'the Deep card is focused');
await shot('02-gt04-deep-card');

// ---- GT-01: restating the drawn case -> a depth chip, nothing moves by itself ----
await select('depth-attention-overview');
nextEvaluation = () => ({ status: 'settled', evaluator: 'jev', events: [0, 1].map(() => event('attention/looks-back-never-ahead', 'attention', { result: 'pass', kind: 'demonstrated_here' })) });
nextPlan = sent => {
  assert.equal(sent.route.row, 'uncertain');
  return { strategy: 'feynman', move: 'next_rung', reason: '', actions: [say('Yes: it looks back, never ahead.'), { type: 'suggest_depth', card: 'depth-attention-overview', direction: 'deeper' }] };
};
await ask('When it reads a character it looks back at earlier ones, mostly at one place, and never ahead.');
await waitPlan(2);
await chips().getByText(/Go deeper/).waitFor();
assert.ok(!(await selected('depth-attention-guided')), 'the suggestion has not moved anything');
await shot('03-gt01-depth-chip');
await chips().getByText(/Go deeper/).click();
await page.waitForTimeout(800);
assert.ok(await selected('depth-attention-guided'), 'the chip opens the Guided card');
await shot('04-gt01-guided');

// ---- GT-06 / GT-D2: a softmax gap -> the dive suggestion; Keep here -> dive_choice inline ----
const gapQuestion = "I get that q·k gives a score, but why do the weights add up to one? Why isn't the score just the weight?";
const gap = () => ({ status: 'settled', evaluator: 'jev', events: [event('attention/weights-from-scores', 'attention', { result: 'gap', prerequisite: 'softmax' })] });
const suggest = sent => {
  assert.equal(sent.route.row, 'gap');
  return { strategy: 'none', move: 'prerequisite', reason: '', actions: [say('Softmax looks like the missing piece.'), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }] };
};
await select('depth-attention-guided');
nextEvaluation = gap; nextPlan = suggest;
await ask(gapQuestion);
await waitPlan(3);
await page.locator('[data-dive-suggestion]').waitFor();
await shot('05-gt06-dive-suggestion');
await page.getByRole('button', { name: 'Keep it on this canvas' }).click();
nextPlan = sent => {
  assert.deepEqual(sent.learner_intent.dive_choice, { concept: 'softmax', choice: 'inline' });
  assert.equal(sent.route.row, 'gap_inline');
  return { strategy: 'feynman', move: 'inline', reason: '', actions: [say('Here, then: softmax exponentiates each score and divides by the sum.')] };
};
await select('depth-attention-guided');
await ask('Explain it here.');
await waitPlan(4);
await page.getByText('Here, then: softmax').first().waitFor();
await shot('06-gt-d2-kept-here');

// ---- GT-D1: Go down -> the hole opens from the Guided card; the Tutor opens with the question ----
await select('depth-attention-guided');
nextEvaluation = gap; nextPlan = suggest;
await ask(gapQuestion);
await waitPlan(5);
await page.locator('[data-dive-suggestion]').waitFor();
nextPlan = sent => {
  assert.equal(sent.learner_intent.kind, 'opening');
  assert.equal(sent.dive_context.origin_card, 'depth-attention-guided');
  assert.equal(sent.dive_context.concept, 'softmax');
  assert.match(sent.learner_intent.raw_user_message, /add up to one/);
  return { strategy: 'feynman', move: 'explain', reason: '', actions: [say('In this hole: softmax turns scores into weights that add up to one.'), { type: 'show_authored_card', card: 'c21-temperature', mode: 'suggest' }] };
};
await page.getByRole('button', { name: 'Go down a Rabbit Hole' }).click();
await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 15000 });
const hole = new URL(page.url()).searchParams.get('hole');
await waitPlan(6);
await page.getByText('In this hole: softmax').first().waitFor();
await shot('07-gt-d1-hole-opening');
await chips().getByText(/Show/).click();
await page.waitForFunction(name => location.pathname === `/apps/${name}`, hole, { timeout: 15000 });
await page.waitForTimeout(1000);
await shot('08-gt-d1-c21-in-hole');

// ---- in the hole: a transfer explanation, then back up ----
nextEvaluation = () => ({ status: 'settled', evaluator: 'jev', events: [0, 1].map(() => event('softmax/normalizes-to-one', 'softmax', { result: 'pass', kind: 'demonstrated_in_transfer' })) });
nextPlan = sent => {
  assert.equal(sent.dive_context.dive_id, hole);
  return { strategy: 'none', move: 'ack', reason: '', actions: [say('Right - that is softmax.'), { type: 'return_from_dive' }] };
};
await ask('With scores 2, 1, 0: e² ≈ 7.4, e ≈ 2.7, 1; divided by their sum 11.1 they are 0.67, 0.24, 0.09 and add up to one.');
await waitPlan(7);
await chips().getByText('Back up the Rabbit Hole').click();
await page.waitForFunction(name => location.pathname === `/apps/${name}`, root.name, { timeout: 15000 });
await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1500);
assert.ok(await page.locator(`[data-dive-portal="${hole}"]`).count(), 'the Guided card is the portal');

// ---- GT-D3: the parent's next turn carries returned_from and asks one question ----
nextPlan = sent => {
  assert.equal(sent.dive_context.returned_from.dive_id, hole);
  assert.equal(sent.route.row, 'returned');
  assert.equal(sent.route.claim, 'attention/weights-from-scores');
  return { strategy: 'socrates', move: 're-check', reason: '', actions: [{ type: 'ask_question', text: 'So why do the attention weights add up to one?', claim: 'attention/weights-from-scores', purpose: 'transfer' }] };
};
await select('depth-attention-guided');
await ask('I am back.');
await waitPlan(8);
await page.getByText('So why do the attention weights add up to one?').first().waitFor();
await shot('09-gt-d3-back-on-parent');

// ---- a turn that only acts on the canvas still ends in a reply line, never an endless "Thinking..." ----
nextPlan = () => ({ strategy: 'none', move: 'go_deeper', reason: '', explicit_request: 'Show me the implementation', actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }] });
await select('depth-attention-overview');
await ask('Show me the implementation again.');
await waitPlan(9);
await page.getByText('See the canvas.').first().waitFor({ timeout: 5000 });
assert.equal(await page.getByText('Thinking...').count(), 0, 'no Tutor reply is left spinning');

// ---- a failing planner is an error reply; Stop ends a pending turn as "Stopped."; a planner that never
// answers ends after the 60 s bound (LearnTutor.jsx) - none of them leaves the reply spinning ----
const failing = route => route.fulfill({ status: 502, json: { error: 'The tutor is unavailable' } });
const hanging = () => {}; // never answers
await page.route('**/api/learn/tutor/plan', failing);
await select('depth-attention-overview');
await ask('What does the mask do?');
await page.getByText('✗ The tutor is unavailable').first().waitFor({ timeout: 10000 });
await page.unroute('**/api/learn/tutor/plan', failing);
await page.route('**/api/learn/tutor/plan', hanging);
await select('depth-attention-overview');
await ask('And what does the scaling do?');
await page.getByRole('button', { name: 'Stop' }).click({ timeout: 10000 });
await page.getByText('Stopped.').first().waitFor({ timeout: 5000 });
await select('depth-attention-overview');
await ask('Why the square root?');
await page.getByText('✗ The Tutor took too long to answer. Try again.').first().waitFor({ timeout: 75000 });
await page.unroute('**/api/learn/tutor/plan', hanging);
assert.equal(await page.getByText('Thinking...').count(), 0, 'no Tutor reply is left spinning after an error, a Stop or a timeout');
await shot('10-error-stop-timeout');

await browser.close();
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`tutor-slice-check ok: ${plans.length} planner turns, ${evaluations.length} evaluations`);
