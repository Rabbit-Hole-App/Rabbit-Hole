// The NanoGPT Tutor in production (docs/features/production-tutor-entry.md): the Learn composer IS the Tutor on a
// karpathy/nanoGPT repository, in the PRODUCTION build (VITE_RABBIT_HOLE=true, no VITE_COACHING_DEV), against the
// LOCAL stack only. Setup as e2e/practice-check.mjs: a ready karpathy/nanoGPT repository app (PRACTICE_APP) owned by
// PRACTICE_EMAIL, and another (LEARNER_APP) for LEARNER_EMAIL - repositories are private to whoever imported them,
// so a learner always opens their own. Nothing here reaches a model: the Tutor routes are scripted, voice and ask
// are refused.
//   PRACTICE_BASE=http://127.0.0.1:8788 SMALL_CP=http://127.0.0.1:8790 node e2e/tutor-entry-check.mjs [outDir]
// It proves:
//   1. Opening the project lands on Learn, whose composer is the Tutor (mic, a typed turn on /api/learn/tutor), for
//      the owner and a learner alike; no Overview/Learn/Map pill, Tutor or Practice button; the Map is one icon; a
//      Rabbit Hole keeps the Tutor and climbs back to it.
//   2. ?board= stays dead in production: no review board (the Tutor slice's included) opens from a URL.
//   3. ?voice=fake is ignored: the mic takes the real Voice path (a scribe token request, refused here), no fake.
//   4. The build is the production one: no review-only code reached the browser.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { BOARDS } from '../src/demo-scenes.js';

const BASE = process.env.PRACTICE_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('tutor-entry-check runs against the local stack only');
const APP = process.env.PRACTICE_APP || 'repo-nanogpt';
const PEOPLE = [[process.env.PRACTICE_EMAIL || 'owner@example.com', APP], [process.env.LEARNER_EMAIL || 'learner@example.com', process.env.LEARNER_APP || 'repo-nanogpt-learner']];
const OUT = process.argv[2] || 'tutor-entry-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
// What only a review build carries (e2e/production-bundle-check.mjs DEV_MARKERS, plus the review-board notice).
const REVIEW_ONLY = ['No review board is registered', 'Review fixtures are on', 'Insert a sample lesson block', 'Agent workspace', 'Quiz answer key', 'Edit and approve curriculum', '__voiceFake', 'failStt'];
// Every review board's card titles: none may open from a URL.
const titlesOf = name => BOARDS[name]().map(block => block.title || block.scene?.title).filter(Boolean);

// A fake microphone device (Chromium's, not the app's), so the real Voice path can start without hardware.
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [], scripts = new Map();
const results = {};

async function personPage(email) {
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json();
  assert.ok(session, `a session for ${email}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['microphone'] });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${email}: ${error.message}`));
  page.on('response', async response => { if (/\.js(\?|$)/.test(response.url()) && !scripts.has(response.url())) scripts.set(response.url(), await response.text().catch(() => '')); });
  const traffic = { plans: [], evaluations: [], refused: [] };
  await page.route('**/api/learn/tutor/evaluate', async route => { traffic.evaluations.push(route.request().postDataJSON()); await route.fulfill({ json: { status: 'settled', evaluator: 'jev', events: [] } }); });
  await page.route('**/api/learn/tutor/plan', async route => {
    const body = route.request().postDataJSON(), { stream } = body;
    traffic.plans.push(body);
    const plan = { strategy: 'feynman', move: 'explain', reason: '', actions: [{ type: 'respond_text', text: 'Each position looks back at the earlier ones, never ahead.' }] };
    if (stream) await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'plan', ...plan }) + '\n' });
    else await route.fulfill({ json: plan });
  });
  await page.route(/\/api\/(learn\/(ask|voice|assess)|chat)/, route => { if (route.request().method() === 'GET') return route.continue(); traffic.refused.push(route.request().url()); return route.abort(); });
  return { page, traffic, close: () => context.close() };
}
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
const mic = page => page.getByRole('button', { name: 'Voice mode', exact: true });
const cardTitles = page => page.locator('[data-block-id]:not([data-chat-block])').allInnerTexts();
const settle = page => page.waitForSelector('[data-tool-gutter]', { timeout: 30000 }).then(() => page.waitForTimeout(1500));
const composer = page => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();

// 1. The project opens on Learn, and its composer is the Tutor: the owner and a learner get the same.
for (const [index, [email, app]] of PEOPLE.entries()) {
  const who = index ? 'learner' : 'owner';
  const { page, traffic, close } = await personPage(email);
  await page.goto(`${BASE}/apps/${app}`);
  await settle(page);
  await mic(page).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-project-tabs]').count(), 0, `${who}: no Overview/Learn/Map pill on the canvas`);
  assert.equal(await page.locator('[data-learn-tutor], [data-learn-practice]').count(), 0, `${who}: no Tutor or Practice button`);
  assert.equal(await page.locator('[data-learn-map]').count(), 1, `${who}: the Map is one icon`);
  await shot(page, `${who}-1-learn`);

  // A typed turn is a Tutor turn: /api/learn/tutor, for this repository, never /api/learn/ask.
  await composer(page).fill('Which characters does one position look at?');
  await composer(page).press('Enter');
  await page.getByText('Each position looks back at the earlier ones, never ahead.').first().waitFor({ timeout: 15000 });
  const plan = traffic.plans.at(-1);
  assert.ok(plan, `${who}: a Tutor plan request`);
  assert.equal(plan.app, app, `${who}: the plan is for ${app}`);
  assert.equal(plan.context.learner_intent.raw_user_message, 'Which characters does one position look at?', `${who}: the typed words`);
  assert.deepEqual(traffic.refused, [], `${who}: nothing went to ask, voice or grading`);
  await shot(page, `${who}-2-typed-turn`);

  // A Rabbit Hole under the course keeps the Tutor and climbs back to the course canvas.
  await composer(page).fill('/dive softmax'); await composer(page).press('Enter');
  await page.waitForURL(url => url.searchParams.has('hole'), { timeout: 20000 });
  await page.waitForTimeout(2000);
  assert.equal(await mic(page).count(), 1, `${who}: the hole keeps the Tutor`);
  await shot(page, `${who}-3-hole`);
  await page.locator('[data-dive-navigator] [data-dive-level]').first().click();
  await page.waitForURL(url => url.pathname === `/apps/${app}` && !url.searchParams.has('hole') && !url.searchParams.has('board'));
  await settle(page);
  await mic(page).waitFor({ timeout: 15000 });

  // The Map is one click away, and Learn one click back.
  await page.locator('[data-learn-map]').click();
  await page.waitForURL(url => url.searchParams.get('tab') === 'map');
  await page.locator('[data-project-tabs] [role="tab"]', { hasText: 'Learn' }).click();
  await settle(page);
  await mic(page).waitFor({ timeout: 15000 });
  results[who] = { plans: traffic.plans.length, evaluations: traffic.evaluations.length };
  await close();
}
assert.deepEqual(results.learner, results.owner, 'the owner and a learner get the same Tutor');

// 2. URLs open no review board: every one (the Tutor slice's included) by ?board=.
const { page, close } = await personPage(PEOPLE[0][0]);
const blocked = Object.keys(BOARDS).map(name => `board=${name}`);
for (const query of blocked) {
  await page.goto(`${BASE}/apps/${APP}?tab=learn&${query}`);
  await settle(page);
  const body = await page.locator('body').innerText();
  for (const marker of REVIEW_ONLY) assert.ok(!body.includes(marker), `${query}: ${marker}`);
  const texts = (await cardTitles(page)).join('\n');
  for (const name of Object.keys(BOARDS)) for (const title of titlesOf(name)) assert.ok(!texts.includes(title), `${query}: ${name} card "${title}" must not open`);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  for (const name of Object.keys(BOARDS)) assert.ok(!keys.some(key => key.includes(`:${name}:`)), `${query}: no ${name} storage`);
}
await shot(page, '4-board-url-ignored');
await close();

// 3. ?voice=fake: production ignores it. The mic starts the REAL Voice path (its token request, refused here so
// nothing is paid), and no scripted session or window.__voiceFake exists.
{
  const { page, traffic, close } = await personPage(PEOPLE[0][0]);
  await page.goto(`${BASE}/apps/${APP}?voice=fake`);
  await settle(page);
  await mic(page).click();
  for (let i = 0; i < 100 && !traffic.refused.some(url => url.includes('/api/learn/voice/scribe-token')); i++) await page.waitForTimeout(100);
  assert.ok(traffic.refused.some(url => url.includes('/api/learn/voice/scribe-token')), `?voice=fake still takes the real Voice path: ${traffic.refused.join(', ')}`);
  assert.equal(await page.evaluate(() => typeof window.__voiceFake), 'undefined', 'no fake Voice harness in production');
  await shot(page, '5-voice-fake-ignored');
  results.voiceFakeIgnored = true;
  await close();
}

// 4. The production build: no review-only code reached the browser.
for (const [url, source] of scripts) for (const marker of REVIEW_ONLY) assert.ok(!source.includes(marker), `${marker} in ${url}`);
assert.deepEqual(errors, [], 'page errors');
console.log(JSON.stringify({ ok: true, ...results, blockedUrls: blocked.length, scripts: scripts.size }));
await browser.close();
