// VAR-1 (spec v1.1, step 1): the closed table of derived fields. A spec has two sorts of number: inputs (the author's choice) and derived numbers (a function of
// inputs). One row per DEFINITION: { kind, path, inputs, tolerance, compute }. `compute(diagram)` returns the row's instances; each instance is one derived field:
//   { at: path of the field, written: what the author wrote (undefined = absent), computed: the value the code computes, replace: true = the written value is raw input
//     to be replaced, problems: [{ message, plain }] }.
// checkDerived (the validator): a derived field PRESENT must equal its computed value within the tolerance, else an issue tagged { code: 'arithmetic' } that names the
// correct numbers (release 154's route); a `plain` problem is an ordinary issue (the rule cannot run). fillDerived (before layout): a derived field ABSENT is filled with
// its computed value, a `replace` field is replaced; the renderer then prints the value wherever it prints the field today. The table is closed: a row is added only when a
// field has a formula, and this module holds no subject-matter vocabulary, only kinds.
// Decimals (reviewer 2026-11-17): a value derived from box inputs keeps the most decimals among them (min 0); a statistic (mean, median, centroid, on-series y) keeps one
// more than its inputs, capped at 3; a proportion (softmax output, normalised weight, histogram proportion) keeps 2. The tolerance for a WRITTEN value is half a unit of the
// decimals written on it (the allowance release 154 already uses), plus 1e-9 of float slack.
import { plotSeriesPoints } from './ml-plot-spec.js';
import { limitedTangent } from './plot-lines.js';

export const decimalsOf = value => (String(value).split('.')[1] ?? '').length;
const maxPlaces = values => Math.max(0, ...values.map(decimalsOf));
const statPlaces = values => Math.min(3, maxPlaces(values) + 1);
const half = places => 0.5 * 10 ** -places + 1e-9;
const roundTo = (value, places) => Number(value.toFixed(places));
const sum = values => values.reduce((total, value) => total + value, 0);
const list = values => values.join(', ');

// n shares of a total at `places` decimals that add up to exactly 1 (largest remainder, ties by position).
export function normalise(values, places = 2) {
  const unit = 10 ** places, total = sum(values), raw = values.map(value => value / total * unit), floor = raw.map(Math.floor);
  let left = unit - sum(floor);
  for (const [, i] of raw.map((value, i) => [value - floor[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])) {
    if (left <= 0) break;
    floor[i] += 1; left -= 1;
  }
  return floor.map(value => value / unit);
}

// ---- box-plot: fences from Q1 and Q3 ----
// The fences the box's own quartiles give, at the most decimals among q1 and q3.
export function boxFences(box) {
  const places = maxPlaces([box.q1, box.q3]), spread = 1.5 * (box.q3 - box.q1);
  return { lower: roundTo(box.q1 - spread, places), upper: roundTo(box.q3 + spread, places), places };
}
function boxFenceInstance(box, i) {
  // A box that carries `values` gets the fences its values give, written over whatever the author typed (BOX-1); drawn when the box has outliers or the author wrote fences.
  if (box.values) { const s = boxStats(box.values); return { at: ['boxes', i, 'fences'], written: box.fences, computed: { lower: roundTo(s.lower, 3), upper: roundTo(s.upper, 3) }, replace: true, silent: !box.fences && !s.outliers.length, problems: [] }; }
  const at = ['boxes', i, 'fences'], spread = 1.5 * (box.q3 - box.q1), low = box.q1 - spread, high = box.q3 + spread, problems = [];
  const written = box.fences, computed = boxFences(box);
  const { lower, upper } = written ?? computed;
  const places = written ? maxPlaces([box.q1, box.q3, lower, upper]) : computed.places;
  // A whisker beyond a STATED fence names both numbers; same half-unit allowance (item 5, Reviewer 2026-11-17). Fences left out are only filled: release 154's rule for a box without
  // fences (its outliers are read against its whiskers) stands. shortcut: a computed fence is not checked against the whiskers or outliers; upgrade on the Reviewer's word.
  if (written && (lower - box.whiskerLow > half(places) || box.whiskerHigh - upper > half(places))) {
    problems.push({ message: `Fences must enclose both whiskers: the whiskers run from ${box.whiskerLow} to ${box.whiskerHigh}, outside the fences ${lower} and ${upper}.` });
  }
  if (written && (Math.abs(lower - low) > half(places) || Math.abs(upper - high) > half(places))) {
    const round = value => Number(value.toFixed(places + 1));
    problems.push({ message: `Fences must be Q1 - 1.5 x IQR and Q3 + 1.5 x IQR: with Q1 ${box.q1} and Q3 ${box.q3} that is ${round(low)} and ${round(high)}, not ${lower} and ${upper}.` });
  }
  // Silent (Reviewer 2026-11-18): fences the author did not write are computed for a token to read, but not drawn unless the box has outliers (a fence only matters there).
  return { at, written, computed: { lower: computed.lower, upper: computed.upper }, silent: !written && !box.outliers?.length, problems };
}

// BOX-1: a box may carry `values`, the data it summarises. Then the code computes its statistics and writes them OVER whatever the author typed (never a rejection): quartiles are the medians of the
// lower and upper halves, the middle value left out when n is odd (3, 5, 6, 7, 8, 9, 11, 12, 40 gives Q1 5.5, median 8, Q3 11.5); fences Q1 - 1.5 IQR and Q3 + 1.5 IQR; whiskers the most extreme values
// inside the fences; outliers the values outside them. shortcut: one quartile method, no inclusive or linear variants; upgrade on the Reviewer's word.
export function boxStats(values) {
  const s = [...values].sort((a, b) => a - b), n = s.length, m = n >> 1;
  const q1 = medianOf(s.slice(0, m)), q3 = medianOf(s.slice(n % 2 ? m + 1 : m)), spread = 1.5 * (q3 - q1), lower = q1 - spread, upper = q3 + spread;
  const inside = s.filter(value => value >= lower - 1e-9 && value <= upper + 1e-9);
  return { median: medianOf(s), q1, q3, lower, upper, whiskerLow: inside[0], whiskerHigh: inside.at(-1), outliers: s.filter(value => !inside.includes(value)) };
}
// The outliers a valued box draws: the values outside the fences, each with the label the author gave that value, else "Outlier" (a filled outlier is never labelled with its own number).
const valueOutliers = (box, s) => s.outliers.map(value => ({ label: (box.outliers ?? []).find(point => Math.abs(point.value - value) < 1e-9)?.label ?? 'Outlier', value }));
// The box with the statistics its values give (rounded as they are filled), or the box itself: what the shape checks read, so a typed statistic that the code overwrites is never validated.
export function withValueStats(box) {
  if (!box.values) return box;
  const s = boxStats(box.values), places = statPlaces(box.values), data = maxPlaces(box.values), { fences, outliers, ...rest } = box;
  return { ...rest, q1: roundTo(s.q1, places), median: roundTo(s.median, places), q3: roundTo(s.q3, places), whiskerLow: roundTo(s.whiskerLow, data), whiskerHigh: roundTo(s.whiskerHigh, data),
    fences: { lower: roundTo(s.lower, 3), upper: roundTo(s.upper, 3) }, ...(s.outliers.length ? { outliers: valueOutliers(box, s) } : {}) };
}
const BOX_FIELDS = ['q1', 'median', 'q3', 'whiskerLow', 'whiskerHigh'];
// The fields of a valued box whose typed value the code replaces: [] when it has no values or every typed number already equals the computed one (a field the author left out is not a change but a fill).
export function boxFieldChanges(box) {
  if (!box?.values) return [];
  const s = boxStats(box.values), c = withValueStats(box), out = BOX_FIELDS.filter(k => box[k] !== undefined && Math.abs(box[k] - c[k]) > 1e-9);
  if (box.fences && (Math.abs(box.fences.lower - c.fences.lower) > 1e-9 || Math.abs(box.fences.upper - c.fences.upper) > 1e-9)) out.push('fences');
  const typed = (box.outliers ?? []).map(point => point.value).sort((a, b) => a - b);
  if (typed.length !== s.outliers.length || typed.some((value, j) => Math.abs(value - s.outliers[j]) > 1e-9)) out.push('outliers');
  return out;
}
function boxValueInstances(box, i) {
  if (!box.values) return [];
  const c = withValueStats(box), s = boxStats(box.values), at = ['boxes', i];
  const out = BOX_FIELDS.map(k => ({ at: [...at, k], written: box[k], computed: c[k], replace: true, problems: [] }));
  // Outliers: the computed ones replace the typed ones; none computed removes the typed ones (the schema allows no empty list).
  return [...out, { at: [...at, 'outliers'], written: box.outliers, computed: c.outliers, replace: true, remove: !c.outliers && Boolean(box.outliers), problems: [] }];
}
// What a card may say about a box: its drawn statistics, exact. Fences are the written ones, else Q1 - 1.5 IQR and Q3 + 1.5 IQR.
export function boxDrawn(box) {
  const spread = 1.5 * (box.q3 - box.q1);
  return { q1: box.q1, median: box.median, q3: box.q3, iqr: box.q3 - box.q1, 'lower fence': box.fences?.lower ?? box.q1 - spread, 'upper fence': box.fences?.upper ?? box.q3 + spread };
}
// IQR is a derived path of every box (silent: never drawn; a prose token or the text check reads it).
function boxIqrInstance(box, i) {
  const eff = withValueStats(box);
  return { at: ['boxes', i, 'iqr'], written: undefined, computed: roundTo(eff.q3 - eff.q1, maxPlaces([eff.q1, eff.q3])), silent: true, problems: [] };
}

// ---- transformation (list): softmax of the before items ----
// `op: 'softmax'` is the declared rule (fires whatever the words say); `t` (optional) divides the before items (SOFT-T). Without `op`, release 154's word trigger stays as a fallback:
// a title or operation that says softmax, with plain numeric before and after items; it is OFF when a label says temperature, scaled, scaling, masked, causal, log-softmax or
// "T =" (after = softmax(before / T): the plain recompute would flag a correct card); then the only check is that after sums to 1 when the title or caption calls them probabilities.
const SOFTMAX_OFF = /temperature|scaled|scaling|masked|causal|log[- ]?softmax/i, SOFTMAX_T = /\bT\s*=/;
// "2.0", "z_1 = 2.0", "Score: -1", "70%", "$0.5": -> { value, places, half, text } or null; places = decimals written, half = half a unit of the last decimal written (of a percent, as a fraction).
export function listNumber(item) {
  if (typeof item !== 'string') return null;
  const m = item.replace(/\$/g, '').split(/[=:]/).pop().trim().replace(/−/g, '-').match(/^(-?\d+(?:\.(\d+))?)\s*(%?)$/);
  if (!m) return null;
  const places = (m[2] ?? '').length, scale = m[3] ? 100 : 1;
  return { value: Number(m[1]) / scale, places, half: 0.5 * 10 ** -places / scale, text: m[1] + m[3] };
}
const softmax = (values, t = 1) => {
  const top = Math.max(...values.map(value => value / t)), e = values.map(value => Math.exp(value / t - top)), z = sum(e);
  return e.map(value => value / z);
};
function softmaxInstance(d) {
  const declared = d.op === 'softmax', at = ['after', 'items'];
  if (!declared && !/softmax/i.test(`${d.title} ${d.operation}`)) return null;
  const before = d.before.items.map(listNumber), written = d.after.items, after = written?.map(listNumber);
  if (declared && before.some(x => !x)) return { at, written, problems: [{ plain: true, message: 'op softmax needs plain numeric before items (like 2.0 or 1.5)' }] };
  if (!declared && (before.some(x => !x) || !after || after.length !== before.length || after.some(x => !x))) return null;
  if (declared && written && (after.length !== before.length || after.some(x => !x))) {
    return { at, written, problems: [{ plain: true, message: `op softmax needs one plain number per before item (${before.length}) in after items` }] };
  }
  const labels = [d.title, d.caption, d.operation, d.before.label, d.after.label, ...(d.links ?? []).map(l => l.label)].filter(Boolean).join(' ');
  if (!declared && (SOFTMAX_OFF.test(labels) || SOFTMAX_T.test(labels))) {
    const total = sum(after.map(x => x.value)), slack = sum(after.map(x => x.half));
    const wrong = /probabilit/i.test(`${d.title} ${d.caption ?? ''}`) && Math.abs(total - 1) > slack + 1e-9;
    return { at, written, problems: wrong ? [{ message: `The after values are called probabilities, so they must sum to 1: ${after.map(x => x.text).join(' + ')} = ${Number(total.toFixed(6))}.` }] : [] };
  }
  const t = declared ? d.t : undefined, p = softmax(before.map(x => x.value), t);
  const computed = p.map(value => value.toFixed(2)), problems = [];
  if (after) {
    const beyond = units => after.filter((x, i) => Math.abs(p[i] - x.value) > units * x.half + 1e-9).length;
    // Rounding clause (Reviewer 2026-11-17, tightened): values written to sum to exactly 1 pass when at most ONE value is past its half-unit and that one is within a full unit (1/1/1 as 0.33/0.33/0.34); otherwise the half-unit rule decides.
    const roundedToOne = Math.abs(sum(after.map(x => x.value)) - 1) <= 1e-9 && beyond(1) <= 1 && beyond(2) === 0;
    if (beyond(1) && !roundedToOne) {
      const shown = p.map((x, i) => (after[i].text.endsWith('%') ? `${(100 * x).toFixed(Math.max(after[i].places, 0))}%` : x.toFixed(Math.max(after[i].places, 2))));
      problems.push({ message: `After values must be softmax of the before values: softmax(${list(before.map(x => x.text))}${t ? ` / ${t}` : ''}) = ${list(shown)}, not ${list(after.map(x => x.text))}.` });
    }
  }
  return { at, written, computed, problems };
}

// ---- token-links: raw weights, normalised ----
// With `normalized`, a query whose weights already sum to between 0.98 and 1.02 (each at most 1) stays as written; any other nonnegative weights are raw scores and are
// replaced by their shares of the total (2 decimals, adding up to 1).
function tokenLinkInstances(d) {
  if (!d.normalized) return [];
  return d.queries.flatMap(({ weights }, row) => {
    if (weights.length !== d.target.length) return [];
    const at = ['queries', row, 'weights'], total = sum(weights), roundoff = weights.length * Number.EPSILON;
    if (!(total > 0)) return [{ at, written: weights, problems: [{ plain: true, message: 'Normalized query weights must have a positive total' }] }];
    if (total >= 0.98 - roundoff && total <= 1.02 + roundoff && weights.every(weight => weight <= 1)) return [];
    return [{ at, written: weights, computed: normalise(weights), replace: true, problems: [] }];
  });
}

// ---- histogram: proportions from counts ----
// A proportion histogram whose values are not already proportions (each at most 1, adding up to 1) but are nonnegative whole numbers with a positive total is read as counts.
export const histogramCounts = values => values.every(value => Number.isInteger(value) && value >= 0) && sum(values) > 0
  && !(values.every(value => value <= 1) && Math.abs(sum(values) - 1) <= 1e-6);
const histogramInstances = d => d.measure !== 'proportion' ? [] : d.series.flatMap(({ values }, i) => histogramCounts(values)
  ? [{ at: ['series', i, 'values'], written: values, computed: normalise(values), replace: true, problems: [] }] : []);

// ---- heatmap: range from the cells ----
// An explicit range stays the author's (the existing check keeps every cell inside it); an absent one is the smallest and largest numeric cell.
export function heatmapRange(d) {
  const cells = d.rows.flatMap(row => row.cells).filter(value => value !== null && value !== undefined);
  return cells.length ? { min: Math.min(...cells), max: Math.max(...cells) } : null;
}
function heatmapInstance(d) {
  if (d.range) return [];
  const computed = heatmapRange(d), at = ['range'];
  if (!computed) return [{ at, problems: [{ plain: true, message: 'No range can be computed from masked cells: write a range' }] }];
  if (!(computed.min < computed.max)) return [{ at, problems: [{ plain: true, message: 'Every cell has the same value, so no range can be computed: write a range' }] }];
  return [{ at, computed, problems: [] }];
}

// ---- sample-set: omitted and out-of-bag membership are set differences ----
export const absentFrom = (samples, members) => samples.map(sample => sample.id).filter(id => !members.includes(id));
function sampleInstances(d) {
  const groups = new Map(d.groups.map(group => [group.id, group]));
  const sameSet = (a, b) => a.length === b.length && b.every(id => a.includes(id));
  return d.groups.flatMap((group, i) => {
    const out = [], source = group.outOfBagFor ? groups.get(group.outOfBagFor) : null;
    if (source && source !== group && !source.outOfBagFor && source.replacement && source.members && !group.replacement) {
      const expected = absentFrom(d.samples, source.members);
      out.push({ at: ['groups', i, 'members'], written: group.members, computed: expected,
        problems: group.members && !sameSet(group.members, expected) ? [{ message: `Out-of-bag members must be exactly the samples absent from the referenced draw: ${expected.join(', ') || 'none'}.` }] : [] });
    }
    // `omitted` is a display choice (absent draws nothing), so it is checked when written and never filled.
    if (group.members && group.omitted) {
      const expected = absentFrom(d.samples, group.members);
      out.push({ at: ['groups', i, 'omitted'], written: group.omitted,
        problems: sameSet(group.omitted, expected) ? [] : [{ message: `Omitted IDs must be exactly the samples absent from this group: ${expected.join(', ') || 'none'}.` }] });
    }
    return out;
  });
}

// ---- coordinate-plot: `derive` on an annotation ----
// 'series.<i>:on' (point, segment ends, vector ends): y = the series' own y at the written x, with the series' own interpolation (a line is the monotone curve the renderer
// draws unless smooth is false, a step holds its previous value, a scatter or stem has y only at its own x). 'series.<i>:mean|median|min|max' (reference-line): `value` is that
// statistic of the series' coordinate on the line's axis. 'series.<i>:centroid' (point): x and y are the means of the series' coordinates.
// shortcut: an uncertainty band's clamp of the curve is not modelled, so a line with low/high points is read as its plain monotone curve; upgrade if a derive lands on one.
const DERIVE = /^series\.(\d+):(on|mean|median|min|max|centroid)$/;
const ALLOWED = { point: ['on', 'centroid'], segment: ['on'], vector: ['on'], 'reference-line': ['mean', 'median', 'min', 'max'] };
export function seriesAt(series, x) {
  if (series.closed) return { error: `"${series.label}" is a closed line, not a function of x` };
  const points = plotSeriesPoints(series), hit = points.find(point => point.x === x);
  if (hit) return { y: hit.y };
  if (!['line', 'step'].includes(series.kind)) return { error: `"${series.label}" is a ${series.kind} series: x must be one of its own x values (${list(points.map(point => point.x))})` };
  const i = points.findIndex((point, j) => j && Math.min(points[j - 1].x, point.x) <= x && x <= Math.max(points[j - 1].x, point.x));
  if (i < 0) return { error: `x = ${x} is outside the x range of "${series.label}" (${Math.min(...points.map(point => point.x))} to ${Math.max(...points.map(point => point.x))})` };
  const [a, b] = [points[i - 1], points[i]];
  if (series.kind === 'step') return { y: a.y };
  const widths = points.slice(1).map((point, j) => point.x - points[j].x), direction = Math.sign(widths[0]);
  if (series.smooth === false || points.length < 3 || !direction || widths.some(width => Math.sign(width) !== direction)) return { y: a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x) };
  // The renderer's monotone cubic (plot-lines.js monotoneLinePath), evaluated in data coordinates: the same tangents, the cubic Hermite form of its Bezier segment.
  const slopes = widths.map((width, j) => (points[j + 1].y - points[j].y) / width);
  const interior = slopes.slice(1).map((right, j) => limitedTangent(slopes[j], right, widths[j], widths[j + 1]));
  const tangents = [(3 * slopes[0] - interior[0]) / 2, ...interior, (3 * slopes.at(-1) - interior.at(-1)) / 2];
  const h = b.x - a.x, t = (x - a.x) / h, t2 = t * t, t3 = t2 * t;
  return { y: (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * h * tangents[i - 1] + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * h * tangents[i] };
}
const medianOf = values => { const s = [...values].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// One number field: written is checked against the exact value within half a unit of its own decimals; absent, the rounded value fills it.
function numberInstance(at, written, exact, places, describe) {
  const computed = roundTo(exact, places);
  const wrong = written !== undefined && Math.abs(written - exact) > half(decimalsOf(written));
  return { at, written, computed, problems: wrong ? [{ message: describe(computed, written) }] : [] };
}
function annotationInstances(d) {
  return (d.annotations ?? []).flatMap((a, k) => {
    const at = ['annotations', k], derive = a.derive, label = a.label;
    const fields = a.kind === 'point' ? [['', 'x', a.x], ['', 'y', a.y]] : a.kind === 'reference-line' ? [['', 'value', a.value]]
      : a.kind === 'segment' || a.kind === 'vector' ? [['from', 'x', a.from.x], ['from', 'y', a.from.y], ['to', 'x', a.to.x], ['to', 'y', a.to.y]] : [];
    if (!fields.length) return derive === undefined ? [] : [{ at: [...at, 'derive'], problems: [{ plain: true, message: `derive does not apply to a ${a.kind}` }] }];
    const need = required => fields.filter(([, field, value]) => required.includes(field) && value === undefined).map(([end, field]) => ({
      at: [...at, ...(end ? [end] : []), field], problems: [{ plain: true, message: `A ${a.kind} needs ${field === 'value' ? 'a value' : field}${derive ? '' : ' (or a derive that computes it)'}.` }] }));
    if (derive === undefined) return need(['x', 'y', 'value']);
    const m = DERIVE.exec(derive), series = m && d.series[Number(m[1])];
    if (!m || !series) return [{ at: [...at, 'derive'], problems: [{ plain: true, message: m ? `derive refers to series ${m[1]}, which does not exist (there are ${d.series.length})` : 'derive reads series.<index>:on, :mean, :median, :min, :max or :centroid' }] }];
    if (!ALLOWED[a.kind].includes(m[2])) return [{ at: [...at, 'derive'], problems: [{ plain: true, message: `A ${a.kind} derives ${ALLOWED[a.kind].map(name => `series.${m[1]}:${name}`).join(' or ')}, not ${derive}` }] }];
    const points = plotSeriesPoints(series), name = `"${series.label}"`;
    if (m[2] === 'on') {
      return [...need(['x']), ...fields.filter(([, field]) => field === 'y').flatMap(([end, , written]) => {
        const x = (end ? a[end] : a).x, found = x === undefined ? null : seriesAt(series, x), yAt = [...at, ...(end ? [end] : []), 'y'];
        if (!found) return [];
        if (found.error) return [{ at: yAt, problems: [{ plain: true, message: `${label} cannot sit on ${name}: ${found.error}` }] }];
        return [numberInstance(yAt, written, found.y, statPlaces(points.map(point => point.y)), (right, wrote) => `${label} must sit on the series ${name}: at x = ${x} its y is ${right}, not ${wrote}.`)];
      })];
    }
    if (m[2] === 'centroid') {
      const xs = points.map(point => point.x), ys = points.map(point => point.y), cx = sum(xs) / xs.length, cy = sum(ys) / ys.length;
      const say = right => `The centroid of ${name} is (${roundTo(cx, statPlaces(xs))}, ${roundTo(cy, statPlaces(ys))}); ${label} must be there, not ${right}`;
      return [numberInstance([...at, 'x'], a.x, cx, statPlaces(xs), (right, wrote) => `${say(`x = ${wrote}`)}.`),
        numberInstance([...at, 'y'], a.y, cy, statPlaces(ys), (right, wrote) => `${say(`y = ${wrote}`)}.`)];
    }
    const values = points.map(point => point[a.axis]), stat = { mean: sum(values) / values.length, median: medianOf(values), min: Math.min(...values), max: Math.max(...values) }[m[2]];
    return [numberInstance([...at, 'value'], a.value, stat, statPlaces(values), (right, wrote) => `${label} is at the ${m[2]} of ${name} (${a.axis}): ${right}, not ${wrote}.`)];
  });
}

export const DERIVED_ROWS = [
  { kind: 'box-plot', path: 'boxes[].fences, boxes[].iqr, boxes[].{q1, median, q3, whiskerLow, whiskerHigh, outliers} (when the box carries values)', inputs: ['q1', 'q3', 'values'], tolerance: 'half a unit of the decimals written', compute: d => d.boxes.flatMap((box, i) => [...boxValueInstances(box, i), boxFenceInstance(box, i), boxIqrInstance(box, i)]) },
  { kind: 'transformation', path: 'after.items', inputs: ['before.items', 'op', 't'], tolerance: 'half a unit of the decimals written on each item', compute: d => (d.variant === 'visual' || !d.before?.items ? [] : [softmaxInstance(d)].filter(Boolean)) },
  { kind: 'token-links', path: 'queries[].weights', inputs: ['weights (raw)'], tolerance: 'sum within 0.98 to 1.02, else normalised', compute: tokenLinkInstances },
  { kind: 'histogram', path: 'series[].values', inputs: ['counts'], tolerance: 'proportions sum to 1', compute: histogramInstances },
  { kind: 'heatmap', path: 'range', inputs: ['rows[].cells'], tolerance: 'exact (an explicit range is kept)', compute: heatmapInstance },
  { kind: 'sample-set', path: 'groups[].omitted, groups[].members (out of bag)', inputs: ['groups[].members', 'groups[].outOfBagFor'], tolerance: 'exact', compute: sampleInstances },
  { kind: 'coordinate-plot', path: 'annotations[] (derive)', inputs: ['series'], tolerance: 'half a unit of the decimals written', compute: annotationInstances },
];

const instancesOf = d => DERIVED_ROWS.filter(row => row.kind === d.kind).flatMap(row => row.compute(d));
// Every problem of every derived field of this diagram (not its children: the caller walks those) through `issue(path, message, params)`.
export function checkDerived(d, issue) {
  for (const { at, problems } of instancesOf(d)) for (const { message, plain } of problems) issue(at, message, plain ? undefined : { code: 'arithmetic' });
}
const setAt = (root, path, value) => { const last = path.at(-1); path.slice(0, -1).reduce((node, key) => node[key], root)[last] = value; };
// Fills absent derived fields (and replaces raw ones) in place; the diagram has already passed the validator, so every instance here computed.
// A SILENT instance (an absent value nothing on the card depends on: a box plot's fences when it has no outliers) is computed for the validator and for prose tokens, never put on the
// diagram, so the figure draws only what the author put on the card; `all: true` fills those too (tokens, the reference lint).
export function fillDerived(d, { all = false } = {}) {
  for (const inst of instancesOf(d)) {
    if (inst.remove) delete inst.at.slice(0, -1).reduce((node, key) => node[key], d)[inst.at.at(-1)]; // a typed value the computation says is not there (a valued box's typed outliers when none lie outside the fences)
    else if (inst.computed !== undefined && (inst.written === undefined || inst.replace) && (all || !inst.silent)) setAt(d, inst.at, inst.computed);
  }
  return d;
}
// Varied inputs (vary.js): every derived field of this diagram is set to the value its inputs give NOW, written or not, so a reference whose inputs were just resampled carries no stale derived literal.
export function refreshDerived(d, { all = false } = {}) {
  for (const inst of instancesOf(d)) if (inst.computed !== undefined && (all || !inst.silent)) setAt(d, inst.at, inst.computed);
  return d;
}
// The paths (inside the diagram) of every number a derived field holds, for the diagram itself (not its child diagrams): what a prose token may name, listed when one names a path that is not there.
export function derivedPaths(d) {
  const leaves = (value, path) => (typeof value === 'number' ? [path.join('.')] : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, key])) : []);
  return instancesOf(d).flatMap(({ at, computed }) => (computed === undefined ? [] : leaves(computed, at)));
}
// The after items a softmax transformation computes (null when it has none), for the validator steps that need their number before the fill.
export function derivedAfterItems(d) {
  return d.op === 'softmax' && d.before?.items ? softmaxInstance({ ...d, after: { ...d.after, items: undefined } })?.computed ?? null : null;
}
