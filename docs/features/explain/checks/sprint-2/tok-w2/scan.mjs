import { writeFileSync } from 'node:fs';
const [root, out] = process.argv.slice(2);
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const groups = ['diagramReferences', 'illustrationReferences', 'transformerWalkthroughReferences', 'batch1FollowupReferences', 'estimationEvaluationReferences'];
const seen = new Map();
for (const g of groups) for (const ref of lib[g] ?? []) {
  const specs = [['spec', ref.spec], ['detailSpec', ref.detailSpec], ...Object.entries(ref.depths ?? {}).flatMap(([d, v]) => [[`${d}.spec`, v?.spec], [`${d}.detailSpec`, v?.detailSpec]])];
  for (const [path, spec] of specs) if (spec) { const key = `${ref.id}#${path}`; if (!seen.has(key)) seen.set(key, spec); }
}
const rows = [];
for (const [key, spec] of seen) {
  const json = JSON.stringify(spec);
  const tensor = /"tensor"|"kind":"tensor"/.test(json);
  let width = null, height = null, err = null;
  try { const r = renderTutorDiagram(spec, 408); width = Math.ceil(r.width); height = Math.ceil(r.height); } catch (e) { err = String(e.message).slice(0, 60); }
  rows.push({ key, tensor, width, height, err });
}
writeFileSync(out, JSON.stringify(rows));
console.log(rows.length, 'specs;', rows.filter(r => r.tensor).length, 'with a tensor;', rows.filter(r => r.tensor && r.width > 720).length, 'tensor figures over 720');
