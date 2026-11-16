// Renders the PLT-2 / PLT-3 evidence specs to svg + html at 408 and 720. Usage: node render.mjs <phase-label> <out-dir> [jobs...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from '../packages/web/src/tutor-diagrams/reference-library.js';
import { renderTutorDiagram } from '../packages/web/src/tutor-diagrams/TutorDiagram.js';
import { fillFormulaSeries } from '../packages/control-plane/src/explanation-formula-series.js';

const [phase, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const pdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
const xs = Array.from({ length: 25 }, (_, i) => -3 + i * 0.25);
const round = (v, n = 4) => Number(v.toFixed(n));
const bell = {
  version: 1,
  diagram: {
    kind: 'coordinate-plot', title: 'The normal distribution',
    x: { label: 'Standard deviations from the mean', min: -3, max: 3 },
    y: { label: 'Density', min: 0, max: 0.45 },
    series: [{ label: 'Normal density', kind: 'line', samples: { x: { start: -3, step: 0.25 }, y: xs.map(x => round(pdf(x))) } }],
    // annotation index picks a band's colour (0 blue, 1 coral, 2 teal): the wide band is index 2 and the narrow one index 3 (blue)
    annotations: [
      { kind: 'reference-line', label: 'Mean', axis: 'x', value: 0 },
      { kind: 'reference-line', label: 'One standard deviation below', axis: 'x', value: -1 },
      { kind: 'band', label: 'Within one standard deviation', axis: 'x', from: -1, to: 1 },
      { kind: 'band', label: 'Within half a standard deviation', axis: 'x', from: -0.5, to: 0.5 },
      { kind: 'reference-line', label: 'One standard deviation above', axis: 'x', value: 1 },
      { kind: 'point', label: 'Mean', x: 0, y: round(pdf(0)) },
      { kind: 'point', label: 'Standard deviation', x: 1, y: round(pdf(1)) },
      { kind: 'point', label: 'Standard deviation', x: -1, y: round(pdf(1)) },
    ],
  },
};
const tdens = (df, c) => x => c * (1 + x * x / df) ** (-(df + 1) / 2);
const t5 = tdens(5, 0.3796), t1 = x => 1 / (Math.PI * (1 + x * x));
const curves = {
  formula: [
    { label: 'Normal', kind: 'line', formula: 'exp(-x^2/2)/2.5066', xMin: -3, xMax: 3, samples: 24 },
    { label: 'df = 5', kind: 'line', formula: '0.3796*(1+x^2/5)^(-3)', xMin: -3, xMax: 3, samples: 24 },
    { label: 'df = 1', kind: 'line', formula: '0.3183/(1+x^2)', xMin: -3, xMax: 3, samples: 24 },
  ],
  hand: [
    { label: 'Normal', kind: 'line', points: [-3, -2.25, -1.5, -0.75, 0, 0.75, 1.5, 2.25, 3].map(x => ({ x, y: round(pdf(x), 3) })) },
    { label: 'df = 5', kind: 'line', points: [-3, -2.25, -1.5, -0.75, 0, 0.75, 1.5, 2.25, 3].map(x => ({ x, y: round(t5(x), 3) })) },
    { label: 'df = 1', kind: 'line', points: [-3, -2.25, -1.5, -0.75, 0, 0.75, 1.5, 2.25, 3].map(x => ({ x, y: round(t1(x), 3) })) },
  ],
};
const heavy = series => ({
  version: 1,
  diagram: {
    kind: 'coordinate-plot', title: 'Heavier tails than the normal',
    x: { label: 'Value', min: -3, max: 3 }, y: { label: 'Density', min: 0, max: 0.45 },
    series, annotations: [{ kind: 'reference-line', label: 'Zero', axis: 'x', value: 0 }],
  },
});
const sampled = spec => ({ ...spec, diagram: fillFormulaSeries([{ k: 'diagram', spec }])[0].spec.diagram });
const separate = {
  version: 1,
  diagram: {
    kind: 'coordinate-plot', title: 'Three normals with different means',
    x: { label: 'Value', min: -6, max: 6 }, y: { label: 'Density', min: 0, max: 1 },
    series: [['Left', '(x+3.5)'], ['Middle', 'x'], ['Right', '(x-3.5)']].map(([label, u]) => ({ label, kind: 'line', formula: 'exp(-' + u + '^2/0.5)/1.2533', xMin: -6, xMax: 6, samples: 24 })),
  },
};
const jobs = {
  'curves-separate': sampled(separate),
  'bell': bell,
  'anomaly-density': diagramReferences.find(r => r.id === 'ml-zscore-distribution-tails')?.spec,
  'curves-formula': sampled(heavy(curves.formula)),
  'curves-hand': heavy(curves.hand),
};
const lines = [];
for (const [name, spec] of Object.entries(jobs)) {
  if (only.length && !only.includes(name)) continue;
  for (const width of [408, 720]) {
    const { element, width: w, height: h } = renderTutorDiagram(spec, width);
    const svg = renderToStaticMarkup(element);
    const base = `${out}/${name}-${phase}-${width}`;
    writeFileSync(`${base}.svg`, svg);
    writeFileSync(`${base}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${svg}`);
    lines.push(`${name} ${phase} ${width}: ${Math.ceil(w)} x ${Math.ceil(h)}`);
  }
}
console.log(lines.join('\n'));
