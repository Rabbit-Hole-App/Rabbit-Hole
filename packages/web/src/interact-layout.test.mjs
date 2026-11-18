import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, DOC_TEXT_SIZES, DRAWN_TEXT_SIZES, VALUE_DOT, LayoutError, checkText, fitPanel, fitValues, layoutById, pickLayout, valueBoxes } from './interact-layout.js';
import { textWidth } from './tutor-diagrams/primitives.js';

// Brief 35 (amendment E: 640 x 400, ten rows): docs/features/interact/layout.md is the spec. DOC_BOXES is section 5's JSON boxes typed out of it; the grid test derives each again from section 1's column and row edges.
const DOC_BOXES = {
  wide: { stage: [4, 4, 632, 312], values: [4, 324, 632, 32], formula: [4, 364, 259, 32], note: [271, 364, 365, 32], reset: [608, 8, 24, 24] },
  'side-by-side': { stage: [4, 4, 312, 312], panel: [324, 4, 312, 312], values: [4, 324, 632, 32], formula: [4, 364, 259, 32], note: [271, 364, 365, 32], reset: [608, 8, 24, 24] },
  'equal-split': { stage: [4, 4, 312, 312], panel: [324, 4, 312, 312], values: [4, 324, 632, 32], formula: [4, 364, 259, 32], note: [271, 364, 365, 32], reset: [608, 8, 24, 24] },
  stacked: { stage: [4, 4, 632, 152], panel: [4, 164, 632, 152], values: [4, 324, 632, 32], formula: [4, 364, 259, 32], note: [271, 364, 365, 32], reset: [608, 8, 24, 24] },
  tall: { stage: [4, 4, 365, 392], values: [377, 4, 259, 152], formula: [377, 164, 259, 112], note: [377, 284, 259, 112], reset: [608, 8, 24, 24] },
  'tall-with-panel': { stage: [4, 4, 312, 392], panel: [324, 4, 312, 232], values: [324, 244, 312, 72], formula: [324, 324, 312, 32], note: [324, 364, 312, 32], reset: [608, 8, 24, 24] },
};
const COLUMN_EDGES = [0, 53, 107, 160, 213, 267, 320, 373, 427, 480, 533, 587, 640];

test('the six layouts are in the doc order and every box equals the doc', () => {
  assert.deepEqual(LAYOUTS.map(layout => layout.id), ['wide', 'side-by-side', 'equal-split', 'stacked', 'tall', 'tall-with-panel']);
  for (const layout of LAYOUTS) assert.deepEqual(Object.fromEntries(Object.entries(layout.slots).map(([slot, value]) => [slot, value.box])), DOC_BOXES[layout.id], layout.id);
});

test('every slot box is its cells on the grid, 4 px inside (the reset button is the one fixed box)', () => {
  for (const layout of LAYOUTS) for (const [slot, { cols, rows, box }] of Object.entries(layout.slots)) {
    if (slot === 'reset') { assert.deepEqual(box, [608, 8, 24, 24]); assert.deepEqual([cols, rows], [[12, 12], [1, 1]]); continue; }
    const x = COLUMN_EDGES[cols[0] - 1] + 4, w = COLUMN_EDGES[cols[1]] - COLUMN_EDGES[cols[0] - 1] - 8, y = (rows[0] - 1) * 40 + 4, h = (rows[1] - rows[0] + 1) * 40 - 8;
    assert.deepEqual(box, [x, y, w, h], `${layout.id} ${slot}`);
  }
});

test('the pick table: all 12 rows', () => {
  const rows = [
    ['one', 'left-to-right', 'none', 'wide'], ['one', 'compact', 'none', 'wide'], ['two', 'compact', 'records-main', 'side-by-side'], ['two', 'left-to-right', 'records-main', 'side-by-side'],
    ['two', 'compact', 'equal', 'equal-split'], ['two', 'left-to-right', 'equal', 'equal-split'], ['two', 'left-to-right', 'aligned', 'stacked'], ['two', 'compact', 'aligned', 'stacked'],
    ['one', 'top-to-bottom', 'none', 'tall'], ['two', 'top-to-bottom', 'records-main', 'tall-with-panel'], ['two', 'top-to-bottom', 'equal', 'equal-split'], ['two', 'top-to-bottom', 'aligned', 'equal-split'],
  ];
  assert.equal(rows.length, 12);
  for (const [pictureCount, runs, panelRole, id] of rows) { assert.equal(pickLayout({ pictureCount, runs, panelRole }), id); assert.ok(layoutById(id)); }
});

test('the pick refuses a contradicting answer or plan', () => {
  const refused = (answers, options) => assert.throws(() => pickLayout(answers, options), error => error instanceof LayoutError && error.code === 'layout_contradiction');
  refused({ pictureCount: 'one', runs: 'compact', panelRole: 'records-main' });
  refused({ pictureCount: 'one', runs: 'compact', panelRole: 'none' }, { hasPanel: true });
  refused({ pictureCount: 'two', runs: 'compact', panelRole: 'none' });
  refused({ pictureCount: 'two', runs: 'compact', panelRole: 'records-main' }, { hasPanel: false });
  assert.equal(pickLayout({ pictureCount: 'two', runs: 'compact', panelRole: 'records-main' }, { hasPanel: true }), 'side-by-side');
});

test('the size table of section 2', () => {
  const sizes = (layout, count) => valueBoxes(layout, count).map(value => value.box.slice(2));
  for (const layout of ['wide', 'side-by-side', 'equal-split', 'stacked']) {
    assert.deepEqual(sizes(layout, 1), [[632, 32]]); assert.deepEqual(sizes(layout, 2), [[312, 32], [312, 32]]);
    assert.deepEqual(sizes(layout, 3), [[205, 32], [205, 32], [205, 32]]); assert.deepEqual(sizes(layout, 4), Array(4).fill([152, 32]));
  }
  assert.deepEqual(sizes('tall', 1), [[259, 152]]); assert.deepEqual(sizes('tall', 2), [[259, 72], [259, 72]]);
  assert.deepEqual(sizes('tall', 3), Array(3).fill([259, 45])); assert.deepEqual(sizes('tall', 4), Array(4).fill([259, 32]));
  assert.deepEqual(sizes('tall-with-panel', 1), [[312, 72]]); assert.deepEqual(sizes('tall-with-panel', 2), [[152, 72], [152, 72]]); assert.deepEqual(sizes('tall-with-panel', 3), Array(3).fill([99, 72]));
  // four in layout 6 is a 2 x 2 grid of 152 x 32
  assert.deepEqual(valueBoxes('tall-with-panel', 4).map(value => value.box), [[324, 244, 152, 32], [484, 244, 152, 32], [324, 284, 152, 32], [484, 284, 152, 32]]);
  assert.throws(() => valueBoxes('wide', 5), error => error.code === 'values_count');
});

test('a value under 64 px tall is one line; layout 5 keeps its top value left of the reset cell', () => {
  assert.equal(valueBoxes('wide', 2)[0].stacked, false); assert.equal(valueBoxes('tall', 1)[0].stacked, true); assert.equal(valueBoxes('tall-with-panel', 2)[0].stacked, true);
  assert.equal(valueBoxes('tall', 2)[0].maxRight, 583); assert.equal(valueBoxes('tall', 2)[1].maxRight, 628);
});

test('a value is one box with its own centred text "Label: value unit": the whole text is measured against the box width less the dot room (50 px)', () => {
  const text = 'Period B: 2.01 s', width = textWidth(text, DRAWN_TEXT_SIZES.value);
  assert.equal(Math.round(width * 10) / 10, 136.2); // 15 px body text, the size a frame text draws
  assert.equal(VALUE_DOT.diameter, 10); assert.equal(VALUE_DOT.centreX, 14); assert.equal(VALUE_DOT.textClear, 6);
  assert.equal(fitValues('wide', Array(3).fill({ text }), DRAWN_TEXT_SIZES).dropped, 0); // 155 px of room at three values (205 less 50)
  assert.equal(fitValues('wide', Array(4).fill({ text }), DRAWN_TEXT_SIZES).dropped, 1); // 102 px of room at four (152 less 50): the last is dropped and the box divided again
  assert.equal(fitValues('wide', Array(4).fill({ text: 'Mass: 1 kg' }), DRAWN_TEXT_SIZES).dropped, 0);
});

test('a long label with a long number at four values is dropped to three, in list order', () => {
  const values = [{ text: 'Period B: 2.01 s' }, { text: 'Angle B: 19°' }, { text: 'Mass B: 1.0 kg' }, { text: 'Final loss: 0.00123' }];
  assert.ok(textWidth(values[3].text, DRAWN_TEXT_SIZES.value) > 136);
  const fitted = fitValues('wide', values, DRAWN_TEXT_SIZES);
  assert.deepEqual(fitted.values.map(value => value.text), ['Period B: 2.01 s', 'Angle B: 19°', 'Mass B: 1.0 kg']); assert.equal(fitted.dropped, 1); assert.equal(fitted.boxes.length, 3);
});

test('formula and note: refused when they do not fit, never shrunk or cut', () => {
  const ok = checkText('side-by-side', { formula: 'T = 2π√(L/g)', note: 'Slower: a longer string takes longer.' }, DOC_TEXT_SIZES);
  assert.equal(ok.formula.room, 243); assert.equal(ok.note.room, 349); assert.equal(ok.note.lines.length, 1);
  assert.throws(() => checkText('side-by-side', { formula: 'T = 2π√(L/g)', note: 'B matches A: same mass, same length and so the same timing for both.' }, DOC_TEXT_SIZES), error => error.code === 'text_too_wide' && error.path[0] === 'note');
  assert.throws(() => checkText('wide', { formula: 'the period of a pendulum is two pi root L over g', note: 'ok' }, DOC_TEXT_SIZES), error => error.code === 'text_too_wide' && error.path[0] === 'formula');
  assert.equal(checkText('tall-with-panel', { formula: 'x', note: 'y' }).note.room, 296);
  assert.ok(DRAWN_TEXT_SIZES.note >= DOC_TEXT_SIZES.note);
});

test('the panel picture is drawn at the width where its height fits the box, left of the reset cell', () => {
  const fit = fitPanel({ width: 408, height: 450.5 }, [324, 4, 312, 312], { clearRight: 587 });
  assert.ok(fit.drawn.h <= 312 && fit.drawn.w <= 263); assert.equal(fit.x, 324); assert.equal(fit.drawn.w, 263);
  assert.deepEqual(fitPanel({ width: 100, height: 50 }, [0, 0, 400, 400]), { x: 150, y: 175, w: 100, drawn: { w: 100, h: 50 } });
});

test('a panel figure box lies inside the panel and keeps the reset cell clear', async () => {
  const { panelBoxOk } = await import('./interact-layout.js');
  assert.equal(panelBoxOk('side-by-side', [324, 40, 312, 272]), true);
  assert.equal(panelBoxOk('side-by-side', [324, 4, 263, 312]), true);
  assert.equal(panelBoxOk('side-by-side', [324, 4, 312, 312]), false); // covers the reset cell
  assert.equal(panelBoxOk('side-by-side', [300, 40, 259, 196]), false); // leaves the panel
  assert.equal(panelBoxOk('wide', [4, 40, 100, 100]), false); // a layout with no panel
});
