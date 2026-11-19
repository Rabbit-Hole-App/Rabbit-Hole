import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, DOC_TEXT_SIZES, DRAWN_TEXT_SIZES, VALUE_DOT, LayoutError, checkText, fitPanel, fitValues, layoutById, pickLayout, valueBoxes } from './interact-layout.js';
import { textWidth } from './tutor-diagrams/primitives.js';
import { LAYOUT_RESET_BUTTON } from './scene-style.js';

// Brief 35 (amendments E and H: 640 x 400, ten rows, an 8 px padding round the grid): docs/features/interact/layout.md is the spec. DOC_BOXES is section 5's JSON boxes typed out of it; the grid test derives each again from section 1's column and row edges.
const DOC_BOXES = {
  wide: { stage: [12, 12, 616, 299.2], values: [12, 319.2, 616, 30.4], formula: [12, 357.6, 252, 30.4], note: [272, 357.6, 356, 30.4], reset: [604, 12, 24, 24] },
  'side-by-side': { stage: [12, 12, 304, 299.2], panel: [324, 12, 304, 299.2], values: [12, 319.2, 616, 30.4], formula: [12, 357.6, 252, 30.4], note: [272, 357.6, 356, 30.4], reset: [604, 12, 24, 24] },
  'equal-split': { stage: [12, 12, 304, 299.2], panel: [324, 12, 304, 299.2], values: [12, 319.2, 616, 30.4], formula: [12, 357.6, 252, 30.4], note: [272, 357.6, 356, 30.4], reset: [604, 12, 24, 24] },
  stacked: { stage: [12, 12, 616, 145.6], panel: [12, 165.6, 616, 145.6], values: [12, 319.2, 616, 30.4], formula: [12, 357.6, 252, 30.4], note: [272, 357.6, 356, 30.4], reset: [604, 12, 24, 24] },
  tall: { stage: [12, 12, 356, 376], values: [376, 12, 252, 145.6], formula: [376, 165.6, 252, 107.2], note: [376, 280.8, 252, 107.2], reset: [604, 12, 24, 24] },
  'tall-with-panel': { stage: [12, 12, 304, 376], panel: [324, 12, 304, 222.4], values: [324, 242.4, 304, 68.8], formula: [324, 319.2, 304, 30.4], note: [324, 357.6, 304, 30.4], reset: [604, 12, 24, 24] },
};
const r2 = value => Math.round(value * 100) / 100;

test('the six layouts are in the doc order and every box equals the doc', () => {
  assert.deepEqual(LAYOUTS.map(layout => layout.id), ['wide', 'side-by-side', 'equal-split', 'stacked', 'tall', 'tall-with-panel']);
  for (const layout of LAYOUTS) assert.deepEqual(Object.fromEntries(Object.entries(layout.slots).map(([slot, value]) => [slot, value.box])), DOC_BOXES[layout.id], layout.id);
});

test('every slot box is its cells on the padded grid (8 px padding, 52 x 38.4 px cells), 4 px inside: 12 px from the scene edge, 8 px from a neighbour (the reset button is the one fixed box)', () => {
  for (const layout of LAYOUTS) for (const [slot, { cols, rows, box }] of Object.entries(layout.slots)) {
    if (slot === 'reset') { assert.deepEqual(box, [...LAYOUT_RESET_BUTTON]); assert.deepEqual(box, [604, 12, 24, 24]); assert.deepEqual([cols, rows], [[12, 12], [1, 1]]); continue; }
    const x = r2(8 + (cols[0] - 1) * 52 + 4), w = r2((cols[1] - cols[0] + 1) * 52 - 8), y = r2(8 + (rows[0] - 1) * 38.4 + 4), h = r2((rows[1] - rows[0] + 1) * 38.4 - 8);
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

test('the size table of section 2 (the padded grid: 616 x 30.4 for one row)', () => {
  const sizes = (layout, count) => valueBoxes(layout, count).map(value => value.box.slice(2));
  for (const layout of ['wide', 'side-by-side', 'equal-split', 'stacked']) {
    assert.deepEqual(sizes(layout, 1), [[616, 30.4]]); assert.deepEqual(sizes(layout, 2), [[304, 30.4], [304, 30.4]]);
    assert.deepEqual(sizes(layout, 3), Array(3).fill([200, 30.4])); assert.deepEqual(sizes(layout, 4), Array(4).fill([148, 30.4]));
  }
  assert.deepEqual(sizes('tall', 1), [[252, 145.6]]); assert.deepEqual(sizes('tall', 2), Array(2).fill([252, 68.8]));
  assert.deepEqual(sizes('tall', 3), Array(3).fill([252, 43.2])); assert.deepEqual(sizes('tall', 4), Array(4).fill([252, 30.4]));
  assert.deepEqual(sizes('tall-with-panel', 1), [[304, 68.8]]); assert.deepEqual(sizes('tall-with-panel', 2), Array(2).fill([148, 68.8])); assert.deepEqual(sizes('tall-with-panel', 3), Array(3).fill([96, 68.8]));
  // four in layout 6 is a 2 x 2 grid of 148 x 30.4
  assert.deepEqual(valueBoxes('tall-with-panel', 4).map(value => value.box), [[324, 242.4, 148, 30.4], [480, 242.4, 148, 30.4], [324, 280.8, 148, 30.4], [480, 280.8, 148, 30.4]]);
  assert.throws(() => valueBoxes('wide', 5), error => error.code === 'values_count');
});

test('a value under 64 px tall is one line; layout 5 keeps its top value left of the reset cell', () => {
  assert.equal(valueBoxes('wide', 2)[0].stacked, false); assert.equal(valueBoxes('tall', 1)[0].stacked, true); assert.equal(valueBoxes('tall-with-panel', 2)[0].stacked, true);
  assert.equal(valueBoxes('tall', 2)[0].maxRight, 576); assert.equal(valueBoxes('tall', 2)[1].maxRight, 620);
});

test('a value is one box with its own centred text "Label: value unit": the whole text is measured against the box width less the dot room (50 px)', () => {
  const text = 'Period B: 2.01 s', width = textWidth(text, DRAWN_TEXT_SIZES.value);
  assert.equal(Math.round(width * 10) / 10, 127.1); // 14 px body text, the size a frame text draws on a card with a layout (amendment G)
  assert.equal(VALUE_DOT.diameter, 10); assert.equal(VALUE_DOT.centreX, 14); assert.equal(VALUE_DOT.textClear, 6);
  assert.equal(fitValues('wide', Array(3).fill({ text }), DRAWN_TEXT_SIZES).dropped, 0); // 150 px of room at three values (200 less 50)
  assert.equal(fitValues('wide', Array(4).fill({ text }), DRAWN_TEXT_SIZES).dropped, 1); // 98 px of room at four (148 less 50): the last is dropped and the box divided again
  assert.equal(fitValues('wide', Array(4).fill({ text: 'Mass: 1 kg' }), DRAWN_TEXT_SIZES).dropped, 0);
});

test('a long label with a long number at four values is dropped to three, in list order', () => {
  const values = [{ text: 'Period B: 2.01 s' }, { text: 'Angle B: 19°' }, { text: 'Mass B: 1.0 kg' }, { text: 'Final loss: 0.00123' }];
  assert.ok(textWidth(values[3].text, DRAWN_TEXT_SIZES.value) > 98); // 98 px of room at four values
  const fitted = fitValues('wide', values, DRAWN_TEXT_SIZES);
  assert.deepEqual(fitted.values.map(value => value.text), ['Period B: 2.01 s', 'Angle B: 19°', 'Mass B: 1.0 kg']); assert.equal(fitted.dropped, 1); assert.equal(fitted.boxes.length, 3);
});

test('formula and note: refused when they do not fit, never shrunk or cut', () => {
  const ok = checkText('side-by-side', { formula: 'T = 2π√(L/g)', note: 'Slower: a longer string takes longer.' }, DOC_TEXT_SIZES);
  assert.equal(ok.formula.room, 236); assert.equal(ok.note.room, 340); assert.equal(ok.note.lines.length, 1);
  assert.throws(() => checkText('side-by-side', { formula: 'T = 2π√(L/g)', note: 'B matches A: same mass, same length and so the same timing for both.' }, DOC_TEXT_SIZES), error => error.code === 'text_too_wide' && error.path[0] === 'note');
  assert.throws(() => checkText('wide', { formula: 'the period of a pendulum is two pi root L over g', note: 'ok' }, DOC_TEXT_SIZES), error => error.code === 'text_too_wide' && error.path[0] === 'formula');
  assert.equal(checkText('tall-with-panel', { formula: 'x', note: 'y' }).note.room, 288);
  assert.ok(DRAWN_TEXT_SIZES.note >= DOC_TEXT_SIZES.note);
});

test('the panel picture is drawn at the width where its height fits the box, left of the reset cell', () => {
  const fit = fitPanel({ width: 408, height: 420.5 }, [324, 12, 304, 299.2], { clearRight: 604, align: 'left' });
  assert.ok(fit.drawn.h <= 299.2 && fit.drawn.w <= 280); assert.equal(fit.x, 324); assert.equal(fit.drawn.w, 280);
  assert.deepEqual(fitPanel({ width: 100, height: 50 }, [0, 0, 400, 400]), { x: 150, y: 175, w: 100, drawn: { w: 100, h: 50 } });
});

test('a panel figure box lies inside the panel and keeps the reset cell clear', async () => {
  const { panelBoxOk } = await import('./interact-layout.js');
  assert.equal(panelBoxOk('side-by-side', [324, 48, 304, 263.2]), true);
  assert.equal(panelBoxOk('side-by-side', [324, 12, 256, 299.2]), true);
  assert.equal(panelBoxOk('side-by-side', [324, 12, 304, 299.2]), false); // covers the reset cell
  assert.equal(panelBoxOk('side-by-side', [300, 40, 259, 196]), false); // leaves the panel
  assert.equal(panelBoxOk('wide', [4, 40, 100, 100]), false); // a layout with no panel
});

test('brief 36: the layout picture is the panel when the layout has one, else the stage; the options carry its box, every text size 14 and the card\'s parts', async () => {
  const { figureOptions } = await import('./interact-layout.js');
  const two = figureOptions({ pictureCount: 'two', runs: 'compact', panelRole: 'records-main', figureParts: { legend: 'always' } });
  assert.deepEqual([two.layout, two.slot, two.at, two.options.box], ['side-by-side', 'panel', [324, 12], { width: 304, height: 299.2 }]);
  assert.deepEqual(two.options.sizes, { title: 14, heading: 14, body: 14, small: 14 }); assert.deepEqual(two.options.parts, { legend: 'always' });
  const one = figureOptions({ pictureCount: 'one', runs: 'left-to-right', panelRole: 'none', figureParts: { title: false, caption: false } });
  assert.deepEqual([one.layout, one.slot, one.at, one.options.box], ['wide', 'stage', [12, 12], { width: 616, height: 299.2 }]);
  assert.deepEqual(figureOptions({ pictureCount: 'one', runs: 'left-to-right', panelRole: 'none' }).options.parts, {});
  assert.throws(() => figureOptions({ pictureCount: 'one', runs: 'left-to-right', panelRole: 'equal' }), error => error.code === 'layout_contradiction');
});
