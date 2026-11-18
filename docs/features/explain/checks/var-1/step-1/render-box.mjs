// Usage: node render-box.mjs <worktree root> <out.svg>: renders the kind gallery's box-plot spec at 408 with that tree's renderer.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [root, out] = process.argv.slice(2);
const at = path => import(pathToFileURL(resolve(root, 'packages/web', path)).href);
const { renderToStaticMarkup } = await import(pathToFileURL(resolve(root, 'node_modules/react-dom/server.js')).href).catch(() => import('react-dom/server'));
const { default: gallery } = await import(pathToFileURL(resolve(root, 'packages/web/src/tutor-diagrams/kind-gallery.json')).href, { with: { type: 'json' } });
const { renderTutorDiagram } = await at('src/tutor-diagrams/TutorDiagram.js');
const spec = gallery.find(s => s.diagram.kind === 'box-plot');
const { element, width, height } = renderTutorDiagram(spec, 408);
writeFileSync(out, renderToStaticMarkup(element));
console.log(out, width, height);
