import { evalScalar } from '../interact-plan.js';
import { TEMPLATE_WORDS, exprToJs, formulaScope, nestWords, parseQuantity } from '../interact-formula.js';
import * as oneBody from './one-body.js';
import * as twoLane from './two-lane.js';
import * as bodyPlot from './body-plot.js';

// generateProgram(plan, buildInput) -> { source, manifest }: the program for a plan that names a template, written by trusted code and no model. The plan carries the physics (each quantity's
// formula, piecewise through switchAt / formulaAfter), the controls, the ranges and the timeline; buildInput carries the exact control declarations and timeline (interact-build.js buildInput). A
// template (./one-body.js, ./two-lane.js, ./body-plot.js) owns the drawing and the geometry; the plan holds every word (scene.words). A plan the template cannot build is a TemplateError (our bug or a plan
// that names slots it does not have), never a model call or a repair.
export const TEMPLATES = Object.freeze({ 'one-body': oneBody, 'two-lane': twoLane, 'body-plot': bodyPlot });

export class TemplateError extends Error {
  constructor(code, message) { super(message); this.name = 'TemplateError'; this.code = code; }
}

// A plan's ScalarExpr trees (the timeline) may read a fixed value by name: it is a literal in the program.
const fixLiterals = (expr, fixed) => {
  if (!expr || typeof expr !== 'object') return expr;
  if (expr.op === 'input' && Object.hasOwn(fixed, expr.id)) return { op: 'literal', value: fixed[expr.id] };
  return expr.left ? { ...expr, left: fixLiterals(expr.left, fixed), right: fixLiterals(expr.right, fixed) } : expr;
};
// The first sentences of a text that fit `max` characters, math marks removed (the manifest's summary and accessible description are plain text).
const sentences = (text, max) => {
  const plain = text.replace(/\$/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max), end = cut.lastIndexOf('.');
  return end > 0 ? cut.slice(0, end + 1) : cut.trim();
};
const superscripts = unit => String(unit ?? '').replace('^2', '²').replace('^3', '³');

export function generateProgram(plan, buildInput) {
  const scene = plan.scene, name = scene.template, template = TEMPLATES[name];
  if (!template) throw new TemplateError('no_template', `the plan names no known template (${name ?? 'none'})`);
  const slots = template.normalize(scene.slots ?? {}), quantities = new Map(scene.quantities.map(q => [q.id, q]));
  // The bodies the template draws: one for one-body and body-plot, two lanes (in the plan's order) for two-lane.
  const bodies = name === 'two-lane' ? template.lanesOf(slots).map(lane => slots[lane]) : [slots];
  if (name === 'two-lane' && bodies.length !== 2) throw new TemplateError('slot_missing', 'template two-lane needs exactly two lanes in the slots');
  for (const body of bodies) for (const role of template.roles) if (!quantities.has(body[role])) throw new TemplateError('slot_missing', `template ${name} needs the slot "${role}" to name one of the plan's quantities`);
  if (name === 'body-plot') for (const role of ['force', 'plotted']) if (slots[role] !== undefined && !quantities.has(slots[role])) throw new TemplateError('slot_missing', `template ${name} slot "${role}" names no quantity of the plan`);

  const declarations = buildInput.controlBindings.filter(binding => binding.in === 'manifest.inputs').map(binding => binding.declaration);
  const numberInputs = declarations.filter(input => input.type === 'number'), scope = formulaScope(plan), fixed = scope.fixed, inputIds = numberInputs.map(input => input.id);

  // The quantity table: one JS expression per quantity over the inputs and t, piecewise as a ternary on t.
  const parsed = {}, js = {};
  for (const quantity of scene.quantities) {
    // an input quantity with no formula of its own is the bare input name (its value is the input or the fixed number)
    const trees = parseQuantity(quantity.formula === undefined && (inputIds.includes(quantity.id) || quantity.id in fixed) ? { ...quantity, formula: quantity.id } : quantity, scope);
    if (!trees) throw new TemplateError('no_formula', `the quantity "${quantity.id}" has no formula; a template build reads every quantity from one`);
    parsed[quantity.id] = trees;
    js[quantity.id] = trees.formulaAfter ? `(t < ${exprToJs(trees.switchAt)} ? ${exprToJs(trees.formula)} : ${exprToJs(trees.formulaAfter)})` : exprToJs(trees.formula);
  }
  const timeline = plan.mode.timeline;
  if (!timeline) throw new TemplateError('no_timeline', 'a template build needs the plan\'s timeline');
  const endExpr = fixLiterals(timeline.end, fixed);

  // The range the geometry must fit: the largest rise above the launch height, the longest timeline end and the plotted quantity's largest size, over the corners and middle of every input range.
  const body = bodies[0], plotted = slots.plotted ?? body.velocity;
  const evalQ = (id, values, t) => { const q = parsed[id], at = { ...values, t }; return q.formulaAfter && t >= evalScalar(q.switchAt, values) ? evalScalar(q.formulaAfter, at) : evalScalar(q.formula, at); };
  const topAt = (values, end) => { // the body's velocity crosses zero (bisection), as the program finds it
    if (evalQ(body.velocity, values, 0) <= 0) return 0;
    let lo = 0, hi = end;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (evalQ(body.velocity, values, mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  let grid = [{}];
  for (const input of numberInputs) grid = grid.flatMap(values => [input.min, (input.min + input.max) / 2, input.max].map(value => ({ ...values, [input.id]: value })));
  const range = { rise: 0, end: 0, plotted: 0 };
  for (const values of grid) {
    const end = evalScalar(endExpr, { ...values, t: 0 });
    range.rise = Math.max(range.rise, evalQ(body.height, values, topAt(values, end)) - evalQ(body.height, values, 0));
    range.end = Math.max(range.end, end);
    range.plotted = Math.max(range.plotted, Math.abs(evalQ(plotted, values, 0)), Math.abs(evalQ(plotted, values, end)));
  }

  const unitOf = id => superscripts(quantities.get(id)?.unit);
  const units = { height: unitOf(body.height), velocity: unitOf(body.velocity), acceleration: unitOf(body.acceleration), ...(slots.force ? { force: unitOf(slots.force) } : {}) };
  const geometry = template.geometry(range), readoutIds = scene.readoutIds;
  const wordProblems = TEMPLATE_WORDS[name].filter(({ key, max }) => typeof scene.words?.[key] !== 'string' || !scene.words[key].trim() || scene.words[key].length > max).map(({ key }) => key);
  if (wordProblems.length) throw new TemplateError('words_missing', `template ${name} needs scene.words for ${wordProblems.join(', ')}`);
  const ctx = { words: nestWords(name, scene.words), slots, q: js, end: exprToJs(endExpr), inputIds, readoutIds, units, geometry, timeline: { label: timeline.label, unit: timeline.unit ?? 's' } };
  const source = template.source(ctx);

  // The manifest: every value the plan or buildInput holds, copied; the state readouts' definitions are the template's (the plan names only their ids).
  const states = template.states(ctx.words), velocities = bodies.map(b => b.velocity), accelerations = bodies.map(b => b.acceleration);
  const decimalsOf = id => (velocities.includes(id) ? 2 : accelerations.includes(id) || id === slots.force ? 1 : 2);
  const readouts = readoutIds.map(id => {
    if (states[id]) return { id, ...states[id] };
    const quantity = quantities.get(id);
    if (!quantity) throw new TemplateError('readout_unknown', `the readout "${id}" is neither one of the plan's quantities nor a state this template reports`);
    return { id, label: quantity.label, unit: quantity.unit, decimals: decimalsOf(id) };
  });
  const atDefault = buildInput.timeline.atDefaultInputs;
  const manifest = {
    title: plan.title, summary: sentences(plan.cardDescription, 400), assumptions: plan.assumptions ?? [], description: sentences(plan.cardDescription, 600),
    inputs: declarations, duration: buildInput.timeline.durationSeconds,
    timeline: { label: buildInput.timeline.label, displayOffset: atDefault.displayOffset, playbackRate: buildInput.timeline.playbackRate, markers: atDefault.markers.map(({ id, label, time }) => ({ id, label, time })) },
    readouts, capabilities: scene.runtime.requiredCapabilities,
  };
  return { source, manifest };
}
