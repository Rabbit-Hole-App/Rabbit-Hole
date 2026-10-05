// The current section's materializer (docs/features/adaptive-learning-path-v1-architecture.md §6.5, R5; LP1 Task 9):
// driven with a fake canvas that records every call and a fake post. No React, no network, no Send.
import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeSection } from './learn-journey-materialize.js';
import { indexAfter } from './canvas-slots.js';
import { fixtureFor } from '../../control-plane/src/learn-journey-fixtures.js';

// The keyless stack's own outputs: an 8-section logistic regression path with section 1 current, and section 1's plan
// (three make: { text } steps).
const drafted = fixtureFor('journey_path', { topic: 'logistic regression' });
const registry = drafted.concepts_added;
const path = { ...drafted.path, version: 2, current_section_id: 's1', sections: drafted.path.sections.map(s => (s.id === 's1' ? { ...s, status: 'current' } : s)) };
const [section1, section2] = path.sections;
const plan = fixtureFor('journey_section', { path, section: section1, registry });
const others = path.sections.slice(1);

function fakeCanvas() {
  const calls = [];
  let n = 0;
  return {
    calls,
    inserts: () => calls.filter(c => c[0] === 'insertBlock'),
    reserve: slot => { calls.push(['reserve', slot]); return 'slot:1'; },
    insertBlock: (block, options) => { const id = `b${++n}`; calls.push(['insertBlock', block, options, id]); return id; },
    release: id => { calls.push(['release', id]); },
  };
}
const journeyWith = (done = []) => ({ active_section_id: 's1', path, materialized: async (id, heading) => { done.push([id, heading]); } });
const commandPlan = steps => ({ ...plan, teaching_sequence: steps });
const text = (step_id, body) => ({ step_id, role: 'explanation', make: { text: body }, claims: plan.teaching_sequence[0].claims });
const command = (step_id, cmd, request) => ({ step_id, role: 'interactive_visual', make: { command: cmd, request }, claims: plan.teaching_sequence[0].claims });

test('materializeSection: section 1 current - exactly one heading and three blocks, all stamped section 1, nothing for any other section', async () => {
  const canvas = fakeCanvas(), done = [], posts = [];
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: plan, post: async (...a) => { posts.push(a); return {}; } });
  assert.equal(plan.teaching_sequence.length, 3);
  const inserts = canvas.inserts();
  assert.equal(inserts.length, 4);
  assert.deepEqual(canvas.calls[0], ['reserve', { label: 'Preparing section 1…' }]);
  const [heading, ...blocks] = inserts;
  assert.deepEqual(heading[1], { type: 'heading', level: 1, text: section1.title, done: false, journey_section_id: 's1' });
  assert.deepEqual(heading[2], { into: 'slot:1' }, 'the heading fills the reserved slot');
  assert.deepEqual(blocks.map(b => b[1].type), ['explanation', 'explanation', 'explanation']);
  assert.ok(blocks.every(b => b[1].journey.section_id === section1.id));
  assert.deepEqual(blocks.map(b => b[1].journey.step_id), plan.teaching_sequence.map(s => s.step_id));
  assert.deepEqual(blocks.map(b => b[1].body), plan.teaching_sequence.map(s => s.make.text));
  assert.deepEqual(blocks.map(b => b[1].journey.claims), plan.teaching_sequence.map(s => s.claims));
  // Each step lands right after the one before it, under the heading, whatever the view.
  assert.deepEqual(blocks.map(b => b[2]), [{ after: 'b1' }, { after: 'b2' }, { after: 'b3' }]);
  assert.deepEqual(canvas.calls.at(-1), ['release', 'slot:1']);
  assert.equal(posts.length, 0, 'make: { text } steps make no request');
  assert.deepEqual(done, [['s1', 'b1']], 'section_materialized names the current section and its heading, once');
  assert.deepEqual(out, { heading_block_id: 'b1', block_ids: ['b2', 'b3', 'b4'], proposals: [] });
  // No insertion or post concerns any other section.
  const seen = JSON.stringify([canvas.calls, posts, done]);
  for (const s of others) {
    assert.doesNotMatch(seen, new RegExp(`"${s.id}"`), s.id);
    assert.ok(!seen.includes(s.title), s.title);
  }
});

test('materializeSection: a plan for section 2 while section 1 is current throws before touching the canvas', async () => {
  const canvas = fakeCanvas(), done = [];
  const wrong = fixtureFor('journey_section', { path, section: section2, registry });
  await assert.rejects(materializeSection({ canvas, journey: journeyWith(done), sectionPlan: wrong, post: async () => ({}) }), /current section/);
  await assert.rejects(materializeSection({ canvas, journey: { ...journeyWith(done), active_section_id: null }, sectionPlan: plan, post: async () => ({}) }));
  assert.deepEqual(canvas.calls, []);
  assert.deepEqual(done, []);
});

test('materializeSection: a command step runs the / command route; a paid proposal is reported, never inserted or generated', async () => {
  const canvas = fakeCanvas(), done = [], posts = [];
  const replies = [
    { result: 'artifact', primitive: 'interactive_graph', block: { type: 'graph', title: 'Sigmoid' } },
    { result: 'paid_proposal', primitive: 'maths_animation', message: 'This animation costs credits.', block: { type: 'mathAnimation', title: 'Saturation' } },
  ];
  const steps = [command('graph', 'graph', 'the sigmoid curve'), command('animate', 'animate', 'why the sigmoid saturates'), text('predict', 'What would you predict?')];
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: commandPlan(steps), post: async (...a) => { posts.push(a); return replies.shift(); } });
  assert.deepEqual(posts.map(p => p[0]), ['/api/learn/artifact', '/api/learn/artifact']);
  assert.deepEqual(posts[0][1], { command: 'graph', args: 'the sigmoid curve', context: `Journey section: ${section1.title}` });
  const inserts = canvas.inserts();
  assert.deepEqual(inserts.map(i => i[1].type), ['heading', 'graph', 'explanation'], 'the proposal step inserts nothing');
  assert.deepEqual(inserts[1][1].journey, { section_id: 's1', step_id: 'graph', claims: steps[0].claims }, 'the returned block is stamped');
  assert.deepEqual(inserts[2][2], { after: 'b2' });
  assert.equal(out.proposals.length, 1);
  assert.deepEqual([out.proposals[0].step_id, out.proposals[0].primitive], ['animate', 'maths_animation']);
  assert.equal(out.proposals[0].block.journey.section_id, 's1');
  assert.equal(out.failed_step, undefined);
  assert.deepEqual(done, [['s1', 'b1']]);
});

test('materializeSection: a step that fails stops there, keeps the blocks so far, reports failed_step; resume picks up at that step', async () => {
  const canvas = fakeCanvas(), done = [];
  let calls = 0;
  const steps = [text('frame', 'Where this fits.'), command('graph', 'graph', 'the sigmoid curve'), text('predict', 'What would you predict?')];
  const failing = async () => { calls++; throw new Error('HTTP 502'); };
  const out = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: commandPlan(steps), post: failing });
  assert.equal(calls, 1);
  assert.equal(out.failed_step, 'graph');
  assert.deepEqual(out.block_ids, ['b2']);
  assert.deepEqual(canvas.inserts().map(i => i[1].type), ['heading', 'explanation'], 'the later step is not run');
  assert.deepEqual(canvas.calls.at(-1), ['release', 'slot:1'], 'the slot is given up');
  assert.deepEqual(done, [], 'not materialized: the section is not complete');
  // A result that is not an artifact (a clarification, unsupported, an error) is a failed step too.
  const unsupported = await materializeSection({ canvas: fakeCanvas(), journey: journeyWith([]), sectionPlan: commandPlan(steps), post: async () => ({ result: 'unsupported', message: 'Not yet.' }) });
  assert.equal(unsupported.failed_step, 'graph');
  // Retry: no second heading or slot; the failed step and the ones after it land under the last block kept.
  const resumed = await materializeSection({ canvas, journey: journeyWith(done), sectionPlan: commandPlan(steps), resume: out,
    post: async () => ({ result: 'artifact', block: { type: 'graph', title: 'Sigmoid' } }) });
  const after = canvas.inserts().slice(2);
  assert.deepEqual(after.map(i => [i[1].type, i[1].journey.step_id, i[2]]), [['graph', 'graph', { after: 'b2' }], ['explanation', 'predict', { after: 'b3' }]]);
  assert.equal(canvas.calls.filter(c => c[0] === 'reserve').length, 1);
  assert.deepEqual(resumed, { heading_block_id: 'b1', block_ids: ['b2', 'b3', 'b4'], proposals: [] });
  assert.deepEqual(done, [['s1', 'b1']]);
});

test('materializeSection: progress names each step of the section', async () => {
  const seen = [];
  await materializeSection({ canvas: fakeCanvas(), journey: journeyWith(), sectionPlan: plan, post: async () => ({}), onProgress: p => seen.push(p) });
  assert.deepEqual(seen, [{ step: 1, of: 3 }, { step: 2, of: 3 }, { step: 3, of: 3 }]);
});

test('indexAfter: right after the named block in the flow; the end when it has gone', () => {
  const blocks = ['a', 'b', 'c'].map(id => ({ id }));
  assert.equal(indexAfter(blocks, 'a'), 1);
  assert.equal(indexAfter(blocks, 'b'), 2);
  assert.equal(indexAfter(blocks, 'c'), 3);
  assert.equal(indexAfter(blocks, 'gone'), 3);
  assert.equal(indexAfter([], 'a'), 0);
});

test('AdaptiveCanvas.jsx: insertBlock takes `after` (indexAfter, ignoring the view) and keeps insertAtView for everything else', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(src, /insertBlock: \(block, \{ into = null, after = null \} = \{\}\) => \{/);
  assert.match(src, /if \(after == null\) return insertAtView\(added, into\);/);
  assert.match(src, /indexAfter\(previous, after\)/);
});
