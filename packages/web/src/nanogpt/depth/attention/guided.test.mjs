import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import att from '../fixtures/attention.generated.js';
import { scene, sources, evidence, reviewStates } from './guided.js';
import { assertCardGates, assertEvidence, assertSources } from '../../card-gates.mjs';
import { evaluateScene } from '../../../scene-evaluate.js';
import { SCENE_PAD, sceneContentBounds, sceneLegibility } from '../../../scene-layout.js';

const T = att.T;
const LAST = T - 1;
const ALL = ['before', 'next'].flatMap(lookFor => Array.from({ length: T }, (unused, reader) => ({ reader, lookFor })));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const spoken = c => (c === '␣' ? 'the space' : `“${c}”`);
const TOKENS = att.context.tokens;
const close = (actual, expected, where, tol) => {
  assert.equal(actual.length, expected.length, where);
  actual.forEach((value, i) => {
    if (expected[i] === null) assert.equal(value, null, `${where}[${i}] masked`);
    else assert.ok(Math.abs(value - expected[i]) <= tol, `${where}[${i}]: ${value} vs ${expected[i]}`);
  });
};

// Independent oracle in plain JS floats: model.py:67-71 for one row.
function oracle(reader, lookFor) {
  const q = (lookFor === 'before' ? att.heads[0].q : att.qNext)[reader];
  const { k, v } = att.heads[0];
  const raw = k.map(key => q.reduce((s, x, d) => s + x * key[d], 0));
  const masked = raw.map((s, j) => (j <= reader ? s / Math.sqrt(att.hs) : null));
  const kept = masked.filter(s => s !== null);
  const max = Math.max(...kept);
  const z = kept.reduce((s, x) => s + Math.exp(x - max), 0);
  const w = masked.map(s => (s === null ? null : Math.exp(s - max) / z));
  const out = v[0].map((unused, d) => w.reduce((s, wj, j) => s + (wj ?? 0) * v[j][d], 0));
  return { q, raw, masked, w, out };
}
// What a grid cell prints (AnimatedScene's num): 2 decimals, leading 0 dropped.
const shown = v => (v === null ? null : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/^(-?)0\./, '$1.'));
const argmax = values => values.reduce((best, x, j) => (x !== null && (best === null || x > values[best]) ? j : best), null);

test('guided: question first, "Builds on" under it, gates pass at every review state and every reachable state', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.match(scene.objects[1].initialState.text, /^Builds on: looking back at earlier characters; dot product, softmax$/);
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
});

// The block is sized from the static scene, the renderer fits the evaluated
// one: both must be the same box at scale 1, in every state, or the card draws
// its 13px notes at about 11px (it rendered at 0.90 before) and refits as the
// reader moves.
test('framing: one frame at scale 1 for every state; nothing drawn outside it', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1, 'renders at authored size');
  const { contributors: _c, ...still } = legibility.bounds;
  for (const inputs of ALL) {
    for (const time of [0, scene.duration]) {
      const { contributors: _e, ...bounds } = sceneContentBounds(evaluateScene(structuredClone(scene), time, inputs).scene);
      assert.deepEqual(bounds, still, JSON.stringify(inputs));
    }
  }
  // Data shapes are not measured by the frame fit: their bodies must sit inside
  // the drawn frame (the fitted bounds plus the pad around them).
  for (const inputs of [{ reader: 3, lookFor: 'before' }, { reader: LAST, lookFor: 'next' }]) {
    const [result] = assertCardGates(scene, [inputs]);
    for (const object of result.state.objects.filter(o => o.visible && ['grid', 'strip'].includes(o.type))) {
      assert.ok(object.x + object.w <= still.xMax + SCENE_PAD && object.y + object.h <= still.yMax + SCENE_PAD, `${object.id} inside the frame`);
    }
  }
  // The output note reads with the column it describes: it ends just left of
  // the Σ w·v column (~6px a character as drawn), well clear of the values grid.
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    const [note, output, values] = ['output-note', 'output', 'values'].map(id => byId(result, id));
    const gap = output.x - (note.x + note.label.length * 6);
    assert.ok(gap >= 8 && gap <= 16, `${JSON.stringify(inputs)} note ends ${gap}px left of the column`);
    assert.ok(note.x - (values.x + values.w) >= 100, `${JSON.stringify(inputs)} note sits by the column, not the values grid`);
  }
});

test('the ladder contract: 1-2 controls, real numbers that change, no equations or shapes, depth never labels the learner', () => {
  const controls = scene.inputs.filter(d => !d.hidden);
  assert.ok(controls.length >= 1 && controls.length <= 2);
  const seen = new Set();
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    assert.equal(result.state.objects.filter(o => o.visible && o.type === 'equation').length, 0);
    const text = result.state.objects.filter(o => o.visible && o.label && o.type === 'text').map(o => o.label).join('\n');
    assert.doesNotMatch(text, /\(\s*[A-Za-z]\w*\s*,\s*\w+\s*,/, 'no tensor shapes');
    assert.doesNotMatch(`${text}\n${scene.title}`, /beginner|intermediate|advanced|expert|newcomer/i);
    seen.add(JSON.stringify(byId(result, 'weights').values));
  }
  assert.equal(seen.size, ALL.length - 1, 'every state shows a different weight row (reader 0 is 1.0 under both options)');
});

test('every number on the card matches the plain-JS oracle', () => {
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    const { reader, lookFor } = inputs;
    const where = JSON.stringify(inputs);
    const o = oracle(reader, lookFor);
    close(byId(result, 'q').values, o.q, `${where} q`, 0);
    close(byId(result, 'keys').values, att.heads[0].k[0].flatMap((unused, d) => att.heads[0].k.map(row => row[d])), `${where} keys (transposed)`, 0);
    close(byId(result, 'scores').values, o.raw, `${where} scores`, 1e-3);
    close(byId(result, 'masked').values, o.masked, `${where} masked`, 1e-3);
    close(byId(result, 'weights').values, o.w, `${where} weights`, 1e-3);
    close(byId(result, 'output').values, o.out, `${where} output`, 3e-3);
    // The what-if at the last reader points past the text: no key to match,
    // so no highlight and no products.
    if (lookFor === 'next' && reader === LAST) {
      assert.equal(result.derived.highlightAt, -1);
      assert.deepEqual(byId(result, 'keys').cellHighlight, { col: -1 });
      assert.equal(byId(result, 'scores').cellHighlight, -1);
      for (const id of ['products', 'products-exact', 'product-sum']) assert.equal(byId(result, id).visible, false, `${where} ${id} hidden`);
      assert.equal(byId(result, 'products-title').label, 'no single key: q points past the text');
      assert.ok(o.raw.every(x => x !== null && x !== 0), `${where} q still meets every key: the score row is full`);
    } else {
      assert.equal(result.derived.highlightAt, result.derived.focusAt);
      for (const id of ['products', 'products-exact', 'product-sum']) assert.equal(byId(result, id).visible, true, `${where} ${id} shown`);
      assert.equal(byId(result, 'products-title').label, `q × k for ${spoken(TOKENS[result.derived.focusAt])}, dim by dim:`);
    }
    // Relationship 1: the four products add up to the focus key's score cell
    // (shown to 2 decimals in the cell, 3 in the text).
    const focus = result.derived.focusAt;
    const products = byId(result, 'products').values;
    close(products, o.q.map((x, d) => x * att.heads[0].k[focus][d]), `${where} products`, 1e-3);
    assert.ok(Math.abs(result.derived.productSum - o.raw[focus]) <= 3e-3, `${where} products add to the score`);
    assert.equal(Math.round(result.derived.productSum * 100), Math.round(o.raw[focus] * 100), `${where} same 2-decimal score`);
    assert.ok(byId(result, 'product-sum').label.startsWith(`add them: ${result.derived.productSum}`));
    // The strip's 2-decimal cells can miss the score by 0.01, so the card
    // lists the products to 3 decimals: those add up exactly to the sum shown.
    const listed = byId(result, 'products-exact').label.replace('3 decimals: ', '').split(', ').map(Number);
    listed.forEach((x, d) => assert.ok(Math.abs(x - o.q[d] * att.heads[0].k[focus][d]) <= 5e-4, `${where} listed product ${d}`));
    assert.equal(Math.round(listed.reduce((s, x) => s + x, 0) * 1000), Math.round(result.derived.productSum * 1000), `${where} listed products add up exactly`);
    // Relationship 2: the weights add up to 1. The cells are rounded one by
    // one (no distribution flag, so the renderer never nudges a cell), so the
    // printed row reads .99 to 1.01 as the label says.
    const weights = byId(result, 'weights');
    assert.equal(weights.distribution, false, 'no largest-remainder nudge');
    assert.ok(Math.abs(weights.values.filter(w => w !== null).reduce((s, x) => s + x, 0) - 1) <= T * 5e-4, `${where} weights (3 decimals each) sum to 1`);
    const printed = weights.values.map(shown).filter(w => w !== null).reduce((s, x) => s + Number(x), 0);
    assert.ok(Math.abs(printed - 1) <= 0.0101, `${where} printed row ${printed} within .99-1.01`);
    // Scores that print the same get weights that print the same (the round-1
    // complaint: 1.00 and 1.00 used to show .05 and .04).
    const scoreText = byId(result, 'masked').values.map(shown);
    const weightText = weights.values.map(shown);
    scoreText.forEach((a, i) => scoreText.forEach((b, j) => {
      if (a !== null && a === b) assert.equal(weightText[i], weightText[j], `${where} equal scores ${i}, ${j} print equal weights`);
    }));
    // The by-hand line works the softmax for the largest visible weight:
    // e^top / (grouped e^score terms) = numerator / denominator = the cell.
    const hand = `${byId(result, 'hand-note').label} ${byId(result, 'hand-value').label}`;
    const kept = o.masked.filter(x => x !== null);
    const topScore = Math.max(...kept);
    const sup = { 4: '⁴', 1: '¹', '-1': '⁻¹', '-4': '⁻⁴' };
    const topWeight = shown(weights.values[result.derived.topAt]);
    if (kept.length === 1) assert.equal(hand, `largest: e${sup[Math.round(topScore)]} / e${sup[Math.round(topScore)]} = 1`);
    else {
      const m = hand.match(/^largest: e(\S+) \/ \((.+)\) = ([\d.]+) \/ ([\d.]+) = (\.\d\d)$/);
      assert.ok(m, `${where} by-hand line: ${hand}`);
      assert.equal(m[1], sup[Math.round(topScore)]);
      const terms = Object.fromEntries(m[2].split(' + ').map(t => { const [, n, e] = t.match(/^(\d*)e(.+)$/); return [e, Number(n || 1)]; }));
      const counts = {};
      kept.forEach(x => { counts[sup[Math.round(x)]] = (counts[sup[Math.round(x)]] || 0) + 1; });
      assert.deepEqual(terms, counts, `${where} one term per visible score`);
      const den = kept.reduce((s, x) => s + Math.exp(x), 0);
      assert.ok(Math.abs(Number(m[3]) - Math.exp(topScore)) <= 0.05 && Math.abs(Number(m[4]) - den) <= 0.05, `${where} e^top and the sum`);
      assert.equal(m[5], topWeight, `${where} the ratio is the weight cell`);
      assert.equal((Number(m[3]) / Number(m[4])).toFixed(2).replace(/^0\./, '.'), topWeight, `${where} the printed ratio divides to the cell`);
    }
    // The scaled scores are the position code's exact values: 4, 1, -1, -4.
    o.masked.filter(x => x !== null).forEach(x => assert.ok([4, 1, -1, -4].some(n => Math.abs(x - n) < 1e-4), `${where} exact score ${x}`));
    // Relationship 3: masked = blank score and exactly zero share.
    assert.deepEqual(byId(result, 'masked').values.map(v => v === null), TOKENS.map((unused, j) => j > reader));
    // Relationship 4: the largest visible score takes the largest weight
    // (ties allowed: the what-if rows have several equal scores).
    const top = result.derived.topAt;
    assert.ok(Math.abs(o.masked[top] - Math.max(...o.masked.filter(x => x !== null))) < 1e-4, `${where} topAt is a largest score`);
    assert.ok(Math.abs(o.w[top] - Math.max(...o.w.filter(x => x !== null))) < 1e-4, `${where} and a largest weight`);
  }
});

test('notes and captions say what the numbers show', () => {
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    const { reader, lookFor } = inputs;
    const where = JSON.stringify(inputs);
    const o = oracle(reader, lookFor);
    const label = id => byId(result, id).label;
    const top = argmax(o.w);
    if (lookFor === 'before') {
      assert.equal(result.derived.focusAt, Math.max(reader - 1, 0));
      if (reader > 0) {
        assert.equal(top, reader - 1, `${where} the character before wins`);
        assert.ok(o.w[top] > 0.8, `${where} "most weight"`);
        assert.equal(label('top-note'), `highest visible score: ${spoken(TOKENS[reader - 1])}`);
        assert.equal(label('sum-note'), `most weight: ${spoken(TOKENS[reader - 1])}; total 1`);
        assert.equal(label('output-note'), `≈ the v of ${spoken(TOKENS[reader - 1])}`);
        assert.ok(label('caption').includes(`key of ${spoken(TOKENS[reader - 1])}`));
      }
      assert.equal(label('caption-2'), '');
    } else {
      if (reader < LAST) {
        // The what-if key is the next character: the largest raw score of the
        // whole row, yet masked to weight 0.
        assert.equal(result.derived.focusAt, reader + 1);
        assert.equal(argmax(o.raw), reader + 1, `${where} the future key scores highest`);
        assert.equal(o.masked[reader + 1], null);
        assert.equal(label('top-note'), `highest score: ${spoken(TOKENS[reader + 1])}, a later one`);
        assert.match(label('caption-2'), /weight 0/);
        if (reader > 0) assert.equal(label('sum-note'), 'highest score gets 0; total still 1');
      } else {
        assert.ok(Math.max(...o.w) < 0.3, `${where} spreads`);
        assert.equal(label('top-note'), 'no visible score stands out');
      }
      if (reader > 1) assert.ok(Math.max(...o.w.filter(x => x !== null)) < 0.5, `${where} "a mix": no weight is a majority`);
    }
    if (reader === 0) {
      assert.deepEqual(o.w, [1, ...Array(LAST).fill(null)], 'the first reader has only itself');
      assert.equal(label('output-note'), '= the v of “B”');
    }
    const n = LAST - reader;
    assert.equal(label('mask-note'), n ? `${n} later → −∞, weight exactly 0` : 'nothing comes later: nothing masked');
    assert.equal(label('reader-note'), `Reader: ${spoken(TOKENS[reader])}`);
  }
});

test('source truth: shared context, generator head, and the 1/sqrt(hs) literal', () => {
  assert.deepEqual(TOKENS, fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 9));
  assert.equal(scene.derived.scaled.args[1], 1 / Math.sqrt(att.hs));
  assert.deepEqual(scene.exampleData.qByOption.before, att.heads[0].q);
  assert.deepEqual(scene.exampleData.qByOption.next, att.qNext);
  // The construction the card states: q is 4 x the key it points at (the
  // generator keeps 6 decimals, so scores equal in theory are equal on the card).
  const times = key => key.map(x => Math.round(x * att.gain * 1e6) / 1e6);
  for (let i = 1; i < T; i += 1) assert.deepEqual(att.heads[0].q[i], times(att.heads[0].k[i - 1]));
  for (let i = 0; i < LAST; i += 1) assert.deepEqual(att.qNext[i], times(att.heads[0].k[i + 1]));
  // and each key is the position code [cos 36j, sin 36j, cos 108j, sin 108j].
  const rad = d => (d * Math.PI) / 180;
  att.heads[0].k.forEach((key, j) => [Math.cos(rad(36 * j)), Math.sin(rad(36 * j)), Math.cos(rad(108 * j)), Math.sin(rad(108 * j))]
    .forEach((x, d) => assert.ok(Math.abs(key[d] - x) <= 5e-7, `k(${j})[${d}]`)));
});

const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
  return bytes.toString('utf8').split('\n');
};

test('sources: every step cited, quotes match the pinned file, statuses labelled on the card', () => {
  assertSources(sources, scene);
  const model = cached('model.py');
  for (const source of sources.filter(s => s.kind === 'code')) {
    const quotes = [...source.note.matchAll(/“([^”]+)”/g)].map(m => m[1]);
    assert.ok(quotes.length, `${source.path}:${source.lines} quotes its lines`);
    if (!model) continue;
    const lines = model.slice(source.lines[0] - 1, source.lines[1]).join('\n');
    for (const quote of quotes) assert.ok(lines.includes(quote), `${source.path}:${source.lines.join('-')} really says "${quote}"`);
  }
  assert.deepEqual(sources.filter(s => s.kind === 'code').map(s => s.lines[0]).sort((a, b) => a - b), [64, 67, 68, 69, 71]);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Calculated toy example', 'What-if', 'Live calculation']);
  for (const s of sources.filter(x => x.kind === 'calculation' && x.status !== 'Live calculation')) assert.match(s.reproduce, /gen_attention\.py --check$/);
  assert.ok(sources.some(s => s.kind === 'paper' && s.arxiv === '1706.03762'));
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  for (const field of ['depth', 'prerequisites', 'ladderRole']) assert.ok(String(evidence[field] || '').trim(), field);
  assert.equal(evidence.depth, 'Guided');
  assert.match(evidence.sourceRevision, /3adf61e154c3fe3fca428ad6bc3818b27a3b8291/);
});
