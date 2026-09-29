import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import tl from '../fixtures/training-loss.generated.js';
import { scene, sources, evidence, reviewStates } from './guided.js';
import { assertCardGates, assertEvidence, assertSources, evaluated } from '../../card-gates.mjs';
import { sceneContentBounds } from '../../../scene-layout.js';
import { textStyle } from '../../../scene-style.js';

const run = fx.toyRun;
const R = tl.recorded;
const [TRAIN, HELD] = R.words;
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const r3 = x => Math.round(x * 1000) / 1000;
// Every number in a text line is printed to 3 decimals, with a true minus sign (± at zero).
const signed = x => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(3)}`;
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const PAIRS = [...TRAIN.targets, ...HELD.targets];
const valR = run.checkpoints.map(c => r3(c.val));
const trainR = run.checkpoints.map(c => r3(c.train));
const BEST = valR.indexOf(Math.min(...valR));
// Frame x 500..860 over p 0..1, y 406..136 over loss 0..9.
const toP = x => (x - 500) / 360;
const toLoss = y => (406 - y) * 9 / 270;

test('guided passes every gate at every reviewed checkpoint', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  const results = assertCardGates(scene, reviewStates);
  // Two controls: when (a slider over the recorded run) and which position to inspect (a picker).
  assert.deepEqual(scene.inputs.map(d => `${d.name}:${d.presentation}`), ['checkpoint:slider', 'focus:picker']);
  assert.deepEqual(scene.exampleData.focusLabels, PAIRS);
  assert.equal(PAIRS[scene.inputs[1].default], 'z→e', 'the Overview’s example is inspected first');
  assert.equal(byId(results[0], 'prerequisites').label.startsWith('Builds on: Overview'), true);
  const shown = results[0].state.objects.filter(o => o.visible && o.label).map(o => o.label).join('\n');
  assert.doesNotMatch(shown, /beginner|intermediate|advanced|expert|newcomer/i);
});

test('fixture relationships: loss = -ln p per position, the curve is -ln p, iteration 0 is an even guess', () => {
  for (const word of [TRAIN, HELD]) {
    assert.equal(word.targets.length, 6);
    // p is stored to 6 decimals and the loss to 4: allow both roundings.
    word.p.forEach((ps, k) => ps.forEach((p, i) => assert.ok(Math.abs(word.loss[k][i] - -Math.log(p)) < 0.6e-6 / p + 6e-5, `${word.word} ${k}/${i}`)));
    word.loss[0].forEach(loss => assert.ok(Math.abs(loss - Math.log(65)) < 0.1, 'untrained: about ln 65'));
  }
  tl.curve.p.forEach((p, i) => assert.ok(Math.abs(tl.curve.loss[i] - -Math.log(p)) < 1e-3));
  assert.ok(Math.abs(R.uniformLoss - Math.log(65)) < 1e-4);
  assert.equal(BEST, run.bestValIndex);
});

test('tables, dots, means and whole-slice readouts match the oracle at every one of the 21 checkpoints', () => {
  const states = R.iterations.map((unused, checkpoint) => ({ checkpoint }));
  const results = assertCardGates(scene, states);
  results.forEach((result, n) => {
    const k = states[n].checkpoint;
    for (const [word, table, prefix, meanId] of [[TRAIN, 'trainTable', 'tr', 'train-mean'], [HELD, 'heldTable', 'ho', 'held-mean']]) {
      const values = byId(result, table).values;
      word.p[k].forEach((p, i) => assert.ok(Math.abs(values[i] - p * 100) < 1e-9, `${table} p% ${i}`));
      assert.deepEqual(values.slice(6), word.loss[k]);
      // Every dot sits on the curve loss = -ln p, at its own position's numbers.
      word.p[k].forEach((p, i) => {
        const dot = byId(result, `${prefix}-dot-${i}`);
        assert.ok(Math.abs(toP(dot.x) - p) < 1e-4, `${prefix} dot ${i} x`);
        assert.ok(Math.abs(toLoss(dot.y) - -Math.log(p)) < 5e-3, `${prefix} dot ${i} on the curve`);
      });
      assert.equal(byId(result, meanId).label, `mean of these 6 losses: ${mean(word.loss[k]).toFixed(3)}`);
    }
    const c = run.checkpoints[k];
    assert.equal(byId(result, 'slices').label,
      `Whole slices at iter ${c.iteration}: train ${trainR[k].toFixed(3)}, held-out (val) ${valR[k].toFixed(3)}, gap (held-out − train) ${(valR[k] - trainR[k]).toFixed(3)}`);
    // A whole-run lookup, said so, even at checkpoints before it.
    assert.equal(byId(result, 'best').label,
      `Lowest held-out loss in the whole run: iter ${run.checkpoints[BEST].iteration} (${valR[BEST].toFixed(3)}). Now versus it: train ${signed(trainR[k] - trainR[BEST])}, held-out ${signed(valR[k] - valR[BEST])}`);
    for (const id of ['slices', 'best', 'train-mean', 'held-mean']) {
      for (const number of byId(result, id).label.match(/\d+\.\d+/g)) assert.match(number, /^\d+\.\d{3}$/, `${id} prints 3 decimals`);
    }
    const regime = k < BEST ? 0 : k === BEST ? 1 : 2;
    assert.equal(byId(result, 'regime').label, scene.exampleData.regimes[regime]);
  });
});

test('inspecting a position links its dot, its drop lines, its two cells and the readout, at every checkpoint', () => {
  const states = R.iterations.flatMap((unused, checkpoint) => PAIRS.map((pair, focus) => ({ checkpoint, focus })));
  const results = assertCardGates(scene, states);
  results.forEach((result, n) => {
    const { checkpoint: k, focus } = states[n];
    const [word, i, prefix, table, other] = focus < 6 ? [TRAIN, focus, 'tr', 'trainTable', 'heldTable'] : [HELD, focus - 6, 'ho', 'heldTable', 'trainTable'];
    const p = word.p[k][i], loss = word.loss[k][i];
    // The inspected dot is the big one; every other dot keeps its size.
    for (const [pre, count] of [['tr', 6], ['ho', 6]]) {
      for (let j = 0; j < count; j += 1) assert.equal(byId(result, `${pre}-dot-${j}`).w, pre === prefix && j === i ? 20 : 12);
    }
    const dot = byId(result, `${prefix}-dot-${i}`);
    // The stage-1 dot sits exactly on the inspected dot, at its size.
    const focusDot = byId(result, 'focus-dot');
    assert.ok(focusDot.x === dot.x && focusDot.y === dot.y && focusDot.w === dot.w && focusDot.role === dot.role);
    // Drop lines from the dot's centre to the x axis (at p) and the y axis (at -ln p).
    const dx = byId(result, 'focus-drop-x'), dy = byId(result, 'focus-drop-y');
    assert.ok(Math.abs(dx.from.x - dot.x) < 0.01 && Math.abs(dx.from.y - dot.y) < 0.01);
    assert.ok(Math.abs(dx.to.x - dot.x) < 0.01 && dx.to.y === 406);
    assert.ok(Math.abs(dy.to.y - dot.y) < 0.01 && dy.to.x === 500);
    assert.ok(Math.abs(toP(dx.to.x) - p) < 1e-4, 'the x drop line lands at p');
    assert.ok(Math.abs(toLoss(dy.to.y) - -Math.log(p)) < 5e-3, 'the y drop line lands at -ln p');
    // Its two cells (p and -ln p) are ringed in its own table only.
    assert.deepEqual(byId(result, table).cellHighlight, [i, i + 6]);
    assert.deepEqual(byId(result, other).cellHighlight, []);
    // The readout: the same two numbers, -ln p as the cell shows it, and the relationship holds.
    const pShown = p.toPrecision(3), pctShown = (Number(pShown) * 100).toPrecision(3);
    assert.equal(byId(result, 'focus').label, `${PAIRS[focus]} at iter ${R.iterations[k]}: p = ${pShown} (${pctShown}%), −ln p = ${loss.toFixed(2)}`);
    assert.ok(Math.abs(-Math.log(Number(pShown)) - loss) < 0.006, 'a learner can check −ln of the shown p against the cell');
    // The percentage is the shown p with its point moved, leading zero kept, and within rounding of the p (%) cell.
    assert.ok(Math.abs(Number(pctShown) - p * 100) <= 0.005 * p * 100 + 1e-12);
    assert.match(pctShown, /^[1-9]|^0\./);
    assert.equal(byId(result, 'focus').role, focus < 6 ? 'input' : 'prediction');
  });
});

// Two headed phases. Phase 1 (What is training minimizing?) in two steps - the
// inspected position's p -> -ln p, then the training word and its mean loss;
// phase 2 (When should training stop?) - its heading, held-out text and the
// checkpoint to keep - only after phase 1 has held for a beat. Each stage is
// fully on screen before the next starts; each step's content is set in quieter
// type, and phase 2 is introduced by its own heading.
test('the replay stages phase 1 in two steps, then phase 2 under its own heading, each step’s content quieter than the one before', () => {
  const dots = prefix => Array.from({ length: 6 }, (unused, i) => `${prefix}-dot-${i}`);
  const stages = [
    ['focus-dot', 'focus-drop-x', 'focus-drop-y', 'focus'],
    ['train-title', 'trainTable', 'train-mean', ...dots('tr')],
    ['phase-2', 'held-title', 'heldTable', 'held-mean', 'slices', 'best', 'regime', ...dots('ho')],
  ];
  const appear = id => scene.timeline.find(e => e.target === id && e.action === 'appear');
  // Phase 1's heading is up from the first frame; phase 2's leads its own content, a beat after phase 1 ends.
  assert.equal(appear('phase-1'), undefined);
  assert.equal(byId({ state: evaluated(scene, {}, 0).state }, 'phase-1').visible, true);
  assert.ok(stages[2].slice(1).every(id => appear(id).at >= appear('phase-2').at + appear('phase-2').duration), 'phase 2’s heading is whole before its content');
  assert.ok(appear('phase-2').at - Math.max(...stages[1].map(id => appear(id).at + appear(id).duration)) >= 0.5, 'phase 1 holds for a beat, longer than a step');
  // The board's default view is the final frame: both phases, whole.
  const last = evaluated(scene, {}, scene.duration).state;
  for (const id of ['phase-1', ...stages.flat()]) assert.ok(byId({ state: last }, id).visible && byId({ state: last }, id).opacity === 1, `final frame: ${id}`);
  const starts = ids => ids.map(id => scene.timeline.find(e => e.target === id && e.action === 'appear').at);
  const ends = ids => ids.map(id => { const e = scene.timeline.find(x => x.target === id && x.action === 'appear'); return e.at + e.duration; });
  stages.forEach((ids, n) => {
    if (n === 0) return;
    const before = Math.min(...starts(ids));
    assert.ok(Math.max(...ends(stages[n - 1])) < before, `stage ${n} is finished before stage ${n + 1} starts`);
    const { state } = evaluated(scene, {}, before - 0.01);
    stages.forEach((other, m) => other.forEach(id => assert.equal(byId({ state }, id).visible, m < n, `t=${before - 0.01}: ${id}`)));
  });
  const size = id => textStyle(scene.objects.find(o => o.id === id).initialState.typography || 'body').fontSize;
  assert.ok(size('focus') >= size('train-mean') && size('train-mean') > size('slices') && size('slices') >= size('held-mean'));
  assert.equal(size('best'), size('slices'));
  assert.ok(size('regime') <= size('slices'));
});

// Each heading sits over its own content down the left column - phase 1's
// training word, then phase 2's held-out word and stopping lines - and the
// chart both phases use sits to the right of the tables.
test('the phase headings group their content down the left column, beside the shared chart', () => {
  const [{ state }] = assertCardGates(scene, [{}]);
  const at = id => byId({ state }, id);
  assert.equal(at('phase-1').label, '1\u00a0\u00a0What is training minimizing?');
  assert.equal(at('phase-2').label, '2\u00a0\u00a0When should training stop?');
  const phase1 = ['train-title', 'trainTable', 'train-mean'];
  const phase2 = ['held-title', 'heldTable', 'held-mean', 'slices', 'best', 'regime'];
  assert.ok(phase1.every(id => at(id).y > at('phase-1').y && at(id).y < at('phase-2').y));
  assert.ok(phase2.every(id => at(id).y > at('phase-2').y && at(id).y < at('status-1').y));
  assert.ok(['phase-1', 'phase-2', 'train-title', 'held-title', 'slices', 'best', 'regime'].every(id => at(id).x === 40), 'one left edge');
  const tablesRight = Math.max(...['trainTable', 'heldTable'].map(id => at(id).x + at(id).cols * at(id).cell));
  assert.ok(at('nll-y-axis').from.x > tablesRight + 80, 'the chart clears the tables');
});

// The camera fits the content's bounds: they must not move between checkpoints
// or positions, or the whole card jumps sideways as the slider moves.
test('the framed content keeps the same bounds at every checkpoint and inspected position', () => {
  const states = R.iterations.flatMap((unused, checkpoint) => PAIRS.map((pair, focus) => ({ checkpoint, focus })));
  const bounds = assertCardGates(scene, states).map(r => JSON.stringify(sceneContentBounds(r.scene)));
  assert.equal(new Set(bounds).size, 1, [...new Set(bounds)].join(' / '));
});

test('the regime captions hold at every checkpoint they can appear at', () => {
  run.checkpoints.forEach((c, k) => {
    if (k < BEST) {
      // "Both losses are still falling here"
      assert.ok(run.checkpoints[k + 1].train < c.train && run.checkpoints[k + 1].val < c.val, `falling after ${c.iteration}`);
    } else if (k > BEST) {
      // "Training loss keeps falling, but held-out loss stays above its lowest"
      assert.ok(c.train < run.checkpoints[k - 1].train, `train falls at ${c.iteration}`);
      assert.ok(c.val > run.checkpoints[BEST].val, `held-out above its lowest at ${c.iteration}`);
    }
  });
  // "no later one scores lower on held-out text"
  assert.ok(run.checkpoints.slice(BEST + 1).every(c => c.val > run.checkpoints[BEST].val));
});

test('the story the card tells is in the data', () => {
  const last = R.iterations.length - 1;
  // The training word's mean loss falls; the held-out word's rises past an even guess after the best checkpoint.
  assert.ok(mean(TRAIN.loss[last]) < mean(TRAIN.loss[1]) && mean(TRAIN.loss[1]) < mean(TRAIN.loss[0]));
  assert.ok(mean(HELD.loss[last]) > mean(HELD.loss[BEST]) && mean(HELD.loss[last]) > Math.log(65));
  // "r→r" (never in the practice text) climbs the wall: the largest loss, above ln 65.
  const rr = HELD.targets.indexOf('r→r');
  assert.equal(HELD.loss[last][rr], Math.max(...HELD.loss[last]));
  assert.ok(HELD.loss[last][rr] > 8 && HELD.loss[last][rr] > HELD.loss[BEST][rr]);
  // The Overview's "z→e" is one of the training word's positions.
  assert.ok(TRAIN.targets.includes('z→e'));
});

// The card's claims about the words, checked against the sha-pinned dataset
// (fetched into the generators' cache by gen_training_loss.py).
test('the words come from the right splits; the steep-wall pairs never occur in the practice text', t => {
  const file = join(tmpdir(), 'nanogpt-fixture-cache', tl.provenance.dataset.sha256);
  if (!existsSync(file)) return t.skip('run gen_training_loss.py once to fetch the pinned dataset');
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), tl.provenance.dataset.sha256);
  const text = bytes.toString('utf8');
  const cut = Math.floor(text.length * 0.9); // prepare.py: data[:int(n*0.9)] / data[int(n*0.9):]
  const practice = text.slice(0, cut).slice(0, run.config.train_chars);
  const heldOut = text.slice(cut).slice(0, run.config.val_chars);
  assert.equal(practice.indexOf(TRAIN.word), TRAIN.at);
  assert.equal(heldOut.indexOf(HELD.word), HELD.at);
  assert.ok(!practice.includes(HELD.word), 'the held-out word is never practised');
  // The two dots that climb the wall are exactly the held-out pairs absent from the practice text.
  const last = R.iterations.length - 1;
  const pairs = [...HELD.word].slice(0, -1).map((a, i) => a + HELD.word[i + 1]);
  const absent = pairs.map((pair, i) => (practice.includes(pair) ? -1 : i)).filter(i => i >= 0);
  assert.deepEqual(absent.map(i => HELD.targets[i]), ['r→r', 'w→,']);
  const ranked = HELD.loss[last].map((loss, i) => [loss, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  assert.deepEqual(ranked.slice(0, 2).sort(), absent.slice().sort());
  // The Overview's "z" is always followed by "e" in the practice text.
  assert.deepEqual([...practice.matchAll(/z(.)/gs)].map(m => m[1]).filter(ch => ch !== 'e'), []);
});

test('sources and evidence', () => {
  assertSources(sources, scene);
  assertEvidence(evidence);
  assert.equal(evidence.depth, 'Guided');
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Recorded toy run', 'Calculated toy example', 'Live calculation']);
  for (const s of sources.filter(s => s.kind === 'calculation' && s.status !== 'Live calculation')) assert.match(s.reproduce, /gen_training_loss\.py --check$/);
  assert.ok(sources.some(s => s.kind === 'dataset'));
});
