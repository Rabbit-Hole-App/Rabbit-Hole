import test from 'node:test';
import assert from 'node:assert/strict';
import fx from '../fixtures/nanogpt-fixtures.generated.js';
import g from '../depth/fixtures/generation.generated.js';
import { validateActivity, PREDICATES, describeActivity } from '../../scene-activity.js';
import { sceneContentBounds, sceneLegibility } from '../../scene-layout.js';
import { formatCell, ungroupedNumbers } from '../../scene-format.js';
import { assertCardGates, assertCardPlan, assertEvidence, assertSources, evaluated, pinnedFile } from '../card-gates.mjs';
import { scene, plan, reviewStates, activity, sources, evidence } from './c23-context-window.js';

// Independent oracle, typed as the plan lists it (docs/nanogpt-deep-dive-batch5-plans.md, c23,
// "The four states", re-computed by the judge from the pinned input.txt) - never the scene's derive graph.
const SLOTS = ['e', '•', 'd', 't', 'm', 'other'];
const TABLE = [ // block_size, idx_cond, cropped, counts, matches, p (%), most likely
  [2, 'or', 'Bef', [1035, 2461, 1300, 697, 134, 2049], 7676, ['13.48', '32.06', '16.94', '9.08', '1.75', '26.69'], '•'],
  [3, 'for', 'Be', [392, 1238, 133, 279, 90, 299], 2431, ['16.13', '50.93', '5.47', '11.48', '3.70', '12.30'], '•'],
  [4, 'efor', 'B', [339, 0, 33, 6, 7, 3], 388, ['87.37', '0.00', '8.51', '1.55', '1.80', '0.77'], 'e'],
  [5, 'Befor', '', [31, 0, 0, 0, 0, 0], 31, ['100.00', '0.00', '0.00', '0.00', '0.00', '0.00'], 'e'],
];
const CAPTIONS = [
  ['Cropped: “Bef”. After “or” a space leads (32.06%); e gets 13.48%.', 'The e before “for” is cropped too, so e does not lead: it ranks fourth of the 6 columns.'],
  ['Cropped: “Be”. After “for” a space leads (50.93%); e gets 16.13%.', 'Read the e before “for” (block_size 4) and e leads with 87.37%: the crop removed what pointed to e.'],
  ['Cropped: “B”. After “efor”, e leads (87.37%): the e before “for” is still read.', 'Crop that one e (block_size 3) and a space leads instead.'],
  ['No crop: all 5 characters are read; after “Befor”, e followed in 31 of 31 matches.', 'Once idx is longer than block_size, the oldest characters are cropped first.'],
];
const ALL = TABLE.map((unused, block) => ({ block }));
const byId = (result, id) => result.state.objects.find(object => object.id === id);
const shown = result => result.state.objects.filter(object => object.visible).map(object => object.id);
const labels = result => result.state.objects.filter(o => o.visible && o.label).map(o => o.label);
const withoutContributors = box => { const { contributors: _c, ...rest } = box; return rest; };
// The idx characters, one 50-wide slot each from x 170.
const slotLeft = i => 170 + i * 50;

test('c23 passes every gate at every review state and the practice state', () => {
  assertCardGates(scene, [...reviewStates, activity.fixedInputs]);
  assert.equal(scene.objects[0].semanticId, 'question');
  assert.deepEqual(reviewStates, [{ block: 1 }, { block: 0 }, { block: 2 }, { block: 3 }]);
  // One INTERACT control: the What-if toy block_size, default 3; no hidden inputs. A picker, so
  // INTERACT shows "block_size k" chips (a slider's readout says "2 of 4" at block_size 3).
  assert.deepEqual(scene.inputs.map(i => [i.name, i.type, i.presentation, i.label, i.default, i.hidden]),
    [['block', 'index', 'picker', 'What-if: toy block_size (preset)', 1, undefined]]);
  assert.deepEqual(scene.exampleData.blockLabels, ['block_size 2', 'block_size 3', 'block_size 4', 'block_size 5']);
});

test('c23 fixture: the four counting tables over the training split, for the tokenizer card’s first 5 characters', () => {
  const W = g.window;
  assert.deepEqual(Object.keys(W), ['text', 'blocks', 'windows', 'cropped', 'slots', 'counts', 'matches']);
  assert.equal(W.text, 'Befor');
  assert.equal(fx.tokenizer.tokenizers.find(t => t.id === 'char').tokens.slice(0, 5).join(''), W.text);
  assert.deepEqual(W.blocks, TABLE.map(row => row[0]));
  assert.deepEqual(W.windows, TABLE.map(row => row[1]));
  assert.deepEqual(W.cropped, TABLE.map(row => row[2]));
  assert.deepEqual(W.slots, ['e', 'sp', 'd', 't', 'm', 'other'], 'the fixture keeps its slot name sp; the card shows •');
  assert.deepEqual(W.counts, TABLE.map(row => row[3]));
  assert.deepEqual(W.matches, TABLE.map(row => row[4]));
  TABLE.forEach(([k, window, cropped, counts, matches]) => {
    assert.equal(window, W.text.slice(-k));
    assert.equal(cropped + window, W.text);
    assert.equal(counts.reduce((a, b) => a + b, 0), matches, `row sum k=${k}`);
  });
  assert.equal(g.block, 3);
  assert.equal(g.trainChars, 1003854);
});

test('c23 every stage follows block_size and matches the oracle', () => {
  const results = assertCardGates(scene, ALL);
  TABLE.forEach(([k, window, cropped, counts, matches, pct, top], block) => {
    const result = results[block], d = result.derived;
    assert.deepEqual([d.k, d.kept, d.matches, d.top, d.topCh], [k, window, matches, SLOTS.indexOf(top), top]);
    // ① idx at heading size, the cropped characters dimmed; the idx_cond box holds exactly the last k.
    const chars = [0, 1, 2, 3, 4].map(i => byId(result, `idx-${i}`));
    assert.deepEqual(chars.map(c => c.label), ['B', 'e', 'f', 'o', 'r']);
    assert.ok(chars.every(c => c.visible && c.typography === 'heading'), 'idx at heading size (20px), not the 13px token glyphs');
    assert.deepEqual(chars.map(c => c.opacity), [0, 1, 2, 3, 4].map(i => (i >= 5 - k ? 1 : 0.72)));
    assert.equal(chars.slice(5 - k).map(c => c.label).join(''), window);
    const [crop, box, readLabel] = [byId(result, 'crop-bracket'), byId(result, 'read-box'), byId(result, 'read-label')];
    assert.deepEqual([box.x, box.x + box.w], [slotLeft(5 - k) + 4, slotLeft(5) - 4]);
    chars.forEach((c, i) => assert.equal(c.x > box.x && c.x < box.x + box.w, i >= 5 - k, `idx-${i} is in the box iff it is read`));
    assert.equal(readLabel.x, box.x, '"read" hangs under the box’s left edge');
    assert.ok(readLabel.y > box.y + box.h && crop.from.y < box.y, 'read under the box, cropped bracket above the row');
    const cropShown = shown(result).includes('crop-bracket');
    assert.equal(cropShown, k < 5);
    assert.equal(shown(result).includes('crop-label'), k < 5);
    if (k < 5) assert.deepEqual([crop.from.x, crop.to.x], [slotLeft(0) + 4, slotLeft(5 - k) - 4]);
    assert.equal(byId(result, 'crop-label').x, crop.from.x, '"cropped" sits over its bracket, not in the gutter');
    assert.ok(byId(result, 'next-slot').x + 4 * 9 < 590, 'the → ? slot ends before x 590');
    assert.equal(byId(result, 'readout-t').label, `5 characters in idx · toy block_size ${k}`);
    assert.equal(byId(result, 'readout-read').label, `idx_cond (read): “${window}”`);
    // The cropped characters are named as the prompt's (the objective's "prompt included", drawn);
    // with no crop the note compares idx's length, never idx itself, with block_size.
    assert.equal(byId(result, 'readout-crop').label, cropped ? `cropped from the prompt, still in idx: “${cropped}”` : 'no crop: 5 characters ≤ block_size 5');
    // ② that table's row for exactly idx_cond; matches printed ungrouped.
    assert.deepEqual(byId(result, 'counts').values, counts);
    assert.equal(byId(result, 'matches').label, `matches = ${matches}`);
    assert.equal(byId(result, 'matches-note').label, `times “${window}” occurs in the training text`);
    // ③ p = count × 100 / matches, cells and bars, and the most likely next character.
    const p = byId(result, 'p').values;
    assert.deepEqual(p.map(v => formatCell(v)), pct);
    assert.deepEqual(counts.map(c => formatCell(c * 100 / matches)), pct);
    assert.deepEqual(byId(result, 'bars').values, p);
    assert.equal(byId(result, 'bars').cellHighlight, SLOTS.indexOf(top));
    assert.equal(byId(result, 'top-readout').label, `Most likely next: ${top} (${pct[SLOTS.indexOf(top)]}%)`);
    // The winning column is framed, 16 clear of the p grid, and its readout sits beside the frame's top.
    const [frame, pGrid, readout] = [byId(result, 'top-frame'), byId(result, 'p'), byId(result, 'top-readout')];
    assert.deepEqual([frame.x, frame.w], [170 + SLOTS.indexOf(top) * 70 - 1, 72]);
    assert.ok(frame.y - (pGrid.y + pGrid.h) >= 16 && frame.y < byId(result, 'bars').y - 4.76, 'frame clear of the grid, above a popped 100% bar');
    assert.equal(readout.x, frame.x + frame.w + 9);
    assert.ok(readout.y > frame.y && readout.y < frame.y + 30, 'readout level with the frame’s top');
    // Captions: exact, and every percentage in them is a live cell as printed; the two lines that
    // change sit indented beside a quiet left rule (no bordered, input-like box), the constant lines
    // under it, and the caption's top (baseline − 15) is at least 20 clear of the frame's bottom.
    assert.deepEqual([byId(result, 'caption-1').label, byId(result, 'caption-2').label], CAPTIONS[block]);
    const [rule, cap1, cap2] = [byId(result, 'caption-rule'), byId(result, 'caption-1'), byId(result, 'caption-2')];
    assert.ok(rule.type === 'line' && rule.from.x === rule.to.x, 'a vertical rule, not a panel');
    assert.ok(cap1.x > rule.from.x + 8 && cap2.x === cap1.x, 'captions indented off the rule');
    assert.ok(rule.from.y <= cap1.y - 10 && rule.to.y >= cap2.y, 'the rule spans both caption lines');
    assert.ok(byId(result, 'only-idx-cond').y - 15 > rule.to.y, 'the constant lines are below the rule');
    assert.ok(cap1.y - 15 - (frame.y + frame.h) >= 20, 'the caption clears the framed chart by 20');
  });
  // Cropping the one e of "efor" moves the most likely next character from e to a space.
  assert.deepEqual(results.map(r => r.derived.top), [1, 1, 0, 0]);
  const cell = (block, slot) => formatCell(byId(results[block], 'p').values[SLOTS.indexOf(slot)]);
  assert.deepEqual([cell(2, 'e'), cell(1, '•'), cell(1, 'e'), cell(0, '•'), cell(0, 'e')], ['87.37', '50.93', '16.13', '32.06', '13.48']);
  // The rounded block_size-3 row totals 100.01 (the legend covers it).
  assert.equal(TABLE[1][5].reduce((a, b) => a + Number(b), 0).toFixed(2), '100.01');
});

test('c23 captions are true at every state; status words only; the practice numbers are in no visible text', () => {
  const STATIC = {
    question: 'What does the next prediction read once idx is longer than block_size?',
    'status-1': 'Calculated toy example (counts over Tiny Shakespeare’s training text; not NanoGPT, not the bigram): counts',
    'status-2': 'Live calculation: matches, p = count ÷ matches, most likely next · What-if: toy block_size 2 to 5, one table each',
    'status-3': 'Source value: the text, NanoGPT’s block_size 256',
    'builds-on': 'Builds on: each new character is predicted from the text before it; generate() appends it and repeats',
    // Why the toy switches from c24/c25's bigram (sequence review S2).
    'why-toy': 'The bigram reads one character, so no crop changes its prediction; this toy reads the last block_size characters.',
    'idx-label': 'idx',
    'next-slot': '→ ?',
    'read-label': 'read',
    rule: 'The forward is handed only idx_cond, the last block_size characters of idx; the prompt is not exempt.',
    'p-rule': 'p = count ÷ matches',
    'only-idx-cond': 'The prediction can use only idx_cond: whatever the crop removes no longer counts.',
    'idx-keeps': 'idx keeps every character: the crop limits what the model reads, not the text generate() returns.',
    legend: '• = space · other = every remaining character together · each p cell is rounded on its own',
    'footer-1': 'Source value: NanoGPT’s block_size is fixed by the trained model, 256 for shakespeare_char;',
    'footer-2': 'the crop starts once idx passes 256.',
    'footer-3': 'The forward accepts at most block_size positions: wpe has one learned row for each.',
  };
  for (const [block, result] of assertCardGates(scene, ALL).entries()) {
    for (const [id, label] of Object.entries(STATIC)) assert.equal(byId(result, id).label, label, id);
    const all = labels(result).join('\n');
    for (const status of ['Calculated toy example', 'Live calculation', 'What-if', 'Source value']) assert.ok(all.includes(status), status);
    assert.doesNotMatch(all, /\.py\b|\.js\b|\bline \d|[a-z]:\d|\b[0-9a-f]{7}\b/);
    assert.doesNotMatch(all, /\b(separately|unrelated|window length)\b/i);
    // The practice's numbers appear in no visible text at any state.
    assert.doesNotMatch(all, /\b(44|45|255|299|300|500)\b/, `block ${block}`);
    // 256 only in the Source-value lines.
    assert.deepEqual(result.state.objects.filter(o => o.visible && /\b256\b/.test(o.label || '')).map(o => o.id), ['status-3', 'footer-1', 'footer-2']);
    assert.deepEqual(labels(result).flatMap(ungroupedNumbers), []);
    // Never claims that a longer block_size predicts better, or that NanoGPT counts.
    assert.doesNotMatch(all, /(longer|larger|bigger)[^.]*(better|more accurate)|NanoGPT counts/i);
    // The crop acts on what the forward is handed, never on idx: generate() never "keeps" or "crops" the text.
    assert.doesNotMatch(all, /generate\(\) (keeps|crops)/);
    assert.deepEqual(all.match(/\S+ keeps/g), ['idx keeps'], 'only idx keeps characters');
    // A caption about e agrees with the drawn e cell (block_size 2: 13.48%, 4th of 6).
    assert.doesNotMatch(all, /nothing[^.]*points to e/i);
  }
  for (const text of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(text, /generate\(\) (keeps|crops)/);
  assert.equal(TABLE[0][3].filter(c => c > TABLE[0][3][0]).length, 3, 'after “or”, e is 4th of 6, as caption-2 says');
  assert.deepEqual(ALL.map(inputs => byId(evaluated(scene, inputs), 'matches').label), ['matches = 7676', 'matches = 2431', 'matches = 388', 'matches = 31']);
});

// Every number the card draws: labels, tokens, row/column/bar labels, and grid and bar values as printed.
const drawnNumbers = result => result.state.objects.filter(o => o.visible).flatMap(o => [
  ...[o.label, ...(o.tokens || []), ...(o.rowLabels || []), ...(o.columnLabels || []), ...(o.labels || [])]
    .filter(v => v != null).map(v => ({ id: o.id, text: String(v) })),
  ...(['grid', 'bars'].includes(o.type) ? (o.values || []).flat().map((v, cell) => ({ id: o.id, cell, text: formatCell(v, o.numberFormat) })) : []),
]).flatMap(({ id, cell, text }) => (text.match(/\d+/g) || []).map(n => ({ id, cell, n })));

test('c23 44, 45, 255, 300 and 500 are drawn nowhere, grid and bar values included; 299 only as the block_size-3 other count', () => {
  const states = [...reviewStates, activity.fixedInputs];
  const hits = states.flatMap(inputs => drawnNumbers(evaluated(scene, inputs))
    .filter(({ n }) => ['44', '45', '255', '299', '300', '500'].includes(n)).map(hit => ({ block: inputs.block, ...hit })));
  // 299 is in three of the five options, so it singles none out; 44 is what separates them.
  assert.deepEqual([...new Set(hits.map(h => JSON.stringify(h)))], [JSON.stringify({ block: 1, id: 'counts', cell: 5, n: '299' })]);
  assert.equal(SLOTS[5], 'other');
  assert.ok(states.every(inputs => drawnNumbers(evaluated(scene, inputs)).some(({ id }) => id === 'p')), 'grid values are collected');
});

test('c23 replay: idx and its crop, then the counted row, then the prediction', () => {
  const at = time => shown(evaluated(scene, {}, time));
  const CROP = ['idx-label', 'read-box', 'next-slot', 'read-label', 'readout-t', 'readout-read', 'readout-crop', 'rule'];
  const COUNT = ['counts', 'matches', 'matches-note'];
  const PREDICT = ['p', 'p-rule', 'top-frame', 'bars', 'top-readout', 'caption-rule', 'caption-1', 'caption-2', 'only-idx-cond', 'idx-keeps'];
  const DERIVED_OPACITY = ['crop-bracket', 'crop-label', 'idx-0', 'idx-1', 'idx-2', 'idx-3', 'idx-4'];
  assert.ok(CROP.every(id => at(0.4).includes(id)) && ![...COUNT, ...PREDICT].some(id => at(0.4).includes(id)), at(0.4).join());
  assert.ok(COUNT.every(id => at(1.0).includes(id)) && !PREDICT.some(id => at(1.0).includes(id)), at(1.0).join());
  for (const id of [...CROP, ...COUNT, ...PREDICT, ...DERIVED_OPACITY]) assert.ok(at(scene.duration).includes(id), id);
  // The cropped pair and the idx characters carry no appear: their opacity follows block_size only.
  assert.ok(!scene.timeline.some(event => DERIVED_OPACITY.includes(event.target)));
  assert.deepEqual([...new Set(scene.timeline.map(e => e.at))], [0, 0.6, 1.2]);
  assert.equal(scene.duration, 1.8);
});

test('c23 no bare t names idx’s uncropped length: t is the forward’s, idx_cond’s (sequence review S4)', () => {
  const strings = [];
  const walk = v => (typeof v === 'string' ? strings.push(v) : v && typeof v === 'object' && Object.values(v).forEach(walk));
  walk(scene.objects.map(o => o.initialState.text));
  walk(scene.exampleData);
  assert.ok(strings.length > 50, `${strings.length} strings`);
  assert.deepEqual(strings.filter(s => /\bt = |\bt ≤/.test(s)), []);
  for (const result of assertCardGates(scene, ALL)) assert.doesNotMatch(labels(result).join('\n'), /\bt = |\bt ≤/);
});

test('c23 one frame at scale 1 that never refits across states', () => {
  const legibility = sceneLegibility(scene);
  assert.equal(legibility.scale, 1);
  assert.ok(scene.width >= legibility.viewport.w && scene.height >= legibility.viewport.h, JSON.stringify(legibility.viewport));
  assert.ok(scene.height <= 900);
  for (const [k, result] of assertCardGates(scene, ALL).entries()) {
    assert.deepEqual(withoutContributors(sceneContentBounds(result.scene)), withoutContributors(legibility.bounds), JSON.stringify(ALL[k]));
    assert.ok(result.state.objects.length <= 60);
  }
  assert.equal(scene.objects.length, 38);
});

test('c23 plan: staged, verbatim objective, sequence "Generation context" 3 of 3, no boundary flag', () => {
  assertCardPlan({ scene, plan });
  assert.equal(plan.boundary.decision, 'staged');
  assert.deepEqual(Object.keys(plan.boundary.reviewed), []);
  assert.equal(plan.objective, 'After this card, the learner should understand that before every forward generate() keeps only the last block_size characters of idx, so a character cropped from the front, the prompt included, no longer counts for the next prediction even when it would change the most likely next character, although it stays in the text generate() returns.');
  const seq = plan.boundary.sequence;
  assert.deepEqual([seq.name, seq.position, seq.of], ['Generation context', 3, 3]);
  assert.deepEqual(seq.relationships.map(r => [r.type, r.card, r.direction]), [
    ['prerequisite', 'c25-autoregressive-conditioning', 'in'],
    ['deepens', 'c24-generation-loop', 'in'],
    ['prerequisite', 'c01-forward-pass', 'in'],
    ['prerequisite', 'c09-token-plus-position', 'in'],
  ]);
  assert.equal(scene.title, 'Context window: what idx_cond crops away');
  assert.equal(scene.id, 'nanogpt-c23-context-window');
  assert.equal(plan.causalSteps.length, 3);
});

// idx positions an option names: 0 is the newline, j is new character j.
const positions = label => {
  const [, newline, a, b] = /^(the new line and )?new characters (\d+)–(\d+)$/.exec(label);
  return [...(newline ? [0] : []), ...Array.from({ length: Number(b) - Number(a) + 1 }, (unused, i) => Number(a) + i)];
};

test('c23 practice: new character 300 at block_size 256 - graded, naive default wrong, feedback true', () => {
  validateActivity(activity);
  assert.equal(activity.check, 'choice_equals');
  assert.deepEqual(activity.fixedInputs, { block: 1 });
  assert.equal(activity.revealInput, undefined);
  const B = fx.architecture.block_size, n = 300;
  assert.equal(B, 256);
  assert.equal(g.sample.start.value, '\n');
  assert.equal(g.sample.max_new_tokens.value, 500);
  // Before character n is drawn idx holds the newline and new characters 1..n − 1.
  const t = g.sample.start.value.length + (n - 1);
  assert.equal(t, 300);
  const idx = Array.from({ length: t }, (unused, i) => i);
  const kept = idx.slice(-B);
  assert.equal(kept[0], 44);
  assert.deepEqual(activity.answer.options.map(o => [o.id, o.label]), [
    ['all', 'the new line and new characters 1–299'],
    ['first', 'the new line and new characters 1–255'],
    ['pinned', 'the new line and new characters 45–299'],
    ['ahead', 'new characters 45–300'],
    ['last', 'new characters 44–299'],
  ]);
  const sets = activity.answer.options.map(o => positions(o.label));
  assert.equal(new Set(activity.answer.options.map(o => o.label)).size, 5);
  assert.deepEqual(activity.answer.options.filter((o, i) => JSON.stringify(sets[i]) === JSON.stringify(kept)).map(o => o.id), ['last']);
  assert.deepEqual(sets.map(s => s.length), [300, 256, 256, 256, 256]);
  assert.deepEqual(positions(activity.answer.options.find(o => o.id === 'first').label), idx.slice(0, B));
  assert.equal(positions(activity.answer.options.find(o => o.id === 'ahead').label).at(-1), n);
  assert.equal(activity.expected, 'last');
  for (const { id } of activity.answer.options) assert.equal(PREDICATES.choice_equals({ answer: id }, activity), id === 'last');
  assert.equal(activity.answer.default, 'all');
  assert.notEqual(activity.answer.default, activity.expected);
  assert.equal(activity.prompt, 'NanoGPT’s sampling script starts idx from one new line (⏎), the prompt, and runs 500 passes, each appending one new character; shakespeare_char’s block_size is 256 (not drawn: the card’s text is 5 characters). When the model predicts new character 300, which characters of idx does its forward read?');
  assert.equal(activity.feedbackPass, 'Right. New character 300 is drawn on pass 300, and pass k holds the start + (k − 1): idx holds the start + 299 = 300 characters, the new line and new characters 1–299, more than block_size = 256. So the forward is handed only the last 256, new characters 44–299. The new line and new characters 1–43 stay in the printed text, but they cannot change this prediction. On the card, at block_size 3, the forward reads “for”, not “Be”.');
  assert.equal(activity.feedbackFail, 'Not quite. New character 300 is drawn on pass 300, and pass k holds the start + (k − 1): idx holds the start + 299 = 300 characters, the new line and new characters 1–299 (character 300 joins idx only when it is appended). That is more than block_size = 256, so the forward is handed only the last 256: new characters 44–299. Reading all 300 ignores the crop. Reading 1–255 takes the wrong end, because the oldest characters go first. Reading the new line treats the prompt as special, but it is cropped like any other character. 45–300 counts a character that has not been drawn yet.');
  // c24's counting rule in c24's words, in both feedbacks (sequence review S3).
  for (const text of [activity.feedbackPass, activity.feedbackFail]) {
    assert.ok(text.includes('pass 300, and pass k holds the start + (k − 1): idx holds the start + 299 = 300 characters'), text);
  }
  for (const text of [activity.prompt, activity.feedbackPass, activity.feedbackFail]) assert.doesNotMatch(text, /newline|sampler\b/);
  // The case is not drawn: the card's idx is 5 characters and its block_size stops at 5.
  assert.ok(Math.max(...scene.exampleData.blocks) < B);
  assertCardGates(scene, [activity.fixedInputs]);
  assert.doesNotMatch(describeActivity({ activity, activityAnswer: 'all' }), /"last"|44–299/);
  for (const text of [activity.prompt, activity.feedbackPass, activity.feedbackFail, ...activity.answer.options.map(o => o.label)]) {
    assert.doesNotMatch(text, /\.py\b|:\d+|generate_fixtures/);
    assert.deepEqual(ungroupedNumbers(text), []);
  }
});

test('c23 sources: every status labelled on the card; provenance lives under it', () => {
  assertSources(sources, scene);
  const calc = sources.filter(s => s.kind === 'calculation');
  assert.deepEqual(calc.map(s => s.status), ['Calculated toy example', 'Live calculation', 'What-if', 'Source value', 'Source value']);
  // Each entry's reproduce regenerates the values it describes.
  const GEN = 'python packages/web/src/nanogpt/depth/fixtures/gen_generation.py --check';
  const FX = 'python packages/web/src/nanogpt/fixtures/generate_fixtures.py --check';
  assert.deepEqual(calc.map(s => s.reproduce), [GEN, undefined, GEN, FX, GEN]);
  assert.match(calc[3].note, /fx\.tokenizer[^]*fx\.architecture/);
  assert.match(calc[4].note, /g\.sample/);
  // README's CPU run is the shakespeare_char config with command-line overrides, not a config of its own.
  assert.doesNotMatch(sources.find(s => s.path === 'README.md' && s.lines[0] === 85).note, /its own config/);
  assert.ok(sources.some(s => s.kind === 'dataset'));
});

const PATHS = ['model.py', 'train.py', 'config/train_shakespeare_char.py', 'data/shakespeare_char/prepare.py', 'README.md', 'sample.py'];
const cached = PATHS.every(path => pinnedFile(path));
test('c23 every quoted fragment is in its cited lines at the pinned revision', { skip: !cached && 'pinned NanoGPT cache absent (run generate_fixtures.py)' }, () => {
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
  assert.equal(model[314 - 1].trim(), 'idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]');
  assert.equal(model[316 - 1].trim(), 'logits, _ = self(idx_cond)');
  assert.equal(model[328 - 1].trim(), 'idx = torch.cat((idx, idx_next), dim=1)');
  assert.equal(model[330 - 1].trim(), 'return idx');
  assert.equal(pinnedFile('config/train_shakespeare_char.py')[19 - 1].trim(), 'block_size = 256 # context of up to 256 previous characters');
  const sample = pinnedFile('sample.py');
  assert.match(sample[14 - 1], /^start = "\\n"/);
  assert.match(sample[16 - 1], /^max_new_tokens = 500\b/);
  assert.match(sample[88 - 1], /print\(decode\(y\[0\]\.tolist\(\)\)\)/);
});

test('c23 evidence record is complete', () => {
  assertEvidence(evidence);
  assert.ok(evidence.sourceRevision.includes(fx.provenance.nanogpt.commit));
  assert.equal(evidence.learningQuestion, 'What does the next prediction read once idx is longer than block_size?');
});
