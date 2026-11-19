// GEN-1 G1 (R2, not wired in yet): three worked examples of a kind from the library, drawn by the request's seed. A pure function of (kind, depth, seed): no I/O, nothing imported by
// production code until R2 wires it. Pool = library references whose OWN spec at the card's depth is a single diagram of that kind (a two-panel reference is not counted here: its
// one-diagram variant is not depth-specific), minus general-* and shape-* ids and any reference that would change the schema bundle chosen for the kind (tensor payloads,
// compact plots, parallel paths, panels, visual states, token-links or block-stack payloads the kind itself does not need): the bundle test is the code's own diagramBundle.
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import { seededRandom } from '../../web/src/tutor-diagrams/random.js';
import { DEFAULT_DEPTH, validDepth } from './chat-depth.js';
import { diagramBundle, sampledSpec } from './explanation-references.js';
import { planShape } from './explanation-planner.js';

export const EXAMPLES_WANTED = 3;
const DEPTH_KEYS = { brief: 'overview', balanced: 'standard', detailed: 'deep' };
const FLAGS = ['quant', 'fresh', 'panels', 'states', 'tensor', 'tokenLinks', 'blockStack', 'blockStackPanels', 'compactPlots', 'tensorHosts', 'parallelPaths'];
const MAX_CONTEXT = 14_000, CONTEXT_START = 600; // explanation-references.js: the block's own start and its character limit

const atLevel = (ref, level) => (ref.depths?.[level] ? { ...ref, ...ref.depths[level] } : ref);
const composed = d => d.kind === 'panels' || (d.kind === 'comparison' && d.variant === 'panels') || (d.kind === 'transformation' && d.variant === 'visual');
const flagsOf = kind => diagramBundle({ references: [], requiredKinds: [kind] });
const changesBundle = (spec, kind, base) => { const bundle = diagramBundle({ references: [{ spec }], requiredKinds: [kind] }); return FLAGS.some(f => JSON.stringify(bundle[f] ?? false) !== JSON.stringify(base[f] ?? false)); };

const pools = new Map(); // `${level}` -> Map(kind -> [atLevel references]); built on first use, in library order
function poolsAt(level) {
  if (pools.has(level)) return pools.get(level);
  const byKind = new Map(), bases = new Map();
  for (const ref of diagramReferences) {
    if (/^(?:shape|general)-/.test(ref.id)) continue;
    const merged = atLevel(ref, level), diagram = merged.spec?.diagram;
    if (!diagram || composed(diagram)) continue;
    if (!bases.has(diagram.kind)) bases.set(diagram.kind, flagsOf(diagram.kind));
    if (changesBundle(merged.spec, diagram.kind, bases.get(diagram.kind))) continue;
    if (!byKind.has(diagram.kind)) byKind.set(diagram.kind, []);
    byKind.get(diagram.kind).push(merged);
  }
  pools.set(level, byKind);
  return byKind;
}

export const examplePoolSize = (kind, depth) => (poolsAt(DEPTH_KEYS[validDepth(depth) || DEFAULT_DEPTH]).get(kind) ?? []).length;

// -> { examples: [{ id, spec }], pool, galleryFilled, short }. examples are { id, spec } only (no useWhen, no detailSpec); `vary` is applied as the request path does (sampledSpec).
// A pool of fewer than three is filled with the kind's gallery example, which is ONE spec per kind and depth, so a card gets pool + 1 at most: `short` says it got fewer than three.
// An example that would push the block past MAX_CONTEXT is skipped for the next drawn one, as selectWithSteer does.
export function exampleReferences(kind, depth, seed) {
  const level = DEPTH_KEYS[validDepth(depth) || DEFAULT_DEPTH], pool = poolsAt(level).get(kind) ?? [];
  const order = pool.map((_, i) => i), random = seededRandom(`${seed}:examples`);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const examples = [];
  let chars = CONTEXT_START;
  for (const i of order) {
    if (examples.length === EXAMPLES_WANTED) break;
    const ref = pool[i], example = { id: ref.id, spec: parseTutorDiagram(sampledSpec(ref, seed)) }, length = JSON.stringify(example).length;
    if (chars + length > MAX_CONTEXT) continue;
    examples.push(example);
    chars += length;
  }
  let galleryFilled = false;
  if (examples.length < EXAMPLES_WANTED) {
    const shape = planShape({ kind }, depth);
    if (shape && chars + JSON.stringify({ id: shape.id, spec: shape.spec }).length <= MAX_CONTEXT) { examples.push({ id: shape.id, spec: shape.spec }); galleryFilled = true; }
  }
  return { examples, pool: pool.length, galleryFilled, short: examples.length < EXAMPLES_WANTED };
}
