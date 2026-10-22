// Lane B2's requests to Lane C (C:/s/spec/explain/requests-b2-to-c.md): attempt in the job view so Retry is observable; an
// attached image on v2 jobs, read server-side by the existing reader and offered to the author as a layout reference only;
// stable result-identity fields. Through the real route (explainRoute) and the real job (explain-fixture.js). Stand-ins:
// STUB_RENDER, scripted provider, the image reader and board access (injected, as artifactFetch's tests inject them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPipeline, explainRoute } from '../src/explain-job.js';
import { IMAGE_ROLES } from '../src/explain-author.js';
import { BOARD, OWNER, explainStack } from './explain-fixture.js';
import { memoryBucket } from './live-storage-spy.js';

const PNG = 'iVBORw0KGgo=';
const SPEC = { version: 1, id: 'rain', title: 'Where rain comes from', components: [
  { id: 'cycle', component: 'flow', version: 1, params: { steps: ['Sun warms the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Rain falls'] } },
], presentation: { mode: 'static' } };
const accept = { captures: [{ id: 'light', semantic: 'pass', visual: 'pass', findings: [] }] };
function scripted(t, queues) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), name = body.tools[0].name;
    calls.push({ name, body });
    const input = queues[name]?.shift();
    if (input === undefined) throw new Error(`no scripted reply for ${name}`);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1500, output_tokens: 400 } });
  };
  return calls;
}
function stack(t, render = async () => ({ captures: [{ id: 'light', data: PNG, mediaType: 'image/png' }], renders: [{ ok: true }] })) {
  const s = explainStack(t, { pipeline: { ...explainPipeline, render } });
  s.env.LEARN_MEDIA = memoryBucket();
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const reads = [];
  const deps = { identity: async () => OWNER, access: async () => ({ name: BOARD.app }), images: async (env, access, body) => { reads.push(body); return body.image_context.id === 'media-gone' ? { blocks: [{ type: 'text', text: 'unavailable' }], notice: 'The image could not be read.' } : { blocks: [{ type: 'text', text: 'Image: sketch' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }] }; } };
  const route = async (path, body, method = 'POST') => {
    const response = await explainRoute(path.split("?")[0], new Request(`https://dev.test${path}`, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), { ...s.env, EXPLAIN_JOBS: namespace }, deps);
    return { status: response.status, body: await response.json() };
  };
  return { ...s, route, reads };
}
const submit = extra => ({ boardId: BOARD.id, requestId: 'req-b2-00001', cardId: 'card-b2-0001', prompt: 'Explain where rain comes from, laid out like my sketch.', requestClass: 'simple', ...extra });

test('(1) the job view carries attempt, so a Retry is observable and a duplicate is visibly unchanged', async t => {
  let renders = 0;
  const s = stack(t, async () => { if (renders++ === 0) throw Object.assign(new Error('busy'), { status: 503, category: 'renderer' }); return { captures: [{ id: 'light', data: PNG, mediaType: 'image/png' }], renders: [{ ok: true }] }; });
  scripted(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [accept] });
  const { body } = await s.route('/api/learn/explain/jobs', submit());
  assert.equal(body.job.attempt, 1);
  await s.run(body.job.id);
  const retried = await s.route(`/api/learn/explain/jobs/${body.job.id}/retry`, { boardId: BOARD.id, expectedAttempt: 1 });
  assert.deepEqual([retried.status, retried.body.job.attempt], [202, 2]);
  const duplicate = await s.route(`/api/learn/explain/jobs/${body.job.id}/retry`, { boardId: BOARD.id, expectedAttempt: 1 });
  assert.deepEqual([duplicate.status, duplicate.body.job.attempt], [200, 2]);
});

test('(2) an attached image is read server-side, stored for the job and offered to the author once, as a layout reference only', async t => {
  const s = stack(t);
  const calls = scripted(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [accept] });
  // A browser-sent reference is ignored: only the route sets it.
  const created = await s.route('/api/learn/explain/jobs', submit({ image_context: { id: 'media-sketch' }, image_role: 'layout_reference', reference: { key: 'someone-else/secret', role: 'layout_reference', mediaType: 'image/png' } }));
  assert.equal(created.status, 202);
  assert.deepEqual(s.reads, [{ image_context: { id: 'media-sketch' }, board: BOARD.board }]);
  const job = s.state.data.get(`job:${created.body.job.id}`);
  assert.deepEqual(job.reference, { key: `explain-reference/${BOARD.id}/req-b2-00001`, role: 'layout_reference', mediaType: 'image/png' });
  const done = await s.run(created.body.job.id);
  assert.equal(done.stage, 'ready');
  const author = calls.find(c => c.name === 'author_explanation').body.messages[0].content;
  assert.deepEqual(author.slice(1).map(block => block.type), ['text', 'image']);
  assert.equal(author[1].text, IMAGE_ROLES.layout_reference);
  assert.equal(author[2].source.data, PNG);
  assert.deepEqual(JSON.parse(author[0].text).evidence, [], 'the image is never an evidence record');
  // The same press resent: the same job.
  assert.equal((await s.route('/api/learn/explain/jobs', submit({ image_context: { id: 'media-sketch' } }))).body.job.id, created.body.job.id);
});

test('(2) another role, a role with no image, or an unreadable image is refused before any job or call', async t => {
  const s = stack(t);
  const calls = scripted(t, {});
  assert.equal((await s.route('/api/learn/explain/jobs', submit({ image_context: { id: 'media-sketch' }, image_role: 'evidence' }))).status, 400);
  assert.equal((await s.route('/api/learn/explain/jobs', submit({ image_role: 'layout_reference' }))).status, 400);
  const gone = await s.route('/api/learn/explain/jobs', submit({ image_context: { id: 'media-gone' } }));
  assert.deepEqual([gone.status, gone.body.code], [409, 'image_unavailable']);
  assert.deepEqual([[...s.state.data.keys()].filter(k => k.startsWith('job:')).length, calls.length], [0, 0]);
});

test('(3) the result identity B2 matches on keeps its fields', async t => {
  const s = stack(t);
  scripted(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [accept] });
  const { body } = await s.route('/api/learn/explain/jobs', submit());
  await s.run(body.job.id);
  const view = await s.route(`/api/learn/explain/jobs/${body.job.id}?board=${BOARD.id}`, null, 'GET');
  const { job, block } = view.body;
  assert.deepEqual(Object.keys(job.result).sort(), ['baseRevision', 'canvas', 'cardId', 'compiledHash', 'componentVersions', 'jobId', 'policyVersion', 'promptRef', 'resultId', 'revision', 'specHash']);
  assert.deepEqual([job.result.cardId, job.cardId, block.id, job.result.canvas.boardId, job.result.baseRevision, block.explain.revision], ['card-b2-0001', 'card-b2-0001', 'card-b2-0001', BOARD.id, null, job.result.revision]);
});
