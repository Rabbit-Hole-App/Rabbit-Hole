import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import { planProblems } from '../../card-plan.js';
import { validateActivity, PREDICATES } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, pinnedFile } from '../card-gates.mjs';
import { TOY_WTE } from './c07-embedding-lookup.js';
import { scene, plan, reviewStates, activity, sources, evidence, TOY_WPE } from './c09-token-plus-position.js';

// Independent oracle: prepare.py's printed 65-character vocabulary
// (data/shakespeare_char/prepare.py:64-65) and the toy rows by character and
// position, added in plain JS - never the scene's derive graph.
const VOCAB = ['\n', ...' !$&\',-.3:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];
const stoi = new Map(VOCAB.map((ch, i) => [ch, i]));
const WORD = [...'Before'];
const IDS = WORD.map(ch => stoi.get(ch));
const ROWS = [...new Set(IDS)].sort((a, b) => a - b);
const r3 = v => Math.round(v * 1000) / 1000;
const add = (a, b) => a.map((v, i) => r3(v + b[i]));
const sub = (a, b) => a.map((v, i) => r3(v - b[i]));
const xAt = (p, wpe) => (wpe ? add(TOY_WTE[WORD[p]], TOY_WPE[p]) : TOY_WTE[WORD[p]]);
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const TABLE_Y = 316, CELL = 48;
const ALL = [0, 1].flatMap(part => WORD.flatMap((unused, position) => [true, false].map(wpe => ({ part, position, wpe }))));
const PIPELINE = ALL.filter(state => state.part === 0);
const shown = result => result.state.objects.filter(object => object.visible && (object.opacity ?? 1) > 0).map(object => object.id).sort();
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };

test('c09 passes every gate at every review state and every input combination', () => {
  assertCardGates(scene, reviewStates);
  assertCardGates(scene, ALL);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.deepEqual(scene.inputs.map(i => [i.name, i.default]), [['part', 0], ['position', 5], ['wpe', true]]);
  // The approved states, each on the part its content now lives on: the
  // pipeline (1/2) at every one, the pair (2/2) with wpe on and off.
  const key = state => JSON.stringify([state.part, state.position, state.wpe]);
  for (const [position, wpe] of [[5, true], [1, true], [5, false], [1, false], [0, true]]) {
    assert.ok(reviewStates.some(state => key(state) === key({ part: 0, position, wpe })), `1/2 at ${position}, wpe ${wpe}`);
  }
  for (const wpe of [true, false]) assert.ok(reviewStates.some(state => state.part === 1 && state.wpe === wpe), `2/2 with wpe ${wpe}`);
  assert.ok(reviewStates.every(state => state.part !== undefined));
});

test('c09 sub-cards: Part 1/2 the pipeline, Part 2/2 the two e\'s; status and colour key on both', () => {
  const pager = scene.inputs.find(input => input.presentation === 'pager');
  assert.deepEqual([pager.name, pager.label, pager.of], ['part', 'Part', 'parts']);
  assert.deepEqual(scene.exampleData.parts, ['Look up two rows and add them', 'The two e’s compared']);
  const [one, two] = assertCardGates(scene, [{ part: 0 }, { part: 1 }]);
  assert.deepEqual(shown(one), ['dropout', 'equals', 'idx', 'plus', 'position-row', 'question', 'reads', 'scale', 'selected', 'shape', 'status', 'token-row',
    'wpe-lit-bottom', 'wpe-lit-left', 'wpe-lit-right', 'wpe-lit-top', 'wpe-table',
    'wte', 'wte-lit-bottom', 'wte-lit-left', 'wte-lit-right', 'wte-lit-top', 'x-note', 'x-row']);
  assert.deepEqual(shown(two), ['pair', 'question-pair', 'scale', 'status', 'verdict', 'why']);
  // Each part opens with its own question; only the status line and colour key are shared.
  assert.deepEqual(scene.objects.filter(object => object.part === undefined).map(object => object.id), ['status', 'scale']);
  assert.equal(byId(one, 'question').y, byId(two, 'question-pair').y);
  // The grids and strips on each part: 1/2's are the stages of its one pipeline
  // (idx, ① the tables, ② the rows, ③ x); 2/2 has the pair grid alone.
  const visuals = part => scene.objects.filter(object => object.part === part && ['grid', 'strip'].includes(object.type)).map(object => object.id);
  assert.deepEqual(visuals(0), ['idx', 'wte', 'wpe-table', 'token-row', 'position-row', 'x-row']);
  assert.deepEqual(visuals(1), ['pair']);
  // 2/2 reveals on its own clock, not after 1/2's.
  assert.ok(two.scene.timeline.length > 0 && two.scene.timeline.every(event => ['pair', 'verdict', 'why'].includes(event.target) && event.at < 1));
});

test('c09 plan: staged, verbatim objective, sequence "Embeddings" 2 of 2, no boundary flag (the pager is navigation, not a control)', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(Object.keys(plan.boundary.reviewed), [], 'the Part pager is not counted as a control')
  assert.match(plan.primaryInteraction, /Part 1\/2.*Part 2\/2/);
  assert.match(plan.boundary.reason, /two sub-cards/);
  assert.deepEqual(planProblems({ ...plan, boundary: { ...plan.boundary, decision: 'sequence' } }), []);
  assert.deepEqual(plan.boundary.sequence, { name: 'Embeddings', position: 2, of: 2, relationships: [{ type: 'prerequisite', card: 'c07-embedding-lookup' }] });
  assert.equal(plan.objective, 'After this card, the learner should understand that the first block reads the sum of a token row and a position row, so the same token at two positions enters as two different vectors.');
  assert.ok(scene.height <= 900);
});

test('c09 stage by stage (Part 1/2): the lit rows, the trace and x match the oracle', () => {
  const results = assertCardGates(scene, PIPELINE);
  PIPELINE.forEach(({ position, wpe }, k) => {
    const result = results[k];
    const ch = WORD[position], id = IDS[position], row = ROWS.indexOf(id);
    const where = JSON.stringify({ position, wpe });
    assert.deepEqual(byId(result, 'idx').cellHighlight, { col: position }, where);
    assert.deepEqual(byId(result, 'wte').cellHighlight, { row }, where);
    assert.deepEqual(byId(result, 'wpe-table').cellHighlight, { row: position }, where);
    assert.equal(byId(result, 'wte-lit-top').from.y, TABLE_Y + row * CELL - 3, where);
    assert.equal(byId(result, 'wpe-lit-top').from.y, TABLE_Y + position * CELL - 3, where);
    assert.equal(byId(result, 'wpe-lit-top').opacity, wpe ? 1 : 0, where);
    assert.deepEqual(byId(result, 'token-row').values, TOY_WTE[ch], where);
    assert.deepEqual(byId(result, 'position-row').values, wpe ? TOY_WPE[position] : [null, null, null, null], where);
    assert.deepEqual(byId(result, 'x-row').values, xAt(position, wpe), where);
    assert.equal(byId(result, 'selected').label, `Position ${position}: “${ch}”, token ID ${id}`);
    assert.equal(byId(result, 'reads').label, wpe ? `reads wte row ${id} + wpe row ${position}` : `reads wte row ${id} only (wpe off: what-if)`);
    assert.equal(byId(result, 'token-row').label, `② token row = wte row ${id}`);
    assert.equal(byId(result, 'position-row').label, wpe ? `② position row = wpe row ${position}` : '② position row: not added');
    assert.equal(byId(result, 'x-row').label, wpe ? '③ x = token row + position row' : '③ x = token row alone');
    assert.equal(byId(result, 'x-note').label, wpe ? 'what the first block reads here' : 'what-if: NanoGPT always adds wpe');
    assert.equal(byId(result, 'x-row').role, wpe ? 'output' : 'warning');
  });
});

test('c09 the two e\'s (Part 2/2): different with wpe, identical without', () => {
  assert.deepEqual([WORD[1], WORD[5]], ['e', 'e']);
  assert.equal(IDS[1], IDS[5]);
  for (const wpe of [true, false]) {
    const [result] = assertCardGates(scene, [{ part: 1, position: 5, wpe }]);
    const x1 = xAt(1, wpe), x5 = xAt(5, wpe), diff = sub(x5, x1);
    const pair = byId(result, 'pair');
    assert.deepEqual(pair.values, [...x1, ...x5, ...diff]);
    assert.deepEqual(pair.rowLabels, ['x at position 1', 'x at position 5', 'x at 5 − x at 1']);
    if (wpe) {
      assert.deepEqual(diff, sub(TOY_WPE[5], TOY_WPE[1]), 'the difference is only the position part');
      assert.ok(diff.every(v => v !== 0));
      assert.equal(byId(result, 'verdict').label, 'Different: same token row, different position rows.');
      assert.equal(byId(result, 'why').label, 'Their difference = wpe row 5 − wpe row 1: the position part.');
      assert.equal(pair.role, 'output');
    } else {
      assert.deepEqual(x1, x5);
      assert.deepEqual(diff, [0, 0, 0, 0]);
      assert.equal(byId(result, 'verdict').label, 'Identical: without wpe the e’s can’t be told apart.');
      assert.equal(byId(result, 'why').label, 'Their difference is 0: nothing position-specific was added.');
      assert.equal(pair.role, 'warning');
    }
    // The pair does not depend on the slider.
    assert.deepEqual(byId(assertCardGates(scene, [{ part: 1, position: 0, wpe }])[0], 'pair').values, pair.values);
  }
});

test('c09 one colour scale that never moves, and a frame that never refits across parts and states', () => {
  const results = assertCardGates(scene, ALL);
  const HEAT = ['wte', 'wpe-table', 'token-row', 'position-row', 'x-row', 'pair'];
  for (const result of results) for (const id of HEAT) assert.deepEqual(byId(result, id).valueDomain, { min: -0.9, max: 0.9 }, id);
  // The note's claim: 0.9 bounds every toy value and every sum.
  const every = [...Object.values(TOY_WTE).flat(), ...TOY_WPE.flat(), ...ALL.flatMap(s => xAt(s.position, s.wpe)), ...sub(xAt(5, true), xAt(1, true))];
  assert.equal(Math.max(...every.map(Math.abs)), 0.9);
  // The block is sized from the static scene and fitted to each evaluated
  // one: they must agree on every part and state, at scale 1.
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1, 'the taller part fits the viewport unscaled');
  // The capture harness draws a scene.width x scene.height box: it must hold
  // that viewport, or every capture is scaled below true size.
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  for (const [k, result] of results.entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
  }
  // Input-bound opacity never shares an object with a timeline appear.
  assert.ok(!scene.timeline.some(event => /^wpe-lit-/.test(event.target)));
});

test('c09 practice: a transfer question about a third e the card does not draw', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  const text = fx.tokenizer.text;
  assert.equal(text[8], 'e');
  assert.equal([...text].slice(0, 8).filter(ch => ch === 'e').length, 2, 'position 8 is the third e');
  assert.equal(stoi.get(text[8]), IDS[5]);
  assert.ok(activity.prompt.includes('position 8') && activity.prompt.includes('Before we…'));
  assert.ok(8 < fx.architecture.block_size, 'wpe has a row for position 8');
  assert.ok(8 >= TOY_WPE.length, 'the card does not draw that row');
  const ids = activity.answer.options.map(o => o.id);
  assert.ok(ids.includes(activity.expected) && ids.includes(activity.answer.default));
  for (const id of ids) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'differ-same');
  assert.equal(activity.answer.options.find(o => o.id === activity.expected).label, 'wpe on: different · wpe off: identical');
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
  assert.ok(activity.feedbackFail.includes(`block_size = ${fx.architecture.block_size}`));
  assert.ok(activity.feedbackPass.includes('wte row 43') && activity.feedbackPass.includes('wpe row 8'));
});

test('c09 sources: every status is labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Source value', 'Calculated toy example', 'Live calculation', 'What-if']);
  assert.equal(sources.find(s => s.status === 'Calculated toy example').reproduce, undefined, 'authored on the cards, not by the generator');
  const cites = sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`);
  assert.deepEqual(cites, ['model.py:127-128', 'model.py:173-174', 'model.py:177-179', 'model.py:180-181',
    'config/train_shakespeare_char.py:19-19', 'config/train_shakespeare_char.py:24-25', 'data/shakespeare_char/prepare.py:24-33']);
  const [result] = assertCardGates(scene, [{ part: 0, position: 5, wpe: true }]);
  assert.equal(byId(result, 'dropout').label, `Then x = drop(tok_emb + pos_emb): dropout (p = ${fx.architecture.dropout} in training) comes next and is not modelled here.`);
  assert.ok(byId(result, 'wpe-table').label.endsWith(`(6 of ${fx.architecture.block_size} rows)`));
  assert.ok(byId(result, 'wte').label.endsWith(`(5 of ${fx.architecture.vocab_size} rows)`));
});

const PATHS = ['model.py', 'config/train_shakespeare_char.py', 'data/shakespeare_char/prepare.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c09 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  assert.ok(quotes >= 13, `${quotes} quotes checked`);
  const config = pinnedFile('config/train_shakespeare_char.py');
  assert.equal(Number(config[19 - 1].match(/block_size = (\d+)/)[1]), fx.architecture.block_size);
  assert.equal(Number(config[25 - 1].match(/dropout = ([\d.]+)/)[1]), fx.architecture.dropout);
});

test('c09 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
});
