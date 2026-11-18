import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
const { renderTutorDiagram } = await import(pathToFileURL('C:/s/kinds-fit/packages/web/src/tutor-diagrams/TutorDiagram.js').href);
const tl = { version: 1, diagram: { kind: 'token-links', title: 'How sat attends to the sentence', source: ['The', 'cat', 'sat', 'on', 'the', 'mat'], target: ['The', 'cat', 'sat', 'on', 'the', 'mat'], queries: [{ index: 2, weights: [0.05, 0.4, 0.3, 0.1, 0.05, 0.1] }] } };
const pl = { version: 1, diagram: { kind: 'coordinate-plot', title: 'Pendulum angle over time', x: { label: 'Time', unit: 's', min: 0, max: 8 }, y: { label: 'Angle', unit: '°', min: -25, max: 25 },
  series: [{ kind: 'line', label: 'Small swing', points: [{ x: 0, y: 10 }, { x: 2, y: 0 }, { x: 4, y: -10 }, { x: 6, y: 0 }, { x: 8, y: 10 }] }, { kind: 'line', label: 'Large swing', points: [{ x: 0, y: 20 }, { x: 2, y: 0 }, { x: 4, y: -20 }, { x: 6, y: 0 }, { x: 8, y: 10 }] }] } };
const sizes14 = { title: 14, heading: 14, body: 14, small: 14 };
const sz = svg => [...new Set([...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => m[1]))].join(',');
for (const [name, spec, w, h, parts] of [['6.1 plot', pl, 312, 312, { title: false }], ['6.2 token-links', tl, 632, 152, { title: false, caption: false }]]) {
  const r = renderTutorDiagram(spec, w, { box: { width: w, height: h }, sizes: sizes14, parts });
  const svg = renderToStaticMarkup(r.element);
  console.log(name, 'drawn', r.width, 'x', r.height, 'min', JSON.stringify(r.min), 'font sizes', sz(svg));
  console.log(' geometry', JSON.stringify(r.geometry).slice(0, 260));
  const r2 = renderTutorDiagram(spec, w);
  console.log(' no options', r2.width, 'x', r2.height, 'min', JSON.stringify(r2.min), 'geometry', r2.geometry && Object.keys(r2.geometry));
}
