import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, evidence } from './c21-temperature.js';
import { assertCardGates, assertEvidence } from '../card-gates.mjs';

const T = fx.temperature;
const presets = T.presets;
const TAUGHT = [{ temperature: 0 }, { temperature: 2 }, { temperature: 4 }];
const ALL = presets.map((_, i) => ({ temperature: i }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const label = (result, id) => byId(result, id).label;
// Same display mapping the card applies: the space shows as 'sp'.
const shownOf = d => (d === '␣' ? 'sp' : d);
const TOP = T.logits.indexOf(Math.max(...T.logits));
const TOP_NAME = shownOf(T.display[TOP]);
const VOCAB = fx.tokenizer.tokenizers.find(t => t.id === 'char').vocabSize;

// Independent oracle: softmax(logits / T) in plain JS from the fixture's own
// temperature (not its invT), no scene-derive code involved.
const oracle = temp => {
  const z = T.logits.map(x => x / temp);
  const m = Math.max(...z);
  const e = z.map(x => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / s);
};

test('c21-temperature passes every gate at every preset', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.ok(scene.objects[0].initialState.text.length <= 95);
  assertCardGates(scene, ALL);
});

test('live probabilities match the oracle and the fixture at every taught preset', () => {
  for (const inputs of TAUGHT) {
    const [result] = assertCardGates(scene, [inputs]);
    const p = presets[inputs.temperature];
    const where = `T=${p.temperature}`;
    const expected = oracle(p.temperature);
    const live = byId(result, 'probs').values;
    live.forEach((v, i) => {
      assert.ok(Math.abs(v - expected[i]) <= 0.0006, `${where} probs[${i}] ${v} vs oracle ${expected[i]}`);
      assert.ok(Math.abs(v - p.probs[i]) <= 0.0006, `${where} probs[${i}] ${v} vs fixture ${p.probs[i]}`);
    });
    assert.deepEqual(byId(result, 'bars').values, live, `${where} bars show the same probabilities`);
    assert.equal(byId(result, 'bars').peak, 1, 'bars sit on a fixed [0, 1] axis');
    byId(result, 'scaled').values.forEach((v, i) => assert.ok(Math.abs(v - T.logits[i] / p.temperature) < 0.001, `${where} logits/T[${i}]`));
    // Order is preserved: the top token is always the top logit.
    assert.equal(result.derived.topAt, TOP);
    const pTop = result.derived.pTop;
    assert.ok(Math.abs(pTop - expected[TOP]) <= 0.0006, `${where} pTop ${pTop} vs oracle`);
    assert.ok(Math.abs(pTop - p.pTop) <= 0.0006, `${where} pTop ${pTop} vs fixture ${p.pTop}`);
    const pRest = result.derived.pRest;
    assert.ok(Math.abs(pRest - (1 - pTop)) < 1e-9, `${where} pRest = 1 - pTop`);
    assert.ok(Math.abs(pRest - p.pRest) <= 0.0006, `${where} pRest vs fixture`);
    assert.ok(pRest > 0, `${where} the other candidates keep some probability`);
    // The T = 1.0 comparison is plain softmax of the same token.
    const pTopRaw = result.derived.pTopRaw;
    assert.ok(Math.abs(pTopRaw - oracle(1)[TOP]) <= 0.0006, `${where} pTopRaw vs oracle`);
    const word = pTop > pTopRaw ? 'Sharper than' : pTop < pTopRaw ? 'Flatter than' : 'The same as';
    assert.equal(label(result, 'relation'), `${word} plain softmax: p(‘${TOP_NAME}’) is ${pTop} here, ${pTopRaw} at T = 1.0`);
    assert.equal(label(result, 'p-top'), `p(top token ‘${TOP_NAME}’) = ${pTop}   (the ‘${TOP_NAME}’ probability cell)`);
    assert.equal(label(result, 'p-rest'), `the other ${T.display.length - 1} together = 1 − p(top) = ${pRest}, still above 0`);
    assert.equal(label(result, 't-readout'), `Selected preset: ${p.label}`);
    // Expected top count = draws x p(top), against the fixture's own p(top).
    assert.ok(Math.abs(result.derived.expected - T.draws * p.pTop) <= 1e-2, `${where} expected ${result.derived.expected} vs ${T.draws * p.pTop}`);
    assert.equal(label(result, 'expected'), `expected about ${result.derived.expected} (= 20 × p(top))`);
    // Recorded toy draws: the token rows are exactly the fixture's 20 draws
    // (space shown as 'sp'), and the counts are what those draws contain.
    const shown = [...byId(result, 'draws-a').tokens, ...byId(result, 'draws-b').tokens];
    assert.deepEqual(shown, p.drawn.map(shownOf));
    const topCount = p.drawn.filter(d => d === T.display[TOP]).length;
    assert.equal(topCount, p.drawnTop);
    assert.equal(label(result, 'draw-count'), `${topCount} of 20 draws were the top token ‘${TOP_NAME}’`);
    assert.equal(label(result, 'not-greedy'), `${20 - topCount} of 20 recorded draws were not ‘${TOP_NAME}’, drawn from these toy probabilities.`);
    assert.equal(label(result, 'draws-a'), `20 recorded toy draws at ${p.label}: seeded random.choices in generate_fixtures.py, not NanoGPT`);
    const bold = [...byId(result, 'draws-a').cellHighlight.map(i => shown[i]), ...byId(result, 'draws-b').cellHighlight.map(i => shown[10 + i])];
    assert.ok(bold.every(d => d !== TOP_NAME) && bold.length === 20 - topCount, `${where} bold marks exactly the non-top draws`);
  }
});

test('sharper vs flatter, and a low T is still not greedy', () => {
  const [low, mid, high] = assertCardGates(scene, TAUGHT);
  assert.ok(low.derived.pTop > mid.derived.pTop && mid.derived.pTop > high.derived.pTop);
  assert.match(label(low, 'relation'), /^Sharper than plain softmax/);
  assert.match(label(mid, 'relation'), /^The same as plain softmax/);
  assert.match(label(high, 'relation'), /^Flatter than plain softmax/);
  // The correction the card exists for: at the lowest preset the other five
  // still share probability, and one recorded draw is not the top token.
  assert.ok(low.derived.pRest > 0);
  assert.equal(low.derived.nonTop, 1);
  assert.equal(label(low, 'not-greedy'), `1 of 20 recorded draws were not ‘${TOP_NAME}’, drawn from these toy probabilities.`);
  assert.equal(label(low, 'not-greedy-2'), `At T = 0.25 the other 5 still share ${low.derived.pRest} of the probability, so a draw can land on them.`);
  assert.equal(label(low, 'not-greedy-3'), `So a low positive T is sharper, not greedy: greedy (argmax) would pick ‘${TOP_NAME}’ every time.`);
  assert.ok(presets.every(p => p.temperature > 0), 'positive temperatures only');
});

test('source quotes and provenance wording stay on the card', () => {
  const [result] = assertCardGates(scene, [{ temperature: 2 }]);
  // Verbatim NanoGPT @3adf61e lines (checked against the pinned files).
  assert.equal(label(result, 'src-318'), 'model.py:318  logits = logits[:, -1, :] / temperature');
  assert.equal(label(result, 'src-324'), 'model.py:324  probs = F.softmax(logits, dim=-1)');
  assert.equal(label(result, 'src-326'), 'model.py:326  idx_next = torch.multinomial(probs, num_samples=1)');
  assert.equal(label(result, 'src-17'), 'sample.py:17  temperature = 0.8 # 1.0 = no change, < 1.0 = less random, > 1.0 = more random');
  assert.match(label(result, 'source-head'), /^source: NanoGPT @3adf61e/);
  assert.match(label(result, 'provenance-note'), /calculated toy example \(generate_fixtures\.py\), not NanoGPT output/);
  assert.match(label(result, 'live-note'), /live calculation in this card/);
  assert.match(label(result, 'draws-a'), /recorded toy draws .*not NanoGPT$/);
  assert.equal(label(result, 'vocab-note'), `The real shakespeare_char softmax covers all ${VOCAB} characters. sp = the space character.`);
  assert.match(label(result, 'zero-note'), /^A \.00 cell is rounded, not zero/);
  assert.equal(label(result, 'multinomial'), 'generate() always draws with torch.multinomial (model.py:326), never argmax.');
  assert.match(label(result, 'wobble'), /counts vary run to run/);
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
});
