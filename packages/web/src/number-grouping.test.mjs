// Numbers in card text are readable: a whole part of five or more digits
// carries thousands separators ("1,770,240"), except where it is written as
// the source writes it (a shape, an ID list, a call argument). {{marker}} interpolation groups on its own (scene-derive.js);
// text a card composes in JS uses groupDigits (scene-format.js). The last test
// is the board-wide gate: every visible label, practice text and control label
// on every board, at the default state, each review state and each input
// varied alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDigits, ungroupedNumbers } from './scene-format.js';
import { resolveDerived } from './scene-derive.js';
import { evaluateScene } from './scene-evaluate.js';
import { BOARDS, BOARD_REVIEW_STATES } from './demo-scenes.js';

test('groupDigits groups a whole part of five or more digits, nothing else', () => {
  assert.equal(groupDigits(1770240), '1,770,240');
  assert.equal(groupDigits(-21242880), '-21,242,880');
  assert.equal(groupDigits(10000), '10,000');
  assert.equal(groupDigits(1536), '1536');
  assert.equal(groupDigits(12345.678), '12,345.678');
  assert.equal(groupDigits(0.00001), '0.00001');
  assert.equal(groupDigits(2.999e-7), '2.999e-7');
  assert.equal(groupDigits(1770240, '{,}'), '1{,}770{,}240');
});

test('interpolation groups counts and keeps shapes, calls and ID lists raw', () => {
  const { objects } = resolveDerived({
    exampleData: { n: 1770240, V: 50304, it: 301000, a: 31056, b: 3262 },
    derived: {},
    objects: [
      { id: 't', type: 'text', initialState: { text: '{{n}} params; (B, T, {{V}}); get_lr({{it}}); IDs {{a}}, {{b}}; vocab_size = {{V}}; V = {{V}}, C = 768; ({{n}} values)' } },
      { id: 'e', type: 'equation', initialState: { text: 'x={{n}}' } },
    ],
  });
  assert.equal(objects[0].initialState.text, '1,770,240 params; (B, T, 50304); get_lr(301000); IDs 31056, 3262; vocab_size = 50,304; V = 50,304, C = 768; (1,770,240 values)');
  assert.equal(objects[1].initialState.text, 'x=1{,}770{,}240', 'TeX: a bare comma would typeset as punctuation');
});

test('ungroupedNumbers flags what a reader would have to count, and only that', () => {
  assert.deepEqual(ungroupedNumbers('6 blocks × 1770240 = 10621440 parameters'), ['1770240', '10621440']);
  assert.deepEqual(ungroupedNumbers('12345.678'), ['12345']);
  assert.deepEqual(ungroupedNumbers('ln 50304 = 10.83'), ['50304']);
  assert.deepEqual(ungroupedNumbers('blocks + ln_f = 10745088'), ['10745088']);
  for (const fine of ['1,770,240', '(12, 1024, 50304)', '3 IDs: 31056, 3262, 1248', 'get_lr(301000) = 3.300e-4',
    'eps = 0.00001', 'lr = 2.999e-7', '25{,}165{,}824', 'iter 1000']) {
    assert.deepEqual(ungroupedNumbers(fine), [], fine);
  }
});

const domainOf = (declaration, data) => {
  if (declaration.hidden) return [];
  if (declaration.type === 'bool') return [false, true];
  if (declaration.type === 'index') return (data?.[declaration.of] || []).map((unused, i) => i);
  if (declaration.type === 'choice') return (declaration.options || []).map(option => option.id);
  return [];
};

function cardTexts(board, block) {
  const scene = block.scene;
  const texts = [];
  const defaults = Object.fromEntries((scene.inputs || []).map(d => [d.name, d.default]));
  const states = [{}, ...(BOARD_REVIEW_STATES[board]?.[scene.id] || [])];
  for (const d of scene.inputs || []) for (const value of domainOf(d, scene.exampleData).slice(0, 40)) states.push({ [d.name]: value });
  for (const state of states) {
    const { state: frame } = evaluateScene(structuredClone(scene), scene.duration, { ...defaults, ...state });
    for (const object of frame.objects.filter(o => o.visible)) {
      for (const key of ['label', 'text', 'caption']) if (typeof object[key] === 'string') texts.push(object[key]);
      for (const key of ['rowLabels', 'columnLabels']) for (const label of object[key] || []) if (typeof label === 'string') texts.push(label);
    }
  }
  for (const d of scene.inputs || []) {
    texts.push(d.label || '');
    if (d.type === 'index') for (const chip of scene.exampleData?.[d.of] || []) if (typeof chip === 'string') texts.push(chip);
    for (const option of d.options || []) texts.push(option.label || '');
  }
  const activity = block.activity;
  if (activity) {
    texts.push(activity.prompt || '', activity.feedbackPass || '', activity.feedbackFail || '');
    for (const option of activity.answer?.options || []) texts.push(option.label || '');
  }
  return texts;
}

test('gate: no card on any board shows a long number without separators', () => {
  const failures = [];
  for (const [board, make] of Object.entries(BOARDS)) {
    for (const block of make().filter(b => b.scene)) {
      for (const text of new Set(cardTexts(board, block))) {
        const raw = ungroupedNumbers(text);
        if (raw.length) failures.push(`${board} :: ${block.scene.id}: ${raw.join(', ')} in "${text.slice(0, 120)}"`);
      }
    }
  }
  assert.deepEqual(failures, [], 'group the whole part with groupDigits (text composed in JS) - {{markers}} group on their own');
});

test('gate: NanoGPT cards write a number below 1 with its leading zero', () => {
  const failures = [];
  for (const board of ['nanogpt-deep-dive', 'nanogpt-depth-ladder']) {
    for (const block of BOARDS[board]().filter(b => b.scene)) {
      for (const text of new Set(cardTexts(board, block))) {
        if (/(^|[\s(=:,])\.\d/.test(text)) failures.push(`${board} :: ${block.scene.id}: ${text}`);
      }
    }
  }
  assert.deepEqual(failures, [], 'write 0.90, not .90');
});
