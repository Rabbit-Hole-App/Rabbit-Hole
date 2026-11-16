import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
const [root, out, phase] = process.argv.slice(2);
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
mkdirSync(out, { recursive: true });
const ref = [...lib.diagramReferences, ...lib.illustrationReferences].find(r => r.id === 'figure-recurrent-channel-decay');
const variants = { 'recurrent-channel-decay': ref.spec ?? ref.depths?.deep?.spec, 'recurrent-channel-decay-detailed': ref.depths?.deep?.spec };
const lines = [];
for (const [name, spec] of Object.entries(variants)) {
  if (!spec) { lines.push(name + ' no spec'); continue; }
  for (const w of [408, 720]) {
    const { element, width, height } = renderTutorDiagram(spec, w);
    writeFileSync(`${out}/${name}-${w}-${phase}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${renderToStaticMarkup(element)}`);
    lines.push(`${name}-${w} ${phase} ${Math.ceil(width)}x${Math.ceil(height)}`);
  }
}
console.log(lines.join('\n'));
