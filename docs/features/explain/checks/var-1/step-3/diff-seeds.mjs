// VAR-1 step 3 evidence: the same fixture reference drawn with two request seeds. Lists the paths that changed (and says what each is: a varied input, a derived number, a token label)
// and counts those that did not (structure, labels, axes). Offline, no provider call.   usage: node diff-seeds.mjs <treeRoot> [seedA] [seedB]
const [root = 'C:/s/var-1', seedA = 'request-aaaa', seedB = 'request-bbbb'] = process.argv.slice(2);
const web = p => import(`file:///${root}/packages/web/src/tutor-diagrams/${p}`);
const { varySpec, varyProblems } = await web('vary.js');
const { parseTutorDiagram } = await web('spec.js');
const { derivedPaths } = await web('derived.js');

const plot = { id: 'fixture-mean-baseline', useWhen: 'Show the constant mean prediction against a small set of targets.', vary: Object.fromEntries([0, 1, 2, 3, 4].map(i => [`series.0.points.${i}.y`, [0, 8, 1]])),
  spec: { version: 1, diagram: { kind: 'coordinate-plot', title: 'A constant mean baseline', x: { label: 'Sample', min: 1, max: 5, scale: 'linear' }, y: { label: 'Target', min: 0, max: 8 },
    series: [{ label: 'Targets', kind: 'scatter', points: [1, 4, 2, 5, 3].map((y, i) => ({ x: i + 1, y })) }],
    annotations: [{ kind: 'reference-line', axis: 'y', derive: 'series.0:mean', label: 'Mean prediction of {{d:annotations.0.value}}' }], caption: 'Illustrative values.' } } };
const box = { id: 'fixture-box', useWhen: 'Spread of one group.', vary: { 'boxes.0.q1': [4, 8, 1], 'boxes.0.median': [6, 12, 1, 'boxes.0.q1'], 'boxes.0.q3': [9, 14, 1, 'boxes.0.median'] },
  spec: { version: 1, diagram: { kind: 'box-plot', title: 'Spread', x: { label: 'Minutes', min: 0, max: 24 }, boxes: [{ label: 'Group', whiskerLow: 2, q1: 6, median: 8, q3: 12, whiskerHigh: 15 }] } } };

const flat = (value, path = []) => (value !== null && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => flat(v, [...path, k])) : [[path.join('.'), value]]);
const out = [];
for (const ref of [plot, box]) {
  const a = varySpec(ref.spec, ref.vary, seedA, ref.id), b = varySpec(ref.spec, ref.vary, seedB, ref.id);
  const fa = new Map(flat(a.diagram)), fb = new Map(flat(b.diagram)), fw = new Map(flat(ref.spec.diagram));
  const derived = new Set(derivedPaths(parseTutorDiagram(a).diagram));
  const paths = [...new Set([...fa.keys(), ...fb.keys()])];
  const changed = paths.filter(p => fa.get(p) !== fb.get(p));
  const kind = p => (Object.hasOwn(ref.vary, p) ? 'varied input' : derived.has(p) || /^boxes\.\d+\.fences/.test(p) ? 'derived number' : typeof fw.get(p) === 'string' && /\{\{d:/.test(fw.get(p)) ? 'token label' : 'UNEXPECTED');
  const rows = changed.map(p => ({ path: p, kind: kind(p), [seedA]: fa.get(p), [seedB]: fb.get(p) }));
  const unexpected = rows.filter(r => r.kind === 'UNEXPECTED');
  console.log(`\n== ${ref.id}  (seeds ${seedA} / ${seedB})  lint: ${varyProblems(ref).length ? varyProblems(ref).join('; ') : 'passes'}`);
  console.log(`unchanged paths: ${paths.length - changed.length} of ${paths.length} (structure, axes, labels, caption, titles)`);
  console.log(`changed paths: ${changed.length}`);
  for (const r of rows) console.log(`  ${r.kind.padEnd(14)} ${r.path.padEnd(34)} ${String(r[seedA]).padEnd(26)} -> ${r[seedB]}`);
  console.log(`unexpected changes (a path that is neither input, derived nor token label): ${unexpected.length}`);
  out.push({ id: ref.id, changed: changed.length, unchanged: paths.length - changed.length, unexpected: unexpected.length });
  const written = [...fw.keys()].filter(p => Object.hasOwn(ref.vary, p)).every(p => typeof fw.get(p) === 'number');
  if (!written) throw new Error('a vary path is not a number');
}
if (out.some(r => r.unexpected)) process.exit(1);
