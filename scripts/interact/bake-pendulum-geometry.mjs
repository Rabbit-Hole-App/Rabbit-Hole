// Brief 34: measures the pendulum card's plot and bakes where it sits in frame coordinates. Runs the card's real program (interact-templates/pendulum.js source) with a recording sdk at every slider setting and time,
// hands each diagram spec to the renderer exactly as FrameFigures.jsx DiagramFigure does (renderTutorDiagram at the box width, scaled by min(1, w / width, h / height), placed at the box corner) and reads the plot
// area from the layout the renderer computes (layouts['coordinate-plot'] returns plotBounds). Writes packages/web/src/interact-pendulum-geometry.js; `--check` compares, `--measure` prints the table.
// Reads tutor-diagrams/ and changes nothing there.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages/web/src');
const load = name => import(pathToFileURL(join(SRC, name)));
const { source } = await load('interact-templates/pendulum.js'), { PENDULUM_PLANS } = await load('interact-pendulum-plan.js');
const { renderTutorDiagram } = await load('tutor-diagrams/TutorDiagram.js'), { parseTutorDiagram, dropGenericUnits } = await load('tutor-diagrams/spec.js'), { layouts } = await load('tutor-diagrams/layouts.js');
const { renderToStaticMarkup } = await import(pathToFileURL(join(SRC, '..', 'node_modules/react-dom/server.js')));

const FRAME = { width: 640, height: 290 };
const data = structuredClone(PENDULUM_PLANS['stepper-pendulum-detailed'].scene.data);
const sdk = new Proxy({}, { get: (_, fn) => (...args) => ({ fn, args }) });
const program = new Function('sdk', `${source({ geometry: { pendulum: data } }).replace('export function evaluate', 'function evaluate')}\nreturn evaluate;`)(sdk);
const run = (length, time, mass = 1) => {
  const out = program({ inputs: { mass, length }, time });
  const diagram = out.frame.args[0].find(o => o.fn === 'diagram');
  return { out, diagram };
};

function measure(spec, box) {
  const rendered = renderTutorDiagram(spec, box.w);
  const parsed = dropGenericUnits(parseTutorDiagram(spec)).diagram;
  const layout = layouts['coordinate-plot'](parsed, Math.max(320, Math.min(720, Math.round(box.w))));
  const title = rendered.height - layout.height, scale = Math.min(1, box.w / rendered.width, box.h / rendered.height);
  const at = (x, y) => [box.x + scale * x, box.y + scale * (title + y)];
  const b = layout.plotBounds, [left, top] = at(b.left, b.top), [right, bottom] = at(b.right, b.bottom);
  const markup = renderToStaticMarkup(rendered.element);
  const count = attr => (markup.match(new RegExp(attr, 'g')) ?? []).length;
  const grid = [...markup.matchAll(/<line x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)"[^>]*data-tutor-plot-grid/g)].map(m => Number(m[1]));
  return { width: rendered.width, height: rendered.height, scale, plot: { left, right, top, bottom }, legend: count('data-tutor-plot-legend'), curveLabels: count('data-tutor-plot-curve-label'), callouts: count('data-tutor-plot-callout'),
    gridYs: grid.map(y => Math.round(at(0, y)[1] * 100) / 100), points: parsed.series.map(s => s.points?.length ?? s.samples.y.length), parsed };
}

const r2 = n => Math.round(n * 100) / 100;
// Distance from each dot's centre to the curve the renderer drew (its path d, sampled densely), in frame pixels; and the highest and lowest sample of each curve.
function dotsOffCurve(length, time) {
  const { out, diagram } = run(length, time), spec = diagram.args[0], rendered = renderTutorDiagram(spec, box.w), markup = renderToStaticMarkup(rendered.element);
  const scale = measure(spec, box).scale;
  const layout = layouts['coordinate-plot'](dropGenericUnits(parseTutorDiagram(spec)).diagram, 320), top = rendered.height - layout.height;
  const paths = [...markup.matchAll(/<path d="([^"]+)"[^>]*data-tutor-plot-series/g)].map(match => match[1]);
  const dots = out.frame.args[0].filter(o => o.fn === 'circle' && o.args[0].startsWith('dot.')).map(o => [o.args[1], o.args[2]]);
  return paths.map((d, i) => {
    const nums = d.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number); let [x0, y0] = nums; const sampled = []; 
    for (let k = 2; k + 5 < nums.length + 1; k += 6) { const [a, b, c, e, x1, y1] = nums.slice(k, k + 6); for (let u = 0; u <= 1; u += 0.005) { const w = 1 - u; sampled.push([w ** 3 * x0 + 3 * w * w * u * a + 3 * w * u * u * c + u ** 3 * x1, w ** 3 * y0 + 3 * w * w * u * b + 3 * w * u * u * e + u ** 3 * y1]); } x0 = x1; y0 = y1; }
    return Math.min(...sampled.map(([x, y]) => Math.hypot(box.x + scale * x - dots[i][0], box.y + scale * (top + y) - dots[i][1])));
  });
}
const peakErrors = length => { const { diagram } = run(length, 0); return diagram.args[0].diagram.series.map(s => { const ys = s.samples.y; return [Math.max(...ys), Math.min(...ys)]; }); };
const sample = run(1, 0).diagram, box = { x: sample.args[1].x, y: sample.args[1].y, w: sample.args[1].w, h: FRAME.height - sample.args[1].y };
const rows = [];
for (const length of [0.5, 1, 2]) for (const time of [0, 3, 6]) { const { diagram } = run(length, time); rows.push({ length, time, ...measure(diagram.args[0], box) }); }
if (process.argv.includes('--measure')) {
  for (const row of rows) console.log(`L=${row.length} t=${row.time}: size ${row.width}x${row.height} scale ${row.scale.toFixed(4)} plot [${[row.plot.left, row.plot.top, row.plot.right, row.plot.bottom].map(r2)}] legend ${row.legend} curveLabels ${row.curveLabels} callouts ${row.callouts} pts ${row.points} gridY ${row.gridYs}`);
  const key = row => JSON.stringify([row.width, row.height, row.scale, row.plot, row.legend, row.curveLabels, row.callouts, row.gridYs]);
  for (const length of [0.5, 1, 2]) console.log(`L=${length}: [max,min] of A and B samples ${JSON.stringify(peakErrors(length))}`);
  for (const [length, time] of [[0.5, 0.7], [1, 3.3], [2, 6.1], [2, 7.9], [0.5, 4.4]]) console.log(`dot centre to drawn curve, L=${length} t=${time}: A ${dotsOffCurve(length, time)[0].toFixed(3)} px, B ${dotsOffCurve(length, time)[1].toFixed(3)} px`);
  console.log(rows.every(row => key(row) === key(rows[0])) ? 'IDENTICAL across all nine' : 'DIFFERENT');
}
const first = rows[0], geometry = { plot: { left: r2(first.plot.left), right: r2(first.plot.right), top: r2(first.plot.top), bottom: r2(first.plot.bottom) } };
const text = `// Generated by scripts/interact/bake-pendulum-geometry.mjs (brief 34): the plot area of the pendulum card's coordinate-plot in frame coordinates (time 0 to the end across, +yMax to -yMax down), read from the renderer's layout. Do not edit by hand.\nexport const PENDULUM_GEOMETRY = ${JSON.stringify(geometry)};\n`;
const file = join(SRC, 'interact-pendulum-geometry.js');
if (process.argv.includes('--check')) { const same = readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === text; console.log(same ? 'geometry is current' : 'geometry is STALE'); process.exit(same ? 0 : 1); }
if (!process.argv.includes('--measure')) { writeFileSync(file, text); console.log(`wrote ${file}`, JSON.stringify(geometry)); }
