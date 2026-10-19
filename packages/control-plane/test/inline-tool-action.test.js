import test from 'node:test';
import assert from 'node:assert/strict';
import { freezeInlineTools } from '../../web/src/inline-tool-plan.js';
import { reviewActions, checkToolAction, authorizeReviewScope } from '../src/inline-tool-action.js';
import { inlineDecideFetch, inlineGenerateFetch } from '../src/learn-inline.js';
import { jevDecideRequest } from '../src/learn-inline-route.js';
import { KEY_ENV, jevSays } from './learn-inline-fixture.js';

const scope = { app: 'repo-demo', repo: 'owner/repo', commit: 'a'.repeat(40) };
const make = (mode = 'edit') => ({ kind: 'selection', mode, targetIds: ['code'], prompt: 'run this code', context: {
  target: { ids: ['code'] }, toolSnapshot: freezeInlineTools({ items: [{ id: 'code', kind: 'text', mode: 'code', lang: 'javascript', text: 'return 2 + 2;' }] }, ['code'], {}, { mode }),
} });
const input = { summary: 'Review execution', action: { tool: 'run_code', targetIds: ['code'] } };
test('review handoff preserves mode, exact selection and server request identity without execution', () => {
  for (const mode of ['edit', 'explain']) {
    const request = make(mode);
    assert.deepEqual(reviewActions(request), ['run_code']);
    assert.deepEqual(checkToolAction(input, request, 'request-123').result, { kind: 'tool_action', action: 'run_code', targetIds: ['code'], summary: input.summary, requestId: 'request-123' });
  }
});
test('whole native JavaScript only, no source/range/locked/mismatched snapshot', () => {
  for (const change of [r => { r.textRange = { id: 'code', from: 0, to: 2 }; }, r => { r.context.toolSnapshot.objects.code.lang = 'python'; }, r => { r.context.toolSnapshot.objects.code.fileRef = {}; }, r => { r.context.toolSnapshot.objects.code.locked = true; }, r => { r.targetIds = ['other']; }, r => { r.context.toolSnapshot.intent = 'explain'; }]) {
    const r = make(); change(r); assert.deepEqual(reviewActions(r), []);
    assert.ok(checkToolAction(input, r, 'request-123').error);
  }
});
test('repository review also requires the exact valid frozen selection and mode', () => {
  for (const change of [r => { delete r.context.toolSnapshot; }, r => { r.targetIds = ['other']; }, r => { r.context.toolSnapshot.intent = 'edit'; }]) {
    const request = make('explain'); request.context.repoScope = scope; change(request);
    assert.deepEqual(reviewActions(request), []);
    assert.ok(checkToolAction({ summary: 'Review search', action: { tool: 'find_evidence', targetIds: request.targetIds, query: 'optimizer' } }, request, 'request-123').error);
  }
});
test('reject mixed results, model identity, fabricated input, query and arbitrary targets', () => {
  for (const value of [ { ...input, ops: [] }, { ...input, text: 'done' }, { ...input, plan: {} }, { ...input, requestId: 'forged' }, { ...input, action: { ...input.action, input: 4 } }, { ...input, action: { ...input.action, query: 'code' } }, { ...input, action: { ...input.action, targetIds: ['other'] } }, { ...input, summary: '' } ]) assert.ok(checkToolAction(value, make(), 'request-123').error);
});
test('explicit repository scope requires exact access and snapshot identity, never searches', async () => {
  const r = make('explain'); r.context.repoScope = scope;
  const calls = [];
  const deps = { authorize: async (_req, _env, name) => { calls.push(name); return { repo: scope.repo }; }, load: async () => { calls.push('snapshot'); return { repo: scope.repo, commit: scope.commit }; } };
  assert.equal(await authorizeReviewScope(new Request('https://test'), {}, r, deps), null);
  assert.deepEqual(calls, ['repo-demo', 'snapshot']);
  assert.equal((await authorizeReviewScope(new Request('https://test'), {}, r, { ...deps, load: async () => ({ repo: scope.repo, commit: 'b'.repeat(40) }) })).status, 409);
  assert.equal((await authorizeReviewScope(new Request('https://test'), {}, r, { authorize: async () => new Response(null, { status: 403 }), load: () => assert.fail('must not load') })).status, 403);
  const result = checkToolAction({ summary: 'Review repository search', action: { tool: 'find_evidence', targetIds: ['code'], query: 'optimizer' } }, r, 'request-123');
  assert.equal(result.result.query, 'optimizer');
  assert.ok(checkToolAction({ summary: 'Search', action: { tool: 'find_evidence', targetIds: ['code'], query: 'x\nsecret' } }, r, 'request-123').error);
});

const post = body => new Request('https://test/api/learn/inline/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const authorize = async () => ({ name: 'repo-demo', email: 'owner@test' });
test('HTTP repository denial and malformed scope stop before validator; revoked access stops signed generation', async () => {
  const request = make('explain'); request.context.repoScope = scope;
  const body = { app: 'repo-demo', request_id: 'request-123', request, enabled: ['note'] };
  let calls = 0;
  const denied = { authorize, repositoryAuthorize: async () => new Response(null, { status: 403 }), ask: async () => { calls++; } };
  assert.equal((await inlineDecideFetch(post(body), KEY_ENV, denied)).status, 403);
  const malformed = structuredClone(body); malformed.request.context.repoScope.commit = 'main';
  assert.equal((await inlineDecideFetch(post(malformed), KEY_ENV, denied)).status, 400);
  assert.equal(calls, 0);
  const approved = { authorize, repositoryAuthorize: async () => ({ repo: scope.repo }), repositoryLoad: async () => ({ ...scope }), ask: jevSays('proceed') };
  const decision = await (await inlineDecideFetch(post(body), KEY_ENV, approved)).json();
  assert.ok(decision.token);
  const response = await inlineGenerateFetch(post({ ...body, token: decision.token }), KEY_ENV, { ...denied, callModel: () => { calls++; assert.fail('no paid call after revocation'); } });
  assert.equal(response.status, 403); assert.equal(calls, 0);
});
test('signed Edit and Explain generation returns review only and binds exact frozen source', async () => {
  for (const mode of ['edit', 'explain']) {
    const request = make(mode), body = { app: 'repo-demo', request_id: 'request-123', request, enabled: ['note'] };
    const verdict = await (await inlineDecideFetch(post(body), KEY_ENV, { authorize, ask: jevSays('proceed') })).json();
    assert.ok(verdict.token);
    let calls = 0;
    const callModel = async (_env, prompt) => {
      calls++;
      assert.match(prompt.system, /never invent inputs/i);
      assert.match(JSON.stringify(prompt.messages), /availableReviewActions/);
      return Response.json({ content: [{ type: 'tool_use', name: prompt.tools[0].name, input }], stop_reason: 'tool_use' });
    };
    const response = await inlineGenerateFetch(post({ ...body, token: verdict.token }), KEY_ENV, { authorize, callModel });
    const output = await response.text();
    assert.match(output, /"kind":"tool_action","action":"run_code","requestId":"request-123"/);
    assert.equal(calls, 1);
    const changed = structuredClone(body); changed.request.context.toolSnapshot.objects.code.text = 'return 99;';
    assert.equal((await inlineGenerateFetch(post({ ...changed, token: verdict.token }), KEY_ENV, { authorize, callModel })).status, 403);
    assert.equal(calls, 1);
    const criteria = jevDecideRequest(request, mode === 'edit' ? { capability: 'edit' } : null, 'fixture');
    assert.match(criteria.questions.decision.criteria.unsupported, /review-only run_code/);
    if (mode === 'explain') assert.match(criteria.questions.route.criteria.note, /run_code/);
  }
});
test('repository handoff generation exposes only authorized scope, never loaded repository files', async () => {
  const request = make('explain'); request.context.repoScope = scope;
  const body = { app: 'repo-demo', request_id: 'request-123', request, enabled: ['note'] };
  let loads = 0;
  const deps = { authorize, repositoryAuthorize: async () => ({ repo: scope.repo }), repositoryLoad: async () => { loads++; return { ...scope, files: { 'private.js': 'not-retrieved-sentinel' } }; }, ask: jevSays('proceed') };
  const verdict = await (await inlineDecideFetch(post(body), KEY_ENV, deps)).json();
  const response = await inlineGenerateFetch(post({ ...body, token: verdict.token }), KEY_ENV, { ...deps, callModel: async (_env, prompt) => {
    assert.doesNotMatch(JSON.stringify(prompt), /not-retrieved-sentinel|private\.js/);
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: prompt.tools[0].name, input: { summary: 'Review search', action: { tool: 'find_evidence', targetIds: ['code'], query: 'optimizer' } } }] });
  } });
  assert.match(await response.text(), /"action":"find_evidence"/);
  assert.equal(loads, 2);
});
test('available review actions preserve ordinary note and legacy text edit output', async () => {
  for (const mode of ['edit', 'explain']) {
    const request = make(mode); request.prompt = mode === 'edit' ? 'make this return 5' : 'explain this code';
    const body = { app: 'repo-demo', request_id: 'request-123', request, enabled: ['note'] };
    const verdict = await (await inlineDecideFetch(post(body), KEY_ENV, { authorize, ask: jevSays('proceed') })).json();
    const input = mode === 'edit' ? { summary: 'Return five', ops: [{ op: 'replace_text', id: 'code', text: 'return 5;' }] } : { text: 'This returns the sum of two and two.' };
    const response = await inlineGenerateFetch(post({ ...body, token: verdict.token }), KEY_ENV, { authorize, callModel: async (_env, prompt) => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: prompt.tools[0].name, input }] }) });
    const output = await response.text();
    assert.match(output, mode === 'edit' ? /"kind":"edit"/ : /"kind":"note"/);
    assert.doesNotMatch(output, /"kind":"tool_action"/);
  }
});
