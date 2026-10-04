// Home ask (docs/features/home-ask.md) in the browser, against the LOCAL stack only. No model call: the answer route is
// scripted. Every canvas creation (POST /api/canvases) is refused and counted, so the check proves which questions
// would create a Rabbit Hole and which never do.
//   PRACTICE_BASE=http://127.0.0.1:8788 SMALL_CP=http://127.0.0.1:8790 node e2e/home-ask-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.PRACTICE_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
for (const origin of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw Error('home-ask-check runs against the local stack only');
const OUT = process.argv[2] || 'home-ask-shots';
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.PRACTICE_EMAIL || 'owner@example.com', secret }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const asked = [], created = [], oldAgent = [];
await page.route('**/api/learn/home-ask', async route => {
  const { message } = route.request().postDataJSON();
  asked.push(message);
  const library = /canvases do i have|where did i learn/i.test(message);
  await route.fulfill({ json: { answer: library ? 'You have **karpathy/nanoGPT**.' : `A short answer to: ${message}`, references: library ? [{ name: 'repo-nanogpt', kind: 'project', title: 'karpathy/nanoGPT' }] : [], offer_rabbit_hole: !library } });
});
await page.route('**/api/canvases', route => { if (route.request().method() === 'POST') { created.push(route.request().postDataJSON()); return route.abort(); } return route.continue(); });
await page.route(/\/api\/ask(\?|$)/, route => { if (route.request().method() === 'POST') { oldAgent.push(route.request().url()); return route.abort(); } return route.continue(); });

const bar = () => page.locator('textarea').last();
const send = async text => { await bar().fill(text); await bar().press('Enter'); await page.waitForTimeout(1500); };
const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

const cases = [
  ['What canvases do I have?', 'inline'], ['Where did I learn about softmax?', 'inline'], ['What is softmax?', 'inline'],
  ['Explain attention', 'inline'], ['tell me something about attention?', 'inline'],
  ['Teach me attention', 'rabbit-hole'], ['Start a Rabbit Hole about attention', 'rabbit-hole'],
];
const results = [];
for (const [text, want] of cases) {
  await page.goto(`${BASE}/apps`); await page.waitForTimeout(3000);
  const before = { asked: asked.length, created: created.length };
  await send(text);
  const got = created.length > before.created ? 'rabbit-hole' : asked.length > before.asked ? 'inline' : 'nothing';
  results.push([text, got]);
  assert.equal(got, want, `${text}: ${got}`);
  if (want === 'inline') {
    const sheet = page.locator('[data-result-sheet]');
    await sheet.waitFor({ timeout: 10000 });
    assert.ok((await sheet.innerText()).includes(text.endsWith('?') && /canvases|where did/i.test(text) ? 'karpathy/nanoGPT' : 'A short answer'), `${text}: the answer shows in place`);
  }
  await shot(`${results.length}-${want}`);
}
// The offer is a button the learner presses: only then is a Rabbit Hole started, with the original question.
await page.goto(`${BASE}/apps`); await page.waitForTimeout(3000);
await send('What is softmax?');
const offer = page.locator('[data-answer-offer]');
await offer.waitFor({ timeout: 10000 });
const beforeOffer = created.length;
await offer.click(); await page.waitForTimeout(1500);
assert.equal(created.length, beforeOffer + 1, 'the offer starts one Rabbit Hole');
// A library answer links to what it names.
await page.goto(`${BASE}/apps`); await page.waitForTimeout(3000);
await send('What canvases do I have?');
assert.equal(await page.locator('[data-answer-links] button').count(), 1);
await shot('8-library-answer-links');
assert.deepEqual(oldAgent, [], 'the old apps agent is never asked');
assert.deepEqual(errors, []);
console.log(JSON.stringify({ ok: true, results, created: created.map(c => c.title) }));
await browser.close();
