// FX-AN-110 (C9, owner): "strip a field that is irrelevant to the object's kind instead of refusing the whole artifact". C7 evidence: `placement` on a NODE (it is a label geometry
// field; aj_2f17bed198df4482b5e2e7e170dcdd31 failed after two repairs on "scene.nodes.9.placement unknown field", and the grid-game regression r01 on scene.nodes.12.placement) and a stray
// top-level `readouts_note` (Gate 1 SGD r20, "readouts_note: unknown field"). The rule is the smallest that is safe: a key the schema does not define, on a node, that the contract defines
// for a label geometry, or a top-level string whose name ends in note(s). Everything else, and every real field, is untouched; each strip is disclosed. Offline, committed shapes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorTool, repairTool } from '../src/agents/animation-author.js';
import { validateStage } from '../src/animation-author.js';
import { animationToolInput, callAnimationRole } from '../src/animation-policy.js';
import { draftOf } from '../src/animation-repair.js';
import { normalizeToolInput } from '../src/tool-input.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';

const golden = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const plan = { ...golden.plan, archetype: 'loss_surface' };
const draft = draftOf(golden.artifact), tool = authorTool(plan);
const NODE = draft.scene.nodes.length - 1; // a node of the committed golden, given the stray label field below
const withStrays = d => ({ ...d, readouts_note: 'The step readout is the number of steps taken.', scene: { ...d.scene, nodes: d.scene.nodes.map((n, i) => (i === NODE ? { ...n, placement: 'above' } : n)) } });
const reply = (role, input, t = tool, stripped) => animationToolInput(role, { content: [{ type: 'tool_use', name: t.name, input }] }, t, stripped);
const job = d => ({ prompt: 'x', plan, planHash: 'a'.repeat(64), resultId: `ar_${'a'.repeat(32)}`, approval: { at: 0 }, draft: d, evidence: [], features: [...ANIMATION_CLIENT_FEATURES], calls: [{ role: 'author', status: 'settled', served: 'claude-opus-5-5' }] });

test('the committed golden is valid, and with the two stray fields the validator refuses it (the C7 failure)', async () => {
  assert.deepEqual((await validateStage(job(draft), { env: {} })).problems ?? [], []);
  const refused = await validateStage(job(withStrays(draft)), { env: {} });
  const text = (refused.problems ?? []).join(' | ');
  assert.match(text, new RegExp(`scene\\.nodes\\.${NODE}\\.placement`));
  assert.match(text, /readouts_note/);
});

test('FX-AN-110: for the author and repair, the stray fields are stripped before validation and every strip is disclosed', async () => {
  const stripped = [];
  const out = reply('author', { kind: 'artifact', artifact: withStrays(draft) }, tool, stripped);
  assert.equal('readouts_note' in out.artifact, false);
  assert.equal('placement' in out.artifact.scene.nodes[NODE], false);
  assert.deepEqual(stripped.map(s => [s.path, s.key]), [[`artifact.scene.nodes.${NODE}`, 'placement'], ['artifact', 'readouts_note']]);
  assert.ok(stripped.every(s => typeof s.why === 'string' && s.why.length > 0));
  assert.deepEqual(out.artifact, draft, 'nothing else changed');
  assert.deepEqual((await validateStage(job(out.artifact), { env: {} })).problems ?? [], [], 'the stripped draft passes');
  // the repair tool's reply has the same shape one level up
  const fixed = [], rep = repairTool({ program: true });
  assert.equal('placement' in reply('repair', { operation: 'artifact', artifact: withStrays(draft) }, rep, fixed).artifact.scene.nodes[NODE], false);
  assert.equal(fixed.length, 2);
  // a string artifact that parses (even after the FX-AN-059 repairs) is stripped too; so is a flattened reply
  const viaString = [];
  assert.equal('readouts_note' in reply('author', { kind: 'artifact', artifact: JSON.stringify(withStrays(draft)) }, tool, viaString).artifact, false);
  assert.equal(viaString.length, 2);
  // A flattened reply (never observed: FX-AN-056 refuted) has no schema under scene, so only its top-level note is reached; a node field inside it meets the validator.
  const flat = [], flattened = reply('author', { kind: 'artifact', ...withStrays(draft) }, tool, flat);
  assert.equal('readouts_note' in flattened, false);
  assert.deepEqual(flat.map(s => s.key), ['readouts_note']);
});

test('FX-AN-110: nothing else is stripped: real fields, other unknown keys, misspellings, shape fields, other roles', async () => {
  const keep = (mutate, why) => {
    const input = { kind: 'artifact', artifact: mutate(structuredClone(draft)) }, stripped = [];
    const out = reply('author', input, tool, stripped);
    assert.deepEqual(out, input, why);
    assert.deepEqual(stripped, [], why);
  };
  keep(d => { d.scene.nodes[NODE].postion = [0, 0, 0]; return d; }, 'a misspelled real field is the author\'s mistake, refused downstream');
  keep(d => { d.scene.nodes[NODE].radius = 0.2; return d; }, 'a shape field on a node would change the drawing if dropped');
  keep(d => { d.scene.nodes[NODE].size = 0.3; return d; }, 'size is a shape field of a box as well as a label hint');
  keep(d => { d.scene.nodes[NODE].text = 'words'; return d; }, 'text');
  keep(d => { d.extra = 'a string that is no note'; return d; }, 'an unknown top-level string');
  keep(d => { d.readouts_note = { a: 1 }; return d; }, 'a note that is not a string');
  keep(d => { d.readouts_note = 'x'.repeat(601); return d; }, 'a note that is not short prose');
  keep(d => { d.scene.nodes[NODE].notes = 'x'; return d; }, 'a note on a node is not the top-level prose key');
  keep(d => { d.scene.geometries[0].placement = 'above'; return d; }, 'placement on a geometry is the schema\'s business, not ours');
  // the review and everything else is read as it came; so is a call that does not opt in
  const out = reply('review', { kind: 'artifact', artifact: withStrays(draft) });
  assert.equal(out.artifact.readouts_note.length > 0, true);
  assert.equal(normalizeToolInput(tool.input_schema, { kind: 'artifact', artifact: withStrays(draft) }).artifact.readouts_note.length > 0, true);
});

test('FX-AN-110: the strip is disclosed in the call result, so a harness and the job can show it', async () => {
  const response = input => new Response(JSON.stringify({ id: 'x', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: tool.name, input }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  const spec = { system: 's', tool, content: 'c' };
  const stripped = await callAnimationRole({}, 'author', spec, { callModel: async () => response({ kind: 'artifact', artifact: withStrays(draft) }) });
  assert.deepEqual(stripped.stripped.map(s => s.key), ['placement', 'readouts_note']);
  assert.equal('readouts_note' in stripped.input.artifact, false);
  const clean = await callAnimationRole({}, 'author', spec, { callModel: async () => response({ kind: 'artifact', artifact: draft }) });
  assert.deepEqual(clean.stripped, []);
});

// In the job: the strip is on the author's call record (diagnostics), beside its usage, so a build that was saved by it says so.
import { animationPipeline } from '../src/animation-job.js';
import { experimentFixture } from '../../web/src/animation3d/fixtures.js';
import { animationStack } from './animation-fixture.js';

test('FX-AN-110 in the job: the author call record lists what was stripped and the draft is kept', async t => {
  const planReply = f => { const { schema: _s, sourceRefs: _r, ...p } = f.plan; return { ...p, requested: { features: [] } }; };
  const d = draftOf(experimentFixture.artifact), strays = { ...d, assumptions_note: 'A note.', scene: { ...d.scene, nodes: d.scene.nodes.map((n, i) => (i === 0 ? { ...n, anchor: 'tip' } : n)) } };
  const s = animationStack(t, { pipeline: animationPipeline, reply: (role) => (role === 'brief' ? planReply(experimentFixture) : role === 'author' ? { kind: 'artifact', artifact: strays } : {}) });
  const { body } = await s.create(); await s.run(body.job.id);
  await s.approve(body.job.id);
  for (let i = 0; i < 6; i++) { await s.actor.alarm(); const j = s.stored(body.job.id); if (j.draft || j.stage === 'failed') break; }
  const job = s.stored(body.job.id), call = job.calls.find(c => c.role === 'author');
  assert.ok(job.draft, JSON.stringify(job.failure));
  assert.equal('assumptions_note' in job.draft, false);
  assert.deepEqual(call.stripped.map(x => [x.path, x.key]), [['artifact.scene.nodes.0', 'anchor'], ['artifact', 'assumptions_note']]);
});
