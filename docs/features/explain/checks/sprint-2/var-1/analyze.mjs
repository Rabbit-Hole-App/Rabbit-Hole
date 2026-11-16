// VAR-1 report analysis (read-only): which numbers of the plot / bar / sample-set (and histogram, box-plot) references are illustrative and which are derived.
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
const DIR = 'C:/s/teaching-palette/packages/web/src/tutor-diagrams/';
const SOURCES = readdirSync(DIR).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).map(f => [f, readFileSync(DIR + f, 'utf8')]);
const COMPUTES = new RegExp('Math[.](exp|log|log2|sqrt|pow|sin|cos|tanh)[^a-z0-9]|[*][*]');
const IMPORT = new RegExp("from '[.]/([^']+[.]js)'", 'g');
const withImports = f => { const text = SOURCES.find(([n]) => n === f)?.[1] ?? ''; return [f, ...[...text.matchAll(IMPORT)].map(m => m[1])]; };
const sourceOf = id => SOURCES.filter(([, t]) => t.includes(`'${id}'`) || t.includes(`"${id}"`)).map(([f]) => f);
const additive = vals => vals.length > 2 && vals.some((v, i) => { const rest = vals.filter((_, j) => j !== i); const n = rest.length; for (let m = 3; m < (1 << n); m++) { let c = 0, sum = 0; for (let b = 0; b < n; b++) if (m & (1 << b)) { c++; sum += rest[b]; } if (c >= 2 && close(sum, v, 1e-9) && v !== 0) return true; } return false; });
import { diagramReferences } from 'file:///C:/s/teaching-palette/packages/web/src/tutor-diagrams/reference-library.js';
import { plotSeriesPoints } from 'file:///C:/s/teaching-palette/packages/web/src/tutor-diagrams/ml-plot-spec.js';

const KINDS = new Set(['coordinate-plot', 'bar-chart', 'sample-set', 'histogram', 'box-plot']);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
const median = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const NUM = /[-\u2212]?\d+(?:\.\d+)?/g;
// "Step 1", "Class 2", "x1": an ordinal in a name is not a worked number
const ORDINAL = /\b(?:step|class|feature|fold|layer|tree|sample|model|group|cluster|head|block|stage|epoch|iteration|round|run|level|component|expert|token|position|dimension|dim|lag|window|bin|trial|case|candidate|batch|input|output|weight|coefficient|variable|neuron|unit|node|point|day|week|month|year|d|k|n|p|v|w|x|y|z|a|b|c|h|q|s|t)\s*[-_]?\d+\b/gi;
const tokens = text => [...String(text ?? '').replace(/\u2212/g, '-').replace(ORDINAL, ' ').matchAll(NUM)].map(m => Math.abs(Number(m[0])));

function texts(d, ref) {
  const out = [d.title, d.caption, d.xLabel, d.unit, ref.useWhen];
  for (const s of d.series ?? []) out.push(s.label, ...(s.points ?? []).map(p => p.label));
  for (const a of d.annotations ?? []) out.push(a.label);
  for (const b of d.bars ?? []) out.push(b.label);
  out.push(...(d.categories ?? []));
  for (const key of ['x', 'y']) if (d[key] && typeof d[key] === 'object' && !Array.isArray(d[key])) out.push(d[key].label, d[key].unit);
  for (const m of d.markers ?? []) out.push(m.label);
  for (const b of d.boxes ?? []) out.push(b.label, ...(b.outliers ?? []).map(o => o.label));
  for (const s of d.samples ?? []) out.push(s.label, s.class);
  for (const g of d.groups ?? []) out.push(g.label);
  return out.filter(Boolean);
}

function fit(xs, ys, degree) { // least squares polynomial residual (max abs), tiny normal equations
  const n = degree + 1, A = Array.from({ length: n }, () => Array(n + 1).fill(0));
  xs.forEach((x, i) => { for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) A[r][c] += x ** (r + c); A[r][n] += ys[i] * x ** r; } });
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    if (Math.abs(A[i][i]) < 1e-12) return Infinity;
    for (let r = 0; r < n; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= n; c++) A[r][c] -= f * A[i][c]; }
  }
  const co = A.map((row, i) => row[n] / row[i]);
  return Math.max(...xs.map((x, i) => Math.abs(co.reduce((s, c, k) => s + c * x ** k, 0) - ys[i])));
}
function closedForm(points) {
  if (points.length < 4) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y), span = Math.max(...ys) - Math.min(...ys) || 1;
  if (fit(xs, ys, 1) < 1e-9 * Math.max(1, span)) return 'affine';
  if (points.length >= 5 && fit(xs, ys, 2) < 1e-9 * Math.max(1, span)) return 'quadratic';
  if (points.length >= 5 && ys.every(y => y > 0) && fit(xs, ys.map(Math.log), 2) < 2e-3) return 'gaussian-like (log y quadratic)';
  if (points.length >= 5 && ys.every(y => y > 0 && y < 1) && fit(xs, ys.map(y => Math.log(y / (1 - y))), 1) < 2e-2) return 'sigmoid-like (logit y affine)';
  const range = v => (Math.max(...v) - Math.min(...v)) || 1;
  if (points.length >= 5 && xs.every(x => x > 0)) {
    const lx = xs.map(Math.log);
    if (fit(lx, ys, 1) < 5e-3 * range(ys)) return 'log-form (y affine in ln x)';
    if (ys.every(y => y > 0)) { const ly = ys.map(Math.log); if (fit(lx, ly, 1) < 5e-3 * range(ly)) return 'power-form (ln y affine in ln x)'; }
  }
  if (points.length >= 5 && ys.every(y => y > 0)) { const ly = ys.map(Math.log); if (fit(xs, ly, 1) < 5e-3 * range(ly)) return 'exponential-form (ln y affine in x)'; }
  return null;
}
// a series that is another series reversed in x (a mirror, e.g. the two cross-entropy branches)
const mirrored = list => list.some((a, i) => list.some((b, j) => j > i && a.length === b.length && a.length >= 4 && a.every((p, k) => close(p.y, b[b.length - 1 - k].y, 1e-6) && close(p.x + b[b.length - 1 - k].x, a[0].x + b[b.length - 1].x, 1e-6))));
const onPolyline = (pt, pts) => pts.some((p, i) => (close(p.x, pt.x, 1e-6) && close(p.y, pt.y, 1e-6))
  || (i && Math.min(pts[i - 1].x, p.x) - 1e-9 <= pt.x && pt.x <= Math.max(pts[i - 1].x, p.x) + 1e-9
    && p.x !== pts[i - 1].x && close(pts[i - 1].y + (p.y - pts[i - 1].y) * (pt.x - pts[i - 1].x) / (p.x - pts[i - 1].x), pt.y, 1e-6)));

function analyzePlot(d) {
  const lit = [], compact = [], circle = [], derived = new Map(), ill = [], cf = [];
  const bump = (k, n = 1) => derived.set(k, (derived.get(k) ?? 0) + n);
  const series = d.series.map(s => ({ s, pts: plotSeriesPoints(s) }));
  series.forEach(({ s, pts }, i) => {
    const isCircle = s.samples && 'radius' in s.samples;
    if (isCircle) circle.push(i);
    else if (s.samples) { compact.push(i); bump('x grid from start+step (render)'); bump('y = sample/divisor (render)'); }
    else lit.push(i);
    const form = isCircle ? null : closedForm(pts);
    if (form && !s.samples) cf.push(`series[${i}] ${s.label}: ${form}`);
    if (s.points?.some(p => p.low !== undefined)) bump('uncertainty low/high (declared around y)');
    if (s.samples?.showValues) bump('point value labels (render, y of each point)');
  });
  const data = series.flatMap(({ pts }) => pts.flatMap(p => [p.x, p.y]));
  const dependsOn = [];
  if (mirrored(series.filter(({ s: x }) => !(x.samples && 'radius' in x.samples)).map(({ pts }) => pts))) { bump('one series is the mirror of another'); dependsOn.push('mirror-series'); }
  const real = series.filter(({ s }) => !(s.samples && 'radius' in s.samples));
  const stats = real.flatMap(({ pts }) => {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return [mean(xs), mean(ys), median(xs), median(ys), Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), ...xs, ...ys];
  });
  const centroids = real.map(({ pts }) => ({ x: mean(pts.map(p => p.x)), y: mean(pts.map(p => p.y)) }));
  const annotData = [];
  const onSeries = q => real.some(({ pts }) => onPolyline(q, pts));
  const endsOf = x => x.kind === 'point' ? [{ x: x.x, y: x.y }] : (x.kind === 'segment' || x.kind === 'vector') ? [x.from, x.to] : [];
  const sameXY = (p, q) => close(p.x, q.x, 1e-9) && close(p.y, q.y, 1e-9);
  (d.annotations ?? []).forEach((a, i) => {
    const tag = `annotations[${i}] ${a.kind}`;
    if (a.kind === 'point') {
      annotData.push(a.x, a.y);
      if (centroids.some(c => close(c.x, a.x) && close(c.y, a.y))) { bump('annotation point = centroid of a series'); dependsOn.push(tag + ' centroid'); }
      else if (onSeries(a)) { bump('annotation point on a series'); dependsOn.push(tag + ' on-series'); } else ill.push(tag);
    } else if (a.kind === 'reference-line') {
      annotData.push(a.value);
      if (stats.some(v => close(v, a.value))) { bump('reference-line = statistic/coordinate of a series'); dependsOn.push(tag + ' stat'); } else ill.push(tag);
    } else if (a.kind === 'segment' || a.kind === 'vector') {
      annotData.push(a.from.x, a.from.y, a.to.x, a.to.y);
      const ends = [a.from, a.to].filter(onSeries).length;
      const chained = [a.from, a.to].filter(e => (d.annotations ?? []).some((o, j) => j !== i && endsOf(o).some(q => sameXY(q, e)))).length;
      if (chained) { bump(`${a.kind} endpoint shared with another annotation (chain)`, chained); dependsOn.push(tag + ' chained'); }
      if (ends) { bump(`${a.kind} endpoint on a series`, ends); dependsOn.push(tag + ' endpoint-on-series'); }
      if (ends + chained < 2) ill.push(tag + ' free end');
    } else if (a.kind === 'band') { annotData.push(a.from, a.to); ill.push(tag); }
    else if (a.kind === 'rectangle') { annotData.push(a.xMin, a.xMax, a.yMin, a.yMax); ill.push(tag); }
    else if (a.kind === 'polygon') { annotData.push(...a.points.flatMap(p => [p.x, p.y])); ill.push(tag); }
    else { annotData.push(a.center.x, a.center.y, a.radius ?? a.radiusX, a.radiusY ?? 0); ill.push(tag); }
  });
  bump('tick labels / axis scale (render)');
  if (d.annotations?.length) bump('annotation badges and leaders (render)');
  return { data: [...data, ...annotData], illustrative: [
    lit.length ? `${lit.length} literal series (${lit.map(i => series[i].pts.length).join('/')} pts)` : '',
    compact.length ? `${compact.length} compact-sample series` : '',
    circle.length ? `${circle.length} circle-sample series (radius)` : '',
    ill.length ? `free annotations: ${ill.length}` : ''].filter(Boolean), derived, dependsOn, closed: cf, structural: false };
}
function analyzeBar(d) {
  const derived = new Map(), values = d.bars ? d.bars.map(b => b.value) : d.series?.flatMap(s => s.values) ?? [], dependsOn = [];
  const bump = k => derived.set(k, (derived.get(k) ?? 0) + 1);
  if (d.total !== undefined) { bump('total = sum of parts (validator-checked)'); dependsOn.push('total'); }
  const groups = d.bars ? [d.bars.map(b => b.value)] : (d.series ?? []).map(s => s.values);
  for (const g of groups) {
    const sum = g.reduce((s, v) => s + v, 0);
    if (close(sum, 1, 1e-6) || close(sum, 100, 1e-6)) { bump(`values constrained to sum to ${close(sum, 1, 1e-6) ? 1 : 100}`); dependsOn.push('sum-constraint'); break; }
  }
  for (const g of groups) if (additive(g)) { bump('a bar equals the sum of others (additive decomposition)'); dependsOn.push('additive'); break; }
  bump('bar heights, axis ticks, value labels (render)');
  return { data: [...values, ...(d.total !== undefined ? [d.total] : [])], illustrative: [`${values.length} bar values`], derived, dependsOn, closed: [], structural: false };
}
function analyzeSamples(d) {
  const derived = new Map(), dependsOn = [];
  const bump = k => derived.set(k, (derived.get(k) ?? 0) + 1);
  d.groups.forEach(g => {
    if (g.omitted) { bump('group.omitted = samples absent from members (validator-checked)'); dependsOn.push('omitted'); }
    if (g.outOfBagFor) { bump('outOfBagFor = the one sample omitted'); dependsOn.push('outOfBagFor'); }
  });
  bump('multiplicity counts per group (render)');
  const weights = d.samples.map(s => s.weight).filter(v => v !== undefined);
  return { data: weights, illustrative: [`${d.samples.length} samples`, `${d.groups.length} groups (membership lists = the declared draw)`, weights.length ? `${weights.length} weights` : ''].filter(Boolean), derived, dependsOn, closed: [], structural: true };
}
function analyzeHist(d) {
  const derived = new Map(), dependsOn = [];
  const bump = k => derived.set(k, (derived.get(k) ?? 0) + 1);
  d.series.forEach(s => { const sum = s.values.reduce((a, b) => a + b, 0); if (d.measure === 'proportion' && close(sum, 1, 1e-6)) { bump('proportions constrained to sum 1'); dependsOn.push('sum-constraint'); } });
  if (d.markers?.length) { bump('markers (a declared statistic of the data, e.g. a mean)'); dependsOn.push('markers'); }
  bump('bar heights/density, ticks (render)');
  return { data: [...d.series.flatMap(s => s.values), ...d.binEdges, ...(d.markers ?? []).map(m => m.value)], illustrative: [`${d.series.length} series of ${d.series[0].values.length} bins`, `${d.binEdges.length} bin edges`], derived, dependsOn, closed: [], structural: false };
}
function analyzeBox(d) {
  const derived = new Map(), dependsOn = [], bump = k => derived.set(k, (derived.get(k) ?? 0) + 1), data = [];
  for (const b of d.boxes) {
    data.push(b.whiskerLow, b.q1, b.median, b.q3, b.whiskerHigh, ...(b.outliers ?? []).map(o => o.value), ...(b.fences ? [b.fences.lower, b.fences.upper] : []));
    if (b.fences) { const iqr = b.q3 - b.q1; if (close(b.fences.lower, b.q1 - 1.5 * iqr) && close(b.fences.upper, b.q3 + 1.5 * iqr)) { bump('fences = Tukey 1.5 IQR of q1/q3'); dependsOn.push('fences'); } }
    if (b.outliers?.length) { bump('outliers beyond the fences'); dependsOn.push('outliers'); }
  }
  return { data, illustrative: [`${d.boxes.length} boxes (5 numbers each)`], derived, dependsOn, closed: [], structural: false };
}

const rows = [], byKind = {};
for (const ref of diagramReferences) {
  const d = ref.spec.diagram;
  if (!KINDS.has(d.kind)) continue;
  const r = d.kind === 'coordinate-plot' ? analyzePlot(d) : d.kind === 'bar-chart' ? analyzeBar(d) : d.kind === 'sample-set' ? analyzeSamples(d) : d.kind === 'histogram' ? analyzeHist(d) : analyzeBox(d);
  const prose = texts(d, ref).flatMap(tokens);
  const data = [...new Set(r.data.map(v => Math.abs(Number(v))).filter(Number.isFinite))];
  const cited = data.filter(v => prose.some(t => close(t, v, 1e-9))).sort((a, b) => a - b);
  const proseOnly = [...new Set(prose.filter(t => !data.some(v => close(t, v, 1e-9)) && !(t <= 12 && Number.isInteger(t))))].sort((a, b) => a - b);
  const srcs = sourceOf(ref.id), computedIn = [...new Set(srcs.flatMap(withImports))].filter(f => COMPUTES.test(SOURCES.find(([n]) => n === f)?.[1] ?? '')), computed = computedIn.length > 0;
  const hasDerived = r.dependsOn.length > 0;
  const structural = r.structural;
  const NAMED = new RegExp('sigmoid|tanh|relu|rectifier|cosine|sine|gaussian|normal|exponential|logarithm|inverse|decay|slope|derivative|curvature|softmax|cross-entropy|entropy|gini|momentum|adam|yogi|descent|sgd|newton|schedule|step size', 'i');
  const named = d.kind === 'coordinate-plot' && NAMED.test([d.title, ...d.series.map(x => x.label)].join(' ')) && !r.closed.length;
  const blockers = [
    cited.length ? `cited in prose: ${cited.join(' ')}` : '',
    hasDerived ? `spec-derived values: ${[...new Set(r.dependsOn.map(x => x.replace(/^annotations\[\d+\] /, '')))].join(', ')}` : '',
    r.closed.length ? `closed-form series (${r.closed.map(c => c.split(': ').pop()).join(', ')}): vary its parameters, not its points` : '',
    proseOnly.length ? `numbers in prose that are not data (computed results): ${proseOnly.join(' ')}` : '',
    computed ? `built by code (Math functions) in ${computedIn.join('+')}` : '',
    named ? 'named analytic function or simulated optimiser run (title/series label): its points are a computed curve written out, vary its parameters, not its points' : '',
    structural ? 'declared structure (membership), not a magnitude' : ''].filter(Boolean);
  const safe = !cited.length && !hasDerived && !r.closed.length && !structural && !proseOnly.length && !computed && !named;
  const row = { id: ref.id, kind: d.kind, lessons: (ref.lessons ?? []).join('+'), illustrative: r.illustrative.join('; '), derived: [...r.derived].map(([k, n]) => `${k}${n > 1 ? ' x' + n : ''}`).join('; '), cited: cited.join(' '), closed: r.closed.join(' | '), source: srcs.join('+'), proseOnly: proseOnly.join(' '), computed, safe: safe ? 'yes' : 'no', blockers: blockers.join(' | ') };
  rows.push(row);
  const k = (byKind[d.kind] ??= { n: 0, yes: 0, cited: 0, derived: 0, closed: 0, structural: 0, compact: 0, derivedKinds: {} });
  k.n++; if (named) k.named = (k.named ?? 0) + 1; if (proseOnly.length) k.proseOnly = (k.proseOnly ?? 0) + 1; if (computed) k.computed = (k.computed ?? 0) + 1; if (safe) k.yes++; if (cited.length) k.cited++; if (hasDerived) k.derived++; if (r.closed.length) k.closed++; if (structural) k.structural++;
  if (r.illustrative.some(x => x.includes('compact'))) k.compact++;
  for (const x of new Set(r.dependsOn.map(y => y.replace(/^annotations\[\d+\] /, '')))) k.derivedKinds[x] = (k.derivedKinds[x] ?? 0) + 1;
}
const q = s => `"${String(s).replace(/"/g, '""')}"`;
writeFileSync('C:/s/sprint2-evidence/var-1/references.csv', ['id,kind,lessons,source,illustrative_fields,derived_fields,cited_numbers,closed_form_series,safe_to_vary,blockers',
  ...rows.map(r => [r.id, r.kind, r.lessons, r.source, r.illustrative, r.derived, r.cited, r.closed, r.safe, r.blockers].map(q).join(','))].join('\n') + '\n');
writeFileSync('C:/s/sprint2-evidence/var-1/stats.json', JSON.stringify({ byKind, total: rows.length, yes: rows.filter(r => r.safe === 'yes').length }, null, 2));
console.log(JSON.stringify(byKind, null, 1), rows.length, rows.filter(r => r.safe === 'yes').length);
