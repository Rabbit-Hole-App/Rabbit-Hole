// VAR-1 step 1, the two schema property additions (derived.js): `derive` on an annotation (point, segment, vector, reference-line) and `op` (+ `t`) on a list transformation, with the
// fields they make optional (an annotation's y or value, a softmax card's after items). Acceptance items 2 and 3 of the spec live here; acceptance 1 is in derived.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { seriesAt } from './derived.js';
import { parseTutorDiagram, tutorDiagramSchema } from './spec.js';

const wrap = diagram => ({ version: 1, diagram });
const issues = diagram => { const r = tutorDiagramSchema.safeParse(wrap(diagram)); return r.success ? [] : r.error.issues.map(i => ({ path: i.path.slice(1).join('.'), message: i.message, code: i.params?.code })); };
const filled = diagram => parseTutorDiagram(wrap(diagram)).diagram;
const arithmetic = list => list.filter(i => i.code === 'arithmetic');
const copy = value => structuredClone(value);

// ---- softmax ----
const logits = (extra = {}, after = ['0.70', '0.26', '0.04']) => ({ kind: 'transformation', title: 'Scores to shares', before: { label: 'Logits', items: ['2.0', '1.0', '0.1'] }, after: { label: 'Shares', items: after }, operation: 'Turn the scores into shares', ...extra }); // NUM-3d: the old wording 'Exponentiate and divide by the total' is now a softmax word, so this fixture says it differently

test('acceptance 3: op softmax recomputes with no softmax word anywhere; the logits card 0.70 / 0.26 / 0.04 fails naming 0.66 / 0.24 / 0.10', () => {
  assert.deepEqual(issues(logits()), [], 'without op and without the word, nothing is checked (the 154 fallback only fires on the word)');
  const found = issues(logits({ op: 'softmax' }));
  assert.equal(found.length, 1);
  assert.equal(found[0].message, 'After values must be softmax of the before values: softmax(2.0, 1.0, 0.1) = 0.66, 0.24, 0.10, not 0.70, 0.26, 0.04.');
  assert.equal(found[0].code, 'arithmetic');
  assert.deepEqual(issues(logits({ op: 'softmax' }, ['0.66', '0.24', '0.10'])), []);
});

test('op softmax: t divides the before items; the gate words turn off the word trigger only, never op', () => {
  // softmax(2, 1, 0.1 / 0.5) = softmax(4, 2, 0.2) = 0.8647, 0.1170, 0.0183 (rounded: 0.86, 0.12, 0.02)
  const found = issues(logits({ op: 'softmax', t: 0.5 }, ['0.66', '0.24', '0.10']));
  assert.equal(found.length, 1);
  assert.match(found[0].message, /softmax\(2\.0, 1\.0, 0\.1 \/ 0\.5\) = 0\.86, 0\.12, 0\.02, not 0\.66, 0\.24, 0\.10\./);
  assert.deepEqual(issues(logits({ op: 'softmax', t: 0.5 }, ['0.86', '0.12', '0.02'])), []);
  assert.equal(arithmetic(issues(logits({ op: 'softmax', title: 'Scores at temperature 1' }))).length, 1, 'a gate word does not disable op');
  assert.deepEqual(issues(logits({ title: 'Softmax at temperature 0.5', operation: 'Scale then softmax' }, ['0.66', '0.24', '0.10'])), [], 'the word trigger stays gated');
  assert.deepEqual(issues({ ...logits({ op: 'softmax' }), before: { label: 'Logits', items: ['h1', 'h2', 'h3'] } }).map(i => i.code), [undefined], 'op on non-numeric items is an ordinary issue, not arithmetic');
});

test('op softmax: after items left out are computed (2 decimals) and the links read against the computed count', () => {
  const card = logits({ op: 'softmax', links: [{ from: 0, to: 2 }] }); delete card.after.items;
  const d = filled(card);
  assert.deepEqual(d.after.items, ['0.66', '0.24', '0.10']);
  const bad = copy(card); bad.links = [{ from: 0, to: 3 }];
  assert.deepEqual(issues(bad).map(i => i.message), ['Mapping indices must refer to existing items']);
  const noOp = copy(card); delete noOp.op;
  assert.deepEqual(issues(noOp).map(i => i.message), ['A list transformation needs an item list'], 'without op an item list is still required');
  assert.deepEqual(filled(logits({ op: 'softmax', t: 0.5 }, ['0.86', '0.12', '0.02'])).after.items, ['0.86', '0.12', '0.02'], 'a present, correct list is kept as written');
});


// ---- coordinate-plot derive ----
const plot = (annotations, series = [{ label: 'Data', kind: 'line', points: [{ x: 0, y: 1 }, { x: 1, y: 4 }, { x: 2, y: 2 }, { x: 3, y: 5 }, { x: 4, y: 3 }] }]) =>
  ({ kind: 'coordinate-plot', title: 'Series', x: { label: 'x', min: 0, max: 6 }, y: { label: 'y', min: 0, max: 10 }, series, annotations });
const refLine = extra => ({ kind: 'reference-line', label: 'Mean', axis: 'y', ...extra });

test('acceptance 2: a reference-line with derive series.0:mean and no value is drawn at the series mean; a wrong value is rejected naming the mean', () => {
  assert.equal(filled(plot([refLine({ derive: 'series.0:mean' })])).annotations[0].value, 3, 'integer targets 1, 4, 2, 5, 3: mean 3');
  assert.deepEqual(issues(plot([refLine({ derive: 'series.0:mean', value: 3 })])), []);
  const wrong = issues(plot([refLine({ derive: 'series.0:mean', value: 4 })]));
  assert.deepEqual(wrong, [{ path: 'annotations.0.value', message: 'Mean is at the mean of "Data" (y): 3, not 4.', code: 'arithmetic' }]);
});

test('derive statistics: median, min, max, the axis of the line, decimals (inputs + 1, capped at 3) and the tolerance of the written decimals', () => {
  const at = (stat, extra = {}) => filled(plot([refLine({ derive: `series.0:${stat}`, ...extra })])).annotations[0].value;
  assert.deepEqual(['median', 'min', 'max'].map(stat => at(stat)), [3, 1, 5]);
  const halves = [{ label: 'Data', kind: 'scatter', points: [{ x: 1, y: 1.5 }, { x: 2, y: 2.5 }] }];
  assert.equal(filled(plot([refLine({ derive: 'series.0:mean' })], halves)).annotations[0].value, 2, 'one decimal in, two decimals kept: 2');
  const thirds = [{ label: 'Data', kind: 'scatter', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 2 }] }];
  assert.equal(filled(plot([refLine({ derive: 'series.0:mean' })], thirds)).annotations[0].value, 1.7, 'integers in, one decimal out: 5/3 is 1.7');
  const long = [{ label: 'Data', kind: 'scatter', points: [{ x: 1, y: 0.1234 }, { x: 2, y: 0.2 }, { x: 3, y: 0.3 }] }];
  assert.equal(filled(plot([refLine({ derive: 'series.0:mean' })], long)).annotations[0].value, 0.208, 'capped at three decimals');
  assert.equal(filled(plot([refLine({ axis: 'x', derive: 'series.0:max' })])).annotations[0].value, 4, 'the axis x reads the x values');
  assert.deepEqual(issues(plot([refLine({ derive: 'series.0:mean', value: 3.02 })], thirds)), [{ path: 'annotations.0.value', message: 'Mean is at the mean of "Data" (y): 1.7, not 3.02.', code: 'arithmetic' }]);
  assert.deepEqual(issues(plot([refLine({ derive: 'series.0:mean', value: 1.7 })], thirds)), [], 'written to one decimal: within a half unit of 1.6667');
  assert.deepEqual(issues(plot([refLine({ derive: 'series.0:mean', value: 1.67 })], thirds)), [], 'written to two decimals: 1.67 is within 0.005 of 1.6667');
  assert.equal(arithmetic(issues(plot([refLine({ derive: 'series.0:mean', value: 1.66 })], thirds))).length, 1, '1.66 is 0.0067 away');
});

test('derive on: a point, segment end or vector end on a series takes its y from the series with the series\' own interpolation', () => {
  const line = [{ label: 'Fit', kind: 'line', points: [{ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 4, y: 8 }] }];
  const point = extra => ({ kind: 'point', label: 'Probe', derive: 'series.0:on', ...extra });
  assert.equal(filled(plot([point({ x: 1 })], line)).annotations[0].y, 2, 'collinear samples: the monotone curve is the line');
  assert.deepEqual(issues(plot([point({ x: 1, y: 2 })], line)), []);
  assert.deepEqual(issues(plot([point({ x: 1, y: 3 })], line)), [{ path: 'annotations.0.y', message: 'Probe must sit on the series "Fit": at x = 1 its y is 2, not 3.', code: 'arithmetic' }]);
  const seg = filled(plot([{ kind: 'segment', label: 'Rise', derive: 'series.0:on', from: { x: 1 }, to: { x: 3 } }], line)).annotations[0];
  assert.deepEqual([seg.from, seg.to], [{ x: 1, y: 2 }, { x: 3, y: 6 }]);
  const vec = filled(plot([{ kind: 'vector', label: 'Step', derive: 'series.0:on', from: { x: 0, y: 0 }, to: { x: 4 } }], line)).annotations[0];
  assert.deepEqual([vec.from, vec.to], [{ x: 0, y: 0 }, { x: 4, y: 8 }], 'a written end is checked, an omitted y is filled');
  // The series' own interpolation: straight segments when smooth is false, a held value for a step, own x only for a scatter.
  const bent = points => [{ label: 'Fit', kind: 'line', points, smooth: false }];
  assert.equal(seriesAt(bent([{ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 4, y: 4 }])[0], 1).y, 2);
  assert.equal(seriesAt({ label: 'S', kind: 'step', points: [{ x: 0, y: 1 }, { x: 2, y: 3 }, { x: 4, y: 2 }] }, 3).y, 3, 'a step holds the previous value');
  assert.match(seriesAt({ label: 'S', kind: 'scatter', points: [{ x: 0, y: 1 }, { x: 2, y: 3 }] }, 1).error, /own x values/);
  assert.match(seriesAt({ label: 'S', kind: 'line', points: [{ x: 0, y: 1 }, { x: 2, y: 3 }] }, 5).error, /outside the x range/);
  // The monotone curve between uneven samples matches the renderer: it stays between its neighbours and passes through the samples.
  const curved = { label: 'S', kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 8 }, { x: 3, y: 9 }] };
  // At x = 1.25 the Hermite form with Steffen's tangents (2 and 2 here) gives 2.28125 by hand; the straight line would give 2.75.
  assert.ok(Math.abs(seriesAt(curved, 1.25).y - 2.28125) < 1e-9, `monotone cubic, not linear: ${seriesAt(curved, 1.25).y}`);
  assert.equal(seriesAt(curved, 2).y, 8);
});

test('derive centroid: a point at the means of the series; a wrong written coordinate is rejected naming the centroid', () => {
  const scatter = [{ label: 'Cloud', kind: 'scatter', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] }];
  const centroid = extra => ({ kind: 'point', label: 'Centre', derive: 'series.0:centroid', ...extra });
  const d = filled(plot([centroid()], scatter)).annotations[0];
  assert.deepEqual([d.x, d.y], [3, 4]);
  assert.deepEqual(issues(plot([centroid({ x: 3, y: 4 })], scatter)), []);
  const wrong = issues(plot([centroid({ x: 3, y: 5 })], scatter));
  assert.deepEqual(wrong, [{ path: 'annotations.0.y', message: 'The centroid of "Cloud" is (3, 4); Centre must be there, not y = 5.', code: 'arithmetic' }]);
});

test('derive: unknown series, a rule the kind does not carry, a missing x and a missing value are ordinary issues', () => {
  const msg = annotation => issues(plot([annotation])).map(i => [i.path, i.message, i.code]);
  assert.deepEqual(msg(refLine({ derive: 'series.2:mean' })), [['annotations.0.derive', 'derive refers to series 2, which does not exist (there are 1)', undefined]]);
  assert.deepEqual(msg(refLine({ derive: 'series.0:on' })), [['annotations.0.derive', 'A reference-line derives series.0:mean or series.0:median or series.0:min or series.0:max, not series.0:on', undefined]]);
  assert.deepEqual(msg({ kind: 'point', label: 'P', derive: 'series.0:on' }), [['annotations.0.x', 'A point needs x.', undefined]]);
  assert.deepEqual(msg(refLine()), [['annotations.0.value', 'A reference-line needs a value (or a derive that computes it).', undefined]]);
  assert.deepEqual(msg({ kind: 'point', label: 'P', x: 2 }).map(i => i[1]), ['A point needs y (or a derive that computes it).']);
  assert.deepEqual([...new Set(msg({ kind: 'point', label: 'P', x: 2, y: 3, derive: 'series.zero:on' }).map(i => i[0]))], ['annotations.0.derive'], 'a malformed derive fails the schema pattern');
});


test('a filled op softmax card and a filled derive card are valid input again (idempotent)', () => {
  for (const card of [logits({ op: 'softmax' }, ['0.66', '0.24', '0.10']), plot([refLine({ derive: 'series.0:mean' }), { kind: 'point', label: 'P', derive: 'series.0:on', x: 1 }])]) {
    const once = filled(card);
    assert.deepEqual(filled(once), once, card.kind);
  }
});
