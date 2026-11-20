import { referenceLibrary } from './reference-library-lazy.js'; // START-3: the library is loaded on first use, not at worker start
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import { resolveTokens, varySpec } from '../../web/src/tutor-diagrams/vary.js';
import kindGallery from '../../web/src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
import { usesNodeTensors, usesParallelPaths, usesTensorItems } from '../../web/src/tutor-diagrams/illustration-kinds.js';
import { cardVisuals, visualKinds } from './explanation-planner.js';
import { seededRandom } from '../../web/src/tutor-diagrams/random.js';

const MAX_REFERENCES = 2;
const MAX_CONTEXT = 14_000;
const normalized = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const shapesByKind = new Map(kindGallery.map(spec => [spec.diagram.kind, spec]));
let legacyKinds;
const legacyShapeKinds = () => (legacyKinds ??= [...new Set(referenceLibrary().diagramReferences.filter(ref => ref.id.startsWith('general-')).map(ref => ref.spec.diagram.kind))]);

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
    legacyShapeKinds().find(kind => matches(query, normalized(kind)));
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

function topicScore(query, reference, shortTopic) {
  const keys = new Set(reference.keywords.map(normalized).filter(Boolean));
  const short = reference.shortKeywords?.map(normalized);
  let score = 0;
  for (const key of keys) {
    if (short?.includes(key)) {
      if (shortTopic === key) score += 40;
    } else if (matches(query, key)) {
      score += Math.min(12, 2 + key.split(' ').length * 2);
    }
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
  const parts = diagram.kind === 'panels' || (diagram.kind === 'comparison' && diagram.variant === 'panels') ? diagram.panels
    : diagram.kind === 'transformation' && diagram.variant === 'visual' ? [diagram.before, diagram.after] : [];
  return parts.flatMap((part, partIndex) => required.has(part.diagram.kind) ? [{
    ...ref, vary: undefined, id: `${ref.id}--part-${partIndex + 1}`, sourceId: ref.id, partIndex, // vary paths walk the whole reference, not a part
    ...(diagram.kind === 'panels' ? { detailSpec: undefined } : {}), // a panels reference's second figure is panels too: the author is not shown that kind yet
    useWhen: `${ref.useWhen} This is the ${part.heading ?? part.label} panel. Use its ${part.diagram.kind} kind directly when that kind is required.`,
    spec: { version: ref.spec.version, diagram: part.diagram },
  }] : []);
}

// VAR-1 step 3: a reference with `vary`, on a request with a seed, is sampled before it is parsed, so the spec the author copies carries this request's inputs. A seedless request, or a reference
// without `vary`, is unchanged. A failed draw never fails a request: the reference goes out as written and one log line says why.
export const sampledSpec = (ref, seed) => {
  try { return seed && ref.vary ? varySpec(ref.spec, ref.vary, seed, ref.id) : resolveTokens(ref.spec); }
  catch (error) {
    console.log(JSON.stringify({ event: 'explanation_vary_failed', reference: ref.id, error: String(error.message).slice(0, 200) }));
    try { return resolveTokens(ref.spec); } catch { return ref.spec; }
  }
};

const DEPTH_KEYS = { brief: 'overview', balanced: 'standard', detailed: 'deep' };
// plannedKinds (owner 2026-11-08, clean-up): the card's resolved diagram kinds (explanation-planner.js cardVisuals); candidates are filtered to them BEFORE keyword scoring, so a
// reference of another kind is never offered. Empty: no filter (the rules decide the kind).
export const selectDiagramReferences = options => selectWithSteer(options).references;
// Owner 2026-11-09 (release 118): the planner's kind must not beat a selected worked example. The best TOPICAL reference (never a shape-* or general-* example) by its direct score, read BEFORE the
// plannedKinds filter and before any shape fallback or kind bonus, qualifies at an exact documented prompt (+50), a short-topic hit (+40) or direct >= TOPICAL_STEER_MIN (12: one long phrase, or two
// short learner phrases). It is then kept whole whatever the planner's kind (and goes first), and its kind comes back as steer { kind, source: 'reference', id, referenceKind, score, exact (the prompt is one of its documented prompts verbatim; GEN-1 G4) }; a
// two-panel reference is read through its single-diagram variant (preferSingleVariants), so its kind is that variant's. A learner-named kind (requiredKinds) is never steered: null.
export const TOPICAL_STEER_MIN = 12;
export function selectWithSteer({ prompt = '', context = '', requiredKinds = [], plannedKinds = [], shapeFallback = true, depth = 'standard', excludeReferencePrefixes = [], seed = null, from = referenceLibrary().diagramReferences } = {}) {
  const query = normalized(String(prompt).slice(0, 4000));
  // Broad lesson aliases resolve a whole direct topic, including concise requests such as “show me the forest vote”.
  const shortTopic = query.replace(/^(?:please )?(?:(?:can you )?(?:explain|show me|describe|tell me about|help me understand) )?(?:the |an? )?/u, '');
  const source = normalized(contextText(context));
  const required = new Set(requiredKinds.filter(kind => typeof kind === 'string'));
  const level = DEPTH_KEYS[depth] ?? depth; // the references' depth variants are keyed overview / standard / deep; the renamed levels (brief / balanced / detailed) map to them
  const wanted = new Set(plannedKinds), atLevel = ref => (ref.depths?.[level] ? { ...ref, ...ref.depths[level] } : ref);
  const library = excludeReferencePrefixes.length ? from.filter(ref => !excludeReferencePrefixes.some(prefix => ref.id.startsWith(prefix))) : from;
  const topical = required.size || !query ? null : library.filter(ref => !/^(?:shape|general)-/.test(ref.id)).map((ref, index) => ({ ref: atLevel(ref), index }))
    .map(item => ({ ...item, score: topicScore(query, item.ref, shortTopic) })).filter(item => item.score >= TOPICAL_STEER_MIN).sort((x, y) => (y.score - x.score) || x.index - y.index)[0] ?? null;
  const candidates = library.flatMap(ref => referenceVariants(atLevel(ref), required)).filter(ref => !wanted.size || ref.id === topical?.ref.id || wanted.has(ref.spec.diagram.kind) || wanted.has(singleByPanel.get(ref.id)?.spec.diagram.kind)); // a two-panel reference also qualifies through its one-diagram variant's kind (Codex set 3), which preferSingleVariants then sends
  const ranked = candidates.map((ref, index) => ({
    ref, index, direct: topicScore(query, ref, shortTopic), source: topicScore(source, ref),
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
    const spec = parseTutorDiagram(sampledSpec(ref, seed));
    const compact = { id: ref.id, useWhen: ref.useWhen, spec,
      ...(ref.detailSpec ? { detailSpec: parseTutorDiagram(ref.detailSpec) } : {}),
      ...(ref.sourceId ? { sourceId: ref.sourceId, partIndex: ref.partIndex } : {}) };
    const length = JSON.stringify(compact).length;
    if (chars + length > MAX_CONTEXT) continue;
    picked.push(compact);
    chars += length;
    if (picked.length === MAX_REFERENCES) break;
  }
  const steer = topical && picked[0]?.id === topical.ref.id ? { kind: (singleByPanel.get(topical.ref.id) ?? topical.ref).spec.diagram.kind, source: 'reference', id: topical.ref.id, referenceKind: topical.ref.spec.diagram.kind, score: topical.score, exact: topical.ref.prompts.some(prompt => normalized(prompt) === query) } : null;
  // Release 129 (reviewer 2026-11-13): a steered request sends its steered reference alone (the planner's shape example comes with it in learn-artifact.js), never a second worked reference.
  const sent = steer ? picked.slice(0, 1) : picked;
  return { references: sent.length || !shapeFallback ? sent : shapeExamples(prompt, required), steer };
}

// Owner 2026-11-08 (Codex set 3): a selected two-panel reference (comparison panels, visual transformation) is sent as its one-diagram `-single` variant (about half the
// tokens), unless the planner's kind is comparison or transformation (the comparison is then the point) or the learner required that panel kind. The variant shares the
// panel's keywords, so selection and its bench are unchanged: the swap happens after the pick. A leaf excerpt (sourceId) is never swapped.
let singleMap;
const singleByPanel = { get: id => (singleMap ??= new Map(referenceLibrary().singleDiagramReferences.map(single => [single.panelReferenceId, single]))).get(id) };
export function preferSingleVariants(references, { plannedKind = null, requiredKinds = [], seed = null } = {}) {
  const whole = plannedKind === 'comparison' || plannedKind === 'transformation';
  return references.map(ref => {
    // A `panels` reference is never sent whole: the author's schema does not carry that kind yet, so it always goes as its one-diagram variant.
    if (whole && ref.spec.diagram.kind !== 'panels') return ref;
    const single = ref.sourceId ? null : singleByPanel.get(ref.id);
    return !single || requiredKinds.includes(ref.spec.diagram.kind) ? ref : { id: single.id, useWhen: single.useWhen, spec: parseTutorDiagram(sampledSpec(single, seed)) };
  });
}

// The live author and the lesson pipeline share the resolved-kind selection call.
// Planner kinds and learner-required kinds retain their separate live meanings.
export function selectForAuthor({ prompt, context = '', depth, plan = null, asked = [], planned = false, excludeReferencePrefixes = [], seed = null, from }) {
  const requiredKinds = asked.filter(item => item.kind === 'diagram' && item.diagramKind).map(item => item.diagramKind);
  const plannedKinds = visualKinds(cardVisuals(plan, asked));
  const selection = selectWithSteer({ prompt, context, depth, requiredKinds, plannedKinds,
    shapeFallback: !!planned && !plan, excludeReferencePrefixes, seed, ...(from ? { from } : {}) });
  return { ...selection, references: preferSingleVariants(selection.references, { plannedKind: plan?.kind, requiredKinds, seed }),
    requiredKinds, plannedKinds };
}

// The start of the reference block in a system prompt; the fast chain moves the block to the end of its system message (assembledSystem).
export const REFERENCE_MARK = '\n# Examples\n'; // GEN-1 G2: the block's first line only, so the seeded examples may carry another second line (the old mark 'Approved diagram references' stays a prefix of today's heading)
// GEN-1 G2 (R2, wording for the Reviewer to approve): the heading of the seeded examples (GEN-1 G1), starting text from the spec; `# Examples` stays the first line. No number wording here (owner N1): the inputs sentence goes after the number rule (agents/learn-artifact.js INPUTS_RULE).
export const SEEDED_EXAMPLES_HEADING = '\n# Examples\nDiagram examples on other subjects. They show what a good diagram of this kind looks like: several concrete items, real values, short labels. Do not reuse their subject, labels or values. Build this card\'s diagram from the concrete things in the learner\'s question and its context (the names, sizes and values given there); where none are given, choose a small concrete example of your own. Do not exceed this card\'s visual count.\n';
// MVP2 (owner 2026-11-19): a stored reference shown as an example is written with its numbers removed. Every numeric field of its diagram (and of its detail diagram) and every number
// written inside a text field becomes the text "?". Fields that name things (ids, endpoints, enumerations) keep their text. Only the written line changes: the reference object itself
// (its kind, the answer schema, the trace) is untouched. The shape example and the seeded examples are not masked.
const NAME_KEYS = new Set(['id', 'from', 'to', 'node', 'parent', 'repeatTo', 'highlightPath', 'kind', 'role', 'stackRole', 'variant', 'layout', 'figure', 'side', 'orientation', 'direction', 'anchor', 'type']);
const maskNumbers = (value, key = '') => {
  if (typeof value === 'number') return '?';
  if (typeof value === 'string') return NAME_KEYS.has(key) ? value : value.replace(/[0-9]+(?:[.,][0-9]+)*/g, '?');
  if (Array.isArray(value)) return value.map(item => maskNumbers(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, maskNumbers(item, name)]));
  return value;
};
const maskSpec = spec => (spec?.diagram ? { ...spec, diagram: maskNumbers(spec.diagram) } : spec);
const shownReference = ref => (ref.shape || ref.seededExample ? ref : { ...ref, spec: maskSpec(ref.spec), ...(ref.detailSpec ? { detailSpec: maskSpec(ref.detailSpec) } : {}) });
// MVP3 (owner 2026-11-19): eight distinct whole numbers from 5 to 60 drawn from the request's seed (the same seed gives the same eight, another seed others). They are offered as starting numbers
// when a stored reference is shown with its numbers removed.
const startingNumbers = seed => {
  const pool = Array.from({ length: 56 }, (_, index) => index + 5), random = seededRandom(`${seed}:starting-numbers`);
  for (let i = 0; i < 8; i++) { const j = i + Math.floor(random() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 8);
};
export function diagramReferenceContext(references, requestSeed = null) {
  if (!references.length) return '';
  // Owner N1 (2026-11-08): numbers follow the one number rule in ARTIFACT_SYSTEM (agents/learn-artifact.js); this block carries no second wording of it.
  const baseHeading = references.every(ref => ref.seededExample) ? SEEDED_EXAMPLES_HEADING : '\n# Examples\nApproved diagram references (examples, not source facts). An example on this card\'s subject shows a correct structure: keep its structure and its facts. Write your own version of what is illustrative in it: the example items, their names, the input values and the title. Do not copy an example\'s values, labels or prose, force a reference, or exceed this card\'s visual count. A "?" in an example stands for a number that was removed: choose your own.\n';
  // MVP3: a stored reference is shown (masked) and the request has a seed: the starting numbers end the heading, after the sentence about "?".
  const startingSentence = requestSeed && !references.every(ref => ref.seededExample) && references.some(ref => !ref.shape && !ref.seededExample)
    ? ' For this card, build your input values from these starting numbers, in this order, scaling or rounding them where the diagram needs shares or weights: ' + startingNumbers(requestSeed).join(', ') + '.' : '';
  const heading = startingSentence ? baseHeading.slice(0, -1) + startingSentence + baseHeading.slice(-1) : baseHeading;
  let out = heading;
  if (references.some(ref => ref.detailSpec)) {
    out += 'If you use a detailSpec, write it as a separate visual. If a block points to it, set that block’s detail index to the visual’s position on the card.\n';
  }
  for (const ref of references.slice(0, MAX_REFERENCES + 1)) { // the planner's shape example may come first (explanation-planner.js), then at most two topical ones
    const shown = shownReference(ref);
    const line = JSON.stringify({ id: shown.id, useWhen: shown.useWhen, spec: shown.spec,
      ...(shown.detailSpec ? { detailSpec: shown.detailSpec } : {}) }) + '\n';
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
const compactPlot = diagram => diagram.kind === 'coordinate-plot' && diagram.series.some(series => series.samples);
// A comparison or transformation schema branch in its list form only: no panels, shared axes, visual states or identity (the visual variant's own fields).
export const listForm = branch => {
  const { variant, panels, sharedAxes, identity, ...properties } = branch.properties;
  for (const side of ['before', 'after']) if (childDiagram(properties[side])) properties[side] = (properties[side].anyOf ?? properties[side].oneOf).find(b => !b.properties?.diagram);
  return { ...branch, properties };
};
// GEN-1 G5: the diagram kinds a card with a plan is to hold (the planner's kind, the two offered kinds, or the learner-named kinds the plan was overridden by): the
// diagram union of its schema is exactly these kinds (`only`). [] when there is no diagram, a diagram has no kind or offer yet, or the rules decide: today's bundles.
export function plannedBundleKinds({ source, visuals } = {}) {
  if (source === 'rules') return [];
  const diagrams = (visuals ?? []).filter(v => v.type === 'diagram');
  if (!diagrams.length || diagrams.some(v => !v.kind && !v.choose?.length)) return [];
  return [...new Set(diagrams.flatMap(v => (v.kind ? [v.kind] : v.choose)))];
}
export function diagramBundle({ references = [], requiredKinds = [], plannedKinds = [] } = {}) {
  const diagrams = references.flatMap(ref => [ref.spec.diagram, ...(ref.detailSpec ? [ref.detailSpec.diagram] : [])]);
  const kinds = new Set([...requiredKinds, ...diagrams.map(d => d.kind)]);
  const tensorHosts = ['flow', 'relationship', 'transformation'].filter(kind => diagrams.some(d => d.kind === kind && (usesNodeTensors(d) || usesTensorItems(d))));
  return { ...(plannedKinds.length ? { only: [...plannedKinds] } : {}), quant: QUANT_KINDS.some(k => kinds.has(k)), fresh: NEW_KINDS.some(k => kinds.has(k)),
    panels: diagrams.some(d => d.variant === 'panels'), states: diagrams.some(d => d.kind === 'transformation' && d.variant === 'visual'),
    ...(kinds.has('tensor') ? { tensor: true } : {}),
    ...(kinds.has('token-links') ? { tokenLinks: true } : {}),
    ...(kinds.has('block-stack') ? { blockStack: true } : {}),
    ...(diagrams.some(d => d.panels?.some(panel => panel.diagram.kind === 'block-stack')) ? { blockStackPanels: true } : {}),
    ...(diagrams.some(d => compactPlot(d) || d.panels?.some(panel => compactPlot(panel.diagram))) ? { compactPlots: true } : {}),
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

function keepExplicitPlotPoints(schema) {
  if (!schema || typeof schema !== 'object') return;
  if (diagramKindOf(schema) === 'coordinate-plot') {
    // With EXPLANATION_FORMULA_SAMPLER=on the series items are { anyOf: [points form, formula form] } (withFormulaSeries): only the points form loses its compact samples; the formula form keeps its own sample count.
    const items = schema.properties.series.items;
    for (const series of items.anyOf ?? items.oneOf ?? [items]) {
      if (series.properties?.samples && !series.properties.formula) {
        delete series.properties.samples;
        series.required.push('points');
      }
    }
    return;
  }
  Object.values(schema).forEach(keepExplicitPlotPoints);
}

// The make_explanation input schema reduced to one bundle: deterministic, so the same bundle serializes to the same bytes on every request.
const withoutSmooth = branch => { const series = branch.properties?.series?.items; if (series?.properties?.smooth) delete series.properties.smooth; return branch; };
export function bundledAuthorSchema(schema, bundle) {
  const { quant, fresh, panels, states, tensor, tokenLinks, blockStack } = bundle;
  const allowed = bundle.only?.length ? new Set(bundle.only) : new Set([...CORE_KINDS, ...(quant ? QUANT_KINDS : []), ...(fresh ? NEW_KINDS : []),
    ...(tensor ? ['tensor'] : []), ...(tokenLinks ? ['token-links'] : []), ...(blockStack ? ['block-stack'] : [])]);
  const out = structuredClone(schema);
  const visuals = out.properties.visuals.items;
  const spec = (visuals.oneOf ?? visuals.anyOf).find(v => v.properties.spec).properties.spec;
  const union = spec.properties.diagram, key = union.oneOf ? 'oneOf' : 'anyOf';
  union[key] = union[key].filter(b => allowed.has(diagramKindOf(b)))
    .map(b => ((diagramKindOf(b) === 'comparison' && !panels) || (diagramKindOf(b) === 'transformation' && !states) ? listForm(b) : b))
    .map(branch => trimIllustrationPayloads(branch, bundle))
    .map(withoutSmooth); // Codex c92ec1279: `smooth` is renderer-side (the author never sets it); leaving it out keeps every Gemini bundle byte-identical to before
  // Scope the additional sample fields to steered requests so unrelated Gemini fallback bundles keep their previous size.
  if (!bundle.compactPlots) keepExplicitPlotPoints(union);
  // Owner M4 (2026-11-08): at most two panels in the bundle (the spec allows three): each panel costs about 1.5 s of output (966 output tokens, 5.0 s,
  // for one two-panel comparison). The validator still reads a saved three-panel card.
  const comparison = union[key].find(b => b.properties.kind.const === 'comparison');
  if (comparison?.properties.panels) comparison.properties.panels = { ...comparison.properties.panels, maxItems: 2 };
  // GEN-1 G5: a one-kind union is sent as an anyOf: the provider adapter turns a oneOf into an anyOf only for two or more alternatives that differ by a const (interact-model-adapters.js exclusiveOneOfToAnyOf).
  if (key === 'oneOf' && union.oneOf.length === 1) { union.anyOf = union.oneOf; delete union.oneOf; }
  return out;
}

// The diagram kinds of a schema that a plan narrowed (bundledAuthorSchema `only`), else null. Every other bundle starts from the CORE kinds, so a union that lacks one of them
// was narrowed; the Gemini step reads this to keep the planned kinds and the code-computed fields (explanation-fast-chain.js), without the request carrying anything extra.
export function narrowedKinds(schema) {
  const visuals = schema?.properties?.visuals?.items, spec = (visuals?.oneOf ?? visuals?.anyOf)?.find(v => v?.properties?.spec)?.properties.spec;
  const union = spec?.properties?.diagram, kinds = (union?.oneOf ?? union?.anyOf ?? []).map(diagramKindOf).filter(Boolean);
  return kinds.length && CORE_KINDS.some(kind => !kinds.includes(kind)) ? kinds : null;
}

export const PHASE02_DIAGRAM_GUIDANCE = 'Additional teaching layouts: heatmap for numerical grids with an explicit scale; sample-set for identifiable samples, membership, replacement and weights; histogram for numeric bin distributions; box-plot for quartiles, whiskers, fences and outliers. Use coordinate-plot for regression, decision boundaries, distances, loss, uncertainty and distributions on axes; its supported annotations are data coordinates, never pixels. Use grouped or stacked bar-chart for votes, importance and category proportions. Use a scaled-lanes timeline for numeric time windows, cutoffs, availability and TTL, and a teaching matrix for highlighted data cells. Tree hierarchy, binary and dendrogram layouts are distinct: dendrogram heights are numerical merge distances; a family tree or folders are not automatically binary. An operation on a binary tree or BST must show the structure itself; an optional flow can explain additional steps but cannot replace it. Connected feedback and lineage use relationship layout graph. Concurrent preprocessing, ensembles and store branches use flow fork/merge roles, not decision diamonds. Name block-stack components, including role-tagged inset steps, with noun phrases. For token-links, show the value of the heaviest weight on its link and say in the caption that the weights sum to one. Start action labels in a flow with verbs. Use comparison visual panels for actual diagrams on coordinated axes, and transformation visual states when showing how the same records or points change. These compositions contain only bounded leaf diagrams; never nest comparisons or transformations. Follow the tool schema and the selected reference JSON for exact fields; no invented kind, SVG, CSS, colour or position fields.';
