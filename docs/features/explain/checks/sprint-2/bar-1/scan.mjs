import { writeFileSync } from 'node:fs';
const [root, out] = process.argv.slice(2);
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const { renderTutorDiagram } = await import(`${root}/packages/web/src/tutor-diagrams/TutorDiagram.js`);
const rows = [];
const seen = new Set();
const walk = (spec, id) => { const found = []; (function visit(o) { if (o && typeof o === 'object') { if (o.kind === 'bar-chart') found.push(o); for (const v of Object.values(o)) visit(v); } })(spec); return found; };
for (const g of ['diagramReferences', 'illustrationReferences', 'transformerWalkthroughReferences', 'batch1FollowupReferences', 'estimationEvaluationReferences']) for (const r of lib[g] ?? []) {
  const specs = [['spec', r.spec], ['detailSpec', r.detailSpec], ...Object.entries(r.depths ?? {}).flatMap(([d, v]) => [[`${d}.spec`, v?.spec], [`${d}.detailSpec`, v?.detailSpec]])];
  for (const [p, spec] of specs) { if (!spec) continue; const key = `${r.id}#${p}`; if (seen.has(key)) continue; seen.add(key);
    const bars = walk(spec); if (!bars.length) continue;
    let w = null, hgt = null; try { const x = renderTutorDiagram(spec, 408); w = Math.ceil(x.width); hgt = Math.ceil(x.height); } catch (e) { w = 'ERR'; }
    rows.push({ key, kinds: bars.map(b => b.variant ? (b.variant + (b.bars ? '-bars' : '')) : 'plain').join(','), n: bars.map(b => (b.bars ?? b.categories ?? []).length).join(','), w, hgt }); }
}
writeFileSync(out, JSON.stringify(rows));
console.log(rows.length, 'bar-chart specs');
