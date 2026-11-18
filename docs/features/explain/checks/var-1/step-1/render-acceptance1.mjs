// Amendment 2026-11-18, acceptance 1 on the amended tree: the same box, fences omitted. usage: node render-acceptance1.mjs <worktree root>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const at = p => import(pathToFileURL(`${root}/packages/web/${p}`).href);
const { renderToStaticMarkup } = await import('react-dom/server');
const { renderTutorDiagram } = await at('src/tutor-diagrams/TutorDiagram.js');
const box = extra => ({ version: 1, diagram: { kind: 'box-plot', title: 'IQR rule', x: { label: 'Reading', min: 0, max: 25 }, boxes: [{ label: 'Trial', whiskerLow: 4, q1: 6, median: 9, q3: 12, whiskerHigh: 14, ...extra }] } });
for (const [name, spec] of [['plain', box()], ['outlier-fences-omitted', box({ outliers: [{ label: 'Late', value: 22 }] })], ['fences-written', box({ fences: { lower: -3, upper: 21 } })]]) {
  const svg = renderToStaticMarkup(renderTutorDiagram(spec, 408).element);
  writeFileSync(`acceptance1-${name}.svg`, svg);
  console.log(name.padEnd(24), 'Lower fence text:', /Lower fence: -3; Upper fence: 21/.test(svg), '| bytes', svg.length);
}
