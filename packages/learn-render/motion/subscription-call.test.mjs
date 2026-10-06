// Motion over the owner's Claude subscription: the bridge's outcomes map onto the end kinds the
// stages already handle, and a subscription answer never counts against the API budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { responseCost } from './orchestrator.mjs';
import { classifyEnd, readMessage } from './stream-message.js';
import { subscriptionCall } from './subscription-call.mjs';

const body = { max_tokens: 64000, stream: true, messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'motion_composition' }] };
const ended = async response => {
  if (!response.ok) return classifyEnd({ response }).kind;
  return classifyEnd({ message: await readMessage(response), tool: 'motion_composition' }).kind;
};

test('subscription outcomes: answer, deadline, off-contract answer, anything else', async () => {
  const sent = [];
  const answer = subscriptionCall({ generate: async (b, o) => { sent.push([b, o]); return { content: [{ type: 'tool_use', id: 'sub-1', name: 'motion_composition', input: { status: 'composition' } }], stop_reason: 'tool_use', model: 'opus', billing: 'claude-subscription' }; } });
  const r = await answer({}, body, 'claude-opus-5-5');
  assert.equal(await ended(r.clone()), 'complete');
  assert.equal((await r.json()).model, 'subscription/opus');
  assert.equal(sent[0][0].stream, undefined, 'the CLI answers whole; stream is dropped');
  assert.equal(sent[0][0].model, 'claude-opus-5-5');
  assert.deepEqual(sent[0][1], { timeout: 900000, maxOutputTokens: 64000 });
  const fail = error => subscriptionCall({ generate: async () => { throw error; } })({}, body, 'claude-opus-5-5');
  const deadline = await fail(Object.assign(new Error('Claude Code timed out: deadline 900000 ms, process tree terminated after 900004 ms'), { code: 'ETIMEDOUT', deadline_ms: 900000, elapsed_ms: 900004, reason: 'deadline: process tree killed' }));
  assert.deepEqual(classifyEnd({ response: deadline }), { kind: 'gateway_timeout', detail: 'HTTP 504: deadline 900000 ms, terminated after 900004 ms, deadline: process tree killed' });
  assert.equal(await ended(await fail(new Error('Invalid subscription model response'))), 'malformed_tool_arguments');
  assert.equal(await ended(await fail(new Error('Invalid subscription tool choice'))), 'malformed_tool_arguments');
  assert.equal(await ended(await fail(new Error('Sign in to a Claude Pro/Max subscription. API credentials are not accepted.'))), 'provider_error');
  assert.equal(await ended(await fail(new Error("You've hit your limit"))), 'provider_error');
});

test('a subscription answer costs no API budget; an API answer still does', async () => {
  assert.equal(await responseCost(Response.json({ content: [], billing: 'claude-subscription' }), 'claude-opus-5-5'), 0);
  assert.ok(await responseCost(Response.json({ content: [], usage: { input_tokens: 1000, output_tokens: 1000 } }), 'claude-opus-5-5') > 0);
});
