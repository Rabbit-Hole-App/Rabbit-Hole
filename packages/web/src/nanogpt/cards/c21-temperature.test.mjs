import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { scene, evidence, sources } from './c21-temperature.js';
import { assertCardGates, assertEvidence, assertSources } from '../card-gates.mjs';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { distributeRounding } from '../../scene-derive.js';
import { formatCell } from '../../scene-format.js';

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
// What a grid's cells print, by the renderer's rule (as c22's test reads it).
const shownCells = object => (object.distribution ? distributeRounding(object.values, 2) : object.values).map(v => (v === null ? '' : formatCell(v)));
// The readouts print p to 4 decimals; the fixture's p(top) and 1 - p(top) are stored to 4.
const four = v => v.toFixed(4);
const RAW = presets.findIndex(p => p.temperature === 1);

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
  // The count block beside the token rows clears the widest row at every preset.
  for (const result of assertCardGates(scene, ALL)) {
    const rowsEnd = Math.max(...['draws-a', 'draws-b'].map(id => byId(result, id).x + byId(result, id).w));
    for (const id of ['draw-count', 'draw-count-2', 'expected', 'wobble', 'bold-key']) assert.ok(byId(result, id).x >= rowsEnd + 16, `${id} clears the token rows (${rowsEnd})`);
  }
});

// The block is sized from the static (template) bounds; each preset's resolved
// text fits inside it, so switching presets never refits or drops below scale 1.
test('the frame never refits across presets and renders at scale 1', () => {
  const box = scene => { const { contributors: _c, ...b } = sceneContentBounds(scene); return b; };
  const frames = assertCardGates(scene, ALL).map(result => box(result.scene));
  frames.forEach(frame => assert.deepEqual(frame, frames[0]));
  const { bounds: sized, scale } = sceneLegibility(scene);
  assert.equal(scale, 1);
  assert.ok(frames[0].xMin >= sized.xMin && frames[0].xMax <= sized.xMax && frames[0].yMin >= sized.yMin && frames[0].yMax <= sized.yMax);
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
    assert.equal(label(result, 'relation'), `${word} plain softmax: p(‘${TOP_NAME}’) is ${four(p.pTop)} here, ${four(presets[RAW].pTop)} at T = 1.0`);
    assert.equal(label(result, 'p-top'), `p(top token ‘${TOP_NAME}’) = ${four(p.pTop)}   (the ‘${TOP_NAME}’ probability cell)`);
    assert.equal(label(result, 'p-rest'), `the other ${T.display.length - 1} together = 1 − p(top) = ${four(p.pRest)}, still above 0`);
    assert.equal(label(result, 't-readout'), `Selected preset: ${p.label}`);
    // Expected top count = draws x the printed p(top) (the fixture's own, to 4 decimals).
    assert.ok(Math.abs(result.derived.expected - T.draws * p.pTop) < 1e-9, `${where} expected ${result.derived.expected} vs ${T.draws * p.pTop}`);
    assert.equal(label(result, 'expected'), `expected about ${result.derived.expected} (= 20 × p(top))`);
    // Recorded toy draws: the token rows are exactly the fixture's 20 draws
    // (space shown as 'sp'), and the counts are what those draws contain.
    const shown = [...byId(result, 'draws-a').tokens, ...byId(result, 'draws-b').tokens];
    assert.deepEqual(shown, p.drawn.map(shownOf));
    const topCount = p.drawn.filter(d => d === T.display[TOP]).length;
    assert.equal(topCount, p.drawnTop);
    // One sentence, wrapped onto two lines.
    assert.equal(`${label(result, 'draw-count')} ${label(result, 'draw-count-2')}`, `${topCount} of 20 draws were the top token ‘${TOP_NAME}’`);
    assert.equal(label(result, 'not-greedy'), `${20 - topCount} of 20 recorded draws were not ‘${TOP_NAME}’, drawn from these toy probabilities.`);
    assert.equal(label(result, 'draws-a'), `Recorded toy run: 20 seeded draws at ${p.label}, not NanoGPT`);
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
  assert.equal(label(low, 'not-greedy-2'), `At T = 0.25 the other 5 still share ${four(presets[0].pRest)} of the probability, so a draw can land on them.`);
  assert.equal(label(low, 'not-greedy-3'), `So a low positive T is sharper, not greedy: greedy (argmax) would pick ‘${TOP_NAME}’ every time.`);
  assert.ok(presets.every(p => p.temperature > 0), 'positive temperatures only');
});

test('each probability cell is rounded on its own, like the top-k card', () => {
  const [half, one] = assertCardGates(scene, [{ temperature: 1 }, { temperature: 2 }]);
  assert.deepEqual(shownCells(byId(one, 'probs')), ['0.60', '0.22', '0.08', '0.05', '0.03', '0.01'], 'T = 1.0');
  assert.deepEqual(shownCells(byId(half, 'probs')), ['0.86', '0.12', '0.02', '0.01', '0.00', '0.00'], 'T = 0.5');
  assert.match(label(one, 'live-note'), /a row can total 0\.99 or 1\.01/);
});

// Every 4-decimal readout rounds half-up to the cell it names: p(top) to the top
// token's cell at that preset, the T = 1.0 value to z's cell at T = 1.0 (c22's
// row ② too); 1 − p(top) is p(top)'s exact complement, in both lines that print it.
test('each 4-decimal readout rounds to its cell’s printed value at every preset', () => {
  const halfUp2 = text => (Math.floor((Math.round(Number(text) * 1e4) + 50) / 100) / 100).toFixed(2);
  const results = assertCardGates(scene, ALL);
  const rawCell = shownCells(byId(results[RAW], 'probs'))[TOP];
  assert.equal(rawCell, '0.60');
  for (const result of results) {
    const where = label(result, 't-readout');
    const probs = byId(result, 'probs');
    const [, pTop] = /= (\d\.\d{4}) {3}\(/.exec(label(result, 'p-top'));
    const [, here, raw] = /is (\d\.\d{4}) here, (\d\.\d{4}) at T = 1\.0$/.exec(label(result, 'relation'));
    const [, pRest] = /= (\d\.\d{4}), still above 0$/.exec(label(result, 'p-rest'));
    const [, shared] = /share (\d\.\d{4}) of the probability/.exec(label(result, 'not-greedy-2'));
    assert.equal(here, pTop, `${where} one p(top) in both lines`);
    assert.equal(halfUp2(pTop), shownCells(probs)[TOP], `${where} p(top) ${pTop} vs its cell`);
    assert.ok(Math.abs(Number(pTop) - probs.values[TOP]) <= 5e-5, `${where} p(top) is its cell's p to 4 decimals`);
    assert.equal(halfUp2(raw), rawCell, `${where} T = 1.0 p ${raw} vs z's T = 1.0 cell`);
    assert.equal(shared, pRest, `${where} one 1 − p(top) in both lines`);
    assert.equal(Math.round(Number(pTop) * 1e4) + Math.round(Number(pRest) * 1e4), 1e4, `${where} ${pTop} + ${pRest} = 1`);
    assert.ok(label(result, 'expected').startsWith(`expected about ${Math.round(T.draws * Number(pTop) * 1e3) / 1e3} (`), `${where} expected = 20 × the printed p(top)`);
  }
});

test('status labels and caveats stay on the card; code lives in its sources', () => {
  const [result] = assertCardGates(scene, [{ temperature: 2 }]);
  assert.match(label(result, 'provenance-note'), /calculated toy example, not NanoGPT output/);
  assert.match(label(result, 'live-note'), /live calculation in this card/);
  assert.match(label(result, 'draws-a'), /^Recorded toy run: .*not NanoGPT$/);
  assert.equal(label(result, 'vocab-note'), `The real shakespeare_char softmax covers all ${VOCAB} characters. sp = the space character.`);
  assert.match(label(result, 'zero-note'), /^A 0\.00 cell is rounded, not zero/);
  assert.equal(label(result, 'multinomial'), 'generate(): p = softmax(logits ÷ T), then one random draw from p (torch.multinomial), never argmax.');
  assert.match(label(result, 'wobble'), /counts vary run to run/);
  assert.ok(!scene.objects.some(object => object.type === 'code'), 'no code listings on the card: they are sources');
});

test('sources: generate() lines, the sampling default and how the toy numbers were made', () => {
  assertSources(sources, scene);
  const cites = sources.filter(entry => entry.kind === 'code').map(entry => `${entry.path}:${entry.lines.join('-')}`);
  assert.deepEqual(cites.slice(0, 3), ['model.py:318-318', 'model.py:324-324', 'model.py:326-326'], 'divide, softmax, sample - in that order, first');
  for (const cite of ['model.py:320-322', 'sample.py:17-17', 'data/shakespeare_char/prepare.py:24-25']) assert.ok(cites.includes(cite), `cites ${cite}`);
  const statuses = sources.filter(entry => entry.kind === 'calculation').map(entry => entry.status);
  assert.deepEqual(statuses, ['Calculated toy example', 'Recorded toy run', 'Live calculation']);
  assert.ok(sources.some(entry => entry.kind === 'dataset'), 'the dataset behind the vocabulary size');
  // The sample.py default the notes quote (sample.py is not in the fixture's
  // sha-pinned cache, so its line was checked by hand at 3adf61e).
  const sample = sources.find(entry => entry.path === 'sample.py');
  assert.match(sample.note, /"temperature = 0\.8 # 1\.0 = no change, < 1\.0 = less random, > 1\.0 = more random, in predictions"/);
  // The card shows that default as a value, the same one the source quotes.
  const [result] = assertCardGates(scene, [{ temperature: 2 }]);
  const quoted = /"temperature = ([\d.]+) /.exec(sample.note)[1];
  assert.equal(label(result, 'default-note'), `The sampler’s default, T = ${quoted}, is below 1: sharpened, still sampled.`);
});

// Quotes in the code notes, checked against the sha256-pinned NanoGPT files
// that generate_fixtures.py caches. Skipped where that cache is absent.
const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${path} cache is not the pinned file`);
  return bytes.toString('utf8').split('\n');
};
const files = { 'model.py': cached('model.py'), 'data/shakespeare_char/prepare.py': cached('data/shakespeare_char/prepare.py') };
test('source quotes and line numbers match NanoGPT @3adf61e', { skip: !Object.values(files).every(Boolean) && 'pinned source cache absent' }, () => {
  for (const { path, lines: [start, end], note } of sources.filter(entry => entry.kind === 'code' && files[entry.path])) {
    const cited = files[path].slice(start - 1, end).join('\n');
    const quotes = [...note.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(quotes.length, `${path}:${start} note quotes the source`);
    for (const quote of quotes) assert.ok(cited.includes(quote), `${path}:${start}-${end} does not contain "${quote}"`);
  }
  assert.match(files['model.py'][322 - 1], /-float\('Inf'\)/);
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
});
