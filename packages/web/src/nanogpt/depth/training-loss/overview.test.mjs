import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tl from '../fixtures/training-loss.generated.js';
import { scene, sources, evidence, reviewStates } from './overview.js';
import { assertCardGates, assertEvidence, assertSources } from '../../card-gates.mjs';
import { sceneContentBounds } from '../../../scene-layout.js';

const O = tl.recorded.overview;
const run = fx.toyRun;
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const authored = id => scene.objects.find(object => object.id === id).initialState;
const pct = p => (p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);
const avgAt = k => run.checkpoints.find(c => c.iteration === O.stops[k].iteration).train;

test('overview passes every gate at every stop; one discrete control, no symbols', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.deepEqual(reviewStates, O.stops.map((unused, stop) => ({ stop })), 'all four configurations reviewed');
  const results = assertCardGates(scene, reviewStates);
  assert.equal(scene.inputs.length, 1);
  assert.equal(scene.inputs[0].type, 'index');
  assert.equal(scene.inputs[0].presentation, 'picker');
  assert.ok(!scene.objects.some(o => o.type === 'equation' || o.type === 'code'));
  const [first] = results;
  assert.equal(byId(first, 'prerequisites').label, 'No prerequisites.');
  const shown = first.state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
  assert.doesNotMatch(shown, /beginner|intermediate|advanced|expert|newcomer/i);
  assert.doesNotMatch(shown, /\(\s*[A-Z]\s*,/, 'no tensor shapes');
  assert.doesNotMatch(shown, /−ln|softmax|\bln\b|Σ|∑/, 'no formulas');
});

test('the recorded guesses: 65 shares that sum to 1, the loss is -ln of the share on "e"', () => {
  assert.equal(O.vocab.length, fx.architecture.vocab_size);
  assert.equal(O.vocab[O.targetIndex], 'e');
  assert.equal(O.context.slice(-1), O.previous);
  assert.deepEqual(tl.recorded.iterations, run.checkpoints.map(c => c.iteration), 'same recorded run as fx.toyRun');
  for (const s of O.stops) {
    assert.equal(s.probs.length, 65);
    assert.ok(Math.abs(s.probs.reduce((a, b) => a + b, 0) - 1) < 0.002, `iter ${s.iteration} sums to 1`);
    assert.equal(s.pTarget, s.probs[O.targetIndex]);
    assert.ok(Math.abs(s.loss - -Math.log(s.pTarget)) < 5e-3, `iter ${s.iteration} loss = -ln p`);
  }
  // Same source truth as the Guided card: its "z→e" position at the same checkpoints.
  const citizen = tl.recorded.words[0];
  const ze = citizen.targets.indexOf('z→e');
  for (const s of O.stops) {
    const k = tl.recorded.iterations.indexOf(s.iteration);
    assert.equal(citizen.loss[k][ze], s.loss);
  }
});

test('displayed numbers and positions match the oracle at every stop', () => {
  const results = assertCardGates(scene, reviewStates);
  const bars = authored('guess');
  const barTop = p => bars.y + bars.h - (bars.h - 4) * p / bars.peak;
  results.forEach((result, k) => {
    const s = O.stops[k];
    assert.deepEqual(byId(result, 'guess').values, s.probs);
    assert.equal(byId(result, 'guess').cellHighlight, O.targetIndex);
    // The same guess as two piles, and the two percentages add to 100.
    const piles = byId(result, 'piles').values;
    assert.equal(piles[0], s.pTarget);
    assert.ok(Math.abs(piles[0] + piles[1] - 1) < 1e-9);
    assert.equal(Math.round(piles[0] * 100) + Math.round(piles[1] * 100), 100);
    assert.equal(byId(result, 'target-mark').label, `▼ “e”, the right letter: ${pct(s.pTarget)}`);
    // The flat carpet is too low to see, so before practice a note gives its range; the "e" share is inside it.
    const lo = Math.min(...s.probs), hi = Math.max(...s.probs);
    assert.equal(byId(result, 'flat-note').visible, k === 0);
    if (k === 0) {
      assert.equal(byId(result, 'flat-note').label, `↓ all 65 bars are this low: ${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}% each`);
      assert.ok(lo <= s.pTarget && s.pTarget <= hi);
      assert.ok((bars.h - 4) * hi < 3, 'the carpet really is under 3px tall');
    }
    assert.ok(Math.abs(byId(result, 'target-mark').y - (barTop(s.pTarget) - 12)) < 0.01, 'mark rides the "e" bar');
    assert.equal(byId(result, 'target-mark').x, bars.x + O.targetIndex * bars.cell + bars.cell / 2 - 5);
    assert.equal(byId(result, 'loss-here').label,
      `Loss on this guess: ${(-Math.log(s.pTarget)).toFixed(2)}, the model’s surprise at “e” (the smaller its share, the bigger the loss)`);
    const stopLabel = s.iteration === 0 ? 'before practice' : `after ${s.iteration.toLocaleString('en-US')} steps`;
    assert.equal(byId(result, 'avg-readout').label, `Average loss ${stopLabel}: ${avgAt(k).toFixed(2)}`);
    // Dot on the average-loss curve: frame x 90..510 over 0..1000, y 500..390 over 2.0..4.4.
    const dot = byId(result, 'avg-dot');
    assert.ok(Math.abs(dot.x - (90 + s.iteration * 0.42)) < 0.01);
    assert.ok(Math.abs(dot.y - (500 - (avgAt(k) - 2) * 110 / 2.4)) < 0.01);
    // The curve is drawn only up to this stop, ending at the dot: the rest of the run stays unseen.
    const at = run.checkpoints.findIndex(c => c.iteration === s.iteration);
    run.checkpoints.slice(1).forEach((unused, i) => assert.equal(byId(result, `avg-seg-${i}`).visible, i < at, `stop ${k}: segment ${i}`));
    if (at > 0) {
      const end = byId(result, `avg-seg-${at - 1}`).to;
      assert.ok(Math.abs(end.x - dot.x) < 0.01 && Math.abs(end.y - dot.y) < 0.01, 'the drawn curve ends at the dot');
    }
  });
});

test('each caption is true at its stop', () => {
  const results = assertCardGates(scene, reviewStates);
  const [s0, s1, s2, s3] = O.stops;
  const captions = results.map(r => `${byId(r, 'caption-a').label} ${byId(r, 'caption-b').label}`);
  // 0: every character has the same small share (all within 10% of 1/65); the right one is a long shot.
  assert.match(captions[0], /about the same small share/);
  assert.ok(s0.probs.every(p => Math.abs(p - 1 / 65) < 0.1 / 65));
  // 50: the share piled onto "e" and both losses dropped.
  assert.match(captions[1], /After 50 steps/);
  assert.ok(s1.pTarget > 20 * s0.pTarget && s1.loss < s0.loss && avgAt(1) < avgAt(0));
  // 200: more share, lower loss; the average falls only slowly (far less than in the first 50 steps).
  assert.match(captions[2], /After 200 steps/);
  assert.ok(s2.pTarget > s1.pTarget && s2.loss < s1.loss && avgAt(2) < avgAt(1));
  assert.ok(avgAt(1) - avgAt(2) < (avgAt(0) - avgAt(1)) / 5);
  // 1000: "e" is almost certain here, and the average stays higher than this guess's loss.
  assert.match(captions[3], /almost certain after 1,000 steps/);
  assert.ok(s3.pTarget > 0.95 && avgAt(3) > s3.loss);
});

// The camera fits the content's bounds: they must not move between stops, or
// the whole card jumps sideways when the learner clicks another stop.
test('the framed content keeps the same bounds at every stop', () => {
  const bounds = assertCardGates(scene, reviewStates).map(r => JSON.stringify(sceneContentBounds(r.scene)));
  assert.equal(new Set(bounds).size, 1, bounds.join(' / '));
});

test('sources and evidence', () => {
  assertSources(sources, scene);
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Overview');
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Recorded toy run']);
  assert.match(sources[0].reproduce, /gen_training_loss\.py --check$/);
  assert.ok(sources.find(s => s.path === 'model.py').note.includes('F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)'));
});
