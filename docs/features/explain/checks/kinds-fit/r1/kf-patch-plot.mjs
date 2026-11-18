// kinds-fit R1: parametrize the coordinate plot and plotTicks by a sizes table (defaults = today's constants) and add box / parts / floor handling.
import fs from 'node:fs';
const D = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const must = (cond, msg) => { if (!cond) throw new Error(msg); };
const slice = (s, from, to) => { const a = s.indexOf(from); must(a >= 0, 'missing ' + from.slice(0, 40)); const b = s.indexOf(to, a + from.length); must(b >= 0, 'missing end ' + to.slice(0, 40)); return [a, b]; };

// ---- plot-ticks.js
const CR = String.fromCharCode(13, 10), LF = String.fromCharCode(10), toLf = t => t.split(CR).join(LF), toCrlf = t => t.split(LF).join(CR);
let pt = fs.readFileSync(D + 'plot-ticks.js', 'utf8'); const ptCrlf = pt.includes(CR); pt = toLf(pt);
pt = pt.replace('function fits(ticks, horizontal, gap = GAP) {\n  const sizes = ticks.map(({ lines }) => horizontal ? Math.max(...lines.map(line => textWidth(line, SIZE))) : lines.length * lineHeight(SIZE));',
  'function fits(ticks, horizontal, gap = GAP, size = SIZE) {\n  const sizes = ticks.map(({ lines }) => horizontal ? Math.max(...lines.map(line => textWidth(line, size))) : lines.length * lineHeight(size));');
must(pt.includes('gap = GAP, size = SIZE'), 'plot-ticks fits');
pt = pt.replace("export function plotTicks(axis, position, { horizontal = false, labelWidth = Infinity } = {}) {\n", "export function plotTicks(axis, position, { horizontal = false, labelWidth = Infinity, size = SIZE } = {}) {\n  const fitsAt = (ticks, isHorizontal, gap) => fits(ticks, isHorizontal, gap, size);\n");
must(pt.includes('fitsAt'), 'plotTicks signature');
const startFn = pt.indexOf('export function plotTicks');
let head = pt.slice(0, startFn), body = pt.slice(startFn);
body = body.replace('at, lines: wrap(text, width, SIZE),', 'at, lines: wrap(text, width, size),').split('fits(labels,').join('fitsAt(labels,').split('fits(ticks,').join('fitsAt(ticks,');
// keep the helper's own definition untouched
body = body.replace('const fitsAt = (ticks, isHorizontal, gap) => fitsAt(ticks, isHorizontal, gap, size);', 'const fitsAt = (ticks, isHorizontal, gap) => fits(ticks, isHorizontal, gap, size);');
pt = head + body;
fs.writeFileSync(D + 'plot-ticks.js', ptCrlf ? toCrlf(pt) : pt);

// ---- ml-plot-layouts.js
let s = fs.readFileSync(D + 'ml-plot-layouts.js', 'utf8'); const sCrlf = s.includes(CR); s = toLf(s);
const rep = (a, b) => { must(s.includes(a), 'missing: ' + a.slice(0, 60)); s = s.replace(a, () => b); };
rep('const TICK = 15, MARKER = 7, LINE = 4.5, GRID = 1.5;', 'const TICK = 15, MARKER = 7, LINE = 4.5, GRID = 1.5;\n// kinds-fit: with a box the plot area is at least PLOT_FLOOR tall and PLOT_MIN_WIDTH wide (a plot area under that no longer reads); without a box it is 240 tall as always.\nconst PLOT_FLOOR = 120, PLOT_MIN_WIDTH = 120;');

// plotEndLabels
{
  const [a, b] = slice(s, 'function plotEndLabels(series) {', '\n}\n');
  let f = s.slice(a, b + 3);
  f = f.replace('function plotEndLabels(series) {', 'function plotEndLabels(series, small = SMALL, off = false) {').replace('const endSeries = series.flatMap(', 'const endSeries = off ? [] : series.flatMap(').split('SMALL)').join('small)');
  must(!/\bSMALL\b/.test(f.replace('small = SMALL', '')), 'plotEndLabels leftover SMALL');
  s = s.slice(0, a) + f + s.slice(b + 3);
}
// legendPills
{
  const [a, b] = slice(s, 'function legendPills(items, width, top) {', '\n}\n');
  let f = s.slice(a, b + 3);
  f = f.replace('function legendPills(items, width, top) {', 'function legendPills(items, width, top, small = 12) {')
    .replace('wrap(text, width - 2 * PAD - 52, 12)', 'wrap(text, width - 2 * PAD - 52, small)')
    .replace('legendTextWidth(line, 12)', 'legendTextWidth(line, small)').replace("widestFormula(lines.join(' '), 12)", "widestFormula(lines.join(' '), small)")
    .replace('lineHeight(12) + 6', 'lineHeight(small) + 6').replace("size: 12, weight: 500", 'size: small, weight: 500');
  s = s.slice(0, a) + f + s.slice(b + 3);
}
// curveLabels
{
  const [a, b] = slice(s, 'function curveLabels(series, lines, bounds, occupied) {', '\n}\n');
  let f = s.slice(a, b + 3);
  f = f.replace('function curveLabels(series, lines, bounds, occupied) {', 'function curveLabels(series, lines, bounds, occupied, size = CURVE_LABEL_SIZE) {').split('textWidth(text, CURVE_LABEL_SIZE)').join('textWidth(text, size)').replace('widestFormula(text, CURVE_LABEL_SIZE)', 'widestFormula(text, size)').replace('lineHeight(CURVE_LABEL_SIZE)', 'lineHeight(size)');
  must(!/CURVE_LABEL_SIZE/.test(f.replace('size = CURVE_LABEL_SIZE', '')), 'curveLabels leftover');
  s = s.slice(0, a) + f + s.slice(b + 3);
}
// tickSpan
rep('const tickSpan = ({ at, lines, anchor }) => {\n  const w = Math.max(...lines.map(line => textWidth(line, TICK)));', 'const tickSpan = ({ at, lines, anchor }, size = TICK) => {\n  const w = Math.max(...lines.map(line => textWidth(line, size)));');

// coordinatePlot
{
  const [a, b] = slice(s, 'function coordinatePlot(diagram, requested, options) {', '\n}\n');
  const next = `function coordinatePlot(diagram, requested, options) {
  const boxed = Boolean(options?.box);
  const run = opts => {
    let layout;
    for (let pass = 0, asked = requested; pass < (boxed ? 12 : 4); pass++) {
      layout = plotLayout(diagram, asked, opts);
      if (!layout.crowded) break;
      asked = layout.width + 2 * layout.crowded; // moving the right edge by d moves each gap by d / 2
    }
    const { crowded, ...drawn } = layout;
    return drawn;
  };
  if (!boxed) return run(options);
  // kinds-fit: a first pass with the plot area at its floor gives the smallest width (tick labels apart) and the height of everything below the plot; a second pass gives the plot area the rest of the box.
  const base = run({ ...options, plotHeight: undefined });
  const { contentHeight, floor } = options;
  if (floor || contentHeight === undefined) return base;
  const extra = contentHeight - base.height;
  return extra > 0 ? run({ ...options, plotHeight: base.plotHeight + extra }) : base;
}`;
  s = s.slice(0, a) + next + s.slice(b + 2);
}

// plotLayout region
{
  const a = s.indexOf('function plotLayout(diagram, requested, { sharedLabelSpace, lift = 0 } = {}) {');
  const b = s.indexOf('// BAR-1:');
  must(a > 0 && b > a, 'plotLayout bounds');
  let f = s.slice(a, b);
  const fr = (x, y) => { must(f.includes(x), 'plotLayout missing: ' + x.slice(0, 60)); f = f.replace(x, () => y); };
  fr('function plotLayout(diagram, requested, { sharedLabelSpace, lift = 0 } = {}) {', 'function plotLayout(diagram, requested, options = {}) {\n  const { sharedLabelSpace, lift = 0, box, sizes, parts, plotHeight } = options;');
  // region-wide size substitutions
  f = f.replace(/\bSMALL\b/g, 'small').replace(/\bTICK\b/g, 'body').replace(/\bCURVE_LABEL_SIZE\b/g, 'curveSize')
    .replace(/size: 16\b/g, 'size: heading').replace(/lineHeight\(16\)/g, 'lineHeight(heading)')
    .replace('textWidth(String(p.y), 15)', 'textWidth(String(p.y), body)').replace('{ size: 15, weight: 700 }', '{ size: body, weight: 700 }')
    .replace(/tickSpan\(([^()]+)\)/g, 'tickSpan($1, body)');
  fr('wrap(yName, width - 2 * PAD, 16)', 'wrap(yName, width - 2 * PAD, heading)');
  fr('wrap(titleOf(d.x), right - left, 16)', 'wrap(titleOf(d.x), right - left, heading)');
  // the head of the layout: sizes, left margin, width, top, plot area
  const h0 = f.indexOf('  const endLabels = plotEndLabels(d.series);');
  const h1 = f.indexOf('  const { left, right, top, bottom } = bounds;');
  must(h0 > 0 && h1 > h0, 'head bounds');
  const newHead = `  const boxed = Boolean(box);
  const body = sizes?.body ?? 15, small = sizes?.small ?? 12, heading = sizes?.heading ?? 16, curveSize = sizes?.body ?? 15; // today's TICK, SMALL, the axis title and CURVE_LABEL_SIZE
  const legendMode = parts?.legend ?? 'auto';
  const endLabels = plotEndLabels(d.series, small, legendMode !== 'auto');
  const endGutter = Math.max(endLabels.gutter, sharedLabelSpace?.gutter ?? 0);
  let remainingLabels = endLabels.height;
  // The y title runs along the axis when it is plain text that fits the plot's height; otherwise it stays above the plot, bold at the heading size.
  const yName = titleOf(d.y);
  const rotateY = widestFormula(yName) === 0 && textWidth(yName, heading) * 1.1 <= (boxed ? PLOT_FLOOR - 8 : 232);
  const floorHeight = Math.max(boxed ? PLOT_FLOOR : 240, endLabels.height, sharedLabelSpace?.height ?? 0);
  const plotAreaHeight = boxed && plotHeight ? Math.max(plotHeight, floorHeight) : floorHeight;
  // With a box the left margin is the y title band plus the widest y tick label (default 104); the width is at least that plus a floor plot width, the right margin and the end-label gutter (default: 408 and 324 + gutter).
  const titleBand = rotateY ? PAD + 10 + Math.ceil(lineHeight(heading) / 2) + 6 : PAD;
  const tickWidth = boxed ? Math.ceil(Math.max(0, ...plotTicks(d.y, scale(d.y, plotAreaHeight, 0), { size: body }).flatMap(tick => tick.lines).map(line => textWidth(line, body)))) : 0;
  const leftEdge = boxed ? titleBand + tickWidth + 8 : 104;
  const formulaFloor = boxed ? Math.max(0, ...[d.x?.label, d.y?.label, ...d.series.map(s => s.label), ...(d.annotations ?? []).map(a => a.label), ...(d.categories ?? [])].filter(Boolean)
    .map(t => widestFormula(t, small) ? widestFormula(t, small) + 2 * PAD + 52 : 0)) : 0;
  const width = boxed ? Math.max(requested, formulaFloor, leftEdge + PLOT_MIN_WIDTH + 24 + endGutter) : Math.max(bodyWidth(d, requested), 324 + endGutter);
  // lift: the rows of labels above the plot area push the plot down by 14 px each (a second pass, once the first has counted them); 0 leaves every other plot as it was.
  const top0 = (boxed ? (rotateY ? Math.ceil(lineHeight(body) / 2) + 12 : PAD + wrap(yName, width - 2 * PAD, heading).length * lineHeight(heading) + 14) : (rotateY ? 40 : 66)) + lift;
  const bottomEdge = top0 + plotAreaHeight;
  const bounds = { left: leftEdge, right: width - 24 - endGutter, top: top0, bottom: bottomEdge };
`;
  f = f.slice(0, h0) + newHead + f.slice(h1);
  fr("plotTicks(d.x, x, { horizontal: true })", 'plotTicks(d.x, x, { horizontal: true, size: body })');
  fr('plotTicks(d.y, y, { labelWidth: left - PAD - 8 })', 'plotTicks(d.y, y, { labelWidth: left - (boxed ? titleBand : PAD) - 8, size: body })');
  fr('const callouts = curveLabels(d.series, d.series.map(series => series.points.map(xy)), bounds, occupied);', "const callouts = legendMode === 'auto' ? curveLabels(d.series, d.series.map(series => series.points.map(xy)), bounds, occupied, curveSize) : null; // 'none' and 'always' never name the curves");
  fr('if (d.series.length > 1) legend.push(', "if (d.series.length > 1 || legendMode === 'always') legend.push(");
  fr('  if (legend.length) {\n    const drawn = legendPills(legend, width, legendY);', "  if (legendMode === 'none') legend.length = 0;\n  if (legend.length) {\n    const drawn = legendPills(legend, width, legendY, small);");
  fr('return plotLayout(diagram, requested, { sharedLabelSpace, lift: aboveRows.length * ROW });', 'return plotLayout(diagram, requested, { ...options, lift: aboveRows.length * ROW });');
  fr('return { width, height: legendY, plotBounds: bounds, crowded, elements:', "return { width, height: legendY, plotBounds: bounds, plotHeight: bounds.bottom - bounds.top, crowded,\n    geometry: { plotArea: { left, right, top, bottom }, x: { min: d.x.min, max: d.x.max, scale: d.x.scale ?? 'linear' }, y: { min: d.y.min, max: d.y.max, scale: d.y.scale ?? 'linear' } }, elements:");
  s = s.slice(0, a) + f + s.slice(b);
}
// the shared label space measures end labels at the default size
fs.writeFileSync(D + 'ml-plot-layouts.js', sCrlf ? toCrlf(s) : s);
console.log('patched');
