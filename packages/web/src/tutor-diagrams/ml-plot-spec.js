// The author supplies data coordinates and semantic marks; styles and placement
// remain renderer-owned. No extension field changes a saved basic plot's layout.
export function createShapes({ z, titled, text, id, numeric, unit, axes }) {
  const coordinate = z.strictObject({ x: numeric, y: numeric });
  const named = { label: text(60) };
  const ends = { from: coordinate, to: coordinate };
  const annotation = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('point'), ...named, x: numeric, y: numeric }),
    z.strictObject({ kind: z.literal('segment'), ...named, ...ends }),
    z.strictObject({ kind: z.literal('vector'), ...named, ...ends }),
    z.strictObject({ kind: z.literal('reference-line'), ...named, axis: z.enum(['x', 'y']), value: numeric }),
    z.strictObject({ kind: z.literal('rectangle'), ...named, xMin: numeric, xMax: numeric, yMin: numeric, yMax: numeric }),
    z.strictObject({ kind: z.literal('polygon'), ...named, points: z.array(coordinate).min(3).max(16) }),
    z.strictObject({ kind: z.literal('circle'), ...named, center: coordinate, radius: numeric.positive() }),
    z.strictObject({ kind: z.literal('ellipse'), ...named, center: coordinate, radiusX: numeric.positive(), radiusY: numeric.positive() }),
    z.strictObject({ kind: z.literal('band'), ...named, axis: z.enum(['x', 'y']), from: numeric, to: numeric }),
  ]);
  const axis = axes.extend({ scale: z.enum(['linear', 'log']).optional(), integerTicks: z.boolean().optional() });
  const sampleValues = z.array(numeric).min(1).max(25);
  const divisor = numeric.positive().optional();
  const samples = z.strictObject({
    x: z.union([
      sampleValues,
      z.strictObject({ start: numeric, step: numeric.positive(), divisor }),
      z.strictObject({ values: sampleValues, divisor: numeric.positive() }),
    ]),
    y: sampleValues, divisor, showValues: z.boolean().optional(),
  });
  return [
    z.strictObject({ ...titled, kind: z.literal('coordinate-plot'), x: axis, y: axis,
      series: z.array(z.strictObject({ label: text(42), kind: z.enum(['line', 'scatter', 'step', 'stem']), smooth: z.boolean().optional(),
        endLabel: z.boolean().optional(),
        points: z.array(z.strictObject({ x: numeric, y: numeric, id: id.optional(), label: text(60).optional(),
          low: numeric.optional(), high: numeric.optional() })).min(1).max(24).optional(),
        samples: samples.optional(),
      })).min(1).max(5),
      annotations: z.array(annotation).max(16).optional(),
    }),
    z.strictObject({ ...titled, kind: z.literal('bar-chart'), unit,
      bars: z.array(z.strictObject({ label: text(42), value: numeric })).min(2).max(8).optional(),
      variant: z.enum(['grouped', 'stacked']).optional(),
      categories: z.array(text(42)).min(2).max(8).optional(),
      series: z.array(z.strictObject({ label: text(42), values: z.array(numeric).min(2).max(8) })).min(2).max(3).optional(),
    }),
  ];
}

// Keep compact samples in the parsed spec. The renderer and accessible description read the same coordinates.
const explicitSampleX = x => Array.isArray(x) ? x : x.values;

export function plotSeriesPoints(series) {
  if (!series.samples) return series.points ?? [];
  const { x, y, divisor = 1, showValues } = series.samples;
  const values = explicitSampleX(x);
  return y.map((sample, index) => {
    const at = values ? values[index] : x.start + index * x.step;
    const point = { x: at / (x.divisor ?? 1), y: sample / divisor };
    if (showValues && (series.kind !== 'step' || index < y.length - 1)) point.label = String(point.y);
    return point;
  });
}

export const isExtendedPlot = d => d.kind === 'coordinate-plot' &&
  (d.series.length > 3 || d.x.scale !== undefined || d.y.scale !== undefined || d.x.integerTicks || d.y.integerTicks || d.annotations !== undefined || d.series.some(s =>
    s.samples || s.endLabel || !['line', 'scatter'].includes(s.kind) ||
    s.points.some(p => p.label !== undefined || p.id !== undefined || p.low !== undefined || p.high !== undefined)));

function inAxis(value, axis) {
  return Number.isFinite(value) && value >= axis.min && value <= axis.max && (axis.scale !== 'log' || value > 0);
}
function checkPlot(d, issue) {
  for (const name of ['x', 'y']) {
    if (d[name].min >= d[name].max) issue([name, 'max'], 'The maximum must be greater than the minimum');
    if (d[name].scale === 'log' && d[name].min <= 0) issue([name, 'min'], 'Log axes require a strictly positive domain');
    const { min, max, scale, integerTicks } = d[name];
    if (integerTicks && (scale === 'log' || !Number.isInteger(min) || !Number.isInteger(max))) {
      issue([name, 'integerTicks'], 'Integer ticks require linear integer bounds');
    }
  }
  const checkPoint = (point, path) => {
    if (!inAxis(point.x, d.x) || !inAxis(point.y, d.y)) issue(path, 'Point must be within the axis bounds');
  };
  d.series.forEach((s, i) => {
    const path = ['series', i];
    if (Boolean(s.points) === Boolean(s.samples)) return issue(path, 'Provide either points or compact samples');
    const values = s.samples && explicitSampleX(s.samples.x);
    if (values && values.length !== s.samples.y.length) {
      return issue([...path, 'samples'], 'Compact samples need one x coordinate per y value');
    }
    const points = plotSeriesPoints(s);
    const coordinatePath = [...path, s.samples ? 'samples' : 'points'];
    if (['line', 'step'].includes(s.kind) && points.length < 2) issue(coordinatePath, 'A line or step needs at least two points');
    if (s.kind === 'stem' && !inAxis(0, d.y)) issue(path, 'Stem series require a linear y domain containing zero');
    if (s.endLabel && (s.kind !== 'line' || points.at(-1)?.x !== d.x.max)) {
      issue([...path, 'endLabel'], 'A right-edge label requires a line ending at the x-axis maximum');
    }
    const uncertainty = points.some(p => p.low !== undefined || p.high !== undefined);
    const ids = new Set();
    points.forEach((p, j) => {
      const pointPath = [...coordinatePath, j];
      checkPoint(p, pointPath);
      if (p.id !== undefined) {
        if (ids.has(p.id)) issue([...pointPath, 'id'], 'Sample IDs must be unique within each series');
        ids.add(p.id);
      }
      if (s.kind === 'step' || (uncertainty && s.kind === 'line')) {
        if (j && p.x <= points[j - 1].x) issue([...pointPath, 'x'], 'Step and uncertainty curves need strictly increasing x values');
      }
      if (uncertainty) {
        if (p.low === undefined || p.high === undefined) issue(pointPath, 'Every uncertainty point needs both low and high');
        else {
          if (p.low > p.y || p.y > p.high) issue(pointPath, 'Uncertainty must satisfy low ≤ y ≤ high');
          if (!inAxis(p.low, d.y) || !inAxis(p.high, d.y)) issue(pointPath, 'Uncertainty must be within the axis bounds');
        }
      }
    });
  });
  (d.annotations ?? []).forEach((a, i) => {
    const path = ['annotations', i];
    if (a.kind === 'point') checkPoint(a, path);
    if (a.kind === 'segment' || a.kind === 'vector') {
      checkPoint(a.from, [...path, 'from']); checkPoint(a.to, [...path, 'to']);
      if (a.from.x === a.to.x && a.from.y === a.to.y) issue(path, 'A segment or vector needs distinct endpoints');
    }
    if (a.kind === 'reference-line' && !inAxis(a.value, d[a.axis])) issue([...path, 'value'], 'Reference line must be within the axis bounds');
    if (a.kind === 'band') {
      if (a.from >= a.to) issue(path, 'A band requires an increasing interval');
      if (!inAxis(a.from, d[a.axis]) || !inAxis(a.to, d[a.axis])) issue(path, 'Band must be within the axis bounds');
    }
    if (a.kind === 'rectangle') {
      if (a.xMin >= a.xMax || a.yMin >= a.yMax) issue(path, 'A rectangle requires increasing x and y intervals');
      checkPoint({ x: a.xMin, y: a.yMin }, path); checkPoint({ x: a.xMax, y: a.yMax }, path);
    }
    if (a.kind === 'polygon') {
      a.points.forEach((point, j) => checkPoint(point, [...path, 'points', j]));
      const area = a.points.reduce((sum, p, j) => { const q = a.points[(j + 1) % a.points.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
      if (!area) issue(path, 'A polygon needs nonzero area');
      if (new Set(a.points.map(p => `${p.x},${p.y}`)).size !== a.points.length) issue(path, 'Polygon vertices must be distinct; closure is automatic');
    }
    if (a.kind === 'circle' || a.kind === 'ellipse') {
      const rx = a.radius ?? a.radiusX, ry = a.radius ?? a.radiusY;
      checkPoint({ x: a.center.x - rx, y: a.center.y - ry }, path);
      checkPoint({ x: a.center.x + rx, y: a.center.y + ry }, path);
    }
  });
}

function checkBars(d, issue) {
  if (!d.variant) {
    if (!d.bars) issue(['bars'], 'Basic bar charts require bars');
    if (d.categories || d.series) issue(['variant'], 'Grouped or stacked series require an explicit variant');
    return;
  }
  if (d.bars) issue(['bars'], 'Grouped and stacked variants cannot include legacy bars');
  if (!d.categories || !d.series) { issue(['variant'], 'A bar variant requires categories and series'); return; }
  for (const [key, values] of [['categories', d.categories], ['series', d.series.map(s => s.label)]]) {
    if (new Set(values).size !== values.length) issue([key], 'Category and series labels must be unique');
  }
  d.series.forEach((s, i) => {
    if (s.values.length !== d.categories.length) issue(['series', i, 'values'], 'Each series needs one value for every entry in categories');
  });
}

export function validate(diagram, issue) {
  if (diagram.kind === 'coordinate-plot') checkPlot(diagram, issue);
  else if (diagram.kind === 'bar-chart') checkBars(diagram, issue);
}

export const axisName = axis => `${axis.label}${axis.unit ? ` (${axis.unit})` : ''}${axis.scale === 'log' ? ' · log scale' : ''}`;
const xy = p => `(${p.x}, ${p.y})`;
export function annotationDescription(a) {
  switch (a.kind) {
    case 'point': return `${a.label}: ${xy(a)}`;
    case 'segment': case 'vector': return `${a.label}: ${xy(a.from)} → ${xy(a.to)}`;
    case 'reference-line': return `${a.label}: ${a.axis} = ${a.value}`;
    case 'rectangle': return `${a.label}: x ${a.xMin} to ${a.xMax}, y ${a.yMin} to ${a.yMax}`;
    case 'polygon': return `${a.label}: ${a.points.map(xy).join(' → ')}`;
    case 'circle': return `${a.label}: center ${xy(a.center)}, radius ${a.radius}`;
    case 'ellipse': return `${a.label}: center ${xy(a.center)}, radii ${a.radiusX}, ${a.radiusY}`;
    case 'band': return `${a.label}: ${a.axis} ${a.from} to ${a.to}`;
  }
}

export function describe(d) {
  if (isExtendedPlot(d)) return [
    ...[d.x, d.y].map(a => `${axisName(a)}: ${a.min} to ${a.max}`),
    ...d.series.map(s => `${s.label} (${s.kind}): ${plotSeriesPoints(s).map(p => `${p.id ? `${p.id} ` : ''}${p.label ? `${p.label} ` : ''}${xy(p)}${p.low !== undefined ? ` [${p.low}, ${p.high}]` : ''}`).join('; ')}`),
    ...(d.annotations ?? []).map(annotationDescription),
  ];
  if (d.kind === 'bar-chart' && d.variant) return [
    `${d.variant} bars${d.unit ? ` (${d.unit})` : ''}`,
    ...d.categories.map((category, i) => `${category}: ${d.series.map(s => `${s.label} ${s.values[i]}`).join('; ')}`),
  ];
  return null;
}

export function visibleText(d) {
  if (isExtendedPlot(d)) return [d.title, d.caption, d.x.label, d.x.unit, d.y.label, d.y.unit,
    ...d.series.flatMap(s => [s.label, ...plotSeriesPoints(s).map(p => p.label)]), ...(d.annotations ?? []).map(a => a.label)].filter(Boolean);
  if (d.kind === 'bar-chart' && d.variant) return [d.title, d.caption, d.unit, ...d.categories, ...d.series.map(s => s.label)].filter(Boolean);
  return null;
}
