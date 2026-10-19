import test from 'node:test';
import assert from 'node:assert/strict';
import { freezeInlineTools } from '../../web/src/inline-tool-plan.js';
import { derivativeAvailable, checkCompute } from '../src/inline-compute.js';
import { inlineDecideFetch, inlineGenerateFetch } from '../src/learn-inline.js';
import { KEY_ENV, jevSays } from './learn-inline-fixture.js';
const make = () => ({ kind: 'selection', mode: 'explain', targetIds: ['original', 'claim'], prompt: 'Check whether claim is the derivative of original with respect to x', context: {
  target: { ids: ['original', 'claim'] }, toolSnapshot: freezeInlineTools({ items: [{ id: 'original', kind: 'equation', latex: 'x^{3} - 2x' }, { id: 'claim', kind: 'equation', latex: '3x^{2} - 2' }] }, ['original', 'claim'], {}, { mode: 'explain' }),
} });
const input = { summary: 'Check the polynomial derivative', compute: { type: 'polynomial_derivative', sourceId: 'original', claimId: 'claim', variable: 'x' } };
test('derivative reads exact frozen LaTeX and returns no model-provided formula or answer', () => {
  const request = make(); assert.equal(derivativeAvailable(request), true);
  assert.deepEqual(checkCompute(input, request, 'request-123').result, { kind: 'compute', requestId: 'request-123', targetIds: ['original', 'claim'], summary: input.summary, operation: input.compute });
  request.context.toolSnapshot.objects.claim.latex = '7';
  assert.equal(checkCompute(input, request, 'request-123').result.kind, 'compute'); // A valid negative result is useful too.
  request.context.toolSnapshot.objects.original.latex = '\\sin(x)';
  assert.ok(checkCompute(input, request, 'request-123').error);
});
test('refuse fabricated math, roles outside selection, mixed answers, ranges and Edit', () => {
  for (const compute of [{ ...input.compute, source: 'x' }, { ...input.compute, answer: true }, { ...input.compute, claimId: 'other' }, { ...input.compute, sourceId: 'claim' }, { ...input.compute, variable: 'xx' }]) assert.ok(checkCompute({ ...input, compute }, make(), 'request-123').error);
  assert.ok(checkCompute({ ...input, text: 'verified' }, make(), 'request-123').error);
  for (const mutate of [r => { r.mode = 'edit'; }, r => { r.targetIds.reverse(); }, r => { r.textRange = { id: 'original', from: 0, to: 1 }; }, r => { r.context.toolSnapshot.objects.claim.locked = true; }]) {
    const request = make(); mutate(request); assert.equal(derivativeAvailable(request), false);
  }
  assert.equal(freezeInlineTools({ items: [{ id: 'original', kind: 'equation', latex: 'x' }] }, ['original']), null);
});
test('signed generation pins both equation sources and advertises bounded exact computation', async () => {
  const post = body => new Request('https://test/api/learn/inline/generate', { method: 'POST', body: JSON.stringify(body) });
  const body = { app: 'canvas-demo', request_id: 'request-123', request: make(), enabled: ['note'] };
  const authorize = async () => ({ name: 'canvas-demo', email: 'owner@test' });
  const verdict = await (await inlineDecideFetch(post(body), KEY_ENV, { authorize, ask: jevSays('proceed') })).json();
  assert.ok(verdict.token);
  let calls = 0;
  const deps = { authorize, callModel: async (_env, prompt) => {
    calls++; assert.match(prompt.system, /exact rational arithmetic/);
    assert.deepEqual(prompt.tools[0].input_schema.properties.compute.properties.type.enum, ['polynomial_derivative']);
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: prompt.tools[0].name, input }] });
  } };
  const output = await (await inlineGenerateFetch(post({ ...body, token: verdict.token }), KEY_ENV, deps)).text();
  assert.match(output, /"type":"polynomial_derivative"/);
  assert.doesNotMatch(output, /"derivativeLatex"|"equivalent"/);
  const changed = structuredClone(body); changed.request.context.toolSnapshot.objects.claim.latex = '99';
  assert.equal((await inlineGenerateFetch(post({ ...changed, token: verdict.token }), KEY_ENV, deps)).status, 403);
  assert.equal(calls, 1);
});
