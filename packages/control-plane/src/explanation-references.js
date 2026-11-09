import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import kindGallery from '../../web/src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { singleDiagramReferences } from '../../web/src/tutor-diagrams/reference-single-variants.js';
import { usesNodeTensors, usesParallelPaths, usesTensorItems } from '../../web/src/tutor-diagrams/illustration-kinds.js';

const MAX_REFERENCES = 2;
const MAX_CONTEXT = 14_000;
const normalized = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const shapesByKind = new Map(kindGallery.map(spec => [spec.diagram.kind, spec]));
const legacyShapeKinds = [...new Set(diagramReferences.filter(ref => ref.id.startsWith('general-')).map(ref => ref.spec.diagram.kind))];

// Codex's learner-word fallback (set 1-7): the kind the learner's own words name ("show a sequence diagram", "the water cycle"). Used ONLY when no planner kind is
// available (the planner timed out, failed or is off; learn-artifact.js passes shapeFallback: false when a plan exists, because then the gallery example comes
// from the planner's chosen kind, explanation-planner.js planShape).
export function fallbackKind(prompt) {
  const query = normalized(String(prompt).slice(0, 4000));
  const named = query.replace(/^please /, '')
    .replace(/^(?:explain|show|draw|make|create|use)(?: me)? /, '')
    .replace(/^(?:a|an|the|one) /, '')
    .replace(/ (?:diagram|example)$/, '');
  return [...shapesByKind.keys()].find(kind => normalized(kind) === named) ??
    legacyShapeKinds.find(kind => matches(query, normalized(kind)));
}

function shapeExamples(prompt, required) {
  const kinds = required.size ? [...required] : [fallbackKind(prompt)];
  return kinds.filter(kind => shapesByKind.has(kind)).slice(0, MAX_REFERENCES).map(kind => ({
    id: `shape-${kind}`,
    useWhen: 'Use this neutral shape to structure the learner’s own content.',
    spec: parseTutorDiagram(shapesByKind.get(kind)),
  }));
}
function matches(haystack, phrase) {
  const forms = new Set([phrase, `${phrase}s`, `${phrase}es`]);
  if (phrase.endsWith('y')) forms.add(`${phrase.slice(0, -1)}ies`);
  if (phrase.endsWith('ies')) forms.add(`${phrase.slice(0, -3)}y`);
  if (phrase.endsWith('s') && !phrase.endsWith('ss')) forms.add(phrase.slice(0, -1));
  if (phrase.endsWith('es')) forms.add(phrase.slice(0, -2));
  return [...forms].some(form => (` ${haystack} `).includes(` ${form} `));
}

function topicScore(query, reference) {
  const keys = new Set(reference.keywords.map(normalized).filter(Boolean));
  let score = 0;
  for (const key of keys) {
    if (matches(query, key)) score += Math.min(12, 2 + key.split(' ').length * 2);
  }
  // An ordinary question matching one of the documented acceptance prompts is
  // stronger evidence than a generic keyword in the attached lesson.
  if (reference.prompts.some(prompt => normalized(prompt) === query)) score += 50;
  return score;
}

function contextText(context) {
  if (typeof context === 'string') return context.slice(0, 6000);
  if (context == null) return '';
  try { return JSON.stringify(context).slice(0, 6000); } catch { return ''; }
}

// Required visuals still validate against their top-level kind. When a useful
// reference is a composition, give the author its matching real leaf examples
// rather than a wrapper that would fail that requirement. Conceptual requests
// continue to receive the complete comparison/transformation.
function referenceVariants(ref, required) {
  const diagram = ref.spec.diagram;
  if (!required.size || required.has(diagram.kind)) return [ref];
  const parts = diagram.kind === 'comparison' && diagram.variant === 'panels' ? diagram.panels
    : diagram.kind === 'transformation' && diagram.variant === 'visual' ? [diagram.before, diagram.after] : [];
  return parts.flatMap((part, partIndex) => required.has(part.diagram.kind) ? [{
    ...ref, id: `${ref.id}--part-${partIndex + 1}`, sourceId: ref.id, partIndex,
    useWhen: `${ref.useWhen} This is the ${part.heading ?? part.label} panel. Use its ${part.diagram.kind} kind directly when that kind is required.`,
    spec: { version: ref.spec.version, diagram: part.diagram },
  }] : []);
}

const DEPTH_KEYS = { brief: 'overview', balanced: 'standard', detailed: 'deep' };
export function selectDiagramReferences({ prompt = '', context = '', requiredKinds = [], shapeFallback = true, depth = 'standard' } = {}) {
  const query = normalized(String(prompt).slice(0, 4000));
  const source = normalized(contextText(context));
  const required = new Set(requiredKinds.filter(kind => typeof kind === 'string'));
  const level = DEPTH_KEYS[depth] ?? depth; // the references' depth variants are keyed overview / standard / deep; the renamed levels (brief / balanced / detailed) map to them
  const candidates = diagramReferences.flatMap(ref => referenceVariants(
    ref.depths?.[level] ? { ...ref, ...ref.depths[level] } : ref, required));
  const ranked = candidates.map((ref, index) => ({
    ref, index, direct: topicScore(query, ref), source: topicScore(source, ref),
  }));
  const direct = ranked.filter(item => item.direct > 0);
  // Context can resolve a broad "explain this" request, but cannot replace a
  // concrete question with a different topic from a large attached document.
  const refersToContext = !query || /\b(?:this|that|these|lesson|document|material|above|attached|it)\b/.test(query);
  // A required kind does not imply a topical match. In particular, never use
  // the first binary-operation example for an unfamiliar ordinary hierarchy.
  const pool = direct.length ? direct : refersToContext ? ranked.filter(item => item.source > 0) : [];
  pool.sort((a, b) => (b.direct - a.direct) || (b.source - a.source) || a.index - b.index);
  const picked = [];
  let chars = 600;
  for (const { ref } of pool) {
    const spec = parseTutorDiagram(ref.spec);
    const compact = { id: ref.id, useWhen: ref.useWhen, spec,
      ...(ref.detailSpec ? { detailSpec: parseTutorDiagram(ref.detailSpec) } : {}),
      ...(ref.sourceId ? { sourceId: ref.sourceId, partIndex: ref.partIndex } : {}) };
    const length = JSON.stringify(compact).length;
    if (chars + length > MAX_CONTEXT) continue;
    picked.push(compact);
    chars += length;
    if (picked.length === MAX_REFERENCES) break;
  }
  return picked.length || !shapeFallback ? picked : shapeExamples(prompt, required);
}

// Owner 2026-11-08 (Codex set 3): a selected two-panel reference (comparison panels, visual transformation) is sent as its one-diagram `-single` variant (about half the
// tokens), unless the planner's kind is comparison or transformation (the comparison is then the point) or the learner required that panel kind. The variant shares the
// panel's keywords, so selection and its bench are unchanged: the swap happens after the pick. A leaf excerpt (sourceId) is never swapped.
const singleByPanel = new Map(singleDiagramReferences.map(single => [single.panelReferenceId, single]));
export function preferSingleVariants(references, { plannedKind = null, requiredKinds = [] } = {}) {
  if (plannedKind === 'comparison' || plannedKind === 'transformation') return references;
  return references.map(ref => {
    const single = ref.sourceId ? null : singleByPanel.get(ref.id);
    return !single || requiredKinds.includes(ref.spec.diagram.kind) ? ref : { id: single.id, useWhen: single.useWhen, spec: parseTutorDiagram(single.spec) };
  });
}

// The start of the reference block in a system prompt; the fast chain moves the block to the end of its system message (assembledSystem).
export const REFERENCE_MARK = '\nApproved diagram references';
export function diagramReferenceContext(references) {
  if (!references.length) return '';
  // Owner N1 (2026-11-08): numbers follow the one number rule in ARTIFACT_SYSTEM (agents/learn-artifact.js); this block carries no second wording of it.
  const heading = '\nApproved diagram references (examples, not source facts). Use their supported structure and layout when appropriate. Adapt labels and relationships to the learner\'s question. Do not copy example prose, force a reference, or exceed this card\'s visual count.\n';
  let out = heading;
  if (references.some(ref => ref.detailSpec)) {
    out += 'If you use a detailSpec, write it as a separate visual. If a block points to it, set that block’s detail index to the visual’s position on the card.\n';
  }
  for (const ref of references.slice(0, MAX_REFERENCES + 1)) { // the planner's shape example may come first (explanation-planner.js), then at most two topical ones
    const line = JSON.stringify({ id: ref.id, useWhen: ref.useWhen, spec: ref.spec,
      ...(ref.detailSpec ? { detailSpec: ref.detailSpec } : {}) }) + '\n';
    if (out.length + line.length <= MAX_CONTEXT) out += line;
  }
  return out === heading ? '' : out;
}

// Schema bundles for the fast chain (owner A1, 2026-11-08): the whole 21-kind diagram schema is ~87k characters, and Fireworks counts it as input
// (27,599 prompt tokens, 6.7 s, against 6,702 and 2.45 s before Phase 02). Every request gets the CORE kinds (comparison and transformation in their list
// forms) plus a picture; QUANT, NEW, comparison panels and visual transformations (each child a leaf diagram; ~16k characters per child union, so the
// two composed forms are separate flags) are added only when a selected reference or a required visual steers to them. A fixed rule over flags,
// never a per-request schema, so each bundle serializes to the same bytes and a provider's prefix cache stays warm. The validator still accepts every kind.
export const CORE_KINDS = ['flow', 'comparison', 'tree', 'sequence', 'cycle', 'relationship', 'transformation', 'layers', 'timeline'];
export const QUANT_KINDS = ['coordinate-plot', 'bar-chart', 'number-line', 't-account', 'waterfall', 'matrix', 'argument', 'figure'];
export const NEW_KINDS = ['heatmap', 'sample-set', 'histogram', 'box-plot'];
const childDiagram = s => (s?.anyOf ?? s?.oneOf)?.some(b => b?.properties?.diagram);
const optionsOf = shape => shape.anyOf ?? shape.oneOf;
const diagramKindOf = shape => shape.properties?.kind?.const;
// A comparison or transformation schema branch in its list form only: no panels, shared axes, visual states or identity (the visual variant's own fields).
export const listForm = branch => {
  const { variant, panels, sharedAxes, identity, ...properties } = branch.properties;
  for (const side of ['before', 'after']) if (childDiagram(properties[side])) properties[side] = (properties[side].anyOf ?? properties[side].oneOf).find(b => !b.properties?.diagram);
  return { ...branch, properties };
};
export function diagramBundle({ references = [], requiredKinds = [] } = {}) {
  const diagrams = references.flatMap(ref => [ref.spec.diagram, ...(ref.detailSpec ? [ref.detailSpec.diagram] : [])]);
  const kinds = new Set([...requiredKinds, ...diagrams.map(d => d.kind)]);
  const tensorHosts = ['flow', 'relationship', 'transformation'].filter(kind => diagrams.some(d => d.kind === kind && (usesNodeTensors(d) || usesTensorItems(d))));
  return { quant: QUANT_KINDS.some(k => kinds.has(k)), fresh: NEW_KINDS.some(k => kinds.has(k)),
    panels: diagrams.some(d => d.variant === 'panels'), states: diagrams.some(d => d.kind === 'transformation' && d.variant === 'visual'),
    ...(kinds.has('tensor') ? { tensor: true } : {}),
    ...(kinds.has('token-links') ? { tokenLinks: true } : {}),
    ...(kinds.has('block-stack') ? { blockStack: true } : {}),
    ...(diagrams.some(d => d.panels?.some(panel => panel.diagram.kind === 'block-stack')) ? { blockStackPanels: true } : {}),
    ...(tensorHosts.length ? { tensorHosts } : {}),
    ...(diagrams.some(usesParallelPaths) ? { parallelPaths: true } : {}),
  };
}

function trimIllustrationPayloads(branch, { tensorHosts, parallelPaths, blockStackPanels }) {
  const kind = diagramKindOf(branch), props = branch.properties;
  const tensorPayload = tensorHosts?.includes(kind);
  if ((kind === 'flow' || kind === 'relationship') && !tensorPayload) {
    const node = props.nodes.items;
    delete node.properties.tensor;
    node.required = Object.keys(node.properties).filter(key => key === 'label' || node.required.includes(key));
  }
  if (kind === 'flow' && !parallelPaths) props.highlightPath = optionsOf(props.highlightPath)?.[0] ?? props.highlightPath;
  if (kind === 'transformation' && !tensorPayload) {
    for (const side of ['before', 'after']) for (const shape of optionsOf(props[side]) ?? [props[side]]) {
      if (shape.properties?.items) {
        const items = shape.properties.items;
        items.items = optionsOf(items.items)?.[0] ?? items.items;
      }
    }
  }
  if (kind === 'comparison' && !blockStackPanels && props.panels) {
    const child = props.panels.items.properties.diagram;
    const key = child.oneOf ? 'oneOf' : 'anyOf';
    child[key] = child[key].filter(shape => diagramKindOf(shape) !== 'block-stack');
  }
  return branch;
}

// The make_explanation input schema reduced to one bundle: deterministic, so the same bundle serializes to the same bytes on every request.
export function bundledAuthorSchema(schema, bundle) {
  const { quant, fresh, panels, states, tensor, tokenLinks, blockStack } = bundle;
  const allowed = new Set([...CORE_KINDS, ...(quant ? QUANT_KINDS : []), ...(fresh ? NEW_KINDS : []),
    ...(tensor ? ['tensor'] : []), ...(tokenLinks ? ['token-links'] : []), ...(blockStack ? ['block-stack'] : [])]);
  const out = structuredClone(schema);
  const visuals = out.properties.visuals.items;
  const spec = (visuals.oneOf ?? visuals.anyOf).find(v => v.properties.spec).properties.spec;
  const union = spec.properties.diagram, key = union.oneOf ? 'oneOf' : 'anyOf';
  union[key] = union[key].filter(b => allowed.has(diagramKindOf(b)))
    .map(b => ((diagramKindOf(b) === 'comparison' && !panels) || (diagramKindOf(b) === 'transformation' && !states) ? listForm(b) : b))
    .map(branch => trimIllustrationPayloads(branch, bundle));
  // Owner M4 (2026-11-08): at most two panels in the bundle (the spec allows three): each panel costs about 1.5 s of output (966 output tokens, 5.0 s,
  // for one two-panel comparison). The validator still reads a saved three-panel card.
  const comparison = union[key].find(b => b.properties.kind.const === 'comparison');
  if (comparison?.properties.panels) comparison.properties.panels = { ...comparison.properties.panels, maxItems: 2 };
  return out;
}

export const PHASE02_DIAGRAM_GUIDANCE = 'Additional teaching layouts: heatmap for numerical grids with an explicit scale; sample-set for identifiable samples, membership, replacement and weights; histogram for numeric bin distributions; box-plot for quartiles, whiskers, fences and outliers. Use coordinate-plot for regression, decision boundaries, distances, loss, uncertainty and distributions on axes; its supported annotations are data coordinates, never pixels. Use grouped or stacked bar-chart for votes, importance and category proportions. Use a scaled-lanes timeline for numeric time windows, cutoffs, availability and TTL, and a teaching matrix for highlighted data cells. Tree hierarchy, binary and dendrogram layouts are distinct: dendrogram heights are numerical merge distances; a family tree or folders are not automatically binary. An operation on a binary tree or BST must show the structure itself; an optional flow can explain additional steps but cannot replace it. Connected feedback and lineage use relationship layout graph. Concurrent preprocessing, ensembles and store branches use flow fork/merge roles, not decision diamonds. Name block-stack components, including role-tagged inset steps, with noun phrases. For token-links, show the value of the heaviest weight on its link and say in the caption that the weights sum to one. Start action labels in a flow with verbs. Use comparison visual panels for actual diagrams on coordinated axes, and transformation visual states when showing how the same records or points change. These compositions contain only bounded leaf diagrams; never nest comparisons or transformations. Follow the tool schema and the selected reference JSON for exact fields; no invented kind, SVG, CSS, colour or position fields.';
