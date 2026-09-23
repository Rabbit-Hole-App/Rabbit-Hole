import { test } from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { assertCardGates, assertEvidence } from '../card-gates.mjs';
import { validateActivity, PREDICATES } from '../../scene-activity.js';
import { scene, activity, evidence } from './c18-train-val.js';

// Independent oracle: plain JS over the fixture, never the scene's own derive graph.
const run = fx.toyRun;
const plotted = run.checkpoints.slice(1);
const r3 = x => Math.round(x * 1000) / 1000;
const signed = x => `${x > 0 ? '+' : ''}${x}`;
const valRounded = plotted.map(c => r3(c.val));
const argmin = xs => xs.reduce((best, x, i) => (x < xs[best] ? i : best), 0);
const BEST = argmin(valRounded);
const FINAL = plotted.length - 1;
const cs = fx.config.shakespeareChar;
const pyBool = b => (b ? 'True' : 'False');
const STATES = [{ checkpoint: 0 }, { checkpoint: BEST }, { checkpoint: FINAL },
  { checkpoint: BEST, bestRevealed: true }, { checkpoint: FINAL, bestRevealed: true }];
const byId = (result, id) => result.state.objects.find(o => o.id === id);
// Frame x 80..880 over iterations 0..1000, y 392..72 over loss 2.0..3.3.
const px = iteration => 80 + iteration * 0.8;
const py = v => 392 - (v - 2.0) * (320 / 1.3);

test('fixture shape the card relies on', () => {
  assert.equal(run.checkpoints[0].iteration, 0);
  assert.equal(plotted.length, 20);
  assert.deepEqual(plotted.map(c => c.iteration), Array.from({ length: 20 }, (u, i) => 50 * (i + 1)));
  assert.equal(run.finalIndex, run.checkpoints.length - 1);
  // bestValIndex (over all 21, incl. iteration 0) minus the skipped iteration-0 offset.
  assert.equal(run.bestValIndex - 1, BEST);
  assert.equal(argmin(plotted.map(c => c.val)), BEST); // same winner before rounding
  assert.notEqual(BEST, FINAL);
});

test('gates pass at every taught state', () => {
  assertCardGates(scene, STATES);
});

test('readout, change line, markers and ring match the oracle at each state', () => {
  const results = assertCardGates(scene, STATES);
  STATES.forEach((inputs, k) => {
    const result = results[k];
    const c = plotted[inputs.checkpoint];
    const train = r3(c.train), val = r3(c.val), gap = r3(val - train);
    assert.equal(byId(result, 'readout').label,
      `Inspected (dark dots) - iteration ${c.iteration}: train ${train}, val ${val}, gap (val - train) ${gap}`);
    // The displayed gap agrees with the recorded (unrounded) losses within the 3 roundings.
    assert.ok(Math.abs(gap - (c.val - c.train)) <= 0.0015);
    // Change line: vs the previous checkpoint (iteration 0 before the first), vs the kept one after reveal.
    const ref = inputs.bestRevealed ? plotted[BEST] : run.checkpoints[inputs.checkpoint];
    const name = inputs.bestRevealed ? 'Change vs the kept checkpoint' : 'Change since the previous checkpoint';
    assert.equal(byId(result, 'change').label,
      `${name} (iter ${ref.iteration}): train ${signed(r3(train - r3(ref.train)))}, val ${signed(r3(val - r3(ref.val)))}`);
    // Markers sit on the plotted points.
    assert.ok(Math.abs(byId(result, 'train-mark').x - px(c.iteration)) < 0.01);
    assert.ok(Math.abs(byId(result, 'val-mark').x - px(c.iteration)) < 0.01);
    assert.ok(Math.abs(byId(result, 'train-mark').y - py(train)) < 0.01);
    assert.ok(Math.abs(byId(result, 'val-mark').y - py(val)) < 0.01);
    assert.ok(byId(result, 'train-mark').y > byId(result, 'val-mark').y, 'train below val on screen');
    const ring = byId(result, 'best-ring');
    if (inputs.bestRevealed) {
      assert.equal(ring.visible, true);
      assert.ok(Math.abs(ring.x - px(plotted[BEST].iteration)) < 0.01);
      assert.ok(Math.abs(ring.y - py(valRounded[BEST])) < 0.01, 'ring on the validation curve');
      assert.match(byId(result, 'status').label, /^Green ring = target/);
    } else {
      // Nothing marks the winner before a committed attempt.
      assert.equal(ring.visible, false);
      assert.match(byId(result, 'status').label, /^Nothing marks/);
    }
  });
  // The lesson at a glance: at the final checkpoint, vs the kept one, train fell and val rose.
  assert.match(byId(results[4], 'change').label, /train -\d.*val \+\d/);
});

test('provenance lines say what is toy, live and source', () => {
  const [result] = assertCardGates(scene, [STATES[0]]);
  const prov = ['prov-1', 'prov-2', 'prov-3', 'prov-4'].map(id => byId(result, id).label).join(' ');
  assert.match(prov, /Recorded toy run/);
  assert.match(prov, /NOT NanoGPT's transformer/);
  assert.match(prov, /Live calculation/);
  assert.ok(prov.includes(`Source @${fx.provenance.nanogpt.commit.slice(0, 7)}`));
  assert.ok(prov.includes(`every ${run.config.eval_interval} iters`));
  assert.match(prov, /estimate_loss, train\.py:216-228/);
  // shakespeare_char's save flag and eval cadence, bound from fx.config (source).
  assert.ok(prov.includes(`always_save_checkpoint - ${pyBool(cs.always_save_checkpoint)} in train_shakespeare_char.py:10`));
  assert.ok(prov.includes(`which evals every ${cs.eval_interval} (:5)`));
  assert.match(byId(result, 'initial-loss').label, new RegExp(`^Off the chart - ${run.initialLossNote.replace(/[()]/g, '\\$&')}$`));
});

test('final checkpoint: lower train, higher val than the best', () => {
  const best = plotted[BEST], final = plotted[FINAL];
  assert.ok(final.train < best.train);
  assert.ok(final.val > best.val);
});

test('practice activity', () => {
  validateActivity(activity);
  assert.equal(activity.expected, BEST);
  assert.equal(activity.answer.of, 'checkpointLabels');
  // The naive anchor the learner actually sees is the Explore slider's default.
  assert.equal(scene.inputs.find(i => i.name === 'checkpoint').default, FINAL);
  assert.deepEqual(scene.exampleData.checkpointLabels, plotted.map(c => `iter ${c.iteration}`));
  assert.equal(activity.revealInput, 'bestRevealed');
  assert.ok(scene.inputs.find(i => i.name === 'bestRevealed').hidden);
  assert.equal(PREDICATES.index_equals({ answer: BEST }, activity), true);
  assert.equal(PREDICATES.index_equals({ answer: FINAL }, activity), false);
  // The task is the save rule at THIS run's evaluations, not the whole config.
  assert.match(activity.prompt, /train\.py:274/);
  assert.ok(activity.prompt.includes(`every ${run.config.eval_interval} iterations`));
  assert.ok(activity.prompt.includes(`always_save_checkpoint = ${pyBool(cs.always_save_checkpoint)}, as in shakespeare_char`));
  assert.ok(activity.feedbackPass.includes(`evaluates every ${cs.eval_interval} iterations`));
  // Feedback prints the same 3-decimal numbers as the readout.
  const best = plotted[BEST], final = plotted[FINAL];
  for (const text of [activity.feedbackPass, activity.feedbackFail]) {
    for (const x of [best.val, final.train, best.train, final.val]) assert.ok(text.includes(String(r3(x))), `${r3(x)} in feedback`);
    assert.doesNotMatch(text, /\d\.\d{4}/, 'no 4-decimal losses in feedback');
  }
  assert.ok(activity.feedbackFail.includes(`iter ${best.iteration}`), 'fail names the kept checkpoint');
  // No timeline appear on the reveal-gated ring (it would override the derived opacity).
  assert.ok(!scene.timeline.some(e => e.target === 'best-ring'));
});

test('evidence', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
  assert.ok(evidence.concept.includes(`always_save_checkpoint = ${pyBool(cs.always_save_checkpoint)}`));
  assert.ok(evidence.concept.includes(`eval_interval is ${cs.eval_interval} (config:5)`));
  // Source settings really are the char config's; toy choices are named as toy.
  const [sourcePart, toyPart] = evidence.provenance.split('Toy-scale choices, not source:');
  for (const k of run.configFromSource.keys) {
    assert.equal(run.config[k], cs[k], `${k} read from shakespeare_char`);
    assert.ok(sourcePart.includes(`${k} ${run.config[k]}`), `${k} named as source`);
  }
  assert.ok(sourcePart.includes(run.configFromSource.from));
  for (const k of run.configToyChoices) assert.ok(toyPart.includes(`${k} ${run.config[k]}`), `${k} named as toy`);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
});
