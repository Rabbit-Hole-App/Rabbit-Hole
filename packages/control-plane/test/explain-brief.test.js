// EXP-T16: the sourced brief and the explain capability adapter, through the real job (explain-fixture.js) with the real
// preparing, author, validate, review and repair stages. Stand-ins: STUB_RENDER (inline PNG captures), a scripted provider
// answering each tool from its queue, FIXTURE evidence records (marked fixture: never real retrieval). Motion is unconfigured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPipeline } from '../src/explain-job.js';
import { briefDecision, briefThresholds, needsPreparation } from '../src/explain-brief.js';
import { proposalRecord, signProposal } from '../src/generation-proposal.js';
import { chatProposalFetch } from '../src/chat-proposal-route.js';
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
  s.sqlite.prepare("INSERT INTO threads (id, org, user, scope_ref) VALUES ('th1', ?, ?, ?)").run(OWNER.org, OWNER.email, BOARD.app);
  return s;
}
const posted = s => rows(s.sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json));

// Owner decision 2026-10-29: every new /explain request shows its brief and waits for Generate. It replaces the rule this test
// pinned (a simple request within the thresholds, with no trigger, went straight to authoring).
test('the server always requires review of a new request; the reasons still name thresholds, research, ambiguity, assumptions, meaning, interaction, density or cost', () => {
  const env = { EXPLAIN_BRIEF_THRESHOLDS: JSON.stringify({ components: 3, credits: 400 }) };
  const base = { presentation: 'static', components: ['flow'], assumptions: [], ambiguous: false, expanded: false };
  assert.deepEqual(briefDecision(env, base), { capability: 'explain', source: 'explicit', uncertain: false, missingInputs: [], requiresBrief: true, briefReasons: ['review_always'], permittedActions: ['brief', 'clarify'] });
  const reasons = (b, opts, e = env) => briefDecision(e, { ...base, ...b }, opts).briefReasons.slice(1);
  assert.deepEqual(reasons({}, {}, {}), ['threshold_missing']);
  assert.deepEqual(reasons({}, {}, { EXPLAIN_BRIEF_THRESHOLDS: '{"components": "many"}' }), ['threshold_missing']);
  assert.deepEqual(reasons({}, { evidence: FIXTURE_EVIDENCE }), ['research']);
  assert.deepEqual(reasons({ ambiguous: true }), ['ambiguous_subject']);
  assert.deepEqual(reasons({ assumptions: ['Air pressure is constant.'] }), ['assumptions']);
  assert.deepEqual(reasons({ expanded: true }), ['expanded_meaning']);
  assert.deepEqual(reasons({ presentation: 'time' }), ['interactive']);
  assert.deepEqual(reasons({ components: ['flow', 'module', 'callout', 'legend'] }), ['density']);
  assert.deepEqual(reasons({}, {}, { EXPLAIN_BRIEF_THRESHOLDS: JSON.stringify({ components: 3, credits: 100 }) }), ['cost']);
  // Every new request prepares a brief whatever class the client sends and whatever thresholds are configured; only a same-card Edit
  // keeps its earlier path.
  for (const e of [env, {}]) for (const requestClass of ['simple', 'researched']) assert.equal(needsPreparation(e, requestClass), true, requestClass);
  assert.equal(needsPreparation(env, 'edit'), false);
  assert.equal(needsPreparation({}, 'edit'), true);
  assert.deepEqual(briefThresholds(env), { components: 3, credits: 400 });
});

test('a reviewed brief: one brief call, original wording kept, posted as the signed explain proposal on the owner\'s chat thread', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief({ assumptions: ['Rain here means liquid rain, not snow.'] })] });
  const { body } = await s.create({ requestClass: 'researched', threadId: 'th1', prompt: 'explain   where RAIN comes from' });
  const waiting = await s.run(body.job.id);
  assert.equal(waiting.stage, 'awaiting_approval', JSON.stringify([waiting.failure, waiting.findings]));
  assert.deepEqual(waiting.decision.briefReasons, ['review_always', 'assumptions']);
  assert.equal(waiting.brief.request, 'explain   where RAIN comes from', 'verbatim');
  const sent = model.calls[0].body;
  assert.deepEqual([sent.model, sent.tools[0].name, sent.tool_choice.type], ['claude-opus-5-5', 'explain_brief', 'auto']);
  assert.deepEqual(sent.tools[0].input_schema.properties.components.items.enum, catalogue().map(entry => entry.name));
  const [meta] = posted(s);
  assert.deepEqual([meta.proposal.command, meta.proposal.version, meta.proposal.title], ['explain', 1, 'Where rain comes from']);
  // UI-15.1 (owner schema spec 2026-10-23): the brief is posted in the v3 review envelope (same key as v2, no Motion secret), so its edited prompt is signed.
  assert.match(meta.proposal.sig, /^v3\./, 'signed without a Motion secret');
  assert.deepEqual(meta.proposal.input, { org: OWNER.org, app: BOARD.app, job: body.job.id, brief_hash: waiting.briefHash, request: 'explain   where RAIN comes from' });
  assert.deepEqual(meta.proposal.settings, { presentation: 'static' });
  assert.equal(meta.proposal.usage.reserve_credits, 332);
  assert.equal(meta.proposalState.version, 1);
  // Another learner's thread, or one on another canvas, cannot receive it.
  s.sqlite.prepare("INSERT INTO threads (id, org, user, scope_ref) VALUES ('th-other', ?, 'someone@example.com', ?)").run(OWNER.org, BOARD.app);
  assert.equal((await s.create({ requestId: 'req-00000002', cardId: 'card-0002', requestClass: 'researched', threadId: 'th-other' })).status, 404);
});

test('a brief needing review with no chat thread (Tutor, Ctrl+K) goes on the canvas open thread, a new one when none; never skipped', async t => {
  const s = stack(t, { thresholds: false });
  scripted(t, { explain_brief: [brief(), brief()] });
  const first = await s.run((await s.create()).body.job.id);
  assert.equal(first.stage, 'awaiting_approval');
  assert.match(first.threadId, /^canvaschat-[0-9a-f-]{36}$/);
  const thread = rows(s.sqlite, 'threads').find(r => r.id === first.threadId);
  assert.deepEqual([thread.org, thread.user, thread.scope_ref], [OWNER.org, OWNER.email, BOARD.app]);
  const active = rows(s.sqlite, 'chat_thread_state').find(r => r.thread_id === `active:${BOARD.app}:${OWNER.org}:${OWNER.email}`);
  assert.equal(JSON.parse(active.context_json).threadId, first.threadId, 'the new thread is the canvas open Chat thread');
  assert.equal(posted(s).length, 1);
  // The next request with no thread joins that open thread instead of making another.
  const second = await s.run((await s.create({ requestId: 'req-00000002', cardId: 'card-0002' })).body.job.id);
  assert.equal(second.threadId, first.threadId);
  assert.deepEqual([posted(s).length, rows(s.sqlite, 'threads').length], [2, 2]);
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

// Owner decision 2026-10-29: this replaces "no trigger fires: after one brief call the job goes straight to authoring".
test('a simple request with no trigger, within the thresholds, waits after one brief call: no author, render or review call until Generate', async t => {
  for (const requestClass of ['simple', 'researched']) {
    let renders = 0;
    const s = explainStack(t, { pipeline: { ...explainPipeline, render: async () => { renders++; return STUB_RENDER(); } } });
    const model = scripted(t, { explain_brief: [brief()], author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [accept] });
    const { body } = await s.create({ requestClass });
    let waiting = await s.run(body.job.id);
    for (let i = 0; i < 3; i++) waiting = await s.run(body.job.id); // the waiting brief is never advanced by a timer
    assert.deepEqual([waiting.stage, waiting.decision.requiresBrief, waiting.approval, posted(s).length], ['awaiting_approval', true, null, 1], requestClass);
    assert.deepEqual([model.calls.map(c => c.name), renders], [['explain_brief'], 0], requestClass);
    assert.equal(waiting.counts.author + waiting.counts.review, 0);
    assert.equal((await s.approve(body.job.id)).status, 202);
    assert.equal((await s.run(body.job.id)).stage, 'ready');
    assert.deepEqual([model.calls.map(c => c.name), renders], [['explain_brief', 'author_explanation', 'report_review'], 1]);
  }
  // The allowance spent meanwhile: the brief was paid for; Generate is refused before any author call and consumes nothing.
  const r = stack(t);
  const refused = scripted(t, { explain_brief: [() => { spent(r.sqlite, 50e6 - 1000); return brief(); }] });
  const job = (await r.create({ requestClass: 'researched', threadId: 'th1' })).body.job;
  const waiting = await r.run(job.id);
  const answer = await r.approve(job.id);
  assert.deepEqual([waiting.stage, answer.status, answer.body.code, refused.count('author_explanation')], ['awaiting_approval', 429, 'allowance_limited', 0]);
  assert.equal((await proposalRecord(r.env.LEARN_DB, OWNER.email, BOARD.app, posted(r)[0].proposal.proposal_id)).state.used, null);
});

test('two unrelated topics with fixture evidence take the same path: nothing is topic-specific', async t => {
  for (const [prompt, title] of [['Explain where rain comes from.', 'Where rain comes from'], ['Explain how merge sort splits a list.', 'How merge sort splits a list']]) {
    const s = stack(t);
    scripted(t, { explain_brief: [brief({ title, evidence_ids: ['ev-fixture-1', 'ev-invented'] })] });
    const { body } = await s.create({ requestClass: 'researched', threadId: 'th1', prompt });
    s.state.data.set(`job:${body.job.id}`, { ...s.state.data.get(`job:${body.job.id}`), evidence: FIXTURE_EVIDENCE });
    const waiting = await s.run(body.job.id);
    assert.deepEqual([waiting.stage, waiting.decision.briefReasons, waiting.brief.evidenceIds, waiting.brief.request], ['awaiting_approval', ['review_always', 'research'], ['ev-fixture-1'], prompt], title);
  }
});

test('a refused brief call (allowance spent) stops the job as budget, with nothing sent', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief()] });
  const job = (await s.create({ requestClass: 'researched', threadId: 'th1' })).body.job;
  spent(s.sqlite, 50e6);
  const stopped = await s.run(job.id);
  assert.deepEqual([stopped.stage, stopped.failure.category, model.calls.length], ['failed', 'budget', 0]);
  assert.match(stopped.failure.message, /Not enough AI credits/);
});

// The Chat card's Save: PUT /api/learn/chat/messages/:id/proposal (chat-proposal-route.js), a new signed revision with no model call.
const save = (s, messageId, body) => chatProposalFetch(new Request(`https://dev.test/api/learn/chat/messages/${messageId}/proposal`, { method: 'PUT', headers: { origin: 'https://dev.test' }, body: JSON.stringify(body) }), s.env, { identity: async () => OWNER })
  .then(async r => ({ status: r.status, body: await r.json() }));
const read = (s, messageId) => chatProposalFetch(new Request(`https://dev.test/api/learn/chat/messages/${messageId}/proposal`), s.env, { identity: async () => OWNER }).then(r => r.json());
const messageOf = s => rows(s.sqlite, 'chat_message_meta').at(-1).message_id;

test('edited wording reaches the author; Save makes no model call, a reload keeps the saved brief, the stale revision is refused and a double Generate starts once', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief({ assumptions: ['Rain here means liquid rain.'], limitations: ['It leaves out snow and hail.'] })], author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [accept] });
  const { body } = await s.create({ threadId: 'th1', prompt: 'Explain where rain comes from.' });
  const waiting = await s.run(body.job.id);
  const v1 = posted(s)[0].proposal, id = messageOf(s);
  // The limitations are shown with the brief (read only); the original request is the learner's words, unchanged.
  assert.deepEqual([v1.limitations, v1.original_request, v1.assumptions], [['It leaves out snow and hail.'], 'Explain where rain comes from.', ['Rain here means liquid rain.']]);
  const edit = { expected_version: 1, title: 'Rain from the sea', description: 'Follow one drop from the warm sea up into a cloud and down again as rain.', assumptions: ['Rain is liquid water.'] };
  const saved = await save(s, id, edit);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const v2 = saved.body.proposal;
  assert.deepEqual([v2.version, v2.title, v2.description, v2.original_request, model.calls.length], [2, edit.title, edit.description, 'Explain where rain comes from.', 1], 'a Save is no model call');
  // Saving from the old revision again (another tab): refused with the current one, which is kept.
  assert.equal((await save(s, id, { ...edit, expected_version: 1, title: 'Other' })).status, 409);
  // A reload: a new object over the same storage, the card read again; the saved brief and the waiting job are both still there.
  const restarted = s.object();
  assert.deepEqual([(await read(s, id)).proposal.title, (await s.send('get', {}, body.job.id, OWNER, restarted)).body.job.stage], [edit.title, 'awaiting_approval']);
  // The stale revision's Generate is refused and consumes nothing.
  const stale = await s.send('approve', { proposal: v1 }, body.job.id);
  assert.deepEqual([stale.status, stale.body.code], [409, 'proposal_stale']);
  assert.equal((await proposalRecord(s.env.LEARN_DB, OWNER.email, BOARD.app, v1.proposal_id)).state.used, null);
  // A double click: two Generates of the saved revision at once start one job, once.
  const presses = await Promise.all([s.send('approve', { proposal: v2 }, body.job.id), s.send('approve', { proposal: v2 }, body.job.id)]);
  assert.deepEqual(presses.map(r => r.status).sort(), [200, 202]);
  assert.deepEqual((await proposalRecord(s.env.LEARN_DB, OWNER.email, BOARD.app, v1.proposal_id)).state.used, { version: 2, key: body.job.id });
  const done = await s.run(body.job.id);
  assert.equal(done.stage, 'ready');
  assert.deepEqual([model.count('explain_brief'), model.count('author_explanation')], [1, 1]);
  // What authoring received: the learner's edited title, description and assumptions, the prepared limitations, the verbatim request.
  const author = JSON.parse(model.calls.find(c => c.name === 'author_explanation').body.messages[0].content[0].text);
  assert.deepEqual([author.request, author.brief.title, author.brief.summary, author.brief.assumptions, author.brief.limitations], ['Explain where rain comes from.', edit.title, edit.description, edit.assumptions, ['It leaves out snow and hail.']]);
  assert.equal(done.result.cardId, waiting.cardId, 'the waiting card is the one completed');
});

test('Cancel on a waiting brief stops the job through the existing cancel action: nothing is authored and Generate is refused', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief()] });
  const { body } = await s.create({ threadId: 'th1' });
  await s.run(body.job.id);
  const cancelled = await s.send('cancel', {}, body.job.id);
  assert.deepEqual([cancelled.status, cancelled.body.job.stage, cancelled.body.job.stopReason], [200, 'cancelled', 'stopped']);
  assert.equal((await s.approve(body.job.id)).status, 409);
  await s.run(body.job.id);
  assert.deepEqual(model.calls.map(c => c.name), ['explain_brief']);
  assert.equal(rows(s.sqlite, 'usage_actions').some(a => a.status === 'running'), false);
});

test('Retry after a failed brief prepares the brief again and waits: it never goes on to authoring', async t => {
  const s = stack(t);
  const model = scripted(t, { explain_brief: [brief({ title: '' }), brief()] });
  const { body } = await s.create({ threadId: 'th1' });
  const failed = await s.run(body.job.id);
  assert.deepEqual([failed.stage, failed.failure.stage, (await s.job(body.job.id)).job.recovery], ['failed', 'preparing', ['new_attempt', 'edit_request']]);
  assert.equal((await s.send('retry', { expectedAttempt: 1 }, body.job.id)).body.job.stage, 'preparing', 'old code: authoring, with no approved brief');
  const waiting = await s.run(body.job.id);
  assert.deepEqual([waiting.stage, model.calls.map(c => c.name)], ['awaiting_approval', ['explain_brief', 'explain_brief']]);
});

test('a generic program topic is briefed against the program runtime, with no registered topic component; the legacy route keeps the catalogue', async t => {
  const s = stack(t);
  s.env.EXPLAIN_PROGRAM_ENABLED = 'true';
  const plan = brief({ title: 'Falling on Earth and the Moon', summary: 'Compare an object falling on Earth and on the Moon, side by side. Change the drop height and object mass, then play or scrub the motion. Compare their fall times and weights.',
    presentation: 'experiment', components: ['galaxy'], assumptions: ['Air resistance is ignored.'], limitations: ['It shows one object at a time on each world.'] });
  const model = scripted(t, { explain_brief: [plan] });
  const { body } = await s.create({ threadId: 'th1', prompt: 'Explain why things fall slower on the Moon.' });
  const waiting = await s.run(body.job.id);
  assert.equal(waiting.stage, 'awaiting_approval', JSON.stringify(waiting.failure));
  assert.deepEqual([waiting.brief.components, waiting.brief.presentation, waiting.brief.assumptions], [[], 'experiment', ['Air resistance is ignored.']], 'no component name is checked or kept');
  const sent = model.calls[0].body, input = JSON.parse(sent.messages[0].content[0].text);
  assert.deepEqual([input.catalogue, input.supported, input.runtime.capabilities, input.runtime.limits.inputs, input.runtime.limits.duration], [undefined, undefined, ['time_playback', 'number_inputs', 'select_inputs', 'polyline', 'math_text'], 4, 120]);
  assert.deepEqual(['components' in sent.tools[0].input_schema.properties, sent.tools[0].input_schema.required.includes('components')], [false, false]);
  assert.match(sent.system[0].text, /what the learner can adjust/);
  const [meta] = posted(s);
  assert.deepEqual([meta.proposal.description, meta.proposal.assumptions, meta.proposal.limitations, meta.proposal.settings], [plan.summary, plan.assumptions, plan.limitations, { presentation: 'experiment' }]);
  assert.equal(JSON.stringify(meta.proposal).includes('galaxy'), false, 'no implementation term reaches the card');
  // The route off: the same reply is a capability gap (the legacy catalogue path is unchanged).
  const legacy = stack(t);
  scripted(t, { explain_brief: [plan] });
  const gap = await legacy.run((await legacy.create({ threadId: 'th1' })).body.job.id);
  assert.deepEqual([gap.stage, gap.stopReason, gap.failure.gap.needs], ['failed', 'capability_gap', ['component']]);
});
