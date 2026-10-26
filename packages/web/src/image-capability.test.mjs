// IMG-01: the web build holds no image switch; the SERVER's answer for this person turns /generate-image on (image-capability.js).
// Nothing is paid and no server is reached: a fake fetch stands in for GET /api/learn/image-jobs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_GENERATION, commandsFor, imageGenerationLive, resolveCommand, unavailableCommand } from './agent/slash.js';
import { IMAGE_DEFAULTS, imageGenerationOn, imagePromptOf, requestImagePlan } from './generate-image.js';
import { loadImageCapability, resetImageCapability } from './image-capability.js';
import { runLearnCommand } from './learn-slash.js';
import { startAdapter } from './generation-proposal-chat.js';

const names = list => list.map(c => c.name);
const answer = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('the committed build constant stays off; nothing is listed or accepted until the server says available for this person', async () => {
  resetImageCapability();
  assert.equal(IMAGE_GENERATION, false);
  assert.equal(imageGenerationLive(), false);
  assert.ok(!names(commandsFor('learn')).includes('generate-image'));
  assert.deepEqual(resolveCommand('/generate-image a fox', 'learn'), { unsupported: 'generate-image' });
  assert.match(unavailableCommand('generate-image'), /not available here/);
  assert.equal(startAdapter({ command: 'generate-image' }, { insertCard() {} }), null);
});

test('available: true switches the command on everywhere the registry is read, and nothing else', async () => {
  resetImageCapability();
  assert.equal(await loadImageCapability(answer(200, { available: true, operatorOnly: true, models: [] })), true);
  assert.equal(imageGenerationLive(), true);
  assert.ok(names(commandsFor('learn')).includes('generate-image'));
  assert.equal(resolveCommand('/generate-image a fox', 'learn').command.name, 'generate-image');
  assert.equal(unavailableCommand('generate-image'), null);
  assert.equal(imageGenerationOn({}), true);
  assert.equal(startAdapter({ command: 'generate-image' }, { insertCard() {} }), 'image');
  assert.equal(startAdapter({ command: 'generate-image' }, {}), null, 'a card with no canvas cannot Generate');
  resetImageCapability();
  assert.equal(imageGenerationLive(), false);
});

test('anything but an explicit available: true leaves it off: unlisted person, no session, an error, a malformed answer, a failed read', async () => {
  for (const reply of [answer(200, { available: false, models: [] }), answer(200, { available: 'true' }), answer(200, {}), answer(401, { error: 'Sign in' }), answer(503, { code: 'not_configured' }),
    async () => new Response('not json', { status: 200 }), async () => { throw new Error('offline'); }]) {
    resetImageCapability();
    assert.equal(await loadImageCapability(reply), false);
    assert.equal(imageGenerationLive(), false);
    assert.ok(!names(commandsFor('learn')).includes('generate-image'));
  }
});

test('asked once per page load: a second call reuses the answer; a failed read is asked again', async () => {
  resetImageCapability();
  let reads = 0;
  const counted = async () => { reads++; return new Response(JSON.stringify({ available: true }), { status: 200 }); };
  await loadImageCapability(counted); await loadImageCapability(counted);
  assert.equal(reads, 1);
  resetImageCapability(); reads = 0;
  const failing = async () => { reads++; throw new Error('offline'); };
  await loadImageCapability(failing); await loadImageCapability(failing);
  assert.equal(reads, 2);
  resetImageCapability();
});

test('the build flag for a review build grants nothing the server refuses: the command is still unlisted', () => {
  resetImageCapability();
  assert.equal(imageGenerationOn({ VITE_IMAGE_GENERATION: 'true' }), true);
  assert.ok(!names(commandsFor('learn')).includes('generate-image'));
});

test('a typed /generate-image becomes a chat turn when offered; with no words it asks; when not offered it is not a command', async () => {
  resetImageCapability();
  const canvas = {}, post = async () => { throw new Error('the legacy generator must not be called'); };
  const off = await runLearnCommand('/generate-image a fox', { app: 'demo', canvas, post });
  assert.equal(off.notice.tone, 'error');
  await loadImageCapability(answer(200, { available: true }));
  assert.deepEqual(await runLearnCommand('/generate-image a fox in snow', { app: 'demo', canvas, post }), { prompt: 'a fox in snow' });
  const ask = await runLearnCommand('/generate-image', { app: 'demo', canvas, post });
  assert.equal(ask.notice.tone, 'question'); assert.equal(ask.keep, '/generate-image ');
  resetImageCapability();
});

test('the plan request: the words without the command, the opening settings are a validated combination, an empty prompt is refused before any call', async () => {
  assert.equal(imagePromptOf('/generate-image   a fox'), 'a fox'); assert.equal(imagePromptOf('/generate-imagex y'), '/generate-imagex y'); assert.equal(imagePromptOf('a fox'), 'a fox');
  assert.deepEqual(IMAGE_DEFAULTS, { model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '1K' });
  const sent = [];
  const api = async (path, options) => { sent.push({ path, options, body: JSON.parse(options.body) }); return { thread_id: 'canvaschat-x', message_id: '7', proposal: { proposal_id: 'p' } }; };
  const out = await requestImagePlan(api, { app: 'canvas-abcdef12', threadId: 'canvaschat-11111111-2222-3333-4444-555555555555', text: '/generate-image a fox' });
  assert.equal(out.message_id, '7');
  assert.equal(sent.length, 1); assert.equal(sent[0].path, '/api/learn/chat/image-proposals'); assert.equal(sent[0].options.method, 'POST');
  assert.deepEqual(sent[0].body, { app: 'canvas-abcdef12', thread_id: 'canvaschat-11111111-2222-3333-4444-555555555555', prompt: 'a fox', settings: IMAGE_DEFAULTS });
  assert.throws(() => requestImagePlan(api, { app: 'a', threadId: 't', text: '/generate-image  ' }), /Describe the image/);
  assert.equal(sent.length, 1);
});

test('acceptance fault: sent with the job only when the owner set it; absent by default', async () => {
  const { runImageJob, injectedFault } = await import('./generate-image.js');
  const sent = [];
  const api = async (path, options = {}) => { if (options.method === 'POST') sent.push(JSON.parse(options.body)); return { job: { id: 'img-p', stage: 'failed', reason: 'provider_rejected' } }; };
  const proposal = { proposal_id: 'p-0123456789abcdef', input: { app: 'canvas-abcdef12' } };
  assert.equal(injectedFault(), null);
  await runImageJob({ api, proposal, app: 'canvas-abcdef12', ops: {} });
  assert.equal('fault' in sent[0], false);
  globalThis.localStorage = { getItem: key => (key === 'rh-image-fault' ? 'provider_400' : null) };
  try { await runImageJob({ api, proposal, app: 'canvas-abcdef12', ops: {} }); } finally { delete globalThis.localStorage; }
  assert.equal(sent[1].fault, 'provider_400');
});
