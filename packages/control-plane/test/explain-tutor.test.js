// EXP-T21 server side: a Tutor create_material { command explain } is the same /explain job (source tutor), with the same
// brief, components, review and accounting, and no second pipeline or intent call. The Tutor's create_material runs in the
// browser through runMaterials -> runLearnCommand (learn-slash.js, Lane B), which posts to /api/learn/explain/jobs once /explain
// routes there; the Tutor planner itself (agents/learn-tutor.js) is unchanged. Stand-ins: STUB_RENDER, scripted provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPipeline } from '../src/explain-job.js';
import { explainStack, rows, spent } from './explain-fixture.js';
import { ACTION_TYPES } from '../src/agents/learn-tutor.js';

const STUB_RENDER = async () => ({ captures: [{ id: 'light', data: 'iVBORw0KGgo=', mediaType: 'image/png' }], renders: [{ ok: true }] });
const SPEC = { version: 1, id: 'vents', title: 'Two volcano vents', components: [
  { id: 'row', component: 'stack', version: 1, hints: { direction: 'row', gap: 96 } },
  { id: 'runny', component: 'module', version: 1, parent: 'row', params: { label: 'Runny magma lets gas out' } },
  { id: 'sticky', component: 'module', version: 1, parent: 'row', params: { label: 'Sticky magma traps gas' } },
], presentation: { mode: 'static' } };
const accept = { captures: [{ id: 'light', semantic: 'pass', visual: 'pass', findings: [] }] };
function scripted(t, queues) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), name = body.tools[0].name;
    calls.push(name);
    const input = queues[name]?.shift();
    if (input === undefined) throw new Error(`no scripted reply for ${name}`);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1500, output_tokens: 400 } });
  };
  return calls;
}
// The Tutor's material, as runMaterials sends it: its request words and the card the learner selected as context.
const material = { requestId: 'req-tutor-0001', cardId: 'card-tutor-01', source: 'tutor', requestClass: 'simple', prompt: 'Two vents side by side: runny magma lets gas out, sticky magma traps it.', context: { target: { title: 'How volcanoes form' } } };

const BRIEF = { title: 'Two volcano vents', summary: 'Two vents sit side by side. Runny magma lets gas out. Sticky magma traps it.', presentation: 'static', components: ['stack', 'module'], assumptions: [], ambiguous: false, expanded: false };

// Owner decision 2026-10-29: every new /explain request, the Tutor's included, waits on its brief for Generate (it replaced the
// direct path this test pinned: author and review straight after the request).
test('a Tutor visual is the same job: one brief that waits on the canvas Chat for Generate, then the same stages and calls, no intent call of its own', async t => {
  assert.ok(ACTION_TYPES.includes('create_material'));
  const s = explainStack(t, { pipeline: { ...explainPipeline, render: STUB_RENDER } });
  const calls = scripted(t, { explain_brief: [BRIEF], author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [accept] });
  const { body } = await s.create(material);
  const waiting = await s.run(body.job.id);
  assert.deepEqual([waiting.stage, calls], ['awaiting_approval', ['explain_brief']], 'nothing is authored before Generate');
  assert.match(waiting.threadId, /^canvaschat-/, 'the Tutor sent no thread: the brief goes on the canvas open Chat');
  assert.equal((await s.approve(body.job.id)).status, 202);
  const done = await s.run(body.job.id);
  assert.deepEqual([done.stage, done.source, done.result.cardId], ['ready', 'tutor', 'card-tutor-01']);
  assert.deepEqual(calls, ['explain_brief', 'author_explanation', 'report_review']);
  const attempts = rows(s.sqlite, 'usage_attempts').filter(a => a.provider === 'anthropic');
  assert.deepEqual([attempts.map(a => a.kind), new Set(attempts.map(a => a.action_id)).size], [['generation', 'generation', 'evaluation'], 2], 'preparation and generation, one action each');
  // Reopening the job (a reload, the Progress view) starts nothing.
  await s.job(body.job.id); await s.run(body.job.id);
  assert.equal(calls.length, 3);
});

test('a Tutor visual on an exhausted allowance sends no call; an unsupported one is a gap, not a card', async t => {
  const s = explainStack(t, { pipeline: { ...explainPipeline, render: STUB_RENDER } });
  spent(s.sqlite, 50e6);
  const calls = scripted(t, {});
  const refused = await s.run((await s.create(material)).body.job.id);
  assert.deepEqual([refused.stage, refused.failure.category, calls.length], ['failed', 'budget', 0]);
  const g = explainStack(t, { pipeline: { ...explainPipeline, render: STUB_RENDER }, generate: true });
  scripted(t, { author_explanation: [{ kind: 'capability_gap', gap: { needs: ['experiment'], reason: 'Comparing vents needs a slider.' } }] });
  const gap = await g.run((await g.create(material)).body.job.id);
  assert.deepEqual([gap.stage, gap.failure.gap.needs, gap.result], ['failed', ['experiment'], null]);
});
