// Tutor ladder R2: the learner's Depth through /explain, on the v2 job (explain-job.js) with its real brief and author stages
// (explain-brief.js prepareStage, explain-author.js authorStage) and the real ExplainJobs object, and through the artifact
// fallback (learn-artifact.js). A recording fetch stands in for the provider and keeps what the model was sent: Overview and Deep
// must differ in it, Standard must not change it. The route reads the saved Depth itself and ignores a browser field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainRoute, explainPipeline } from '../src/explain-job.js';
import { artifactFetch, generateArtifact } from '../src/learn-artifact.js';
import { saveSettings } from '../src/learn-user-settings.js';
import { depthInstruction } from '../src/chat-depth.js';
import { BOARD, OWNER, explainStack } from './explain-fixture.js';

const MIGRATION = readFileSync(new URL('../learn-migrations/0037-learn-user-settings.sql', import.meta.url), 'utf8');
const SUMMARY = 'The card shows how a pendulum swings. It names the length and the period.';
const GAP = { kind: 'capability_gap', gap: { needs: ['component'], reason: 'No pendulum component.' } };

// The provider: answers a brief with a valid brief and an author call with a capability gap (which ends the job after the author
// stage), and keeps every request body, so a test reads exactly what the model was sent.
function provider(t) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), system = JSON.stringify(body.system), content = JSON.stringify(body.messages);
    const role = /"name":"explain_brief"|brief/i.test(JSON.stringify(body.tools?.map(tool => tool.name))) ? 'brief' : 'author';
    calls.push({ role, system, content });
    const input = role === 'brief' ? { title: 'A pendulum', summary: SUMMARY, presentation: 'static', components: [], assumptions: [], limitations: [], evidence_ids: [] } : GAP;
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: `t${calls.length}`, name: body.tools[0].name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
  };
  return calls;
}

// One request up to its author call: the brief is made, Generate is pressed, the author is called. -> { job, brief, author }.
async function through(t, depth) {
  const s = explainStack(t, { pipeline: explainPipeline });
  const calls = provider(t);
  const { body } = await s.create(depth === undefined ? {} : { depth });
  const id = body.job.id;
  await s.actor.alarm(); await s.actor.alarm(); // queued -> preparing -> awaiting_approval
  assert.equal((await s.job(id)).job.stage, 'awaiting_approval');
  assert.equal((await s.approve(id)).status, 202);
  await s.run(id);
  return { stored: s.state.data.get(`job:${id}`), brief: calls.find(c => c.role === 'brief'), author: calls.find(c => c.role === 'author'), calls };
}

test('v2 job: Depth is on the job record, in the brief call and the author call, and Overview and Deep differ in all three', async t => {
  const overview = await through(t, 'overview'), deep = await through(t, 'deep'), standard = await through(t, 'standard'), none = await through(t);
  assert.deepEqual([overview.stored.depth, deep.stored.depth, standard.stored.depth, none.stored.depth], ['overview', 'deep', 'standard', 'standard']);
  assert.ok(overview.brief && overview.author && deep.brief && deep.author, 'both model calls were made');
  for (const [name, run] of [['overview', overview], ['deep', deep]]) {
    const note = depthInstruction(name, 'card');
    for (const call of [run.brief, run.author]) {
      assert.ok(call.system.includes(note.slice(0, 40)), `${name}: the system prompt carries the Depth sentence`);
      assert.match(call.content, new RegExp(`\\\\"depth\\\\":\\\\"${name}\\\\"`), `${name}: the request JSON carries depth`);
    }
    assert.equal(run.stored.brief.depth, name, 'the brief records its Depth');
  }
  assert.notEqual(overview.brief.system, deep.brief.system); assert.notEqual(overview.brief.content, deep.brief.content);
  assert.notEqual(overview.author.system, deep.author.system); assert.notEqual(overview.author.content, deep.author.content);
  // Standard and no Depth are today's model input, byte for byte, and today's brief.
  for (const run of [standard, none]) {
    for (const call of [run.brief, run.author]) { assert.doesNotMatch(call.system, /Depth:/); assert.doesNotMatch(call.content, /depth/); }
    assert.equal('depth' in run.stored.brief, false);
  }
  assert.equal(standard.brief.system, none.brief.system); assert.equal(standard.author.system, none.author.system);
});

test('v2 job: a job stored before Depth existed (no depth field) reads as Standard in both stages', async t => {
  const s = explainStack(t, { pipeline: explainPipeline });
  const calls = provider(t);
  const { body } = await s.create();
  const key = `job:${body.job.id}`, stored = s.state.data.get(key);
  delete stored.depth; s.state.data.set(key, stored);
  await s.actor.alarm(); await s.actor.alarm();
  assert.equal((await s.approve(body.job.id)).status, 202);
  await s.run(body.job.id);
  assert.equal(calls.length, 2);
  for (const call of calls) assert.doesNotMatch(call.system + call.content, /Depth:|depth/);
});

test('v2 route: the saved Depth for this learner and canvas is read at create; a browser depth field is ignored; another canvas keeps its own', async t => {
  const s = explainStack(t, { pipeline: explainPipeline });
  s.sqlite.exec(MIGRATION);
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const env = { ...s.env, EXPLAIN_JOBS: namespace };
  const identity = async () => OWNER;
  const create = (extra, board = BOARD) => explainRoute('/api/learn/explain/jobs', new Request('https://dev.test/api/learn/explain/jobs', { method: 'POST', body: JSON.stringify({ boardId: board.id, prompt: 'Explain a pendulum.', requestClass: 'simple', ...extra }) }), env, { identity }).then(async r => ({ status: r.status, body: await r.json() }));
  const depthOf = id => s.state.data.get(`job:${id}`).depth;
  await saveSettings(env, { org: OWNER.org, userId: OWNER.userId, app: BOARD.app, board: BOARD.board }, { depth: 'deep' });
  const first = await create({ requestId: 'req-00000011', cardId: 'card-0011', depth: 'overview' });
  assert.equal(first.status, 202);
  assert.equal(depthOf(first.body.job.id), 'deep', 'the saved Depth, not the request\'s overview');
  // A learner with nothing saved on this canvas gets Standard; so does a database that cannot be read.
  const other = await create({ requestId: 'req-00000012', cardId: 'card-0012', depth: 'deep' }, { id: 'board-2', app: 'canvas-b', board: 'main' });
  assert.equal(depthOf(other.body.job.id), 'standard');
  const unread = { ...env, LEARN_DB: { ...env.LEARN_DB, prepare: sql => (/learn_canvas_depth/.test(sql) ? { bind: () => ({ first: async () => { throw new Error('no such table'); } }) } : env.LEARN_DB.prepare(sql)) } };
  const sent = await explainRoute('/api/learn/explain/jobs', new Request('https://dev.test/api/learn/explain/jobs', { method: 'POST', body: JSON.stringify({ boardId: BOARD.id, requestId: 'req-00000013', cardId: 'card-0013', prompt: 'Explain.', requestClass: 'simple' }) }), unread, { identity });
  assert.equal(sent.status, 202);
  assert.equal(depthOf((await sent.json()).job.id), 'standard');
});

test('artifact fallback: /explain and /walkthrough reach the model with the saved Depth; other commands and Standard do not', async t => {
  const sent = [];
  const callModel = async (env, body) => { sent.push({ system: body.system, content: body.messages[0].content }); return Response.json({ content: [{ type: 'tool_use', id: 't1', name: 'ask_clarifying_question', input: { question: 'Which part?' } }], stop_reason: 'tool_use' }); };
  for (const depth of ['overview', 'deep', undefined]) await generateArtifact({}, { command: 'explain', args: 'how a pendulum swings', ...(depth ? { depth } : {}) }, { callModel });
  const [overview, deep, plain] = sent;
  assert.match(overview.system, /Depth: Overview/); assert.match(deep.system, /Depth: Deep/); assert.doesNotMatch(plain.system, /Depth:/);
  assert.match(overview.content, /"depth":"overview"/); assert.match(deep.content, /"depth":"deep"/); assert.doesNotMatch(plain.content, /depth/);
  assert.notEqual(overview.system, deep.system); assert.notEqual(overview.content, deep.content);

  // The route: the saved Depth is read for this learner and canvas under the access the route resolved.
  const s = explainStack(t);
  s.sqlite.exec(MIGRATION);
  // The access the route resolves for a regular app: the control plane's answer for it (learn-board.js authorizedBoardApp).
  const env = { ...s.env, CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: OWNER.org, user_id: OWNER.userId }) } };
  const seen = [];
  const generate = async (env, input) => { seen.push(input); return { result: 'clarification', question: 'Which part?' }; };
  const post = body => artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: 'demo', ...body }) }), env, generate);
  await saveSettings(s.env, { org: OWNER.org, userId: OWNER.userId, app: 'demo', board: 'main' }, { depth: 'deep' });
  assert.equal((await post({ command: 'explain', args: 'a pendulum', depth: 'overview' })).status, 200);
  assert.equal((await post({ command: 'walkthrough', args: 'a pendulum' })).status, 200);
  assert.equal((await post({ command: 'quiz', args: 'a pendulum' })).status, 200);
  assert.deepEqual(seen.map(input => input.depth), ['deep', 'deep', undefined], 'the browser\'s overview is ignored; a quiz has no Depth');
});
