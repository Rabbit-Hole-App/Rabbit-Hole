import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const SRC = 'C:/s/kinds-fit/packages/web/src/tutor-diagrams/';
const { renderTutorDiagram } = await import(pathToFileURL(SRC + 'TutorDiagram.js').href);
const gallery = JSON.parse(fs.readFileSync(SRC + 'kind-gallery.json', 'utf8'));
const all = s => ({ title: s, heading: s, body: s, small: s });
const grouped = { version: 1, diagram: { kind: 'bar-chart', title: 'Loans by season', variant: 'grouped', unit: 'books', categories: ['Spring', 'Summer', 'Autumn'], series: [{ label: 'Adults', values: [12, 18, 9] }, { label: 'Children', values: [7, 15, 11] }] } };
const pendulum = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Pendulum angle over time', x: { label: 'Time', unit: 's', min: 0, max: 8 }, y: { label: 'Angle', unit: '°', min: -25, max: 25 },
  series: [{ kind: 'line', label: 'Small swing', points: [{ x: 0, y: 10 }, { x: 2, y: 0 }, { x: 4, y: -10 }, { x: 6, y: 0 }, { x: 8, y: 10 }] }, { kind: 'line', label: 'Large swing', points: [{ x: 0, y: 20 }, { x: 2, y: 0 }, { x: 4, y: -20 }, { x: 6, y: 0 }, { x: 8, y: 10 }] }] } };
const longName = { version: 1, diagram: { ...pendulum.diagram, series: pendulum.diagram.series.map((s, i) => ({ ...s, label: i ? 'Large swing released from a greater height' : s.label })) } };
const show = (name, spec, box, parts = { title: false }) => {
  const r = renderTutorDiagram(spec, box[0], { box: { width: box[0], height: box[1] }, sizes: all(14), parts });
  const line = axis => r.min.parts.filter(p => p.axis === axis).map(p => `${p.part} ${Number(p.px.toFixed(2))}`).join(' + ');
  console.log(`${name}: box ${box.join('x')} drawn ${r.width}x${r.height} min ${r.min.width}x${r.min.height}\n  height: ${line('height')} = ${r.min.height}\n  width: ${line('width')} = ${r.min.width}`);
};
for (const kind of ['coordinate-plot', 'token-links', 'bar-chart', 'heatmap', 'matrix']) show(kind + ' (gallery example)', gallery.find(s => s.diagram.kind === kind), [312, 312]);
show('bar-chart grouped (3 seasons x 2 series)', grouped, [408, 312]);
show('6.1 pendulum, legend always, short names, box 304x299', pendulum, [304, 299], { title: false, legend: 'always' });
show('6.1 pendulum, legend always, long second name, box 304x299', longName, [304, 299], { title: false, legend: 'always' });
