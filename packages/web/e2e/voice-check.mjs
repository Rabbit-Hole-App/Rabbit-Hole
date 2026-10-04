// Voice Tutor MVP browser check (docs/features/voice-tutor-mvp.md) against the LOCAL stack only.
// Nothing paid runs here:
// - The page uses ?voice=fake, so STT and TTS are the scripted adapters (window.__voiceFake).
// - The two Tutor routes are scripted in the browser, as in tutor-slice-check.mjs.
// - Every /api/learn/voice/* request is aborted, and the run asserts that none was made.
// It walks the VOICE flows the unit tests cover and saves the review screenshots:
//   node e2e/voice-check.mjs [outDir]
// Env: VOICE_BASE (the app, default http://127.0.0.1:8798) and SMALL_CP (the control plane, default http://127.0.0.1:8799).
// VOICE_APP (a karpathy/nanoGPT repository app) and VOICE_EMAIL walk the same flows on the product Tutor entry
// (?experience=tutor, learn-experiences.js), which also runs in the production build, instead of the review board.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { cardModule, TUTOR_BOARD } from '../src/learn-tutor-claims.js';

const BASE = process.env.VOICE_BASE || 'http://127.0.0.1:8798';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('voice-check runs against the local stack only');
const OUT = process.argv[2] || 'voice-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8799';
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.VOICE_EMAIL || 'yudhisteer.chin@gmail.com', secret }) })).json();
const cookie = `small_session=${session}`;
const APP = process.env.VOICE_APP;
const root = APP ? null : await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Attention (Voice)' }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(() => { window.__voiceEvents = []; window.addEventListener('small:tutor-voice', event => window.__voiceEvents.push(event.detail)); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

// ---- no paid provider, ever: every voice route is aborted and counted ----
const voiceRequests = [];
await page.route('**/api/learn/voice/**', route => { voiceRequests.push(route.request().url()); return route.abort(); });

// ---- the Tutor, scripted. A held plan keeps the session in THINKING for the screenshot. ----
const plans = [], evaluations = [];
let nextPlan = null, nextEvaluation = null, hold = null;
await page.route('**/api/learn/tutor/evaluate', async route => {
  const body = route.request().postDataJSON();
  evaluations.push(body);
  await route.fulfill({ json: nextEvaluation ? nextEvaluation(body) : { status: 'settled', evaluator: 'jev', events: [] } });
  nextEvaluation = null;
});
await page.route('**/api/learn/tutor/plan', async route => {
  const { context: sent, stream } = route.request().postDataJSON();
  plans.push(sent);
  if (hold) await hold;
  // A voice turn streams the plan (NDJSON, learn-tutor.js readPlanStream); a typed one takes JSON.
  if (stream) await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'plan', ...nextPlan(sent) }) + '\n' });
  else await route.fulfill({ json: nextPlan(sent) });
});
const say = text => ({ type: 'respond_text', text });
const event = (claim, concept, extra) => ({ concept, claim, settled: true, evaluator: 'jev', source: 'free_text', kind: null, ...extra });
const waitPlans = async count => { for (let i = 0; i < 150 && plans.length < count; i++) await page.waitForTimeout(100); assert.ok(plans.length >= count, `plan request ${count} sent`); };

const field = () => page.locator('[data-voice-field]');
const caption = () => page.locator('[data-tutor-caption]');
const state = () => page.locator('[data-voice-state]').first().getAttribute('data-voice-state');
const waitState = async want => { for (let i = 0; i < 150; i++) { if ((await page.locator('[data-voice-state]').count()) && await state() === want) return; await page.waitForTimeout(100); } assert.fail(`voice state ${want}`); };
const learnerSays = async text => {
  await page.evaluate(spoken => window.__voiceFake.say(spoken), text);
  // The learner's words are never on screen: not the composer, not a bubble, not the caption.
  await page.waitForTimeout(250);
  assert.ok(!(await page.locator('body').innerText()).includes(text), `the learner's words never render: ${text}`);
};
const setTts = ms => page.evaluate(value => window.__voiceFake.setTtsMs(value), ms);
// A voice turn reads the selected card as its target, as a typed one does (fit the board, press the card's drag strip).
const select = async id => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(600);
  await page.locator('[data-block-id]:not([data-chat-block])', { hasText: cardModule(id).scene.title }).first().locator('[data-drag-zone]').last().click(); await page.waitForTimeout(300);
  // Back to 100% for the review screenshots; the selection stays.
  await page.keyboard.press('Shift+Digit0'); await page.waitForTimeout(600);
};

await page.goto(APP ? `${BASE}/apps/${APP}?tab=learn&experience=tutor&voice=fake` : `${BASE}/apps/${root.name}?board=${TUTOR_BOARD}&voice=fake`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await page.waitForTimeout(1500);

// 1. Text Mode: the neutral mic sits at the end of the dock composer.
const mic = page.getByRole('button', { name: 'Voice mode', exact: true });
await mic.waitFor();
assert.equal(await field().count(), 0);
await shot('01-text-mode-neutral-mic');

// 2. VOICE-01: click -> Voice Mode ON, listening, red breathing mic, no typing field.
await mic.click();
await waitState('listening');
assert.ok(await page.locator('[data-voice-field] .voice-breathe').count(), 'the red mic breathes');
assert.equal(await page.locator('[data-learn-dock] input:not([type="file"]), [data-learn-dock] textarea').count(), 0, 'no typing field while voice is on');
assert.equal(await caption().count(), 0, 'nothing said yet: no caption window');
await shot('02-voice-on');

// 3-5. A normal question: listening (no transcript) -> thinking (mic still red) -> Tutor speaking with the
// left caption, the canvas acting at the same time.
let release; hold = new Promise(resolve => { release = resolve; });
nextPlan = () => ({ strategy: 'none', move: 'go_deeper', reason: 'explicit request', explicit_request: 'show me where this happens in the code',
  actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, say('Here it is. Notice the division right before softmax.')] });
await setTts(4000);
await learnerSays('Show me where this happens in the code.');
await shot('03-listening-no-transcript');
await waitState('thinking');
assert.ok(await page.locator('[data-voice-field] .voice-breathe').count(), 'still red while thinking');
await shot('04-thinking');
release(); hold = null;
await waitState('speaking');
await caption().getByText('Here it is. Notice the division right before softmax.').waitFor();
assert.equal(plans.at(-1).learner_intent.input_modality, 'voice', 'the plan context marks a voice turn (v2 learner_intent)');
assert.equal(plans.at(-1).learner_intent.raw_user_message, 'Show me where this happens in the code.', 'the same Tutor turn as typed input');
await shot('05-tutor-speaking-caption-and-card');
await waitState('listening');

// 6-7. Clarification asked aloud; the learner answers by voice; the answer stays invisible.
nextPlan = () => ({ strategy: 'none', move: 'clarify', reason: '', actions: [say('Do you mean the causal mask or the softmax step?')] });
await setTts(2500);
await learnerSays('Explain this.');
await waitState('speaking');
await caption().getByText('Do you mean the causal mask or the softmax step?').waitFor();
// A small window at the surface's lower left, with only the reply being spoken now (owner, 2026-10-01).
const box = await caption().boundingBox(), surfaceBox = await page.locator('[data-canvas-surface]').boundingBox();
assert.ok(box.width <= 300 && box.height <= 180, 'a small window');
assert.ok(box.x - surfaceBox.x <= 16 && surfaceBox.y + surfaceBox.height - (box.y + box.height) <= 16, 'at the lower left of the canvas');
assert.equal(await caption().getByText('Here it is.').count(), 0, 'no history of earlier replies');
await shot('06-clarification');
await waitState('listening');
nextPlan = () => ({ strategy: 'feynman', move: 'explain', reason: '', actions: [say('The mask hides future positions before softmax, so they get no weight.')] });
let release2; hold = new Promise(resolve => { release2 = resolve; });
await learnerSays('The mask.');
await shot('07-learner-answering-no-transcript');
release2(); hold = null;
await waitState('speaking');
await waitState('listening');

// 8. The authored card shown while the Tutor speaks.
nextPlan = () => ({ strategy: 'none', move: 'go_deeper', reason: 'explicit request', explicit_request: 'show me the implementation',
  actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, say('This is the implementation. Look at the line that divides by the square root of the head size.')] });
await setTts(4000);
await learnerSays('Show me the implementation.');
await waitState('speaking');
await shot('08-card-while-speaking');
await waitState('listening');

// 9. A quiz question asked aloud; the spoken answer is evaluated as free text.
nextPlan = () => ({ strategy: 'socrates', move: 'check', reason: '', actions: [{ type: 'ask_question', text: 'Which positions can token three attend to?', claim: 'attention/looks-back-never-ahead', purpose: 'check' }] });
await setTts(2500);
await learnerSays('Quiz me on the mask.');
await waitState('speaking');
await caption().getByText('Which positions can token three attend to?').waitFor();
await shot('09-quiz-question');
await waitState('listening');
nextEvaluation = () => ({ status: 'settled', evaluator: 'jev', events: [event('attention/looks-back-never-ahead', 'attention', { result: 'pass', kind: 'demonstrated_here' })] });
nextPlan = () => ({ strategy: 'feynman', move: 'ack', reason: '', actions: [say('Exactly: one, two and three, never later ones.')] });
const evaluatedBefore = evaluations.length;
await learnerSays('One, two, and three.');
await waitState('speaking');
await waitState('listening');
assert.ok(evaluations.length > evaluatedBefore || plans.at(-1).learner_intent.kind === 'answer', 'the spoken answer went through the evaluator path');

// 10. A Rabbit Hole suggestion: offered in the caption, never taken by itself.
await select('depth-attention-guided');
const before = page.url();
nextEvaluation = () => ({ status: 'settled', evaluator: 'jev', events: [event('attention/weights-from-scores', 'attention', { result: 'gap', prerequisite: 'softmax' })] });
nextPlan = () => ({ strategy: 'none', move: 'prerequisite', reason: '', actions: [say("There's one softmax idea blocking this. We can go deeper into that first."), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }] });
await setTts(3000);
await learnerSays("Why do the weights add up to one? Why isn't the score the weight?");
await waitState('speaking');
await caption().locator('[data-dive-suggestion]').waitFor();
// The suggestion's buttons stay fully inside the small window, under the reply.
const win = await caption().boundingBox();
for (const name of ['Go down a Rabbit Hole', 'Keep it on this canvas']) {
  const button = await caption().getByRole('button', { name }).boundingBox();
  assert.ok(button.y >= win.y && button.y + button.height <= win.y + win.height, name + ' is in view');
}
await shot('10-rabbit-hole-suggestion');
await waitState('listening');
assert.equal(page.url(), before, 'no automatic dive');

// 11. Manual interruption: Stop speaking cuts the audio and listening resumes, Voice stays on.
nextPlan = () => ({ strategy: 'feynman', move: 'explain', reason: '', actions: [say('Softmax exponentiates every score and divides by their sum, so the weights are positive and add up to one, which is why they can be read as how much each earlier character counts.')] });
await setTts(20000);
await learnerSays('Tell me about softmax.');
await waitState('speaking');
await page.getByRole('button', { name: 'Stop speaking' }).click();
await waitState('listening');
await shot('11-interrupted-listening');

// VOICE-22: a TTS failure keeps the caption and the canvas, then listens again.
await page.evaluate(() => window.__voiceFake.failTts(true));
nextPlan = () => ({ strategy: 'feynman', move: 'explain', reason: '', actions: [say('The scale keeps the scores small enough for softmax to stay soft.')] });
await learnerSays('Why scale the scores?');
await caption().getByText('The scale keeps the scores small enough').waitFor();
await waitState('listening');
await page.evaluate(() => window.__voiceFake.failTts(false));

// 12. VOICE-18: the red mic turns Voice Mode off; the normal composer returns.
await page.getByRole('button', { name: 'Voice mode on - turn off' }).click();
await page.getByRole('button', { name: 'Voice mode', exact: true }).waitFor();
assert.equal(await field().count(), 0);
assert.equal(await caption().count(), 0, 'the caption rail leaves with Voice Mode');
assert.ok(await page.locator('[data-learn-dock] input:not([type="file"]), [data-learn-dock] textarea').count(), 'the typing field is back');
await shot('12-voice-off-composer-restored');

// VOICE-20: Text -> Voice works again; VOICE-21: an STT failure ends Voice with its message, nothing faked.
await page.getByRole('button', { name: 'Voice mode', exact: true }).click();
await waitState('listening');
await page.evaluate(() => window.__voiceFake.failStt('error'));
await page.locator('[data-voice-error]').waitFor();
await page.getByRole('button', { name: 'Voice mode', exact: true }).waitFor();
await shot('13-stt-failure');

// Telemetry: one turn_id per voice turn, ids and timings only.
const events = await page.evaluate(() => window.__voiceEvents);
const turns = events.filter(entry => entry.name === 'voice_turn');
const names = new Set(events.map(entry => entry.name));
for (const name of ['voice_mode_enter', 'stt_commit', 'tutor_request_start', 'tts_request_start', 'tts_play_start', 'tts_play_end', 'voice_listening_resumed', 'voice_mode_exit']) assert.ok(names.has(name), `telemetry ${name}`);
const said = ['Show me where this happens', 'Explain this', 'The mask', 'Quiz me', 'One, two', 'add up to one', 'Tell me about softmax', 'Why scale'];
const dump = JSON.stringify(events);
for (const words of said) assert.ok(!dump.includes(words), `telemetry carries no learner words: ${words}`);
assert.equal(voiceRequests.length, 0, `no request reached a paid voice route: ${voiceRequests.join(', ')}`);
assert.deepEqual(errors, []);
console.log(JSON.stringify({ ok: true, plans: plans.length, evaluations: evaluations.length, voiceEvents: events.length, turnsWithTimings: turns.length }));
await browser.close();
