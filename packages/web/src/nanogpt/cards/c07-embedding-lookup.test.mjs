import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { planProblems } from '../../card-plan.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, sources, evidence, TOY_WTE } from './c07-embedding-lookup.js';

// Independent oracle: the 65-character vocabulary prepare.py prints for Tiny
// Shakespeare (its own comment, data/shakespeare_char/prepare.py:64-65),
// sorted as sorted(set(data)), and the toy rows by character - never the
// scene's derive graph.
const VOCAB = ['\n', ...' !$&\',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];
const stoi = new Map(VOCAB.map((ch, i) => [ch, i]));
const WORD = [...'Before'];
const IDS = WORD.map(ch => stoi.get(ch));
const ROWS = [...new Set(IDS)].sort((a, b) => a - b);
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const WTE_Y = 316, CELL = 48;

test('c07 passes every gate at every review state', () => {
  assert.ok(reviewStates.length >= 2 && reviewStates.length <= 6);
  assertCardGates(scene, reviewStates);
  assert.equal(scene.objects[0].semanticId, 'question');
});

test('c07 plan: reviewed, verbatim objective, sequence "Embeddings" 1 of 2', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'single');
  // The sequence record is checked with the same rules a sequence card gets.
  assert.deepEqual(planProblems({ ...plan, boundary: { ...plan.boundary, decision: 'sequence' } }), []);
  assert.deepEqual(plan.boundary.sequence, { name: 'Embeddings', position: 1, of: 2, relationships: [{ type: 'prerequisite', card: 'c09-token-plus-position' }] });
  assert.equal(plan.objective, 'After this card, the learner should understand that a token ID does no arithmetic: it selects one learned row of the embedding table, and that row is the token\'s vector.');
});

test('c07 IDs are NanoGPT\'s character IDs for "Before"', () => {
  assert.deepEqual(IDS, [14, 43, 44, 53, 56, 43]);
  assert.deepEqual(fx.tokenizer.tokenizers.find(t => t.id === 'char').ids.slice(0, 6), IDS);
  assert.ok(fx.tokenizer.text.startsWith('Before'));
  const [result] = assertCardGates(scene, [{ token: 1 }]);
  const idx = byId(result, 'idx');
  assert.deepEqual(idx.values, [0, 1, 2, 3, 4, 5, ...IDS]);
  assert.deepEqual(idx.columnLabels, WORD);
  assert.equal(idx.numberFormat, 'integer');
  assert.deepEqual(byId(result, 'wte').rowLabels, ROWS.map(id => `row ${id} · ${VOCAB[id]}`));
});

test('c07 the picked token\'s row lights and is copied out unchanged', () => {
  const results = assertCardGates(scene, WORD.map((unused, token) => ({ token })));
  results.forEach((result, token) => {
    const ch = WORD[token], id = IDS[token], row = ROWS.indexOf(id);
    assert.deepEqual(byId(result, 'idx').cellHighlight, { col: token });
    assert.deepEqual(byId(result, 'wte').cellHighlight, { row });
    // The vector IS the row: the same numbers, no arithmetic.
    assert.deepEqual(byId(result, 'vector').values, TOY_WTE[ch]);
    assert.deepEqual(byId(result, 'wte').values.slice(row * 4, row * 4 + 4), TOY_WTE[ch]);
    assert.equal(byId(result, 'vector').label, `the token’s vector = wte row ${id}`);
    assert.equal(byId(result, 'selected').label, `Selected: position ${token}, character “${ch}”, token ID ${id}`);
    assert.equal(byId(result, 'lookup').label, `No arithmetic: ID ${id} just picks row ${id}.`);
    // The frame and the arrow sit on the lit row.
    assert.equal(byId(result, 'lit-row-top').from.y, WTE_Y + row * CELL - 3);
    assert.equal(byId(result, 'lit-row-bottom').from.y, WTE_Y + (row + 1) * CELL + 3);
    assert.equal(byId(result, 'arrow-lookup').from.y, WTE_Y + row * CELL + CELL / 2);
    const repeats = WORD.filter(c => c === ch).length;
    assert.equal(byId(result, 'same-row').label, repeats > 1
      ? `Both ${ch}’s (positions 1 and 5) have ID ${id}: same row.`
      : `“${ch}” appears once here; any ${ch} gets row ${id}.`);
  });
  // Same character elsewhere: same row, identical vector.
  assert.deepEqual(byId(results[1], 'vector').values, byId(results[5], 'vector').values);
  assert.deepEqual(byId(results[1], 'wte').cellHighlight, byId(results[5], 'wte').cellHighlight);
  assert.notDeepEqual(byId(results[0], 'vector').values, byId(results[1], 'vector').values);
});

test('c07 one colour scale for table and vector, unmoved by the pick', () => {
  const results = assertCardGates(scene, reviewStates);
  for (const result of results) {
    assert.deepEqual(byId(result, 'wte').valueDomain, { min: -0.9, max: 0.9 });
    assert.deepEqual(byId(result, 'vector').valueDomain, { min: -0.9, max: 0.9 });
  }
});

test('c07 sources: status labels on the card, provenance under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Calculated toy example']);
  assert.equal(sources.find(s => s.status === 'Calculated toy example').reproduce, undefined, 'authored here, not by the generator');
  const cites = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  assert.deepEqual(cites, ['model.py:127-127', 'model.py:177-177', 'model.py:167-168', 'data/shakespeare_char/prepare.py:24-33', 'train.py:153-155', 'config/train_shakespeare_char.py:24-24']);
  assert.equal(scene.exampleData.vocab, 65);
  assert.equal(scene.exampleData.nEmbd, 384);
});

const PATHS = ['model.py', 'data/shakespeare_char/prepare.py', 'train.py', 'config/train_shakespeare_char.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c07 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
  const squash = t => t.replace(/\s+/g, ' ').trim();
  let quotes = 0;
  for (const source of sources.filter(s => s.kind === 'code')) {
    const [start, end] = source.lines;
    const cited = squash(pinnedFile(source.path).slice(start - 1, end).join(' '));
    for (const [, quote] of source.note.matchAll(/"([^"]+)"/g)) {
      quotes += 1;
      assert.ok(cited.includes(squash(quote)), `${source.path}:${start}-${end} lacks "${quote}"`);
    }
  }
  assert.ok(quotes >= 7, `${quotes} quotes checked`);
  // The oracle vocabulary is prepare.py's own printed output.
  const prep = pinnedFile('data/shakespeare_char/prepare.py');
  assert.deepEqual(['\n', ...prep[65 - 1].slice('# '.length)], VOCAB);
});

test('c07 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
});
