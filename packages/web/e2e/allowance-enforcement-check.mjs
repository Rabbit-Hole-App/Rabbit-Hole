// Monthly AI allowance enforcement in the browser (owner L12 2026-10-20; D4 section 4), against the LOCAL stack only, with the
// allowance really enforced by the server: exhausted, insufficient, reserved and unavailable each refuse a chat Send before any
// provider call, explain themselves once with View usage, and give the learner's prompt back; the canvas stays readable and
// editable. Isolation: the stack has no provider key (a placeholder only) and runs behind the provider tripwire
// (e2e/provider-tripwire.js), which blocks and counts any provider request; this check requires zero.
// The stack: bash C:/s/spec/toc-up.sh <lane> start with TRIPWIRE=1 and an extra.sh that sets, in the lane's .dev.vars,
// SMALL_ENV=dev (spend enforced, test sign-in still on), USAGE_PLATFORM_DAY_USD and ANTHROPIC_API_KEY=<placeholder>.
// The allowance states are rows written into the stack's local LEARN_DB with wrangler --local (D1_CONFIG, D1_PERSIST).
// Usage: BASE=http://127.0.0.1:9341 SMALL_CP=http://127.0.0.1:9343 VARS=<lane .dev.vars> D1_CONFIG=<lane fu-integ-local-cp.jsonc>
//   D1_PERSIST=<lane local dir> node e2e/allowance-enforcement-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9341';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9343';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('allowance-enforcement-check runs against the local stack only');
const { D1_CONFIG, D1_PERSIST } = process.env;
if (!D1_CONFIG || !D1_PERSIST) throw Error('D1_CONFIG and D1_PERSIST name the local stack\'s config and persist directory');
const SHOTS = process.argv[2] || 'allowance-enforcement-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = readFileSync(process.env.VARS, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const WRANGLER = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const d1 = command => execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'rabbit-hole-learn-dev', '--local',
  '--config', D1_CONFIG, '--persist-to', D1_PERSIST, '--command', command], { stdio: 'pipe', env: { ...process.env, CI: '1' } });

const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `allowance-${Date.now().toString(36)}@example.com`, secret }) })).json();
const cookie = { cookie: `small_session=${session}` };
const api = async (path, init = {}) => (await fetch(`${BASE}${path}`, { ...init, headers: { ...cookie, 'content-type': 'application/json' } })).json();
const tripwire = async () => (await (await fetch(`${BASE}/__provider-tripwire`)).json()).hits;
const me = await (await fetch(`${CP}/api/me`, { headers: cookie })).json();
const payer = me.user_id || me.email;
assert.ok(payer, 'the session has a payer');

const usage = await api('/api/learn/usage');
assert.equal(usage.enforced, true, `this stack must enforce the allowance (SMALL_ENV=dev): ${JSON.stringify(usage)}`);
const ALLOWANCE = usage.allowanceMicros;
assert.ok(Number.isSafeInteger(ALLOWANCE) && ALLOWANCE > 0, 'the configured allowance is read from the server');
assert.deepEqual(await tripwire(), [], 'the tripwire answers and has counted nothing yet');

// One past action holding `micros` in this user's month, in the given state (settled spend, or a running reservation).
const period = usage.period, run = Date.now().toString(36);
const seed = (micros, state) => d1(`DELETE FROM usage_attempts WHERE action_id IN (SELECT action_id FROM usage_actions WHERE user_id = '${payer}');
  DELETE FROM usage_actions WHERE user_id = '${payer}';
  INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('seed-${run}-${state}', '${payer}', 'user', 'signed_in', 'ask', 'would_charge', '${period}', 'completed', 0);
  INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('seed-${run}-${state}-a', 'seed-${run}-${state}', 'generation', ${micros}, ${state === 'settled' ? micros : 'NULL'}, '${state}', '${state === 'reserved' ? 'running' : 'settled'}', 0);`);

const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Allowance ${Date.now().toString(36)}` }) });
const catalog = await api('/api/apps');
const STATE = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [],
  blocks: [{ id: 'c-tides', type: 'explanation', dx: 0, dy: 0, title: 'Tides', body: 'The moon pulls the near ocean more than the Earth.' }] };
const SEEDS = { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${canvas.name}:ink`]: STATE };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, SEEDS);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const shot = async name => { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
const resets = new Date(usage.resetsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const open = async () => {
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.locator('[data-block-id="c-tides"]').waitFor({ timeout: 60000 });
};
const field = () => page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
// Send one prompt and read what the learner is told: exactly one refusal toast, with its text and actions.
const send = async prompt => {
  await field().click();
  await field().fill(prompt);
  const asks = [];
  const listen = request => { if (/\/api\/learn\/(ask|tutor\/plan)$/.test(new URL(request.url()).pathname)) asks.push(request.url()); };
  page.on('request', listen);
  await page.locator('[data-chat-pane] [data-chat-composer] button[aria-label="Send"]').click();
  const toast = page.locator('[data-toast-error]').filter({ hasText: /AI allowance|temporarily unavailable/ });
  await toast.first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800); // a second toast for the same attempt would land by now
  page.off('request', listen);
  return { toast, count: await toast.count(), text: (await toast.first().innerText()).trim(), asks };
};

await open();

await check('the canvas opens and its card reads while the allowance is enforced; Settings shows no tracking-only note', async () => {
  await page.locator('[data-block-id="c-tides"]').getByText('The moon pulls').waitFor();
  assert.equal(await page.locator('[data-usage-note]').count(), 0, 'no "Tracking only" note anywhere once enforced');
});

await check('exhausted: Send is refused before any provider call, one toast names the reset date, the prompt stays', async () => {
  seed(ALLOWANCE, 'settled');
  await open();
  const prompt = 'Why are there two tides a day? (exhausted)';
  const told = await send(prompt);
  assert.equal(told.count, 1, 'one toast for one attempt');
  assert.match(told.text, new RegExp(`You've used your monthly AI allowance\\. It resets on ${resets}\\.`));
  assert.equal(await field().inputValue(), prompt, 'the learner\'s prompt is back in the composer');
  assert.ok(told.asks.length >= 1, 'the Send reached the server, which refused it');
  assert.deepEqual(await tripwire(), [], 'no provider request left the stack');
  await page.locator('[data-block-id="c-tides"]').getByText('The moon pulls').waitFor();
  await shot('exhausted');
});

await check('View usage opens Settings at AI usage, which agrees: nothing remaining, no tracking-only note', async () => {
  await page.locator('[data-toast-error] [data-toast-action]').filter({ hasText: 'View usage' }).first().click();
  const settings = page.locator('[data-usage-settings]');
  await settings.waitFor({ timeout: 15000 });
  await settings.getByText('No AI allowance remaining.').waitFor({ timeout: 15000 });
  assert.match(await settings.innerText(), /Used\s*5,000 credits[\s\S]*Remaining\s*No AI allowance remaining\.\s*0 credits/);
  assert.equal(await page.locator('[data-usage-note]').count(), 0);
  await shot('view-usage');
  await page.keyboard.press('Escape');
});

await check('reserved: running work holding the balance reads as reserved, not spent; the prompt stays', async () => {
  seed(ALLOWANCE, 'reserved');
  await open();
  const prompt = 'Explain neap tides (reserved)';
  const told = await send(prompt);
  assert.equal(told.count, 1);
  assert.match(told.text, /reserved by AI work that is still running/);
  assert.doesNotMatch(told.text, /used your monthly/);
  assert.equal(await field().inputValue(), prompt);
  assert.deepEqual(await tripwire(), []);
  await shot('reserved');
});

await check('insufficient: some allowance left but less than this request can cost; refused at admission, the prompt stays', async () => {
  seed(ALLOWANCE - 1000, 'settled'); // $0.001 left: allowanceFirst lets it start, admission refuses its reservation
  await open();
  const prompt = 'Compare spring and neap tides (insufficient)';
  const told = await send(prompt);
  assert.equal(told.count, 1);
  assert.match(told.text, new RegExp(`This action needs more than your remaining AI allowance\\. It resets on ${resets}\\.`));
  assert.equal(await field().inputValue(), prompt);
  assert.deepEqual(await tripwire(), [], 'admission refused before the (placeholder-key) provider request');
  await shot('insufficient');
});

await check('unavailable: an accounting outage refuses AI with a temporary reason, never as spent; the canvas still edits', async () => {
  d1('DROP TABLE usage_attempts;');
  try {
    await open();
    const prompt = 'What causes tidal bores? (unavailable)';
    const told = await send(prompt);
    assert.equal(told.count, 1);
    assert.match(told.text, /AI is temporarily unavailable.*Your work is saved/);
    assert.doesNotMatch(told.text, /used your monthly|needs more than/);
    assert.equal(await field().inputValue(), prompt);
    assert.deepEqual(await tripwire(), []);
    // Non-AI work carries on: the composer still edits and the card still reads.
    await field().fill(`${prompt} edited`);
    assert.equal(await field().inputValue(), `${prompt} edited`);
    await page.locator('[data-block-id="c-tides"]').getByText('The moon pulls').waitFor();
    await shot('unavailable');
  } finally {
    d1(readFileSync(new URL('../../control-plane/learn-migrations/0022-usage-accounting.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' '));
  }
});

await browser.close();
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
assert.deepEqual(await tripwire(), [], 'zero provider requests over the whole check');
const total = 6;
console.log(`allowance-enforcement-check: ${results.length}/${total} passed`);
assert.equal(results.length, total);
