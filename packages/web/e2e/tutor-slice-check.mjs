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
const args = process.argv.slice(2), LIVE = args.includes('--live');
const OUT = args.find(arg => !arg.startsWith('--')) || 'tutor-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
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
const ask = async text => { await composer().click(); await composer().fill(text); await composer().press('Enter'); };
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
  // The real ladder and planner on two traces; the output is printed, not asserted.
  await select('depth-attention-overview');
  await ask("Don't simplify this. Show me the implementation.");
  await page.waitForTimeout(20000);
  await shot('live-gt04');
  await select('depth-attention-guided');
  await ask("I get that q·k gives a score, but why do the weights add up to one? Why isn't the score just the weight?");
  await page.waitForTimeout(20000);
  await shot('live-gt06');
  await browser.close();
  console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors');
  process.exit(0);
}

// ---- GT-04: an explicit request navigates to the authored Deep card at its first part ----
await select('depth-attention-overview');
nextPlan = () => ({ strategy: 'none', move: 'go_deeper', reason: 'explicit request', explicit_request: 'Show me the implementation', constraints_add: ['no_simplify', 'implementation'],
  actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, say('Here is CausalSelfAttention.forward, from the split into heads onwards.')] });
await ask("Don't simplify this. Show me the implementation.");
await waitPlan(1);
assert.equal(plans[0].turn.target.card, 'depth-attention-overview');
assert.notEqual(plans[0].turn.target.block_id, plans[0].turn.target.scene_id);
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
  assert.deepEqual(sent.turn.dive_choice, { concept: 'softmax', choice: 'inline' });
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
  assert.equal(sent.turn.opening, true);
  assert.equal(sent.dive.origin_card, 'depth-attention-guided');
  assert.equal(sent.dive.concept, 'softmax');
  assert.match(sent.turn.raw_user_message, /add up to one/);
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
  assert.equal(sent.turn.canvas.dive.dive_id, hole);
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
  assert.equal(sent.turn.returned_from.dive_id, hole);
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

await browser.close();
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
console.log(`tutor-slice-check ok: ${plans.length} planner turns, ${evaluations.length} evaluations`);
