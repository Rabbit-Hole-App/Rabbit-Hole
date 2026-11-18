// VAR-1 step 4, round 3 evidence (the three new references and the re-run of the two amended round-2 references) (offline, no provider call). For each varied library reference: lint, two-seed render (SVG at 408) + table of changed paths, and 20 seeds checked
// (parse, render at 320/408/720, bands, the reference's own pattern). usage: node round3.mjs [treeRoot] [outDir]
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
const [root = 'C:/s/var-1', out = 'C:/s/film-evidence/docs/features/explain/checks/var-1/step-4/round-3'] = process.argv.slice(2);
const web = p => import(`file:///${root}/packages/web/src/tutor-diagrams/${p}`);
const { diagramReferences } = await web('reference-library.js'), { varySpec, varyProblems } = await web('vary.js'), { parseTutorDiagram } = await web('spec.js'), { renderTutorDiagram } = await web('TutorDiagram.js'), { derivedPaths } = await web('derived.js');
const SEEDS = Array.from({ length: 20 }, (_, i) => `request-${i}`), A = SEEDS[0], B = SEEDS[1];
const pts = (d, s) => d.series[s].points;
const rising = a => a.every((v, i) => i === 0 || v > a[i - 1]), falling = a => a.every((v, i) => i === 0 || v < a[i - 1]);
// The pattern each reference teaches (hand-written here from the reference's own text; not product code).
const vals = (d, s) => d.series[s].values, noDrop = a => a.every((v, i) => i === 0 || v <= a[i - 1]);
const pattern = {
  'class-weighted-loss': d => { const u = vals(d, 0), w = vals(d, 1); return (u[0] === 1 && u[1] === 1 && w[0] === 1 && w[1] >= 2 && Number.isInteger(w[1])) || 'raw losses stay 1 and 1, common weighted 1, rare weighted a whole number >= 2'; },
  'permutation-feature-importance': d => [0, 1].every(s => { const v = vals(d, s); return v[0] > v[1] && v[1] > v[2] && Math.abs(v[2]) <= 0.02 + 1e-9; }) || 'A > B > C in each shuffle, C near zero',
  'feature-selection-stability': d => [0, 1].every(s => { const v = vals(d, s); return v.every(x => x >= 0 && x <= 1) && v[0] > v[1] && v[1] > v[2]; }) || 'fractions in [0, 1], A > B > C under both selectors',
  'ensemble-votes': d => { const h = vals(d, 0), w = vals(d, 1); return (h.every(Number.isInteger) && h[0] > h[1] && h[1] > h[2] && w[0] > w[1] && w[1] > w[2] && w[0] <= h[0] + 1e-9 && w[2] <= h[2] + 1e-9) || 'whole hard votes A > B > C; weighted A > B > C; weighted <= hard for classes A and C'; },
  'boosting-signed-corrections': d => { const i = vals(d, 0), f = vals(d, 1), s = vals(d, 2); return (i.every(x => x === 3) && f[0] > 0 && f[1] < 0 && f[2] > 0 && s[0] < 0 && s[1] < 0 && s[2] > 0 && s.every((x, k) => Math.abs(x) <= Math.abs(f[k]) + 1e-9)) || 'initial stays 3, correction signs hold, |second| <= |first| per sample'; },
};
const flat = (v, path = []) => (v !== null && typeof v === 'object' ? Object.entries(v).flatMap(([k, c]) => flat(c, [...path, k])) : [[path.join('.'), v]]);
const lines = [], summary = [];
const ROUND = Object.keys(pattern), refs = diagramReferences.filter(r => r.vary && ROUND.includes(r.id));
for (const ref of refs) {
  const lint = varyProblems(ref);
  const specA = varySpec(ref.spec, ref.vary, A, ref.id), specB = varySpec(ref.spec, ref.vary, B, ref.id);
  for (const [tag, spec] of [['written', ref.spec], ['seedA', specA], ['seedB', specB]]) fs.writeFileSync(`${out}/${ref.id}-${tag}.svg`, renderToStaticMarkup(renderTutorDiagram(spec, 408).element).replace(/^/, ''));
  const fa = new Map(flat(specA.diagram)), fb = new Map(flat(specB.diagram)), fw = new Map(flat(ref.spec.diagram));
  const paths = [...new Set([...fa.keys(), ...fb.keys()])], changed = paths.filter(p => fa.get(p) !== fb.get(p));
  const unexpected = changed.filter(p => !Object.hasOwn(ref.vary, p));
  lines.push(`\n== ${ref.id}  lint: ${lint.length ? lint.join('; ') : 'passes'}  (${Object.keys(ref.vary).length} varied paths; derived fields: ${derivedPaths(parseTutorDiagram(specA).diagram).length})`);
  lines.push(`seeds ${A} / ${B}: unchanged paths ${paths.length - changed.length} of ${paths.length} (structure, axes, titles, labels, captions); changed ${changed.length}; unexpected (changed but not a varied path) ${unexpected.length}`);
  lines.push('  path'.padEnd(34) + 'written'.padEnd(10) + 'seedA'.padEnd(10) + 'seedB');
  for (const p of Object.keys(ref.vary)) lines.push('  ' + p.padEnd(32) + String(fw.get(p)).padEnd(10) + String(fa.get(p)).padEnd(10) + fb.get(p) + (fa.get(p) === fb.get(p) ? '  (same in both seeds)' : ''));
  const failures = [];
  const variants = [[ref.id, ref], ...Object.entries(ref.depths ?? {}).map(([k, e]) => [`${ref.id} (${k})`, { ...ref, ...e }])];
  let written = null, differing = new Set();
  for (const [name, v] of variants) {
    for (const seed of SEEDS) {
      let spec;
      try { spec = varySpec(v.spec, v.vary, seed, v.id); parseTutorDiagram(spec); for (const w of [320, 408, 720]) if (renderToStaticMarkup(renderTutorDiagram(spec, w).element).length < 200) throw new Error(`no drawing at ${w}`); }
      catch (e) { failures.push(`${name}, ${seed}: ${e.message.split('\n')[0]}`); continue; }
      const p = pattern[ref.id]?.(spec.diagram); if (p !== true) failures.push(`${name}, ${seed}: pattern: ${p}`);
      if (name === ref.id) differing.add(JSON.stringify(Object.keys(ref.vary).map(k => flat(spec.diagram).find(([q]) => q === k)[1])));
    }
  }
  // the encoder reference only: how often B is NOT lower than A at step 1 (the text claims no winner; informational)
  let info = '';
  if (ref.id === 'ml-stable-diffusion-encoder-evaluation') { let n = 0; for (const seed of SEEDS) { const d = varySpec(ref.spec, ref.vary, seed, ref.id).diagram; if (false) n++; } info = `; B error >= A error at step 1 in ${n} of 20 seeds (the text claims no winner)`; }
  lines.push(`20 seeds x ${variants.length} spec(s): parse + draw at 320/408/720 + pattern: ${failures.length ? failures.length + ' FAILURES' : 'all pass'}; ${differing.size} distinct draws in 20 seeds${info}`);
  for (const f of failures) lines.push('  FAIL ' + f);
  summary.push({ id: ref.id, lint: lint.length, paths: Object.keys(ref.vary).length, changed: changed.length, unexpected: unexpected.length, failures: failures.length, distinct: differing.size });
}
lines.push('\nSUMMARY\n' + summary.map(s => JSON.stringify(s)).join('\n'));
fs.writeFileSync(`${out}/two-seed-and-20-seeds.txt`, lines.join('\n') + '\n');
console.log(lines.join('\n'));
if (summary.some(s => s.lint || s.unexpected || s.failures)) process.exit(1);
