import { writeFileSync, mkdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
const [root, out, phase] = process.argv.slice(2);
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
mkdirSync(out, { recursive: true });
const all = [...lib.diagramReferences, ...lib.illustrationReferences];
const lines = [];
for (const [id, short] of [['bayes-class-token-counts', 'bayes-class-token-counts']]) {
  const ref = all.find(r => r.id === id); const spec = ref.spec ?? ref.depths?.deep?.spec;
  for (const w of [408, 720]) {
    const { element, width, height } = renderTutorDiagram(spec, w);
    writeFileSync(`${out}/${short}-${w}-${phase}.html`, `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#fff}</style>${renderToStaticMarkup(element)}`);
    lines.push(`${short}-${w} ${phase} ${Math.ceil(width)}x${Math.ceil(height)}`);
  }
}
console.log(lines.join('\n'));
