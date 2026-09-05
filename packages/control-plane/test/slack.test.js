import assert from 'node:assert';
import { test } from 'node:test';
import { chooseBlocks, handleSlackEvent, handleSlackInteract, proposalBlocks, SIGN_IN_REPLY, verifySlackSignature } from '../src/slack.js';

const install = { org: 'gmail-com', team_id: 'T1', bot_token: 'xoxb-test', signing_secret: 's3cr3t' };

// fake Slack Web API: records every call, answers users.info from a directory
function fakeSlack(directory) {
  const calls = [];
  const api = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'users.info') {
      const email = directory[payload.user];
      return { ok: true, user: email ? { profile: { email } } : { profile: {} } };
    }
    return { ok: true };
  };
  return { api, calls };
}

const db = { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) }) }) };
const env = { DB: db };
const ctx = { waitUntil: () => {} };

test('signature verification accepts a good HMAC and rejects a bad one', async () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = 'payload=%7B%7D';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('s3cr3t'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`v0:${ts}:${body}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await verifySlackSignature('s3cr3t', ts, body, `v0=${mac}`), true);
  assert.equal(await verifySlackSignature('s3cr3t', ts, body, 'v0=deadbeef'), false);
  assert.equal(await verifySlackSignature('s3cr3t', '1000', body, `v0=${mac}`), false); // stale timestamp
});

test('app_mention from a known member: org-scope ambiguity renders a choose select', async () => {
  const { api, calls } = fakeSlack({ U1: 'yudhisteer.chin@gmail.com' });
  let asked = null;
  const askHandler = async (req) => {
    asked = await req.json();
    return new Response(JSON.stringify({ choose: [{ app: 'yolo-job', hint: 'a' }, { app: 'yolo-s3-job', hint: 'b' }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await handleSlackEvent(env, ctx, install, {
    event: { type: 'app_mention', user: 'U1', channel: 'C1', ts: '111.222', text: '<@BOT> why did yolo fail' },
  }, { api, askHandler });
  assert.deepEqual(asked.scope, {});
  assert.equal(asked.message, 'why did yolo fail');
  const post = calls.find((c) => c.method === 'chat.postMessage');
  const select = post.payload.blocks.find((b) => b.type === 'actions').elements[0];
  assert.equal(select.type, 'static_select');
  assert.equal(select.options.length, 2);
  assert.match(select.options[0].text.text, /yolo-job/);
});

test('DM from an unknown email: sign-in reply, no Ask call', async () => {
  const { api, calls } = fakeSlack({ U9: 'stranger@elsewhere.com' });
  let askCalled = false;
  await handleSlackEvent(env, ctx, install, {
    event: { type: 'message', channel_type: 'im', user: 'U9', channel: 'D1', ts: '1.2', text: 'run it' },
  }, { api, askHandler: async () => { askCalled = true; } });
  assert.equal(askCalled, false);
  const post = calls.find((c) => c.method === 'chat.postMessage');
  assert.equal(post.payload.text, SIGN_IN_REPLY);
});

test('proposal buttons: editor approve updates in place, viewer gets the ephemeral no', async () => {
  const { api } = fakeSlack({ UE: 'yudhisteer.chin@gmail.com', UV: 'viewer@gmail.com' });
  const responded = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://respond.example') { responded.push(JSON.parse(init.body)); return new Response('ok'); }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const approveHandler = async (req, _env, _ctx, user) => {
      if (user.email === 'viewer@gmail.com') return new Response(JSON.stringify({ error: 'no edit access' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true, runId: 'r-slack1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const base = (uid) => ({
      user: { id: uid },
      channel: { id: 'C1' },
      response_url: 'https://respond.example',
      message: { ts: '9.9', blocks: [] },
      actions: [{ action_id: 'ask_approve', value: 'p-1' }],
    });
    await handleSlackInteract(env, ctx, install, base('UE'), { api, approveHandler }, 'https://small.example');
    assert.equal(responded[0].replace_original, true);
    assert.match(responded[0].text, /approved by yudhisteer/);
    assert.match(responded[0].text, /r-slack1/);

    await handleSlackInteract(env, ctx, install, base('UV'), { api, approveHandler }, 'https://small.example');
    assert.equal(responded[1].response_type, 'ephemeral');
    assert.equal(responded[1].replace_original, false);
    assert.match(responded[1].text, /only editors/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('block builders stay within Slack limits', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ app: `app-${i}`, hint: 'x' }));
  assert.equal(chooseBlocks('q', many)[1].elements[0].options.length, 25);
  const blocks = proposalBlocks({ id: 'p-1', tool: 'run', args: { app: 'a', inputs: { t: 1 } } });
  assert.equal(blocks[1].elements[0].text.text, 'Run');
});
