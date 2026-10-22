// EXP-T16: the sourced brief and the explain capability adapter, through the real job (explain-fixture.js) with the real
// preparing, author, validate, review and repair stages. Stand-ins: STUB_RENDER (inline PNG captures), a scripted provider
// answering each tool from its queue, FIXTURE evidence records (marked fixture: never real retrieval). Motion is unconfigured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPipeline } from '../src/explain-job.js';
import { briefDecision, briefThresholds, needsPreparation } from '../src/explain-brief.js';
import { proposalRecord, signProposal } from '../src/generation-proposal.js';
import { catalogue } from '../../web/src/visual-components/registry.js';
import { BOARD, OWNER, explainStack, rows, spent } from './explain-fixture.js';

const STUB_RENDER = async () => ({ captures: [{ id: 'light', data: 'iVBORw0KGgo=', mediaType: 'image/png' }], renders: [{ ok: true }] });
const SPEC = { version: 1, id: 'rain', title: 'Where rain comes from', components: [
  { id: 'cycle', component: 'flow', version: 1, params: { steps: ['Sun warms the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Rain falls'] } },
], presentation: { mode: 'static' } };
const accept = { captures: [{ id: 'light', semantic: 'pass', visual: 'pass', findings: [] }] };
const brief = (extra = {}) => ({ title: 'Where rain comes from', summary: 'The card follows water from the sea to the sky and back. Sunlight warms the sea and vapour rises. It cools into clouds and falls as rain.', presentation: 'static', components: ['flow'], assumptions: [], ambiguous: false, expanded: false, ...extra });
const FIXTURE_EVIDENCE = [{ id: 'ev-fixture-1', kind: 'web', location: 'https://example.org/water-cycle', excerpt: 'Water vapour condenses into droplets.', fixture: true }];

function scripted(t, queues) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), name = body.tools[0].name;
    calls.push({ name, body });
    let input = queues[name]?.shift();
    if (typeof input === 'function') input = input();
    if (input === undefined) throw new Error(`no scripted reply for ${name}`);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1500, output_tokens: 400 } });
  };
  return { calls, count: name => calls.filter(c => c.name === name).length };
}
function stack(t, { thresholds = true } = {}) {
  const s = explainStack(t, { pipeline: { ...explainPipeline, render: STUB_RENDER } });
  if (!thresholds) delete s.env.EXPLAIN_BRIEF_THRESHOLDS;
  assert.equal(s.env.MOTION_ORCHESTRATOR_TOKEN, undefined, 'Motion unconfigured');
  s.sqlite.prepare("INSERT INTO threads VALUES ('th1', ?, ?, ?)").run(OWNER.org, OWNER.email, BOARD.app);
  // messages: the chat answer rows a brief posts (repository-schema.sql shape).
  s.sqlite.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL)');
  return s;
}
const posted = s => rows(s.sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json));

test('the server decides review: missing thresholds, research, ambiguity, assumptions, expanded meaning, interaction, density or cost', () => {
  const env = { EXPLAIN_BRIEF_THRESHOLDS: JSON.stringify({ components: 3, credits: 400 }) };
  const base = { presentation: 'static', components: ['flow'], assumptions: [], ambiguous: false, expanded: false };
  assert.deepEqual(briefDecision(env, base), { capability: 'explain', source: 'explicit', uncertain: false, missingInputs: [], requiresBrief: false, briefReasons: [], permittedActions: ['generate'] });
  const reasons = (b, opts, e = env) => briefDecision(e, { ...base, ...b }, opts).briefReasons;
  assert.deepEqual(reasons({}, {}, {}), ['threshold_missing']);
  assert.deepEqual(reasons({}, {}, { EXPLAIN_BRIEF_THRESHOLDS: '{"components": "many"}' }), ['threshold_missing']);
  assert.deepEqual(reasons({}, { evidence: FIXTURE_EVIDENCE }), ['research']);
  assert.deepEqual(reasons({ ambiguous: true }), ['ambiguous_subject']);
  assert.deepEqual(reasons({ assumptions: ['Air pressure is constant.'] }), ['assumptions']);
  assert.deepEqual(reasons({ expanded: true }), ['expanded_meaning']);
  assert.deepEqual(reasons({ presentation: 'time' }), ['interactive']);
  assert.deepEqual(reasons({ components: ['flow', 'module', 'callout', 'legend'] }), ['density']);
  assert.deepEqual(reasons({}, {}, { EXPLAIN_BRIEF_THRESHOLDS: JSON.stringify({ components: 3, credits: 100 }) }), ['cost']);
  assert.equal(needsPreparation(env, 'simple'), false);
  assert.equal(needsPreparation(env, 'researched'), true);
  assert.equal(needsPreparation({}, 'simple'), true, 'no thresholds: every request is reviewed');
  assert.deepEqual(briefThresholds(env), { components: 3, credits: 400 });
});

test('a reviewed brief: one brief call, original wording kept, posted as the signed explain proposal on the owner\'s chat thread', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief({ assumptions: ['Rain here means liquid rain, not snow.'] })] });
  const { body } = await s.create({ requestClass: 'researched', threadId: 'th1', prompt: 'explain   where RAIN comes from' });
  const waiting = await s.run(body.job.id);
  assert.equal(waiting.stage, 'awaiting_approval', JSON.stringify([waiting.failure, waiting.findings]));
  assert.deepEqual(waiting.decision.briefReasons, ['assumptions']);
  assert.equal(waiting.brief.request, 'explain   where RAIN comes from', 'verbatim');
  const sent = model.calls[0].body;
  assert.deepEqual([sent.model, sent.tools[0].name, sent.tool_choice.type], ['claude-opus-5-5', 'explain_brief', 'auto']);
  assert.deepEqual(sent.tools[0].input_schema.properties.components.items.enum, catalogue().map(entry => entry.name));
  const [meta] = posted(s);
  assert.deepEqual([meta.proposal.command, meta.proposal.version, meta.proposal.title], ['explain', 1, 'Where rain comes from']);
  assert.match(meta.proposal.sig, /^v2\./, 'signed without a Motion secret');
  assert.deepEqual(meta.proposal.input, { org: OWNER.org, app: BOARD.app, job: body.job.id, brief_hash: waiting.briefHash, request: 'explain   where RAIN comes from' });
  assert.deepEqual(meta.proposal.settings, { presentation: 'static' });
  assert.equal(meta.proposal.usage.reserve_credits, 332);
  assert.equal(meta.proposalState.version, 1);
  // Another learner's thread, or one on another canvas, cannot receive it.
  s.sqlite.prepare("INSERT INTO threads VALUES ('th-other', ?, 'someone@example.com', ?)").run(OWNER.org, BOARD.app);
  assert.equal((await s.create({ requestId: 'req-00000002', cardId: 'card-0002', requestClass: 'researched', threadId: 'th-other' })).status, 404);
});

test('a refinement re-prepares the brief as the next version; the old version is refused, the current one generates with its settings', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief({ assumptions: ['x'] }), brief({ assumptions: ['x'], title: 'Rain, step by step', presentation: 'time' })],
    author_explanation: [{ kind: 'spec', spec: { ...SPEC, presentation: { mode: 'time', duration: 4 } } }], report_review: [accept] });
  const { body } = await s.create({ requestClass: 'researched', threadId: 'th1', prompt: 'Explain where rain comes from.' });
  const first = await s.run(body.job.id);
  const v1 = posted(s)[0].proposal;
  assert.equal((await s.send('refine', { message: 'Show it as it happens over time.' }, body.job.id)).status, 202);
  const second = await s.run(body.job.id);
  assert.equal(second.stage, 'awaiting_approval');
  assert.notEqual(second.briefHash, first.briefHash);
  const v2 = posted(s)[1].proposal;
  assert.deepEqual([v2.proposal_id, v2.version, v2.title, v2.input.brief_hash], [v1.proposal_id, 2, 'Rain, step by step', second.briefHash]);
  assert.equal(JSON.parse(model.calls[1].body.messages[0].content[0].text).refinement, 'Show it as it happens over time.');
  const record = await proposalRecord(s.env.LEARN_DB, OWNER.email, BOARD.app, v1.proposal_id);
  assert.deepEqual([record.state.version, record.current.version], [2, 2]);
  // The stale tab's v1: refused, nothing consumed. The current v2: generates, its presentation reaching the author.
  assert.equal((await s.send('approve', { proposal: v1 }, body.job.id)).status, 409);
  assert.equal((await proposalRecord(s.env.LEARN_DB, OWNER.email, BOARD.app, v1.proposal_id)).state.used, null);
  assert.equal((await s.send('approve', { proposal: v2 }, body.job.id)).status, 202);
  const done = await s.run(body.job.id);
  assert.equal(done.stage, 'ready');
  assert.equal(JSON.parse(model.calls.find(c => c.name === 'author_explanation').body.messages[0].content[0].text).brief.presentation, 'time');
  assert.equal((await s.send('refine', { message: 'More.' }, body.job.id)).status, 409, 'a generated brief cannot be refined');
});

// Steps compile since the integration (component step), so an experiment is the unsupported presentation left.
// Every presentation compiles since L3's experiment controls; a planned component the catalogue lacks is still a gap.
test('preflight: a brief that plans an unknown component is a capability gap, with no card and no proposal', async t => {
  for (const [reply, need] of [[brief({ components: ['galaxy'] }), 'component']]) {
    const s = stack(t);
    const model = scripted(t, { explain_brief: [reply] });
    const done = await s.run((await s.create({ requestClass: 'researched', threadId: 'th1' })).body.job.id);
    assert.deepEqual([done.stage, done.stopReason, done.failure.gap.needs, done.failure.gap.source], ['failed', 'capability_gap', [need], 'brief'], need);
    assert.deepEqual([posted(s).length, model.count('author_explanation'), done.result], [0, 0, null]);
  }
});

test('no trigger fires: after one brief call the job goes straight to authoring, under its own allowance check', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief()], author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [accept] });
  const done = await s.run((await s.create({ requestClass: 'researched', threadId: 'th1' })).body.job.id);
  assert.deepEqual([done.stage, done.decision.requiresBrief, posted(s).length], ['ready', false, 0]);
  assert.deepEqual(model.calls.map(c => c.name), ['explain_brief', 'author_explanation', 'report_review']);
  // The same with the allowance spent meanwhile: the brief was paid for, generation is refused before any author call.
  const r = stack(t);
  // The month is spent elsewhere while the brief call runs (it was already admitted).
  const refused = scripted(t, { explain_brief: [() => { spent(r.sqlite, 50e6 - 1000); return brief(); }] });
  const job = (await r.create({ requestClass: 'researched', threadId: 'th1' })).body.job;
  const stopped = await r.run(job.id);
  assert.deepEqual([stopped.stage, stopped.failure.category, refused.count('author_explanation')], ['failed', 'budget', 0], JSON.stringify([stopped.failure, stopped.findings]));
});

test('two unrelated topics with fixture evidence take the same path: nothing is topic-specific', async t => {
  for (const [prompt, title] of [['Explain where rain comes from.', 'Where rain comes from'], ['Explain how merge sort splits a list.', 'How merge sort splits a list']]) {
    const s = stack(t);
    scripted(t, { explain_brief: [brief({ title, evidence_ids: ['ev-fixture-1', 'ev-invented'] })] });
    const { body } = await s.create({ requestClass: 'researched', threadId: 'th1', prompt });
    s.state.data.set(`job:${body.job.id}`, { ...s.state.data.get(`job:${body.job.id}`), evidence: FIXTURE_EVIDENCE });
    const waiting = await s.run(body.job.id);
    assert.deepEqual([waiting.stage, waiting.decision.briefReasons, waiting.brief.evidenceIds, waiting.brief.request], ['awaiting_approval', ['research'], ['ev-fixture-1'], prompt], title);
  }
});

test('a refused brief call (allowance spent) stops the job as budget, with nothing sent', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief()] });
  const job = (await s.create({ requestClass: 'researched', threadId: 'th1' })).body.job;
  spent(s.sqlite, 50e6);
  const stopped = await s.run(job.id);
  assert.deepEqual([stopped.stage, stopped.failure.category, model.calls.length], ['failed', 'budget', 0]);
  assert.match(stopped.failure.message, /monthly AI allowance/);
});
