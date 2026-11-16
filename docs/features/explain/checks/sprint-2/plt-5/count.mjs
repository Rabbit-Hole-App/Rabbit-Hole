// Counts how every line series of every coordinate-plot reference is drawn: smooth or straight, and which samples carry a marker.
// Usage (from a root that has .sprint-plt/): node count.mjs <out.json>     Run once in released main (before) and once in the branch (after), then compare.mjs.
import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from '../packages/web/src/tutor-diagrams/reference-library.js';
import { renderTutorDiagram } from '../packages/web/src/tutor-diagrams/TutorDiagram.js';
import { plotSeriesPoints } from '../packages/web/src/tutor-diagrams/ml-plot-spec.js';

const plots = [];
const walk = (node, id, path) => {
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'coordinate-plot') { plots.push({ id, path, plot: node }); return; }
  for (const [key, value] of Object.entries(node)) walk(value, id, `${path}/${key}`);
};
for (const ref of diagramReferences) walk(ref.spec?.diagram ?? ref.spec, ref.id, '');

const unescape = text => text.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const result = [];
for (const { id, path, plot } of plots) {
  let svg;
  try { svg = renderToStaticMarkup(renderTutorDiagram({ version: 1, diagram: plot }, 720).element); } catch (error) { result.push({ id, path, error: String(error.message).slice(0, 80) }); continue; }
  for (const series of plot.series) {
    if (series.kind !== 'line') continue;
    const n = plotSeriesPoints(series).length;
    const name = unescape(series.label);
    // the drawn element: a path whose d holds a C is smooth; a polyline is straight
    const element = [...svg.matchAll(/<(path|polyline)\b[^>]*data-tutor-plot-series="([^"]*)"[^>]*>/g)].find(match => unescape(match[2]) === name);
    const smooth = element ? element[1] === 'path' && / d="[^"]*C/.test(element[0]) : null;
    const markers = [...svg.matchAll(/<title>([^<]*): \(([^)]*)\)[^<]*<\/title>/g)].filter(match => unescape(match[1]) === name).length;
    result.push({ id, path, label: series.label, samples: n, hasScatter: plot.series.some(s => s.kind === 'scatter'), smooth, markers, closed: Boolean(series.closed), declared: series.smooth ?? null });
  }
}
writeFileSync(process.argv[2], JSON.stringify(result, null, 1));
console.log(`${plots.length} plots, ${result.length} line series`);
