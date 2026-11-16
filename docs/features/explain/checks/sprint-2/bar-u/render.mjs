import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
const [root, out, phase] = process.argv.slice(2);
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
mkdirSync(out, { recursive: true });
const bars = (title, values, unit) => ({ diagram: { kind: 'bar-chart', title, unit, bars: values.map((value, i) => ({ label: 'Class ' + i, value })) } });
const specs = {
  'equal-logits-panels': { version: 1, diagram: { kind: 'panels', title: 'Uniform probabilities from equal logits', panels: [bars('Raw scores', [1, 1, 1], 'value'), bars('Probabilities', [0.33, 0.33, 0.33], 'value')], links: [{ from: 0, to: 1, operation: 'Softmax' }] } },
  'equal-logits-grouped': { version: 1, diagram: { kind: 'bar-chart', title: 'Uniform probabilities from equal logits', unit: 'value', variant: 'grouped', categories: ['Class 0', 'Class 1', 'Class 2'], series: [{ label: 'Raw score', values: [1, 1, 1] }, { label: 'Probability', values: [0.33, 0.33, 0.33] }] } },
  'real-unit-kept': { version: 1, diagram: { kind: 'bar-chart', title: 'A real unit stays', unit: '%', bars: [{ label: 'a', value: 20 }, { label: 'b', value: 30 }] } },
};
const lines = [];
for (const [name, spec] of Object.entries(specs)) for (const w of [408, 720]) {
  try {
    const { element, width, height } = renderTutorDiagram(spec, w);
    const svg = renderToStaticMarkup(element);
    writeFileSync(`${out}/${name}-${w}-${phase}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${svg}`);
    lines.push(`${name}-${w} ${phase} ${Math.ceil(width)}x${Math.ceil(height)} aria="${(svg.match(/aria-label="([^"]*)"/) ?? [])[1]?.replace(/\s+/g, ' ').slice(0, 90)}"`);
  } catch (e) { lines.push(`${name}-${w} ${phase} ERR ${String(e.message).slice(0, 100)}`); }
}
console.log(lines.join('\n'));
