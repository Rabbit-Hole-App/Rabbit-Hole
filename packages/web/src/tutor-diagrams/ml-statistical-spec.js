// Four bounded teaching schemas. Positions, colors and derived density heights
// remain renderer-owned; all values here are the author's literal data.
import { checkDerived, absentFrom, histogramCounts, heatmapRange } from './derived.js';

export function createShapes({ z, titled, text, id, numeric, unit, axes }) {
  const cell = z.strictObject({ row: z.int().min(0).max(5), column: z.int().min(0).max(5) });
  return [
    z.strictObject({
      ...titled, kind: z.literal('heatmap'),
      rowLabel: text(36).optional(), columnLabel: text(36).optional(),
      columns: z.array(text(28)).min(1).max(6),
      rows: z.array(z.strictObject({ label: text(28), cells: z.array(z.union([numeric, z.null()])).min(1).max(6) })).min(1).max(6),
      // range: left out, it is the smallest and largest numeric cell (derived.js); written, it is the scale every cell must sit inside.
      range: z.strictObject({ min: numeric, max: numeric }).optional(),
      highlights: z.array(cell).min(1).max(12).optional(),
    }),
    z.strictObject({
      ...titled, kind: z.literal('sample-set'),
      samples: z.array(z.strictObject({ id, label: text(30).optional(), class: text(24).optional(), weight: numeric.positive().optional() })).min(1).max(18),
      groups: z.array(z.strictObject({
        // members: left out only for an out-of-bag set (outOfBagFor), whose members are the samples absent from that draw (derived.js).
        id, label: text(42), members: z.array(id).max(36).optional(), replacement: z.boolean().optional(),
        omitted: z.array(id).max(18).optional(), outOfBagFor: id.optional(),
      })).min(1).max(4),
    }),
    z.strictObject({
      ...titled, kind: z.literal('histogram'), xLabel: text(36), unit,
      binEdges: z.array(numeric).min(3).max(13), measure: z.enum(['count', 'proportion']),
      density: z.boolean().optional(),
      series: z.array(z.strictObject({ label: text(42), values: z.array(numeric.nonnegative()).min(2).max(12) })).min(1).max(3),
      markers: z.array(z.strictObject({ label: text(42), value: numeric })).min(1).max(3).optional(),
    }),
    z.strictObject({
      ...titled, kind: z.literal('box-plot'), x: axes,
      boxes: z.array(z.strictObject({
        label: text(42), whiskerLow: numeric, q1: numeric, median: numeric, q3: numeric, whiskerHigh: numeric,
        fences: z.strictObject({ lower: numeric, upper: numeric }).optional(),
        outliers: z.array(z.strictObject({ label: text(36), value: numeric })).min(1).max(8).optional(),
      })).min(1).max(4),
    }),
  ];
}

function unique(values, path, issue, name) {
  if (new Set(values).size !== values.length) issue(path, `${name} must be unique`);
}
function within(value, min, max) { return value >= min && value <= max; }
function sameMembers(a, b) { return a.length === b.length && a.every(value => b.includes(value)); }

// HEAT-1 (Reviewer 2026-11-18), both tagged arithmetic so a card that keeps them is repaired and then fails the step, never delivered. No words: only the cells are read.
// Contrast: every numeric cell has one value AND it is the value the renderer draws with no fill (ml-statistical-layouts.js heatColor: range.min, or 0 for a signed range, or range.max at or below 0).
// A blocked (null) cell is a drawn state of its own, so a 0 to 1 grid of 1s and blanks passes. Diagonal: a square grid whose every cell above the diagonal is blocked keeps its own cell in each row.
// shortcut: the mirror pattern (blocked cells below the diagonal) is not checked, add it only on the Reviewer's word.
function checkHeatmapDrawn(d, range, issue) {
  const numbers = d.rows.flatMap(row => row.cells).filter(value => value !== null);
  const blank = range.min < 0 && range.max > 0 ? 0 : range.max <= 0 ? range.max : range.min;
  if (numbers.length && numbers.every(value => value === numbers[0]) && (numbers[0] === blank || range.min === range.max)) {
    issue(['rows'], `Every numeric cell is ${numbers[0]}, the value drawn with no fill, so no cell stands out. Give the cells different values, or put the cells that count on a value that is drawn (for a 0 to 1 range, 1).`, { code: 'arithmetic' });
  }
  const n = d.rows.length;
  const triangle = n >= 2 && n === d.columns.length && d.rows.every(row => row.cells.length === n) && numbers.length > 0 && d.rows.every((row, i) => row.cells.every((value, j) => j <= i || value === null));
  const blocked = triangle ? d.rows.filter((row, i) => row.cells[i] === null).map(row => row.label) : [];
  if (blocked.length) {
    issue(['rows'], `Every cell above the diagonal is blocked, so each row i keeps its own cell i: the diagonal is blocked in rows ${blocked.join(', ')}. Give those cells a number; row i holds columns 1 to i.`, { code: 'arithmetic' });
  }
}

function checkHeatmap(d, issue) {
  // An absent range is the cells' own extent (derived.js reports a range that cannot be computed); the explicit-range checks run on a written one.
  const range = d.range ?? heatmapRange(d) ?? { min: 0, max: 1 };
  if (d.range && !(d.range.min < d.range.max)) issue(['range', 'max'], 'The range maximum must exceed its minimum');
  unique(d.columns, ['columns'], issue, 'Column labels');
  unique(d.rows.map(row => row.label), ['rows'], issue, 'Row labels');
  d.rows.forEach((row, i) => {
    if (row.cells.length !== d.columns.length) issue(['rows', i, 'cells'], 'Every row needs one cell per column');
    row.cells.forEach((value, j) => {
      if (value !== null && !within(value, range.min, range.max)) issue(['rows', i, 'cells', j], 'Cell value is outside the explicit range');
    });
  });
  checkHeatmapDrawn(d, range, issue);
  unique((d.highlights ?? []).map(({ row, column }) => `${row}:${column}`), ['highlights'], issue, 'Highlighted cells');
  (d.highlights ?? []).forEach(({ row, column }, i) => {
    if (row >= d.rows.length || column >= d.columns.length) issue(['highlights', i], 'Highlight refers to an unknown cell');
    else if (d.rows[row].cells[column] === null) issue(['highlights', i], 'A masked cell cannot be highlighted as a numeric result');
  });
}

function checkSamples(d, issue) {
  const ids = d.samples.map(sample => sample.id);
  unique(ids, ['samples'], issue, 'Sample IDs');
  unique(d.groups.map(group => group.id), ['groups'], issue, 'Group IDs');
  if (new Set(d.samples.map(sample => sample.class).filter(Boolean)).size > 6) issue(['samples'], 'Use at most six sample classes');
  const groups = new Map(d.groups.map(group => [group.id, group]));
  // A bootstrap draw is n rows from n rows, with replacement (exact, no tolerance; item 4, Reviewer 2026-11-17). The diagram says bootstrap in its title, caption or any label, and not
  // m-out-of-n or subsample (those draw fewer on purpose); a replacement group draws from the whole sample set. Tagged arithmetic: the repair names the numbers.
  const words = [d.title, d.caption, ...d.groups.map(group => group.label), ...d.samples.flatMap(sample => [sample.label, sample.class])].filter(Boolean).join(' ');
  const bootstrap = /bootstrap/i.test(words) && !/m[- ]out[- ]of[- ]n|subsample/i.test(words);
  d.groups.forEach((group, i) => {
    // An out-of-bag set may leave its members out: they are the samples absent from the referenced draw (derived.js fills them).
    const source = group.outOfBagFor ? groups.get(group.outOfBagFor) : null;
    const members = group.members ?? (group.outOfBagFor && source?.members ? absentFrom(d.samples, source.members) : null);
    if (!members) return issue(['groups', i, 'members'], 'A group needs members (only an out-of-bag set may leave them out)');
    if (bootstrap && group.replacement && members.length !== d.samples.length) {
      issue(['groups', i, 'members'], `A bootstrap sample draws n = ${d.samples.length} rows, with replacement; this draws ${members.length}.`, { code: 'arithmetic' });
    }
    for (const [field, list] of [['members', group.members], ['omitted', group.omitted]]) {
      (list ?? []).forEach((sampleId, j) => {
        if (!ids.includes(sampleId)) issue(['groups', i, field, j], 'Membership refers to an unknown sample ID');
      });
    }
    if (!group.replacement) unique(members, ['groups', i, 'members'], issue, 'Members without replacement');
    if (group.omitted) unique(group.omitted, ['groups', i, 'omitted'], issue, 'Omitted sample IDs');
    if (group.outOfBagFor) {
      if (!source || source === group || source.outOfBagFor || !source.replacement) {
        issue(['groups', i, 'outOfBagFor'], 'Out-of-bag membership must reference a different replacement draw');
      } else {
        unique(members, ['groups', i, 'members'], issue, 'Out-of-bag sample IDs');
        if (group.replacement) issue(['groups', i, 'replacement'], 'An out-of-bag set cannot use replacement');
      }
    }
  });
}

export function histogramHeights(d, series) {
  return series.values.map((value, i) => d.density ? value / (d.binEdges[i + 1] - d.binEdges[i]) : value);
}
export function histogramMeasureLabel(d) {
  const noun = d.measure === 'count' ? 'Count' : 'Proportion';
  return d.density ? `${noun} density (${d.measure} / ${d.unit || 'unit'})` : noun;
}
export function histogramBinLabel(d, i) {
  return `[${d.binEdges[i]}, ${d.binEdges[i + 1]}${i === d.binEdges.length - 2 ? ']' : ')'}`;
}

function checkHistogram(d, issue) {
  const widths = d.binEdges.slice(1).map((edge, i) => edge - d.binEdges[i]);
  widths.forEach((width, i) => { if (!(width > 0)) issue(['binEdges', i + 1], 'Bin edges must be strictly increasing'); });
  const unequal = widths.some(width => Math.abs(width - widths[0]) > 1e-10 * Math.max(Math.abs(width), Math.abs(widths[0])));
  if (unequal && !d.density) issue(['density'], 'Unequal bin widths require density: true so bar area represents count or proportion');
  unique(d.series.map(series => series.label), ['series'], issue, 'Series labels');
  d.series.forEach((series, i) => {
    if (series.values.length !== widths.length) issue(['series', i, 'values'], 'Every series needs one value for each shared bin');
    const sum = series.values.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) issue(['series', i, 'values'], 'A distribution must contain positive mass');
    if (d.measure === 'count' && series.values.some(value => !Number.isInteger(value))) issue(['series', i, 'values'], 'Counts must be nonnegative integers');
    if (d.measure === 'proportion' && !histogramCounts(series.values) && (series.values.some(value => value > 1) || Math.abs(sum - 1) > 1e-6)) issue(['series', i, 'values'], 'Bin proportions must be in [0, 1] and sum to 1');
    if (histogramHeights(d, series).some(value => !Number.isFinite(value))) issue(['series', i, 'values'], 'Bin density must remain finite');
  });
  (d.markers ?? []).forEach((marker, i) => {
    if (!within(marker.value, d.binEdges[0], d.binEdges.at(-1))) issue(['markers', i, 'value'], 'Threshold is outside the bin domain');
  });
}

function checkBoxes(d, issue) {
  if (!(d.x.min < d.x.max)) issue(['x', 'max'], 'The axis maximum must exceed its minimum');
  unique(d.boxes.map(box => box.label), ['boxes'], issue, 'Box labels');
  d.boxes.forEach((box, i) => {
    const fields = ['whiskerLow', 'q1', 'median', 'q3', 'whiskerHigh'];
    fields.forEach((field, j) => {
      if (!within(box[field], d.x.min, d.x.max)) issue(['boxes', i, field], 'Summary is outside the shared axis domain');
      if (j && box[field] < box[fields[j - 1]]) issue(['boxes', i, field], 'Require whiskerLow ≤ q1 ≤ median ≤ q3 ≤ whiskerHigh');
    });
    // The fences (written, or computed from q1 and q3 when left out) are checked against the whiskers and their own arithmetic by derived.js; fences may fall outside the author's x range (the renderer widens the axis to hold them).
    (box.outliers ?? []).forEach(({ value }, j) => {
      if (!within(value, d.x.min, d.x.max)) issue(['boxes', i, 'outliers', j, 'value'], 'Outlier is outside the shared axis domain');
      const lower = box.fences?.lower ?? box.whiskerLow, upper = box.fences?.upper ?? box.whiskerHigh;
      if (within(value, lower, upper)) issue(['boxes', i, 'outliers', j, 'value'], 'An outlier must lie strictly outside the fences, or whiskers when no fences are supplied');
    });
  });
}

export function validate(diagram, issue) {
  switch (diagram.kind) {
    case 'heatmap': checkDerived(diagram, issue); return checkHeatmap(diagram, issue); // VAR-1: derived fields (derived.js)
    case 'sample-set': checkDerived(diagram, issue); return checkSamples(diagram, issue);
    case 'histogram': checkDerived(diagram, issue); return checkHistogram(diagram, issue);
    case 'box-plot': checkDerived(diagram, issue); return checkBoxes(diagram, issue);
  }
}

export function sampleMemberships(group) {
  const counts = new Map();
  for (const id of group.members) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count, text: `${id} × ${count}` }));
}
const axisName = axis => axis.unit ? `${axis.label} (${axis.unit})` : axis.label;
export function boxSummary(box) {
  return `Whiskers: ${box.whiskerLow}, ${box.whiskerHigh}; Q1: ${box.q1}; Median: ${box.median}; Q3: ${box.q3}`;
}

export function describe(d) {
  switch (d.kind) {
    case 'heatmap': return [
      `Range: ${d.range.min} to ${d.range.max}`, ...[d.rowLabel, d.columnLabel].filter(Boolean),
      ...d.rows.map(row => `${row.label}: ${row.cells.map((value, i) => `${d.columns[i]}: ${value === null ? 'masked' : value}`).join('; ')}`),
      ...(d.highlights ?? []).map(({ row, column }) => `Highlighted: ${d.rows[row].label}, ${d.columns[column]}`),
    ];
    case 'sample-set': return [
      ...d.samples.map(sample => `${sample.id}${sample.label ? `: ${sample.label}` : ''}${sample.class ? `; class ${sample.class}` : ''}${sample.weight !== undefined ? `; weight ${sample.weight}` : ''}`),
      ...d.groups.flatMap(group => [
        `${group.label} (${group.members.length} draws, ${new Set(group.members).size} unique): ${sampleMemberships(group).map(member => member.text).join(', ') || 'empty set'}`,
        ...(group.omitted ? [`Omitted: ${group.omitted.join(', ') || 'none'}`] : []),
        ...(group.outOfBagFor ? [`Out of bag for ${d.groups.find(other => other.id === group.outOfBagFor).label}`] : []),
      ]),
    ];
    case 'histogram': return [
      `${axisName({ label: d.xLabel, unit: d.unit })}; ${histogramMeasureLabel(d)}`,
      ...d.series.map(series => `${series.label}: ${series.values.map((value, i) => `${histogramBinLabel(d, i)}: ${value}`).join('; ')}`),
      ...(d.markers ?? []).map(marker => `${marker.label}: ${marker.value}`),
    ];
    case 'box-plot': return [
      `${axisName(d.x)}: ${d.x.min} to ${d.x.max}`,
      ...d.boxes.flatMap(box => [
        `${box.label}: ${boxSummary(box)}`,
        ...(box.fences ? [`Lower fence: ${box.fences.lower}; Upper fence: ${box.fences.upper}`] : []),
        ...(box.outliers ?? []).map(point => `${point.label}: ${point.value}`),
      ]),
    ];
    default: return null;
  }
}

// Match the existing reader's authored-text accounting: numbers and fixed
// renderer vocabulary are not author words. Sample IDs are visible labels in
// this kind, so unlike invisible structural IDs they do count at each display.
export function visibleText(d) {
  const own = [d.title, d.caption].filter(Boolean);
  switch (d.kind) {
    case 'heatmap': return [...own, d.rowLabel, d.columnLabel, ...d.columns, ...d.rows.map(row => row.label)].filter(Boolean);
    case 'sample-set': return [...own, ...d.samples.flatMap(sample => [sample.id, sample.label !== sample.id ? sample.label : undefined, sample.class]),
      ...d.groups.flatMap(group => [group.label, ...sampleMemberships(group).map(member => member.id), ...(group.omitted ?? []),
        group.outOfBagFor ? d.groups.find(other => other.id === group.outOfBagFor)?.label : undefined])].filter(Boolean);
    case 'histogram': return [...own, d.xLabel, d.unit, ...d.series.map(series => series.label), ...(d.markers ?? []).map(marker => marker.label)].filter(Boolean);
    case 'box-plot': return [...own, d.x.label, d.x.unit, ...d.boxes.flatMap(box => [box.label, ...(box.outliers ?? []).map(point => point.label)])].filter(Boolean);
    default: return null;
  }
}
