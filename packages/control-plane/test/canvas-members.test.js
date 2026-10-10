// Per-canvas members and recipient-only invitations (docs/features/canvas-comments.md section 6, the H7 contract),
// through the control plane's route on LEARN_DB as node:sqlite. Sessions are real signed session tokens; mail is a
// recording stub. ana owns the canvas; ben accepts with the address he controls; cara is another account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { sign } from '../src/token.js';
import { canvasMembersRoute, capKey, maskEmail, membersPath, newCode, CODE_TRIES, INVITE_LOCK } from '../src/canvas-members.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const KEY = 'test-master-key';
const PEOPLE = { ana: { uid: 'u-ana-5d1e', email: 'ana@test' }, ben: { uid: 'u-ben-9a2b', email: 'user@u-ben-9a2b.rabbithole.invalid' }, cara: { uid: 'u-cara-71f0', email: 'cara@test' } };
const BOARD_ID = '6f1c9a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const CANVAS = 'canvas-0000000a';
const ORIGIN = 'https://app.test';

function setup(t, vars = {}) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.exec(`INSERT INTO canvases (org, name, owner_email, title) VALUES ('ana-ws', '${CANVAS}', 'ana@test', 'Why attention scales');
    INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES ('${BOARD_ID}', 'ana-ws', 'ana@test', '${CANVAS}', 'main', '{"blocks":[]}', '2026-10-07');
    INSERT INTO user_profiles (email, name) VALUES ('ana@test', 'Ada Lovelace'), ('user@u-ben-9a2b.rabbithole.invalid', 'Bob Kim');
    INSERT INTO user_handles (email, handle) VALUES ('ana@test', 'ada'), ('user@u-ben-9a2b.rabbithole.invalid', 'bob');`);
  // sessionOf reads the user's session epoch from the main DB.
  const DB = { prepare: () => ({ bind: () => ({ first: async () => ({ session_epoch: 0 }) }) }) };
  // /api/me for the comments routes (the app worker's identity): the same people.
  const CONTROL_PLANE = { fetch: async request => {
    const who = Object.values(PEOPLE).find(p => request.headers.get('x-small-session') === sessions[p.uid]);
    return who ? Response.json({ email: who.email, org: `${who.uid}-ws`, user_id: who.uid }) : new Response('no', { status: 401 });
  } };
  const mail = [];
  const mailer = { ok: true };
  const sendEmail = async (env, to, subject, text) => { mail.push({ to, subject, text }); return mailer.ok; };
  const env = { LEARN_DB, DB, CONTROL_PLANE, MASTER_KEY: KEY, PUBLIC_ORIGIN: ORIGIN, ...vars };
  const sessions = {};
  const ready = Promise.all(Object.values(PEOPLE).map(async p => { sessions[p.uid] = await sign({ t: 'sess', uid: p.uid, email: p.email, ep: 0, prov: 'google', exp: Math.floor(Date.now() / 1000) + 3600 }, KEY); }));
  const call = async (method, path, { as, body, origin = ORIGIN } = {}) => {
    await ready;
    const headers = { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(as ? { 'X-Small-Session': sessions[PEOPLE[as].uid] } : {}) };
    const req = new Request(`${ORIGIN}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = membersPath(path) ? await canvasMembersRoute(req, env, path, { sendEmail }) : await canvasCommentsRoute(path, req, env);
    const text = await response.text();
    for (const p of Object.values(PEOPLE)) assert.equal(text.includes(p.uid), false, `${method} ${path} answered with an account id`);
    assert.equal(text.includes('rabbithole.invalid'), false, `${method} ${path} answered with a principal`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: JSON.parse(text), headers: response.headers };
  };
  const base = `/api/learn/c/${BOARD_ID}`;
  const tokenOf = message => message.text.match(/\/i#([A-Za-z0-9_-]+)/)[1];
  const codeOf = message => message.text.match(/Your code: (\d{6})/)[1];
  return { sqlite, env, mail, mailer, call, base, tokenOf, codeOf };
}
const invite = (f, emails, as = 'ana') => f.call('POST', `${f.base}/members`, { as, body: { emails } });

test('codes are six uniform digits; cap keys fold only the +tag; addresses are masked', () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), /^\d{6}$/);
  assert.equal(capKey('b+canvas@lab.org'), 'b@lab.org');
  assert.equal(capKey('b.k@lab.org'), 'b.k@lab.org');
  assert.equal(maskEmail('bob@lab.org'), 'b•••@lab.org');
});

test('the owner invites by email: delivery to the address as typed (normalized), a fixed template, the link built from PUBLIC_ORIGIN', async t => {
  const f = setup(t);
  const sent = await invite(f, ['  B+Canvas@Lab.org ', 'not an email', 'x@host.invalid']);
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.body.invited.map(i => i.email_status), ['sent']);
  assert.deepEqual(sent.body.skipped, [{ email: 'not an email', reason: 'invalid_email' }, { email: 'x@host.invalid', reason: 'invalid_email' }]);
  assert.equal(f.mail.length, 1);
  assert.equal(f.mail[0].to, 'b+canvas@lab.org', 'the +tag is kept for delivery');
  assert.equal(f.mail[0].subject, "Ada Lovelace (@ada) invited you to comment on 'Why attention scales'");
  assert.match(f.mail[0].text, new RegExp(`${ORIGIN}/i#[A-Za-z0-9_-]{20,}`));
  assert.match(f.mail[0].text, /Replies to this email aren't read\.\n$/);
  assert.equal(sent.body.invited[0].test_invite_url, undefined, 'no echo outside a test instance');
  assert.equal((await invite(f, ['b+canvas@lab.org'])).body.skipped[0].reason, 'already_invited');
  const list = await f.call('GET', `${f.base}/members`, { as: 'ana' });
  assert.deepEqual(list.body.members.map(m => [m.invited_email, m.status, m.email_status]), [['b+canvas@lab.org', 'pending', 'sent']]);
  for (const as of ['ben', 'cara']) assert.equal((await f.call('GET', `${f.base}/members`, { as })).status, 404, `${as} cannot see members`);
  assert.equal((await f.call('GET', `${f.base}/members`)).status, 401);
  assert.equal((await f.call('POST', `${f.base}/members`, { as: 'ana', body: { emails: ['c@lab.org'] }, origin: 'https://evil.test' })).status, 403);
  assert.equal((await f.call('POST', `${f.base}/members`, { as: 'ana', body: { emails: ['c@lab.org'] }, origin: null })).status, 403, 'a POST without Origin');
  assert.match(f.sqlite.prepare('SELECT token_hash FROM canvas_members').get().token_hash, /^[A-Za-z0-9_-]{40,}$/, 'only the token hash is stored');
});

test('accept: preview, a fresh code to the invited address, a wrong try, then join; the account becomes a member of the comments', async t => {
  const f = setup(t);
  await invite(f, ['bob@lab.org']);
  const token = f.tokenOf(f.mail[0]);
  const signedOut = await f.call('POST', '/api/learn/invites/preview', { body: { token } });
  assert.deepEqual([signedOut.body.state, signedOut.body.masked_email, signedOut.body.inviter, signedOut.body.signed_in, signedOut.body.title], ['pending', 'b•••@lab.org', { name: 'Ada Lovelace', handle: 'ada' }, false, 'Why attention scales']);
  const seen = await f.call('POST', '/api/learn/invites/preview', { as: 'ben', body: { token } });
  assert.deepEqual(seen.body.account, { name: 'Bob Kim', handle: 'bob', provider_label: 'Google' });
  assert.deepEqual([seen.body.already_member, seen.body.owner_self], [false, false]);
  assert.equal((await f.call('POST', '/api/learn/invites/code', { body: { token } })).body.code, 'sign_in');
  const code = await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } });
  assert.deepEqual(code.body, { sent: true, masked_email: 'b•••@lab.org', expires_in: 600, retry_after: 60 });
  const mail = f.mail[1];
  assert.deepEqual([mail.to, mail.subject], ['bob@lab.org', 'Your Rabbit Hole invitation code']);
  assert.match(mail.text, /signed in to Rabbit Hole as Bob Kim \(@bob\) asked to accept Ada Lovelace \(@ada\)'s invitation to 'Why attention scales'/);
  const digits = f.codeOf(mail);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_invite_codes WHERE code_hmac LIKE ?').get(`%${digits}%`).n, 0, 'the code is stored only as an HMAC');
  const wrong = await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: digits === '000000' ? '111111' : '000000' } });
  assert.deepEqual([wrong.status, wrong.body.code, wrong.body.tries_left], [422, 'code_wrong', CODE_TRIES - 1]);
  assert.equal((await f.call('POST', '/api/learn/invites/accept', { as: 'cara', body: { token, code: digits } })).body.code, 'code_needed', 'another account has no code to try');
  const joined = await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: digits } });
  assert.deepEqual(joined.body, { joined: true, url: `/c/${BOARD_ID}` });
  assert.deepEqual({ ...f.sqlite.prepare('SELECT status, member_user_id FROM canvas_members').get() }, { status: 'active', member_user_id: 'u-ben-9a2b' }, 'bound to users.id');
  // The link is spent for everyone else; the same account repeating gets the same answer (a lost 200, a second tab).
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { body: { token } })).body.code, 'invite_invalid');
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { as: 'cara', body: { token } })).body.code, 'invite_invalid');
  assert.equal((await f.call('POST', '/api/learn/invites/code', { as: 'cara', body: { token } })).body.code, 'invite_invalid');
  assert.deepEqual((await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: digits } })).body, { joined: true, url: `/c/${BOARD_ID}` }, 'a sequential replay');
  const again = await f.call('POST', '/api/learn/invites/preview', { as: 'ben', body: { token } });
  assert.deepEqual([again.body.already_member, again.body.url], [true, `/c/${BOARD_ID}`]);
  const members = (await f.call('GET', `${f.base}/members`, { as: 'ana' })).body.members;
  assert.deepEqual(members.map(m => [m.status, m.person]), [['active', { name: 'Bob Kim', handle: 'bob' }]]);
  // The membership is the comments permission: ben now reads and posts on the member family.
  const about = await f.call('GET', f.base, { as: 'ben' });
  assert.deepEqual([about.status, about.body.role, about.body.can.post], [200, 'member', true]);
  assert.equal((await f.call('POST', `${f.base}/members/${members[0].id}/resend`, { as: 'ana' })).body.code, 'already_joined');
  // Remove access: the comments answer 404 again.
  await f.call('DELETE', `${f.base}/members/${members[0].id}`, { as: 'ana' });
  assert.equal((await f.call('GET', f.base, { as: 'ben' })).status, 404);
});

test('codes: one per minute per account, a new code ends only this account\'s earlier one, five tries, expiry', async t => {
  const f = setup(t);
  await invite(f, ['bob@lab.org']);
  const token = f.tokenOf(f.mail[0]);
  await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } });
  await f.call('POST', '/api/learn/invites/code', { as: 'cara', body: { token } });
  const again = await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } });
  assert.deepEqual([again.status, again.body.code], [429, 'too_many_codes']);
  assert.ok(again.body.retry_after >= 1 && again.body.retry_after <= 60);
  assert.equal(again.headers.get('retry-after'), String(again.body.retry_after));
  // A minute later ben's new code ends his old one; cara's stays open.
  f.sqlite.exec('UPDATE canvas_invite_sends SET sent_at = sent_at - 61; UPDATE canvas_invite_codes SET sent_at = sent_at - 61');
  assert.equal((await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } })).status, 200);
  assert.deepEqual(f.sqlite.prepare('SELECT user_id, ended_at IS NULL AS open FROM canvas_invite_codes ORDER BY sent_at, rowid').all().map(r => [r.user_id, r.open]), [['u-ben-9a2b', 0], ['u-cara-71f0', 1], ['u-ben-9a2b', 1]]);
  const digits = f.codeOf(f.mail.at(-1));
  const bad = digits === '000000' ? '111111' : '000000';
  for (let i = 1; i < CODE_TRIES; i++) assert.equal((await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: bad } })).body.tries_left, CODE_TRIES - i);
  assert.equal((await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: bad } })).body.code, 'too_many_tries');
  assert.equal((await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: digits } })).body.code, 'too_many_tries', 'a spent code stays spent');
  // cara's code, expired.
  f.sqlite.exec("UPDATE canvas_invite_codes SET expires_at = 1 WHERE user_id = 'u-cara-71f0'");
  assert.equal((await f.call('POST', '/api/learn/invites/accept', { as: 'cara', body: { token, code: '123456' } })).body.code, 'code_expired');
  // Cancel ends only this account's open code.
  assert.deepEqual((await f.call('POST', '/api/learn/invites/cancel', { as: 'cara', body: { token } })).body, { cancelled: true });
});

test('the invitation-wide lock at 20 wrong codes: preview says locked, codes stop; Resend rotates the link and resets it', async t => {
  const f = setup(t);
  await invite(f, ['bob@lab.org']);
  const token = f.tokenOf(f.mail[0]);
  f.sqlite.exec(`UPDATE canvas_members SET failed_attempts = ${INVITE_LOCK}`);
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { body: { token } })).body.state, 'locked');
  assert.equal((await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } })).body.code, 'too_many_tries');
  const listed = (await f.call('GET', `${f.base}/members`, { as: 'ana' })).body.members[0];
  assert.equal(listed.locked, true, 'the lock is visible to the owner');
  assert.equal((await f.call('POST', `${f.base}/members/${listed.id}/resend`, { as: 'ana' })).body.email_status, 'sent');
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { body: { token } })).body.code, 'invite_invalid', 'the old link is dead');
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { body: { token: f.tokenOf(f.mail.at(-1)) } })).body.state, 'pending');
});

test('owner_self, already a member through another address, cancelled invitations, Trash', async t => {
  const f = setup(t);
  await invite(f, ['bob@lab.org', 'bob@home.org']);
  const [first, second] = f.mail.map(f.tokenOf);
  assert.equal((await f.call('POST', '/api/learn/invites/code', { as: 'ana', body: { token: first } })).body.code, 'owner_self');
  await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token: first } });
  await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token: first, code: f.codeOf(f.mail.at(-1)) } });
  const other = await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token: second } });
  assert.deepEqual([other.status, other.body.code, other.body.url], [409, 'already_member', `/c/${BOARD_ID}`], 'nothing is sent to an existing member');
  assert.equal(f.mail.length, 3);
  const pending = (await f.call('GET', `${f.base}/members`, { as: 'ana' })).body.members.find(m => m.status === 'pending');
  await f.call('DELETE', `${f.base}/members/${pending.id}`, { as: 'ana' });
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { body: { token: second } })).body.code, 'invite_invalid');
  await invite(f, ['cara@lab.org']);
  f.sqlite.exec(`INSERT INTO library_trash (org, name, trashed_at) VALUES ('ana-ws', '${CANVAS}', '2026-10-07')`);
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { body: { token: f.tokenOf(f.mail.at(-1)) } })).body.code, 'invite_invalid', 'Trash suspends invitations');
  assert.equal((await invite(f, ['dan@lab.org'])).body.code, 'trashed');
});

test('caps: owner and recipient caps answer the same `limited` with retry_after; a refused request sends nothing', async t => {
  const f = setup(t);
  for (let i = 0; i < 3; i++) {
    const made = await invite(f, ['bob@lab.org']);
    assert.equal(made.body.invited.length, 1, `invitation ${i + 1}`);
    await f.call('DELETE', `${f.base}/members/${made.body.invited[0].id}`, { as: 'ana' });
  }
  const fourth = await invite(f, ['bob+other@lab.org']);
  assert.deepEqual(fourth.body.skipped.map(s => s.reason), ['limited'], 'owner + recipient: 3 a day, +tags folded');
  assert.ok(fourth.body.skipped[0].retry_after > 23 * 3600, 'a daily cap means hours');
  assert.equal(f.mail.length, 3);
});

test('delivery failures: the invitation says failed (Resend), a code send answers 503 and its code is ended', async t => {
  const f = setup(t);
  f.mailer.ok = false;
  const made = await invite(f, ['bob@lab.org']);
  assert.equal(made.body.invited[0].email_status, 'failed');
  assert.equal((await f.call('GET', `${f.base}/members`, { as: 'ana' })).body.members[0].email_status, 'failed');
  const token = f.tokenOf(f.mail[0]);
  const code = await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } });
  assert.deepEqual([code.status, code.body.code, code.body.retry_after], [503, 'email_unavailable', 60]);
  assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM canvas_invite_codes WHERE ended_at IS NULL').get().n, 0);
});

test('test echoes only on a test instance with its secret (H4)', async t => {
  for (const [vars, echoes] of [[{}, false], [{ SMALL_ENV: 'dev', TEST_BYPASS_SECRET: 's' }, false], [{ SMALL_ENV: 'test' }, false], [{ SMALL_ENV: 'test', TEST_BYPASS_SECRET: 's' }, true]]) {
    const f = setup(t, vars);
    const made = await invite(f, ['bob@lab.org']);
    assert.equal('test_invite_url' in made.body.invited[0], echoes, JSON.stringify(vars));
    const code = await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token: f.tokenOf(f.mail[0]) } });
    assert.equal('test_code' in code.body, echoes, JSON.stringify(vars));
  }
});

test('Allow comments off: the invitation says view, not comment', async t => {
  const f = setup(t);
  f.sqlite.exec(`INSERT INTO canvas_comment_settings (org, canvas, comments_enabled, updated_at) VALUES ('ana-ws', '${CANVAS}', 0, '2026-10-07')`);
  await invite(f, ['bob@lab.org']);
  assert.equal(f.mail[0].subject, "Ada Lovelace (@ada) invited you to view 'Why attention scales'");
  assert.match(f.mail[0].text, /invited you to view 'Why attention scales'/);
  assert.equal((await f.call('POST', '/api/learn/invites/preview', { body: { token: f.tokenOf(f.mail[0]) } })).body.comments_enabled, false);
});

test('a member reads the board, its files and Shared with you; anyone else and a removed member get 404', async t => {
  const f = setup(t);
  await invite(f, ['bob@lab.org']);
  const token = f.tokenOf(f.mail[0]);
  await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } });
  await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: f.codeOf(f.mail.at(-1)) } });
  const board = await f.call('GET', `${f.base}/board`, { as: 'ben' });
  assert.deepEqual([board.status, board.body.title, board.body.role, board.body.owner, board.body.state], [200, 'Why attention scales', 'member', { name: 'Ada Lovelace', handle: 'ada' }, { blocks: [] }]);
  assert.equal((await f.call('GET', `${f.base}/board`, { as: 'cara' })).status, 404);
  assert.equal((await f.call('GET', `${f.base}/assets/pdf%3Ax`, { as: 'cara' })).status, 404);
  const mine = await f.call('GET', '/api/learn/c/shared-with-me', { as: 'ben' });
  assert.deepEqual(mine.body.canvases.map(c => [c.board_id, c.title, c.owner.handle, c.unread]), [[BOARD_ID, 'Why attention scales', 'ada', 0]]);
  assert.deepEqual((await f.call('GET', '/api/learn/c/shared-with-me', { as: 'cara' })).body.canvases, []);
  const member = (await f.call('GET', `${f.base}/members`, { as: 'ana' })).body.members[0];
  await f.call('DELETE', `${f.base}/members/${member.id}`, { as: 'ana' });
  assert.equal((await f.call('GET', `${f.base}/board`, { as: 'ben' })).status, 404);
  assert.deepEqual((await f.call('GET', '/api/learn/c/shared-with-me', { as: 'ben' })).body.canvases, []);
});

test('a member reads only the files the board uses now: a removed notebook\'s workspace or any other key is 404', async t => {
  // Every key exists in R2 here; only the board decides what a member may read.
  const LEARN_MEDIA = { get: async () => ({ body: '{}', httpMetadata: { contentType: 'text/x-cached-string' }, customMetadata: { kind: 'string' } }) };
  const f = setup(t, { LEARN_MEDIA });
  f.sqlite.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ?').run(JSON.stringify({ blocks: [{ id: 'nb', type: 'notebook', notebook_id: 'nb-1' }] }), BOARD_ID);
  await invite(f, ['bob@lab.org']);
  const token = f.tokenOf(f.mail[0]);
  await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token } });
  await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token, code: f.codeOf(f.mail.at(-1)) } });
  const session = await sign({ t: 'sess', uid: PEOPLE.ben.uid, email: PEOPLE.ben.email, ep: 0, prov: 'google', exp: Math.floor(Date.now() / 1000) + 3600 }, KEY);
  const file = async key => {
    const path = `${f.base}/assets/${encodeURIComponent(key)}`;
    return (await canvasCommentsRoute(path, new Request(`${ORIGIN}${path}`, { headers: { 'X-Small-Session': session } }), f.env)).status;
  };
  assert.equal(await file('notebook:nb-1'), 200);
  for (const key of ['notebook:nb-old', 'pdf:x']) assert.equal(await file(key), 404, key);
});

test('recipient-wide caps across owners refuse with the same `limited` an owner cap does; a lost race consumes nothing', async t => {
  const f = setup(t);
  f.sqlite.exec(`INSERT INTO canvases (org, name, owner_email, title) VALUES ('cara-ws', 'canvas-0000000b', 'cara@test', 'Cara canvas');
    INSERT INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES ('7a2d9b3f-4c5e-4f60-9b1c-2d3e4f5a6b7c', 'cara-ws', 'cara@test', 'canvas-0000000b', 'main', '{}', '2026-10-07')`);
  const cara = emails => f.call('POST', '/api/learn/c/7a2d9b3f-4c5e-4f60-9b1c-2d3e4f5a6b7c/members', { as: 'cara', body: { emails } });
  for (let i = 0; i < 3; i++) {
    const made = await invite(f, ['bob@lab.org']);
    await f.call('DELETE', `${f.base}/members/${made.body.invited[0].id}`, { as: 'ana' });
  }
  const ownerCap = (await invite(f, ['bob@lab.org'])).body.skipped[0];
  for (let i = 0; i < 2; i++) {
    const made = await cara(['bob@lab.org']);
    assert.equal(made.body.invited.length, 1, `cara ${i + 1}`);
    await f.call('DELETE', `/api/learn/c/7a2d9b3f-4c5e-4f60-9b1c-2d3e4f5a6b7c/members/${made.body.invited[0].id}`, { as: 'cara' });
  }
  const recipientCap = (await cara(['bob@lab.org'])).body.skipped[0];
  assert.deepEqual(Object.keys(recipientCap), Object.keys(ownerCap));
  assert.deepEqual([recipientCap.reason, ownerCap.reason], ['limited', 'limited'], 'nobody can tell whose cap it was');
  const sends = f.sqlite.prepare('SELECT count(*) AS n FROM canvas_invite_sends').get().n;
  assert.equal(sends, 5, 'refusals consumed nothing');
});

test('the code email names an account with neither name nor handle by its provider label', async t => {
  const f = setup(t);
  await invite(f, ['cara@lab.org']);
  await f.call('POST', '/api/learn/invites/code', { as: 'cara', body: { token: f.tokenOf(f.mail[0]) } });
  assert.match(f.mail.at(-1).text, /signed in to Rabbit Hole as a Google user asked/);
});

test('a kept hash is never claimable again: not after joining, not after Remove, not after a re-invite of the same address', async t => {
  const f = setup(t);
  await invite(f, ['bob@lab.org']);
  const old = f.tokenOf(f.mail[0]);
  await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token: old } });
  await f.call('POST', '/api/learn/invites/accept', { as: 'ben', body: { token: old, code: f.codeOf(f.mail.at(-1)) } });
  const sent = f.mail.length;
  for (const as of ['cara', 'ana']) assert.equal((await f.call('POST', '/api/learn/invites/code', { as, body: { token: old } })).body.code, 'invite_invalid', `${as} with the used link`);
  const member = (await f.call('GET', `${f.base}/members`, { as: 'ana' })).body.members[0];
  assert.equal((await f.call('POST', `${f.base}/members/${member.id}/resend`, { as: 'ana' })).body.code, 'already_joined', 'an active row is never rotated');
  await f.call('DELETE', `${f.base}/members/${member.id}`, { as: 'ana' });
  for (const action of ['preview', 'code', 'accept']) assert.equal((await f.call('POST', `/api/learn/invites/${action}`, { as: 'ben', body: { token: old, code: '123456' } })).body.code, 'invite_invalid', `${action} after Remove`);
  await invite(f, ['bob@lab.org']);
  const fresh = f.tokenOf(f.mail.at(-1));
  assert.notEqual(fresh, old);
  assert.equal((await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token: old } })).body.code, 'invite_invalid', 'the old link stays dead after a re-invite');
  assert.equal((await f.call('POST', '/api/learn/invites/code', { as: 'ben', body: { token: fresh } })).status, 200);
  assert.equal(f.mail.length, sent + 2, 'only the re-invite and its code were sent');
});
