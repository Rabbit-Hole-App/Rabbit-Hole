// The AI credits meter in the browser (owner brief 2026-10-23: 2,500 AI credits every month; renewal shown in the viewer's own
// zone), against the LOCAL stack only, with spend enforced the way a deployment enforces it (see allowance-enforcement-check.mjs:
// every /api/ request carries x-e2e-enforce-spend: 1, which e2e/tripwire-dev-worker.js turns into SMALL_ENV=dev for that request).
//   1. a new account's meter says 2,500 AI credits every month, in the canvas gauge and in Settings > AI usage;
//   2. the renewal line is the reset instant in the viewer's zone with the zone named, in one wording: read in Los Angeles, then
//      pinned at the 2026-11-01 00:00 UTC cutover (October 31, 5:00 PM PDT) and read again in Tokyo;
//   3. an account with recorded usage keeps its 5,000 (a granted month is shown whatever the date), and the transition rule itself:
//      before 2026-11 an account with chargeable usage and no grant yet is shown 5,000, from 2026-11 everyone 2,500; a FREE action
//      (practice grading) is not usage, so a new account that did one is still shown 2,500;
//   4. no dollar amount anywhere on those surfaces.
// Isolation: no real provider key, behind the provider tripwire (e2e/provider-tripwire.js); this check requires zero hits.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 D1_CONFIG=<stack>/integ-local-cp.jsonc PERSIST=<stack>/local
//   [VARS=<.dev.vars with TEST_BYPASS_SECRET>] node e2e/credits-meter-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('credits-meter-check runs against the local stack only');
const D1_CONFIG = process.env.D1_CONFIG, D1_PERSIST = process.env.D1_PERSIST || process.env.PERSIST;
if (!D1_CONFIG || !D1_PERSIST) throw Error('D1_CONFIG and PERSIST name the local stack config and persist directory');
const SHOTS = process.argv[2] || 'credits-meter-shots';
mkdirSync(SHOTS, { recursive: true });
const secret = process.env.TEST_BYPASS_SECRET || readFileSync(process.env.VARS || fileURLToPath(new URL('../../control-plane/.dev.vars', import.meta.url)), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const ENFORCE = { 'x-e2e-enforce-spend': '1' };
const WRANGLER = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const d1 = command => execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'rabbit-hole-learn-dev', '--local',
  '--config', D1_CONFIG, '--persist-to', D1_PERSIST, '--command', command], { stdio: 'pipe', env: { ...process.env, CI: '1' } });

const LA = 'America/Los_Angeles', TOKYO = 'Asia/Tokyo';
// The wording of formatReset (account-usage.js), built here from the same instant: "October 31, 5:00 PM PDT".
const renews = (iso, timeZone) => `Renews on ${new Date(iso).toLocaleString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone }).replace(' at ', ', ')}`;
const CUTOVER = '2026-11-01T00:00:00.000Z';
const NO_DOLLARS = /\$\s*\d|\bUSD\b|\bdollars?\b|\bcents?\b/i;

const account = async label => {
  const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `credits-${label}-${Date.now().toString(36)}@example.com`, secret }) })).json();
  assert.ok(session, `${label}: a test session`);
  const cookie = { cookie: `small_session=${session}` };
  const me = await (await fetch(`${CP}/api/me`, { headers: cookie })).json();
  const payer = me.user_id || me.email;
  assert.ok(payer, `${label}: a payer id`);
  const api = async path => (await fetch(`${BASE}${path}`, { headers: { ...cookie, ...ENFORCE } })).json();
  return { label, session, payer, usage: () => api('/api/learn/usage'), api };
};

const tripwire = async () => (await (await fetch(`${BASE}/__provider-tripwire`)).json()).hits;
assert.deepEqual(await tripwire(), [], 'the tripwire answers and has counted nothing yet');

const browser = await chromium.launch();
const errors = [];
const results = [];
const check = async (label, fn) => { await fn(); results.push(label); console.log(`ok ${label}`); };
const surfaces = []; // every piece of text a person read, for the dollar scan at the end

// One signed-in browser context in a zone. mock: a body that answers GET /api/learn/usage instead of the server.
const visit = async (who, { timeZone = LA, mock = null } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'en-US', timezoneId: timeZone });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  await context.route(url => url.origin === new URL(BASE).origin && url.pathname.startsWith('/api/'), route => {
    if (mock && new URL(route.request().url()).pathname === '/api/learn/usage') return route.fulfill({ json: mock });
    return route.continue({ headers: { ...route.request().headers(), ...ENFORCE } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${who.label}: ${error.message}`));
  return { context, page };
};
// Settings > AI usage, opened the way a shared page opens it (?settings=usage); its text, read once the rows are drawn.
const settingsText = async (who, options) => {
  const { context, page } = await visit(who, options);
  try {
    await page.goto(`${BASE}/apps?settings=usage`);
    const settings = page.locator('[data-usage-settings]');
    await settings.waitFor({ timeout: 60000 });
    await settings.getByText('Monthly credits').waitFor({ timeout: 30000 });
    const text = (await settings.innerText()).trim();
    surfaces.push(`settings ${who.label}: ${text}`);
    assert.equal(await page.locator('[data-usage-note]').count(), 0, `${who.label}: enforced, so no "Tracking only" note`);
    return text;
  } finally { await context.close(); }
};
const seedGrant = (who, period, micros, source) => d1(`INSERT OR REPLACE INTO usage_grants (user_id, period, allowance_micros, source, granted_at) VALUES ('${who.payer}', '${period}', ${micros}, '${source}', 0);`);
const seedAction = (who, id, chargeClass, period, micros) => d1(`INSERT INTO usage_actions (action_id, user_id, payer, payer_reason, feature, charge_class, period, status, started_at) VALUES ('${id}', '${who.payer}', 'user', '${chargeClass === 'free' ? 'free_action' : 'signed_in'}', '${chargeClass === 'free' ? 'grade' : 'ask'}', '${chargeClass}', '${period}', 'completed', 0);
  ${micros ? `INSERT INTO usage_attempts (attempt_id, action_id, kind, reserved_micros, cost_micros, cost_state, status, started_at) VALUES ('${id}-a', '${id}', 'generation', ${micros}, ${micros}, 'settled', 'settled', 0);` : ''}`);

const fresh = await account('new');
const first = await fresh.usage();
assert.equal(first.enforced, true, `this stack must enforce the allowance for this check: ${JSON.stringify(first)}`);
const PERIOD = first.period; // the server's current UTC month
const run = Date.now().toString(36);

await check('a new account: the server grants 2,500 credits, nothing used, before any canvas is opened', async () => {
  assert.equal(first.allowanceCredits, 2500, 'the allowance is 2,500 credits');
  assert.equal(first.usedCredits, 0);
  assert.equal(first.remainingCredits, 2500);
  assert.doesNotMatch(JSON.stringify(first), /usd|micros|currency/i, 'the usage answer carries no dollars, micros or currency');
});

await check('a new account: the canvas gauge and Settings both read 2,500 AI credits every month, with the renewal in Los Angeles time', async () => {
  const made = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${fresh.session}`, ...ENFORCE, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Credits ${run}` }) })).json();
  const catalog = await fresh.api('/api/apps');
  const state = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [],
    blocks: [{ id: 'c-tides', type: 'explanation', dx: 0, dy: 0, title: 'Tides', body: 'The moon pulls the near ocean more than the Earth.' }] };
  const { context, page } = await visit(fresh);
  try {
    await context.addInitScript(seeds => { for (const [key, value] of Object.entries(seeds)) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); },
      { [`small.adaptive-canvas:${catalog.org}:${catalog.email}:${made.name}:ink`]: state });
    await page.goto(`${BASE}/apps/${made.name}`);
    await page.locator('[data-block-id="c-tides"]').waitFor({ timeout: 60000 });
    await page.locator('[data-usage-gauge]').click();
    const popover = page.locator('[data-usage-popover]');
    await popover.waitFor({ timeout: 30000 });
    await popover.locator('[data-usage-every]').waitFor({ timeout: 30000 });
    const text = (await popover.innerText()).trim();
    surfaces.push(`gauge new: ${text}`);
    assert.equal((await popover.locator('[data-usage-every]').innerText()).trim(), '2,500 AI credits every month');
    assert.match(text, /\d[\d,]* credits remaining|less than 1 credit remaining/);
    const left = Number((text.match(/([\d,]+) credits? remaining/)?.[1] || '0').replace(/,/g, ''));
    assert.ok(left > 0 && left <= 2500, `remaining credits ${left} are within the 2,500 granted`);
    assert.equal((await popover.locator('[data-usage-reset]').innerText()).trim(), renews(first.resetsAt, LA));
    assert.equal(await popover.locator('[data-usage-note]').count(), 0, 'enforced: no "Tracking only" note');
    await page.screenshot({ path: `${SHOTS}/gauge-new-account.png` });
  } finally { await context.close(); }
  const text = await settingsText(fresh);
  assert.match(text, /Monthly credits\s*2,500 AI credits every month/);
  assert.match(text, new RegExp(`Renewal[\\s\\S]*?${renews(first.resetsAt, LA)}`));
});

await check('the renewal line is pinned at the cutover: 2026-11-01 00:00 UTC reads October 31, 5:00 PM PDT in Los Angeles and November 1, 9:00 AM GMT+9 in Tokyo', async () => {
  const mock = { enforced: true, period: '2026-10', resetsAt: CUTOVER, allowanceCredits: 2500, usedCredits: 0, reservedCredits: 0, estimatedCredits: 0, remainingCredits: 2500, unknownAttempts: 0, byFeature: [] };
  const la = await settingsText(fresh, { mock });
  assert.match(la, /Renewal[\s\S]*?Renews on October 31, 5:00 PM PDT/, la);
  const tokyo = await settingsText(fresh, { mock, timeZone: TOKYO });
  assert.match(tokyo, /Renewal[\s\S]*?Renews on November 1, 9:00 AM GMT\+9/, tokyo);
});

await check('an account with recorded usage and a 5,000 grant for the month is shown its 5,000, its usage and what is left', async () => {
  const old = await account('old');
  seedGrant(old, PERIOD, 50_000_000, 'legacy_transition');
  seedAction(old, `credits-old-${run}`, 'would_charge', PERIOD, 1_234_000); // 123 credits spent
  const usage = await old.usage();
  assert.equal(usage.allowanceCredits, 5000);
  assert.equal(usage.usedCredits, 123.4);
  const text = await settingsText(old);
  assert.match(text, /Monthly credits\s*5,000 AI credits every month/);
  assert.match(text, /Used\s*123 credits/);
  assert.match(text, /Remaining\s*4,877 credits/);
  assert.match(text, new RegExp(`Renewal[\\s\\S]*?${renews(usage.resetsAt, LA)}`));
});

await check('the transition rule: before 2026-11 chargeable usage keeps 5,000, from 2026-11 every account has 2,500; a free action is not usage', async () => {
  const before = PERIOD < '2026-11';
  const used = await account('used'), free = await account('free');
  seedAction(used, `credits-used-${run}`, 'would_charge', PERIOD, 500_000);
  seedAction(free, `credits-free-${run}`, 'free', PERIOD, 0);
  const usedApi = await used.usage(), freeApi = await free.usage();
  assert.equal(usedApi.allowanceCredits, before ? 5000 : 2500, `${PERIOD}: an account with chargeable usage`);
  assert.equal(freeApi.allowanceCredits, 2500, `${PERIOD}: practice grading alone is not usage, so the account is a new account`);
  assert.match(await settingsText(used), before ? /Monthly credits\s*5,000 AI credits every month/ : /Monthly credits\s*2,500 AI credits every month/);
  assert.match(await settingsText(free), /Monthly credits\s*2,500 AI credits every month/);
});

await check('no dollar amount, USD or cents on the gauge or in Settings > AI usage, whichever account', async () => {
  assert.ok(surfaces.length >= 7, `${surfaces.length} surfaces were read`);
  for (const text of surfaces) assert.doesNotMatch(text, NO_DOLLARS, text);
});

await browser.close();
assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
assert.deepEqual(await tripwire(), [], 'zero provider requests over the whole check');
const total = 6;
console.log(`credits-meter-check: ${results.length}/${total} checks passed`);
assert.equal(results.length, total);
