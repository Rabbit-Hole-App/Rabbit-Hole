import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { layouts as legacy } from './layouts.js';
import { createShapes, validate, describe, visibleText } from './ml-data-spec.js';
import { createLayouts } from './ml-data-layouts.js';
import { references } from './ml-data-references.js';

const text = max => z.string().min(1).max(max);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/);
const shapes = createShapes({ z, text, id, numeric: z.number().min(-1e9).max(1e9), titled: { title: text(90), caption: text(140).optional() } });
const schema = z.discriminatedUnion('kind', shapes).superRefine((diagram, ctx) => {
  validate(diagram, (path, message) => ctx.addIssue({ code: 'custom', path, message }));
});
const layouts = createLayouts({ legacy });
const render = frame => renderToStaticMarkup(h('svg', { viewBox: `0 0 ${frame.width} ${frame.height}` }, ...frame.elements));
const tags = (svg, attr) => [...svg.matchAll(new RegExp(`<[^>]* ${attr}="([^"]*)"[^>]*>`, 'g'))].map(match => ({ tag: match[0], value: match[1] }));
const number = (tag, attr) => {
  const match = tag.match(new RegExp(` ${attr}="([^"]+)"`));
  assert.ok(match, `${attr} missing on ${tag}`);
  const value = Number(match[1]);
  assert.ok(Number.isFinite(value), `${attr} is finite`);
  return value;
};
const timeline = {
  kind: 'timeline', layout: 'scaled-lanes', title: 'Time-aware validation',
  domain: { min: 0, max: 20, unit: 'day', label: 'Event time' },
  lanes: [{ id: 'fold', label: 'Fold 1', intervals: [
    { id: 'train', label: 'Train', start: 0, end: 10, role: 'train' },
    { id: 'gap', label: 'Gap', start: 10, end: 12, role: 'gap' },
    { id: 'test', label: 'Test', start: 12, end: 20, role: 'test' },
  ], events: [{ id: 'arrive', label: 'Available', time: 5 }, { id: 'late', label: 'Late', time: 5.00001 }] }],
  cutoffs: [{ id: 'cut', label: 'Prediction', time: 10 }],
};
const matrix = {
  kind: 'matrix', layout: 'teaching', title: 'Missing feature', columns: ['Age', 'Score'],
  rows: [{ id: 'r1', heading: 'Sample 1', cells: ['NA', '9'] }, { id: 'r2', heading: 'Sample 2', cells: ['30', '8'] }],
  states: [{ row: 'r1', column: 0, state: 'missing' }, { row: 'r2', column: 0, state: 'changed' }],
  emphasis: { cells: [{ row: 'r2', column: 1 }] },
};

test('scaled timeline puts unequal durations, nearby events, and cutoffs on one proportional scale', () => {
  const svg = render(layouts.timeline(schema.parse(timeline), 320));
  const bars = new Map(tags(svg, 'data-tutor-timeline-interval').map(mark => [mark.value, mark.tag]));
  const train = bars.get('train'), gap = bars.get('gap'), heldout = bars.get('test');
  assert.ok(train && gap && heldout);
  assert.ok(Math.abs(number(train, 'width') / number(gap, 'width') - 5) < 1e-8);
  assert.ok(Math.abs(number(heldout, 'width') / number(gap, 'width') - 4) < 1e-8);
  const [{ tag: cutoff }] = tags(svg, 'data-tutor-timeline-cutoff');
  assert.equal(number(cutoff, 'x1'), number(train, 'x') + number(train, 'width'));
  const [a, b] = tags(svg, 'data-tutor-timeline-event');
  assert.ok(number(a.tag, 'cx') < number(b.tag, 'cx'));
  assert.notEqual(number(a.tag, 'cy'), number(b.tag, 'cy'));
  assert.ok(Math.abs(number(a.tag, 'cx') - number(train, 'x') - number(train, 'width') / 2) < 1e-8);
  assert.match(svg, /Event time \(day\)/);
  assert.match(svg, /5\.00001/);
});

test('overlapping intervals and boundary labels get separate vertical slots without changing endpoints', () => {
  const diagram = structuredClone(timeline);
  diagram.lanes[0].intervals = [
    { id: 'one', label: 'Train window', start: 0, end: 10 },
    { id: 'two', label: 'Overlapping window', start: 5, end: 15 },
    { id: 'tiny', label: 'A very short delay', start: 19.9999, end: 20 },
  ];
  const svg = render(layouts.timeline(schema.parse(diagram), 320));
  const [a, b, tiny] = tags(svg, 'data-tutor-timeline-interval');
  assert.notEqual(number(a.tag, 'y'), number(b.tag, 'y'));
  assert.equal(number(a.tag, 'width'), number(b.tag, 'width'));
  assert.ok(number(tiny.tag, 'width') < number(a.tag, 'width') / 10000);
  assert.match(svg, /19\.9999/);
});

test('timeline rejects reversed or out-of-domain intervals, events, cutoffs, and duplicate IDs', () => {
  const mutations = [
    d => { d.domain.max = 0; },
    d => { d.domain.unit = ''; },
    d => { d.lanes[0].intervals[0].end = 0; },
    d => { d.lanes[0].intervals[0].start = -1; },
    d => { d.lanes[0].intervals[0].end = 21; },
    d => { d.lanes[0].events[0].time = 21; },
    d => { d.cutoffs[0].time = -1; },
    d => { d.lanes[0].events[0].id = 'train'; },
    d => { d.lanes.push(structuredClone(d.lanes[0])); },
    d => { delete d.lanes[0].intervals; delete d.lanes[0].events; },
    d => { d.events = [{ time: '1', label: 'Old' }, { time: '2', label: 'Old' }]; },
    d => { d.lanes[0].intervals[0].x = 100; },
    d => { d.domain.max = Infinity; },
  ];
  for (const mutate of mutations) {
    const diagram = structuredClone(timeline);
    mutate(diagram);
    assert.equal(schema.safeParse(diagram).success, false, mutate.toString());
  }
});

test('teaching matrix preserves literal values and draws distinct missing, changed, and selected cells', () => {
  const svg = render(layouts.matrix(schema.parse(matrix), 320));
  const cells = new Map(tags(svg, 'data-tutor-matrix-cell').map(mark => [mark.value, mark.tag]));
  assert.match(cells.get('r1:0'), /data-state="missing"/);
  assert.match(cells.get('r2:0'), /data-state="changed"/);
  assert.match(cells.get('r2:1'), /data-emphasis="true"/);
  assert.doesNotMatch(cells.get('r1:1'), /data-emphasis="true"/);
  assert.notEqual(cells.get('r1:0').match(/ fill="([^"]+)"/)[1], cells.get('r2:0').match(/ fill="([^"]+)"/)[1]);
  assert.match(svg, />NA<\/tspan>/);
  assert.match(svg, />30<\/tspan>/);
  assert.match(svg, /Missing/);
  assert.match(svg, /Changed/);
});

test('matrix row and column emphasis follows stable IDs after row reordering', () => {
  const diagram = { ...matrix, rows: [...matrix.rows].reverse(), emphasis: { rows: ['r2'], columns: [1] } };
  const svg = render(layouts.matrix(schema.parse(diagram), 320));
  const cells = new Map(tags(svg, 'data-tutor-matrix-cell').map(mark => [mark.value, mark.tag]));
  for (const key of ['r2:0', 'r2:1', 'r1:1']) assert.match(cells.get(key), /data-emphasis="true"/);
  assert.doesNotMatch(cells.get('r1:0'), /data-emphasis="true"/);
  const headers = tags(svg, 'data-tutor-matrix-row');
  assert.deepEqual(headers.map(mark => mark.value), ['r2', 'r1']);
});

test('matrix rejects uneven rows, absent or duplicate stable IDs, and invalid emphasis/state references', () => {
  const mutations = [
    d => { d.rows[0].cells.pop(); },
    d => { delete d.rows[0].id; },
    d => { d.rows[1].id = 'r1'; },
    d => { d.states[0].row = 'unknown'; },
    d => { d.states[0].column = 2; },
    d => { d.states.push({ row: 'r1', column: 0, state: 'changed' }); },
    d => { d.emphasis.rows = ['unknown']; },
    d => { d.emphasis.columns = [-1]; },
    d => { d.emphasis.cells = [{ row: 'r1', column: 2 }]; },
    d => { d.emphasis.cells = [{ row: 'r1', column: 0 }, { row: 'r1', column: 0 }]; },
    d => { d.rows[0].cells[0] = { value: 'NA', color: 'red' }; },
  ];
  for (const mutate of mutations) {
    const diagram = structuredClone(matrix);
    mutate(diagram);
    assert.equal(schema.safeParse(diagram).success, false, mutate.toString());
  }
});

test('old timeline and matrix specs retain byte-identical layout output without a variant', () => {
  const diagrams = [
    { kind: 'timeline', title: 'Old events', events: [{ time: 'Now', label: 'Start' }, { time: 'Later', label: 'Finish', detail: 'Saved' }] },
    { kind: 'matrix', title: 'Old table', columns: ['A', 'B'], rows: [{ heading: 'One', cells: ['1', '2'] }, { heading: 'Two', cells: ['3', '4'] }] },
  ];
  for (const diagram of diagrams) {
    assert.deepEqual(schema.parse(diagram), diagram);
    assert.equal(render(layouts[diagram.kind](diagram, 320)), render(legacy[diagram.kind](diagram, 320)));
    assert.equal(describe(diagram), null);
    assert.equal(visibleText(diagram), null);
  }
  const invalid = { ...diagrams[1], states: [{ row: 'one', column: 0, state: 'changed' }] };
  assert.equal(schema.safeParse(invalid).success, false);
});

test('descriptions and visible text include new lane, cutoff, cell state, and emphasis semantics', () => {
  const timelineText = visibleText(timeline).filter(Boolean).join(' ');
  for (const value of ['Event time', 'day', 'Fold 1', 'Prediction', 'Available', 'Late']) assert.ok(timelineText.includes(value), value);
  assert.match(describe(timeline).join(' '), /0.*10.*day/);
  const matrixText = visibleText(matrix).filter(Boolean).join(' ');
  for (const value of ['Age', 'Score', 'Sample 1', 'NA', 'Missing', 'Changed']) assert.ok(matrixText.includes(value), value);
  assert.match(describe(matrix).join(' '), /Sample 2.*Score.*highlight/i);
});

test('long formulas keep native type size and remain inside their matrix cells and timeline labels', () => {
  const formula = '$a+b+c+d+e+f+g+h+i+j+k+l+m+n$';
  const grid = structuredClone(matrix);
  grid.rows[0].cells[1] = formula;
  const gridSvg = render(layouts.matrix(schema.parse(grid), 320));
  const start = gridSvg.indexOf('data-tutor-matrix-cell="r1:1"');
  const cellStart = gridSvg.lastIndexOf('<rect', start);
  const cellEnd = gridSvg.indexOf('<rect', start);
  const cell = gridSvg.slice(cellStart, cellEnd);
  const [rect] = cell.match(/<rect\b[^>]*>/g);
  const [object] = cell.match(/<foreignObject\b[^>]*>/g);
  assert.ok(number(object, 'x') >= number(rect, 'x'));
  assert.ok(number(object, 'x') + number(object, 'width') <= number(rect, 'x') + number(rect, 'width'));
  const timed = structuredClone(timeline);
  timed.lanes[0].events[0].label = formula;
  const frame = layouts.timeline(schema.parse(timed), 320);
  const svg = render(frame);
  for (const [tag] of svg.matchAll(/<foreignObject\b[^>]*>/g)) {
    assert.ok(number(tag, 'x') >= 0);
    assert.ok(number(tag, 'x') + number(tag, 'width') <= frame.width);
  }
});

test('crowded cutoff and entry labels never overlap or escape the frame', () => {
  const diagram = structuredClone(timeline);
  diagram.cutoffs = [
    { id: 'c1', label: 'Cutoff near the start', time: 0 },
    { id: 'c2', label: 'A nearby cutoff', time: 0.0001 },
    { id: 'c3', label: 'Cutoff at the end', time: 20 },
  ];
  const frame = layouts.timeline(schema.parse(diagram), 320);
  const labels = tags(render(frame), 'data-tutor-time-label').map(({ tag }) => ({
    x: number(tag, 'x'), y: number(tag, 'y'), width: number(tag, 'width'), height: number(tag, 'height'),
  }));
  for (const [i, a] of labels.entries()) {
    assert.ok(a.x >= 0 && a.x + a.width <= frame.width);
    for (const b of labels.slice(i + 1)) {
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
  }
});

test('references parse and render at narrow and wide widths with finite bounded geometry', () => {
  assert.ok(references.length >= 16);
  assert.equal(new Set(references.map(ref => ref.id)).size, references.length);
  for (const ref of references) {
    const diagram = schema.parse(ref.spec.diagram);
    assert.ok(ref.prompts.length && ref.lessons.length && ref.useWhen);
    assert.ok(JSON.stringify(ref.spec).length < 5000, ref.id);
    for (const width of [320, 720]) {
      const frame = layouts[diagram.kind](diagram, width);
      assert.ok(frame.width >= width && frame.height > 0, ref.id);
      const svg = render(frame);
      assert.doesNotMatch(svg, /NaN|Infinity/, ref.id);
      for (const [tag] of svg.matchAll(/<rect\b[^>]*>/g)) {
        assert.ok(number(tag, 'x') >= 0 && number(tag, 'y') >= 0, `${ref.id}: ${tag}`);
        assert.ok(number(tag, 'x') + number(tag, 'width') <= frame.width + 0.01, `${ref.id}: ${tag}`);
        assert.ok(number(tag, 'y') + number(tag, 'height') <= frame.height + 0.01, `${ref.id}: ${tag}`);
      }
    }
  }
});

test('fixed encoding, Bayes, and lag examples retain their checked numerical meaning', () => {
  const byId = new Map(references.map(ref => [ref.id, ref.spec.diagram]));
  assert.deepEqual(byId.get('one-hot-encoding').rows.map(row => row.cells), [['red', '1', '0'], ['blue', '0', '1'], ['red', '1', '0']]);
  assert.deepEqual(byId.get('bayes-laplace-smoothing').rows.map(row => row.cells), [['3', '$4/6$'], ['0', '$1/6$'], ['0', '$1/6$']]);
  assert.deepEqual(byId.get('lag-feature-matrix').rows.map(row => row.cells), [['10', 'NA', 'NA'], ['12', '10', 'NA'], ['9', '12', '10'], ['15', '9', '12']]);
});
