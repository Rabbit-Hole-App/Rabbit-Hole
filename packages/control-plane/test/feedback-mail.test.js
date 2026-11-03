import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { sign } from '../src/token.js';
import { composeFeedbackMail, feedbackNotify } from '../src/feedback-mail.js';

// Same loader stub as web-auth.test.js: the SPA shell .html import becomes an empty string.
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, n) { return s.endsWith('.html') ? { url: 'stub:html', shortCircuit: true } : n(s, c); }
  export async function load(u, c, n) { return u === 'stub:html' ? { format: 'module', source: 'export default ""', shortCircuit: true } : n(u, c); }
`));
const worker = (await import('../src/index.js')).default;

const KEY = 'learn-feedback/2026-11-03/2026-11-03T10:00:00.000Z-0b1c.json';
const NOW = Date.parse('2026-11-03T10:01:00.000Z');
const report = (over = {}) => ({
  id: '0b1c', ref: 'RH-7QK2-M9XD', at: '2026-11-03T10:00:00.000Z', app: 'canvas-1a2b3c4d', org: 'gmail-com', email: 'a@gmail.com', userId: 'u1',
  contact: { email: 'a@gmail.com', verified: true, provider: 'google' }, handle: 'yuvish_demo', kind: 'bug', text: 'The graph froze\nafter I dropped a PDF',
  context: { board: 'main', path: '/apps/canvas-1a2b3c4d?tab=learn', viewport: '1440x900', userAgent: 'Mozilla/5.0 (X11)' },
  diagnostics: { fingerprints: ['0123456789abcdef'], traces: ['fedcba9876543210'] }, ...over,
});
const OWNER = 'owner@example.test';
const media = (stored = {}) => ({ get: async key => (key in stored ? { json: async () => stored[key] } : null) });
const post = body => new Request('https://cp/api/feedback/notify', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const notify = (env, body = { key: KEY }, user = { uid: 'u1', email: 'a@gmail.com' }, sendEmail) => {
  const sent = [];
  const send = sendEmail || (async (...args) => { sent.push(args); return true; });
  return feedbackNotify(post(body), env, user, { sendEmail: send, now: NOW }).then(response => ({ response, sent }));
};

test('the mail carries kind, reference, text, sender, place, device, diagnostics, time and the stored key', () => {
  const mail = composeFeedbackMail(report(), KEY);
  assert.equal(mail.subject, '[Rabbit Hole] Bug report RH-7QK2-M9XD');
  assert.equal(composeFeedbackMail(report({ kind: 'idea' }), KEY).subject, '[Rabbit Hole] Feature suggestion RH-7QK2-M9XD');
  for (const line of ['Kind: Bug report', 'Reference: RH-7QK2-M9XD', 'Received: 2026-11-03T10:00:00.000Z', 'The graph froze\nafter I dropped a PDF', 'From: @yuvish_demo',
    'Contact: a@gmail.com (verified: Google sign-in)', 'Account: u1', 'Page: /apps/canvas-1a2b3c4d?tab=learn', 'App: canvas-1a2b3c4d', 'Board: main', 'Screen: 1440x900',
    'Browser: Mozilla/5.0 (X11)', 'Diagnostics: errors 0123456789abcdef; failed requests fedcba9876543210', `Stored at: ${KEY}`]) assert.ok(mail.text.includes(line), line);
  assert.equal(mail.replyTo, 'a@gmail.com');
});

test('the mail has no Reply-To for an unverified or internal address, no header injection, and no share-link token', () => {
  assert.equal(composeFeedbackMail(report({ contact: { email: 'gh@example.com', verified: false, provider: 'github' } }), KEY).replyTo, null);
  const internal = composeFeedbackMail(report({ contact: { email: 'user@abc.rabbithole.invalid', verified: true, provider: 'email' } }), KEY);
  assert.equal(internal.replyTo, null);
  assert.ok(internal.text.includes('Contact: no deliverable address on file'));
  assert.equal(composeFeedbackMail(report({ contact: null, handle: null }), KEY).replyTo, null);
  const hostile = composeFeedbackMail(report({ ref: 'RH-AAAA-BBBB\r\nBcc: evil@example.test', kind: 'bug\r\nBcc: evil@example.test', context: { path: '/b/SECRETTOKEN123/x\r\nBcc: evil@example.test', userAgent: 'a\r\nBcc: evil@example.test' } }), KEY);
  assert.doesNotMatch(hostile.subject, /[\r\n]/);
  assert.equal(hostile.subject, '[Rabbit Hole] Feedback');
  assert.doesNotMatch(hostile.text, /SECRETTOKEN123/);
  assert.doesNotMatch(hostile.text, /^Bcc:/m, 'a single-line field cannot start a new line');
});

test('the recipient is the FEEDBACK_NOTIFY_TO var only; empty or missing sends nothing and a caller cannot choose one', async () => {
  const stored = { [KEY]: report() };
  const env = { LEARN_MEDIA: media(stored), FEEDBACK_NOTIFY_TO: OWNER };
  const ok = await notify(env, { key: KEY, to: 'attacker@example.test', recipient: 'attacker@example.test' });
  assert.equal(ok.response.status, 200);
  assert.equal(ok.sent.length, 1);
  assert.equal(ok.sent[0][1], OWNER);
  assert.deepEqual(ok.sent[0][4], { idempotencyKey: 'feedback-0b1c', replyTo: 'a@gmail.com' });
  for (const FEEDBACK_NOTIFY_TO of [undefined, '', '   ', 'not an address', 'a@b.invalid']) {
    const none = await notify({ ...env, FEEDBACK_NOTIFY_TO });
    assert.equal(none.sent.length, 0);
    assert.deepEqual(await none.response.json(), { sent: false, reason: 'not_configured' });
  }
});

test('only the sender of a recent, stored report can have it mailed', async () => {
  const stored = { [KEY]: report() };
  const env = { LEARN_MEDIA: media(stored), FEEDBACK_NOTIFY_TO: OWNER };
  assert.equal((await notify(env, { key: KEY }, { uid: 'u2', email: 'b@gmail.com' })).response.status, 403, 'someone else');
  assert.equal((await notify(env, { key: KEY }, { email: 'a@gmail.com' })).response.status, 403, 'no session user id');
  assert.equal((await notify(env, { key: 'learn-feedback/2026-11-03/missing.json' })).response.status, 404, 'not stored');
  for (const key of ['../secrets.json', 'learn-feedback-limit/x/y/0', 'learn-feedback/2026-11-03/../x.json', undefined, 7]) assert.equal((await notify(env, { key })).response.status, 400, String(key));
  assert.equal((await notify(env, 'not json')).response.status, 400);
  const late = await feedbackNotify(post({ key: KEY }), env, { uid: 'u1' }, { sendEmail: async () => true, now: NOW + 3600_000 });
  assert.equal(late.status, 409, 'an old key cannot be replayed');
  assert.equal((await notify({ ...env, LEARN_MEDIA: undefined, RUNS: undefined })).response.status, 404);
});

test('a provider failure or crash is a 502 for the app Worker to log, not an unhandled error', async () => {
  const env = { LEARN_MEDIA: media({ [KEY]: report() }), FEEDBACK_NOTIFY_TO: OWNER };
  assert.equal((await notify(env, { key: KEY }, undefined, async () => false)).response.status, 502);
  assert.equal((await notify(env, { key: KEY }, undefined, async () => { throw new Error('boom'); })).response.status, 502);
});

// The real route: a signed session reaches /api/feedback/notify, the Resend call carries reply_to, and a session for another user cannot mail it.
const MIGRATION = ['0025-cli-login-challenges.sql', '0026-users.sql'].map(file => readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')).join('\n');
const MASTER_KEY = 'master-key-for-tests';
test('POST /api/feedback/notify through the worker: a session user mails their own report via Resend with Reply-To, and never to a body-supplied address', async t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(MIGRATION);
  db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, 1), (?, ?, 1)').run('u1', 'user@abc.rabbithole.invalid', 'u2', 'user@def.rabbithole.invalid');
  const DB = { prepare: sql => ({ bind: (...params) => ({
    first: async () => db.prepare(sql).get(...params) || null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
  }) }) };
  const resend = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { resend.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) }); return new Response('{}', { status: 200 }); });
  const stored = { [KEY]: report({ userId: 'u1', contact: { email: 'real@gmail.com', verified: true, provider: 'google' } }) };
  const env = { MASTER_KEY, DB, LEARN_MEDIA: media(stored), FEEDBACK_NOTIFY_TO: OWNER, RESEND_API_KEY: 'resend-fixture-key', EMAIL_FROM: 'Rabbit Hole <signin@digrabbithole.com>' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const asUser = async (uid, email) => ({ 'X-Small-Session': await sign({ t: 'sess', uid, email, ep: 0, prov: 'google', exp }, MASTER_KEY), 'content-type': 'application/json' });
  const call = async (headers, body) => worker.fetch(new Request('https://cp.example.test/api/feedback/notify', { method: 'POST', headers, body: JSON.stringify(body) }), env, {});
  // The stored report is two seconds from "now" only if its time is current; refresh it to the present for the freshness window.
  stored[KEY].at = new Date().toISOString();

  assert.equal((await call({ 'content-type': 'application/json' }, { key: KEY })).status, 401, 'no session');
  assert.equal((await call(await asUser('u2', 'user@def.rabbithole.invalid'), { key: KEY })).status, 403, 'another user');
  assert.equal(resend.length, 0);
  const ok = await call(await asUser('u1', 'user@abc.rabbithole.invalid'), { key: KEY, to: 'attacker@example.test' });
  assert.equal(ok.status, 200);
  assert.equal(resend.length, 1);
  assert.equal(resend[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(resend[0].body.to, [OWNER]);
  assert.equal(resend[0].body.from, 'Rabbit Hole <signin@digrabbithole.com>');
  assert.equal(resend[0].body.reply_to, 'real@gmail.com');
  assert.equal(resend[0].body.subject, '[Rabbit Hole] Bug report RH-7QK2-M9XD');
  assert.equal(resend[0].headers['Idempotency-Key'], 'feedback-0b1c');
  assert.equal(resend[0].headers.Authorization, 'Bearer resend-fixture-key');
  assert.equal(JSON.stringify(resend[0].body).includes('resend-fixture-key'), false);
  // Resend down: 502 to the app Worker, nothing thrown.
  globalThis.fetch.mock.mockImplementation(async () => new Response('no', { status: 500 }));
  const down = await call(await asUser('u1', 'user@abc.rabbithole.invalid'), { key: KEY });
  assert.equal(down.status, 502);
});
