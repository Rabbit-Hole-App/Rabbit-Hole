// JEV planner PROTOTYPE (owner 2026-11-08; arm E of the model comparison; never on unless EXPLANATION_PLANNER=jev and TYPESAFE_API_KEY are set, so production
// is unchanged). One TypeSafe System One call (https://api.typesafe.ai/v1/systemone, model jev-latest, input tokens only at $0.042 per million) before the author
// decides the card's visual type, kind, second visual and depth treatment; the server states the plan to the author in the request. A timeout or any error means no
// plan and the author prompt as today: the card is never blocked on the planner. The questions are the bench's (scripts/explain-bench/planner.mjs on explain/quality-bench).
// Mapping (owner 2026-11-08): no plot override; the kind is FIXED when its top probability is >= 0.6, otherwise the top two kinds are offered and the author chooses.
import { DEFAULT_DEPTH, validDepth } from './chat-depth.js';
import galleryDepths from '../../web/src/tutor-diagrams/kind-gallery-depths.json' with { type: 'json' };
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

// 1.2 s (owner 2026-11-08; 4 of 42 timed out at 800 ms on the Gemini stack); every timeout is logged as reason 'timeout' (explanation_planner_failed)
export const PLANNER_MODEL = 'jev-latest', PLANNER_TIMEOUT_MS = 1200, FIX_AT = 0.6, PHYSICAL_AT = 0.7, SECOND_AT = 0.7;
// A two-things plan draws each thing as a structure: only these kinds are offered (a matrix is a grid and a comparison is the one-visual answer this plan replaces: stack-vs-queue got an invalid matrix, owner 2026-11-08).
const EACH_KINDS = ['tree', 'flow', 'relationship', 'layers', 'cycle', 'sequence'];
const KIND = {
  flow: 'Ordered steps of one process, with or without decisions; the default only when nothing below fits.',
  sequence: 'Two to four named parties sending things to each other: client/server, sender/receiver, protocols, handshakes, request/response.',
  cycle: 'Steps that repeat, where the last feeds the first: water cycle, training loop, engine strokes.',
  timeline: 'Events ordered by dates, years or eras.',
  tree: 'A hierarchy, parts of one thing, splits, recursive calls; binary trees, BSTs, heaps, decision trees as structures.',
  relationship: 'Named things linked by labelled relations, including feedback and cycles between them; causes and effects.',
  transformation: 'The same thing before and after an operation: reshape, encode, normalise, differencing. Never for a function, wave or encoding over position or time.',
  comparison: 'Two to four separate things set side by side on shared attributes.',
  layers: 'A real ordered stack: network layers, atmosphere, software tiers, a transformer block. A stack: frames or levels pushed and popped (a call stack, a protocol stack), even when the question mentions recursion.',
  matrix: 'A grid of values with row and column headings: truth table, confusion matrix.',
  'coordinate-plot': 'How one quantity varies with another: a function\'s curve, a loss curve, a decision boundary, points in a plane. A function, wave or periodic quantity over a position or time (sinusoidal position encoding), or a set of points with centroids or a fitted line (k-means clustering); its x is a quantity that varies continuously (time, epochs, p, size), never categories or indices.',
  'bar-chart': 'Comparing a few quantities by size, one worked example; also any series over categories or indices (folds, classes, models, runs), such as training vs validation error per fold, grouped when comparing series.',
  histogram: 'The distribution of one numeric variable in bins.',
  'box-plot': 'Quartiles, median, whiskers, outliers of one or more groups.',
  heatmap: 'A numeric grid coloured by value, with an explicit scale.',
  'number-line': 'Values and intervals on one axis.',
  figure: 'A labelled schematic of a cell, a free-body force diagram, or a layered cross-section only; a device or machine (a lens, an engine, a camera) is a flow or sequence of what it does, not a figure.',
  'sample-set': 'Identifiable samples and their group membership, replacement or weights (bootstrap, which sample falls in which fold); not the error or score measured per fold.',
  argument: 'A claim with supporting and opposing evidence and a conclusion.',
  't-account': 'Debits and credits.',
  waterfall: 'An opening value changed by signed steps to a closing value.',
  tensor: 'The shape or values of a vector or matrix: an embedding, a projection, a weight matrix, a batch of activations.',
  'token-links': 'Attention or any weighted relation between two rows of tokens: which words a word attends to, and how strongly.',
  'block-stack': 'A layered architecture of blocks, often repeated, with skip connections: a transformer layer, an encoder or decoder stack, mixture-of-experts feed-forward.',
};
export const QUESTIONS = {
  visualType: { type: 'choice', instructions: "What should the card's main visual be? Objects, 3D shapes, anatomy, places, living things, natural events and 'how does X look' get a picture; if the thing also does something, both: a 'how does X work' question about a physical object is both. Processes, relationships, comparisons, hierarchies, quantities, algorithms, data structures and anything digital, abstract or mathematical get a diagram only: a neural network, a data structure, a protocol or a comparison of two technologies is a diagram even when the question says 'look like'.",
    criteria: { picture: 'A drawn illustration of a physical thing, place, organism or natural event.', diagram: 'A schematic: process, relationship, comparison, structure, quantity or formula.', both: 'A physical thing that also has a mechanism to explain (volcano erupting, engine, eclipse).' } },
  kind: { type: 'choice', instructions: 'If a diagram is used, which kind best teaches the answer? Judge by the shape of the answer, not by words in the question.', criteria: KIND },
  depthTreatment: { type: 'choice', instructions: 'How technical should the explanation and its visual be for this depth? Brief: plain words, no formulas or jargon, the simplest visual with plain labels. Balanced: the mechanism with its proper terms; a plot or chart if a quantity is central. Detailed: precise terms, the formula or exact relationship in the labels, the quantitative view.',
    criteria: { plain: 'No formulas, no jargon, plain-word labels.', mechanism: 'Proper terms, the mechanism; a plot if a quantity is central.', quantitative: 'Formula and exact relationships in labels; plot or chart where a quantity is involved.' } },
  needsPlot: { type: 'noul', instructions: 'Is this a question about a formula, a metric, a loss, an activation function, a schedule, or how one quantity changes with another?' },
  isPhysical: { type: 'noul', instructions: 'Is the subject a physical object, place, organism, 3D shape, repeating structure (molecule, lattice, gear train, mesh) or natural event? Software, algorithms, neural networks, protocols, a CPU versus a GPU and other digital or mathematical subjects are not physical.' },
  needsWorkedExample: { type: 'noul', instructions: 'Would a small worked numeric example (computed from the formula the explanation states) make the answer clearer?' },
  secondVisual: { type: 'noul', instructions: "Does the question ask about TWO separate things, each of which is itself a structure or a living thing that can be drawn on its own: two data structures, two search or traversal algorithms, two organisms or life stages, two objects? Answer no for a metric, a formula, one process with steps, one thing with parts, or two technologies or protocols compared on properties." },
};

const TREATMENT = {
  plain: 'plain words, no formulas or jargon, plain-word labels',
  mechanism: 'the mechanism with its proper terms; a plot or chart if a quantity is central',
  quantitative: 'the formula or exact relationship in the labels; a plot or chart where a quantity is involved',
};
// Owner 2026-11-08 (prose pass): the card's Depth decides the treatment, the planner no longer infers it (its depthTreatment answer is kept for the log only: plan.inferredTreatment).
export const DEPTH_TREATMENT = Object.freeze({ brief: 'plain', balanced: 'mechanism', detailed: 'quantitative' });
// Owner 2026-11-08 (prose pass): at Brief never a plot or a formula-bearing kind (plots on cross-entropy and Gini at Brief read as Detailed). The server rule: a plot kind is skipped for the next-best other kind
// in the planner's probabilities (a flow when there is none). The plan logs the kind it replaced (briefReplaced). Measured offline on 491 planner prompts (ledger prose pass): a sentence in QUESTIONS.kind asking the planner the same
// made it flip 53 plans at Balanced and Detailed (noise floor 7) because it does not keep the rule to Brief, so the rule is the server's alone.
export const BRIEF_NO_KINDS = Object.freeze(['coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'number-line', 'waterfall', 't-account']);

// answers (System One) -> plan, no I/O. visuals: [{ type: 'picture' } | { type: 'diagram', kind } | { type: 'diagram', choose: [a, b] }], in the author's order.
export function planFromAnswers(a, depth = null) {
  const brief = depth === 'brief', ranked = Object.entries(a.kind?.probabilities || {}).sort((x, y) => y[1] - x[1]), first = ranked[0]?.[0] ?? a.kind?.choice;
  const [[kind, p1] = [brief && BRIEF_NO_KINDS.includes(a.kind?.choice) ? 'flow' : a.kind?.choice, a.kind?.confidence], second] = (brief ? ranked.filter(([k]) => !BRIEF_NO_KINDS.includes(k)) : ranked).slice(0, 2);
  const briefReplaced = brief && BRIEF_NO_KINDS.includes(first) ? first : null;
  const fixed = p1 >= FIX_AT || !second, diagram = fixed ? { type: 'diagram', kind } : { type: 'diagram', choose: [kind, second[0]] };
  // v2 (owner 2026-11-08): no second-visual decision. One diagram, plus a picture only when the visual type is both; the author's own count rule stays the only source of a second diagram.
  // Owner 2026-11-08 (release 116 run: 12 of 19 picture prompts lost their picture because the planner chose a diagram): a physical subject (isPhysical >= 0.7: an object, place, organism,
  // 3D shape or natural event) always gets its picture. A diagram plan becomes picture + diagram, or the picture alone when the planned kind is figure (a figure cannot draw an object or a
  // shape). On the 42 baseline prompts every picture prompt scores isPhysical 0.83-0.93 and every no-picture prompt 0.04-0.10: pictures 19/19 where needed, 0/12 where not.
  let type = a.visualType?.choice, physical = false;
  if (type === 'diagram' && (a.isPhysical?.noul ?? 0) >= PHYSICAL_AT) { type = kind === 'figure' ? 'picture' : 'both'; physical = true; }
  let visuals = type === 'picture' ? [{ type: 'picture' }] : type === 'both' ? [{ type: 'picture' }, diagram] : [diagram];
  // Narrow second visual (owner 2026-11-08, after the clean-up): the question names two separate things that are each a structure or an organism (secondVisual >= 0.7): one visual per thing,
  // a picture each for living things (type picture), else a diagram each of its own kind (never a comparison). A planned picture + diagram (both) is left as it is.
  const pair = (a.secondVisual?.noul ?? 0) >= SECOND_AT && type !== 'both';
  const eachRanked = Object.entries(a.kind?.probabilities || {}).filter(([k, p]) => EACH_KINDS.includes(k) && p > 0).sort((x, y) => y[1] - x[1]).map(([k]) => k);
  // shortcut: fewer than two allowed kinds with any probability mass offers the planned kind (if allowed) and flow; upgrade when the planner gets its own two-things kind question.
  const each = { type: 'diagram', choose: eachRanked.length >= 2 ? eachRanked.slice(0, 2) : [...new Set([eachRanked[0] ?? (EACH_KINDS.includes(kind) ? kind : 'flow'), 'flow'])].slice(0, 2) };
  if (pair) visuals = type === 'picture' ? [{ type: 'picture' }, { type: 'picture' }] : [each, { ...each }];
  const inferred = TREATMENT[a.depthTreatment?.choice] ? a.depthTreatment.choice : 'mechanism';
  return { visuals, depthTreatment: DEPTH_TREATMENT[depth] ?? inferred, inferredTreatment: inferred, kind: type === 'picture' ? null : pair ? each.choose[0] ?? kind : kind, fixed: type === 'picture' ? null : pair ? false : fixed, planner: 'jev', ...(physical ? { physicalOverride: true } : {}), ...(briefReplaced ? { briefReplaced } : {}), ...(pair ? { secondVisual: true } : {}),
    flags: { needsPlot: a.needsPlot?.noul ?? null, isPhysical: a.isPhysical?.noul ?? null, needsWorkedExample: a.needsWorkedExample?.noul ?? null },
    confidence: { kind: p1 ?? null, visualType: a.visualType?.confidence ?? null }, probabilities: { kind: a.kind?.probabilities ?? null, visualType: a.visualType?.probabilities ?? null } };
}

// Owner 2026-11-08 (clean-up): ONE source of truth for a card's visuals. The kinds the learner named (requiredVisuals, the asked items) override the plan; otherwise the
// plan; with neither (no plan: timeout, error, flag off) the author's own rules choose (learn-artifact.js appends EXPLANATION_VISUAL_RULES).
// -> { source: 'required' | 'plan' | 'rules', visuals: [{ type: 'picture' } | { type: 'diagram', kind? , choose? }] }
export function cardVisuals(plan, asked = []) {
  const items = asked.filter(i => i.kind === 'diagram' || i.kind === 'illustration');
  if (items.length) {
    const planned = plan?.visuals?.find(v => v.type === 'diagram');
    return { source: 'required', visuals: items.map(i => (i.kind === 'illustration' ? { type: 'picture' } : { type: 'diagram', ...(i.diagramKind ? { kind: i.diagramKind } : planned?.kind ? { kind: planned.kind } : planned?.choose ? { choose: planned.choose } : {}) })) };
  }
  return plan?.planner === 'jev' ? { source: 'plan', visuals: plan.visuals } : { source: 'rules', visuals: [] };
}
// The diagram kinds the card is to hold: the first diagram's kind, or both offered kinds. [] when the rules decide.
export const visualKinds = ({ visuals }) => { const d = visuals.find(v => v.type === 'diagram'); return d ? (d.kind ? [d.kind] : d.choose ?? []) : []; };

// The "# Visuals for this card" section the author reads: the decisions made for this card, stated as fact (no plan, no required item: null, the rules block goes instead).
export function visualsStatement(plan, { source, visuals }) {
  if (source === 'rules') return null;
  const parts = visuals.map((v, i) => `${i + 1}) ${v.type === 'picture' ? 'a picture' : v.kind ? `a ${v.kind} diagram` : v.choose ? `a diagram of one of these kinds, the one that teaches the answer: ${v.choose.join(' or ')}` : 'a diagram'}`);
  return `# Visuals for this card\nThis card's visuals: ${parts.join('; ')}${visuals.every(v => v.type === 'picture') ? ' (no diagram)' : ''}.${plan?.secondVisual && source === 'plan' ? ' The question names two things: draw each one on its own, one visual per thing.' : ''}${plan?.depthTreatment ? ` Depth treatment: ${plan.depthTreatment}.` : ''}`;
}

// The gallery example for the planned diagram (owner 2026-11-08): the kind-gallery-depths.json spec of its kind at the card's depth (Standard when the depth is
// unknown), the top kind when the plan is not fixed; null when the plan has no diagram kind (a picture). It replaces the examples.json shape example.
// kind-gallery-depths.json is Codex's file and keeps its own level keys (overview, standard, deep); the levels are Brief, Balanced, Detailed everywhere else (owner 2026-11-08 rename), so the gallery is read through this map.
const GALLERY_LEVEL = { brief: 'overview', balanced: 'standard', detailed: 'deep' };
export function planShape(plan, depth = DEFAULT_DEPTH) {
  const kind = plan?.kind, entry = kind && galleryDepths.find(e => e.kind === kind), spec = entry && (entry[GALLERY_LEVEL[validDepth(depth) || DEFAULT_DEPTH]] ?? entry.standard);
  return spec ? { id: `shape-${kind}`, useWhen: `Shape example for a ${kind} diagram on another subject. Use its structure, not its content.`, spec: parseTutorDiagram(spec), shape: true } : null;
}

export const plannerEnabled = env => env?.EXPLANATION_PLANNER === 'jev' && typeof env.TYPESAFE_API_KEY === 'string' && env.TYPESAFE_API_KEY.length > 0;

// -> plan | null. null on any failure or timeout (the author runs as today); the reason goes to the log, never to the learner.
export async function planExplanation(env, { question, depth = DEFAULT_DEPTH, context = null }, { fetchImpl = globalThis.fetch, timeoutMs = PLANNER_TIMEOUT_MS } = {}) {
  const started = Date.now();
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-explain/1' },
      body: JSON.stringify({ model: PLANNER_MODEL, state: { question: String(question).slice(0, 2000), depth: validDepth(depth) ?? DEFAULT_DEPTH, context: context ? String(context).slice(0, 2000) : null }, questions: QUESTIONS }) });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const out = await response.json();
    const need = ['visualType', 'kind', 'depthTreatment', 'needsPlot', 'isPhysical', 'needsWorkedExample'];
    if (need.some(k => !out?.answers?.[k])) throw new Error('incomplete answers');
    return { ...planFromAnswers(out.answers, validDepth(depth) ?? DEFAULT_DEPTH), ms: Date.now() - started, inputTokens: out.usage?.input_tokens ?? null };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timeout|aborted/i.test(String(error?.message || ''));
    console.log(JSON.stringify({ event: 'explanation_planner_failed', reason: timedOut ? 'timeout' : String(error?.message || error).slice(0, 120), timeout: timedOut, ms: Date.now() - started }));
    return null;
  }
}
