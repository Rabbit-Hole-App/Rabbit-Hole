import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import { createShapes, validate, describe, visibleText } from './ml-statistical-spec.js';
import { createLayouts } from './ml-statistical-layouts.js';
import { references } from './ml-statistical-references.js';
import { TEACHING } from './teaching-theme.js';
import { lineHeight, textWidth } from './primitives.js';

const text = max => z.string().min(1).max(max);
const numeric = z.number().min(-1e9).max(1e9);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/);
const unit = text(12).optional();
const shapes = createShapes({ z, text, numeric, id, unit,
  titled: { title: text(90), caption: text(140).optional() },
  axes: z.strictObject({ label: text(36), min: numeric, max: numeric, unit }),
});
const schema = z.discriminatedUnion('kind', shapes).superRefine((d, ctx) =>
  validate(d, (path, message, params) => ctx.addIssue({ code: 'custom', path, message, ...(params && { params }) })));
const layouts = createLayouts({ legacy: {} });
const parse = value => schema.parse(value);
const copy = value => structuredClone(value);
function svg(d, width = 320) {
  const frame = layouts[d.kind](parse(d), width);
  return { ...frame, svg: renderToStaticMarkup(h('svg', { viewBox: `0 0 ${frame.width} ${frame.height}` }, ...frame.elements)) };
}
function marks(source, attr) {
  return [...source.matchAll(new RegExp(`<[^>]* ${attr}="([^"]*)"[^>]*>`, 'g'))]
    .map(match => ({ tag: match[0], value: match[1] }));
}
function num(tag, attr) {
  const value = tag.match(new RegExp(` ${attr}="([^"]+)"`))?.[1];
  assert.notEqual(value, undefined, `${attr} on ${tag}`);
  assert.ok(Number.isFinite(Number(value)), `${attr} must be finite`);
  return Number(value);
}
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b)), `${a} ~= ${b}`);

const heatmap = { kind: 'heatmap', title: 'Signed correlation', rowLabel: 'Feature', columnLabel: 'Feature',
  columns: ['A', 'B', 'C'], range: { min: -1, max: 1 },
  rows: [{ label: 'A', cells: [-1, 0, 1] }, { label: 'B', cells: [0.125, null, -0.5] }],
  highlights: [{ row: 1, column: 0 }],
};
const samples = { kind: 'sample-set', title: 'Bootstrap identities',
  samples: [{ id: 'a', label: 'A', class: 'Majority', weight: 1 }, { id: 'b', label: 'B', class: 'Minority', weight: 3 }, { id: 'c', label: 'C', class: 'Majority' }],
  groups: [
    { id: 'draw', label: 'Bootstrap draw', replacement: true, members: ['a', 'a', 'b'], omitted: ['c'] },
    { id: 'oob', label: 'Out of bag', outOfBagFor: 'draw', members: ['c'] },
  ],
};
const histogram = { kind: 'histogram', title: 'Aligned distributions', xLabel: 'Value', unit: 's',
  binEdges: [0, 1, 3], measure: 'count', density: true,
  series: [{ label: 'Before', values: [4, 4] }, { label: 'After', values: [2, 8] }],
  markers: [{ label: 'Threshold', value: 1.5 }],
};
const boxes = { kind: 'box-plot', title: 'IQR rule', x: { label: 'Value', min: -2, max: 12 },
  boxes: [{ label: 'Sample A', whiskerLow: 0, q1: 2, median: 3, q3: 4, whiskerHigh: 6,
    fences: { lower: -1, upper: 7 }, outliers: [{ label: 'High reading', value: 10 }, { label: 'Repeated reading', value: 10 }] },
    { label: 'Sample B', whiskerLow: 1, q1: 2, median: 4, q3: 5, whiskerHigh: 7 }],
};

test('four strict semantic shapes serialize without renderer-owned fields', () => {
  assert.equal(shapes.length, 4);
  for (const d of [heatmap, samples, histogram, boxes]) {
    assert.deepEqual(parse(d), d);
    assert.doesNotThrow(() => z.toJSONSchema(shapes.find(s => s.shape.kind.value === d.kind)));
    for (const field of ['svg', 'html', 'url', 'style', 'fill', 'width']) {
      assert.equal(schema.safeParse({ ...d, [field]: '<script>bad()</script>' }).success, false, field);
    }
  }
});

test('heatmap displays exact values, signed endpoint colors, a neutral zero and a masked cell', () => {
  const rendered = svg(heatmap).svg;
  const cells = marks(rendered, 'data-tutor-heatmap-cell');
  assert.equal(cells.length, 6);
  assert.match(cells[0].tag, new RegExp(`fill="${TEACHING.coral}"`)); // a negative end is the coral fill (heatColor)
  assert.equal(num(cells[0].tag, 'fill-opacity'), 1);
  assert.equal(num(cells[1].tag, 'fill-opacity'), 0);
  assert.match(cells[2].tag, new RegExp(`fill="${TEACHING.blueFill}"`)); // a positive end is the blue fill
  assert.match(cells[3].tag, new RegExp(`stroke="${TEACHING.blue}"`));
  assert.match(cells[4].tag, /data-tutor-masked="true"/);
  assert.match(rendered, />0\.125</);
  assert.match(rendered, />Masked</);
  assert.match(describe(heatmap).join('\n'), /B: A: 0\.125; B: masked; C: -0\.5/);
});

test('heatmap rejects ragged rows, invalid ranges, outside values and invalid emphasis', () => {
  const invalid = [
    d => d.rows[1].cells.pop(), d => { d.range.max = -1; },
    d => { d.rows[0].cells[0] = -2; }, d => { d.rows[0].cells[0] = NaN; },
    d => { d.highlights = [{ row: 2, column: 0 }]; },
    d => { d.highlights.push({ row: 1, column: 0 }); },
    d => { d.highlights = [{ row: 1, column: 1 }]; },
  ];
  for (const change of invalid) { const d = copy(heatmap); change(d); assert.equal(schema.safeParse(d).success, false); }
});

test('sample-set preserves identity, class, sample weights and replacement multiplicity', () => {
  const rendered = svg(samples).svg;
  const members = marks(rendered, 'data-tutor-sample-member');
  assert.deepEqual(members.map(v => v.value), ['draw:a', 'draw:b', 'oob:c']);
  assert.deepEqual(members.map(v => num(v.tag, 'data-tutor-multiplicity')), [2, 1, 1]);
  // the letter (15 px / 600) and its multiplicity (13 px / 500) are two texts since the chip restyle
  assert.match(rendered, />a</);
  assert.match(rendered, />× 2</);
  assert.match(rendered, /weight 3/);
  assert.match(rendered, /Omitted: c/);
  assert.match(rendered, /Out of bag for Bootstrap draw/);
  assert.match(describe(samples).join('\n'), /a × 2/);
  assert.ok(visibleText(samples).includes('Minority'));
  assert.equal(visibleText(samples).filter(text => text === 'a').length, 2, 'ID appears once in the universe and once in the aggregated draw');
  assert.equal(visibleText(samples).filter(text => text === 'c').length, 3, 'Omitted and OOB labels each count as visible');
});

test('sample-set rejects duplicate identities, unknown IDs, undeclared replacement and false OOB claims', () => {
  const invalid = [
    d => { d.samples[1].id = 'a'; }, d => { d.groups[0].members.push('unknown'); },
    d => { d.groups[0].replacement = false; }, d => { d.groups[0].omitted = ['b']; },
    d => { d.groups[1].members = ['b']; }, d => { d.groups[1].outOfBagFor = 'unknown'; },
    d => { d.groups[1].outOfBagFor = 'oob'; }, d => { d.groups[1].members = ['c', 'c']; d.groups[1].replacement = true; },
    d => { d.samples[0].weight = 0; }, d => { d.samples[0].weight = Infinity; },
    d => { d.groups[1].id = 'draw'; },
  ];
  for (const change of invalid) { const d = copy(samples); change(d); assert.equal(schema.safeParse(d).success, false); }
});

test('an empty OOB set is represented honestly when every identity was drawn', () => {
  const d = copy(samples); d.groups[0].members = ['a', 'b', 'c']; d.groups[0].omitted = []; d.groups[1].members = [];
  assert.doesNotThrow(() => parse(d));
  assert.match(svg(d).svg, /Empty set/);
});

test('unequal-width histogram bars preserve area, aligned bins and common vertical scale', () => {
  const rendered = svg(histogram).svg;
  const bars = marks(rendered, 'data-tutor-histogram-bin');
  assert.equal(bars.length, 4);
  const [a, b, c, d] = bars.map(({ tag }) => ({ x: num(tag, 'x'), width: num(tag, 'width'), height: num(tag, 'height') }));
  close(b.width, 2 * a.width);
  close(a.height, 2 * b.height);
  close(a.width * a.height, b.width * b.height);
  close(a.x, c.x); close(b.x, d.x); close(a.width, c.width);
  close(a.height, d.height); close(c.height * 2, a.height);
  const threshold = marks(rendered, 'data-tutor-histogram-marker');
  close(num(threshold[0].tag, 'x1'), a.x + a.width * 1.5);
  assert.match(rendered, /Count density/);
  // the counts line is gone: the bin masses stay on the bars and the bin edges are the x tick labels
  assert.deepEqual(bars.map(({ tag }) => num(tag, 'data-tutor-bin-mass')), [4, 4, 2, 8]);
  for (const edge of [0, 1, 3]) assert.match(rendered, new RegExp(`>${edge}<`));
});

test('proportion density normalizes by width without replacing the declared bin masses', () => {
  const d = copy(histogram); d.measure = 'proportion'; d.series = [{ label: 'Probability', values: [0.5, 0.5] }];
  const bars = marks(svg(d).svg, 'data-tutor-histogram-bin');
  close(num(bars[0].tag, 'height'), 2 * num(bars[1].tag, 'height'));
  assert.match(describe(d).join('\n'), /0\.5/);
});

test('histogram rejects contradictory edges, dimensions, measures and nonfinite density', () => {
  const invalid = [
    d => { d.density = false; }, d => { delete d.density; },
    d => { d.binEdges = [0, 1, 1]; }, d => { d.binEdges = [0, 2, 1]; },
    d => { d.series[0].values = [1]; }, d => { d.series[0].values = [-1, 2]; },
    d => { d.series[0].values = [0.5, 1]; }, d => { d.series[0].values = [0, 0]; },
    d => { d.measure = 'proportion'; d.series[0].values = [0.2, 0.2]; },
    d => { d.markers[0].value = 4; }, d => { d.binEdges = [0, Number.MIN_VALUE, 3]; },
  ];
  for (const change of invalid) { const d = copy(histogram); change(d); assert.equal(schema.safeParse(d).success, false); }
});

test('equal-width count histograms need no density flag and preserve exact edges', () => {
  const d = copy(histogram); d.binEdges = [0, 1, 2]; delete d.density;
  assert.doesNotThrow(() => parse(d));
  const bars = marks(svg(d).svg, 'data-tutor-histogram-bin');
  close(num(bars[0].tag, 'width'), num(bars[1].tag, 'width'));
  close(num(bars[0].tag, 'height'), num(bars[1].tag, 'height'));
});

test('box plots put quartiles, whiskers, fences and repeated outliers on the same x scale', () => {
  const rendered = svg(boxes).svg;
  const box = marks(rendered, 'data-tutor-box')[0].tag;
  const medians = marks(rendered, 'data-tutor-box-median');
  close(num(medians[0].tag, 'x1'), num(box, 'x') + num(box, 'width') / 2);
  const whiskers = marks(rendered, 'data-tutor-box-whisker');
  close(num(whiskers[0].tag, 'x1'), num(box, 'x') - num(box, 'width'));
  const fences = marks(rendered, 'data-tutor-box-fence');
  close(num(fences[0].tag, 'x1'), num(box, 'x') - 1.5 * num(box, 'width'));
  const outliers = marks(rendered, 'data-tutor-box-outlier');
  close(num(outliers[0].tag, 'cx'), num(box, 'x') + 4 * num(box, 'width'));
  close(num(outliers[0].tag, 'cx'), num(outliers[1].tag, 'cx'));
  assert.notEqual(num(outliers[0].tag, 'cy'), num(outliers[1].tag, 'cy'));
  assert.match(rendered, /Lower fence: -1/);
  assert.match(rendered, /Upper fence: 7/);
  assert.match(rendered, /High reading: 10/);
});

test('box plots reject unordered summaries, invalid fences, false outliers and an empty axis', () => {
  const invalid = [
    d => { d.boxes[0].q1 = 4; }, d => { d.boxes[0].median = 5; },
    d => { d.boxes[0].whiskerLow = 3; }, d => { d.boxes[0].whiskerHigh = 3; },
    d => { d.boxes[0].fences.lower = 1; }, d => { d.boxes[0].fences.upper = 5; },
    d => { d.boxes[0].outliers[0].value = 7; }, d => { d.boxes[0].outliers[0].value = 13; },
    d => { d.x.min = 2; }, d => { d.x.max = d.x.min; },
    d => { d.boxes[0].median = NaN; },
  ];
  for (const change of invalid) { const d = copy(boxes); change(d); assert.equal(schema.safeParse(d).success, false); }
});

// Fences are recomputed from the quartiles: 1.5 x IQR past Q1 and Q3, within half a unit of the last decimal written.
const fenceCard = (box, x = { label: 'Reading', min: 0, max: 20 }) => ({ kind: 'box-plot', title: 'IQR rule', x, boxes: [{ label: 'Trial', ...box }] });
const trial = { whiskerLow: 4, q1: 6, median: 9, q3: 12, whiskerHigh: 14 };
const problems = d => { const found = []; validate(d, (path, message, params) => found.push({ path: path.join('.'), message, params })); return found; };

test('box plot fences that are not Q1 - 1.5 IQR and Q3 + 1.5 IQR are rejected with the numbers, tagged arithmetic', () => {
  const wrong = fenceCard({ ...trial, fences: { lower: 2, upper: 16 }, outliers: [{ label: 'High', value: 18 }] }, { label: 'Reading', min: 0, max: 20 });
  assert.equal(schema.safeParse(wrong).success, false);
  const found = problems(wrong);
  assert.equal(found.length, 1);
  assert.equal(found[0].message, 'Fences must be Q1 - 1.5 x IQR and Q3 + 1.5 x IQR: with Q1 6 and Q3 12 that is -3 and 21, not 2 and 16.');
  assert.deepEqual(found[0].params, { code: 'arithmetic' });
  // The tag reaches the zod issue the repair path reads.
  assert.deepEqual(schema.safeParse(wrong).error.issues.find(i => i.path.join('.') === 'boxes.0.fences').params, { code: 'arithmetic' });
  // With the fences corrected, the outlier at 18 is inside 21 and fails the shape rule by itself.
  const outlierInside = problems(fenceCard({ ...trial, fences: { lower: -3, upper: 21 }, outliers: [{ label: 'High', value: 18 }] }));
  assert.deepEqual(outlierInside.map(i => i.message), ['An outlier must lie strictly outside the fences, or whiskers when no fences are supplied']);
  assert.equal(outlierInside[0].params, undefined);
});

test('box plot with the true fences passes, with or without an outlier beyond them', () => {
  const fences = { lower: -3, upper: 21 };
  assert.deepEqual(problems(fenceCard({ ...trial, fences })), []);
  assert.equal(schema.safeParse(fenceCard({ ...trial, fences, outliers: [{ label: 'High', value: 25 }] }, { label: 'Reading', min: 0, max: 25 })).success, true);
});

test('box plot without fences is unaffected by the fence arithmetic', () => {
  assert.deepEqual(problems(fenceCard(trial)), []);
  assert.deepEqual(problems(fenceCard({ ...trial, outliers: [{ label: 'High', value: 18 }] })), []);
});

test('box plot fence arithmetic keeps fractions exact and allows half a unit of the last decimal', () => {
  const fractional = { whiskerLow: 1.25, q1: 1.25, median: 2, q3: 3.75, whiskerHigh: 3.75 };
  assert.deepEqual(problems(fenceCard({ ...fractional, fences: { lower: -2.5, upper: 7.5 } })), []);
  // q1 2.04, q3 5.65: the exact fences are -3.375 and 11.065; two decimals written may round them to -3.37 and 11.07.
  const rounded = { whiskerLow: 2.04, q1: 2.04, median: 3, q3: 5.65, whiskerHigh: 5.65 };
  assert.deepEqual(problems(fenceCard({ ...rounded, fences: { lower: -3.37, upper: 11.07 } })), []);
  assert.deepEqual(problems(fenceCard({ ...rounded, fences: { lower: -3.39, upper: 11.07 } })).map(i => i.params), [{ code: 'arithmetic' }]);
  assert.deepEqual(problems(fenceCard({ ...rounded, fences: { lower: -3.37, upper: 11.09 } })).map(i => i.params), [{ code: 'arithmetic' }]);
});

test('box plot axis widens to hold a computed fence below x.min instead of clipping or failing', () => {
  const d = fenceCard({ ...trial, fences: { lower: -3, upper: 21 }, outliers: [{ label: 'Far reading', value: 25 }] }, { label: 'Reading', min: 0, max: 25 });
  assert.equal(schema.safeParse(d).success, true);
  const { width, svg: rendered } = svg(d);
  const fence = marks(rendered, 'data-tutor-box-fence'), outlier = marks(rendered, 'data-tutor-box-outlier');
  const xs = [...fence.map(m => num(m.tag, 'x1')), ...outlier.map(m => num(m.tag, 'cx')), ...marks(rendered, 'data-tutor-box-whisker').flatMap(m => [num(m.tag, 'x1'), num(m.tag, 'x2')])];
  const left = 12 + 10, right = width - 12 - 10; // PAD 12 plus the 10 px inset
  for (const value of xs) assert.ok(value >= left - 1e-6 && value <= right + 1e-6, `${value} is outside the plot ${left} to ${right}`);
  // The widened axis runs -3 (the fence, below the author's x.min) to 25 (the outlier, at the author's x.max).
  close(num(fence[0].tag, 'x1'), left);
  close(num(outlier[0].tag, 'cx'), right);
  assert.match(rendered, /Lower fence: -3; Upper fence: 21/);
  assert.match(rendered, />-3</);
  assert.match(rendered, />25</);
});

test('constant quartiles remain a valid zero-width box with visible median and whiskers', () => {
  const d = copy(boxes); d.boxes = [{ label: 'Constant', whiskerLow: 3, q1: 3, median: 3, q3: 3, whiskerHigh: 3 }];
  const rendered = svg(d).svg;
  assert.equal(num(marks(rendered, 'data-tutor-box')[0].tag, 'width'), 0);
  assert.equal(marks(rendered, 'data-tutor-box-median').length, 1);
});

test('reference JSON is compact, valid, meaningful and covered by descriptions and visible labels', () => {
  assert.ok(references.length >= 8);
  assert.equal(new Set(references.map(r => r.id)).size, references.length);
  for (const ref of references) {
    assert.match(ref.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(ref.lessons.length && ref.prompts.length && ref.keywords.length && ref.useWhen);
    assert.equal(ref.spec.version, 1);
    assert.ok(JSON.stringify(ref.spec).length < 4200, ref.id);
    const d = parse(ref.spec.diagram);
    assert.ok(describe(d).length > 0, ref.id);
    assert.ok(visibleText(d).includes(d.title), ref.id);
    if (d.caption) assert.ok(visibleText(d).includes(d.caption), ref.id);
    const before = JSON.stringify(d);
    svg(d); assert.equal(JSON.stringify(d), before, 'render must not mutate authored values');
  }
});

test('statistical layouts preserve native fonts and finite bounded geometry at narrow and wide widths', () => {
  for (const d of [heatmap, samples, histogram, boxes, ...references.map(r => r.spec.diagram)]) {
    for (const width of [320, 720]) {
      const frame = svg(d, width);
      assert.ok(frame.width >= width && frame.height > 0 && Number.isFinite(frame.height));
      assert.doesNotMatch(frame.svg, /NaN|Infinity|undefined/);
      for (const [tag] of frame.svg.matchAll(/<rect\b[^>]*>/g)) {
        assert.ok(num(tag, 'x') >= 0 && num(tag, 'y') >= 0, tag);
        assert.ok(num(tag, 'x') + num(tag, 'width') <= frame.width + 0.01, tag);
        assert.ok(num(tag, 'y') + num(tag, 'height') <= frame.height + 0.01, tag);
      }
      for (const [tag] of frame.svg.matchAll(/<text\b[^>]*>/g)) assert.ok(num(tag, 'font-size') >= 12, tag);
      function checkText(element) {
        if (!element?.props) return;
        // A title rotated along the axis (rotate(-90 cx cy), the plot rules): its horizontal extent is its line height around cx, not its text width.
        if (element.type === 'g' && /^rotate\(-90 /.test(element.props.transform ?? '')) {
          const cx = Number(element.props.transform.match(/-?[\d.]+/g)[1]);
          assert.ok(cx - lineHeight(16) / 2 >= -0.01 && cx + lineHeight(16) / 2 <= frame.width + 0.01, `${d.kind}: a rotated title is outside the horizontal frame`);
          return;
        }
        const children = [element.props.children].flat(Infinity);
        if (element.type === 'text') {
          const { fontSize: size, textAnchor } = element.props;
          children.filter(child => child?.type === 'tspan').forEach(child => {
            const w = textWidth(child.props.children, size);
            const left = child.props.x - (textAnchor === 'middle' ? w / 2 : textAnchor === 'end' ? w : 0);
            const center = child.props.y - size * 0.34;
            assert.ok(left >= -0.01 && left + w <= frame.width + 0.01, `${d.kind}: ${child.props.children} outside horizontal frame`);
            assert.ok(center - lineHeight(size) / 2 >= -0.01 && center + lineHeight(size) / 2 <= frame.height + 0.01, `${d.kind}: ${child.props.children} outside vertical frame`);
          });
        }
        children.forEach(checkText);
      }
      frame.elements.forEach(checkText);
    }
  }
});

test('long headers and unsplittable math use measured layout width and retain native text size', () => {
  const d = copy(heatmap);
  d.rowLabel = 'Measurements before transformation';
  d.columns[0] = '$abcdefghijklmnopqr$';
  const frame = svg(d);
  for (const [tag] of frame.svg.matchAll(/<foreignObject\b[^>]*>/g)) {
    assert.ok(num(tag, 'x') >= 0);
    assert.ok(num(tag, 'x') + num(tag, 'width') <= frame.width);
  }
  assert.match(frame.svg, /data-tutor-tex/);
});

test('domain hooks leave unrelated legacy diagrams to the existing code', () => {
  const legacy = { kind: 'flow', title: 'Old' };
  validate(legacy, () => assert.fail('unexpected issue'));
  assert.equal(describe(legacy), null);
  assert.equal(visibleText(legacy), null);
});

// Item 4: a bootstrap draw has exactly n members for n rows (no tolerance).
const rows = id => ({ id, label: id.toUpperCase() });
const bootstrapCard = (draws, extra = {}) => ({ kind: 'sample-set', title: 'Bootstrap sample of training rows', caption: 'Worked example. Rows A to H are drawn with replacement.',
  samples: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(rows), groups: [{ id: 'boot', label: 'Draw', replacement: true, members: draws }], ...extra });
const arithmeticOf = value => { const r = schema.safeParse(value); return r.success ? [] : r.error.issues.filter(i => i.params?.code === 'arithmetic'); };

test('bootstrap draw count: the archive card (6 draws from 8 rows) fails with the numbers, tagged arithmetic; 8 from 8 passes', () => {
  const [bad] = arithmeticOf(bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f']));
  assert.equal(bad.message, 'A bootstrap sample draws n = 8 rows, with replacement; this draws 6.');
  assert.deepEqual(bad.path, ['groups', 0, 'members']);
  assert.equal(schema.safeParse(bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f', 'h', 'h'])).success, true);
  assert.equal(arithmeticOf(bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f', 'h', 'h', 'h'])).length, 1, 'more than n is wrong too');
});

test('bootstrap draw count: m-out-of-n and subsample cards, cards that never say bootstrap, and groups without replacement are left alone; any label can carry the word', () => {
  const short = ['a', 'b', 'b', 'd'];
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { title: 'Bootstrap with m out of n draws' })), []);
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { title: 'm-out-of-n bootstrap' })), []);
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { caption: 'A bootstrap subsample of the rows' })), []);
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { title: 'Sampling with replacement', caption: 'Rows A to H, drawn with replacement.' })), [], 'bootstrap is never said');
  const labelled = bootstrapCard(short, { title: 'Sampling with replacement', caption: undefined }); labelled.groups[0].label = 'Bootstrap draw';
  assert.equal(arithmeticOf(labelled).length, 1, 'a group label saying bootstrap counts');
  const noReplacement = bootstrapCard(['a', 'b', 'c', 'd']); noReplacement.groups[0].replacement = false;
  assert.deepEqual(arithmeticOf(noReplacement), [], 'a plain subset is not a draw with replacement');
  const oob = bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f', 'h', 'h']); oob.groups.push({ id: 'oob', label: 'Out of bag', outOfBagFor: 'boot', members: ['c', 'e', 'g'] });
  assert.equal(schema.safeParse(oob).success, true, 'the out-of-bag group is not a draw');
});
