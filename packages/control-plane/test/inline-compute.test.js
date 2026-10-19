import test from 'node:test';
import assert from 'node:assert/strict';
import { freezeInlineTools } from '../../web/src/inline-tool-plan.js';
import { computeAvailable, checkCompute } from '../src/inline-compute.js';
import { inlineDecideFetch, inlineGenerateFetch } from '../src/learn-inline.js';
import { jevDecideRequest } from '../src/learn-inline-route.js';
import { KEY_ENV, jevSays } from './learn-inline-fixture.js';

const make = (mode = 'explain') => ({ kind: 'selection', mode, targetIds: ['table'], context: { toolSnapshot: freezeInlineTools({ blocks: [{ id: 'table', type: 'table', columns: ['time', 'length'], rows: [['1', '2'], ['2', '4']] }] }, ['table'], {}, { mode }) } });
const operation = { type: 'table_summary', targetId: 'table', columns: [1], units: ['mm'] };
const input = { summary: 'Summarize length', compute: operation };
test('compute validates exact frozen table in Explain mode and returns only bound operation', () => {
  for (const mode of ['explain']) {
    const request = make(mode), before = JSON.stringify(request);
    assert.equal(computeAvailable(request), true);
    assert.deepEqual(checkCompute(input, request, 'request-123').result, { kind: 'compute', requestId: 'request-123', targetIds: ['table'], summary: input.summary, operation });
    assert.equal(JSON.stringify(request), before);
  }
});
test('no compute on missing, incomplete, sourced, locked, mismatched or ranged table', () => {
  for (const mutate of [r => { r.mode = 'edit'; r.context.toolSnapshot.intent = 'edit'; }, r => { delete r.context.toolSnapshot; }, r => { delete r.context.toolSnapshot.objects.table.rows; }, r => { r.context.toolSnapshot.objects.table.rows = []; }, r => { r.context.toolSnapshot.objects.table.rows[0] = ['1']; }, r => { r.context.toolSnapshot.objects.table.fileRef = {}; }, r => { r.context.toolSnapshot.objects.table.citations = ['source']; }, r => { r.context.toolSnapshot.objects.table.locked = true; }, r => { r.targetIds = ['other']; }, r => { r.textRange = { id: 'table', from: 0, to: 2 }; }, r => { r.context.toolSnapshot.intent = 'edit'; }]) {
    const request = make(); mutate(request);
    assert.equal(computeAvailable(request), false);
    assert.ok(checkCompute(input, request, 'request-123').error);
  }
});
test('reject model answers, mixed actions, arbitrary operations, missing units and invalid cells', () => {
  for (const value of [{ ...input, content: {} }, { ...input, action: {} }, { ...input, ops: [] }, { ...input, text: '12' }, { ...input, compute: { ...operation, answer: 6 } }, { ...input, compute: { ...operation, targetId: 'other' } }, { ...input, compute: { ...operation, units: [] } }, { ...input, compute: { ...operation, type: 'symbolic' } }]) assert.ok(checkCompute(value, make(), 'request-123').error);
  const request = make(); request.context.toolSnapshot.objects.table.rows[0][1] = '=run()';
  assert.ok(checkCompute(input, request, 'request-123').error);
});
test('plot checks actual frozen X and Y cells and shared-unit constraints', () => {
  const value = { summary: 'Plot length by time', compute: { ...operation, type: 'table_plot', xColumn: 0, xUnit: 's' } };
  assert.equal(checkCompute(value, make(), 'request-123').result.operation.type, 'table_plot');
  assert.ok(checkCompute({ ...value, compute: { ...value.compute, xColumn: 1 } }, make(), 'request-123').error);
});
test('signed Generate computes from source, rejects invented answers and preserves Edit mode', async () => {
  const post = body => new Request('https://test/api/learn/inline/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const authorize = async () => ({ name: 'canvas-demo', email: 'owner@test' });
  for (const mode of ['explain', 'edit']) {
    const request = make(mode); request.prompt = 'summarize the length column in mm'; request.context.target = { ids: ['table'] };
    const body = { app: 'canvas-demo', request_id: 'request-123', request, enabled: ['note'] };
    const verdict = await (await inlineDecideFetch(post(body), KEY_ENV, { authorize, ask: jevSays('proceed') })).json();
    assert.ok(verdict.token);
    const call = value => inlineGenerateFetch(post({ ...body, token: verdict.token }), KEY_ENV, { authorize, callModel: async (_env, prompt) => {
      if (mode === 'edit') assert.match(prompt.system, /only in Explain/);
      else assert.match(prompt.system, /never return data/i);
      return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: prompt.tools[0].name, input: value }] });
    } });
    const output = await (await call(input)).text();
    if (mode === 'explain') {
      assert.match(output, /"kind":"compute","requestId":"request-123"/);
      assert.doesNotMatch(output, /"content"|"values"/);
      assert.match(jevDecideRequest(request, null, 'fixture').questions.route.criteria.note, /numerical summary/);
    } else assert.match(output, /Derived calculations require Explain/);
    assert.match(await (await call({ ...input, values: [999] })).text(), /event: error/);
    const stale = structuredClone(body); stale.request.context.toolSnapshot.objects.table.rows[0][1] = '99';
    assert.equal((await inlineGenerateFetch(post({ ...stale, token: verdict.token }), KEY_ENV, { authorize, callModel: () => assert.fail('changed source cannot use prior proceed') })).status, 403);
  }
});
