import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import kindGallery from './src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { diagramReferences } from './src/tutor-diagrams/reference-library.js';
import { renderTutorDiagram } from './src/tutor-diagrams/TutorDiagram.js';
const out = {};
for (const { id, spec } of [...kindGallery.map(entry => ({ id: `shape-${entry.diagram.kind}`, spec: entry })), ...diagramReferences.map(({ id, spec }) => ({ id, spec }))]) {
  try { out[id] = renderToStaticMarkup(renderTutorDiagram(spec, 408).element); } catch (error) { out[id] = 'ERROR ' + error.message; }
}
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(Object.keys(out).length, 'rendered', Object.values(out).filter(v => v.startsWith('ERROR')).length, 'errors');
