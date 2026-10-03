// The NanoGPT Tutor as a product experience (docs/features/production-tutor-entry.md), in the PRODUCTION build
// (VITE_RABBIT_HOLE=true, no VITE_COACHING_DEV), against the LOCAL stack only. Setup as e2e/practice-check.mjs:
// a ready karpathy/nanoGPT repository app (PRACTICE_APP) owned by PRACTICE_EMAIL, and another (LEARNER_APP) for
// LEARNER_EMAIL - repositories are private to whoever imported them, so a learner always opens their own. Nothing here reaches a model: the Tutor routes are scripted, voice and ask are refused.
//   PRACTICE_BASE=http://127.0.0.1:8788 SMALL_CP=http://127.0.0.1:8790 node e2e/tutor-entry-check.mjs [outDir]
// It proves:
//   1. Repository -> Learn -> Tutor reaches the Tutor (cards, mic, a typed turn on /api/learn/tutor), for the
//      owner and a learner alike; a Rabbit Hole under it climbs back to it; Back to lesson returns to the normal
//      lesson with Practice.
//   2. ?board= stays dead in production: no review board (the Tutor's included) opens from a URL, and no
//      unlisted ?experience= does either.
//   3. The build is the production one: no review-only code reached the browser.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { BOARDS } from '../src/demo-scenes.js';
import { TUTOR_BOARD } from '../src/learn-tutor-claims.js';

const BASE = process.env.PRACTICE_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('tutor-entry-check runs against the local stack only');
const APP = process.env.PRACTICE_APP || 'repo-nanogpt';
const PEOPLE = [[process.env.PRACTICE_EMAIL || 'owner@example.com', APP], [process.env.LEARNER_EMAIL || 'learner@example.com', process.env.LEARNER_APP || 'repo-nanogpt-learner']];
const OUT = process.argv[2] || 'tutor-entry-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
// What only a review build carries (e2e/production-bundle-check.mjs DEV_MARKERS, plus the review-board notice).
const REVIEW_ONLY = ['No review board is registered', 'Review fixtures are on', 'Insert a sample lesson block', 'Agent workspace', 'Quiz answer key', 'Edit and approve curriculum'];
// Every review board's card titles, the Tutor's included: none may open from a URL.
const titlesOf = name => BOARDS[name]().map(block => block.title || block.scene?.title).filter(Boolean);
const TUTOR_TITLES = titlesOf(TUTOR_BOARD);
const OVERVIEW = TUTOR_TITLES[0];

const browser = await chromium.launch();
const errors = [], scripts = new Map();
const results = {};

async function personPage(email) {
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json();
  assert.ok(session, `a session for ${email}`);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
const tutorButton = page => page.locator('[data-learn-tutor]');
const mic = page => page.getByRole('button', { name: 'Voice mode', exact: true });
const cardTitles = page => page.locator('[data-block-id]:not([data-chat-block])').allInnerTexts();
const settle = page => page.waitForSelector('[data-tool-gutter]', { timeout: 30000 }).then(() => page.waitForTimeout(1500));
const composer = page => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();

// 1. The product road, for the owner and for a learner: the same experience.
for (const [index, [email, app]] of PEOPLE.entries()) {
  const who = index ? 'learner' : 'owner';
  const { page, traffic, close } = await personPage(email);
  await page.goto(`${BASE}/apps/${app}?tab=learn`);
  await tutorButton(page).waitFor({ timeout: 30000 });
  assert.equal((await tutorButton(page).innerText()).trim(), 'Tutor', `${who}: the Tutor entry sits on the lesson`);
  assert.equal((await page.locator('[data-learn-practice]').innerText()).trim(), 'Practice', `${who}: Practice stays beside it`);
  assert.equal(await mic(page).count(), 0, `${who}: no Tutor (no mic) on the normal lesson`);
  await shot(page, `${who}-1-lesson`);

  await tutorButton(page).click();
  await page.waitForURL(url => url.searchParams.get('experience') === 'tutor' && !url.searchParams.has('board'));
  await settle(page);
  await mic(page).waitFor({ timeout: 15000 });
  const texts = (await cardTitles(page)).join('\n');
  for (const title of TUTOR_TITLES) assert.ok(texts.includes(title), `${who}: Tutor card ${title}`);
  assert.equal((await tutorButton(page).innerText()).trim(), 'Back to lesson', `${who}: a way back`);
  assert.equal(await page.locator('[data-learn-practice]').count(), 0, `${who}: Practice is the lesson's, not the Tutor's`);
  await shot(page, `${who}-2-tutor`);

  // A typed turn is a Tutor turn: /api/learn/tutor, on this repository's Tutor board, never /api/learn/ask.
  await composer(page).fill('Which characters does one position look at?');
  await composer(page).press('Enter');
  await page.getByText('Each position looks back at the earlier ones, never ahead.').first().waitFor({ timeout: 15000 });
  assert.ok(traffic.plans.length >= 1, `${who}: a Tutor plan request`);
  const plan = traffic.plans.at(-1);
  assert.equal(plan.app, app, `${who}: the plan is for ${app}`);
  // A Tutor v2 turn: the typed words as learner_intent, routed, with the actions it may take.
  assert.equal(plan.context.learner_intent.raw_user_message, 'Which characters does one position look at?', `${who}: the typed words`);
  assert.ok(plan.context.route?.row && Array.isArray(plan.context.allowed_actions), `${who}: a routed Tutor v2 context`);
  assert.deepEqual(traffic.refused, [], `${who}: nothing went to ask, voice or grading`);
  await shot(page, `${who}-3-typed-turn`);

  // A Rabbit Hole under the Tutor (/dive, no model: the opening plan is scripted) climbs back to the Tutor's product URL.
  await composer(page).fill('/dive softmax'); await composer(page).press('Enter');
  await page.waitForURL(url => url.searchParams.get('experience') === 'tutor' && url.searchParams.has('hole'), { timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot(page, `${who}-3b-hole`);
  await page.locator('[data-dive-navigator] [data-dive-level]').first().click();
  await page.waitForURL(url => url.searchParams.get('experience') === 'tutor' && !url.searchParams.has('hole') && !url.searchParams.has('board'));
  await settle(page);
  await mic(page).waitFor({ timeout: 15000 });
  assert.ok((await cardTitles(page)).join('\n').includes(OVERVIEW), `${who}: back on the Tutor canvas`);

  // A reload keeps the learner in the Tutor; Back to lesson leaves it for the normal lesson.
  await page.reload(); await settle(page);
  await mic(page).waitFor({ timeout: 15000 });
  await tutorButton(page).click();
  await page.waitForURL(url => !url.searchParams.has('experience'));
  await page.locator('[data-learn-practice]').waitFor();
  assert.equal((await tutorButton(page).innerText()).trim(), 'Tutor');
  assert.equal(await mic(page).count(), 0, `${who}: the lesson is not the Tutor`);
  await shot(page, `${who}-4-back-to-lesson`);
  results[who] = { cards: TUTOR_TITLES.length, plans: traffic.plans.length, evaluations: traffic.evaluations.length };
  await close();
}

assert.deepEqual(results.learner, results.owner, 'the owner and a learner get the same Tutor');

// 2. URLs open nothing: every review board (the Tutor's included) by ?board=, and unlisted experiences.
const { page, close } = await personPage(PEOPLE[0][0]);
const blocked = [...Object.keys(BOARDS).map(name => `board=${name}`), 'experience=nanogpt-deep-dive', `experience=${TUTOR_BOARD}`, 'experience=__proto__', 'experience=Tutor'];
for (const query of blocked) {
  await page.goto(`${BASE}/apps/${APP}?tab=learn&${query}`);
  await tutorButton(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  assert.equal((await tutorButton(page).innerText()).trim(), 'Tutor', `${query}: the normal lesson`);
  assert.equal(await mic(page).count(), 0, `${query}: no Tutor`);
  const body = await page.locator('body').innerText();
  for (const marker of REVIEW_ONLY) assert.ok(!body.includes(marker), `${query}: ${marker}`);
  const texts = (await cardTitles(page)).join('\n');
  for (const name of Object.keys(BOARDS)) for (const title of titlesOf(name)) assert.ok(!texts.includes(title), `${query}: ${name} card "${title}" must not open`);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  for (const name of Object.keys(BOARDS)) assert.ok(!keys.some(key => key.includes(`:${name}:`) && !key.includes(`:${TUTOR_BOARD}:`)), `${query}: no ${name} storage`);
}
await shot(page, '5-board-url-ignored');
await close();

// 3. The production build: no review-only code reached the browser.
for (const [url, source] of scripts) for (const marker of REVIEW_ONLY) assert.ok(!source.includes(marker), `${marker} in ${url}`);
assert.deepEqual(errors, [], 'page errors');
console.log(JSON.stringify({ ok: true, ...results, blockedUrls: blocked.length, scripts: scripts.size, overview: OVERVIEW }));
await browser.close();
