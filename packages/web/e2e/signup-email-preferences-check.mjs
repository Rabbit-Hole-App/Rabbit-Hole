// Signup email preferences (docs/features/signup-email-preferences.md, owner 2026-11-03) end to end, against the LOCAL stack only - local D1
// and fresh browser profiles; never a deployed worker. All four combinations of the two boxes go through the real "Choose your handle" step
// (Rabbit Hole Updates, Newsletter: both checked by default, independent, optional), then reload, Settings, an unsubscribe link, account
// isolation and an existing person. Stored rows are read from the stack's local main D1 (D1_CONFIG, PERSIST). No model calls; prints no secrets.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 D1_CONFIG=<stack>/integ-local-cp.jsonc PERSIST=<stack>/local node e2e/signup-email-preferences-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign } from '../../control-plane/src/token.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8848';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8849';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('signup-email-preferences-check runs against the local stack only');
const D1_CONFIG = process.env.D1_CONFIG, PERSIST = process.env.PERSIST;
if (!D1_CONFIG || !PERSIST) throw Error('D1_CONFIG and PERSIST name the local stack config and persist directory');
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const vars = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8');
const secret = vars.match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim(), masterKey = vars.match(/^MASTER_KEY=(.*)$/m)[1].trim();
const WRANGLER = fileURLToPath(new URL('../../../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const logs = mkdtempSync(join(tmpdir(), 'signup-prefs-'));
// Every failure message below is plain text without a cookie, token or secret: tokens (two long base64url parts) become <token>, the rest is cut at 300 characters.
const plain = text => String(text).replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{16,}/g, '<token>').replace(/\s+/g, ' ').slice(0, 300);
const rows = sql => {
  try { return JSON.parse(execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'rabbit-hole-dev', '--local', '--config', D1_CONFIG, '--persist-to', PERSIST, '--json', '--command', sql],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, CI: '1', WRANGLER_LOG_PATH: logs } }).toString())[0].results; }
  catch (error) { throw Error(`wrangler d1 execute failed (exit ${error.status}): ${plain(error.stderr || error.stdout || error.message)}`); }
};

const run = Date.now().toString(36);
// handle: undefined = a random test handle, null = none (the step itself), a string = that one.
// The standalone control plane shares one local D1 file with the app process, so a write or read there can lose a lock (SQLITE_BUSY) for a moment and
// answer an error instead of a session. Minting is idempotent (an address is one account), so it is retried a few times, then fails with what it saw.
const sessionFor = async (email, handle) => {
  let seen = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, ...(handle !== undefined ? { handle } : {}) }) });
      const text = await r.text();
      let session = null; try { session = JSON.parse(text).session; } catch { /* not JSON */ }
      if (r.ok && typeof session === 'string' && session) return session;
      seen = `status ${r.status} ${r.headers.get('content-type')} after ${Date.now() - t0} ms, body ${plain(text)}`;
    } catch (error) { seen = `request failed after ${Date.now() - t0} ms: ${error.message}`; }
    await new Promise(resolve => setTimeout(resolve, 250 * attempt));
  }
  throw Error(`no session for ${email.replace(/@.*/, '@<host>')} after 4 tries: ${seen}`);
};
const cookieOf = who => ({ cookie: `small_session=${who.session}` });
const api = async (who, path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...cookieOf(who), 'content-type': 'application/json', ...(init.headers || {}) } }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
// The account id is the uid the control plane signed into the session it minted (auth.js sessionFor: users.id), so it is read from the token this check
// holds, with no request. The earlier lookup, GET ${CP}/api/me, answered a 401 now and then: sessionOf fails closed on any D1 error and the standalone
// control plane lost a SQLITE_BUSY race against the app process's writes (CI runs 41702181259 and 41706607078; the lookup ran about 35 times per run).
const userId = async who => {
  let id = null; try { id = JSON.parse(Buffer.from(String(who.session).split('.')[0], 'base64url').toString('utf8')).uid; } catch { /* checked below */ }
  if (!/^[0-9a-f]{32}$/.test(String(id))) throw Error(`no account id in the minted session (uid is ${typeof id}${typeof id === 'string' ? `, ${id.length} characters` : ''}; session ${typeof who.session}, ${String(who.session).split('.').length} parts)`);
  return id;
};
const stored = async who => rows(`SELECT category, enabled, source, method, affirmative, disclosure_version FROM user_email_preferences WHERE user_id = '${await userId(who)}' ORDER BY category`);

const total = 45; // 7 per combination x 4, failed save and recovery 4, Settings 3 + 1 stale replay, existing person 2, isolation 2, unrelated edit 1, unsubscribe 2 + 1 stale replay, page errors 1
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const errors = [];
const pageFor = async who => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: who.session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return page;
};
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const view = (updates, newsletter) => ({ disclosure: 'v2', deliverable: true, updates: { enabled: updates, affirmative: false }, newsletter: { enabled: newsletter, affirmative: false } });

// [name, keep Updates checked, keep Newsletter checked]: the four combinations. Unchecked is an act (signup_user_unchecked); a box left alone is signup_preselected.
const COMBOS = [['both', true, true], ['updates', true, false], ['newsletter', false, true], ['neither', false, false]];
const people = {};
for (const [name] of COMBOS) people[name] = { session: await sessionFor(`prefs-${name}-${run}@example.com`, null) };
people.existing = { session: await sessionFor(`prefs-existing-${run}@example.com`, `existing_${run}`) };
const pages = {};
const continueBodies = {}; // the exact PUT /api/profile body each real Continue sent, replayed later as a stale retry

for (const [name, keepUpdates, keepNewsletter] of COMBOS) {
  const person = people[name], page = pages[name] = await pageFor(person);
  await page.goto(`${BASE}/library?type=canvases`);
  const setup = page.locator('[data-handle-setup]');
  await setup.waitFor({ timeout: 60000 });
  const box = category => page.locator(`[data-email-choice="${category}"]`);
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/profile') continueBodies[name] = request.postData(); });
  const states = async () => [await box('updates').isChecked(), await box('newsletter').isChecked()];

  check(`${name}: both boxes are shown checked, named, optional and described`, await page.locator('[data-email-choices]').isVisible()
    && JSON.stringify(await states()) === '[true,true]' && await page.getByRole('checkbox', { name: /Rabbit Hole Updates/ }).count() === 1 && await page.getByRole('checkbox', { name: /Newsletter/ }).count() === 1
    && await page.locator('[data-email-choice][required]').count() === 0 && await page.getByText('Optional. Change or unsubscribe any time in Settings.').isVisible()
    && await page.getByText('Product news: new features and changes to Rabbit Hole.').isVisible() && await page.getByText('The founder’s newsletter about tech and AI.').isVisible());
  if (name === 'both') await shot(page, '01-defaults-both-checked');
  const before = await api(person, '/api/profile');
  check(`${name}: showing the boxes saved nothing (no preference in the profile, no row)`, before.status === 200 && JSON.stringify(before.body.emailPreferences) === JSON.stringify(view(null, null)) && (await stored(person)).length === 0);

  if (!keepUpdates) await box('updates').uncheck();
  if (!keepNewsletter) await box('newsletter').uncheck();
  check(`${name}: each box changes on its own (Updates ${keepUpdates ? 'on' : 'off'}, Newsletter ${keepNewsletter ? 'on' : 'off'}) and Continue is still waiting for a handle`,
    JSON.stringify(await states()) === JSON.stringify([keepUpdates, keepNewsletter]) && await page.getByRole('button', { name: 'Continue' }).isDisabled());
  if (name === 'neither') await shot(page, '02-both-unchecked');

  await page.getByLabel('Handle', { exact: true }).fill(`${name}_${run}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await setup.waitFor({ state: 'detached', timeout: 30000 });
  await page.getByRole('heading', { name: 'Library' }).waitFor({ timeout: 30000 });
  check(`${name}: unchecking never blocks the account: the handle is claimed and the page it asked for renders`, new URL(page.url()).pathname === '/library' && (await api(person, '/api/profile')).body.handle === `${name}_${run}`);

  const expected = view(keepUpdates, keepNewsletter);
  check(`${name}: the API shows exactly what was submitted, and none of it is an active opt-in`, JSON.stringify((await api(person, '/api/profile')).body.emailPreferences) === JSON.stringify(expected));
  await page.reload();
  await page.getByRole('heading', { name: 'Library' }).waitFor({ timeout: 30000 });
  check(`${name}: after a reload the same choices come back and the step does not return`, await setup.count() === 0 && JSON.stringify((await api(person, '/api/profile')).body.emailPreferences) === JSON.stringify(expected));
  const row = (category, kept) => ({ category, enabled: kept ? 1 : 0, source: 'onboarding', method: kept ? 'signup_preselected' : 'signup_user_unchecked', affirmative: 0, disclosure_version: 'v2' });
  check(`${name}: stored with its source, method (${keepUpdates ? 'preselected' : 'unchecked'} / ${keepNewsletter ? 'preselected' : 'unchecked'}), affirmative flag and wording version`,
    JSON.stringify(await stored(person)) === JSON.stringify([row('newsletter', keepNewsletter), row('updates', keepUpdates)]), JSON.stringify(await stored(person)));
}

// ---- a failed save claims nothing: reload asks again, the retry (with changed boxes) saves, a reload shows it ----
// The failure is real: a trigger on this one test account's rows makes the database refuse the preference pair, so the real server answers 503.
// It proves the server order (the pair is saved before the handle is claimed, so a failed pair leaves no handle) and that the gate and the form
// recover in a browser. It does not prove a network drop in the middle of a request. The trigger is scoped to one account and is dropped in finally.
{
  people.retry = { session: await sessionFor(`prefs-retry-${run}@example.com`, null) };
  const person = people.retry, uid = await userId(person), trigger = `inject_fail_${run}`;
  const page = await pageFor(person);
  try {
    await page.goto(`${BASE}/library?type=canvases`);
    const setup = page.locator('[data-handle-setup]');
    await setup.waitFor({ timeout: 60000 });
    rows(`CREATE TRIGGER ${trigger} BEFORE INSERT ON user_email_preferences WHEN NEW.user_id = '${uid}' BEGIN SELECT RAISE(ABORT, 'injected save failure'); END`);
    let refused = false;
    try { rows(`INSERT INTO user_email_preferences (user_id, category, enabled, source, method, affirmative, changed_at) VALUES ('${uid}', 'updates', 1, 'onboarding', 'signup_preselected', 0, 1)`); } catch { refused = true; }
    if (!refused) { rows(`DELETE FROM user_email_preferences WHERE user_id = '${uid}'`); throw Error('the injected trigger is not active in the local D1'); }
    await page.getByLabel('Handle', { exact: true }).fill(`retry_${run}`);
    await page.getByRole('button', { name: 'Continue' }).click();
    const alert = page.locator('[data-handle-hint][role="alert"]');
    await alert.waitFor({ timeout: 30000 });
    check('failed save: the real server refuses, the step stays with the message, no handle is claimed and no choice is recorded', /could not be saved/.test(await alert.innerText()) && await setup.count() === 1
      && (await api(person, '/api/profile')).body.handle === null && (await stored(person)).length === 0);
    await shot(page, '04-failed-save');
    await page.reload();
    await setup.waitFor({ timeout: 60000 });
    check('failed save then reload: Choose your handle shows again with both boxes checked and a usable form', await page.locator('[data-email-choice="updates"]').isChecked() && await page.locator('[data-email-choice="newsletter"]').isChecked()
      && await page.getByLabel('Handle', { exact: true }).isEnabled() && await page.getByLabel('Handle', { exact: true }).inputValue() === '' && await page.getByRole('button', { name: 'Continue' }).isDisabled());
    rows(`DROP TRIGGER IF EXISTS ${trigger}`);
    await page.locator('[data-email-choice="newsletter"]').uncheck(); // a CHANGED choice on the retry
    await page.getByLabel('Handle', { exact: true }).fill(`retry_${run}`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await setup.waitFor({ state: 'detached', timeout: 30000 });
    await page.getByRole('heading', { name: 'Library' }).waitFor({ timeout: 30000 });
    const retryRow = (category, kept) => ({ category, enabled: kept ? 1 : 0, source: 'onboarding', method: kept ? 'signup_preselected' : 'signup_user_unchecked', affirmative: 0, disclosure_version: 'v2' });
    check('retry after the failure, with a changed box: the handle is claimed and the choices stored are the retry\'s (Updates kept, Newsletter unchecked)', (await api(person, '/api/profile')).body.handle === `retry_${run}`
      && JSON.stringify(await stored(person)) === JSON.stringify([retryRow('newsletter', false), retryRow('updates', true)]), JSON.stringify(await stored(person)));
    await page.reload();
    await page.getByRole('heading', { name: 'Library' }).waitFor({ timeout: 30000 });
    check('reload after the successful retry: no step, and the saved state is there', await setup.count() === 0 && JSON.stringify((await api(person, '/api/profile')).body.emailPreferences) === JSON.stringify(view(true, false)));
  } finally { try { rows(`DROP TRIGGER IF EXISTS ${trigger}`); } catch { /* best effort: the trigger names one test account */ } }
}

// ---- Settings: the preselected account changes one choice at a time and can confirm ----
{
  const person = people.both, page = pages.both;
  await page.goto(`${BASE}/apps`);
  await page.locator('[data-account-menu]').waitFor({ timeout: 60000 });
  await page.evaluate(detail => window.dispatchEvent(new CustomEvent('small:settings', { detail })), { tab: 'privacy' });
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.waitFor({ timeout: 10000 });
  const pane = dialog.locator('[data-settings-pane="privacy"]');
  const switchOf = label => pane.getByRole('switch', { name: label, exact: true });
  await switchOf('Newsletter').waitFor({ timeout: 15000 });
  check('settings: both switches are on, and both preselected yeses offer Confirm (an active yes is required for both)', await switchOf('Rabbit Hole Updates').getAttribute('aria-checked') === 'true'
    && await switchOf('Newsletter').getAttribute('aria-checked') === 'true' && await pane.locator('[data-email-pref="newsletter"]').getByRole('button', { name: 'Confirm' }).count() === 1
    && await pane.locator('[data-email-pref="updates"]').getByRole('button', { name: 'Confirm' }).count() === 1);
  await shot(page, '03-settings-email');
  const settled = async (category, enabled) => { for (let i = 0; i < 50; i++) { if ((await api(person, '/api/profile')).body.emailPreferences?.[category]?.enabled === enabled) return true; await page.waitForTimeout(200); } return false; };
  await switchOf('Newsletter').click();
  const off = await settled('newsletter', false);
  const after = Object.fromEntries((await stored(person)).map(r => [r.category, r]));
  check('settings: turning the Newsletter off leaves Updates exactly as onboarding stored it', off && (await api(person, '/api/profile')).body.emailPreferences.updates.enabled === true
    && after.updates.method === 'signup_preselected' && after.updates.source === 'onboarding' && after.newsletter.enabled === 0 && after.newsletter.method === 'settings_user_set' && after.newsletter.source === 'settings' && after.newsletter.affirmative === 0);
  await switchOf('Newsletter').click();
  const on = await settled('newsletter', true);
  const again = Object.fromEntries((await stored(person)).map(r => [r.category, r]));
  const bothAfterSettings = JSON.stringify(await stored(person));
  const staleBoth = await page.evaluate(body => fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body }).then(r => r.status), continueBodies.both);
  const bothAfterReplay = JSON.stringify(await stored(person));
  check('settings: the browser replays its first Continue (same, already-claimed handle) after the Settings choices: it succeeds and changes neither choice', staleBoth === 200 && bothAfterReplay === bothAfterSettings,
    `${staleBoth} ${bothAfterReplay}`);
  check('settings: turning it back on is the person\'s own act: settings_user_set and affirmative, with no Confirm left', on && again.newsletter.enabled === 1 && again.newsletter.method === 'settings_user_set'
    && again.newsletter.affirmative === 1 && await pane.locator('[data-email-pref="newsletter"]').getByRole('button', { name: 'Confirm' }).count() === 0 && again.updates.method === 'signup_preselected');
}

// ---- an existing person who never saw the step: nothing is recorded or switched on ----
{
  const person = people.existing, page = await pageFor(person);
  await page.goto(`${BASE}/apps`);
  await page.locator('[data-account-menu]').waitFor({ timeout: 60000 });
  const profile = (await api(person, '/api/profile')).body;
  check('an existing person with a handle sees no email step, has no preference recorded and no row is created by opening the app', await page.locator('[data-handle-setup]').count() === 0
    && JSON.stringify(profile.emailPreferences) === JSON.stringify(view(null, null)) && (await stored(person)).length === 0);
  await page.reload();
  await page.locator('[data-account-menu]').waitFor({ timeout: 60000 });
  check('an ordinary existing account (a handle, no preference rows) reloads straight into the app: never sent to Choose your handle, still nothing recorded', await page.locator('[data-handle-setup]').count() === 0
    && JSON.stringify((await api(person, '/api/profile')).body.emailPreferences) === JSON.stringify(view(null, null)) && (await stored(person)).length === 0);
}

// ---- account isolation: the account is the session's, never the body's ----
{
  const bothBefore = JSON.stringify(await stored(people.both));
  const attack = await api(people.existing, '/api/profile', { method: 'PUT', body: JSON.stringify({ userId: await userId(people.both), emailPreferences: { source: 'settings', disclosure: 'v1',
    updates: { enabled: false }, newsletter: { enabled: false }, userId: await userId(people.both), user_id: await userId(people.both) } }) });
  check('isolation: a request naming another account writes only the signed-in one', attack.status === 200 && JSON.stringify(await stored(people.both)) === bothBefore
    && (await stored(people.existing)).length === 2 && attack.body.emailPreferences.updates.enabled === false);
  check('isolation: each person reads only their own choices', (await api(people.both, '/api/profile')).body.emailPreferences.updates.enabled === true
    && (await api(people.existing, '/api/profile')).body.emailPreferences.updates.enabled === false);
}

// ---- an unrelated profile edit never resets a choice ----
{
  const person = people.neither, snapshot = JSON.stringify(await stored(person));
  const edit = await api(person, '/api/profile', { method: 'PUT', body: JSON.stringify({ name: 'No Email Person' }) });
  check('an unrelated profile edit leaves both preferences byte for byte', edit.status === 200 && JSON.stringify(await stored(person)) === snapshot && edit.body.emailPreferences.updates.enabled === false);
}

// ---- the unsubscribe link (served by the control plane, which holds the signing key) ----
{
  const person = people.updates, uid = await userId(person), before = await stored(person);
  const token = encodeURIComponent(await sign({ t: 'unsub', uid, cat: 'updates' }, masterKey));
  const seen = await fetch(`${CP}/unsubscribe?token=${token}`);
  const seenText = await seen.text();
  check('unsubscribe: opening the link shows a button and changes nothing (a mail scanner is harmless)', seen.status === 200 && seenText.includes('Unsubscribe from Rabbit Hole Updates?') && JSON.stringify(await stored(person)) === JSON.stringify(before),
    seen.status === 200 ? '' : `status ${seen.status} ${plain(seenText)}`);
  const done = await fetch(`${CP}/unsubscribe`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `token=${token}` });
  const after = Object.fromEntries((await stored(person)).map(r => [r.category, r]));
  check('unsubscribe: pressing it turns off Updates only; the Newsletter row is untouched', done.status === 200 && after.updates.enabled === 0 && after.updates.method === 'unsubscribe_link' && after.updates.source === 'unsubscribe'
    && after.updates.affirmative === 0 && after.updates.disclosure_version === null && JSON.stringify(after.newsletter) === JSON.stringify(before.find(r => r.category === 'newsletter')));
  const afterUnsubscribe = JSON.stringify(await stored(person));
  const staleUpdates = await pages.updates.evaluate(body => fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body }).then(r => r.status), continueBodies.updates);
  check('unsubscribe: the browser replays its first Continue (same, already-claimed handle) after the unsubscribe: it succeeds and the unsubscribe stands', staleUpdates === 200 && JSON.stringify(await stored(person)) === afterUnsubscribe,
    `${staleUpdates} ${JSON.stringify(await stored(person))}`);
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter(ok => !ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
if (results.length !== total) { console.log(`FAIL expected ${total} checks, ran ${results.length}`); process.exit(1); }
process.exit(failed ? 1 : 0);
