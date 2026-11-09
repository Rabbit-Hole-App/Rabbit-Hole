// JEV planner PROTOTYPE (owner 2026-11-08; arm E of the model comparison; never on unless EXPLANATION_PLANNER=jev and TYPESAFE_API_KEY are set, so production
// is unchanged). One TypeSafe System One call (https://api.typesafe.ai/v1/systemone, model jev-latest, input tokens only at $0.042 per million) before the author
// decides the card's visual type, kind, second visual and depth treatment; the server states the plan to the author in the request. A timeout or any error means no
// plan and the author prompt as today: the card is never blocked on the planner. The questions are the bench's (scripts/explain-bench/planner.mjs on explain/quality-bench).
// Mapping (owner 2026-11-08): no plot override; the kind is FIXED when its top probability is >= 0.6, otherwise the top two kinds are offered and the author chooses.
import shapeExamples from '../../web/src/tutor-diagrams/examples.json' with { type: 'json' };
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

// 1.2 s (owner 2026-11-08; 4 of 42 timed out at 800 ms on the Gemini stack); every timeout is logged as reason 'timeout' (explanation_planner_failed)
export const PLANNER_MODEL = 'jev-latest', PLANNER_TIMEOUT_MS = 1200, FIX_AT = 0.6, PHYSICAL_AT = 0.7;
const KIND = {
  flow: 'Ordered steps of one process, with or without decisions; the default only when nothing below fits.',
  sequence: 'Two to four named parties sending things to each other: client/server, sender/receiver, protocols, handshakes, request/response.',
  cycle: 'Steps that repeat, where the last feeds the first: water cycle, training loop, engine strokes.',
  timeline: 'Events ordered by dates, years or eras.',
  tree: 'A hierarchy, parts of one thing, splits, recursive calls; binary trees, BSTs, heaps, decision trees as structures.',
  relationship: 'Named things linked by labelled relations, including feedback and cycles between them; causes and effects.',
  transformation: 'The same thing before and after an operation: reshape, encode, normalise, differencing.',
  comparison: 'Two to four separate things set side by side on shared attributes.',
  layers: 'A real ordered stack: network layers, atmosphere, software tiers, a transformer block.',
  matrix: 'A grid of values with row and column headings: truth table, confusion matrix.',
  'coordinate-plot': 'How one quantity varies with another: a function\'s curve, a loss curve, a decision boundary, points in a plane.',
  'bar-chart': 'Comparing a few quantities by size, one worked example.',
  histogram: 'The distribution of one numeric variable in bins.',
  'box-plot': 'Quartiles, median, whiskers, outliers of one or more groups.',
  heatmap: 'A numeric grid coloured by value, with an explicit scale.',
  'number-line': 'Values and intervals on one axis.',
  figure: 'A labelled schematic of a cell, a free-body force diagram, or a layered cross-section only.',
  'sample-set': 'Identifiable samples and their group membership, replacement or weights (bootstrap, folds).',
  argument: 'A claim with supporting and opposing evidence and a conclusion.',
  't-account': 'Debits and credits.',
  waterfall: 'An opening value changed by signed steps to a closing value.',
};
export const QUESTIONS = {
  visualType: { type: 'choice', instructions: "What should the card's main visual be? Objects, 3D shapes, anatomy, places, living things, natural events and 'how does X look' get a picture; if the thing also does something, both. Processes, relationships, comparisons, hierarchies, quantities, algorithms, data structures and anything digital, abstract or mathematical get a diagram only.",
    criteria: { picture: 'A drawn illustration of a physical thing, place, organism or natural event.', diagram: 'A schematic: process, relationship, comparison, structure, quantity or formula.', both: 'A physical thing that also has a mechanism to explain (volcano erupting, engine, eclipse).' } },
  kind: { type: 'choice', instructions: 'If a diagram is used, which kind best teaches the answer? Judge by the shape of the answer, not by words in the question.', criteria: KIND },
  depthTreatment: { type: 'choice', instructions: 'How technical should the explanation and its visual be for this depth? Overview: plain words, no formulas or jargon, the simplest visual with plain labels. Standard: the mechanism with its proper terms; a plot or chart if a quantity is central. Deep: precise terms, the formula or exact relationship in the labels, the quantitative view.',
    criteria: { plain: 'No formulas, no jargon, plain-word labels.', mechanism: 'Proper terms, the mechanism; a plot if a quantity is central.', quantitative: 'Formula and exact relationships in labels; plot or chart where a quantity is involved.' } },
  needsPlot: { type: 'noul', instructions: 'Is this a question about a formula, a metric, a loss, an activation function, a schedule, or how one quantity changes with another?' },
  isPhysical: { type: 'noul', instructions: 'Is the subject a physical object, place, organism, 3D shape, repeating structure (molecule, lattice, gear train) or natural event?' },
  needsWorkedExample: { type: 'noul', instructions: 'Would a small worked numeric example (computed from the formula the explanation states) make the answer clearer?' },
};

const TREATMENT = {
  plain: 'plain words, no formulas or jargon, plain-word labels',
  mechanism: 'the mechanism with its proper terms; a plot or chart if a quantity is central',
  quantitative: 'the formula or exact relationship in the labels; a plot or chart where a quantity is involved',
};
const top2 = probabilities => Object.entries(probabilities || {}).sort((x, y) => y[1] - x[1]).slice(0, 2);

// answers (System One) -> plan, no I/O. visuals: [{ type: 'picture' } | { type: 'diagram', kind } | { type: 'diagram', choose: [a, b] }], in the author's order.
export function planFromAnswers(a) {
  const [[kind, p1] = [a.kind?.choice, a.kind?.confidence], second] = top2(a.kind?.probabilities);
  const fixed = p1 >= FIX_AT || !second, diagram = fixed ? { type: 'diagram', kind } : { type: 'diagram', choose: [kind, second[0]] };
  // v2 (owner 2026-11-08): no second-visual decision. One diagram, plus a picture only when the visual type is both; the author's own count rule stays the only source of a second diagram.
  // Owner 2026-11-08 (release 116 run: 12 of 19 picture prompts lost their picture because the planner chose a diagram): a physical subject (isPhysical >= 0.7: an object, place, organism,
  // 3D shape or natural event) always gets its picture. A diagram plan becomes picture + diagram, or the picture alone when the planned kind is figure (a figure cannot draw an object or a
  // shape). On the 42 baseline prompts every picture prompt scores isPhysical 0.83-0.93 and every no-picture prompt 0.04-0.10: pictures 19/19 where needed, 0/12 where not.
  let type = a.visualType?.choice, physical = false;
  if (type === 'diagram' && (a.isPhysical?.noul ?? 0) >= PHYSICAL_AT) { type = kind === 'figure' ? 'picture' : 'both'; physical = true; }
  const visuals = type === 'picture' ? [{ type: 'picture' }] : type === 'both' ? [{ type: 'picture' }, diagram] : [diagram];
  const treatment = a.depthTreatment?.choice;
  return { visuals, depthTreatment: TREATMENT[treatment] ? treatment : 'mechanism', kind: type === 'picture' ? null : kind, fixed: type === 'picture' ? null : fixed, planner: 'jev', ...(physical ? { physicalOverride: true } : {}),
    flags: { needsPlot: a.needsPlot?.noul ?? null, isPhysical: a.isPhysical?.noul ?? null, needsWorkedExample: a.needsWorkedExample?.noul ?? null },
    confidence: { kind: p1 ?? null, visualType: a.visualType?.confidence ?? null }, probabilities: { kind: a.kind?.probabilities ?? null, visualType: a.visualType?.probabilities ?? null } };
}

// The sentence the author reads in the request (cardPlan): the decisions made for this card.
export function planStatement(plan) {
  const parts = plan.visuals.map((v, i) => `${i + 1}) ${v.type === 'picture' ? 'a picture' : v.kind ? `a ${v.kind} diagram` : `a diagram of one of these kinds, the one that teaches the answer: ${v.choose.join(' or ')}`}`);
  return `Card plan, decided before you write; follow it. Visuals, in this order: ${parts.join('; ')}${plan.visuals.every(v => v.type === 'picture') ? ' (no diagram)' : ''}. Depth treatment: ${plan.depthTreatment} (${TREATMENT[plan.depthTreatment]}).`;
}

// The shape example for the planned diagram: the first examples.json entry of its kind (the top kind when the plan is not fixed), else null (no example for that kind).
export function planShape(plan) {
  const kind = plan?.kind, spec = kind && shapeExamples.find(e => e.diagram.kind === kind);
  return spec ? { id: `shape-${kind}`, useWhen: `Shape example for a ${kind} diagram on another subject. Use its structure, not its content.`, spec: parseTutorDiagram(spec), shape: true } : null;
}

export const plannerEnabled = env => env?.EXPLANATION_PLANNER === 'jev' && typeof env.TYPESAFE_API_KEY === 'string' && env.TYPESAFE_API_KEY.length > 0;

// -> plan | null. null on any failure or timeout (the author runs as today); the reason goes to the log, never to the learner.
export async function planExplanation(env, { question, depth = 'standard', context = null }, { fetchImpl = globalThis.fetch, timeoutMs = PLANNER_TIMEOUT_MS } = {}) {
  const started = Date.now();
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-explain/1' },
      body: JSON.stringify({ model: PLANNER_MODEL, state: { question: String(question).slice(0, 2000), depth, context: context ? String(context).slice(0, 2000) : null }, questions: QUESTIONS }) });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const out = await response.json();
    const need = ['visualType', 'kind', 'depthTreatment', 'needsPlot', 'isPhysical', 'needsWorkedExample'];
    if (need.some(k => !out?.answers?.[k])) throw new Error('incomplete answers');
    return { ...planFromAnswers(out.answers), ms: Date.now() - started, inputTokens: out.usage?.input_tokens ?? null };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timeout|aborted/i.test(String(error?.message || ''));
    console.log(JSON.stringify({ event: 'explanation_planner_failed', reason: timedOut ? 'timeout' : String(error?.message || error).slice(0, 120), timeout: timedOut, ms: Date.now() - started }));
    return null;
  }
}
