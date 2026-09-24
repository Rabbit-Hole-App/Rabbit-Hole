import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../../fixtures/nanogpt-fixtures.generated.js';
import att from '../fixtures/attention.generated.js';
import { scene, sources, evidence, reviewStates } from './overview.js';
import { assertCardGates, assertEvidence, assertSources } from '../../card-gates.mjs';

const T = scene.exampleData.tokens.length;
const ALL = Array.from({ length: T }, (unused, reader) => ({ reader }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const visibleText = result => result.state.objects.filter(o => o.visible && o.label && ['text', 'code', 'equation'].includes(o.type)).map(o => o.label).join('\n');

// Independent oracle: NanoGPT's manual path for one query row in plain JS
// floats (model.py:67-69) - q.k * 1/sqrt(hs), later positions masked, softmax.
function oracleRow(i) {
  const { q, k } = att.heads[0];
  const scores = k.map((key, j) => (j <= i ? q[i].reduce((s, x, d) => s + x * key[d], 0) / Math.sqrt(att.hs) : null));
  const kept = scores.filter(s => s !== null);
  const max = Math.max(...kept);
  const z = kept.reduce((s, x) => s + Math.exp(x - max), 0);
  return scores.map(s => (s === null ? null : Math.exp(s - max) / z));
}

test('overview: question first, gates pass at every review state and every reachable reader', () => {
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.equal(scene.objects[1].initialState.text, 'No prerequisites.', 'the line under the question');
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
});

test('the ladder contract: one discrete control, no equations, shapes or numbers on the card', () => {
  const controls = scene.inputs.filter(d => !d.hidden);
  assert.equal(controls.length, 1);
  assert.equal(controls[0].type, 'index');
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    assert.equal(result.state.objects.filter(o => o.visible && o.type === 'equation').length, 0);
    const shown = visibleText(result);
    assert.doesNotMatch(shown, /\(\s*[A-Za-z]\w*\s*,/, 'no tensor shapes');
    assert.doesNotMatch(shown, /\d/, 'no numbers in the text');
    assert.doesNotMatch(`${shown}\n${scene.title}`, /beginner|intermediate|advanced|expert|newcomer/i, 'the depth describes the card, never the learner');
  }
});

test('bar heights are the oracle attention row; the future never gets a bar', () => {
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    const i = inputs.reader;
    const expected = oracleRow(i);
    const bars = byId(result, 'look-bars').values;
    bars.forEach((value, j) => {
      if (j > i) assert.equal(value, null, `reader ${i}: character ${j} is not read yet`);
      else assert.ok(Math.abs(value - expected[j]) <= 2e-3, `reader ${i} bar ${j}: ${value} vs ${expected[j]}`);
    });
    assert.ok(Math.abs(bars.filter(v => v !== null).reduce((s, v) => s + v, 0) - 1) <= 3e-3, 'bars add up to one');
    // Tiles: the reader, earlier characters, faded future.
    for (let j = 0; j < T; j += 1) {
      const tile = byId(result, `tile-${j}`);
      assert.equal(tile.role, j === i ? 'learner' : j < i ? 'input' : 'neutral');
      assert.equal(tile.opacity, j > i ? 0.3 : 1);
      assert.equal(tile.label, scene.exampleData.tokens[j] === '␣' ? 'space' : scene.exampleData.tokens[j]);
    }
    assert.equal(byId(result, 'not-read').visible, i < T - 1);
    if (i < T - 1) assert.equal(byId(result, 'not-read').x, byId(result, `tile-${i + 1}`).x, 'the label starts over the first unread tile');
    const arrow = byId(result, 'reader-arrow');
    const tile = byId(result, `tile-${i}`);
    assert.equal(arrow.to.x, tile.x + tile.w / 2, 'the reader arrow points at the reader');
  }
});

test('captions name what the bars show', () => {
  const spoken = c => (c === '␣' ? 'the space' : `“${c}”`);
  const tokens = scene.exampleData.tokens;
  for (const inputs of ALL) {
    const [result] = assertCardGates(scene, [inputs]);
    const i = inputs.reader;
    const row = oracleRow(i);
    const top = row.reduce((best, w, j) => (w !== null && (best === null || w > row[best]) ? j : best), null);
    assert.equal(result.derived.topAt, top);
    if (i === 0) {
      assert.equal(byId(result, 'caption-first').visible, true);
      assert.equal(byId(result, 'caption-later').visible, false);
      assert.equal(byId(result, 'caption-yield').visible, false);
      assert.equal(byId(result, 'caption-yield-first').label, `everything it passes on comes from ${spoken(tokens[0])}.`);
      assert.equal(row[0], 1, 'the first character can only look at itself');
    } else {
      assert.equal(byId(result, 'caption-first').visible, false);
      assert.equal(top, i - 1, 'the tallest bar is the character just before');
      assert.equal(byId(result, 'caption-later').label, `Reading ${spoken(tokens[i])}: it looks hardest at ${spoken(tokens[i - 1])}, the character just before it,`);
      assert.ok(row[i - 1] > 0.5, 'hardest = a clear majority');
      assert.equal(byId(result, 'caption-yield').label, `so most of what it passes on comes from ${spoken(tokens[i - 1])}.`, '"most" = that clear majority');
      assert.equal(byId(result, 'caption-yield-first').visible, false);
    }
    const future = byId(result, 'caption-future').label;
    if (i === T - 1) assert.match(future, /^Nothing to its right/);
    else assert.ok(future.startsWith(T - 1 - i === 1 ? 'The character to its right is' : 'The characters to its right are'), future);
  }
});

test('source truth: the shared context and the generator head', () => {
  assert.deepEqual(scene.exampleData.tokens, fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 9));
  assert.deepEqual(scene.exampleData.Q, att.heads[0].q);
  assert.deepEqual(scene.exampleData.K, att.heads[0].k);
  assert.equal(scene.derived.scaled.args[1], 1 / Math.sqrt(att.hs), 'the literal multiplier is 1/sqrt(hs)');
});

const cached = path => {
  const sha = fx.provenance.nanogpt.files[path];
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
  return bytes.toString('utf8').split('\n');
};

test('sources: collapsed under the card, quotes match the pinned file', () => {
  assertSources(sources, scene);
  const model = cached('model.py');
  for (const source of sources.filter(s => s.kind === 'code')) {
    const quotes = [...source.note.matchAll(/“([^”]+)”/g)].map(m => m[1]);
    assert.ok(quotes.length, `${source.path}:${source.lines} quotes its lines`);
    if (!model) continue;
    const lines = model.slice(source.lines[0] - 1, source.lines[1]).join('\n');
    for (const quote of quotes) assert.ok(lines.includes(quote), `${source.path}:${source.lines.join('-')} really says "${quote}"`);
  }
  const calc = sources.find(s => s.kind === 'calculation');
  assert.equal(calc.status, 'Calculated toy example');
  assert.match(calc.reproduce, /gen_attention\.py --check$/);
});

test('evidence record is complete', () => {
  assertEvidence(evidence);
  for (const field of ['depth', 'prerequisites', 'ladderRole']) assert.ok(String(evidence[field] || '').trim(), field);
  assert.equal(evidence.depth, 'Overview');
  assert.match(evidence.sourceRevision, /3adf61e154c3fe3fca428ad6bc3818b27a3b8291/);
});
