// The dev stub email transport (src/dev-outbox.js): on the dev control plane only, never Resend, and its messages
// (invitation links, codes) are readable only with the dev test secret, never by whoever sent them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stubTransport, stubSend, outboxRoute } from '../src/dev-outbox.js';

const bucket = () => {
  const store = new Map();
  return { store, put: async (k, v) => { store.set(k, v); }, get: async k => store.has(k) ? { text: async () => store.get(k) } : null, list: async ({ prefix }) => ({ objects: [...store.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }) };
};
const devEnv = (over = {}) => ({ SMALL_ENV: 'dev', EMAIL_TRANSPORT: 'stub', TEST_BYPASS_SECRET: 'dev-secret', LEARN_MEDIA: bucket(), ...over });
const ask = (env, body) => outboxRoute(new Request('https://cp-dev.test/test/outbox', { method: 'POST', body: JSON.stringify(body) }), env);

test('the stub is on only for SMALL_ENV=dev with EMAIL_TRANSPORT=stub and a bucket; production configs set neither', () => {
  assert.equal(stubTransport(devEnv()), true);
  for (const over of [{ SMALL_ENV: 'production' }, { SMALL_ENV: undefined }, { SMALL_ENV: 'test' }, { EMAIL_TRANSPORT: undefined }, { EMAIL_TRANSPORT: 'resend' }, { LEARN_MEDIA: undefined }])
    assert.equal(stubTransport(devEnv(over)), false, JSON.stringify(over));
  for (const f of ['../wrangler.rabbit-hole-prod.jsonc', '../../web/wrangler.rabbit-hole-prod.jsonc'])
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /EMAIL_TRANSPORT/, `${f} never selects the stub`);
});

test('a stubbed message is stored for its recipient and read back only with the dev test secret', async () => {
  const env = devEnv();
  assert.equal(await stubSend(env, 'Dev-Other@Example.test', 'You are invited', 'Open https://preview.digrabbithole.com/i#tok'), true);
  await stubSend(env, 'someone@example.test', 'Code', '123456');
  const ok = await ask(env, { secret: 'dev-secret', to: 'dev-other@example.test' });
  assert.equal(ok.status, 200);
  const { messages } = await ok.json();
  assert.deepEqual(messages.map(m => [m.to, m.subject]), [['dev-other@example.test', 'You are invited']], 'only that recipient\'s mail');
  assert.match(messages[0].text, /\/i#tok/);
  assert.equal((await ask(env, { secret: 'wrong', to: 'dev-other@example.test' })).status, 401);
  assert.equal((await ask(env, { to: 'dev-other@example.test' })).status, 401);
  assert.equal((await ask(env, { secret: 'dev-secret', to: 'nobody' })).status, 400);
});

test('the outbox route does not exist outside a stubbed dev control plane', async () => {
  for (const over of [{ EMAIL_TRANSPORT: undefined }, { SMALL_ENV: 'production' }, { TEST_BYPASS_SECRET: undefined }])
    assert.equal((await ask(devEnv(over), { secret: 'dev-secret', to: 'a@b.test' })).status, 404, JSON.stringify(over));
});

test('sendEmail tries the stub first, so a stubbed dev control plane never calls Resend', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('async function sendEmail'), src.indexOf('async function cliAuth'));
  assert.ok(body.indexOf('stubTransport(env)') > 0 && body.indexOf('stubTransport(env)') < body.indexOf('api.resend.com'));
  assert.match(src, /if \(path === '\/test\/outbox'\) return await outboxRoute\(req, env\);/);
});
