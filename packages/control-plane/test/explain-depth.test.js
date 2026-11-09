// Tutor ladder R2: the learner's Depth through /explain, on the v2 job (explain-job.js) with its real brief, author and repair stages
// (explain-brief.js prepareStage, explain-author.js authorStage, explain-repair.js) and the real ExplainJobs object, and through the
// artifact fallback (learn-artifact.js). A recording fetch stands in for the provider and keeps what the model was sent: Overview and
// Deep must differ in it, Standard must not change it. The Depth is the learner's selection at submit (validated, stored on the job);
// only when it is omitted does the server read the saved Depth for that exact canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainRoute, explainPipeline } from '../src/explain-job.js';
import { artifactFetch, generateArtifact } from '../src/learn-artifact.js';
import { setDepth } from '../src/learn-user-settings.js';
import { depthInstruction } from '../src/chat-depth.js';
import { BOARD, OWNER, explainStack } from './explain-fixture.js';
import { withVisual } from './explanation-layout-fixture.js';

const MIGRATION = readFileSync(new URL('../learn-migrations/0037-learn-user-settings.sql', import.meta.url), 'utf8');
const SUMMARY = 'The card shows how a pendulum swings. It names the length and the period.';
const GAP = { kind: 'capability_gap', gap: { needs: ['component'], reason: 'No pendulum component.' } };
// A spec the trusted checks refuse (no such component): the author's answer when a test wants the repair stage.
const BAD_SPEC = { kind: 'spec', spec: { version: 1, id: 'p', title: 'P', components: [{ id: 'a', component: 'no-such-component', version: 1, params: {} }], presentation: { mode: 'static' } } };

// The provider: answers a brief with a valid brief, the author with `author` (a capability gap by default, which ends the job) and a
// repair with "no change", and keeps every request body, so a test reads exactly what the model was sent.
function provider(t, { author = GAP } = {}) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), tool = body.tools[0].name;
    const role = /brief/.test(tool) ? 'brief' : /repair/.test(tool) ? 'repair' : 'author';
    calls.push({ role, system: JSON.stringify(body.system), content: JSON.stringify(body.messages) });
    const input = role === 'brief' ? { title: 'A pendulum', summary: SUMMARY, presentation: 'static', components: [], assumptions: [], limitations: [], evidence_ids: [] }
      : role === 'repair' ? { operation: 'none', reason: 'Nothing to change.' } : author;
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: `t${calls.length}`, name: tool, input }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 500 } });
  };
  return calls;
}
const by = (calls, role) => calls.find(c => c.role === role);

// One request up to its author call: the brief is made, Generate is pressed, the author is called. -> { stored, calls, ... }.
async function through(t, depth, opts = {}) {
  const s = explainStack(t, { pipeline: explainPipeline });
  const calls = provider(t, opts);
  const { body } = await s.create(depth === undefined ? {} : { depth });
  const id = body.job.id;
  await s.actor.alarm(); await s.actor.alarm(); // queued -> preparing -> awaiting_approval
  assert.equal((await s.job(id)).job.stage, 'awaiting_approval');
  if (opts.restart) { const after = s.object(); assert.equal((await s.approve(id, after)).status, 202); await s.run(id, after); }
  else { assert.equal((await s.approve(id)).status, 202); await s.run(id); }
  return { s, id, stored: s.state.data.get(`job:${id}`), calls, brief: by(calls, 'brief'), author: by(calls, 'author'), repair: by(calls, 'repair') };
}

test('brief and author both see Deep: the job record, the brief call and the author call differ between Overview and Deep', async t => {
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

test('Deep survives durable restart: the object is rebuilt from storage between the brief and Generate, and the author still sees Deep', async t => {
  const run = await through(t, 'deep', { restart: true });
  assert.equal(run.stored.depth, 'deep');
  assert.match(run.author.system, /Depth: Deep/);
  assert.match(run.author.content, /\\"depth\\":\\"deep\\"/);
  assert.equal(run.calls.filter(c => c.role === 'brief').length, 1, 'the restart made no second brief call');
});

test('repair keeps original Depth: the v2 repair round receives the Depth the job was made at, and adds no call of its own beyond the repair round', async t => {
  const deep = await through(t, 'deep', { author: BAD_SPEC }), plain = await through(t, undefined, { author: BAD_SPEC });
  assert.ok(deep.repair, 'the refused spec went to a repair round');
  assert.match(deep.repair.system, /Depth: Deep/); assert.match(deep.repair.content, /\\"depth\\":\\"deep\\"/);
  assert.ok(plain.repair); assert.doesNotMatch(plain.repair.system + plain.repair.content, /Depth:|depth/, 'Standard repair is today\'s input');
  assert.deepEqual(deep.calls.map(c => c.role), plain.calls.map(c => c.role), 'the same calls in the same order as a Standard job');
});

// A route over the real ExplainJobs object, for create requests.
function routed(t) {
  const s = explainStack(t, { pipeline: explainPipeline });
  s.sqlite.exec(MIGRATION);
  const namespace = { idFromName: name => name, get: () => ({ fetch: (url, init) => s.actor.fetch(new Request(url, init)) }) };
  const env = { ...s.env, EXPLAIN_JOBS: namespace };
  const identity = async () => OWNER;
  const post = (body, board = BOARD, over = env) => explainRoute('/api/learn/explain/jobs', new Request('https://dev.test/api/learn/explain/jobs', { method: 'POST', body: JSON.stringify({ boardId: board.id, prompt: 'Explain a pendulum.', requestClass: 'simple', ...body }) }), over, { identity }).then(async r => ({ status: r.status, body: await r.json() }));
  return { s, env, post, depthOf: id => s.state.data.get(`job:${id}`).depth };
}

test('v2 route: the selection at submit is validated and stored; omitted, the saved Depth for that exact canvas; no browser value is trusted blindly', async t => {
  const { s, env, post, depthOf } = routed(t);
  const actor = { org: OWNER.org, userId: OWNER.userId, app: BOARD.app, board: BOARD.board };
  await setDepth(env, actor, { depth: 'deep', expectedRevision: 0, actionId: 'saved-deep-0001' });
  const picked = await post({ requestId: 'req-00000011', cardId: 'card-0011', depth: 'overview' });
  assert.equal(picked.status, 202);
  assert.equal(depthOf(picked.body.job.id), 'overview', 'what the learner had selected when they submitted, not what is saved');
  const saved = await post({ requestId: 'req-00000012', cardId: 'card-0012' });
  assert.equal(depthOf(saved.body.job.id), 'deep', 'omitted: the saved Depth for this canvas');
  const other = await post({ requestId: 'req-00000013', cardId: 'card-0013' }, { id: 'board-2', app: 'canvas-b', board: 'main' });
  assert.equal(depthOf(other.body.job.id), 'standard', 'another canvas has its own');
  const jobs = s.state.data.size;
  for (const bad of ['shallow', 'DEEP', null, 5]) assert.equal((await post({ requestId: 'req-00000014', cardId: 'card-0014', depth: bad })).status, 400, String(bad));
  assert.equal(s.state.data.size, jobs, 'a refused Depth creates no job and calls no model');
  const unread = { ...env, LEARN_DB: { ...env.LEARN_DB, prepare: sql => (/learn_canvas_depth/.test(sql) ? { bind: () => ({ first: async () => { throw new Error('no such table'); } }) } : env.LEARN_DB.prepare(sql)) } };
  const sent = await post({ requestId: 'req-00000015', cardId: 'card-0015' }, BOARD, unread);
  assert.equal(depthOf(sent.body.job.id), 'standard', 'a database that cannot be read is Standard');
});

test('changed-depth replay conflicts: the same request id with another Depth is 409, the same Depth replays the job, Standard and omitted are one', async t => {
  const { s, post } = routed(t);
  const request = { requestId: 'req-00000021', cardId: 'card-0021' };
  const first = await post({ ...request, depth: 'deep' });
  assert.equal(first.status, 202);
  const replay = await post({ ...request, depth: 'deep' });
  assert.deepEqual([replay.status, replay.body.job.id], [200, first.body.job.id], 'the same request replays its job');
  const changed = await post({ ...request, depth: 'overview' });
  assert.deepEqual([changed.status, changed.body.error], [409, 'This request id belongs to a different explanation.']);
  assert.equal((await post({ ...request })).status, 409, 'omitted resolves to the saved Standard, which is not Deep');
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 1, 'no second job');
  const plain = { requestId: 'req-00000022', cardId: 'card-0022' };
  const made = await post({ ...plain, depth: 'standard' });
  const again = await post({ ...plain });
  assert.deepEqual([again.status, again.body.job.id], [200, made.body.job.id], 'Standard and no Depth are the same request, as before Depth existed');
});

test('artifact: captured Deep reaches artifact system, and v2 disabled fallback retains Overview', async t => {
  const sent = [];
  const callModel = async (env, body) => { sent.push({ system: body.system, content: body.messages[0].content }); return Response.json({ content: [{ type: 'tool_use', id: 't1', name: 'ask_clarifying_question', input: { question: 'Which part?' } }], stop_reason: 'tool_use' }); };
  const env = { CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: OWNER.org, user_id: OWNER.userId }) } };
  const post = (body, over = env, generate = (e, input) => generateArtifact(e, input, { callModel })) => artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: 'demo', ...body }) }), over, generate);
  // The snapshot the browser took at submit arrives with the board and reaches the system prompt and the request JSON of the model call.
  assert.equal((await post({ command: 'explain', args: 'how a pendulum swings', board: 'main', depth: 'deep' })).status, 200);
  assert.equal((await post({ command: 'explain', args: 'how a pendulum swings', board: 'main', depth: 'overview' })).status, 200);
  assert.equal((await post({ command: 'explain', args: 'how a pendulum swings', board: 'main' })).status, 200);
  const [deep, overview, plain] = sent;
  assert.match(deep.system, /Depth: Deep/); assert.match(overview.system, /Depth: Overview/); assert.doesNotMatch(plain.system, /Depth:/);
  assert.match(deep.content, /"depth":"deep"/); assert.match(overview.content, /"depth":"overview"/); assert.doesNotMatch(plain.content, /depth/);
  assert.notEqual(deep.system, overview.system); assert.notEqual(deep.content, overview.content);
  assert.match(deep.content, /how a pendulum swings/, 'the learner\'s arguments are preserved');
});

test('artifact route: invalid depth rejected before model, the saved Depth only for the exact canvas, no main fallback, unsupported deterministic command unchanged', async t => {
  const s = explainStack(t);
  s.sqlite.exec(MIGRATION);
  const env = { ...s.env, CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: OWNER.org, user_id: OWNER.userId }) } };
  const seen = [];
  const generate = async (e, input) => { seen.push(input); return { result: 'clarification', question: 'Which part?' }; };
  const post = body => artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: 'demo', ...body }) }), env, generate);
  const actor = board => ({ org: OWNER.org, userId: OWNER.userId, app: 'demo', board });
  await setDepth(env, actor('main'), { depth: 'deep', expectedRevision: 0, actionId: 'saved-main-0001' });
  await setDepth(env, actor('second'), { depth: 'overview', expectedRevision: 0, actionId: 'saved-second-001' });
  // An unsupported explicit value is a 400 before auth, the model or any read.
  for (const bad of ['shallow', 'DEEP', null, 3]) assert.equal((await post({ command: 'explain', args: 'a pendulum', depth: bad })).status, 400, String(bad));
  assert.deepEqual(seen, [], 'no generation for a refused Depth');
  // Omitted: the saved Depth of exactly the named board; no board named is Standard (never the main board's).
  assert.equal((await post({ command: 'explain', args: 'a pendulum', board: 'second' })).status, 200);
  assert.equal((await post({ command: 'explain', args: 'a pendulum', board: 'main' })).status, 200);
  assert.equal((await post({ command: 'explain', args: 'a pendulum', board: 'unseen' })).status, 200);
  assert.equal((await post({ command: 'explain', args: 'a pendulum' })).status, 200);
  assert.deepEqual(seen.map(input => input.depth), ['overview', 'deep', undefined, undefined]);
  // A snapshot beats what is saved, and commands that make no explanation, deterministic ones included, are unchanged.
  seen.length = 0;
  assert.equal((await post({ command: 'explain', args: 'a pendulum', board: 'main', depth: 'standard' })).status, 200);
  for (const command of ['quiz', 'flashcards', 'notebook']) assert.equal((await post({ command, args: 'a pendulum', board: 'main', depth: 'deep' })).status, 200, command);
  assert.deepEqual(seen.map(input => input.depth), [undefined, undefined, undefined, undefined]);
  assert.deepEqual(Object.keys(seen[1]).sort(), ['args', 'command', 'context', 'selection'], 'the generator input of a quiz is exactly what it was before Depth');
});

test('artifact repair keeps original Depth: the one repair call carries the same Depth sentence and request JSON as the first call', async () => {
  const calls = [], bad = { title: 'Why softmax', body: '' }, good = { title: 'Why softmax', body: withVisual('Softmax turns scores into probabilities.') }; // EXP-13, owner 2026-11-08: a new card has a visual
  const replies = [['make_explanation', bad], ['make_explanation', good]];
  const callModel = async (env, body) => { calls.push({ system: body.system, content: body.messages[0].content, messages: body.messages.length }); const [name, input] = replies[calls.length - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${calls.length}`, name, input }] }); };
  const out = await generateArtifact({}, { command: 'explain', args: 'how softmax works', depth: 'deep' }, { callModel });
  assert.equal(out.result, 'artifact'); assert.equal(out.repaired, true);
  assert.equal(calls.length, 2, 'exactly one repair, no extra call');
  assert.equal(calls[1].messages > calls[0].messages, true, 'the second call is the repair');
  for (const call of calls) { assert.match(call.system, /Depth: Deep/); assert.match(call.content, /"depth":"deep"/); }
  assert.equal(calls[0].system, calls[1].system); assert.equal(calls[0].content, calls[1].content);
});
