import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [root, label] = process.argv.slice(2);
const { geometryChecker } = await import('file:///C:/s/sprint2-flow/scripts/topic-pipeline/checks/geometry-lint.mjs');
const load = file => import(pathToFileURL(resolve(root, file)).href);
const check = await geometryChecker(load, root);
const lib = await import(pathToFileURL(resolve(root, 'packages/web/src/tutor-diagrams/reference-library.js')).href);
const all = [...lib.diagramReferences, ...lib.illustrationReferences];
for (const id of ['ml-moe-top-two-experts', 'ml-gpu-matmul', 'figure-grouped-query-heads']) {
  const r = all.find(r => r.id === id); const spec = r.spec ?? r.depths?.deep?.spec;
  const flags = check.lintSpec(spec);
  console.log(label, id, 'lint flags:', flags.length);
  for (const f of flags) console.log('  ', JSON.stringify(f).slice(0, 260));
}
