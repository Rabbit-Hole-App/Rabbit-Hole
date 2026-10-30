// Explain-back media: the retained voice note on the answer card and the Sketch recording in the Sketch panel, against a
// LOCAL stack only, on a dev-flag build (the Insert lesson block menu). Chromium's fake microphone supplies the audio
// (--use-fake-device-for-media-stream, --use-fake-ui-for-media-stream), so no person and no real device is involved.
// Uploads to the private attempt-asset route and the attempt submission are stubbed in the page: nothing is stored on the
// stack, no transcription or model is called. Every getUserMedia call is counted.
// Spec: docs/superpowers/plans/2026-10-30-explain-back.md sections 3, 5 and 12 (voice-only, no dictation into the answer
// field, Submit blocked while recording, silent Sketch recording without the microphone, the two-minute limit).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/explain-back-media-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromeFloor } from './canvas-reveal.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('explain-back-media-check runs against a local stack only');
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
const OUT = process.argv[2] || 'explain-back-media-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'learner@example.com', secret }) })).json();
const cookie = `small_session=${session}`;
const canvas = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Explain back media' }) })).json();

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
// The private attempt assets (D: PUT /api/learn/tutor/attempts/assets?...) and the submission (POST /api/learn/tutor/attempts),
// stubbed and recorded. Reads and binding go to the stack.
const uploads = [], submissions = [];
const stored = new Map();
async function stub(page) {
  await page.addInitScript(() => {
    window.__gum = 0;
    const devices = navigator.mediaDevices;
    const real = devices.getUserMedia.bind(devices);
    devices.getUserMedia = constraints => { window.__gum++; return real(constraints); };
  });
  await page.route('**/api/learn/tutor/attempts/assets**', async route => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const url = new URL(request.url());
      const bytes = request.postDataBuffer() || Buffer.alloc(0);
      const assetId = `aa_check${String(uploads.length + 1).padStart(8, '0')}`;
      uploads.push({ url: url.pathname + url.search, type: request.headers()['content-type'] || '', bytes });
      stored.set(assetId, { bytes, type: request.headers()['content-type'] || 'application/octet-stream' });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ asset: { assetId, revision: 1, sha256: url.searchParams.get('sha256'), bytes: bytes.length, mime: request.headers()['content-type'] || null } }) });
      return;
    }
    const id = new URL(request.url()).pathname.split('/').pop();
    const hit = stored.get(id);
    await route.fulfill(hit ? { status: 200, contentType: hit.type, body: hit.bytes } : { status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
  });
  await page.route('**/api/learn/tutor/attempts', async route => {
    const request = route.request();
    if (request.method() !== 'POST') { await route.continue(); return; }
    submissions.push(JSON.parse(request.postData() || 'null'));
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'No assessment in this check', code: 'stubbed' }) });
  });
}

const results = [];
let page;
const check = async (label, fn) => {
  try { await fn(); } catch (error) { await page.screenshot({ path: `${OUT}/FAIL-${label.split(' ')[0]}.png` }).catch(() => {}); throw error; }
  results.push(label); console.log(`ok ${label}`);
};
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const cards = () => page.locator('[data-block-id]:not([data-chat-block])');
const insert = async label => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.waitForTimeout(600);
  const node = cards().last();
  await node.scrollIntoViewIfNeeded();
  return node;
};
const box = locator => locator.boundingBox();
const reveal = async locator => {
  const surface = await box(page.locator('[data-canvas-surface]'));
  const card = await box(locator);
  const floor = Math.min(surface.y + surface.height, await chromeFloor(page, card.x, card.x + card.width));
  const over = card.y + card.height - (floor - 40), under = surface.y + 40 - card.y;
  const delta = over > 0 ? Math.min(over, -under) : under > 0 ? -under : 0;
  if (!delta) return;
  await page.mouse.move(card.x + card.width + 10, surface.y + surface.height / 2);
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(300);
};
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + (to.x - from.x) * step / 8, from.y + (to.y - from.y) * step / 8);
  await page.mouse.up(); await page.waitForTimeout(150);
};
const tool = name => page.locator(`[aria-label="Canvas tools"] button[aria-label="${name}"]`);
const gum = () => page.evaluate(() => window.__gum);
const field = card => card.locator('textarea[data-eb-answer]');
const submitOf = card => card.locator('[data-eb-submit]');
const voiceOf = card => card.locator('[data-eb-voice] [data-voice-note]');
const voiceState = card => voiceOf(card).getAttribute('data-voice-note');
const waitVoice = async (card, status, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await voiceState(card).catch(() => null) === status) return; await page.waitForTimeout(100); }
  assert.fail(`the voice note never reached ${status} (now ${await voiceState(card).catch(() => 'absent')})`);
};
const isAudio = bytes => (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) || bytes.subarray(0, 4).toString('latin1') === 'OggS' || bytes.subarray(4, 8).toString('latin1') === 'ftyp';
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, permissions: ['microphone'] });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const next = await context.newPage();
  next.on('pageerror', error => errors.push(error.message));
  await stub(next);
  return next;
};
const load = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 });
  await page.waitForTimeout(1500);
};

page = await open();
await load();

// ---- no dictation into the answer field: typed text byte-for-byte unchanged through record, stop, replay, remove, re-record ----
const TYPED = '  Pendulum: T = 2π√(L/g)\n\tthe bob swings — faster when L is short  ';
const typed = await insert('Explain back');
await reveal(typed);
await check('voice offered on the card with Sketch closed', async () => {
  assert.equal(await typed.locator('[data-eb-voice]').count(), 1, 'Record voice is offered: the page wires ExplainBackService.voice.upload');
  assert.equal(await typed.locator('[data-speak-answer]').count(), 0, 'no dictation button on Explain-back');
  assert.equal(await page.locator('[data-explain-sketch-panel]').count(), 0);
  assert.equal(await gum(), 0, 'nothing asks for the microphone before Record voice');
});
await field(typed).fill(TYPED);
const same = async step => assert.equal(await field(typed).inputValue(), TYPED, `typed text changed after ${step}`);
await check('typed text unchanged through record, stop, replay, remove and re-record', async () => {
  await typed.locator('[data-voice-record]').click();
  await waitVoice(typed, 'recording');
  assert.equal(await gum(), 1, 'the microphone is asked for on Record voice');
  await same('record');
  await page.waitForTimeout(1200);
  await typed.locator('[data-voice-pause]').click();
  await waitVoice(typed, 'paused');
  await typed.locator('[data-voice-pause]').click();
  await waitVoice(typed, 'recording');
  await page.waitForTimeout(800);
  await typed.locator('[data-voice-stop]').click();
  await waitVoice(typed, 'saved');
  await same('stop and save');
  const upload = uploads.at(-1);
  assert.ok(upload, 'the take was uploaded as a private attempt asset');
  assert.ok(isAudio(upload.bytes), `the recorded bytes are WebM, Ogg or MP4 audio (got ${upload.type}, ${upload.bytes.subarray(0, 8).toString('hex')})`);
  assert.match(upload.type, /^audio\/(webm|ogg|mp4)/);
  assert.match(await typed.locator('[data-voice-time]').innerText(), /^0:00 \/ 0:0[1-9]$/, 'a duration from the recorder, not Infinity');
  await typed.locator('[data-voice-play]').click();
  await page.waitForTimeout(800);
  await same('replay');
  await typed.locator('[data-voice-seek]').fill('500');
  await same('scrub');
  await typed.locator('[data-voice-remove]').click();
  await waitVoice(typed, 'idle');
  await same('remove');
  await typed.locator('[data-voice-record]').click();
  await waitVoice(typed, 'recording');
  await page.waitForTimeout(800);
  await typed.locator('[data-voice-stop]').click();
  await waitVoice(typed, 'saved');
  await typed.locator('[data-voice-rerecord]').click();
  await waitVoice(typed, 'recording');
  await page.waitForTimeout(800);
  await typed.locator('[data-voice-stop]').click();
  await waitVoice(typed, 'saved');
  await same('re-record');
});
await shot('01-voice-note-with-text');

// ---- Submit is blocked while recording or paused, even with typed text ----
await check('Submit blocked while recording', async () => {
  assert.equal(await submitOf(typed).isDisabled(), false, 'typed text + a saved note can be submitted');
  await typed.locator('[data-voice-rerecord]').click();
  await waitVoice(typed, 'recording');
  assert.ok(await submitOf(typed).isDisabled());
  assert.equal(await typed.locator('[data-eb-submit-reason]').innerText(), 'Stop recording to submit');
  await typed.locator('[data-voice-pause]').click();
  await waitVoice(typed, 'paused');
  assert.ok(await submitOf(typed).isDisabled());
  assert.equal(await typed.locator('[data-eb-submit-reason]').innerText(), 'Stop recording to submit');
  await typed.locator('[data-voice-cancel]').click();
  await waitVoice(typed, 'saved');
  assert.equal(await submitOf(typed).isDisabled(), false, 'cancel keeps the earlier note');
  await same('cancelled re-record');
});

// ---- voice alone is a complete answer: empty text, Sketch never opened ----
const voiceOnly = await insert('Explain back');
await reveal(voiceOnly);
await check('voice-only answer can be submitted with empty text and Sketch never opened', async () => {
  assert.equal(await field(voiceOnly).inputValue(), '');
  assert.ok(await submitOf(voiceOnly).isDisabled(), 'an empty draft cannot be submitted');
  await voiceOnly.locator('[data-voice-record]').click();
  await waitVoice(voiceOnly, 'recording');
  await page.waitForTimeout(1000);
  await voiceOnly.locator('[data-voice-stop]').click();
  await waitVoice(voiceOnly, 'saved');
  assert.equal(await submitOf(voiceOnly).isDisabled(), false, 'the saved note alone enables Submit');
  assert.equal(await page.locator(`[data-explain-sketch-panel="${await voiceOnly.getAttribute('data-block-id')}"]`).count(), 0, 'Sketch was never opened');
  assert.equal(await field(voiceOnly).inputValue(), '', 'no transcript or filler went into the field');
  await submitOf(voiceOnly).click();
  await page.waitForTimeout(800);
  const sent = JSON.stringify(submissions.at(-1) ?? null);
  assert.match(sent, /"role":"voice"/, 'the submission carries the voice EvidenceRef');
  assert.match(sent, /"assetId":"aa_check\d{8}"/);
  assert.match(sent, /"text":""/, 'the typed answer stays empty');
  assert.equal(await field(voiceOnly).inputValue(), '', 'a refused submission keeps the draft');
  await voiceOnly.locator('[data-eb-voice] [data-voice-note="saved"]').waitFor({ timeout: 5000 });
  // ponytail: the stubbed refusal is not checked against a reviewed attempt; the stack's assessment is A/P's check.
  await voiceOnly.locator('[data-voice-remove]').click();
  await waitVoice(voiceOnly, 'idle');
  assert.ok(await submitOf(voiceOnly).isDisabled(), 'removing the only note makes the empty answer non-submittable again');
});
await shot('02-voice-only');

// ---- silent Sketch recording never asks for the microphone; one microphone owner ----
const sketchCard = await insert('Explain back');
await reveal(sketchCard);
const sketchId = await sketchCard.getAttribute('data-block-id');
const panel = page.locator(`[data-explain-sketch-panel="${sketchId}"]`);
await check('silent Sketch recording records the drawing without the microphone', async () => {
  await sketchCard.locator('[data-sketch-toggle]').click();
  await panel.waitFor();
  const recorder = panel.locator('[data-sketch-recorder]');
  assert.equal(await recorder.count(), 1, 'Sketch recording controls sit in the Sketch panel (U mounts SketchRecorder in its media slot)');
  assert.equal(await panel.locator('[data-sketch-record-audio]').getAttribute('aria-pressed'), 'false', 'Audio is off by default');
  const before = await gum();
  const uploadsBefore = uploads.length;
  await panel.locator('[data-sketch-record]').click();
  await panel.locator('[data-sketch-recorder="recording"]').waitFor();
  const surface = panel.locator(`[data-sketch="${sketchId}"]`);
  await surface.click({ position: { x: 200, y: 200 } });
  const s = await box(surface);
  await tool('Pen').click();
  await drag({ x: s.x + 30, y: s.y + 80 }, { x: s.x + 140, y: s.y + 120 });
  // A pen stroke is a mark of the draft once the mouse is released inside the panel (the content dot is committed marks only;
  // the recording has no saved take yet). Run 41032431618 showed the stroke still live until the next press outside it.
  await sketchCard.locator('[data-sketch-dot]').waitFor({ timeout: 3000 }).catch(() => {
    throw Error('a pen stroke drawn in the docked Sketch panel was not committed on mouse up, so the recording could not see it');
  });
  await page.waitForTimeout(700);
  await drag({ x: s.x + 40, y: s.y + 160 }, { x: s.x + 160, y: s.y + 170 });
  await page.waitForTimeout(300);
  await panel.locator('[data-sketch-record-stop]').click();
  await panel.locator('[data-sketch-recorder="saved"]').waitFor({ timeout: 15000 });
  assert.equal(await gum(), before, 'silent mode never called getUserMedia');
  const timeline = uploads.slice(uploadsBefore).find(upload => /json/.test(upload.type));
  assert.ok(timeline, 'the timeline was uploaded as one private asset');
  const parsed = JSON.parse(timeline.bytes.toString('utf8'));
  assert.equal(parsed.kind, 'sketch-timeline');
  assert.equal(parsed.narration, false);
  assert.ok(parsed.ops.length >= 2, `each drawn stroke is a timed step (${parsed.ops.length})`);
  assert.ok(parsed.ops.at(-1).t > parsed.ops[0].t, 'steps keep their order in time');
  assert.equal(await sketchCard.locator('[data-eb-voice] [data-voice-note]').getAttribute('data-voice-note'), 'idle');
});
await check('one microphone: narration is refused while a voice note records', async () => {
  await sketchCard.locator('[data-voice-record]').click();
  await waitVoice(sketchCard, 'recording');
  await panel.locator('[data-sketch-record-remove]').click();
  await panel.locator('[data-sketch-recorder="idle"]').waitFor();
  await panel.locator('[data-sketch-record-audio]').click();
  assert.equal(await panel.locator('[data-sketch-record-audio]').getAttribute('aria-pressed'), 'true');
  const before = await gum();
  await panel.locator('[data-sketch-record]').click();
  await panel.locator('[data-sketch-record-error="busy"]').waitFor({ timeout: 5000 });
  assert.equal(await gum(), before, 'the second recorder never asked for the microphone');
  await sketchCard.locator('[data-voice-stop]').click();
  await waitVoice(sketchCard, 'saved');
});
await shot('03-sketch-recording');
await page.context().close();

// ---- the two-minute limit, on the page's own clock (Playwright clock: time runs normally, then jumps) ----
page = await open();
await page.clock.install();
await load();
const limited = await insert('Explain back');
await reveal(limited);
await check('the two-minute limit stops cleanly and says so', async () => {
  await field(limited).fill(TYPED);
  await limited.locator('[data-voice-record]').click();
  await waitVoice(limited, 'recording');
  await page.waitForTimeout(800);
  await page.clock.fastForward('01:50');
  assert.match(await limited.locator('[data-voice-elapsed]').innerText(), /left$/, 'the last stretch shows the time left');
  await page.clock.fastForward('00:15');
  await waitVoice(limited, 'saved');
  assert.equal(await limited.locator('[data-eb-voice]').getByText('Stopped at the 2:00 limit.').count(), 1);
  assert.match(await limited.locator('[data-voice-time]').innerText(), /\/ 2:00$/);
  assert.equal(await field(limited).inputValue(), TYPED);
});
await shot('04-limit');

await check('no page errors', async () => assert.deepEqual(errors, []));
console.log(`${results.length}/${results.length} checks passed`);
await browser.close();
