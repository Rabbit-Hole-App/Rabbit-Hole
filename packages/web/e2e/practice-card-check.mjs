// Practice-card check (owner, 2026-10-08; docs/features/tutor-decision-eval.md 18.2-18.3): transfer practice answered right
// and wrong, the evidence it leaves, and the learning path's advancement. Against the KEYLESS journey stack only
// (e2e/journey-local-stack.md: fixture planners, no model key). The Tutor's planner is answered in the page; nothing reaches a
// model, and the provider tripwire must count 0.
//   P  practice on the nanoGPT slice board (r28): a transfer card answered right on its first attempt is settled transfer
//      evidence and its claim is understood; a card answered wrong first, then right, leaves a fail and a taught-case pass only,
//      never understood; the next turn on the card never routes back to the understood claim, so it is not checked again.
//   D  the learning path's diagnostic transfer probe (r28): right is a settled transfer pass, wrong is a misconception and no
//      transfer pass, never understood.
//   N  [r29] next_section (Learning's fix/pns-r29): a learner's move-on completes the section only when its completion
//      evidence is met, skips it otherwise; evidence is kept either way and the next section becomes current. r28 has no
//      next_section action, so these are expected failures there: they print with [r29] and decide the exit code only
//      with --r29.
// Journey-section practice cards are LP4 (outside r29): printed as UNTESTED, never counted as passing.
// Usage: TUTOR_BASE=http://127.0.0.1:8868 SMALL_CP=http://127.0.0.1:8869 TEST_BYPASS_SECRET=... node e2e/practice-card-check.mjs [shotsDir] [--r29]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { CLAIMS, TUTOR_BOARD, cardModule } from '../src/learn-tutor-claims.js';
import { deriveClaimStates, storeKey } from '../src/learn-tutor-evidence.js';

const BASE = process.env.TUTOR_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('practice-card-check runs against a local stack only');
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const args = process.argv.slice(2), R29 = args.includes('--r29');
const SHOTS = args.find(arg => !arg.startsWith('--')) || 'e2e/shots/practice-card';
mkdirSync(SHOTS, { recursive: true });

const results = [];
// [r29] checks are expected to fail before Learning's r29; they count toward the exit code only with --r29.
const check = (name, ok, detail = '') => {
  const r29 = name.startsWith('[r29]'), counted = !r29 || R29;
  results.push({ ok, counted });
  console.log(`${ok ? 'PASS' : counted ? 'FAIL' : 'XFAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// The provider tripwire (e2e/provider-tripwire.js): the stack's own count of requests that tried to reach a provider.
const tripwire = async origin => { const response = await fetch(`${origin}/__provider-tripwire`).catch(() => null); const body = await response?.json().catch(() => null); return body ? body.hits.length : null; };
const trippedBefore = [await tripwire(BASE), await tripwire(CP)];

const email = `practice-card-${Date.now().toString(36)}@example.com`;
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { cookie, 'content-type': 'application/json', ...(init.headers || {}) } })).json();
const who = await api('/api/apps');
const newCanvas = async title => (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title }) })).name;
const journeyOf = name => api(`/api/learn/journey?app=${name}&board=main`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// Nothing reaches a model: Learn asks are canned, generation is refused, and the Tutor's planner answers here. A plan carries a
// suggest_journey for a registered learning request, and a next_section for a registered move-on (r29's action).
const offers = new Map(), moves = new Set(), plans = [];
const CANNED = 'A canned answer: no model was called.';
await context.route('**/api/learn/ask', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: `data: ${JSON.stringify({ text: CANNED })}\n\ndata: [DONE]\n\n` }));
await context.route('**/api/learn/home-ask', route => route.fulfill({ json: { answer: CANNED, references: [], offer_rabbit_hole: false } }));
await context.route(/\/api\/(learn\/(artifact|voice\/|assess|transcribe|image)|chat)/, route => route.abort());
await context.route('**/api/learn/tutor/plan', route => {
  let body = null; try { body = route.request().postDataJSON(); } catch { /* not JSON */ }
  plans.push(body?.context ?? null);
  const words = body?.context?.learner_intent?.raw_user_message;
  const subject = !body?.context?.journey_context && offers.get(words);
  return route.fulfill({ json: { strategy: 'none', move: 'answer', reason: '', actions: [
    { type: 'respond_text', text: CANNED },
    ...(subject ? [{ type: 'suggest_journey', request: subject }] : []),
    ...(moves.has(words) ? [{ type: 'next_section', explicit_request: words }] : []),
  ] } });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const composer = () => page.locator('[data-learn-dock] [data-chat-composer] :is(textarea, input:not([type="file"]))').first();
const send = async text => { await composer().fill(text); await composer().press('Enter'); };
const until = async (ok, timeout = 15000) => { for (const end = Date.now() + timeout; !(await ok()) && Date.now() < end;) await page.waitForTimeout(250); };
const shot = name => page.screenshot({ path: `${SHOTS}/${name}.png` });

// ---------- P: practice on the slice board ----------
const tutorStore = () => page.evaluate(key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }, storeKey(who));
const cardEl = id => page.locator('[data-block-id]:not([data-chat-block])', { hasText: cardModule(id).scene.title }).first();
// Fit the board, then press the card's drag strip (as tutor-slice-check selects a card).
async function selectCard(id) {
  const collapse = page.getByRole('button', { name: 'Collapse chat' });
  if (await collapse.count() && await collapse.first().isVisible()) await collapse.first().click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(600);
  await cardEl(id).locator('[data-drag-zone]').last().click(); await page.waitForTimeout(300);
}
// One graded attempt on the card's practice: pick `answer`, press Check, return the graded result. The controls are pressed
// with a DOM click: a card low on the board sits under the canvas's bottom bar, which would take a pointer click.
async function attempt(id, answer, fresh) {
  const card = cardEl(id), press = selector => card.locator(selector).dispatchEvent('click');
  await card.scrollIntoViewIfNeeded();
  await press(fresh ? '[data-practice-start]' : '[data-activity-new]');
  await press(`[data-scene-activity] [data-input-control="answer"][data-input-value="${answer}"]`);
  await press('[data-activity-check]');
  const graded = card.locator('[data-activity-feedback][data-activity-result]');
  await graded.waitFor({ timeout: 5000 });
  return graded.getAttribute('data-activity-result');
}
// A typed Tutor turn on the selected card: practiceEvents reads the card's new attempts at the start of the turn.
async function turnOn(id, words) {
  await selectCard(id);
  const before = plans.length;
  await send(words);
  await until(async () => plans.length > before);
  await page.waitForTimeout(800);
  return plans.at(-1);
}
const practiceOf = (store, claim) => (store?.events || []).filter(e => e.claim === claim && e.source === 'card_practice');

const slice = await newCanvas('Practice card check (slice)');
await page.goto(`${BASE}/apps/${slice}?board=${TUTOR_BOARD}`);
await page.locator('[data-tool-gutter]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
{
  const id = 'c11-causal-mask', { activity } = cardModule(id), claim = 'causal-mask/reads-self-and-earlier';
  const result = await attempt(id, activity.expected, true);
  check('P1 the right answer on the first attempt is graded passed', result === 'passed', result);
  const sent = await turnOn(id, 'Why does the mask keep the diagonal?');
  const events = practiceOf(await tutorStore(), claim), states = deriveClaimStates((await tutorStore())?.events || [], CLAIMS);
  check('P1 it is settled transfer evidence from the card', events.length === 1 && events[0].result === 'pass' && events[0].kind === 'demonstrated_in_transfer' && events[0].settled === true,
    JSON.stringify(events.map(({ result, kind, settled }) => ({ result, kind, settled }))));
  check('P1 the claim is understood', states[claim]?.state === 'understood', states[claim]?.state);
  check('P1 the next turn does not route back to the understood claim', !!sent?.route && sent.route.claim !== claim, `route ${sent?.route?.row} on ${sent?.route?.claim}`);
  await shot('P1-c11-right');
}
{
  const id = 'c10-weighted-values', { activity } = cardModule(id), claim = 'attention-output/weighted-average';
  const wrong = await attempt(id, 'top', true), right = await attempt(id, activity.expected, false);
  check('P2 a wrong first attempt fails, the retry passes', wrong === 'failed' && right === 'passed', `${wrong}, then ${right}`);
  const sent = await turnOn(id, 'So the output is a weighted average?');
  const events = practiceOf(await tutorStore(), claim), states = deriveClaimStates((await tutorStore())?.events || [], CLAIMS);
  check('P2 the wrong answer is a settled fail, with its misconception', events[0]?.result === 'fail' && events[0]?.settled === true && events[0]?.misconception_id === 'picks-top-value',
    JSON.stringify(events[0] ?? null));
  check('P2 the retry is a taught-case pass, never transfer', events.length === 2 && events[1].result === 'pass' && events[1].kind === 'demonstrated_here', JSON.stringify(events[1] ?? null));
  check('P2 the claim is not understood', states[claim]?.state !== 'understood', states[claim]?.state);
  check('P2 the next turn does not route it as understood', sent?.route?.row !== 'understood', `route ${sent?.route?.row}`);
  await shot('P2-c10-wrong-then-right');
}

// ---------- D and N: the learning path ----------
const REQUEST = 'Teach me logistic regression from the basics.', EXPLAIN = 'It turns a weighted score into a probability.';
const MOVE_ON = 'Can we move on to the next section?';
const trayMode = () => page.evaluate(() => document.querySelector('[data-tutor-prompt-tray]')?.dataset.mode ?? null);
const trayLabel = () => page.evaluate(() => document.querySelector('[data-tutor-prompt-tray]')?.getAttribute('aria-label') ?? null);
const trayReady = () => page.evaluate(() => { const t = document.querySelector('[data-tutor-prompt-tray]'); return !!t && !t.querySelector('[data-tray-busy]'); });
async function nextTray(before) {
  await until(async () => (await trayReady()) && ((await trayMode()) !== before.mode || (await trayLabel()) !== before.label), 30000);
  return { mode: await trayMode(), label: await trayLabel() };
}
// A learning path started from the canvas (the Tutor offers it, the chip starts it), the intake answered, every diagnostic
// probe answered in the order asked (the transfer mcq with `mcq`), and the path accepted: section 1 current.
async function journeyWith(label, mcq) {
  const name = await newCanvas(`Practice card check (${label})`);
  await page.goto(`${BASE}/apps/${name}?tab=learn`);
  await page.locator('[data-tool-gutter]').waitFor({ timeout: 60000 });
  await composer().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  offers.set(REQUEST, REQUEST);
  await send(REQUEST);
  await page.getByRole('button', { name: 'Start a learning path' }).first().click({ timeout: 30000 });
  await page.locator('[data-tutor-prompt-tray][data-mode="intent_intake"]').waitFor({ timeout: 30000 });
  let tray = { mode: await trayMode(), label: await trayLabel() };
  for (const option of ['intuition', 'seen', 'guided']) { await page.locator(`[data-tray-option="${option}"]`).click(); tray = await nextTray(tray); }
  for (let i = 0; i < 4 && tray.mode === 'diagnostic_probe'; i++) {
    const probe = (await journeyOf(name)).journey.diagnostic.probes.find(p => p.prompt === tray.label);
    if (!probe) throw Error('the open probe matches no stored probe');
    if (probe.kind === 'explain_back') await send(EXPLAIN);
    else await page.locator(`[data-tray-option="${probe.kind === 'mcq' ? mcq : 'a'}"]`).click();
    tray = await nextTray(tray);
  }
  await page.locator('[data-tutor-prompt-tray][data-mode="path_preview"]').waitFor({ timeout: 30000 });
  await page.locator('[data-tray-option="start"]').click();
  await until(async () => (await journeyOf(name)).journey?.active_section_id === 's1', 30000);
  return name;
}
const transferProbeOf = journey => journey.diagnostic.probes.find(p => p.kind === 'mcq' && p.transfer);
const own = (events, claim) => events.filter(e => e.claim === claim);

for (const [label, mcq] of [['right', 'a'], ['wrong', 'b']]) {
  const name = await journeyWith(label, mcq);
  const { journey } = await journeyOf(name);
  const probe = transferProbeOf(journey), claim = probe?.claims?.[0];
  const events = journey.evidence?.events ?? [], mine = own(events, claim);
  const states = deriveClaimStates(events, journey.registry?.claims || {});
  if (label === 'right') {
    check('D1 the right transfer answer is a settled transfer pass', mine.some(e => e.result === 'pass' && e.kind === 'demonstrated_in_transfer' && e.settled && e.ref?.probe_id === probe.id), JSON.stringify(mine));
    check('D1 its claim is understood', states[claim]?.state === 'understood', `${claim}: ${states[claim]?.state}`);
  } else {
    check('D2 the wrong transfer answer is a misconception, never a pass', mine.length >= 1 && mine.every(e => e.result !== 'pass') && mine.some(e => e.result === 'misconception'), JSON.stringify(mine));
    check('D2 its claim is not understood', states[claim]?.state !== 'understood', `${claim}: ${states[claim]?.state}`);
  }
  await shot(`D-${label}-section-1`);

  // N [r29]: the learner asks to move on; the page calls next_section (the planner's action), and the route completes or skips.
  moves.add(MOVE_ON);
  const before = await journeyOf(name), kept = JSON.stringify(before.journey.evidence?.events ?? []);
  await send(MOVE_ON);
  await until(async () => (await journeyOf(name)).journey?.active_section_id !== 's1', 20000);
  const after = await journeyOf(name), sections = after.path?.sections ?? [], s1 = sections.find(s => s.id === 's1'), s2 = sections.find(s => s.id === 's2');
  const rail = async (id, status) => (await page.locator(`[data-path-entry="${id}"][data-status="${status}"]`).count()) === 1;
  const expected = label === 'right' ? 'completed' : 'skipped';
  check(`[r29] N-${label} a move-on ${label === 'right' ? 'completes section 1: its completion evidence is met' : 'skips section 1: its evidence is not met'}`,
    s1?.status === expected, `s1 ${s1?.status}, expected ${expected}`);
  check(`[r29] N-${label} section 2 becomes current`, after.journey?.active_section_id === 's2' && s2?.status === 'current' && await rail('s2', 'current'), `active ${after.journey?.active_section_id}, s2 ${s2?.status}`);
  check(`[r29] N-${label} the rail shows section 1 ${expected}`, await rail('s1', expected));
  check(`[r29] N-${label} the evidence is kept`, JSON.stringify(after.journey?.evidence?.events ?? []) === kept, `${(after.journey?.evidence?.events ?? []).length} event(s)`);
  if (label === 'wrong') check('[r29] N-wrong a skipped section never makes its claim understood', deriveClaimStates(after.journey?.evidence?.events ?? [], after.journey?.registry?.claims || {})[claim]?.state !== 'understood');
  moves.delete(MOVE_ON);
  await shot(`N-${label}-after-move-on`);
}

console.log('UNTESTED  a practice card inside a learning-path section: section checks never become cards before LP4 (outside r29), so this harness cannot show it');
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
const trippedAfter = [await tripwire(BASE), await tripwire(CP)];
const hits = trippedAfter.some(n => n == null) || trippedBefore.some(n => n == null) ? null : trippedAfter[0] - trippedBefore[0] + trippedAfter[1] - trippedBefore[1];
console.log(`provider tripwire hits: ${hits ?? 'unreadable'}`);
check('the provider tripwire counted 0', hits === 0, hits == null ? 'GET /__provider-tripwire is not served: start the stack with the tripwire workers' : `${hits} hit(s)`);

await browser.close();
const counted = results.filter(r => r.counted), passed = counted.filter(r => r.ok).length, expectedFailures = results.filter(r => !r.counted && !r.ok).length;
console.log(`${passed}/${counted.length} checks passed${expectedFailures ? ` (${expectedFailures} [r29] expected failure(s) without --r29)` : ''}`);
process.exit(passed === counted.length ? 0 : 1);
