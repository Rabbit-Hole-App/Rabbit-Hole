// VAR-1 step 1: one table-driven check per derived-field rule (derived.js): present and correct, present and wrong (an issue tagged arithmetic that names the correct numbers),
// absent and filled, the rounding edges, and the spec's acceptance items 1 to 3. Everything goes through the real parser (spec.js), so the fill and the validator are the product's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DERIVED_ROWS, normalise } from './derived.js';
import { describeTutorDiagram, fillAllDerived, parseTutorDiagram, tutorDiagramSchema } from './spec.js';

const wrap = diagram => ({ version: 1, diagram });
const issues = diagram => { const r = tutorDiagramSchema.safeParse(wrap(diagram)); return r.success ? [] : r.error.issues.map(i => ({ path: i.path.slice(1).join('.'), message: i.message, code: i.params?.code })); };
const filled = diagram => parseTutorDiagram(wrap(diagram)).diagram;
const everything = diagram => fillAllDerived(filled(diagram)); // silent derived values too (what a prose token reads)
const arithmetic = list => list.filter(i => i.code === 'arithmetic');

// ---- the table ----
test('the table is closed: one row per definition, each with a kind, a path, inputs, a tolerance and a compute', () => {
  assert.deepEqual(DERIVED_ROWS.map(row => row.kind), ['box-plot', 'transformation', 'token-links', 'histogram', 'heatmap', 'sample-set', 'coordinate-plot', 'bar-chart']);
  for (const row of DERIVED_ROWS) {
    assert.equal(typeof row.path, 'string'); assert.ok(row.inputs.length); assert.equal(typeof row.tolerance, 'string'); assert.equal(typeof row.compute, 'function');
  }
});

test('grep gate: derived.js holds kinds, not subject matter', () => {
  const source = readFileSync(new URL('./derived.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /gradient|neuron|\bbank|\bloss\b|\bcat\b|\bdog\b|attention head|epoch/i);
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, 'no hex literal');
});

// ---- box-plot fences ----
const box = (extra = {}, x = { label: 'Reading', min: 0, max: 25 }) => ({ kind: 'box-plot', title: 'IQR rule', x, boxes: [{ label: 'Trial', whiskerLow: 4, q1: 6, median: 9, q3: 12, whiskerHigh: 14, ...extra }] });
const FENCE_154 = 'Fences must be Q1 - 1.5 x IQR and Q3 + 1.5 x IQR: with Q1 6 and Q3 12 that is -3 and 21, not 2 and 16.';

test('acceptance 1: the trial box card with fences 2/16 fails with release 154\'s message; fences left out are filled and drawn only with outliers; a plain box draws none (Reviewer 2026-11-18)', () => {
  const wrong = issues(box({ fences: { lower: 2, upper: 16 } }));
  assert.deepEqual(wrong, [{ path: 'boxes.0.fences', message: FENCE_154, code: 'arithmetic' }]);
  const withOutlier = filled(box({ outliers: [{ label: 'Late', value: 22 }] }));
  assert.deepEqual(withOutlier.boxes[0].fences, { lower: -3, upper: 21 });
  assert.match(describeTutorDiagram(wrap(withOutlier)), /Lower fence: -3; Upper fence: 21/);
  const plain = filled(box());
  assert.equal(plain.boxes[0].fences, undefined, 'a plain box is not given fences: nothing on the card depends on them');
  assert.doesNotMatch(describeTutorDiagram(wrap(plain)), /fence/i);
  assert.deepEqual(everything(box()).boxes[0].fences, { lower: -3, upper: 21 }, 'but the computed fences exist for a prose token');
  assert.deepEqual(issues(box({ fences: { lower: -3, upper: 21 } })), [], 'present and correct');
});

test('box fence decimals: the most decimals among q1 and q3 (min 0, a tie rounds away from zero); a written fence is allowed half a unit of its own decimals', () => {
  // [q1, q3, lower, upper]
  for (const [q1, q3, lower, upper] of [[6, 12, -3, 21], [5, 8, 1, 13], [1.5, 3.5, -1.5, 6.5], [2, 5.5, -3.3, 10.8], [1.25, 2.75, -1, 5]]) {
    const d = everything(box({ whiskerLow: q1, q1, median: q1, q3, whiskerHigh: q3 }, { label: 'Reading', min: 0, max: 40 }));
    assert.deepEqual([d.boxes[0].fences.lower, d.boxes[0].fences.upper], [lower, upper], `${q1} ${q3}`);
  }
  const rounded = { whiskerLow: 2.04, q1: 2.04, median: 3, q3: 5.65, whiskerHigh: 5.65 };
  assert.deepEqual(issues(box({ ...rounded, fences: { lower: -3.37, upper: 11.07 } }, { label: 'Reading', min: 0, max: 20 })), [], 'true -3.375 written -3.37 is within half a hundredth');
  assert.equal(arithmetic(issues(box({ ...rounded, fences: { lower: -3.39, upper: 11.07 } }, { label: 'Reading', min: 0, max: 20 }))).length, 1);
});

test('box fences: a whisker beyond a written fence still fails; computed fences leave the 154 outlier rule (whiskers) alone', () => {
  assert.equal(arithmetic(issues(box({ whiskerLow: 0, fences: { lower: -3, upper: 21 } }))).length, 0, 'whisker inside the fence');
  assert.equal(arithmetic(issues(box({ whiskerHigh: 24, fences: { lower: -3, upper: 21 } }))).length, 1, 'whisker beyond the upper fence');
  assert.deepEqual(issues(box({ outliers: [{ label: 'High', value: 18 }] })), [], 'no fences written: the outlier is read against the whiskers, as in 154');
});

// ---- token-links ----
const links = weights => ({ kind: 'token-links', title: 'Weights by token', normalized: true, source: ['the', 'cat'], target: ['the', 'cat', 'sat'], queries: [{ index: 0, weights }] });

test('token-links: weights that sum to about 1 stay as written; raw scores are normalised to 2 decimals that add up to exactly 1', () => {
  for (const [written, expected] of [[[0.33, 0.33, 0.34], [0.33, 0.33, 0.34]], [[0.98, 0.01, 0.01], [0.98, 0.01, 0.01]], [[3, 1, 0], [0.75, 0.25, 0]], [[1, 1, 1], [0.34, 0.33, 0.33]],
    [[0.2, 0.2, 0.2], [0.34, 0.33, 0.33]], [[2, 1, 1], [0.5, 0.25, 0.25]], [[0, 0, 1.01], [0, 0, 1]]]) {
    const d = filled(links(written));
    assert.deepEqual(d.queries[0].weights, expected, written.join(' '));
    assert.ok(Math.abs(d.queries[0].weights.reduce((a, b) => a + b, 0) - 1) < 0.021);
  }
  assert.equal(issues(links([0, 0, 0])).length, 1, 'a zero total has no shares');
  assert.equal(issues({ ...links([0, 0, 1.01]), normalized: false }).length, 1, 'without normalized each weight is still at most 1');
  assert.deepEqual(normalise([1, 1, 1]), [0.34, 0.33, 0.33]);
});

// ---- histogram ----
const histogram = (values, measure = 'proportion') => ({ kind: 'histogram', title: 'Spread', xLabel: 'Reading', binEdges: [0, 1, 2, 3], measure, series: [{ label: 'Group', values }] });

test('histogram: counts under measure proportion are accepted and derived to proportions; proportions and the wrong sums behave as before', () => {
  assert.deepEqual(filled(histogram([2, 6, 2])).series[0].values, [0.2, 0.6, 0.2]);
  assert.deepEqual(filled(histogram([1, 1, 1])).series[0].values, [0.34, 0.33, 0.33]);
  assert.deepEqual(filled(histogram([0.2, 0.5, 0.3])).series[0].values, [0.2, 0.5, 0.3], 'proportions already summing to 1 are kept');
  assert.deepEqual(filled(histogram([1, 0, 0])).series[0].values, [1, 0, 0], 'a whole-number list that already is a proportion list is kept');
  assert.deepEqual(issues(histogram([0.2, 0.5, 0.5])).map(i => i.message), ['Bin proportions must be in [0, 1] and sum to 1'], 'fractions that do not sum to 1 are still rejected');
  assert.ok(issues(histogram([0, 0, 0])).some(i => i.message === 'A distribution must contain positive mass'));
  assert.deepEqual(filled(histogram([2, 6, 2], 'count')).series[0].values, [2, 6, 2], 'measure count is untouched');
});

// ---- heatmap ----
const heatmap = (extra = {}) => ({ kind: 'heatmap', title: 'Grid', columns: ['a', 'b'], rows: [{ label: 'r1', cells: [0.2, null] }, { label: 'r2', cells: [-0.5, 0.9] }], ...extra });

test('heatmap: an absent range is the smallest and largest numeric cell; a written range is kept and still bounds the cells', () => {
  assert.deepEqual(filled(heatmap()).range, { min: -0.5, max: 0.9 });
  assert.deepEqual(filled(heatmap({ range: { min: -1, max: 1 } })).range, { min: -1, max: 1 });
  assert.deepEqual(issues(heatmap({ range: { min: 0, max: 0.5 } })).map(i => i.message), ['Cell value is outside the explicit range', 'Cell value is outside the explicit range']);
  assert.match(issues(heatmap({ rows: [{ label: 'r1', cells: [0.5, 0.5] }, { label: 'r2', cells: [0.5, 0.5] }] }))[0].message, /no range can be computed/);
  assert.match(issues(heatmap({ rows: [{ label: 'r1', cells: [null, null] }, { label: 'r2', cells: [null, null] }] }))[0].message, /masked cells/);
});

// ---- sample-set ----
const samples = groups => ({ kind: 'sample-set', title: 'Bootstrap draw', samples: ['a', 'b', 'c', 'd'].map(id => ({ id })), groups });

test('sample-set: omitted must be the set difference (arithmetic, naming the correct ids); out-of-bag members left out are filled from the referenced draw', () => {
  const draw = { id: 'd1', label: 'Draw', members: ['a', 'a', 'b', 'd'], replacement: true };
  assert.deepEqual(issues(samples([{ ...draw, omitted: ['c'] }])), []);
  const wrong = issues(samples([{ ...draw, omitted: ['b'] }]));
  assert.deepEqual(wrong, [{ path: 'groups.0.omitted', message: 'Omitted IDs must be exactly the samples absent from this group: c.', code: 'arithmetic' }]);
  const bag = { id: 'o1', label: 'Out of bag', outOfBagFor: 'd1' };
  assert.deepEqual(filled(samples([draw, bag])).groups[1].members, ['c']);
  assert.deepEqual(issues(samples([draw, { ...bag, members: ['c'] }])), []);
  const bad = issues(samples([draw, { ...bag, members: ['a'] }]));
  assert.deepEqual([bad[0].message, bad[0].code], ['Out-of-bag members must be exactly the samples absent from the referenced draw: c.', 'arithmetic']);
  assert.deepEqual(issues(samples([{ id: 'x', label: 'No members' }])).map(i => i.message), ['A group needs members (only an out-of-bag set may leave them out)']);
  assert.equal(filled(samples([draw])).groups[0].omitted, undefined, 'omitted is a display choice: absent stays absent');
});

// ---- the fill reaches child diagrams, and a filled card parses again unchanged ----
test('a filled card is valid input again (idempotent), and the fill reaches a child diagram inside panels', () => {
  const cards = [box(), links([3, 1, 0]), histogram([2, 6, 2]), heatmap()];
  for (const card of cards) {
    const once = filled(card);
    assert.deepEqual(filled(once), once, card.kind);
  }
  const panels = { kind: 'comparison', variant: 'panels', title: 'Two boxes', panels: [{ heading: 'A', diagram: box() }, { heading: 'B', diagram: box({ q1: 5, q3: 9, whiskerLow: 5, whiskerHigh: 9, median: 7 }) }] };
  const d = everything(panels);
  assert.deepEqual([d.panels[0].diagram.boxes[0].fences, d.panels[1].diagram.boxes[0].fences], [{ lower: -3, upper: 21 }, { lower: -1, upper: 15 }]);
});

// ---- the silent-fill rule (Reviewer 2026-11-18): a derived field the author left out is computed for the validator and for tokens, but put on the card only when the author stated
// something that depends on it. Audit of every row: only the box-plot fences are silent; each other row fills because what the author wrote depends on the value.
test('silent fill audit: box fences are silent without outliers; every other row fills because the card depends on it', () => {
  const put = { 'plain box': d => d.boxes[0].fences, 'box with an outlier': d => d.boxes[0].fences, heatmap: d => d.range, links: d => d.queries[0].weights, histogram: d => d.series[0].values };
  const diagrams = { 'plain box': box(), 'box with an outlier': box({ outliers: [{ label: 'Late', value: 22 }] }), heatmap: heatmap(), links: links([3, 1, 0]), histogram: histogram([2, 6, 2]) };
  const outcome = Object.fromEntries(Object.entries(diagrams).map(([name, d]) => [name, JSON.stringify(put[name](filled(d))) === JSON.stringify(put[name](d)) ? 'unchanged' : 'filled']));
  assert.deepEqual(outcome, { 'plain box': 'unchanged', 'box with an outlier': 'filled', heatmap: 'filled', links: 'filled', histogram: 'filled' });
  // the heatmap's colour scale needs its range; raw weights and counts are what the author wrote, shown as shares; a softmax list is the `after` card itself (derived-schema.test.mjs);
  // a `derive` annotation is the author's own annotation (derived-schema.test.mjs); an out-of-bag group is declared by outOfBagFor (the sample-set tests).
});
