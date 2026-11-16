import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
const root = process.argv[2];
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const out = [];
for (const r of [...lib.diagramReferences, ...lib.illustrationReferences]) { const specs = [r.spec, r.detailSpec, ...Object.values(r.depths ?? {}).flatMap(d => [d?.spec, d?.detailSpec])].filter(Boolean); specs.forEach((s, i) => { try { out.push(r.id + '#' + i + ' ' + createHash('sha1').update(renderToStaticMarkup(renderTutorDiagram(s, 408).element)).digest('hex').slice(0, 10)); } catch { } }); }
console.log(out.join('\n'));
