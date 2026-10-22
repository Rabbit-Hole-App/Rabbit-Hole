// Guest Chat on shared canvases (SHARE-03; C:/s/spec/share/contract-guest-chat.md): a signed-out visitor's one 10-message
// trial, through the real routes and LEARN_DB (shared-canvas-fixture.js) with the model faked at fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, scriptModel, events, lastUserText } from './shared-canvas-fixture.js';
import { GUEST_MESSAGES } from '../src/learn-shared-ask.js';
import { REPOSITORY_TOOLS } from '../src/repository-context.js';

let keys = 0;
const sendKey = () => `send-${String(++keys).padStart(6, '0')}`;
// A browser: its trial cookie once the server set it, and optionally a signed-in session beside it.
function browser(f) {
  const jar = { guest: null };
  const cookie = as => [as && `small_session=${as}`, jar.guest && `rh_guest=${jar.guest}`].filter(Boolean).join('; ');
  const remember = headers => { const set = headers.get('set-cookie'); if (set) jar.guest = set.match(/rh_guest=([^;]+)/)[1]; };
  const request = async (method, token, { as = null, body, key = sendKey() } = {}) => {
    const { learnBoardsRoute } = await import('../src/learn-boards.js');
    const req = new Request(`https://app.test/api/learn/boards/shared/${token}/ask`, { method, headers: { 'Content-Type': 'application/json', cookie: cookie(as), ...(key ? { 'x-rh-action-key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = await learnBoardsRoute(new URL(req.url).pathname, req, f.env);
    remember(response.headers);
    const type = response.headers.get('content-type') || '', text = await response.text();
    return { status: response.status, type, text, body: type.includes('json') ? JSON.parse(text) : null, setCookie: response.headers.get('set-cookie') };
  };
  return { jar, ask: (token, body, options = {}) => request('POST', token, { ...options, body }), allowance: (token, options = {}) => request('GET', token, { ...options, key: null }) };
}
const doneOf = response => events(response.text).find(event => event.type === 'done')?.data;

test('a guest gets 10 messages across canvases and tabs; message 11 is refused before any model call, with the draft-keeping refusal', async t => {
  const f = setup(t), sent = scriptModel(t);
  const one = (await f.shareProject()).token, two = (await f.shareProject()).token;
  const tab = browser(f);
  const first = await tab.allowance(one);
  assert.deepEqual(first.body, { guest: { limit: 10, used: 0, remaining: 10 } });
  assert.match(first.setCookie, /^rh_guest=[A-Za-z0-9_-]{32}; Path=\/api\/learn; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);
  for (let i = 1; i <= GUEST_MESSAGES; i++) {
    const answer = await tab.ask(i % 2 ? one : two, { message: `question ${i}` });
    assert.equal(answer.status, 200, `message ${i}`);
    assert.deepEqual(doneOf(answer).guest, { limit: 10, used: i, remaining: 10 - i });
  }
  assert.equal(sent.length, 10);
  // Another tab of the same browser (the same cookie) and a reload share the trial; nothing resets it.
  const other = browser(f); other.jar.guest = tab.jar.guest;
  const refused = await other.ask(two, { message: 'question 11' });
  assert.equal(refused.status, 429);
  assert.deepEqual(refused.body, { error: 'You have used your 10 free messages. Sign in to continue.', code: 'guest_limit', signIn: true, guest: { limit: 10, used: 10, remaining: 0 } });
  assert.equal(sent.length, 10, 'no model call for message 11');
  assert.deepEqual((await other.allowance(one)).body.guest, { limit: 10, used: 10, remaining: 0 });
  // A new browser (no cookie) is a new trial; the cookie marks a browser, not a person.
  assert.equal((await browser(f).ask(one, { message: 'fresh browser' })).status, 200);
});

test('a duplicate transport retry reuses its request id: answered again, never counted, and replays are capped', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject();
  const tab = browser(f);
  assert.equal((await tab.ask(token, { message: 'why softmax?' }, { key: 'retry-key-1' })).status, 200);
  for (let i = 0; i < 2; i++) {
    const again = await tab.ask(token, { message: 'why softmax?' }, { key: 'retry-key-1' });
    assert.equal(again.status, 200, `replay ${i + 1}`);
    assert.equal(doneOf(again).guest.used, 1, 'a replay costs no message');
  }
  const third = await tab.ask(token, { message: 'why softmax?' }, { key: 'retry-key-1' });
  assert.equal(third.status, 429);
  assert.equal(third.body.limited, true);
  // The same id with a different message is a new message, and a Send without an id is refused before anything.
  assert.equal(doneOf(await tab.ask(token, { message: 'and the max trick?' }, { key: 'retry-key-1' })).guest.used, 2);
  const missing = await tab.ask(token, { message: 'no id' }, { key: null });
  assert.deepEqual([missing.status, missing.body.code], [400, 'request_id_required']);
  assert.equal(sent.length, 4);
  assert.deepEqual((await tab.allowance(token)).body.guest, { limit: 10, used: 2, remaining: 8 });
});

test('concurrent sends from many tabs never admit more than 10', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject();
  const tab = browser(f);
  await tab.allowance(token); // the cookie, as the page reads it on open
  const results = await Promise.all(Array.from({ length: 16 }, (_, i) => tab.ask(token, { message: `burst ${i}` })));
  assert.equal(results.filter(r => r.status === 200).length, 10);
  assert.equal(results.filter(r => r.status === 429 && r.body.code === 'guest_limit').length, 6);
  assert.equal(sent.length, 10);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM shared_ask_events WHERE viewer_email LIKE 'guest:%'").get().n, 10);
});

test('guest rows keep the link caps, store only hashes, and never name a person or charge the owner', async t => {
  const f = setup(t, { vars: { SHARED_ASK_SHARE_HOUR: '3' } }), sent = scriptModel(t);
  const { token } = await f.shareProject();
  const tab = browser(f);
  for (let i = 0; i < 3; i++) assert.equal((await tab.ask(token, { message: `q${i}` })).status, 200);
  const capped = await browser(f).ask(token, { message: 'over the link cap' });
  assert.deepEqual([capped.status, capped.body.limited, capped.body.code], [429, true, undefined]);
  // A signed-in viewer counts against the same link cap.
  assert.equal((await f.ask(token, 'ben', { message: 'me too' })).status, 429);
  assert.equal(sent.length, 3);
  const rows = f.sqlite.prepare("SELECT viewer_email, owner_email FROM shared_ask_events WHERE viewer_email LIKE 'guest:%'").all();
  for (const row of rows) {
    assert.match(row.viewer_email, /^guest:[0-9a-f]{64}:[0-9a-f]{64}$/);
    assert.ok(!row.viewer_email.includes(tab.jar.guest), 'only the hash of the cookie is stored');
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM usage_actions').get().n, 0, 'no usage action charged to anyone in this test env');
});

test('signed in, the guest trial does not apply: the viewer\'s own caps and allowance do, even from a browser whose trial is spent', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject();
  const tab = browser(f);
  for (let i = 0; i < GUEST_MESSAGES; i++) await tab.ask(token, { message: `g${i}` });
  assert.equal((await tab.ask(token, { message: 'one more' })).status, 429);
  const signedIn = await tab.ask(token, { message: 'now signed in' }, { as: 'ben' });
  assert.equal(signedIn.status, 200);
  assert.equal(doneOf(signedIn).guest, undefined);
  assert.deepEqual((await tab.allowance(token, { as: 'ben' })).body, { guest: null });
  assert.equal(sent.length, 11);
  // A restricted (not public) link still needs sign-in to ask at all.
  const restricted = (await f.shareProject({ publicView: false })).token;
  const refused = await browser(f).ask(restricted, { message: 'hi' });
  assert.deepEqual([refused.status, refused.body.signIn], [401, true]);
  assert.equal(sent.length, 11);
});

test('a guest\'s model context holds only the shared canvas: never the creator\'s chats, goals, notes, highlights or other canvases', async t => {
  const f = setup(t), sent = scriptModel(t);
  const secret = await f.privateCanvas();
  const { canvas, token } = await f.shareProject({ state: { blocks: [{ id: 'b1', type: 'explanation', title: 'Attention', body: 'PUBLIC-BODY' }],
    goals: ['PRIVATE-GOAL'], notes: 'PRIVATE-NOTE', tutor: { memory: 'PRIVATE-TUTOR' }, progress: { mastered: 'PRIVATE-PROGRESS' } } });
  f.sqlite.exec(`INSERT INTO threads (id, org, user, scope_ref, commit_sha, title) VALUES ('t1', 'ana-ws', 'ana@test', '${canvas.name}', '', 'PRIVATE-THREAD');
    INSERT INTO messages (thread_id, role, content) VALUES ('t1', 'user', 'PRIVATE-CHAT');
    INSERT INTO learn_goals (id, org, owner_user_id, app, board, label, origin, created_at, updated_at) VALUES ('g1', 'ana-ws', 'u-ana-5d1e', '${canvas.name}', 'main', 'PRIVATE-GOAL-ROW', 'coaching', 'now', 'now');
    INSERT INTO pdf_highlights (id, org, owner_email, source_key, source_sha256, kind, page_index, anchor_json, created_at, updated_at) VALUES ('h1', 'ana-ws', 'ana@test', 'k', 's', 'text', 0, '{"text":"PRIVATE-HIGHLIGHT"}', 1, 1);`);
  const answer = await browser(f).ask(token, { message: 'Summarise', selected: 'b1', state: { blocks: [{ title: 'INJECTED' }] }, scope: { app: secret.name } });
  assert.equal(answer.status, 200);
  const request = JSON.stringify(sent[0]);
  assert.ok(request.includes('PUBLIC-BODY'), 'the shared content is the context');
  for (const leak of ['PRIVATE-GOAL', 'PRIVATE-NOTE', 'PRIVATE-TUTOR', 'PRIVATE-PROGRESS', 'PRIVATE-THREAD', 'PRIVATE-CHAT', 'PRIVATE-GOAL-ROW', 'PRIVATE-HIGHLIGHT', 'INJECTED', 'SECRET', secret.name, 'ana@test']) {
    assert.ok(!request.includes(leak), `model request carries ${leak}`);
    assert.ok(!answer.text.includes(leak), `answer stream carries ${leak}`);
  }
});

test('Explain in Chat is a chat answer: /explain and asking for a card in words never start generation or a paid job', async t => {
  const f = setup(t), sent = scriptModel(t);
  const { token } = await f.shareProject({ state: { blocks: [{ id: 'b1', type: 'explanation', title: 'Softmax', body: 'exp then normalise' }] } });
  const tab = browser(f);
  f.statements.length = 0;
  for (const message of ['/explain softmax', 'Make me an explanation card about softmax and put it on the canvas', '/motion animate attention']) {
    const answer = await tab.ask(token, { message, selected: 'b1' });
    assert.equal(answer.status, 200, message);
    assert.ok(lastUserText(sent.at(-1)).endsWith(message), 'the command is the question text, not a dispatch');
    assert.deepEqual(events(answer.text).map(e => e.type).filter(type => !['chunk', 'progress', 'done'].includes(type)), [], 'no card, outline, proposal or job event');
  }
  // Only read-only answer tools (the link's public repository, arXiv): no generation, card, job or write tool is ever offered.
  const readOnly = new Set([...REPOSITORY_TOOLS.map(tool => tool.name), 'search_arxiv', 'read_arxiv_paper']);
  for (const request of sent) assert.deepEqual((request.tools || []).map(tool => tool.name).filter(name => !readOnly.has(name)), []);
  for (const sql of f.statements) assert.match(sql, /^(SELECT\b|INSERT INTO shared_ask_events\b)/i, sql);
});
