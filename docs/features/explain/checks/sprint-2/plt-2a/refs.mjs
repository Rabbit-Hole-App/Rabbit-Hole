// Renders reference ids (and the bell spec) at 408 and 720. Usage: node refs.mjs <phase> <out-dir> <id|bell> ...
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from '../packages/web/src/tutor-diagrams/reference-library.js';
import { renderTutorDiagram } from '../packages/web/src/tutor-diagrams/TutorDiagram.js';
const [phase, out, ...ids] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const pdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI), round = (v, n = 4) => Number(v.toFixed(n));
const xs = Array.from({ length: 25 }, (_, i) => -3 + i * 0.25);
const bell = { version: 1, diagram: { kind: 'coordinate-plot', title: 'The normal distribution',
  x: { label: 'Standard deviations from the mean', min: -3, max: 3 }, y: { label: 'Density', min: 0, max: 0.45 },
  series: [{ label: 'Normal density', kind: 'line', samples: { x: { start: -3, step: 0.25 }, y: xs.map(x => round(pdf(x))) } }],
  // a band's colour is its annotation index (0 blue, 1 coral, 2 teal): the wide band is the 3rd annotation (teal), the narrow the 4th (blue)
  annotations: [
    { kind: 'reference-line', label: 'Mean', axis: 'x', value: 0 },
    { kind: 'reference-line', label: '-1 SD', axis: 'x', value: -1 },
    { kind: 'band', label: 'Within 1 SD', axis: 'x', from: -1, to: 1 },
    { kind: 'band', label: 'Within 0.5 SD', axis: 'x', from: -0.5, to: 0.5 },
    { kind: 'reference-line', label: '+1 SD', axis: 'x', value: 1 },
    { kind: 'point', label: 'Mean', x: 0, y: round(pdf(0)) },
    { kind: 'point', label: 'Standard deviation', x: 1, y: round(pdf(1)) },
    { kind: 'point', label: 'Standard deviation', x: -1, y: round(pdf(1)) },
  ] } };
const lines = [];
for (const id of ids) {
  const spec = id === 'bell' ? bell : diagramReferences.find(r => r.id === id)?.spec;
  if (!spec) { lines.push(`${id} MISSING`); continue; }
  for (const width of [408, 720]) {
    try {
      const { element, width: w, height: h } = renderTutorDiagram(spec, width);
      const svg = renderToStaticMarkup(element), base = `${out}/${id}-${phase}-${width}`;
      writeFileSync(`${base}.svg`, svg);
      writeFileSync(`${base}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${svg}`);
      lines.push(`${id} ${phase} ${width}: ${Math.ceil(w)} x ${Math.ceil(h)}`);
    } catch (error) { lines.push(`${id} ${phase} ${width} ERROR ${String(error.message).slice(0, 80)}`); }
  }
}
console.log(lines.join('\n'));
