import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, evidence, sources } from './c16-cross-entropy.js';
import { assertCardGates, assertEvidence, assertSources } from '../card-gates.mjs';

const CE = fx.crossEntropy;
const STATES = [{ prediction: 0 }, { prediction: 1 }, { prediction: 2 }];
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const authored = id => scene.objects.find(object => object.id === id).initialState;
// Independent oracle: plain-JS softmax at full precision.
const softmax = logits => {
  const m = Math.max(...logits);
  const e = logits.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
};
const argmax = v => v.indexOf(Math.max(...v));
// Bar geometry as AnimatedScene.jsx draws it: a bar is (h - 4) * value / peak
// tall above the baseline y + h - read from the authored objects, not the module.
const barTop = (id, value) => {
  const bars = authored(id);
  return bars.y + bars.h - ((bars.h - 4) * value) / bars.peak;
};
const UNIFORM_P = 1 / CE.vocab.length;

test('c16 passes every gate at every preset; question first and short', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assertCardGates(scene, STATES);
});

test('fixture relationships: probs = softmax(logits), loss = -ln p(target), uniform = ln 65', () => {
  assert.equal(fx.architecture.vocab_size, 65);
  assert.ok(Math.abs(CE.uniform65 - Math.log(65)) < 1e-4);
  for (const preset of CE.presets) {
    const p = softmax(preset.logits);
    p.forEach((v, i) => assert.ok(Math.abs(v - preset.probs[i]) < 1e-4, `${preset.id} p[${i}]`));
    assert.ok(Math.abs(preset.loss - -Math.log(p[CE.target])) < 1e-4, `${preset.id} loss vs full-precision -ln p`);
    assert.ok(Math.abs(preset.loss - -Math.log(preset.pTarget)) < 5e-3, `${preset.id} loss vs -ln(rounded pTarget)`);
    assert.equal(preset.top, argmax(p));
    assert.equal(preset.topIsTarget, argmax(p) === CE.target);
  }
});

test('displayed numbers match the oracle at every preset', () => {
  const results = assertCardGates(scene, STATES);
  const top0 = argmax(softmax(CE.presets[0].logits));
  results.forEach((result, k) => {
    const preset = CE.presets[k];
    const p = softmax(preset.logits);
    const where = preset.id;
    // live softmax == fixture probs (tolerance), on bars and cells alike
    for (const id of ['prob-bars', 'prob-cells']) {
      byId(result, id).values.forEach((v, i) => assert.ok(Math.abs(v - preset.probs[i]) < 1e-3, `${where} ${id}[${i}]`));
    }
    assert.deepEqual(byId(result, 'logits').values, preset.logits);
    const top = argmax(p);
    // model's top choice lights the bar; the green target stripe sits under the target's p cell
    assert.equal(byId(result, 'prob-bars').cellHighlight, top);
    const cells = byId(result, 'prob-cells');
    const stripe = byId(result, 'target-stripe');
    assert.equal(stripe.x + stripe.w / 2, cells.x + CE.target * cells.cell + cells.cell / 2);
    assert.ok(stripe.y > cells.y + cells.cell && stripe.y < byId(result, 'target-mark').y - 15);
    const centre = i => 40 + i * 56 + 28;
    assert.equal(byId(result, 'top-mark').x, centre(top) - 5);
    assert.ok(Math.abs(byId(result, 'top-mark').y - (barTop('prob-bars', p[top]) - 12)) < 0.2, `${where} top-mark y`);
    assert.equal(byId(result, 'target-mark').x, centre(CE.target) - 5);
    const verdict = top === CE.target ? 'correct' : 'incorrect';
    assert.equal(byId(result, 'top-readout').label, `▼ model's top choice: '${CE.vocab[top]}' (${verdict})`);
    const pShown = Math.round(p[CE.target] * 1000) / 1000;
    assert.equal(byId(result, 'p-readout').label, `▲ p(target 'k') = ${pShown}`);
    const lossShown = preset.loss.toFixed(2);
    assert.equal(byId(result, 'loss-readout').label, `loss at this position = −ln p(target) = ${lossShown}`);
    // the shown loss agrees with -ln(the shown p) at the printed precision
    assert.equal((-Math.log(pShown)).toFixed(2), lossShown, `${where} -ln(${pShown})`);
    assert.equal(byId(result, 'preset-name').label, `Selected preset: ${preset.label}`);

    // toy uniform guess: p = 1/5 as a line on the probability bars
    assert.equal(byId(result, 'uniform-label-2').label, `p = 1/${CE.vocab.length} = ${UNIFORM_P} (live)`);
    const uniformLine = byId(result, 'uniform-line');
    assert.ok(Math.abs(uniformLine.from.y - barTop('prob-bars', UNIFORM_P)) < 0.01);
    assert.equal(uniformLine.from.y, uniformLine.to.y);
    // NanoGPT-scale anchor, stated apart from the toy
    assert.ok(byId(result, 'uniform65-note').label.endsWith(`ln 65 = ${Math.log(65).toFixed(2)}.`));

    // loss-by-preset rows: every preset visible, ▶ on the selected row
    assert.equal(byId(result, 'selected-row').y, byId(result, `preset-name-${k}`).y);
    CE.presets.forEach((c, j) => {
      assert.equal(byId(result, `preset-name-${j}`).label, c.label);
      assert.equal(byId(result, `loss-value-${j}`).label, c.loss.toFixed(2));
      const bar = byId(result, `loss-bar-${j}`);
      const px = byId(result, 'loss-bar-2').w / CE.presets[2].loss; // one shared nat scale
      assert.ok(Math.abs(bar.w - c.loss * px) < 0.01, `loss-bar-${j} w`);
      const tj = argmax(softmax(c.logits));
      assert.equal(byId(result, `preset-top-${j}`).label, `▼ '${CE.vocab[tj]}' (${tj === CE.target ? 'correct' : 'incorrect'})`);
    });

    // state-following captions: the one shown is this preset's, and its verdict holds
    const a = byId(result, 'insight-a').label;
    const b = byId(result, 'insight-b').label;
    assert.equal(a, scene.exampleData.insightsA[k]);
    assert.equal(b, scene.exampleData.insightsB[k]);
    assert.equal(a.startsWith('Wrong'), top !== CE.target, `${where} verdict word`);
    assert.equal(a.startsWith('Right') || a.includes('same accuracy'), top === CE.target, `${where} right word`);
    assert.equal(a.includes('Same top choice'), k !== 0 && top === top0, `${where} same-top claim`);
    assert.equal(a.includes('below the uniform'), p[CE.target] < UNIFORM_P, `${where} below-uniform claim`);
    const losses = CE.presets.map(c => -Math.log(softmax(c.logits)[CE.target]));
    assert.equal(b.includes('largest loss'), losses[k] === Math.max(...losses), `${where} largest claim`);
    assert.equal(b.includes('worse than guessing'), losses[k] > Math.log(CE.vocab.length), `${where} worse-than-guessing claim`);
  });
});

test('the card\'s comparative captions hold in the fixture', () => {
  const [a, b, c] = CE.presets;
  // presets 0 and 1: same top-1 (same accuracy), very different loss
  assert.equal(a.top, b.top);
  assert.equal(a.top, CE.target);
  assert.ok(b.pTarget < a.pTarget / 2);
  assert.ok(b.loss > 5 * a.loss);
  // preset 2: wrong, the costliest, and p(target) below the toy's uniform 1/5
  assert.notEqual(c.top, CE.target);
  assert.ok(c.loss > b.loss && c.loss > a.loss);
  assert.ok(c.pTarget < UNIFORM_P && a.pTarget > UNIFORM_P && b.pTarget > UNIFORM_P);
});

// Every line the card used to cite is now a source entry (quotes checked
// against the pinned files below); the card keeps the maths and status labels.
test('sources: provenance lives under the card, not on it', () => {
  assertSources(sources, scene);
  const at = (path, a, b) => sources.find(s => s.kind === 'code' && s.path === path && s.lines[0] === a && s.lines[1] === b);
  assert.ok(at('model.py', 187, 187).note.includes('loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)'));
  assert.ok(at('data/shakespeare_char/prepare.py', 24, 25).note.includes('chars = sorted(list(set(data)))'));
  assert.ok(at('model.py', 111, 111).note.includes('vocab_size: int = 50304'));
  assert.ok(at('train.py', 155, 155));
  assert.ok(sources.some(s => s.kind === 'dataset'));
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'Live calculation']);
  assert.ok(sources.find(s => s.status === 'Calculated toy example').note.includes(`ln 65 = ${CE.uniform65}`));
  const [first] = assertCardGates(scene, [{ prediction: 0 }]);
  assert.equal(first.state.objects.find(o => o.id === 'average-note').label,
    "NanoGPT's training loss is the mean of this −ln p(target) over every position in the batch.");
});

// The sha256-pinned NanoGPT files generate_fixtures.py caches; the line check
// is skipped where that cache is absent.
const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = sha && join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!file || !existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};

test('sources: what each code entry quotes is inside its cited lines', () => {
  for (const { path, lines: [start, end], note } of sources.filter(s => s.kind === 'code')) {
    const quotes = [...note.matchAll(/“([^”]+)”/g)].map(m => m[1]);
    assert.ok(quotes.length, `${path}:${start}-${end} quotes its line`);
    const file = cached(path);
    if (!file) continue;
    const cited = file.slice(start - 1, end).join('\n');
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} contains "${quote}"`);
  }
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
});
