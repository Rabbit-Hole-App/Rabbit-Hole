// Read-only: G1 pool sizes. kind x depth. No network, no spend.
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
const root = 'C:/s/var-1';
const web = p => import('file:///' + root + '/packages/web/src/tutor-diagrams/' + p);
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { diagramReferences } = await web('reference-library.js');
const { singleDiagramReferences } = await web('reference-single-variants.js');
const { diagramBundle } = await cp('src/explanation-references.js');
const gallery = JSON.parse(readFileSync(root + '/packages/web/src/tutor-diagrams/kind-gallery.json', 'utf8'));
const galleryDepths = JSON.parse(readFileSync(root + '/packages/web/src/tutor-diagrams/kind-gallery-depths.json', 'utf8'));
const log = console.log; console.log = () => {};

const DEPTH_KEYS = { brief: 'overview', balanced: 'standard', detailed: 'deep' }; // explanation-references.js:95
const atLevel = (ref, level) => (ref.depths?.[level] ? { ...ref, ...ref.depths[level] } : ref); // explanation-references.js:111
const singleByPanel = new Map(singleDiagramReferences.map(s => [s.panelReferenceId, s]));
const composed = d => d.kind === 'panels' || (d.kind === 'comparison' && d.variant === 'panels') || (d.kind === 'transformation' && d.variant === 'visual');
const baseFlags = kind => diagramBundle({ references: [], requiredKinds: [kind] });
const FLAGS = ['quant', 'fresh', 'panels', 'states', 'tensor', 'tokenLinks', 'blockStack', 'blockStackPanels', 'compactPlots', 'tensorHosts', 'parallelPaths'];
const diffFlags = (a, b) => FLAGS.filter(f => JSON.stringify(a[f] ?? false) !== JSON.stringify(b[f] ?? false));
const kinds = ['flow', 'comparison', 'timeline', 'sequence', 'matrix', 'layers', 'cycle', 'figure', 'tree', 'relationship', 'transformation', 'argument', 'number-line', 'coordinate-plot', 'bar-chart', 't-account', 'waterfall', 'heatmap', 'sample-set', 'histogram', 'box-plot', 'tensor', 'token-links', 'block-stack'];

const out = { library: diagramReferences.length, excluded: { generalPrefix: 0, shapePrefix: 0 }, perDepth: {}, notes: [] };
const universe = diagramReferences.filter(r => !/^(?:shape|general)-/.test(r.id));
out.excluded.generalPrefix = diagramReferences.filter(r => r.id.startsWith('general-')).length;
out.excluded.shapePrefix = diagramReferences.filter(r => r.id.startsWith('shape-')).length;
out.withDepths = universe.filter(r => r.depths).length;
out.withVary = universe.filter(r => r.vary).length;
out.withSingleVariant = universe.filter(r => singleByPanel.has(r.id)).length;
const kindsSeen = new Set();
const lenOf = spec => JSON.stringify({ id: 'x'.repeat(30), spec }).length;
for (const [depth, level] of Object.entries(DEPTH_KEYS)) {
  const table = {}, reasons = {}, strictCount = {};
  let nullSpec = 0, composedNoSingle = 0, composedUsed = 0;
  const lengths = {};
  for (const ref of universe) {
    const m = atLevel(ref, level);
    if (!m.spec?.diagram) { nullSpec++; continue; }
    let spec = m.spec, via = 'strict';
    if (composed(spec.diagram)) {
      const s = singleByPanel.get(ref.id);
      if (!s) { composedNoSingle++; reasons.composed_no_single ??= []; reasons.composed_no_single.push(`${ref.id}:${spec.diagram.kind}/${spec.diagram.variant ?? ''}`); continue; }
      spec = s.spec; via = 'single';
      composedUsed++;
    }
    const kind = spec.diagram.kind; kindsSeen.add(kind);
    const bundle = diagramBundle({ references: [{ spec }], requiredKinds: [kind] }), base = baseFlags(kind), diff = diffFlags(bundle, base);
    const row = (table[kind] ??= { strictEligible: 0, singleEligible: 0, candidatesStrict: 0, candidatesSingle: 0, excludedBy: {}, ids: [], idsSingle: [] });
    if (via === 'strict') row.candidatesStrict++; else row.candidatesSingle++;
    if (diff.length) { for (const f of diff) row.excludedBy[f] = (row.excludedBy[f] ?? 0) + 1; (reasons[`bundle_change:${diff.join('+')}`] ??= []).push(`${ref.id}[${kind}${via === 'single' ? ' via -single' : ''}]`); continue; }
    if (via === 'strict') { row.strictEligible++; row.ids.push(ref.id); } else { row.singleEligible++; row.idsSingle.push(ref.id); }
    (lengths[kind] ??= []).push(lenOf(spec));
  }
  const summary = {};
  for (const [kind, r] of Object.entries(table)) { const L = (lengths[kind] ?? []).sort((a, b) => a - b); summary[kind] = { ...r, pool: r.strictEligible, poolWithSingleVariants: r.strictEligible + r.singleEligible, medianChars: L.length ? L[Math.floor(L.length / 2)] : null, maxChars: L.at(-1) ?? null, ids: undefined, idsSingle: undefined, idList: r.ids, idListSingle: r.idsSingle }; }
  out.perDepth[depth] = { level, summary, nullSpec, composedNoSingle, composedUsedViaSingle: composedUsed, reasonCounts: Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, v.length])), reasonIds: reasons };
}
out.kindsInLibrary = [...kindsSeen];
// gallery
out.gallery = Object.fromEntries(kinds.map(k => [k, { kindGallery: gallery.some(g => g.diagram.kind === k), kindGalleryDepths: galleryDepths.some(e => e.kind === k), depthsHave: galleryDepths.find(e => e.kind === k) ? Object.keys(galleryDepths.find(e => e.kind === k)).filter(x => x !== 'kind') : [] }]));
out.galleryExtraKinds = gallery.map(g => g.diagram.kind).filter(k => !kinds.includes(k));
out.kinds = kinds;
// how many pool refs are two-panel references in the SAME library but whose depth spec flips composed<->single between levels
console.log = log;
writeFileSync('C:/s/gen1-prep/g1.json', JSON.stringify(out, null, 1));
log('ok', out.library, out.excluded, out.withDepths, out.withVary, out.withSingleVariant);
