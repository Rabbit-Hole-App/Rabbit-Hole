import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { profileFetch } from '../src/profile.js';
import { userFor } from '../src/auth.js';
import { sign } from '../src/token.js';
import {
  AFFIRMATIVE_REQUIRED, CATEGORIES, DISCLOSURE_VERSION, METHODS, VERIFIED_PROVIDERS, deliverableEmail, initialChoices, isAffirmative, methodFor,
  onboardingSubmission, preferenceView, sendDecision, toggleChoice, validateEmailPreferences, wording,
} from '../src/email-preferences.js';
import { handleUnsubscribe, marketingRecipient, saveEmailPreferences, unsubscribeUrl } from '../src/email-preferences-store.js';

// Email preferences (docs/features/signup-email-preferences.md, owner 2026-11-03): two optional boxes, both checked at sign-up, saved
// exactly as submitted with how they were obtained. Real migrations on in-memory SQLite; the CONTROL_PLANE binding answers /api/me.
const learnSchema = readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8');
const mainSchema = ['0026-users.sql', '0028-email-preferences.sql'].map(f => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).join('\n');
const MASTER_KEY = 'master-key-for-tests';

const d1 = sqlite => ({ prepare: sql => { let args = []; const stmt = sqlite.prepare(sql); return {
  bind(...v) { args = v; return this; },
  first: async () => stmt.get(...args) || null,
  all: async () => ({ results: stmt.all(...args).map(r => ({ ...r })) }),
  run: async () => { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; },
}; } });

// people: key -> { uid, provider, providerEmail } (an account row plus one sign-in identity); principal as auth.js makes it.
function fixture(t, { people = {}, mainSql = mainSchema } = {}) {
  const learn = new DatabaseSync(':memory:'), main = new DatabaseSync(':memory:');
  t.after(() => { learn.close(); main.close(); });
  learn.exec(learnSchema); main.exec(mainSql);
  const who = {};
  for (const [key, p] of Object.entries({ ada: { provider: 'google', providerEmail: 'ada@gmail.test' }, bob: { provider: 'email', providerEmail: 'bob@example.test' }, ...people })) {
    const uid = `uid-${key}`, principal = p.provider === 'email' ? p.providerEmail : `user@${uid}.rabbithole.invalid`;
    who[key] = { uid, email: principal };
    if (p.noAccountId) who[key].uid = null;
    main.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, 1)').run(uid, principal);
    main.prepare('INSERT INTO user_identities (provider, provider_user_id, user_id, provider_email, created_at, last_login_at) VALUES (?, ?, ?, ?, 1, 1)').run(p.provider, `pid-${key}`, uid, p.providerEmail ?? null);
  }
  const env = { LEARN_DB: d1(learn), DB: d1(main), MASTER_KEY,
    CONTROL_PLANE: { fetch: async req => { const p = who[req.headers.get('x-user') || 'ada']; return Response.json({ org: 'team', email: p.email, orgName: 'Team', ...(p.uid ? { user_id: p.uid } : {}) }); } } };
  const send = async (method, body, user = 'ada') => {
    const res = await profileFetch(new Request('https://dev.test/api/profile', { method, headers: { 'x-user': user }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    return { status: res.status, body: await res.json() };
  };
  const rows = (uid) => main.prepare('SELECT category, enabled, source, method, affirmative, disclosure_version, changed_at FROM user_email_preferences WHERE user_id = ? ORDER BY category').all(uid).map(r => ({ ...r }));
  const count = () => main.prepare('SELECT count(*) AS n FROM user_email_preferences').get().n;
  return { env, send, rows, count, main, who };
}
const onboarding = (updates, newsletter) => ({ source: 'onboarding', disclosure: DISCLOSURE_VERSION, updates, newsletter });
const unchanged = { enabled: true, touched: false };
const gate = (emailPreferences, handle = 'ada_demo') => ({ handle, emailPreferences });
const brief = r => r.map(({ category, enabled, source, method, affirmative, disclosure_version }) => ({ category, enabled, source, method, affirmative, disclosure_version }));

// ---------- the four combinations, as submitted ----------

test('both boxes left checked: both stored on, as signup_preselected, not affirmative', async t => {
  const { send, rows } = fixture(t);
  const before = Math.floor(Date.now() / 1000);
  const saved = await send('PUT', gate(onboarding(unchanged, unchanged)));
  assert.equal(saved.status, 200);
  assert.deepEqual(brief(rows('uid-ada')), [
    { category: 'newsletter', enabled: 1, source: 'onboarding', method: 'signup_preselected', affirmative: 0, disclosure_version: 'v1' },
    { category: 'updates', enabled: 1, source: 'onboarding', method: 'signup_preselected', affirmative: 0, disclosure_version: 'v1' },
  ]);
  for (const r of rows('uid-ada')) assert.ok(r.changed_at >= before && r.changed_at <= Math.floor(Date.now() / 1000) + 1, 'the time of the choice is stored per preference');
  assert.deepEqual(saved.body.emailPreferences, { disclosure: 'v1', deliverable: true, updates: { enabled: true, affirmative: false }, newsletter: { enabled: true, affirmative: false } });
});

test('only Updates kept: Newsletter unchecked by the person is stored off as signup_user_unchecked', async t => {
  const { send, rows } = fixture(t);
  assert.equal((await send('PUT', gate(onboarding(unchanged, { enabled: false, touched: true })))).status, 200);
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled, r.method, r.affirmative]), [['newsletter', 0, 'signup_user_unchecked', 0], ['updates', 1, 'signup_preselected', 0]]);
});

test('only Newsletter kept: Updates unchecked by the person is stored off as signup_user_unchecked', async t => {
  const { send, rows } = fixture(t);
  assert.equal((await send('PUT', gate(onboarding({ enabled: false, touched: true }, unchanged)))).status, 200);
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled, r.method, r.affirmative]), [['newsletter', 1, 'signup_preselected', 0], ['updates', 0, 'signup_user_unchecked', 0]]);
});

test('both unchecked: the account is still created, both stored off', async t => {
  const { send, rows } = fixture(t);
  const saved = await send('PUT', gate(onboarding({ enabled: false, touched: true }, { enabled: false, touched: true })));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.handle, 'ada_demo', 'unchecking never blocks the handle');
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled, r.method, r.affirmative]), [['newsletter', 0, 'signup_user_unchecked', 0], ['updates', 0, 'signup_user_unchecked', 0]]);
});

test('a box the person unchecked and checked again is an active yes: signup_user_checked, affirmative', async t => {
  const { send, rows } = fixture(t);
  let choices = toggleChoice(toggleChoice(initialChoices(), 'newsletter'), 'newsletter');
  assert.deepEqual(choices.newsletter, { enabled: true, touched: true });
  assert.equal((await send('PUT', gate(onboardingSubmission(choices)))).status, 200);
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled, r.method, r.affirmative]), [['newsletter', 1, 'signup_user_checked', 1], ['updates', 1, 'signup_preselected', 0]]);
});

test('every combination of the two boxes is stored exactly as submitted', async t => {
  const { send, rows } = fixture(t, { people: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`p${i}`, { provider: 'email', providerEmail: `p${i}@example.test` }])) });
  let n = 0;
  for (const u of [unchanged, { enabled: true, touched: true }, { enabled: false, touched: true }]) for (const w of [unchanged, { enabled: true, touched: true }, { enabled: false, touched: true }]) {
    const who = `p${n++}`;
    assert.equal((await send('PUT', gate(onboarding(u, w), `h_${who}`), who)).status, 200);
    const got = Object.fromEntries(rows(`uid-${who}`).map(r => [r.category, r]));
    for (const [category, sent] of [['updates', u], ['newsletter', w]]) {
      assert.equal(!!got[category].enabled, sent.enabled, 'the value is exactly what was submitted');
      assert.equal(got[category].method, methodFor('onboarding', sent));
      assert.equal(!!got[category].affirmative, sent.enabled && sent.touched, 'only an actively ticked box is affirmative');
    }
  }
  assert.equal(n, 9);
});

// ---------- showing the boxes saves nothing; persistence; the response ----------

test('displaying the form creates no row; no account preference exists until Continue', async t => {
  const { send, rows, count } = fixture(t);
  const read = await send('GET');
  assert.deepEqual(read.body.emailPreferences, { disclosure: 'v1', deliverable: true, updates: { enabled: null, affirmative: false }, newsletter: { enabled: null, affirmative: false } });
  await send('GET'); await send('PUT', { name: 'Ada' });
  assert.equal(count(), 0);
  assert.deepEqual(rows('uid-ada'), []);
});

test('the choices persist: a second read returns what was saved, and the address is never in the response', async t => {
  const { send } = fixture(t);
  await send('PUT', gate(onboarding({ enabled: false, touched: true }, unchanged)));
  const again = await send('GET');
  assert.deepEqual(again.body.emailPreferences, { disclosure: 'v1', deliverable: true, updates: { enabled: false, affirmative: false }, newsletter: { enabled: true, affirmative: false } });
  assert.ok(!JSON.stringify(again.body).includes('gmail.test'), 'no address in the profile');
});

test('a malformed or unknown submission is refused before anything is written (the handle is not claimed either)', async t => {
  const { send, rows, count } = fixture(t);
  for (const bad of [
    { ...onboarding(unchanged, unchanged), source: 'unsubscribe' }, { ...onboarding(unchanged, unchanged), source: 'admin' }, { ...onboarding(unchanged, unchanged), disclosure: 'v99' },
    onboarding({ enabled: 'yes', touched: false }, unchanged), onboarding({ enabled: true }, unchanged), onboarding({ enabled: false, touched: false }, unchanged), { source: 'onboarding', disclosure: 'v1' }, 'newsletter', [],
  ]) {
    const res = await send('PUT', gate(bad));
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.equal(count(), 0);
  assert.equal((await send('GET')).body.handle, null, 'no handle claimed by a refused request');
  assert.deepEqual(rows('uid-ada'), []);
});

test('a taken handle changes nothing, the email choices included; the retry stores them once', async t => {
  const { send, rows, count } = fixture(t);
  assert.equal((await send('PUT', { handle: 'taken_one' }, 'bob')).status, 200);
  const refused = await send('PUT', gate(onboarding(unchanged, unchanged), 'taken_one'));
  assert.equal(refused.status, 409);
  assert.equal(count(), 0);
  assert.equal((await send('PUT', gate(onboarding(unchanged, unchanged), 'free_one'))).status, 200);
  assert.equal(rows('uid-ada').length, 2);
});

// ---------- the account comes from the session, never the body ----------

test('account isolation: a body naming another account changes only the signed-in one; nobody reads another person\'s choices', async t => {
  const { send, rows } = fixture(t);
  const attack = { ...onboarding(unchanged, { enabled: false, touched: true }), userId: 'uid-bob', user_id: 'uid-bob', email: 'bob@example.test', account: 'uid-bob' };
  assert.equal((await send('PUT', { ...gate(attack, 'ada_demo'), userId: 'uid-bob', user_id: 'uid-bob' }, 'ada')).status, 200);
  assert.deepEqual(rows('uid-bob'), [], 'bob has no row: the identity came from the session');
  assert.equal(rows('uid-ada').length, 2);
  assert.deepEqual((await send('GET', null, 'bob')).body.emailPreferences.newsletter, { enabled: null, affirmative: false }, 'bob sees his own, not ada\'s');
  assert.equal((await send('PUT', { emailPreferences: { source: 'settings', disclosure: 'v1', updates: { enabled: false }, userId: 'uid-ada' } }, 'bob')).status, 200);
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled]), [['newsletter', 0], ['updates', 1]], 'bob\'s Settings write left ada\'s rows alone');
  assert.deepEqual(brief(rows('uid-bob')).map(r => [r.category, r.enabled, r.method]), [['updates', 0, 'settings_user_set']]);
});

test('a session with no account id (a CLI token) cannot write choices and its profile has none', async t => {
  const { send, count } = fixture(t, { people: { cli: { provider: 'email', providerEmail: 'cli@example.test', noAccountId: true } } });
  assert.equal('emailPreferences' in (await send('GET', null, 'cli')).body, false);
  assert.equal((await send('PUT', gate(onboarding(unchanged, unchanged), 'cli_handle'), 'cli')).status, 409);
  assert.equal((await send('GET', null, 'cli')).body.handle, null, 'nothing was claimed');
  assert.equal(count(), 0);
});

// ---------- Settings: change later, one at a time ----------

test('Settings changes one category and leaves the other; turning on is affirmative, turning off is not', async t => {
  const { send, rows } = fixture(t);
  await send('PUT', gate(onboarding(unchanged, unchanged)));
  const fixed = Object.fromEntries(rows('uid-ada').map(r => [r.category, r]));
  const off = await send('PUT', { emailPreferences: { source: 'settings', disclosure: 'v1', newsletter: { enabled: false } } });
  assert.deepEqual([off.body.emailPreferences.newsletter.enabled, off.body.emailPreferences.updates.enabled], [false, true]);
  const now = Object.fromEntries(rows('uid-ada').map(r => [r.category, r]));
  assert.deepEqual(now.updates, fixed.updates, 'Updates is byte-for-byte what onboarding stored');
  assert.deepEqual([now.newsletter.enabled, now.newsletter.source, now.newsletter.method, now.newsletter.affirmative], [0, 'settings', 'settings_user_set', 0]);
  await send('PUT', { emailPreferences: { source: 'settings', disclosure: 'v1', newsletter: { enabled: true } } });
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled, r.method, r.affirmative]), [['newsletter', 1, 'settings_user_set', 1], ['updates', 1, 'signup_preselected', 0]]);
});

test('Confirm in Settings turns a preselected yes into an affirmative one', async t => {
  const { send, rows } = fixture(t);
  await send('PUT', gate(onboarding(unchanged, unchanged)));
  assert.equal((await send('GET')).body.emailPreferences.newsletter.affirmative, false);
  await send('PUT', { emailPreferences: { source: 'settings', disclosure: 'v1', newsletter: { enabled: true } } });
  assert.equal((await send('GET')).body.emailPreferences.newsletter.affirmative, true);
  assert.equal(rows('uid-ada').find(r => r.category === 'newsletter').method, 'settings_user_set');
});

test('unrelated profile edits never reset either preference', async t => {
  const { send, rows } = fixture(t);
  await send('PUT', gate(onboarding(unchanged, { enabled: false, touched: true })));
  const snapshot = JSON.stringify(rows('uid-ada'));
  for (const edit of [{ name: 'Ada Lovelace' }, { description: 'Teaches kernels' }, { handle: 'ada_two' }, { name: null, avatar: null }]) {
    assert.equal((await send('PUT', edit)).status, 200);
    assert.equal(JSON.stringify(rows('uid-ada')), snapshot, `${Object.keys(edit)} left both rows byte-for-byte`);
  }
});

test('re-submitting the onboarding defaults never overrides a choice already recorded', async t => {
  const { send, rows } = fixture(t);
  await send('PUT', gate(onboarding(unchanged, unchanged)));
  await send('PUT', { emailPreferences: { source: 'settings', disclosure: 'v1', newsletter: { enabled: false } } });
  const snapshot = JSON.stringify(rows('uid-ada').filter(r => r.category === 'newsletter'));
  assert.equal((await send('PUT', gate(onboarding(unchanged, unchanged), 'ada_demo'))).status, 200);
  assert.equal(JSON.stringify(rows('uid-ada').filter(r => r.category === 'newsletter')), snapshot, 'Newsletter stays off');
});

// ---------- existing people: nothing is switched on or reset ----------

test('existing saved choices and unsubscribes, and people with no row, are untouched by the migration, repeat sign-ins and defaults', async t => {
  const { main, env, send, rows, count } = fixture(t, { people: { eve: { provider: 'google', providerEmail: 'eve@gmail.test' }, norow: { provider: 'google', providerEmail: 'norow@gmail.test' } } });
  // Saved before this change shipped: Eve unsubscribed from the Newsletter (off) and switched Updates on in Settings.
  main.prepare("INSERT INTO user_email_preferences VALUES ('uid-eve', 'newsletter', 0, 'unsubscribe', 'unsubscribe_link', 0, NULL, 111)").run();
  main.prepare("INSERT INTO user_email_preferences VALUES ('uid-eve', 'updates', 1, 'settings', 'settings_user_set', 1, 'v1', 222)").run();
  const eve = JSON.stringify(rows('uid-eve'));
  // Re-running the migration (re-runnable) and signing in again, three times, as Eve and as someone who never chose.
  main.exec(mainSchema);
  for (let i = 0; i < 3; i++) {
    await userFor(env, 'google', 'pid-eve', { email: 'eve@gmail.test' });
    await userFor(env, 'google', 'pid-norow', { email: 'norow@gmail.test' });
  }
  assert.equal(JSON.stringify(rows('uid-eve')), eve);
  assert.deepEqual(rows('uid-norow'), [], 'no row means no preference recorded, not subscribed');
  assert.equal(count(), 2);
  // The onboarding defaults arriving again for Eve (no handle yet) keep her unsubscribe and her choice.
  assert.equal((await send('PUT', gate(onboarding(unchanged, unchanged), 'eve_demo'), 'eve')).status, 200);
  assert.equal(JSON.stringify(rows('uid-eve')), eve);
  assert.equal((await send('GET', null, 'norow')).body.emailPreferences.newsletter.enabled, null);
  assert.equal((await marketingRecipient(env, 'uid-norow', 'newsletter')).reason, 'no_preference');
  assert.equal((await marketingRecipient(env, 'uid-eve', 'newsletter')).reason, 'opted_out');
});

test('the migration only creates tables: no INSERT, UPDATE, DELETE, ALTER or DROP, and it can run twice', () => {
  const sql = readFileSync(new URL('../migrations/0028-email-preferences.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|REPLACE)\b/i);
  assert.equal([...sql.matchAll(/CREATE TABLE/gi)].length, [...sql.matchAll(/CREATE TABLE IF NOT EXISTS/gi)].length, 'every table is IF NOT EXISTS');
});

// ---------- unsubscribe ----------

const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html', ...headers } });
const BASE = 'https://digrabbithole.test';
const unsubReq = (url, init) => new Request(url, init);

test('an unsubscribe link turns off only its own category, and a mail scanner opening it changes nothing', async t => {
  const { env, send, rows } = fixture(t);
  await send('PUT', gate(onboarding({ enabled: true, touched: true }, { enabled: true, touched: true })));
  const link = await unsubscribeUrl(env, BASE, 'uid-ada', 'newsletter');
  const token = new URL(link).searchParams.get('token');
  const seen = await handleUnsubscribe(unsubReq(link), env, '/unsubscribe', { baseUrl: BASE, html });
  assert.equal(seen.status, 200);
  assert.match(await seen.text(), /Unsubscribe from Newsletter\?/);
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled]), [['newsletter', 1], ['updates', 1]], 'GET does not unsubscribe');
  const done = await handleUnsubscribe(unsubReq(`${BASE}/unsubscribe`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(token)}` }), env, '/unsubscribe', { baseUrl: BASE, html });
  assert.equal(done.status, 200);
  assert.match(await done.text(), /unsubscribed from Newsletter/);
  const got = Object.fromEntries(rows('uid-ada').map(r => [r.category, r]));
  assert.deepEqual([got.newsletter.enabled, got.newsletter.source, got.newsletter.method, got.newsletter.affirmative, got.newsletter.disclosure_version], [0, 'unsubscribe', 'unsubscribe_link', 0, null]);
  assert.deepEqual([got.updates.enabled, got.updates.method, got.updates.affirmative], [1, 'signup_user_checked', 1], 'Updates untouched');
  // Then Updates by its own link, one-click style (token in the URL, no form).
  const second = await handleUnsubscribe(unsubReq(await unsubscribeUrl(env, BASE, 'uid-ada', 'updates'), { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), env, '/unsubscribe', { baseUrl: BASE, html });
  assert.equal(second.status, 200);
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled, r.method]), [['newsletter', 0, 'unsubscribe_link'], ['updates', 0, 'unsubscribe_link']]);
});

test('unsubscribe refuses bad, forged, wrong-type and cross-site requests, and other paths are not its own', async t => {
  const { env, rows, count } = fixture(t);
  const post = (token, headers = {}) => handleUnsubscribe(unsubReq(`${BASE}/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST', headers }), env, '/unsubscribe', { baseUrl: BASE, html });
  const good = new URL(await unsubscribeUrl(env, BASE, 'uid-ada', 'newsletter')).searchParams.get('token');
  assert.equal((await post('')).status, 400);
  assert.equal((await post(`${good.split('.')[0]}.AAAA`)).status, 400, 'a bad signature');
  assert.equal((await post(await sign({ t: 'unsub', uid: 'uid-ada', cat: 'newsletter' }, 'another-key'))).status, 400, 'another key');
  assert.equal((await post(await sign({ t: 'magic', id: 'x' }, MASTER_KEY))).status, 400, 'a sign-in token is not an unsubscribe token');
  assert.equal((await post(await sign({ t: 'unsub', uid: 'uid-ada', cat: 'billing' }, MASTER_KEY))).status, 400, 'an unknown category');
  assert.equal((await post(good, { Origin: 'https://evil.test' })).status, 403);
  assert.equal(count(), 0);
  assert.equal(await handleUnsubscribe(unsubReq(`${BASE}/other`), env, '/other', { baseUrl: BASE, html }), null);
  assert.equal((await handleUnsubscribe(unsubReq(`${BASE}/unsubscribe`, { method: 'DELETE' }), env, '/unsubscribe', { baseUrl: BASE, html })).status, 405);
  assert.deepEqual(rows('uid-ada'), []);
});

test('unsubscribing a person who never chose records an off row, so it is on record', async t => {
  const { env, rows } = fixture(t);
  await handleUnsubscribe(unsubReq(await unsubscribeUrl(env, BASE, 'uid-bob', 'updates'), { method: 'POST' }), env, '/unsubscribe', { baseUrl: BASE, html });
  assert.deepEqual(brief(rows('uid-bob')).map(r => [r.category, r.enabled, r.method]), [['updates', 0, 'unsubscribe_link']]);
});

// ---------- verified deliverable address, pending, and the one sender gate ----------

test('deliverableEmail: Google (verified only), the emailed link and nothing else; never an internal principal', () => {
  const row = (provider, provider_email, last_login_at = 1) => ({ provider, provider_email, last_login_at });
  assert.deepEqual(VERIFIED_PROVIDERS, ['email', 'google']);
  assert.equal(deliverableEmail([row('google', 'a@gmail.test')]), 'a@gmail.test');
  assert.equal(deliverableEmail([row('email', 'B@Example.test')]), 'b@example.test');
  assert.equal(deliverableEmail([row('github', 'gh@example.test')]), null, 'GitHub: auth.js keeps the public profile email, unverified');
  assert.equal(deliverableEmail([row('google', null)]), null, 'Google unverified or no email is stored as null');
  assert.equal(deliverableEmail([row('google', 'user@abc.rabbithole.invalid')]), null);
  assert.equal(deliverableEmail([row('email', 'not an address')]), null);
  assert.equal(deliverableEmail([]), null);
  assert.equal(deliverableEmail([row('google', 'old@gmail.test', 1), row('email', 'new@example.test', 9)]), 'new@example.test', 'the most recent sign-in wins');
});

test('missing verified email keeps the preference pending: saved and shown, never sendable', async t => {
  const { env, send } = fixture(t, { people: {
    gh: { provider: 'github', providerEmail: 'gh@example.test' }, ghprivate: { provider: 'github', providerEmail: null }, gunverified: { provider: 'google', providerEmail: null },
  } });
  for (const key of ['gh', 'ghprivate', 'gunverified']) {
    const saved = await send('PUT', gate(onboarding({ enabled: true, touched: true }, { enabled: true, touched: true }), `h_${key}`), key);
    assert.equal(saved.status, 200, 'the account is created and the choice stored');
    assert.deepEqual([saved.body.emailPreferences.updates.enabled, saved.body.emailPreferences.deliverable], [true, false], 'pending');
    for (const category of CATEGORIES) assert.deepEqual(await marketingRecipient(env, `uid-${key}`, category), { send: false, reason: 'no_verified_email' });
  }
});

test('marketingRecipient: current preference, affirmative consent where required, a verified address and suppression, in that order', async t => {
  const { env, main, send } = fixture(t);
  const ask = category => marketingRecipient(env, 'uid-ada', category);
  assert.equal((await ask('newsletter')).reason, 'no_preference');
  await send('PUT', gate(onboarding(unchanged, unchanged)));
  assert.deepEqual(await ask('updates'), { send: true, address: 'ada@gmail.test' }, 'Updates may go on a preselected yes (owner decision pending)');
  assert.equal((await ask('newsletter')).reason, 'needs_affirmative_consent', 'a preselected Newsletter is not an opt-in');
  await send('PUT', { emailPreferences: { source: 'settings', disclosure: 'v1', newsletter: { enabled: true } } });
  assert.deepEqual(await ask('newsletter'), { send: true, address: 'ada@gmail.test' });
  main.prepare("INSERT INTO email_suppressions VALUES ('ada@gmail.test', 'bounce', 1)").run();
  assert.equal((await ask('newsletter')).reason, 'suppressed');
  main.prepare('DELETE FROM email_suppressions').run();
  await send('PUT', { emailPreferences: { source: 'settings', disclosure: 'v1', newsletter: { enabled: false } } });
  assert.equal((await ask('newsletter')).reason, 'opted_out');
  assert.equal((await marketingRecipient(env, 'uid-ada', 'billing')).reason, 'unknown_category');
  assert.equal((await marketingRecipient(env, '', 'updates')).send, false);
  assert.equal((await marketingRecipient(env, 'uid-missing', 'updates')).reason, 'no_preference');
});

test('sendDecision applies the affirmative rule from AFFIRMATIVE_REQUIRED only', () => {
  const on = { enabled: true, affirmative: false }, address = 'a@b.test';
  assert.deepEqual(AFFIRMATIVE_REQUIRED, { updates: false, newsletter: true });
  assert.equal(sendDecision({ category: 'updates', preference: on, address }).send, true);
  assert.equal(sendDecision({ category: 'newsletter', preference: on, address }).reason, 'needs_affirmative_consent');
  assert.equal(sendDecision({ category: 'newsletter', preference: { ...on, affirmative: true }, address }).send, true);
  assert.equal(sendDecision({ category: 'newsletter', preference: { enabled: false, affirmative: true }, address }).reason, 'opted_out');
  assert.equal(sendDecision({ category: 'newsletter', preference: { ...on, affirmative: true }, address: null }).reason, 'no_verified_email');
});

// ---------- code shipped before the migration ----------

test('before the migration is applied: the profile still loads, and Continue fails loudly instead of dropping the choice', async t => {
  const { send } = fixture(t, { mainSql: mainSchema.split('CREATE TABLE IF NOT EXISTS user_email_preferences')[0] });
  const read = await send('GET');
  assert.equal(read.status, 200);
  assert.equal('emailPreferences' in read.body, false);
  const refused = await send('PUT', gate(onboarding(unchanged, unchanged)));
  assert.equal(refused.status, 503);
  assert.match(refused.body.error, /could not be saved/);
  assert.equal((await send('PUT', { name: 'Ada' })).status, 200, 'unrelated edits keep working');
});

// ---------- the pure rules ----------

test('methods, defaults and the wording', () => {
  assert.deepEqual(METHODS, ['signup_preselected', 'signup_user_checked', 'signup_user_unchecked', 'settings_user_set', 'unsubscribe_link']);
  assert.equal(methodFor('onboarding', { enabled: true, touched: false }), 'signup_preselected');
  assert.equal(methodFor('onboarding', { enabled: true, touched: true }), 'signup_user_checked');
  assert.equal(methodFor('onboarding', { enabled: false, touched: true }), 'signup_user_unchecked');
  assert.equal(methodFor('settings', { enabled: false }), 'settings_user_set');
  assert.equal(methodFor('unsubscribe', { enabled: false }), 'unsubscribe_link');
  assert.deepEqual(METHODS.filter(m => isAffirmative(m, true)), ['signup_user_checked', 'settings_user_set']);
  assert.equal(isAffirmative('signup_user_checked', false), false);
  assert.deepEqual(wording().updates.label, 'Rabbit Hole Updates');
  assert.deepEqual(wording().newsletter.label, 'Newsletter');
  assert.deepEqual(validateEmailPreferences({ source: 'settings', disclosure: 'v1', updates: { enabled: false } }).value.choices, { updates: { enabled: false, method: 'settings_user_set', affirmative: false } });
  assert.deepEqual(preferenceView([], null), { disclosure: 'v1', deliverable: false, updates: { enabled: null, affirmative: false }, newsletter: { enabled: null, affirmative: false } });
});

test('saveEmailPreferences writes only the categories named', async t => {
  const { env, rows } = fixture(t);
  await saveEmailPreferences(env, 'uid-ada', validateEmailPreferences({ source: 'settings', disclosure: 'v1', updates: { enabled: true } }).value, 5);
  assert.deepEqual(brief(rows('uid-ada')).map(r => [r.category, r.enabled]), [['updates', 1]]);
  assert.equal(rows('uid-ada')[0].changed_at, 5);
});
