import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, sources, evidence, reviewStates, plan } from './c02-block-anatomy.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';

const byId = result => new Map(result.state.objects.map(object => [object.id, object]));
const shown = (objects, id) => objects.get(id).visible && objects.get(id).opacity > 0;

// Independent oracle: Block.forward (model.py:103-106) as six operations, each
// with the tensors it reads and the one it writes. Written from the source,
// not from the card's per-step role tables.
const OPS = [
  { op: 'ln1', reads: ['x'], writes: 'h1' }, // ln_1(x)
  { op: 'attn', reads: ['h1'], writes: 'a' }, // attn(ln_1(x))
  { op: 'plus1', reads: ['x', 'a'], writes: 'xa' }, // x = x + attn(...)
  { op: 'ln2', reads: ['xa'], writes: 'h2' }, // ln_2(x)
  { op: 'mlp', reads: ['h2'], writes: 'm' }, // mlp(ln_2(x))
  { op: 'plus2', reads: ['xa', 'm'], writes: 'out' }, // x = x + mlp(...)
];
const STREAM_TENSORS = ['x', 'xa', 'out'];
// Where each tensor is drawn: its label, and the wire that carries it.
const DRAWN = {
  x: ['lbl-x'], h1: ['lbl-h1', 'wire-h1'], a: ['lbl-a', 'wire-a', 'up-a'], xa: ['lbl-xa'],
  h2: ['lbl-h2', 'wire-h2'], m: ['lbl-m', 'wire-m', 'up-m'], out: ['lbl-out'],
};
const STREAM = ['x-in', 'stream-a', 'plus1', 'stream-b', 'plus2', 'stream-c', 'x-out'];

test('passes every card gate at each of the six steps', () => {
  assert.deepEqual(reviewStates, OPS.map((unused, step) => ({ step })));
  assertCardGates(scene, reviewStates);
  assert.deepEqual(scene.inputs.filter(input => !input.hidden).map(input => `${input.type}:${input.presentation}`), ['index:slider']);
});

test('plan: the approved batch-2 plan, no unreviewed boundary flags', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(plan.boundary.sequence, { name: 'The block and the stack', position: 1, of: 2, relationships: [{ type: 'deepens', card: 'c04-block-stack' }] });
  assert.equal(plan.objective, 'After this card, the learner should understand the recipe one Block applies to x: normalize, attend, add back, normalize, MLP, add back.');
  assert.equal(plan.causalSteps.length, 1 + OPS.length);
});

test('each step lights its operation, what it reads (input) and what it writes (output)', () => {
  const results = assertCardGates(scene, reviewStates).map(byId);
  OPS.forEach(({ op, reads, writes }, step) => {
    const objects = results[step];
    const where = `step ${step + 1}`;
    for (const other of OPS) assert.equal(objects.get(other.op).highlighted, other.op === op, `${where}: ${other.op} highlighted`);
    for (const [tensor, ids] of Object.entries(DRAWN)) {
      const want = tensor === writes ? 'output' : reads.includes(tensor) ? 'input' : 'neutral';
      for (const id of ids) assert.equal(objects.get(id).role, want, `${where}: ${id} (${tensor})`);
    }
    // The taps are the reads from the stream by a LayerNorm.
    assert.equal(objects.get('tap1').role, op === 'ln1' ? 'input' : 'neutral', `${where}: tap1`);
    assert.equal(objects.get('tap2').role, op === 'ln2' ? 'input' : 'neutral', `${where}: tap2`);
    // Captions follow the step; the title names the tensor the step writes.
    assert.equal(objects.get('step-title').label.slice(0, 12), `Step ${step + 1} of 6 `);
    if (op.startsWith('plus')) assert.match(objects.get('step-title').label, { plus1: /· x \+ a: /, plus2: /· x \+ a \+ m: / }[op]);
    assert.equal(objects.get('reads').role, 'input');
    assert.equal(objects.get('writes').role, 'output');
  });
});

test('the residual stream stays lit at every step and only the two adds write it', () => {
  const results = assertCardGates(scene, reviewStates).map(byId);
  const slot = results[0].get('x-in').identitySlot;
  assert.ok(slot, 'the stream carries an identity hue');
  OPS.forEach(({ writes }, step) => {
    const objects = results[step];
    for (const id of STREAM) {
      assert.ok(shown(objects, id), `step ${step + 1}: ${id} drawn`);
      assert.equal(objects.get(id).opacity, 1, `step ${step + 1}: ${id} at full strength`);
      assert.equal(objects.get(id).identitySlot, slot, `step ${step + 1}: ${id} keeps the stream hue`);
    }
    const writesStream = STREAM_TENSORS.includes(writes);
    assert.equal(/\(changed/.test(objects.get('stream-now').label), writesStream, `step ${step + 1}: stream caption says changed only at an add`);
    assert.equal(/\(unchanged\)/.test(objects.get('stream-now').label), !writesStream);
  });
  // Exactly two of the six operations write the stream: the adds.
  assert.deepEqual(OPS.filter(({ writes }) => STREAM_TENSORS.includes(writes)).map(({ op }) => op), ['plus1', 'plus2']);
  assert.equal(results[0].get('takeaway').label, 'Only the two adds (③ and ⑥) write to the residual stream; the other four steps make new tensors off to the side.');
});

// The renderer fits each state's RESOLVED text; the block is sized from the
// static (template) bounds. Same frame at every step, inside the sized block,
// so stepping never refits and never renders below scale 1.
test('the frame never refits across the six steps', () => {
  const box = scene => { const { contributors: _c, ...b } = sceneContentBounds(scene); return b; };
  const frames = assertCardGates(scene, reviewStates).map(result => box(result.scene));
  frames.forEach(frame => assert.deepEqual(frame, frames[0]));
  const { bounds: sized, scale } = sceneLegibility(scene);
  assert.equal(scale, 1);
  assert.ok(frames[0].xMin >= sized.xMin && frames[0].xMax <= sized.xMax && frames[0].yMin >= sized.yMin && frames[0].yMax <= sized.yMax);
});

test('the replay draws the recipe in the source order', () => {
  const firstShown = id => {
    for (let t = 0; t <= scene.duration + 1e-9; t += 0.05) if (shown(byId(evaluated(scene, { step: 0 }, t)), id)) return t;
    return Infinity;
  };
  const times = ['x-in', ...OPS.map(({ op }) => op), 'x-out'].map(firstShown);
  for (let i = 1; i < times.length; i += 1) assert.ok(times[i - 1] < times[i], `replay order at ${i}`);
});

test('source values: B, T, C are the shakespeare_char config, bound from the fixture', () => {
  // Oracle: the literals in config/train_shakespeare_char.py @3adf61e.
  assert.deepEqual([fx.architecture.batch_size, fx.architecture.block_size, fx.architecture.n_embd], [64, 256, 384]);
  assert.deepEqual([scene.exampleData.B, scene.exampleData.T, scene.exampleData.C], [64, 256, 384]);
  for (const inputs of reviewStates) {
    assert.equal(byId(evaluated(scene, inputs)).get('shape').label,
      'Every arrow carries one (B, T, C) tensor - Source value: B = 64, T = 256, C = 384 in shakespeare_char training.');
  }
});

test('sources: well-formed, pinned, status labelled on the card', () => {
  assertSources(sources, scene);
  const cited = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  for (const ref of ['model.py:94-106', 'model.py:104-104', 'model.py:105-105', 'model.py:98-101', 'model.py:180-181', 'config/train_shakespeare_char.py:18-24']) {
    assert.ok(cited.includes(ref), `cites ${ref}`);
  }
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value']);
});

const model = pinnedFile('model.py');
const pinned = sources.filter(s => s.kind === 'code').every(s => pinnedFile(s.path));
test('sources: quoted code is verbatim at the cited lines, and the card\'s recipe is Block.forward', { skip: !pinned && 'pinned NanoGPT cache not present (run generate_fixtures.py)' }, () => {
  for (const { path, lines: [start, end], note } of sources.filter(s => s.kind === 'code')) {
    const cited = pinnedFile(path).slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start}: note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
  assert.equal(model[104 - 1].trim(), 'x = x + self.attn(self.ln_1(x))');
  assert.equal(model[105 - 1].trim(), 'x = x + self.mlp(self.ln_2(x))');
  assert.equal(byId(evaluated(scene, {})).get('recipe').label,
    'One Block, as NanoGPT writes it:  x ← x + attn(ln_1(x)),  then  x ← x + mlp(ln_2(x))');
});

test('evidence record is complete and pinned', () => {
  assertEvidence(evidence);
  assert.equal(evidence.sourceRevision, `karpathy/nanoGPT@${fx.provenance.nanogpt.commit}`);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(evidence.learningQuestion.length <= 95);
});
