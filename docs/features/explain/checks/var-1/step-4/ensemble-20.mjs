import { pathToFileURL } from 'node:url';
const imp = f => import(pathToFileURL('C:/s/var-1/packages/web/src/tutor-diagrams/' + f).href);
const { diagramReferences } = await imp('reference-library.js');
const { varySpec } = await imp('vary.js');
const ref = diagramReferences.find(r => r.id === 'ensemble-votes');
const lines = ['| seed | hard votes A,B,C | weighted votes A,B,C | weighted <= hard (all three) | order A>B>C both |', '|---|---|---|---|---|'];
let ok = 0;
for (let i = 0; i < 20; i++) {
  const spec = varySpec(ref.spec, ref.vary, `request-${i}`, ref.id), h = spec.diagram.series[0].values, w = spec.diagram.series[1].values;
  const le = w.every((x, k) => x <= h[k] + 1e-9), ord = h[0] > h[1] && h[1] > h[2] && w[0] > w[1] && w[1] > w[2];
  if (le && ord) ok++;
  lines.push(`| request-${i} | ${h.join(', ')} | ${w.join(', ')} | ${le} | ${ord} |`);
}
const asWritten = ref.spec.diagram.series.map(s => s.values.join(', '));
console.log('# ensemble-votes, 20 seeds (REF-1 + class B band)\n\nReference as written: hard ' + asWritten[0] + ' | weighted ' + asWritten[1] + '\nBand map: ' + JSON.stringify(ref.vary) + '\n\n' + lines.join('\n') + '\n\n' + ok + ' of 20 seeds keep weighted <= hard for all three classes and both orders.');
