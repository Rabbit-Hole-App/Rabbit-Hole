import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import tl from '../depth/fixtures/training-loss.generated.js';
import { estimateTextBox, gridAxisLabelBoxes, sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { ungroupedNumbers } from '../../scene-format.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { CHIP_CHAR, CHIP_GAP, CHIP_PAD } from '../../animation-scene.js';
import * as card from './c25-autoregressive-conditioning.js';

const { scene, plan, reviewStates, sources, evidence } = card;

// Independent oracle, typed as the plan lists it (docs/nanogpt-deep-dive-batch5-plans.md,
// c25, "Values at iteration 100", judge re-computed) - never the scene's derive graph.
const COLUMNS = ['•', 'a', 'e', 'i', 'n', 'r', 't', 'w'];
const TABLE = [ // prev, pairs, cells (%) in column order, printed other 57, texts
  ['e', 122, [19.8998, 8.1513, 3.5862, 1.2795, 8.5909, 11.2289, 1.4218, 0.1931], '45.65', [['Before we', 15], ['hear me', 46]]],
  [' ', 171, [0.1798, 9.0717, 2.0178, 5.7338, 0.6328, 4.3081, 12.1533, 7.0709], '58.83', [['Before we ', 15], ['hear me ', 46]]],
  ['h', 39, [0.2600, 11.3547, 39.0422, 18.0488, 0.2600, 0.2577, 3.1119, 0.2587], '27.41', [['to famish', 137], ['this with', 878]]],
  [',', 14, [72.2448, 0.4248, 0.4362, 0.4330, 0.4415, 0.4328, 0.4310, 0.4339], '24.72', [['further,', 37], ['Speak,', 67]]],
];
const NAMES = ['‘e’', '‘•’', '‘h’', '‘,’'];
// The ‘•’ line names the space as Shakespeare's own next character, not a draw; the
// ‘h’ and ‘,’ line holds when the appended character is the same one again.
const APPEND = [
  'Append ‘•’, as Shakespeare does next, and the toy switches to row ‘•’: pick the ‘•’ preset.',
  'The ‘e’ texts plus Shakespeare’s next character, ‘•’ (not a draw): the toy switched to row ‘•’.',
  'Append any character and the next row is that character’s row; the toy reads nothing before it.',
  'Append any character and the next row is that character’s row; the toy reads nothing before it.',
];
// Chip metrics as the renderer draws a token (AnimatedScene.jsx token path).
const chipW = token => CHIP_PAD * 2 + token.length * CHIP_CHAR;
const lastCentre = row => row.x + row.tokens.slice(0, -1).reduce((sum, t) => sum + chipW(t) + CHIP_GAP, 0) + chipW(row.tokens.at(-1)) / 2;
const ALL = TABLE.map((unused, prev) => ({ prev }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shown = result => result.state.objects.filter(object => object.visible).map(object => object.id);
const labels = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
const tokensOf = t => ['…', ...[...t].map(ch => (ch === ' ' ? '•' : ch))];

test('c25 passes every gate at every review state', () => {
  assertCardGates(scene, reviewStates);
  assert.deepEqual(reviewStates, ALL);
  // One INTERACT control: the previous-character preset picker, default ‘e’.
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.presentation, i.label, i.default, i.hidden]),
    [['prev', 'index', 'picker', 'Previous character (preset)', 0, undefined]]);
  assert.deepEqual(scene.exampleData.prevLabels, ['‘e’', '‘•’ (space)', '‘h’', '‘,’ (comma)']);
  // Explore-only (inventory row 25): no practice.
  assert.equal(card.activity, undefined);
});

test('c25 fixture: the recorded bigram at the checkpoint the save rule keeps, four real conditions', () => {
  const C = tl.recorded.conditioning;
  assert.deepEqual(Object.keys(C), ['iteration', 'columns', 'presets']);
  // Iteration 100: toyRun's lowest validation loss after iteration 0 (c18), the one ckpt.pt holds.
  const run = fx.toyRun;
  assert.equal(C.iteration, 100);
  assert.equal(C.iteration, run.checkpoints[run.bestValIndex].iteration);
  const afterZero = run.checkpoints.filter(c => c.iteration > 0);
  assert.equal(Math.min(...afterZero.map(c => c.val)), run.checkpoints[run.bestValIndex].val);
  assert.equal(tl.recorded.generation.checkpoint, C.iteration, 'c24 and c25 share the checkpoint');
  assert.deepEqual(C.columns.map(c => (c === ' ' ? '•' : c)), COLUMNS);
  TABLE.forEach(([prev, pairs, cells, rest, texts], k) => {
    const p = C.presets[k];
    assert.equal(p.prev, prev);
    assert.equal(p.pairs, pairs);
    assert.ok(p.pairs >= 14);
    p.p.forEach((v, i) => assert.ok(Math.abs(v * 100 - cells[i]) < 1e-6, `${prev} ${COLUMNS[i]}`));
    assert.ok(Math.abs(p.rest * 100 - (100 - cells.reduce((a, b) => a + b, 0))) < 1e-3, `${prev} rest`);
    assert.ok(C.columns.includes(p.argmax), `${prev} argmax among the columns`);
    assert.ok(Math.min(...p.p) * 100 >= 0.005, `${prev} min cell`);
    assert.deepEqual(p.texts.map(t => [t.text, t.at]), texts);
    for (const t of p.texts) assert.ok(t.text.endsWith(prev), `${t.text} ends in ${prev}`);
    assert.ok(Math.abs(Number((100 - cells.reduce((a, b) => a + b, 0)).toFixed(2)) - Number(rest)) <= 0.01);
  });
  // The sp texts are the ‘e’ texts plus the space that follows them.
  assert.deepEqual(C.presets[1].texts, C.presets[0].texts.map(t => ({ text: `${t.text} `, at: t.at })));
});

const dataset = (() => {
  const { sha256 } = fx.provenance.dataset;
  const file = join(tmpdir(), 'nanogpt-fixture-cache', sha256);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
  return bytes.toString('utf8');
})();
test('c25 every text is training-slice text at its recorded position', { skip: !dataset && 'dataset cache absent (run generate_fixtures.py)' }, () => {
  const slice = dataset.slice(0, Math.floor(dataset.length * 0.9)).slice(0, fx.toyRun.config.train_chars);
  for (const [, , , , texts] of TABLE) {
    for (const [t, at] of texts) assert.equal(slice.slice(at, at + t.length), t, t);
  }
  // What really follows the ‘e’ texts in Shakespeare is a space (the ‘e’ append line).
  for (const [t, at] of TABLE[0][4]) assert.equal(slice[at + t.length], ' ', t);
});

test('c25 every stage follows the previous character and matches the oracle', () => {
  const results = assertCardGates(scene, ALL);
  TABLE.forEach(([prev, , cells, rest, texts], k) => {
    const result = results[k], d = result.derived;
    assert.equal(d.prevName, NAMES[k]);
    // ① two texts ending in prev, '…' first, the last token bold as what the toy reads.
    for (const [id, [t]] of [['text-a', texts[0]], ['text-b', texts[1]]]) {
      const row = byId(result, id);
      assert.deepEqual(row.tokens, tokensOf(t));
      assert.equal(row.cellHighlight, row.tokens.length - 1);
      assert.equal(row.cellHighlightKind, 'highlight');
      assert.equal(row.tokenStyle, 'labels');
      assert.equal(row.tokens.at(-1), prev === ' ' ? '•' : prev);
      // The row is named by its text as words, so it reads without spelling the tokens;
      // a trailing space is the card's ‘•’ after the quotes, never a bare space before “”” (R-c25-1).
      assert.equal(byId(result, `${id}-label`).label, t.endsWith(' ') ? `“…${t.trimEnd()}” + ‘•’` : `“…${t}”`);
      assert.doesNotMatch(byId(result, `${id}-label`).label, /\s”/);
    }
    // Both read characters stack in one column (x-centres within 4 units), and one
    // box - a mark beyond font weight - encloses that column in both rows.
    const [a, b] = ['text-a', 'text-b'].map(id => byId(result, id));
    assert.ok(Math.abs(lastCentre(a) - lastCentre(b)) <= 4, `${prev}: ${lastCentre(a)} vs ${lastCentre(b)}`);
    const box = byId(result, 'read-box');
    assert.equal(box.type, 'box');
    assert.ok(box.visible);
    for (const row of [a, b]) {
      const c = lastCentre(row), half = chipW(row.tokens.at(-1)) / 2;
      assert.ok(box.x <= c - half && c + half <= box.x + box.w, `${prev}: box spans the last token`);
      assert.ok(box.x > c - half - CHIP_GAP - chipW(row.tokens.at(-2)) / 2, `${prev}: box stops before the token before it`);
      assert.ok(box.y <= row.y && row.y + row.h <= box.y + box.h, `${prev}: box spans row ${row.id}`);
    }
    // ③ the row: 8 fixed columns, the recorded cells, bars on the same values, the live rest.
    const grid = byId(result, 'row');
    assert.deepEqual(grid.columnLabels, COLUMNS);
    assert.deepEqual(grid.rowLabels, ['p (%)']);
    grid.values.forEach((v, i) => assert.ok(Math.abs(v - cells[i]) < 1e-9, `${prev} ${COLUMNS[i]}`));
    assert.deepEqual(byId(result, 'bars').values, grid.values);
    assert.equal(grid.cellHighlight, null, 'nothing is lit as most likely');
    assert.equal(byId(result, 'bars').cellHighlight, null);
    const restCell = byId(result, 'rest');
    assert.equal(restCell.values.length, 1);
    assert.ok(Math.abs(restCell.values[0] + cells.reduce((a, b) => a + b, 0) - 100) < 1e-6, `${prev} cells + rest = 100`);
    assert.equal(restCell.values[0].toFixed(2), rest);
    // 'the other 57 / together' in two lines over its own 60-wide cell.
    assert.deepEqual(restCell.columnLabels, ['together']);
    assert.equal(byId(result, 'rest-label').label, 'the other 57');
    // Captions naming a text or a row follow the preset.
    // The mark is named as drawn: bold (c24's word) and boxed.
    assert.equal(byId(result, 'reads-toy').label, `The toy reads only the bold, boxed last character, ${NAMES[k]} in both: both get one row.`);
    // The toy's table holds logits; p is the softmax of the row.
    assert.equal(byId(result, 'row-caption').label, `Softmax of row ${NAMES[k]} of the toy’s 65 × 65 logit table: p(next | previous ${NAMES[k]})`);
    assert.equal(byId(result, 'append').label, APPEND[k]);
    // The rest appears only in its cell, never in text.
    assert.ok(!labels(result).some(l => l.includes(rest)), rest);
  });
  // Peaked after the comma, spread after sp: the condition alone moves the distribution.
  assert.ok(Math.max(...TABLE[3][2]) > 70 && Math.max(...TABLE[1][2]) < 13);
  // ‘e’ → sp: the same two texts, one space longer, get a different row.
  assert.deepEqual(byId(results[1], 'text-a').tokens, [...byId(results[0], 'text-a').tokens, '•']);
  assert.notDeepEqual(byId(results[1], 'row').values, byId(results[0], 'row').values);
});

test('c25 captions are true at every state; status words only; no most-likely marker', () => {
  const STATIC = {
    question: 'What does the next-character prediction read of the text so far?',
    // 'iteration 100, the kept checkpoint' in c24's words: c26 prints this table at iteration 1000.
    // No header line ends in a bare symbol or number (visual review V-c25-V1).
    'status-1': 'Recorded toy run (a bigram reading only the previous character, not NanoGPT; iteration 100, the kept checkpoint)',
    'status-2': 'Live calculation: the other 57 together · Source value: the texts, 65 characters, NanoGPT’s 256-character window',
    'builds-on': 'Builds on: generation appends each draw to the text; attention lets the last position read earlier ones',
    'reads-nano': 'NanoGPT reads all of each text, up to 256 characters back, so its two predictions can differ.',
    'bars-top-tag': 'bar height 100%',
    'bars-zero-tag': 'bar height 0%',
    'rest-label': 'the other 57',
    legend: 'the same 8 of the 65 next characters for every row, each cell rounded on its own; • = space; … = earlier text',
    loop: 'When it writes, each draw is appended and becomes the next previous character.',
    'nano-1': 'NanoGPT: generate() takes the logits at the last position of the text it is handed.',
    'nano-2': 'Through attention that position can read every earlier character and its position; the toy reads one.',
  };
  for (const result of assertCardGates(scene, ALL)) {
    for (const [id, label] of Object.entries(STATIC)) assert.equal(byId(result, id).label, label, id);
    // The 100% line under the grid is named as the bars' scale, never a bare total,
    // and its tag sits left of the line, away from the 8 cells and the rest cell.
    assert.ok(labels(result).filter(l => l.includes('100%')).every(l => l.includes('bar height')));
    assert.ok(byId(result, 'bars-top-tag').x < byId(result, 'bars-top').from.x);
    assert.ok(byId(result, 'bars-zero-tag').x < byId(result, 'bars-top').from.x);
    for (const id of ['status-1', 'status-2']) assert.doesNotMatch(byId(result, id).label, /\s(\p{L}|\d+)$/u, id);
    const all = labels(result).join('\n');
    for (const status of ['Recorded toy run', 'Live calculation', 'Source value']) assert.ok(all.includes(status), status);
    assert.doesNotMatch(all, /\.py\b|\.js\b|\bline \d|[a-z]:\d|\b[0-9a-f]{7}\b/);
    // Nothing cues greedy decoding or a winner (c21 and c22 own those).
    assert.doesNotMatch(all, /most likely|most-likely|argmax|greedy|winner|\btop\b|the model picks/i);
    // The toy is never NanoGPT, and NanoGPT never reads only the previous character.
    assert.match(all, /not NanoGPT/);
    assert.doesNotMatch(all, /NanoGPT reads only/);
    assert.deepEqual(labels(result).flatMap(ungroupedNumbers), []);
    // Body lines stay 95 characters or fewer.
    for (const o of result.state.objects.filter(o => o.visible && o.type === 'text' && !o.typography)) assert.ok(o.label.length <= 95, `${o.id}: ${o.label.length}`);
  }
});

test('c25 replay: the texts, what is read, the row, then the loop', () => {
  const at = time => shown(evaluated(scene, {}, time));
  const TEXTS = ['read-box', 'text-a-label', 'text-a', 'text-b-label', 'text-b'];
  const READS = ['reads-toy', 'reads-nano'];
  const ROW = ['row-caption', 'row', 'rest', 'rest-label'];
  const BARS = ['bars', 'bars-top', 'bars-top-tag', 'bars-zero-tag'];
  const LOOP = ['loop', 'append', 'nano-1', 'nano-2'];
  const none = (ids, time) => !ids.some(id => at(time).includes(id));
  assert.ok(TEXTS.every(id => at(0.4).includes(id)) && none([...READS, ...ROW, ...BARS, ...LOOP], 0.4), at(0.4).join());
  assert.ok(READS.every(id => at(0.95).includes(id)) && none([...ROW, ...BARS, ...LOOP], 0.95), at(0.95).join());
  assert.ok(ROW.every(id => at(1.35).includes(id)) && none([...BARS, ...LOOP], 1.35), at(1.35).join());
  assert.ok(BARS.every(id => at(1.75).includes(id)) && none(LOOP, 1.75), at(1.75).join());
  for (const id of [...TEXTS, ...READS, ...ROW, ...BARS, ...LOOP]) assert.ok(at(scene.duration).includes(id), id);
  // Always drawn: the question, the status lines and the legend.
  assert.ok(['question', 'status-1', 'status-2', 'builds-on', 'legend'].every(id => at(0).includes(id)));
});

test('c25 one frame at scale 1 that never refits across presets', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  assert.ok(scene.height <= 900);
  for (const [k, result] of assertCardGates(scene, ALL).entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
    // Rows end on one column; every row, the longest ('…Before we sp', 11 tokens)
    // included, starts a token pitch or more right of its label's estimated
    // right edge (R-c25-2), and no row passes the box's right edge.
    const pitch = chipW('e') + CHIP_GAP;
    for (const id of ['text-a', 'text-b']) {
      const row = byId(result, id), label = byId(result, `${id}-label`);
      const labelRight = estimateTextBox({ text: label.label, x: label.x, y: label.y, fontSize: 15, anchor: 'start', baseline: 'auto' }).xMax;
      assert.ok(row.x - labelRight >= pitch, `${id}: gap ${row.x - labelRight} < ${pitch}`);
      assert.ok(row.x + row.w - CHIP_GAP <= byId(result, 'read-box').x + byId(result, 'read-box').w, `${id} ends at ${row.x + row.w}`);
    }
  }
  // The bar scale: its 100% line groups with the bars, at least 24 below the grid,
  // and a 0% tag names the baseline (visual review V-c25-V4).
  const result = evaluated(scene, {}, scene.duration);
  const grid = byId(result, 'row'), bars = byId(result, 'bars');
  assert.ok(byId(result, 'bars-top').from.y - (grid.y + grid.h) >= 24);
  assert.ok(Math.abs(byId(result, 'bars-zero-tag').y - 4 - (bars.y + bars.h)) < 1e-9, 'the 0% tag sits on the baseline');
  // The rest label's lines sit over their own cell, clear of the 'w' label by a
  // neighbour gap or more (visual review V-c25-V3).
  const rest = byId(result, 'rest'), code = { fontSize: 13, anchor: 'start', baseline: 'auto' };
  const w = gridAxisLabelBoxes(grid).at(-1);
  const wRight = estimateTextBox({ ...w, fontSize: 13 }).xMax;
  const first = byId(result, 'rest-label');
  assert.ok(first.x - wRight >= 40, `gap ${first.x - wRight}`);
  const centre = first.x + 43;
  assert.ok(Math.abs(centre - (rest.x + rest.w / 2)) <= 1, `centre ${centre}`);
  assert.ok(estimateTextBox({ text: first.label, x: first.x, y: first.y, ...code }).yMax <= estimateTextBox({ ...gridAxisLabelBoxes(rest)[0], fontSize: 13 }).yMin, 'line 1 above line 2');
  assert.equal(scene.objects.length, 24);
});

test('c25 plan: staged, verbatim objective, sequence "Generation context" 2 of 3, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(Object.keys(plan.boundary.reviewed), []);
  assert.equal(plan.objective, 'After this card, the learner should understand that each next-character prediction is a whole distribution conditioned on what the model reads of the text so far, its own earlier draws included, which for the recorded bigram is only the previous character and for NanoGPT is the whole cropped window idx_cond.');
  const seq = plan.boundary.sequence;
  assert.deepEqual([seq.name, seq.position, seq.of], ['Generation context', 2, 3]);
  assert.deepEqual(seq.relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c24-generation-loop', 'in'],
    ['prerequisite', 'c23-context-window', 'out'],
    ['prerequisite', 'c05-position-mixing', 'in'],
    ['deepens', 'c01-forward-pass', 'in'],
  ]);
  assert.equal(scene.id, 'nanogpt-c25-autoregressive-conditioning');
  assert.equal(scene.title, 'Autoregressive conditioning');
  assert.equal(plan.causalSteps.length, 4);
  assert.match(plan.check, /^none: explore-only/);
});

test('c25 sources: every status labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Recorded toy run', 'Live calculation', 'Source value']);
  assert.match(sources.find(s => s.status === 'Recorded toy run').reproduce, /gen_training_loss\.py --check$/);
  assert.ok(sources.some(s => s.kind === 'dataset'));
  // Iteration 100 is the kept checkpoint only at the toy run's own evaluations
  // (every 50); shakespeare_char evaluates every 250 (config:5), as c18 says.
  const note = (path, start) => sources.find(s => s.path === path && s.lines[0] === start).note;
  const qualifier = "at this toy run's evaluations every 50 iterations";
  assert.equal(fx.toyRun.config.eval_interval, 50);
  for (const n of [note('config/train_shakespeare_char.py', 9), note('train.py', 274), sources.find(s => s.status === 'Recorded toy run').note]) {
    assert.ok(n.includes(qualifier), n);
  }
  assert.match(note('config/train_shakespeare_char.py', 5), /^"eval_interval = 250 # keep frequent because we'll overfit"/);
  // 65 is the dataset's character set (prepare.py via meta.pkl); only 256 is the config's.
  const value = sources.find(s => s.status === 'Source value').note;
  assert.match(value, /vocab_size 65 is the dataset's sorted character set \(prepare\.py:24-25, which reaches train\.py through meta\.pkl/);
  assert.match(value, /block_size 256 comes from config\/train_shakespeare_char\.py:19/);
  assert.doesNotMatch(value, /resolved shakespeare_char config/);
  assert.ok(note('train.py', 138).includes("meta_vocab_size = meta['vocab_size']"));
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py', 'data/shakespeare_char/prepare.py', 'sample.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c25 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
  const squash = t => t.replace(/\s+/g, ' ').trim();
  let quotes = 0;
  for (const source of sources.filter(s => s.kind === 'code')) {
    const [start, end] = source.lines;
    const cited = squash(pinnedFile(source.path).slice(start - 1, end).join(' '));
    const found = [...source.note.matchAll(/"([^"]+)"/g)];
    assert.ok(found.length > 0, `${source.path}:${start}-${end} quotes nothing`);
    for (const [, quote] of found) {
      quotes += 1;
      assert.ok(cited.includes(squash(quote)), `${source.path}:${start}-${end} lacks "${quote}"`);
    }
  }
  assert.ok(quotes >= 30, `${quotes} quotes checked`);
  // The claims the card makes about NanoGPT, read off the pinned lines.
  const model = pinnedFile('model.py');
  assert.match(model[314 - 1], /idx_cond = idx if idx\.size\(1\) <= self\.config\.block_size else idx\[:, -self\.config\.block_size:\]/);
  assert.match(model[318 - 1], /logits\[:, -1, :\]/);
  assert.match(model[328 - 1], /torch\.cat\(\(idx, idx_next\), dim=1\)/);
  assert.match(model[64 - 1], /is_causal=True/);
  assert.match(pinnedFile('config/train_shakespeare_char.py')[19 - 1], /^block_size = 256 /);
  assert.equal(fx.architecture.block_size, 256);
  assert.equal(fx.architecture.vocab_size, 65);
});

test('c25 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
  assert.equal(evidence.learningQuestion, 'What does the next-character prediction read of the text so far?');
});
