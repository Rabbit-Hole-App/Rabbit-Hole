import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import tl from '../depth/fixtures/training-loss.generated.js';
import g from '../depth/fixtures/generation.generated.js';
import { validateActivity, PREDICATES, describeActivity } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { ungroupedNumbers } from '../../scene-format.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c24-generation-loop.js';

// Independent oracle, typed as the plan lists it (docs/nanogpt-deep-dive-batch5-plans.md,
// c24: the judge's re-computation at iteration 100) - never the module's own strings.
const DRAWN = ['N', 'a', 'k', 'i', 'f', 'o', 'n', 'o'];
const ROMEO = [' ', 'm', 'e', 'l', ':'];
const show = ch => (ch === '\n' ? '⏎' : ch === ' ' ? '•' : ch);
const ROWS = [['\n']];
for (let k = 1; k < DRAWN.length; k += 1) ROWS.push([...ROWS[k - 1], DRAWN[k - 1]]); // rows[k] = rows[k − 1] + drawn[k − 1]
const SHOWN = ROWS.map(row => row.map(show));
// The renderer's chip pitch (CHIP_PAD 16, CHIP_CHAR 9.5, CHIP_GAP 8), from the tokens' left edge at 180.
const chip = t => 32 + t.length * 9.5;
const centreOfColumn = (row, k) => 180 + row.slice(0, k).reduce((s, t) => s + chip(t) + 8, 0) + chip(row[k]) / 2;
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shown = result => result.state.objects.filter(object => object.visible).map(object => object.id);
const labels = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
const BAND = ['band-label', 'band-row', 'band-arrow', 'band-draw', 'band-line'];

test('c24 passes every gate in both states; 40 objects, drawn at scale 1, one frame', () => {
  const results = assertCardGates(scene, reviewStates);
  assert.deepEqual(reviewStates, [{ revealed: false }, { revealed: true }]);
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.default, !!i.hidden]), [['revealed', 'bool', false, true]]);
  assert.equal(scene.inputs.filter(i => !i.hidden).length, 0, 'replay only: no visible control, so no INTERACT row');
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.equal(scene.title, 'The generation loop');
  assert.equal(scene.objects.length, 40);
  assert.equal(scene.height, 729);
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.height >= legibility.viewport.h && scene.height < legibility.viewport.h + 1, JSON.stringify(legibility.viewport));
  assert.ok(scene.width >= legibility.viewport.w);
  // The static frame already holds the revealed band: the reveal never refits the
  // card. Its bottom line (static opacity, blank text until Check) sets the frame's floor.
  assert.equal(legibility.bounds.contributors.yMax, 'band-line');
  for (const [k, result] of results.entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(reviewStates[k]));
  }
  assert.deepEqual(BAND.map(id => byId(results[1], id).visible), [true, true, true, true, true]);
});

test('c24 fixture: the kept checkpoint, the sampling script\'s settings, the judge\'s draws', () => {
  const G = tl.recorded.generation;
  assert.deepEqual(Object.keys(G), ['checkpoint', 'start', 'drawn', 'practice', 'settings']);
  const run = fx.toyRun;
  assert.equal(G.checkpoint, run.checkpoints[run.bestValIndex].iteration);
  assert.equal(G.checkpoint, 100);
  // train.py's rule: the lowest val after iteration 0, below iteration 0's.
  const later = run.checkpoints.filter(c => c.iteration > 0);
  const best = later.reduce((a, c) => (c.val < a.val ? c : a));
  assert.equal(best.iteration, 100);
  assert.ok(best.val < run.checkpoints[0].val);
  assert.equal(best.val, 3.0547);
  assert.equal(G.start, '\n');
  assert.deepEqual(G.drawn, DRAWN);
  assert.deepEqual(G.practice, { start: 'ROMEO:', pass: 5, drawn: ROMEO });
  for (const key of ['start', 'max_new_tokens', 'temperature', 'top_k', 'seed']) assert.deepEqual(G.settings[key], g.sample[key], key);
  assert.deepEqual([g.sample.start.value, g.sample.max_new_tokens.value, g.sample.temperature.value, g.sample.top_k.value, g.sample.seed.value], ['\n', 500, 0.8, 200, 1337]);
  assert.ok(g.sample.top_k.value >= fx.architecture.vocab_size, 'top-k keeps all 65');
});

test('c24 the staircase: row k is handed all of idx, last bold; its draw sits over the same character in row k + 1', () => {
  const [result] = assertCardGates(scene, [{ revealed: false }]);
  SHOWN.forEach((row, i) => {
    const tokens = byId(result, `row-${i + 1}`);
    assert.deepEqual(tokens.tokens, row, `row ${i + 1}`);
    assert.equal(tokens.tokens.length, i + 1, 'pass k is handed k characters (a 1-character start)');
    assert.equal(tokens.cellHighlight, i, 'the last position is bold');
    assert.equal(tokens.tokenStyle, 'labels');
    assert.equal(tokens.y, 128 + 36 * i);
    assert.equal(byId(result, `pass-${i + 1}`).label, `pass ${i + 1}`);
    const draw = byId(result, `draw-${i + 1}`);
    assert.equal(draw.label, show(DRAWN[i]));
    assert.equal(draw.role, 'output');
    // Centred on the next column, which in row k + 1 holds the same character.
    const centre = draw.x + (draw.label.length * 15 * 0.6) / 2;
    const next = [...row, show(DRAWN[i])];
    assert.ok(Math.abs(centre - centreOfColumn(next, i + 1)) < 1e-9, `draw ${i + 1} centred on column ${i + 1}`);
    if (i + 1 < SHOWN.length) assert.equal(SHOWN[i + 1][i + 1], draw.label);
  });
  // The returned text is idx: the start and every draw (9 characters after 8 passes).
  assert.equal([...ROWS.at(-1), DRAWN.at(-1)].length, 1 + 8);
  assert.equal(byId(result, 'growth').label, 'Passes 1 to 8 added 8 characters: idx grew from 1 character to 9.');
});

test('c24 layout: captions, then the legend, right under the staircase; the practice band last', () => {
  const y = id => scene.objects.find(o => o.id === id).initialState.y;
  // Baselines: the first caption is one row pitch under row 8's text, so no blank band splits them.
  assert.equal(y('growth') - (y('row-8') + 21), 39);
  const order = ['growth', 'rule-1', 'rule-2', 'training', 'loop', 'legend', 'toy', 'band-label', 'band-row', 'band-line'].map(y);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // One even step between caption lines: no pair reads as closer than the rest;
  // at most 5 lines under the staircase (the toy note sits under the legend).
  const captions = order.slice(0, 5);
  assert.deepEqual(captions.slice(1).map((v, k) => v - captions[k]), [26, 26, 26, 26]);
  // The legend follows the last caption with no empty slot between them (the
  // owner's 2026-09-29 finding: a reserved band there detached it from the diagram).
  assert.ok(y('legend') - y('loop') <= 32 && y('toy') - y('legend') === 22);
  // The band sits last, set apart from the toy note by more than the caption spacing,
  // and nothing sits under it, so before Check its slot is only trailing space.
  assert.ok(y('band-label') - y('toy') > 26);
  assert.equal(Math.max(...scene.objects.map(o => o.initialState.y ?? 0)), y('band-line'));
  // The practice draw sits on the row's line after the arrow, never as an 11th cell.
  assert.equal(y('band-arrow'), y('band-draw'));
});

test('c24 replay: each draw appears before the row that is handed it; captions from 3.3 s', () => {
  const at = id => scene.timeline.find(e => e.action === 'appear' && e.target === id)?.at;
  for (let k = 1; k <= 8; k += 1) {
    assert.equal(at(`row-${k}`), Number((0.4 * (k - 1)).toFixed(1)));
    assert.equal(at(`pass-${k}`), at(`row-${k}`));
    assert.equal(at(`draw-${k}`), Number((0.4 * (k - 1) + 0.2).toFixed(1)));
    if (k < 8) assert.ok(at(`draw-${k}`) + 0.2 <= at(`row-${k + 1}`) + 1e-9, `draw ${k} is in before row ${k + 1}`);
  }
  for (const id of ['growth', 'rule-1', 'rule-2', 'training', 'loop', 'toy']) assert.equal(at(id), 3.3, id);
  assert.ok(!scene.timeline.some(e => BAND.includes(e.target)), 'the band has no appear: its opacity follows the latch');
  // Mid-replay (1.5 s): rows 1-4 and draws 1-3 are in; nothing of row 5 or the captions.
  const mid = shown(evaluated(scene, { revealed: false }, 1.5));
  for (const id of ['row-1', 'row-4', 'draw-3']) assert.ok(mid.includes(id), id);
  for (const id of ['row-5', 'draw-5', 'growth']) assert.ok(!mid.includes(id), id);
  const end = shown(evaluated(scene, { revealed: false }));
  for (let k = 1; k <= 8; k += 1) for (const id of [`row-${k}`, `pass-${k}`, `draw-${k}`]) assert.ok(end.includes(id), id);
  assert.ok(scene.duration >= 3.6);
});

test('c24 before Check nothing of the practice case is on the card; after, the band shows it', () => {
  const [before, after] = assertCardGates(scene, reviewStates);
  const all = labels(before).join('\n');
  assert.doesNotMatch(all, /ROMEO|506|10 characters/);
  // No count above 9 anywhere on the default surface, and no row of 10 tokens.
  for (const n of all.match(/\d+/g).map(Number).filter(n => n !== 100)) assert.ok(n <= 9, `${n} on the default surface`);
  assert.ok(before.state.objects.filter(o => o.type === 'tokens').every(o => o.tokens.length <= 9));
  // The band's evaluated values are blank, not only transparent. Its bottom line
  // stays at opacity 1 (so the static frame holds the band) with blank text.
  for (const id of BAND) {
    const o = byId(before, id);
    assert.equal(o.opacity, id === 'band-line' ? 1 : 0, id);
    assert.doesNotMatch(JSON.stringify([o.label, o.tokens]), /ROMEO|R.*O.*M|506|10|:/, id);
  }
  assert.deepEqual(byId(before, 'band-row').tokens, []);
  assert.equal(byId(before, 'band-line').label.trim(), '');
  // Before Check nothing reads under the toy note - the main scene only, no
  // placeholder line (owner, 2026-09-29); after it, the whole band does.
  const reads = o => o.visible && o.opacity > 0 && ((o.label || '').trim() || o.tokens?.length);
  const slot = result => result.state.objects.filter(o => o.y > byId(result, 'toy').y && reads(o)).map(o => o.id);
  assert.deepEqual(slot(before), []);
  assert.deepEqual(slot(after), BAND);
  // After a committed attempt: 6 + 4 = 10 characters, the last bold, the draw and the line.
  const row = byId(after, 'band-row');
  assert.deepEqual(row.tokens, [...'ROMEO:', ...ROMEO.slice(0, 4)].map(show));
  assert.equal(row.tokens.length, 6 + 4);
  assert.equal(row.cellHighlight, 9);
  assert.equal(byId(after, 'band-label').label, 'Practice case: start ROMEO: (6 characters), pass 5');
  assert.equal(byId(after, 'band-draw').label, ':');
  // An arrow takes the next column and the draw the one after, so the draw sits
  // two pitches from the last handed cell: counting cells up to the arrow gives 10.
  assert.equal(byId(after, 'band-arrow').label, '→');
  assert.ok(Math.abs(byId(after, 'band-arrow').x + 4.5 - centreOfColumn([...row.tokens, '→'], 10)) < 1e-9);
  assert.ok(Math.abs(byId(after, 'band-draw').x + 4.5 - centreOfColumn([...row.tokens, '→', ':'], 11)) < 1e-9);
  const pitch = chip(':') + 8;
  assert.ok(centreOfColumn([...row.tokens, '→', ':'], 11) - centreOfColumn(row.tokens, 9) >= 2 * pitch - 1e-9, 'a gap clearly wider than the pitch');
  assert.equal(byId(after, 'band-line').label, `handed ${6 + 4} characters · returns 6 + 500 = ${6 + 500}`);
  for (const id of BAND) assert.equal(byId(after, id).opacity, 1, id);
  // The reveal adds a case; the staircase and its captions are unchanged.
  for (const id of ['row-8', 'draw-8', 'growth', 'rule-1', 'legend']) assert.deepEqual(byId(after, id).label, byId(before, id).label);
  assert.deepEqual(byId(after, 'row-8').tokens, byId(before, 'row-8').tokens);
});

test('c24 captions are true at both states; status words only; no citations, no probabilities', () => {
  const STATIC = {
    question: 'What does generate() repeat for each new character?',
    status: 'Recorded toy run (a bigram, not NanoGPT; iteration 100, the kept checkpoint): the draws · Source value: the start',
    'builds-on': 'Builds on: generation keeps only the last position’s prediction; a draw is a weighted random pick',
    setup: 'NanoGPT’s sampling script starts from one new line (⏎). The first 8 passes of generate():',
    'rule-1': 'Each pass hands the model all of idx so far, at most its last block_size characters.',
    'rule-2': 'Its last position’s prediction gives a draw, appended and handed to the next pass.',
    training: 'Training scores all positions in one pass: its text is given. Here the newest character is a draw.',
    loop: 'The loop runs max_new_tokens passes, with no other stop, and returns all of idx, the start included.',
    toy: 'Toy: the bigram reads only the last character it is handed; NanoGPT’s Blocks read the whole row.',
    legend: '⏎ = new line · • = space · bold: the position whose prediction is drawn from · colour: the draw',
  };
  for (const result of assertCardGates(scene, reviewStates)) {
    for (const [id, label] of Object.entries(STATIC)) assert.equal(byId(result, id).label, label, id);
    // Bold and colour are keyed once, in the legend, never again in a caption.
    assert.deepEqual(labels(result).filter(l => /\bbold\b|colou?r/i.test(l)), [STATIC.legend]);
    const all = labels(result).join('\n');
    for (const status of ['Recorded toy run', 'Source value']) assert.ok(all.includes(status), status);
    assert.doesNotMatch(all, /\.py\b|\.js\b|\bline \d|[a-z]:\d|\b[0-9a-f]{7}\b/);
    // c25's ground: no probabilities, never that the draw changes the next prediction.
    assert.doesNotMatch(all, /%|probab|changes the (next )?prediction/i);
    // c23's ground: the crop itself never reaches a caption; its bound is named
    // once, as scope, so "all of idx" is true for every pass of the depicted
    // 500-pass call (past 256 characters idx_cond is cropped).
    assert.deepEqual(labels(result).filter(l => /block_size|crop|256/.test(l)), ['Each pass hands the model all of idx so far, at most its last block_size characters.']);
    assert.doesNotMatch(all, /crop|256/);
    // "handed" is the forward's input, "reads" what the prediction depends on:
    // only the toy line reads; nothing says a pass is handed only its last character.
    assert.deepEqual(labels(result).filter(l => /\breads?\b/.test(l)).length, 1);
    assert.match(byId(result, 'toy').label, /reads/);
    assert.doesNotMatch(all, /predicts from the last position only|next input is the last draw/);
    // The loop's fixed end and the return value are body text, not a footnote.
    assert.equal(byId(result, 'loop').typography, 'body');
    assert.deepEqual(labels(result).flatMap(ungroupedNumbers), []);
  }
});

test('c24 practice: a 6-character start at pass 5 - graded, naive default wrong, options exclusive, feedback true', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.equal(activity.revealInput, 'revealed');
  assert.equal(activity.fixedInputs, undefined);
  const START = 6, PASS = 5, MAX = 500;
  const handed = START + (PASS - 1), returns = START + MAX;
  assert.deepEqual([handed, returns], [10, 506]);
  assert.deepEqual(activity.answer.options.map(o => [o.id, o.label]), [
    ['lastOnly', 'handed 1, returns 506'],
    ['passNumber', 'handed 5, returns 501'],
    ['newOnly', 'handed 10, returns 500'],
    ['full', 'handed 10, returns 506'],
  ]);
  assert.equal(new Set(activity.answer.options.map(o => o.label)).size, 4, 'mutually exclusive');
  assert.equal(activity.answer.options.filter(o => o.label === `handed ${handed}, returns ${returns}`).length, 1, 'exactly one is right');
  assert.equal(activity.expected, 'full');
  assert.equal(activity.answer.default, 'lastOnly');
  for (const { id } of activity.answer.options) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'full');
  assert.equal(activity.prompt, 'Suppose NanoGPT’s sampling script starts from ROMEO: (6 characters; in shakespeare_char one token ID is one character) instead of one new line, with max_new_tokens = 500. In one generate() call, how many characters is the model handed on pass 5, and how many characters does generate() return?');
  // A one-word answer label keeps all four options on one row (none alone).
  assert.equal(activity.answer.label, 'Characters');
  assert.equal(activity.feedbackPass, 'Right. idx is the start plus one draw per earlier pass: pass 5 is handed 6 + 4 = 10 characters, all read by NanoGPT’s Blocks. generate() returns the start plus max_new_tokens: 6 + 500 = 506. Only a 1-character start makes pass k hold k.');
  // Slack under two lines: the 269-character version filled line 1 to 912 of 924 px.
  assert.ok(activity.feedbackPass.length <= 240, `${activity.feedbackPass.length} characters`);
  // One clause per distractor: handed 1, handed 5, returns 500.
  for (const phrase of ['all of idx', 'only the last position’s prediction is kept', 'the toy bigram reads only the last', 'start + (k − 1)', 'pass k holds k only for a 1-character start', 'which still holds the start', '6 + 4 = 10', '6 + 500 = 506']) {
    assert.ok(activity.feedbackFail.includes(phrase), phrase);
  }
  // At most two text-xs lines in the 948 px practice box of a 984 px capture
  // (measured: 279 characters wrap to 2 lines there; the 448-character version took 3).
  for (const t of [activity.feedbackPass, activity.feedbackFail]) assert.ok(t.length <= 290, `${t.length} characters`);
  assert.doesNotMatch(describeActivity({ activity, activityAnswer: 'lastOnly' }), /"full"|handed 10, returns 506/);
  for (const t of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) {
    assert.doesNotMatch(t, /\.py\b|:\d+|generate_fixtures/);
    assert.doesNotMatch(t, /block_size|crop|256/, 'the crop is c23\'s');
    assert.deepEqual(ungroupedNumbers(t), []);
  }
});

test('c24 plan: staged, verbatim objective, Generation context 1 of 3, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(plan.boundary.reviewed, {});
  assert.equal(plan.objective, 'After this card, the learner should understand that generate() is a loop of exactly max_new_tokens passes that each hand the model all of idx so far (at most its last block_size characters), take the prediction at its last position, draw one character from it and append it, so idx grows by one per pass and the returned text is the start plus max_new_tokens characters.');
  const { name, position, of, relationships } = plan.boundary.sequence;
  assert.deepEqual([name, position, of], ['Generation context', 1, 3]);
  assert.deepEqual(relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c01-forward-pass', 'in'],
    ['prerequisite', 'c21-temperature', 'in'],
    ['prerequisite', 'c25-autoregressive-conditioning', 'out'],
    ['deepens', 'c23-context-window', 'out'],
  ]);
  assert.equal(plan.causalSteps.length, 6);
});

test('c24 the Sources & evidence panel, open before Check, never gives the practice answer', () => {
  // SourcesDisclosure renders every title and note under the card, collapsed but openable at any time.
  for (const s of sources) {
    assert.doesNotMatch(`${s.title || ''} ${s.note || ''}`, /506|6 \+ 4|6 \+ 500|handed 10|\b10 characters/, `${s.kind} ${s.path || s.title}`);
  }
});

test('c24 sources: every status labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  assert.deepEqual(sources.filter(s => s.kind === 'calculation').map(s => s.status), ['Recorded toy run', 'Source value']);
  const recorded = sources.find(s => s.status === 'Recorded toy run');
  assert.match(recorded.reproduce, /gen_training_loss\.py --check$/);
  assert.ok(recorded.note.includes('N a k i f o n o') && recorded.note.includes('• m e l :'), 'the practice draws sit under Recorded toy run');
  assert.match(sources.find(s => s.status === 'Source value').reproduce, /gen_generation\.py --check$/);
  assert.deepEqual(sources.filter(s => s.kind === 'code').map(s => `${s.path}:${s.lines.join('-')}`), [
    'model.py:305-309', 'model.py:312-312', 'model.py:314-314', 'model.py:316-318', 'model.py:320-322', 'model.py:324-326',
    'model.py:328-328', 'model.py:330-330', 'model.py:170-170', 'model.py:180-181', 'model.py:189-190',
    'sample.py:14-19', 'sample.py:80-81', 'sample.py:86-88', 'sample.py:23-26', 'sample.py:37-38',
    'train.py:274-286', 'config/train_shakespeare_char.py:9-10', 'train.py:124-125', 'train.py:300-300',
    'model.py:184-187', 'config/train_shakespeare_char.py:19-19', 'data/shakespeare_char/prepare.py:30-35']);
  // "Scores every position" rests on the with-targets branch, not only the call.
  assert.match(sources.find(s => s.path === 'model.py' && s.lines[0] === 184).note, /"logits = self\.lm_head\(x\)"/);
  assert.ok(evidence.provenance.includes(':184-187'));
  // The row bound covers the revealed practice row too.
  assert.doesNotMatch(sources.find(s => s.path === 'model.py' && s.lines[0] === 314).note, /t ≤ 9/);
  assert.equal(fx.architecture.block_size, 256, '256 is in sources only; the card names block_size as scope');
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py', 'data/shakespeare_char/prepare.py', 'sample.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c24 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  assert.ok(quotes >= 30, `${quotes} quotes checked`);
  const model = pinnedFile('model.py');
  // The loop has no other stop, and idx itself is the only return.
  const body = model.slice(312 - 1, 330);
  assert.ok(!body.some(l => /\bbreak\b/.test(l)), 'no break in 312-330');
  assert.deepEqual(body.flatMap((l, i) => (/\breturn\b/.test(l) ? [312 + i] : [])), [330]);
  assert.match(model[330 - 1], /^\s*return idx$/);
  const sample = pinnedFile('sample.py');
  assert.match(sample[14 - 1], /^start = "\\n" /);
  assert.match(sample[16 - 1], /^max_new_tokens = 500 /);
  assert.equal(g.sample.start.line, 14);
  assert.equal(g.sample.max_new_tokens.line, 16);
  assert.match(pinnedFile('config/train_shakespeare_char.py')[10 - 1], /^always_save_checkpoint = False$/);
});

const DATASET = join(tmpdir(), 'nanogpt-fixture-cache', fx.provenance.dataset.sha256);
test('c24 the practice start begins 163 lines of Tiny Shakespeare', { skip: !existsSync(DATASET) && 'dataset cache absent' }, () => {
  const lines = readFileSync(DATASET, 'utf8').split('\n');
  assert.equal(lines.filter(l => l.startsWith('ROMEO:')).length, 163);
  assert.ok(sources.some(s => s.kind === 'dataset' && s.note.includes('begins 163 lines')));
});

test('c24 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
  assert.equal(evidence.learningQuestion, 'What does generate() repeat for each new character?');
});
