// PLT-3(A) evidence: Normal / df=5 / df=1 as formula series (offline through fillFormulaSeries, no flag, no author), and the same plot with hand-written points, rendered before and after.
// usage: node a-render.mjs <treeRoot as file URL of packages/web/src> <phase> <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { fillFormulaSeries } from 'file:///C:/s/sprint2-rep/packages/control-plane/src/explanation-formula-series.js';
const [src, phase, out] = process.argv.slice(2);
const { renderTutorDiagram } = await import(`${src}/tutor-diagrams/TutorDiagram.js`);
mkdirSync(out, { recursive: true });
const axes = { x: { label: 'x', min: -3, max: 3, integerTicks: true }, y: { label: 'Density', min: 0, max: 0.5 } };
const formulas = [
  { label: 'Normal', kind: 'line', formula: 'exp(-x^2/2)/2.5066', xMin: -3, xMax: 3, samples: 24 },
  { label: 'df = 5', kind: 'line', formula: '0.3796*(1+x^2/5)^(-3)', xMin: -3, xMax: 3, samples: 24 },
  { label: 'df = 1', kind: 'line', formula: '0.3183/(1+x^2)', xMin: -3, xMax: 3, samples: 24 },
];
const hand = [
  { label: 'Normal', kind: 'line', points: [[-3, 0.004], [-2.25, 0.032], [-1.5, 0.13], [-0.75, 0.301], [0, 0.399], [0.75, 0.301], [1.5, 0.13], [2.25, 0.032], [3, 0.004]].map(([x, y]) => ({ x, y })) },
  { label: 'df = 5', kind: 'line', points: [[-3, 0.017], [-2.25, 0.045], [-1.5, 0.125], [-0.75, 0.26], [0, 0.38], [0.75, 0.26], [1.5, 0.125], [2.25, 0.045], [3, 0.017]].map(([x, y]) => ({ x, y })) },
  { label: 'df = 1', kind: 'line', points: [[-3, 0.032], [-2.25, 0.052], [-1.5, 0.097], [-0.75, 0.204], [0, 0.318], [0.75, 0.204], [1.5, 0.097], [2.25, 0.052], [3, 0.032]].map(([x, y]) => ({ x, y })) },
];
const make = (title, series) => ({ version: 1, diagram: { kind: 'coordinate-plot', title, ...axes, series, annotations: [{ kind: 'reference-line', axis: 'x', value: 0, label: 'Mean' }], caption: 'Smaller df means heavier tails.' } });
const specs = {
  formula: fillFormulaSeries([{ k: 'diagram', spec: make('Normal and t densities by formula', formulas) }])[0].spec,
  hand: make('Normal and t densities, hand-written points', hand),
  two: { version: 1, diagram: { ...make('Two curves', hand.slice(0, 2)).diagram } },
  four: { version: 1, diagram: { ...make('Four series keep the legend', [...hand, { label: 'df = 2', kind: 'line', points: hand[2].points.map(p => ({ x: p.x, y: p.y * 0.9 })) }]).diagram } },
  one: { version: 1, diagram: { ...make('One series', hand.slice(0, 1)).diagram } },
};
const rows = [];
for (const [name, spec] of Object.entries(specs)) {
  if (name === 'formula') console.log('formula series sampled to points:', spec.diagram.series.map(s => `${s.label}:${s.points?.length ?? 'NOT SAMPLED'}`).join(' '));
  for (const width of [408, 720]) {
    const { element, width: w, height: h } = renderTutorDiagram(spec, width);
    const svg = renderToStaticMarkup(element);
    writeFileSync(`${out}/callouts-${name}-${phase}-${width}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${svg}`);
    rows.push(`${name} ${phase} ${width} -> ${Math.ceil(w)}x${Math.ceil(h)} curve-labels=${(svg.match(/data-tutor-plot-curve-label/g) ?? []).length} legend-pills=${(svg.match(/data-tutor-plot-legend/g) ?? []).length}`);
  }
}
console.log(rows.join('\n'));
