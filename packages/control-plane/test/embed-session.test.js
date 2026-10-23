// SHARE-04 embed Chat and public-viewer isolation (C:/s/spec/embed/guest-session-note.md), through the real routes and LEARN_DB
// (shared-canvas-fixture.js) with the model faked at fetch. A "browser" here is a cookie jar: it proves the server logic
// (what is set, refused, counted); that a real Chromium stores, partitions and returns the cookie is the CI lane's browser check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, scriptModel, events } from './shared-canvas-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { devWorker } from './worker-import.js';

let keys = 0;
const sendKey = () => `embed-${String(++keys).padStart(6, '0')}`;
const HOST = 'https://app.test';
// One cookie jar = one embedding site's partition in one browser. `as`: a signed-in account cookie riding along.
function jar(f, { embed = true } = {}) {
  const state = { embed: null, guest: null };
  const cookie = as => [as && `small_session=${as}`, state.embed && `rh_embed=${state.embed}`, state.guest && `rh_guest=${state.guest}`].filter(Boolean).join('; ');
  const remember = headers => {
    for (const set of headers.getSetCookie()) {
      state.embed = set.match(/^rh_embed=([^;]+)/)?.[1] ?? state.embed;
      state.guest = set.match(/^rh_guest=([^;]+)/)?.[1] ?? state.guest;
    }
  };
  const call = async (method, path, { as = null, body, key = null, headers = {}, marker = embed } = {}) => {
    const req = new Request(`${HOST}${path}`, { method, headers: { 'Content-Type': 'application/json', cookie: cookie(as), ...(marker ? { 'x-rh-embed': '1' } : {}), ...(key ? { 'x-rh-action-key': key } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = await learnBoardsRoute(new URL(req.url).pathname, req, f.env);
    const setCookie = response.headers.getSetCookie();
    remember(response.headers);
    const type = response.headers.get('content-type') || '', text = await response.text();
    return { status: response.status, type, text, body: type.includes('json') ? JSON.parse(text) : null, setCookie, headers: response.headers };
  };
  return { state, call,
    init: options => call('POST', '/api/learn/boards/embed-session', options),
    probe: (token, options) => call('GET', `/api/learn/boards/shared/${token}/ask`, options),
    open: (token, options) => call('GET', `/api/learn/boards/shared/${token}`, options),
    ask: (token, body, { key = sendKey(), ...options } = {}) => call('POST', `/api/learn/boards/shared/${token}/ask`, { ...options, body, key }) };
}
const doneOf = response => events(response.text).find(event => event.type === 'done')?.data;
const rows = f => f.sqlite.prepare("SELECT viewer_email FROM shared_ask_events WHERE viewer_email LIKE 'guest:%'").all();
const handle = (f, email, h) => { f.sqlite.prepare('INSERT INTO user_profiles (email, name) VALUES (?, NULL)').run(email); f.sqlite.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?)').run(email, h); };
const publish = async (f, canvas) => (await f.call('POST', `/api/apps/${canvas.name}/publish`, { as: 'ana' })).body.publication_token;

test('init sets the Partitioned rh_embed cookie once: exact attributes, an existing cookie is never rotated, and it is for embeds only', async t => {
  const f = setup(t), tab = jar(f);
  const made = await tab.init();
  assert.deepEqual([made.status, made.body, made.setCookie.length], [200, { created: true }, 1]);
  assert.match(made.setCookie[0], /^rh_embed=[A-Za-z0-9_-]{32}; Path=\/api\/learn; Max-Age=31536000; HttpOnly; Secure; SameSite=None; Partitioned$/);
  assert.equal(made.headers.get('cache-control'), 'no-store');
  const id = tab.state.embed;
  const again = await tab.init();
  assert.deepEqual([again.status, again.body, again.setCookie], [200, { created: false }, []], 'the trial is never reset');
  assert.equal(tab.state.embed, id);
  // A garbage cookie is not a session: init mints a good one.
  const bad = jar(f); bad.state.embed = 'short';
  assert.equal((await bad.init()).body.created, true);
  assert.equal((await jar(f).call('POST', '/api/learn/boards/embed-session', { marker: false })).body.code, 'embed_header_required');
  assert.equal((await tab.call('POST', '/api/learn/boards/embed-session', { headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await tab.call('GET', '/api/learn/boards/embed-session')).status, 405);
  assert.deepEqual(rows(f), [], 'init touches no database row');
});

test('the probe says whether the cookie came back, sets nothing, and authorizes the link first', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject(), tab = jar(f);
  const before = await tab.probe(token);
  assert.deepEqual([before.status, before.body, before.setCookie], [200, { guest: null, embed: { session: false } }, []], 'no cookie: the client shows Open Chat in Rabbit Hole');
  await tab.init();
  const after = await tab.probe(token);
  assert.deepEqual([after.body, after.setCookie], [{ guest: { limit: 10, used: 0, remaining: 10 }, embed: { session: true } }, []]);
  assert.equal((await tab.probe('x'.repeat(32))).status, 404);
  // The ordinary guest GET has no embed key and keeps minting rh_guest (SHARE-03 unchanged).
  const plain = await jar(f).probe(token, { marker: false });
  assert.deepEqual(plain.body, { guest: { limit: 10, used: 0, remaining: 10 } });
  assert.match(plain.setCookie[0], /^rh_guest=[A-Za-z0-9_-]{32}; Path=\/api\/learn; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal(sent.length, 0);
});

test('a Send without a valid rh_embed is refused before any model call and counts nothing; it never mints a session', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject();
  const tab = jar(f);
  for (const attempt of [{}, { as: 'ben' }, { as: 'ana' }]) {
    const refused = await tab.ask(token, { message: 'hi' }, attempt);
    assert.deepEqual([refused.status, refused.body.code, refused.setCookie], [403, 'embed_session_required', []], JSON.stringify(attempt));
  }
  // An rh_guest trial, even a full one, is not an embed session; a malformed rh_embed is none.
  tab.state.guest = 'g'.repeat(32); tab.state.embed = 'not-a-session';
  assert.equal((await tab.ask(token, { message: 'hi' })).body.code, 'embed_session_required');
  // Refused before the body is read: not even a missing request id changes the answer.
  assert.equal((await jar(f).ask(token, { message: 'hi' }, { key: null })).body.code, 'embed_session_required');
  assert.equal((await jar(f).ask(token, null)).body.code, 'embed_session_required');
  assert.deepEqual([sent.length, rows(f).length, f.sqlite.prepare('SELECT COUNT(*) AS n FROM shared_ask_events').get().n], [0, 0, 0]);
  assert.equal(tab.state.embed, 'not-a-session', 'a Send mints nothing');
});

test('10 messages are accepted, the 11th is refused before any model call; a reload and another tab share the count', async t => {
  const f = setup(t), sent = scriptModel(t);
  const one = (await f.shareProject()).token, two = (await f.shareProject()).token;
  const tab = jar(f);
  await tab.init();
  for (let i = 1; i <= 10; i++) {
    const answer = await tab.ask(i % 2 ? one : two, { message: `question ${i}` });
    assert.equal(answer.status, 200, `message ${i}`);
    assert.deepEqual(doneOf(answer).guest, { limit: 10, used: i, remaining: 10 - i });
  }
  const reload = jar(f); reload.state.embed = tab.state.embed; // the same partition again: a reload or a second tab
  const refused = await reload.ask(two, { message: 'question 11' });
  assert.deepEqual([refused.status, refused.body.code, refused.body.signIn, refused.body.guest], [429, 'guest_limit', true, { limit: 10, used: 10, remaining: 0 }]);
  assert.equal(sent.length, 10, 'no model call for message 11');
  assert.deepEqual((await reload.probe(one)).body, { guest: { limit: 10, used: 10, remaining: 0 }, embed: { session: true } });
  // The embedding site's other embeds share it; another site (another partition, so another cookie) has its own 10.
  const otherSite = jar(f); await otherSite.init();
  assert.notEqual(otherSite.state.embed, tab.state.embed);
  assert.equal((await otherSite.ask(one, { message: 'fresh site' })).status, 200);
});

test('the embed trial and the rh_guest trial on digrabbithole.com are separate, and neither reads the other cookie', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject(), tab = jar(f);
  await tab.init();
  for (let i = 0; i < 10; i++) assert.equal((await tab.ask(token, { message: `embedded ${i}` })).status, 200);
  assert.equal((await tab.ask(token, { message: 'one more' })).status, 429);
  // The same browser on the site itself (no marker): its own rh_guest trial is untouched by the embedded one.
  const home = jar(f, { embed: false }); home.state.embed = tab.state.embed;
  const first = await home.ask(token, { message: 'on the site' });
  assert.equal(first.status, 200);
  assert.equal(doneOf(first).guest.used, 1);
  assert.match(first.setCookie[0], /^rh_guest=/);
  assert.equal(sent.length, 11);
  const prefixes = new Set(rows(f).map(r => r.viewer_email.split(':')[1]));
  assert.equal(prefixes.size, 2, 'two browser keys');
});

test('retry with the same request id counts once and replays are capped; a concurrent burst never admits more than 10', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject(), tab = jar(f);
  await tab.init();
  assert.equal((await tab.ask(token, { message: 'why softmax?' }, { key: 'retry-key-1' })).status, 200);
  for (let i = 0; i < 2; i++) {
    const again = await tab.ask(token, { message: 'why softmax?' }, { key: 'retry-key-1' });
    assert.deepEqual([again.status, doneOf(again).guest.used], [200, 1], `replay ${i + 1}`);
  }
  const third = await tab.ask(token, { message: 'why softmax?' }, { key: 'retry-key-1' });
  assert.deepEqual([third.status, third.body.limited], [429, true]);
  assert.equal((await tab.ask(token, { message: 'no id' }, { key: null })).body.code, 'request_id_required');
  assert.equal(sent.length, 3);
  assert.equal((await tab.probe(token)).body.guest.used, 1);
  const burst = jar(f); await burst.init();
  const results = await Promise.all(Array.from({ length: 16 }, (_, i) => burst.ask(token, { message: `burst ${i}` })));
  assert.equal(results.filter(r => r.status === 200).length, 10);
  assert.equal(results.filter(r => r.status === 429 && r.body.code === 'guest_limit').length, 6);
  assert.equal(rows(f).filter(r => r.viewer_email.startsWith('guest:')).length, 11, '10 + the first test browser message');
});

test('rows keep the link caps, hold only hashes, and never name a person', async t => {
  const f = setup(t, { vars: { SHARED_ASK_SHARE_HOUR: '3' } }), sent = scriptModel(t);
  const { token } = await f.shareProject(), tab = jar(f);
  await tab.init();
  for (let i = 0; i < 3; i++) assert.equal((await tab.ask(token, { message: `q${i}` })).status, 200);
  const other = jar(f); await other.init();
  const capped = await other.ask(token, { message: 'over the link cap' });
  assert.deepEqual([capped.status, capped.body.limited, capped.body.code], [429, true, undefined]);
  assert.equal(sent.length, 3);
  for (const row of rows(f)) {
    assert.match(row.viewer_email, /^guest:[0-9a-f]{64}:[0-9a-f]{64}$/);
    assert.ok(!row.viewer_email.includes(tab.state.embed), 'only a hash of the cookie is stored');
  }
});

test('the owner viewing their own embed is a public guest, for a share link and a publication: no owner powers, counted as a guest', async t => {
  const f = setup(t), sent = scriptModel(t);
  handle(f, 'ana@test', 'ana');
  const { canvas, token } = await f.shareProject();
  const pub = await publish(f, canvas);
  for (const [kind, link] of [['/b', token], ['/e', pub]]) {
    const tab = jar(f);
    const plain = await tab.open(link, { as: 'ana', marker: false });
    assert.equal(plain.body.viewer, 'ana@test', `${kind}: the site knows the owner`);
    const embedded = await tab.open(link, { as: 'ana' });
    assert.equal(embedded.status, 200);
    assert.deepEqual([embedded.body.viewer, embedded.body.member_board_id, embedded.body.access.role], [null, undefined, 'guest'], `${kind}: a public viewer`);
    assert.equal(plain.body.access.role, 'owner', `${kind}: and the site gives the owner owner powers`);
    assert.ok(!embedded.text.includes('ana@test'), 'no email in the page data');
    await tab.init({ as: 'ana' });
    const probe = await tab.probe(link, { as: 'ana' });
    assert.deepEqual(probe.body.embed, { session: true }, 'the trial applies to the signed-in owner too');
    const before = sent.length;
    const answer = await tab.ask(link, { message: 'owner asks' }, { as: 'ana' });
    assert.equal(answer.status, 200);
    assert.equal(doneOf(answer).guest.used, 1, `${kind}: a guest message, not the account's allowance`);
    assert.equal(sent.length, before + 1);
    // No cookie, no Send: being signed in does not stand in for the embed session.
    assert.equal((await jar(f).ask(link, { message: 'x' }, { as: 'ana' })).body.code, 'embed_session_required');
    // Sign-in features stay out of an embed.
    assert.equal((await tab.call('POST', `/api/learn/boards/shared/${link}/next-steps`, { as: 'ana', body: { origin: null } })).status, 401);
    assert.equal((await tab.call('POST', `/api/learn/boards/shared/${link}/rabbit-hole`, { as: 'ana', body: { origin: null } })).status, 401);
  }
  assert.ok(!rows(f).some(r => r.viewer_email.includes('ana')), 'no account in any usage row');
});

test('private, revoked, removed and non-public links answer nothing to an embed: data, probe, Send and assets', async t => {
  const f = setup(t), sent = scriptModel(t);
  handle(f, 'ana@test', 'ana');
  const shared = await f.shareProject(), restricted = await f.shareProject({ publicView: false });
  const pub = await publish(f, shared.canvas);
  const tab = jar(f); await tab.init();
  const reach = async (link, as) => [(await tab.open(link, { as })).status, (await tab.probe(link, { as })).status, (await tab.ask(link, { message: 'hi' }, { as })).status, (await tab.call('GET', `/api/learn/boards/shared/${link}/assets/key`, { as })).status];
  assert.deepEqual(await reach(shared.token), [200, 200, 200, 404], 'a public view link (the asset key is not on this board)');
  assert.deepEqual(await reach(pub), [200, 200, 200, 404], 'a publication');
  // Shared but restricted to signed-in people: an embed is public or nothing, even for its owner with a session.
  for (const as of [undefined, 'ana', 'ben']) {
    assert.deepEqual(await reach(restricted.token, as), [403, 403, 403, 403], `restricted as ${as}`);
    assert.equal((await tab.open(restricted.token, { as })).body.code, 'embed_not_public');
  }
  assert.equal((await tab.open(restricted.token, { as: 'ana', marker: false })).status, 200, 'the ordinary page still opens it for a signed-in owner');
  // Revoked: the share switched off, then on again with a new token; Explore removal.
  await f.call('POST', `/api/learn/boards/${shared.canvas.name}/main/share`, { as: 'ana', body: { shared: false } });
  assert.deepEqual(await reach(shared.token), [404, 404, 404, 404], 'unshared');
  await f.call('POST', `/api/apps/${shared.canvas.name}/unpublish`, { as: 'ana' });
  assert.deepEqual(await reach(pub), [404, 404, 404, 404], 'removed from Explore');
  const askedBefore = sent.length;
  assert.equal(askedBefore, 2, 'only the two admitted messages reached the model');
  await f.call('POST', `/api/apps/${shared.canvas.name}/trash`, { as: 'ana' });
  assert.equal((await tab.open(shared.token)).status, 404);
});

test('through the dev worker an embed Send is platform-paid even with a signed-in account cookie; the same Send without the marker is the account\'s', async t => {
  const worker = (await devWorker()).default;
  const f = setup(t, { vars: { SMALL_ENV: 'dev', USAGE_PLATFORM_DAY_USD: '10', AI_MONTHLY_ALLOWANCE_USD: '50' } }), sent = scriptModel(t, Array.from({ length: 4 }, () => ({ model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'Answer.' }], stop_reason: 'end_turn' })));
  const { token } = await f.shareProject();
  const tab = jar(f); await tab.init();
  const post = (headers, body) => worker.fetch(new Request(`${HOST}/api/learn/boards/shared/${token}/ask`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `small_session=ben; rh_embed=${tab.state.embed}`, 'x-rh-action-key': sendKey(), ...headers }, body: JSON.stringify(body) }), f.env, { waitUntil() {} });
  const embedded = await post({ 'x-rh-embed': '1' }, { message: 'embedded and signed in' });
  assert.equal(embedded.status, 200);
  assert.match(await embedded.text(), /event: done/);
  const actions = () => f.sqlite.prepare('SELECT user_id, payer, payer_reason, feature FROM usage_actions').all().map(a => ({ ...a }));
  assert.deepEqual(actions(), [{ user_id: null, payer: 'platform', payer_reason: 'anonymous_public', feature: 'shared_ask' }]);
  assert.match(embedded.headers.get('content-security-policy'), /frame-ancestors 'self'/, 'the ask is not an embed document');
  const signed = await post({}, { message: 'on the site, signed in' });
  assert.equal(signed.status, 200);
  await signed.text();
  assert.deepEqual(actions().map(a => [a.user_id, a.payer]), [[null, 'platform'], ['u-ben-9a2b', 'user']]);
  assert.equal(sent.length, 2);
});

test('an asset or PDF request marked ?embed=1 is answered as the public\'s too: no account is read, a restricted link is refused even to its owner', async t => {
  const f = setup(t), accounts = [];
  const read = f.env.CONTROL_PLANE.fetch;
  f.env.CONTROL_PLANE.fetch = async request => { accounts.push(new URL(request.url).pathname); return read(request); };
  const pub = await f.shareProject(), restricted = await f.shareProject({ publicView: false }), tab = jar(f);
  accounts.length = 0;
  const asset = (token, as, query = '?embed=1') => tab.call('GET', `/api/learn/boards/shared/${token}/assets/key${query}`, { as, marker: false });
  assert.equal((await asset(pub.token, 'ana')).status, 404, 'a public link: the file is simply not on this board');
  assert.deepEqual(accounts, [], 'no /api/me for an embedded asset');
  for (const as of ['ana', 'ben']) {
    const refused = await asset(restricted.token, as);
    assert.deepEqual([refused.status, refused.body.code], [403, 'embed_not_public'], as);
  }
  assert.equal((await asset(restricted.token, 'ana', '')).status, 404, 'the ordinary page still reads the account: a signed-in owner is in');
  assert.equal((await asset(restricted.token, null, '')).status, 401);
  assert.equal((await tab.call('GET', `/api/learn/boards/shared/${restricted.token}?embed=1`, { as: 'ana', marker: false })).body.code, 'embed_not_public');
});

test('a draft message is never stored: not in any table, only the usage row\'s hashes', async t => {
  const f = setup(t); scriptModel(t);
  const { token } = await f.shareProject(), tab = jar(f);
  await tab.init();
  const draft = 'DRAFT-7f3a-never-store-this';
  assert.equal((await tab.ask(token, { message: draft, history: [{ role: 'user', content: 'DRAFT-HISTORY-9c1e' }, { role: 'assistant', content: 'earlier answer' }] })).status, 200);
  const tables = f.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  const dump = JSON.stringify(tables.map(name => f.sqlite.prepare(`SELECT * FROM "${name}"`).all()));
  assert.ok(!dump.includes('DRAFT-7f3a') && !dump.includes('DRAFT-HISTORY'), 'no table holds the message or the history');
  assert.ok(!f.statements.some(sql => sql.includes('DRAFT')), 'and none was ever in a statement text');
});
