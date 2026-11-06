// Voice mic browser check (docs/features/voice-tutor-mvp.md) against the LOCAL stack only.
// Tutor cleanup P2 removed the browser Tutor, and with it every Tutor voice turn (the scripted STT -> plan -> caption -> TTS walk,
// the spoken quiz answer, the Rabbit Hole suggestion in the caption). What stays is the composer mic: it renders in its paused
// state (useVoiceSession returns the frozen paused object without a Tutor), does nothing when pressed, and no voice turn path
// exists. Nothing paid runs here:
// - Every /api/learn/voice/* request is aborted, and the run asserts that none was made.
// - Every Tutor route (plan, evaluate, handoff) is aborted, and the run asserts that none was made.
// - ?voice=fake is passed so a leftover scripted session would show itself; none exists, so window.__voiceFake stays undefined.
//   node e2e/voice-check.mjs [outDir]
// Env: VOICE_BASE (the app, default http://127.0.0.1:8798) and SMALL_CP (the control plane, default http://127.0.0.1:8799).
// ponytail: the TTS narration and the streamed Fish playback are covered by voice-tts-stream-check.mjs (no Tutor needed); a new
// voice turn path has no executable check until the rebuild binds one to the mic.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.VOICE_BASE || 'http://127.0.0.1:8798';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('voice-check runs against the local stack only');
const OUT = process.argv[2] || 'voice-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8799';
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const cookie = `small_session=${session}`;
const root = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Attention (Voice)' }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(() => { window.__voiceEvents = []; window.addEventListener('small:tutor-voice', event => window.__voiceEvents.push(event.detail)); });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { await page.waitForTimeout(350); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

// ---- no paid provider and no Tutor route, ever: both are aborted and counted ----
const voiceRequests = [], tutorRequests = [];
await page.route('**/api/learn/voice/**', route => { voiceRequests.push(route.request().url()); return route.abort(); });
await page.route(/\/api\/learn\/tutor\/(plan|evaluate|handoff)$/, route => { tutorRequests.push(route.request().url()); return route.abort(); });

const composerField = () => page.locator('[data-chat-pane] [data-chat-composer] :is(textarea, input:not([type="file"]))');
const pausedMic = () => page.getByRole('button', { name: 'Voice mode is paused', exact: true });

await page.goto(`${BASE}/apps/${root.name}?voice=fake`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
await composerField().first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

// 1. The mic is there, paused: it says so, is disabled for assistive tech, and the typing field stays.
await pausedMic().waitFor();
assert.equal(await pausedMic().getAttribute('aria-disabled'), 'true', 'the paused mic is aria-disabled');
assert.equal(await page.locator('[data-voice-paused]').count(), 1, 'one paused mic');
assert.equal(await page.getByRole('button', { name: 'Voice mode', exact: true }).count(), 0, 'no live mic to turn Voice Mode on');
assert.ok(await composerField().count(), 'the typing field is present');
await shot('01-paused-mic');

// 2. Pressing it does nothing: no Voice Mode, no listening state, no caption window, no scripted session.
await pausedMic().click({ force: true });
await page.waitForTimeout(800);
assert.equal(await page.locator('[data-voice-state]').count(), 0, 'no voice state after the press');
assert.equal(await page.locator('[data-tutor-caption]').count(), 0, 'no Tutor caption');
assert.equal(await page.locator('[data-voice-field]').count(), 0, 'no voice field replaces the composer');
assert.ok(await composerField().count(), 'the typing field is still there');
assert.equal(await page.evaluate(() => typeof window.__voiceFake), 'undefined', 'no scripted voice session exists');
await shot('02-after-press');

// 3. Tutor mode (the saved canvas control) does not bring a voice turn path back: the mic stays paused.
await page.locator('[data-chat-pane]').getByRole('button', { name: 'Mode', exact: true }).click();
await page.getByRole('menuitemradio', { name: /^Tutor/ }).click();
await page.waitForTimeout(800);
await pausedMic().waitFor();
assert.equal(await page.locator('[data-voice-state]').count(), 0, 'no voice state in Tutor mode');
await shot('03-tutor-mode-paused-mic');

// 4. Nothing reached a paid voice route or a Tutor route, and nothing was emitted as voice telemetry.
const events = await page.evaluate(() => window.__voiceEvents);
assert.deepEqual(events, [], 'no voice telemetry event');
assert.equal(voiceRequests.length, 0, `no request reached a paid voice route: ${voiceRequests.join(', ')}`);
assert.equal(tutorRequests.length, 0, `no request reached a Tutor route: ${tutorRequests.join(', ')}`);
assert.deepEqual(errors, []);
console.log(JSON.stringify({ ok: true, voiceRequests: voiceRequests.length, tutorRequests: tutorRequests.length, voiceEvents: events.length }));
await browser.close();
