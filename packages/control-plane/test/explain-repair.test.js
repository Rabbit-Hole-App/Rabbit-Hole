// EXP-T19: bounded repair and actionable recovery, through the real job (explain-fixture.js) with the real author, validate,
// review and repair stages. Stand-ins: STUB_RENDER (one light capture per candidate, inline PNG bytes) until Lane D's
// renderStates lands, and a scripted provider answering each tool from its own queue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPipeline } from '../src/explain-job.js';
import { allowedRepairs, presentationFix, repairableHints } from '../src/explain-repair.js';
import { explainStack } from './explain-fixture.js';

const PNG = 'iVBORw0KGgo=';
const STUB_RENDER = async () => ({ captures: [{ id: 'light', data: PNG, mediaType: 'image/png' }], renders: [{ ok: true }] });
const SPEC = { version: 1, id: 'rain', title: 'Where rain comes from', components: [
  { id: 'row', component: 'stack', version: 1, hints: { direction: 'row', gap: 96 } },
  { id: 'sea', component: 'module', version: 1, parent: 'row', params: { label: 'Sun warms the sea' } },
  { id: 'cloud', component: 'module', version: 1, parent: 'row', params: { label: 'Vapour cools into clouds' } },
], connections: [{ from: 'sea.right', to: 'cloud.left' }], presentation: { mode: 'static' } };
const [ROW, SEA, CLOUD] = SPEC.components;
// Lane D's review tool (explain-review.js report_review): a semantic and a visual verdict per capture, with findings.
const accept = { captures: [{ id: 'light', semantic: 'pass', visual: 'pass', findings: [] }] };
const revise = ({ specRepairable = true, ...finding }) => ({ captures: [{ id: 'light', semantic: finding.category === 'source' ? 'fail' : 'pass', visual: finding.category === 'source' ? 'pass' : 'fail',
  findings: [{ verdict: finding.category === 'source' ? 'semantic' : 'visual', severity: 'major', object: 'sea.box', repairable: specRepairable, ...finding }] }] });
const overlap = revise({ category: 'spec', message: 'The two boxes touch.' });
// The same findings as the job stores them (parseReview's ReviewFinding shape).
const stored = reply => reply.captures[0].findings.map(f => ({ category: f.category, severity: f.severity, specRepairable: f.repairable, target: { capture: 'light', object: f.object } }));

function scripted(t, queues) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), name = body.tools[0].name;
    calls.push({ name, body });
    const input = queues[name]?.shift();
    if (input === undefined) throw new Error(`no scripted reply for ${name}`);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 2000, output_tokens: 600 } });
  };
  return { calls, count: name => calls.filter(c => c.name === name).length };
}
async function runJob(t, queues, extra = {}) {
  const s = explainStack(t, { pipeline: { ...explainPipeline, render: STUB_RENDER } });
  const model = scripted(t, queues);
  const { body } = await s.create({ prompt: 'Explain where rain comes from.', ...extra });
  return { s, model, id: body.job.id, done: await s.run(body.job.id, s.actor, 80) };
}

test('which repairs a failure allows: trusted-check failures a spec, wrong claims a spec or hints, rendered layout hints only', () => {
  assert.deepEqual(allowedRepairs({ problems: ['unknown parameter'] }), ['spec']);
  assert.deepEqual(allowedRepairs({ findings: stored(overlap) }), ['hints']);
  assert.deepEqual(allowedRepairs({ findings: stored(revise({ category: 'source', message: 'Wrong.' })) }), ['hints', 'spec']);
  for (const category of ['component', 'renderer', 'budget']) assert.deepEqual(allowedRepairs({ findings: stored(revise({ category, message: 'x' })) }), []);
  assert.deepEqual(allowedRepairs({ findings: stored(revise({ category: 'spec', message: 'x', specRepairable: false })) }), []);
  assert.deepEqual(Object.keys(repairableHints(SPEC)), ['row', 'sea', 'cloud'].filter(id => repairableHints(SPEC)[id]));
  assert.ok(repairableHints(SPEC).sea);
  assert.deepEqual(repairableHints(SPEC).sea.hints.width, { type: 'number', unit: 'px', min: 120, max: 480, default: 176 });
});

test('an allowed collision fix: a repairable hint within range, rechecked and reviewed again, then accepted', async t => {
  const { done, model } = await runJob(t, {
    author_explanation: [{ kind: 'spec', spec: SPEC }],
    report_review: [overlap, accept],
    repair_explanation: [{ operation: 'hints', patches: [{ component: 'sea', hint: 'width', value: 240 }], reason: 'Wider box.' }],
  });
  assert.deepEqual([done.stage, done.round], ['ready', 1]);
  assert.equal(done.spec.components[1].hints.width, 240);
  assert.deepEqual(done.spec.components.map(c => c.params), SPEC.components.map(c => c.params), 'text unchanged');
  assert.deepEqual(done.candidates.map(c => [c.round, c.operation, c.progress]), [[1, 'hints', true]]);
  // The repair saw the capture its finding names (an image-reference repair) and only hints were allowed.
  const repair = model.calls.find(c => c.name === 'repair_explanation').body.messages[0].content;
  assert.equal(repair.filter(block => block.type === 'image').length, 1);
  assert.deepEqual(JSON.parse(repair[0].text).allowed, ['hints']);
  assert.deepEqual([model.count('author_explanation'), model.count('report_review'), model.count('repair_explanation')], [1, 2, 1]);
});

test('a hint patch that changes meaning, names a non-repairable field or goes out of range is refused, and the job stops', async t => {
  for (const patch of [{ component: 'sea', hint: 'label', value: 'Rain' }, { component: 'sea', hint: 'width', value: 9000 }, { component: 'ghost', hint: 'width', value: 200 }]) {
    const { done, model } = await runJob(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [overlap], repair_explanation: [{ operation: 'hints', patches: [patch] }] });
    assert.deepEqual([done.stage, done.stopReason], ['failed', 'unsupported_repair'], JSON.stringify(patch));
    assert.match(done.candidates[0].rejected, /refused/);
    assert.equal(model.count('report_review'), 1, 'no second review is paid for');
  }
  // A whole new spec for a layout finding is not allowed either.
  const { done } = await runJob(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [overlap], repair_explanation: [{ operation: 'spec', spec: { ...SPEC, title: 'Other' } }] });
  assert.deepEqual([done.stopReason, done.candidates[0].rejected], ['unsupported_repair', 'A spec repair is not allowed for this failure.']);
});

test('a wrong claim is corrected by an explicit spec change that goes back through every check', async t => {
  const fixed = { ...SPEC, components: [ROW, SEA, { ...CLOUD, params: { label: 'Vapour rises and cools into clouds' } }] };
  const { done } = await runJob(t, {
    author_explanation: [{ kind: 'spec', spec: SPEC }],
    report_review: [revise({ category: 'source', object: 'cloud.box', message: 'Vapour must rise before it cools.' }), accept],
    repair_explanation: [{ operation: 'spec', spec: fixed }],
  });
  assert.deepEqual([done.stage, done.spec.components[2].params.label], ['ready', 'Vapour rises and cools into clouds']);
  // A spec that fails trusted checks (an unknown parameter) is repaired the same way, before any render or review.
  const broken = { ...SPEC, components: [ROW, { ...SEA, params: { label: 'Sun warms the sea', colour: 'red' } }, CLOUD] };
  const again = await runJob(t, { author_explanation: [{ kind: 'spec', spec: broken }], report_review: [accept], repair_explanation: [{ operation: 'spec', spec: SPEC }] });
  assert.deepEqual([again.done.stage, again.done.round, again.model.count('report_review')], ['ready', 1, 1]);
  // A spec correction sees the catalogue (params, limits, anchors); a hints-only round does not need it.
  const sent = JSON.parse(again.model.calls.find(c => c.name === 'repair_explanation').body.messages[0].content[0].text);
  assert.deepEqual([sent.allowed, sent.catalogue.length > 0, sent.limits.objectsPerPart], [['spec'], true, 60]);
  assert.match(again.done.findings[0].problems[0], /unknown parameter "colour"/);
});

test('no change is no progress: the job stops instead of paying for the same candidate again', async t => {
  const { done, model } = await runJob(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [overlap], repair_explanation: [{ operation: 'hints', patches: [{ component: 'sea', hint: 'width', value: 176 }] }] });
  assert.deepEqual([done.stopReason, model.count('report_review')], ['no_progress', 1]);
});

test('three failed corrections stop the job; calls never exceed the shared ceiling and Retry does not reset it', async t => {
  const { s, id, done, model } = await runJob(t, {
    author_explanation: [{ kind: 'spec', spec: SPEC }],
    report_review: [overlap, overlap, overlap, overlap],
    repair_explanation: [200, 240, 280].map(value => ({ operation: 'hints', patches: [{ component: 'sea', hint: 'width', value }] })),
  });
  assert.deepEqual([done.stage, done.stopReason, done.round], ['failed', 'rounds', 3]);
  assert.deepEqual([model.count('author_explanation'), model.count('report_review'), model.count('repair_explanation')], [1, 4, 3]);
  assert.deepEqual((await s.job(id)).job.recovery, ['edit_request']);
  assert.equal((await s.send('retry', { expectedAttempt: 1 }, id)).status, 409);
});

test('a component defect is not repaired: the job stops and the defect is recorded once per key, without the card text', async t => {
  const defect = revise({ category: 'component', message: 'The module box draws its border outside its label.', specRepairable: false });
  const first = await runJob(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [defect] });
  assert.deepEqual([first.done.stopReason, first.model.count('repair_explanation')], ['unsupported_repair', 0]);
  const entries = [...first.s.state.data].filter(([key]) => key.startsWith('defect:'));
  assert.equal(entries.length, 1);
  const [, entry] = entries[0];
  assert.deepEqual([entry.category, entry.component, entry.count], ['component', 'module@1', 1]);
  assert.equal(JSON.stringify(entry).includes('border'), false);
  // The same defect on the next job of this canvas counts, not duplicates.
  first.model.calls.length = 0;
  scripted(t, { author_explanation: [{ kind: 'spec', spec: SPEC }], report_review: [defect] });
  const next = (await first.s.create({ requestId: 'req-00000002', cardId: 'card-0002', prompt: 'Explain where rain comes from.' })).body.job;
  await first.s.run(next.id);
  const counted = [...first.s.state.data].filter(([key]) => key.startsWith('defect:'));
  assert.deepEqual([counted.length, counted[0][1].count], [1, 2]);
});

test('a time presentation that only reveals is made static deterministically (B2 presentationRepair): no model repair call, no round', async t => {
  const timed = { ...SPEC, presentation: { mode: 'time', duration: 4 } };
  assert.deepEqual(presentationFix(timed).presentation, { mode: 'static' });
  assert.equal(presentationFix(SPEC), null, 'a static spec needs no presentation repair');
  const { done, model } = await runJob(t, { author_explanation: [{ kind: 'spec', spec: timed }], report_review: [accept] });
  assert.deepEqual([done.stage, done.round, done.spec.presentation], ['ready', 0, { mode: 'static' }]);
  assert.match(done.findings[0].problems.join(' '), /time mode on a timeline that only reveals/);
  assert.deepEqual(done.candidates.map(c => [c.round, c.operation, c.progress]), [[0, 'presentation', true]]);
  assert.deepEqual([model.count('author_explanation'), model.count('report_review'), model.count('repair_explanation')], [1, 1, 0]);
});
