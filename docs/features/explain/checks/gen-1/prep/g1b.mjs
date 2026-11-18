// Read-only: do the gallery examples (kind-gallery.json, kind-gallery-depths.json) change the schema bundle of their kind? And seededRandom determinism.
import { readFileSync } from 'node:fs';
const root = 'C:/s/var-1';
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { diagramBundle } = await cp('src/explanation-references.js');
const { planShape } = await cp('src/explanation-planner.js');
const { seededRandom } = await import('file:///' + root + '/packages/web/src/tutor-diagrams/random.js');
const dir = root + '/packages/web/src/tutor-diagrams/';
const gallery = JSON.parse(readFileSync(dir + 'kind-gallery.json', 'utf8')), depths = JSON.parse(readFileSync(dir + 'kind-gallery-depths.json', 'utf8'));
const FLAGS = ['quant', 'fresh', 'panels', 'states', 'tensor', 'tokenLinks', 'blockStack', 'blockStackPanels', 'compactPlots', 'tensorHosts', 'parallelPaths'];
const diff = (a, b) => FLAGS.filter(f => JSON.stringify(a[f] ?? false) !== JSON.stringify(b[f] ?? false));
const out = { gallery: {}, depths: {}, tokenBudget: null };
const log = console.log; console.log = () => {};
for (const g of gallery) { const k = g.diagram.kind; if (k === 'panels') continue; out.gallery[k] = diff(diagramBundle({ references: [{ spec: g }], requiredKinds: [k] }), diagramBundle({ references: [], requiredKinds: [k] })); }
for (const e of depths) for (const lvl of ['overview', 'standard', 'deep']) { const k = e.kind; if (k === 'panels') continue; const d = diagramBundle({ references: [{ spec: e[lvl] }], requiredKinds: [k] }), b = diagramBundle({ references: [], requiredKinds: [k] }); const x = diff(d, b); if (x.length) out.depths[`${k}@${lvl}`] = x; if (e[lvl].diagram.kind !== k) out.depths[`${k}@${lvl}:kindMismatch`] = e[lvl].diagram.kind; }
// planShape via the real function, brief/balanced/detailed
out.planShapeKinds = {}; for (const k of gallery.map(g => g.diagram.kind)) { out.planShapeKinds[k] = ['brief', 'balanced', 'detailed'].map(d => { const s = planShape({ kind: k }, d); return s ? s.spec.diagram.kind : null; }); }
console.log = log;
const a = seededRandom('seed-a:examples'), b = seededRandom('seed-a:examples'), c = seededRandom('seed-a:kind'), d = seededRandom('seed-a|learning-curves');
out.rng = { sameSeedTwice: [a(), a(), a()].map(x => +x.toFixed(10)), again: [b(), b(), b()].map(x => +x.toFixed(10)), kindStream: [c(), c()].map(x => +x.toFixed(10)), varyStyleStream: [d(), d()].map(x => +x.toFixed(10)) };
// distribution sanity: 20000 draws of the first value over uuid-like seeds
let buckets = new Array(10).fill(0); for (let i = 0; i < 20000; i++) { buckets[Math.floor(seededRandom(`${i}-uuid:examples`)() * 10)]++; } out.rng.firstDrawDecileCounts = buckets;
log(JSON.stringify(out, null, 1));
