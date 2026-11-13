import { evalScalar } from '../interact-plan.js';
import { parseFormula, exprToJs } from '../interact-formula.js';
import * as oneBody from './one-body.js';
import * as twoLane from './two-lane.js';
import * as bodyPlot from './body-plot.js';

// generateProgram(plan, buildInput) -> { source, manifest }: the program for a plan that names a template, written by trusted code and no model. The plan carries the physics (each quantity's
// formula, piecewise through switchAt / formulaAfter), the controls, the ranges and the timeline; buildInput carries the exact control declarations and timeline (interact-build.js buildInput). A
// template (./one-body.js, ./two-lane.js, ./body-plot.js) owns the drawing, the geometry and the words the plan does not hold. A plan the template cannot build is a TemplateError (our bug or a plan
// that names slots it does not have), never a model call or a repair.
export const TEMPLATES = Object.freeze({ 'one-body': oneBody, 'two-lane': twoLane, 'body-plot': bodyPlot });

export class TemplateError extends Error {
  constructor(code, message) { super(message); this.name = 'TemplateError'; this.code = code; }
}

const fixLiterals = (expr, fixed) => {
  if (!expr || typeof expr !== 'object') return expr;
  if (expr.op === 'input' && Object.hasOwn(fixed, expr.id)) return { op: 'literal', value: fixed[expr.id] };
  return expr.left ? { ...expr, left: fixLiterals(expr.left, fixed), right: fixLiterals(expr.right, fixed) } : expr;
};
// The first sentences of a text that fit `max` characters, math marks removed (the manifest's summary and accessible description are plain text).
const sentences = (text, max) => {
  const plain = text.replace(/\$/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max), end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.'));
  return end > 0 ? cut.slice(0, end + 1) : cut.trim();
};
const superscripts = unit => String(unit ?? '').replace('^2', '²').replace('^3', '³');

// Every slot value of a template's roles, flat: 'height' or 'toss.height' -> quantity id.
const slotOf = (slots, role) => role.split('.').reduce((node, key) => node?.[key], slots);

export function generateProgram(plan, buildInput) {
  const scene = plan.scene, name = scene.template, template = TEMPLATES[name];
  if (!template) throw new TemplateError('no_template', `the plan names no known template (${name ?? 'none'})`);
  const slots = template.normalize ? template.normalize(scene.slots ?? {}) : (scene.slots ?? {}), quantities = new Map(scene.quantities.map(q => [q.id, q]));
  const roleProblem = template.roles.find(role => !quantities.has(slotOf(slots, role)));
  if (roleProblem) throw new TemplateError('slot_missing', `template ${name} needs the slot "${roleProblem}" to name one of the plan's quantities`);

  const declarations = buildInput.controlBindings.filter(binding => binding.in === 'manifest.inputs').map(binding => binding.declaration);
  const numberInputs = declarations.filter(input => input.type === 'number'), fixed = plan.mode.fixedValues ?? {};
  const inputIds = numberInputs.map(input => input.id), names = ['t', ...inputIds, ...Object.keys(fixed)];
  const parse = text => fixLiterals(parseFormula(text, { names, fixed }), fixed);

  // The quantity table: one JS expression per quantity over the inputs and t, piecewise as a ternary on t.
  const exprs = {}, js = {};
  for (const quantity of scene.quantities) {
    if (!quantity.formula) throw new TemplateError('no_formula', `the quantity "${quantity.id}" has no formula; a template build reads every quantity from one`);
    const after = quantity.formulaAfter ? parse(quantity.formulaAfter) : null, first = parse(quantity.formula), switchAt = quantity.switchAt ? parse(quantity.switchAt) : null;
    exprs[quantity.id] = { first, after, switchAt };
    js[quantity.id] = after ? `(t < ${exprToJs(switchAt)} ? ${exprToJs(first)} : ${exprToJs(after)})` : exprToJs(first);
  }
  const timeline = plan.mode.timeline;
  if (!timeline) throw new TemplateError('no_timeline', 'a template build needs the plan\'s timeline');
  const endExpr = fixLiterals(timeline.end, fixed);

  // The range the geometry must fit: the largest rise above the launch height, the longest timeline end and the plotted quantity's largest size, over the corners and middle of every input range.
  const body = name === 'two-lane' ? slots.toss : slots, plotted = slots.plotted ?? body.velocity;
  const evalQ = (id, values, t) => { const q = exprs[id]; const at = { ...values, t }; return q.after && t >= evalScalar(q.switchAt, at) ? evalScalar(q.after, at) : evalScalar(q.first, at); };
  let grid = [{}];
  for (const input of numberInputs) grid = grid.flatMap(values => [input.min, (input.min + input.max) / 2, input.max].map(value => ({ ...values, [input.id]: value })));
  const range = { rise: 0, end: 0, plotted: 0 };
  for (const values of grid) {
    const end = evalScalar(endExpr, { ...values, t: 0 });
    range.rise = Math.max(range.rise, evalQ(body.apexHeight, values, 0) - evalQ(body.height, values, 0));
    range.end = Math.max(range.end, end);
    range.plotted = Math.max(range.plotted, Math.abs(evalQ(plotted, values, 0)), Math.abs(evalQ(plotted, values, end)));
  }

  const unitOf = id => superscripts(quantities.get(id)?.unit);
  const units = { height: unitOf(body.height), velocity: unitOf(body.velocity), acceleration: unitOf(body.acceleration), ...(body.force || slots.force ? { force: unitOf(slots.force) } : {}) };
  const geometry = template.geometry(range);
  const readoutIds = scene.readoutIds;
  const ctx = { slots, q: js, end: exprToJs(endExpr), inputIds, readoutIds, units, geometry, timeline: { label: timeline.label, unit: timeline.unit ?? 's' } };
  const source = template.source(ctx);

  // The manifest: every value the plan or buildInput holds, copied; the state readouts' definitions are the template's (the plan names only their ids).
  const states = template.words.states ?? {}, decimals = { velocity: 2, acceleration: 1, force: 1 };
  const decimalsOf = id => (id === body.velocity || id === slots.toss?.velocity || id === slots.drop?.velocity ? decimals.velocity : id === slots.force ? decimals.force : id === body.acceleration || id === slots.drop?.acceleration ? decimals.acceleration : 2);
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
