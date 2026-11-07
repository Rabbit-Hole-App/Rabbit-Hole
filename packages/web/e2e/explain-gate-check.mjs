// /explain through the REAL server gate (EXP-04, owner message 24, 2026-10-21), against the LOCAL stub stack only: the browser
// sends the line as a learner does, /api/learn/artifact runs on the stack (artifactFetch, the scene gates, the one repair), and
// only the provider is scripted (e2e/explain-gate-stub-worker.js answers make_animation from e2e/explain-gate-fixtures.js; any
// other provider request is refused and counted by the tripwire). Two scenes the gates must refuse:
//   1. a combination-only error (a sum that is wrong only with both toggles on);
//   2. a scene over the 64-setting bound (a 65-position slider).
// For each: exactly one repair, told the gate's exact words; then the refusal, shown as "What failed: <those words>"; no card on
// the page or the saved board; the line kept in the composer; one artifact request from the page and no automatic retry.
//   3. a fresh browser: still no card, and no request was made since.
// The stack: bash C:/s/spec/toc-up.sh exp04 start with TRIPWIRE=1 STUB=1 (C:/s/toc-exp04/extra.sh: the dev worker's "main" is
// the stub entrypoint, a placeholder provider key, SMALL_ENV=test). No model is called and nothing is paid.
// Usage: BASE=http://127.0.0.1:9611 SMALL_CP=http://127.0.0.1:9613 VARS=<stack .dev.vars> [THEME=dark] node e2e/explain-gate-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { calculationProblem, sceneProblem, withDataSizes, withSamplesNote } from '../../control-plane/src/learn-scene-gates.js';
import { COMBINATION, OVER_BOUND } from './explain-gate-fixtures.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9611';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9613';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('explain-gate-check runs against the local stack only');
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const OUT = process.argv[2] || 'explain-gate-shots';
mkdirSync(OUT, { recursive: true });
const stub = async () => (await (await fetch(`${BASE}/__scene-stub`)).json()).calls;
await stub().catch(() => { throw Error(`${BASE}/__scene-stub does not answer: start the stack with TRIPWIRE=1 STUB=1`); });
const secret = readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `xgc-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Explain gate ${run}` }) });
const board = () => api(`/api/learn/boards/${canvas.name}/main`).then(out => out.state);
// The server's own gate order (learn-artifact.js GATES): the words the learner and the repair must get.
const gateWords = ({ scene, calculation }) => calculationProblem(scene, calculation) || sceneProblem(withSamplesNote(withDataSizes(scene), calculation));

const posts = [], answers = [], outside = [], errors = [];
const results = [];
const total = 3;
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};
const until = async (fn, label, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 150)); } throw Error(label); };

const browser = await chromium.launch();
const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, colorScheme: THEME });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
    return route.fallback();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/learn/artifact') posts.push(request.postDataJSON()); });
  page.on('response', async response => { if (new URL(response.url()).pathname === '/api/learn/artifact') answers.push(await response.json().catch(() => null)); });
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor({ timeout: 60000 });
  return { context, page };
};
const composerOf = page => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
const send = async (page, text) => { const box = composerOf(page); await box.click(); await box.fill(text); await box.press('Enter'); };
const blockIds = page => page.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-block-id')).filter(id => !id.startsWith('slot')));

const { context, page } = await open();
const refused = async (marker, args, answer, label) => {
  const expected = gateWords(answer);
  assert.ok(expected, `${label}: the fixture must fail the gates`);
  const before = await blockIds(page), saved = (await board()).blocks.length, sent = posts.length, called = (await stub()).length;
  await send(page, `/explain ${args}`);
  const result = page.locator('[data-chat-pane] [data-slash-result]');
  await result.getByText('The interactive explanation could not be made', { exact: false }).waitFor({ timeout: 60000 });
  await until(async () => answers.length === sent + 1, 'the artifact answer was not read');
  assert.deepEqual(answers.at(-1), { result: 'validation_error', primitive: 'animation', error: expected }, 'the server refused with the gate\'s exact words');
  const calls = (await stub()).slice(called);
  assert.deepEqual(calls.map(call => [call.marker, call.tool]), [[marker, 'make_animation'], [marker, 'make_animation']], 'generation and exactly one repair; no verifier call on a refused scene');
  assert.equal(calls[0].repair, null);
  assert.equal(calls[1].repair, `Validation failed: ${expected}. Return the complete corrected input with one of the same tools. This is the only correction attempt.`, 'the repair is told the gate\'s exact words');
  assert.equal((await result.locator('[data-slash-detail]').innerText()).trim(), `What failed: ${expected.slice(0, 400)}`, 'what failed, in the gate\'s words');
  assert.deepEqual(await blockIds(page), before, 'no card on the page');
  assert.equal(await result.locator('[data-slash-open]').count(), 0, 'no card to open');
  assert.equal((await board()).blocks.length, saved, 'the saved board holds no new block');
  assert.ok((await composerOf(page).inputValue()).includes(args.slice(0, 40)), 'the line is back in the composer');
  assert.equal(posts.length, sent + 1, 'one artifact request from the page');
  await page.screenshot({ path: `${OUT}/${THEME}-${marker}.png` });
  console.log(`   ${label}: ${expected.slice(0, 160)}`);
  return { sent, called };
};

let first, second;
await step('a combination-only error is refused by the server gate after one repair: exact words, no card, line kept', async () => {
  first = await refused('exp04-combination', 'interactive exp04-combination: does a lid change the temperature water boils at', COMBINATION, 'combination');
});
await step('a scene over the 64-setting bound is refused by the server gate after one repair: exact words, no card, line kept', async () => {
  second = await refused('exp04-over-bound', 'interactive exp04-over-bound: how much of a radioactive sample remains after each half-life', OVER_BOUND, 'over the bound');
  assert.match(gateWords(OVER_BOUND), /^The controls offer 65 settings in combination \(k: 65\); every setting is checked, and at most 64 are supported/);
});
await step('no automatic retry: a fresh browser shows no card, and nothing was requested since', async () => {
  const fresh = await open();
  await fresh.page.locator('[data-chat-pane] [data-chat-composer]').first().waitFor();
  assert.equal((await board()).blocks.filter(block => block.type === 'animation').length, 0, 'no animation block was saved');
  assert.equal(await fresh.page.locator('[data-block-id] svg [data-animation-object]').count(), 0, 'no scene card drawn');
  assert.equal(posts.length, (second?.sent ?? 0) + 1, 'two learner requests in all: one per line sent');
  assert.equal((await stub()).length, (first?.called ?? 0) + 4, 'four scripted calls in all: two per refused line');
  await fresh.context.close();
});

const tripwire = await (await fetch(`${BASE}/__provider-tripwire`)).json().catch(() => ({ hits: ['unreadable'] }));
console.log(`${results.filter(Boolean).length}/${total} passed (theme ${THEME}; scripted provider calls: ${(await stub()).length}; provider requests refused by the tripwire: ${tripwire.hits?.length ?? 'unknown'})`);
console.log(`outside requests aborted: ${new Set(outside).size}; page errors: ${errors.length}${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`);
await context.close();
await browser.close();
process.exit(results.length === total && results.every(Boolean) && !errors.length && tripwire.hits?.length === 0 ? 0 : 1);
