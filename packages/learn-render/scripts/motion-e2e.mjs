// M7A browser proof on the LOCAL Motion stack (scripts/motion-local-check.mjs setup; the app built
// into dist-dev with VITE_MOTION_DEV=true; the development orchestrator on 8856). A learner types
// /motion in the Learn composer of a canvas titled "Attention" and everything after is the product
// path: the paid proposal, Generate, the existing video card as the placeholder, LearnVideos and the
// orchestrator, then the playable video in the SAME card, served from LEARN_MEDIA.
//
//   node scripts/motion-e2e.mjs full [shotsDir]      the real automatic run (orchestrator with model calls)
//   node scripts/motion-e2e.mjs stop [shotsDir]      orchestrator --stub <mp4>: Stop, then Retry to a video
//   node scripts/motion-e2e.mjs failure [shotsDir]   orchestrator --stub <mp4> --stub-fail authoring
//   MOTION_E2E_REQUEST='/motion 15s explain multinomial' node scripts/motion-e2e.mjs full [shotsDir]   another request
//
// Every mode also checks: no request before Generate, one start per Generate (no duplicate render), no
// Rabbit Hole created or entered, no artifact (model) call for /motion.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TUTOR_BOARD } from '../../web/src/learn-tutor-claims.js';

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(PKG, '..', '..');
const DIR = join(ROOT, '.small', 'motion-local');
const APP = 'http://127.0.0.1:8858', CP = 'http://127.0.0.1:8859';
// MOTION_E2E_REQUEST: another grounded request for a different-domain proof (e.g. /motion 15s explain multinomial).
const REQUEST = process.env.MOTION_E2E_REQUEST || '/motion 15s explain me softmax func';
const [mode = 'full', shotsArg] = process.argv.slice(2);
if (!['full', 'stop', 'failure'].includes(mode)) { console.error('usage: node scripts/motion-e2e.mjs full|stop|failure [shotsDir]'); process.exit(2); }
const shots = resolve(shotsArg || join(DIR, `m7a-${mode}`));
mkdirSync(shots, { recursive: true });
const vars = name => Object.fromEntries(readFileSync(join(DIR, name, '.dev.vars'), 'utf8').trim().split(/\r?\n/).map(l => l.split(/=(.*)/s).slice(0, 2)));
const t0 = Date.now();
// Orchestrator jobs finished during this run (out/motion/m7a-telemetry.jsonl): renders are counted there.
const TELEMETRY = join(PKG, 'out', 'motion', 'm7a-telemetry.jsonl');
const jobsSoFar = () => (existsSync(TELEMETRY) ? readFileSync(TELEMETRY, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const jobsBefore = jobsSoFar().length;
const elapsed = () => Math.round((Date.now() - t0) / 1000);
const log = line => console.log(`[${String(elapsed()).padStart(4)}s] ${line}`);

const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'motion-local@example.test', secret: vars('cp').TEST_BYPASS_SECRET }) })).json();
if (!session) throw new Error('no local session: is the sessions worker on 8859 running?');
const canvas = await (await fetch(`${APP}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Attention' }) })).json();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: APP }]);
const page = await context.newPage();
const net = { videoStarts: 0, videoStops: 0, artifact: 0, dives: 0, voice: 0 };
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', r => {
  const url = r.url(), post = r.method() === 'POST';
  if (post && url.includes('/api/learn/video?')) { const body = r.postData() || ''; if (body.includes('"action":"cancel"')) net.videoStops++; else if (!body.includes('"action"')) net.videoStarts++; }
  if (post && url.includes('/api/learn/artifact')) net.artifact++;
  if (post && url.includes('/api/canvases/dives')) net.dives++;
});
await page.route('**/api/learn/voice/**', route => { net.voice++; return route.abort(); });
const home = `${APP}/apps/${canvas.name}`;
await page.goto(home);
const shot = async (name, locator = page) => { await page.waitForTimeout(300); await locator.screenshot({ path: join(shots, `${name}.png`) }); log(`shot ${name}`); };

// 1. The learner types /motion: a paid proposal, and nothing has been asked of any server yet.
const input = page.locator('[data-learn-dock] [data-chat-composer] input:not([type="file"])');
await input.waitFor({ timeout: 60000 });
await input.click();
await page.keyboard.type(REQUEST, { delay: 15 });
await page.keyboard.press('Enter');
await page.locator('[data-paid-generate]').waitFor({ timeout: 15000 });
assert.equal(net.videoStarts + net.artifact, 0, 'nothing starts before Generate');
await shot('1-proposal', page.locator('[data-slash-result]'));
await shot('1-proposal-page', page);

// 2. Generate: the existing video card is the placeholder, already started.
await page.locator('[data-paid-generate]').click();
const card = page.locator('[data-block-id]', { hasText: `Motion: ${REQUEST.slice('/motion '.length)}` }).first();
await card.waitFor({ timeout: 15000 });
const blockId = await card.getAttribute('data-block-id');
await card.locator('[data-progress]').waitFor({ timeout: 15000 });
await card.locator('[data-stop-video]').waitFor({ timeout: 30000 });
log(`card ${blockId} generating`);
await shot('2-skeleton', card);
const same = () => page.locator(`[data-block-id="${blockId}"]`);
const result = { mode, canvas: canvas.name, block_id: blockId, checks: {} };

if (mode === 'stop') {
  await page.waitForTimeout(4000);
  await same().locator('[data-stop-video]').click();
  await same().getByText('Stopped.').waitFor({ timeout: 20000 });
  await same().getByRole('button', { name: 'Retry render' }).waitFor();
  result.checks.stopped_card = (await same().locator('video').count()) === 0;
  const list = await page.evaluate(async app => (await fetch(`/api/learn/video?app=${app}`)).json(), canvas.name);
  result.checks.stopped_job = list.videos.some(v => v.status === 'failed' && v.error === 'Stopped.' && v.retryable === true);
  await shot('3-stopped', same());
  // Retry is a new confirmed Generate: the card asks again, then runs to a video.
  await same().getByRole('button', { name: 'Retry render' }).click();
  await same().locator('[data-paid-generate]').click();
  await same().locator('video[data-lesson-video]').waitFor({ timeout: 300000 });
  result.checks.retry_to_video = true;
  await shot('4-after-retry', same());
}

if (mode === 'failure') {
  await same().getByText(/The Motion job failed/).waitFor({ timeout: 300000 });
  result.checks.failed_card = (await same().locator('video').count()) === 0 && (await same().getByRole('button', { name: 'Retry render' }).count()) === 1;
  const list = await page.evaluate(async app => (await fetch(`/api/learn/video?app=${app}`)).json(), canvas.name);
  result.checks.failed_job_retryable = list.videos.some(v => v.status === 'failed' && v.retryable === true && /stub: failed during authoring/.test(v.error));
  await shot('3-failed', same());
}

if (mode === 'full') {
  // 3. The real pipeline: planning, Author, preview, fresh reviews, at most one repair, the final render.
  for (let i = 0; ; i++) {
    if (await same().locator('video[data-lesson-video]').count()) break;
    const failedText = await same().locator('.text-red-700').allInnerTexts();
    if (failedText.length) throw new Error(`the card failed: ${failedText.join(' ')}`);
    if (i % 30 === 0) { log(`waiting (${await same().locator('[data-progress]').evaluate(n => n.parentElement?.nextElementSibling?.textContent || '').catch(() => '')})`); if (i % 120 === 0) await shot(`2-skeleton-${elapsed()}s`, same()); }
    if (elapsed() > 60 * 60) throw new Error('no video within 60 minutes');
    await page.waitForTimeout(10000);
  }
  log('video ready in the same card');
  const video = await same().locator('video[data-lesson-video]').evaluate(node => new Promise(done => {
    const report = () => done({ duration: node.duration, width: node.videoWidth, height: node.videoHeight, src: node.getAttribute('src') });
    if (node.readyState >= 1) return report();
    node.addEventListener('loadedmetadata', report, { once: true });
  }));
  for (const t of [0.5, 7, 14]) {
    await same().locator('video[data-lesson-video]').evaluate((node, at) => { node.currentTime = at; return new Promise(r => node.addEventListener('seeked', r, { once: true })); }, t);
    await shot(`3-ready-${t}s`, same());
  }
  await shot('4-canvas', page);
  const text = await same().innerText(), meta = await same().locator('[data-video-meta]').innerText();
  const telemetry = jobsSoFar().slice(jobsBefore).at(-1) ?? null;
  Object.assign(result, { video, card_text: text, meta, telemetry });
  Object.assign(result.checks, {
    same_card: (await page.locator('[data-block-id]', { has: page.locator('video[data-lesson-video]') }).count()) === 1,
    title_from_brief: !text.includes(`Motion: ${REQUEST.slice(8)}`) && text.split('\n').some(l => l.trim().length > 10 && !/^Video$/.test(l.trim())),
    meta: meta.includes('15s · Motion explainer · Remotion') && /model\.py:\d+/.test(meta),
    duration: Math.abs(video.duration - 15) < 0.2,
    width: video.width === 1920 && video.height === 1080,
    served_from_learn_media: /\/api\/learn\/video\?app=.*asset=[a-f0-9]{64}/.test(video.src),
  });
  // 4. Reload: the card is stored as a finished video; nothing starts again.
  const before = net.videoStarts;
  await page.reload();
  await same().locator('video[data-lesson-video]').waitFor({ timeout: 60000 });
  result.checks.reload_keeps_video_no_restart = net.videoStarts === before;
  // 5. Voice Mode exists where the Tutor runs (the Tutor board; a plain canvas offers no voice). The
  // same /motion there reuses the finished job (no new render); with voice on, the typing field (and
  // so /motion) is gone, and the Motion card still plays; turning voice on starts nothing.
  await page.goto(`${home}?board=${TUTOR_BOARD}&voice=fake`);
  await input.waitFor({ timeout: 60000 });
  await input.click();
  await page.keyboard.type(REQUEST, { delay: 15 });
  await page.keyboard.press('Enter');
  await page.locator('[data-paid-generate]').click();
  const tutorCard = page.locator('[data-block-id]', { has: page.locator('video[data-lesson-video]') }).first();
  await tutorCard.waitFor({ timeout: 120000 });
  result.checks.tutor_board_reuses_the_render = net.videoStarts === before + 1; // one confirmed start, served from the finished job
  const starts = net.videoStarts;
  await page.getByRole('button', { name: 'Voice mode', exact: true }).click();
  await page.locator('[data-voice-field]').waitFor({ timeout: 15000 });
  result.checks.voice_no_typing_field = (await page.locator('[data-learn-dock] input:not([type="file"]), [data-learn-dock] textarea').count()) === 0;
  result.checks.voice_card_plays = await tutorCard.locator('video[data-lesson-video]').evaluate(node => node.play().then(() => { node.pause(); return true; }, () => false));
  await shot('5-voice-mode', page);
  await page.getByRole('button', { name: 'Voice mode on - turn off' }).click();
  result.checks.voice_started_nothing = net.videoStarts === starts;
}

Object.assign(result.checks, {
  one_start_per_generate: net.videoStarts === (mode === 'failure' ? 1 : 2),
  // full: two Generates (the canvas, then the Tutor board) share ONE orchestrator job; stop: the stopped job and its retry.
  one_render_job: jobsSoFar().slice(jobsBefore).filter(j => j.request === REQUEST).length === (mode === 'stop' ? 2 : 1),
  no_artifact_model_call: net.artifact === 0,
  no_rabbit_hole: net.dives === 0 && new URL(page.url()).pathname === `/apps/${canvas.name}`,
  no_page_errors: errors.length === 0,
});
Object.assign(result, { network: net, page_errors: errors, seconds: elapsed(), shots });
console.log(JSON.stringify(result, null, 2));
writeFileSync(join(shots, 'result.json'), JSON.stringify(result, null, 2));
await browser.close();
process.exit(Object.values(result.checks).every(Boolean) ? 0 : 1);
