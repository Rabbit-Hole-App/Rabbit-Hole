// NanoGPT Practice in the PRODUCTION build (VITE_RABBIT_HOLE=true, no VITE_COACHING_DEV), through the real flow,
// against the LOCAL stack only (docs/features/dive-v1.md "Run it locally", with production-flag dist and dist-dev):
// Repository -> Learn -> lesson -> Practice -> quiz, flashcards, notebook, as the repository OWNER, who in production
// must get the learner view too (docs/features/learn-lesson-plans.md).
// Needs a ready karpathy/nanoGPT repository app owned by PRACTICE_EMAIL in the local LEARN_DB; the import endpoint
// calls the remote indexer, so seed it instead, e.g. from the repo root:
//   npx wrangler d1 execute rabbit-hole-learn-dev --local -c packages/control-plane/wrangler.rabbit-hole-dev.jsonc --persist-to <dir>
//     --command "INSERT INTO repository_apps(org,name,owner_email,repo,branch,commit_sha,status) VALUES('example-com','repo-nanogpt',
//     'owner@example.com','karpathy/nanoGPT','master','3adf61e154c3fe3fca428ad6bc3818b27a3b8291','ready')"
// Usage: PRACTICE_BASE=http://127.0.0.1:8788 SMALL_CP=http://127.0.0.1:8790 node e2e/practice-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.PRACTICE_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('practice-check runs against the local stack only');
const EMAIL = process.env.PRACTICE_EMAIL || 'owner@example.com', APP = process.env.PRACTICE_APP || 'repo-nanogpt';
const OUT = process.argv[2] || 'practice-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, secret }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// Nothing here may reach a model: refuse every write the flow does not need (asks, Tutor, Voice, grading, course edits).
const refused = [];
await context.route('**/*', route => {
  const request = route.request();
  if (request.method() !== 'GET' && /\/api\/.*(ask|tutor|voice|assess|learn-course|chat)/.test(request.url())) { refused.push(`${request.method()} ${request.url()}`); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
// What a learner or owner must never read in production.
const INTERNAL = /material plan|ready for review|review before|draft material|answer key|curriculum|edit course|learner view|edit this section|edit and approve|canvas text|drawing sequence|insert the|reuse the|objective:|that table from/i;
const visible = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const clean = async where => { const text = await visible(); const hit = text.match(INTERNAL); assert.ok(!hit, `${where}: "${hit?.[0]}" in …${text.slice(Math.max(0, hit?.index - 100), hit?.index + 60)}`); };

// 1. Repository -> Learn: the supplied lesson, with Practice above the canvas.
await page.goto(`${BASE}/apps/${APP}?tab=learn`);
const practice = page.locator('[data-learn-practice]');
await practice.waitFor({ timeout: 30000 });
assert.equal((await practice.innerText()).trim(), 'Practice');
await clean('lesson');
await shot('1-lesson');

// 2. Practice: the learner overview, no editor for the owner.
await practice.click();
await page.getByRole('heading', { name: 'Practice: karpathy/nanoGPT quickstart' }).waitFor();
assert.equal((await practice.innerText()).trim(), 'Back to lesson');
assert.equal(await page.getByRole('tablist', { name: 'Curriculum views' }).count(), 0, 'no Edit course / Learner view switch');
assert.equal(await page.locator('[aria-label$=" in chat"]').count(), 0, 'no Edit in chat');
await clean('practice');
await shot('2-practice');

// 3. Lesson 1 quiz: answer first.
const lesson1 = page.locator('li', { has: page.getByRole('button', { name: /^Lesson 1:/ }) }).first();
await lesson1.getByRole('tab', { name: /Mini quiz/ }).click();
const q1 = lesson1.locator('section[data-plan-section$="-quiz-1"]');
await q1.waitFor();
assert.equal(await q1.locator('input[type=radio]:checked').count(), 0);
assert.ok(await q1.getByRole('button', { name: 'Check answer' }).isDisabled());
assert.doesNotMatch(await q1.innerText(), /Why [A-Z] is right|If you chose|Transfer check/);
await q1.scrollIntoViewIfNeeded();
await shot('3-quiz-before');
await q1.getByLabel(/^A\./).check();
await q1.getByRole('button', { name: 'Check answer' }).click();
const wrong = await q1.getByRole('status').innerText();
assert.match(wrong, /Not quite[\s\S]*If you chose A:/);
assert.doesNotMatch(wrong, /Why [A-Z] is right|If you chose [BC]|Transfer check/);
await shot('4-quiz-wrong');
await q1.getByLabel(/^B\./).check();
await q1.getByRole('button', { name: 'Check answer' }).click();
const right = await q1.getByRole('status').innerText();
assert.match(right, /Correct\.[\s\S]*Why B is right:[\s\S]*Transfer check:/);
assert.ok(await q1.locator('input[value=A]').isDisabled());
await shot('5-quiz-right');

// 4. Flashcards: the back stays folded until asked for.
await lesson1.getByRole('tab', { name: /Flashcards/ }).click();
const card = lesson1.locator('section[data-plan-section$="-cards-1"]');
await card.waitFor();
assert.equal(await card.locator('details').evaluate(node => node.open), false);
assert.ok(!(await card.getByText(/^Back:/).isVisible().catch(() => false)));
await card.scrollIntoViewIfNeeded();
await shot('6-card-before');
await card.getByText('Show answer').click();
assert.equal(await card.locator('details').evaluate(node => node.open), true);
await shot('7-card-after');

// 5. Notebook: the optional notebook's cells.
await lesson1.getByRole('tab', { name: /Notebook/ }).click();
await lesson1.locator('section[data-plan-section$="-notebook-1"]').waitFor();
await clean('notebook');
await shot('8-notebook');

// 6. A lesson's pages: Back to Practice, no editor, lesson 2 page 5 self-contained.
await page.getByRole('button', { name: /^Lesson 2:/ }).click();
await page.getByRole('button', { name: 'Back to Practice' }).waitFor();
assert.equal(await page.locator('[aria-label$=" in chat"]').count(), 0);
await page.locator('[data-plan-page]').nth(4).locator('summary').click();
assert.match(await visible(), /Being able to trace the shapes from memory \(IDs, to t × n_embd/);
await clean('lesson 2 pages');
await shot('9-lesson2-pages');

// 7. Back to the lesson.
await page.getByRole('button', { name: 'Back to Practice' }).click();
await practice.click();
await page.getByRole('heading', { name: 'Practice: karpathy/nanoGPT quickstart' }).waitFor({ state: 'detached' });
assert.equal((await practice.innerText()).trim(), 'Practice');
await shot('10-back-to-lesson');

assert.deepEqual(errors, [], 'page errors');
console.log(`ok: Practice reachable, owner sees the learner view, answers wait for a check${refused.length ? `; refused ${refused.length} model-bound writes` : ''}`);
await browser.close();
