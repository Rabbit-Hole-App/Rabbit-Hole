import { z } from 'zod';
import { canonicalJson, validateVisualBrief } from './explain-contract.js';
import { CAPABILITIES, CONTRACT_LIMITS } from './explain-program/contract.js';
import { SUPPORTED_PROGRAM_TUPLES } from './explain-program/stamps.js';

// ScenePlan v1 (docs/features/interact.md section 5, INT-01): the one pure contract shared by design, review, build and the
// saved card. Server-safe: zod and pure helpers only, no model call, network or DOM. Nothing is stripped or truncated: a plan
// either parses whole or returns problems with a path and a cause.
export const SCENE_PLAN_VERSION = 1;

// Engineering defaults from the spec (not measured claims); a valid request that needs more is a capability gap.
export const PLAN_LIMITS = Object.freeze({
  title: 120, story: 12000, cardDescription: 500, entry: 1200, label: 60,
  entities: 24, quantities: 16, observations: 12, checkpoints: 12, claims: 32, controls: 24, supports: 2,
  markers: 12, // ponytail: the spec bounds markers only as "bounded"; 12 matches checkpoints, raise on a real need
  items: 256, exprNodes: 32, exprDepth: 8, timeline: CONTRACT_LIMITS.duration,
  playbackRate: 10, // ponytail: no host transport ceiling is defined yet; 10 physics-seconds per wall-second is a sanity bound
});

// ---- ScalarExpr: bounded arithmetic over literals and declared number inputs. Data, never code: no eval, no strings. ----------

export class ScalarExprError extends Error {
  constructor(code, message) { super(message); this.name = 'ScalarExprError'; this.code = code; }
}
const BINARY = ['add', 'subtract', 'multiply', 'divide'];
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/; // a stable id; also a legal program input/action name

// The first structural problem in an expression, or null. Iterative limits first: depth and node count stop the walk, so a
// hostile deeply nested payload cannot overflow the stack.
export function scalarExprProblem(expr) {
  let nodes = 0, problem = null;
  const fail = (path, message) => { problem ||= { path, message }; };
  const walk = (node, depth, path) => {
    if (problem) return;
    if (++nodes > PLAN_LIMITS.exprNodes) return fail(path, `an expression has at most ${PLAN_LIMITS.exprNodes} nodes`);
    if (depth > PLAN_LIMITS.exprDepth) return fail(path, `an expression is at most ${PLAN_LIMITS.exprDepth} levels deep`);
    if (!node || typeof node !== 'object' || Array.isArray(node)) return fail(path, 'an expression node is an object {op, ...}; expression strings are never evaluated');
    const keys = Object.keys(node).sort().join(',');
    if (node.op === 'literal') {
      if (keys !== 'op,value') return fail(path, 'a literal is exactly {op:"literal", value}');
      if (typeof node.value !== 'number' || !Number.isFinite(node.value)) return fail([...path, 'value'], 'a literal value is a finite number');
    } else if (node.op === 'input') {
      if (keys !== 'id,op') return fail(path, 'an input node is exactly {op:"input", id}');
      if (typeof node.id !== 'string' || !NAME.test(node.id)) return fail([...path, 'id'], 'an input id is a stable id');
    } else if (BINARY.includes(node.op)) {
      if (keys !== 'left,op,right') return fail(path, `${node.op} is exactly {op, left, right}`);
      walk(node.left, depth + 1, [...path, 'left']);
      walk(node.right, depth + 1, [...path, 'right']);
    } else fail([...path, 'op'], 'op is one of literal, input, add, subtract, multiply, divide');
  };
  walk(expr, 1, []);
  return problem;
}
const checkedExpr = expr => { const problem = scalarExprProblem(expr); if (problem) throw new ScalarExprError('unsafe_expression', problem.message); };
const finite = number => { if (!Number.isFinite(number)) throw new ScalarExprError('non_finite', 'an expression produced a non-finite number'); return number; };

// Evaluate at one point. `domains` ({id:[min,max]}) makes an input outside its declared range a refusal.
export function evalScalar(expr, values = {}, domains = {}) {
  checkedExpr(expr);
  const go = node => {
    if (node.op === 'literal') return node.value;
    if (node.op === 'input') {
      const value = values[node.id];
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new ScalarExprError('unknown_input', `input "${node.id}" is not a declared number input with a value`);
      const domain = domains[node.id];
      if (domain && (value < domain[0] || value > domain[1])) throw new ScalarExprError('out_of_domain', `input "${node.id}" = ${value} is outside ${domain[0]}..${domain[1]}`);
      return value;
    }
    const left = go(node.left), right = go(node.right);
    if (node.op === 'add') return finite(left + right);
    if (node.op === 'subtract') return finite(left - right);
    if (node.op === 'multiply') return finite(left * right);
    if (right === 0) throw new ScalarExprError('division_by_zero', 'division by zero');
    return finite(left / right);
  };
  return go(expr);
}

// Sound interval over the whole admitted input domain ({id:[min,max]}). Throws when safety cannot be established (an unknown
// input, a divisor interval containing zero, overflow). shortcut: plain interval arithmetic loses correlation between repeated
// inputs, so it can refuse an expression that is in fact safe; widen the language only with a proof, never weaken the refusal.
export function scalarInterval(expr, domains = {}) {
  checkedExpr(expr);
  const bounds = list => [Math.min(...list), Math.max(...list)];
  const go = node => {
    if (node.op === 'literal') return [node.value, node.value];
    if (node.op === 'input') {
      const domain = domains[node.id];
      if (!domain) throw new ScalarExprError('unknown_input', `input "${node.id}" is not a declared number input`);
      return domain;
    }
    const [a0, a1] = go(node.left), [b0, b1] = go(node.right);
    let result;
    if (node.op === 'add') result = [a0 + b0, a1 + b1];
    else if (node.op === 'subtract') result = [a0 - b1, a1 - b0];
    else if (node.op === 'multiply') result = bounds([a0 * b0, a0 * b1, a1 * b0, a1 * b1]);
    else {
      if (b0 <= 0 && b1 >= 0) throw new ScalarExprError('division_by_zero', 'a divisor can be zero within the admitted input range');
      result = bounds([a0 / b0, a0 / b1, a1 / b0, a1 / b1]);
    }
    finite(result[0]); finite(result[1]);
    return result;
  };
  return go(expr);
}

const scalarExpr = z.unknown().superRefine((expr, ctx) => {
  const problem = scalarExprProblem(expr);
  if (problem) ctx.addIssue({ code: 'custom', message: problem.message, path: problem.path, params: { code: 'unsafe_expression' } });
}).meta({ $ref: '#/$defs/ScalarExpr' });

// ---- shapes ---------------------------------------------------------------------------------------------------------------

const HTML_TAG = /<\/?[a-zA-Z][^>]*>/;
const URL_LIKE = /\b(?:https?|ftp):\/\/|\bjavascript:|\bwww\./i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// Plain text only: rendered as text nodes, never parsed. A tag-shaped run is refused; prose may still use < and > as symbols.
const text = (max = PLAN_LIMITS.entry) => z.string().min(1).max(max)
  .refine(value => value.trim().length > 0, 'must not be blank').refine(value => !HTML_TAG.test(value), 'raw HTML is not allowed');
const controlText = max => text(max).refine(value => !URL_LIKE.test(value), 'a URL is not allowed in a control');
const id = z.string().regex(NAME, 'not a stable id: a letter then letters, digits or _, at most 32');
const hash = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 hex digest');
const scalar = z.union([z.number().finite(), z.string().max(PLAN_LIMITS.entry), z.boolean()]);
const idList = max => z.array(id).max(max);

const entity = z.object({ id, label: text(PLAN_LIMITS.label), purpose: text() }).strict();
const quantity = z.object({ id, label: text(PLAN_LIMITS.label), unit: z.string().max(16), meaning: text(), reference: text(), relation: text().optional() }).strict();
const observation = z.object({ id, text: text(), quantityIds: idList(16), readoutIds: idList(16) }).strict();
const checkpoint = z.object({
  id, label: text(PLAN_LIMITS.label), time: scalarExpr.nullable(), inputOverrides: z.record(id, scalar), actions: idList(8), expected: text(),
}).strict();

// One runtime record per panel. A spec panel nulls the program-only fields; a program panel carries the sealed tuple.
const stringList = z.array(z.string().min(1).max(64)).max(16);
const runtimeBase = { requiredHelpers: stringList, requiredCapabilities: stringList, catalogueHash: hash };
const runtime = z.discriminatedUnion('renderer', [
  z.object({ renderer: z.literal('spec'), schemaVersion: z.number().int().min(1), sdkVersion: z.null(), programTuple: z.null(), ...runtimeBase }).strict(),
  z.object({ renderer: z.literal('program'), schemaVersion: z.union([z.literal(1), z.literal(2)]), sdkVersion: z.string().min(1).max(64), programTuple: z.record(z.string(), z.unknown()), ...runtimeBase }).strict()
    .refine(value => value.programTuple.schemaVersion === value.schemaVersion && value.programTuple.sdkVersion === value.sdkVersion,
      { message: 'schemaVersion and sdkVersion must equal those of programTuple', path: ['programTuple'], params: { code: 'runtime_tuple_mismatch' } }),
]);

const affect = z.object({ scope: id, kind: z.enum(['entity', 'quantity', 'readout']), id }).strict();
const support = z.object({
  id, title: text(PLAN_LIMITS.title), description: text(), runtime, observations: z.array(observation).max(PLAN_LIMITS.observations),
  parameterBindings: z.array(z.object({ fromInputId: id, toInputId: id }).strict()).max(8), readoutIds: idList(16),
}).strict();

const inputBinding = z.object({ kind: z.literal('input'), id }).strict();
const timelineBinding = z.object({ kind: z.literal('timeline') }).strict();
const controlBase = {
  id, label: controlText(PLAN_LIMITS.label), purpose: controlText(PLAN_LIMITS.entry), selectionReason: controlText(PLAN_LIMITS.entry),
  nativeControlId: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/, 'not a catalogue id'), affects: z.array(affect).min(1).max(16),
};
const items = z.array(z.object({ id, label: controlText(PLAN_LIMITS.label) }).strict()).min(2).max(PLAN_LIMITS.items);
const control = z.discriminatedUnion('type', [
  z.object({ ...controlBase, type: z.literal('playback'), binding: timelineBinding, labels: z.object({ paused: z.literal('Play'), playing: z.literal('Pause'), ended: z.literal('Replay') }).strict() }).strict(),
  z.object({ ...controlBase, type: z.literal('scrubber'), binding: timelineBinding, unit: z.literal('s'), step: z.number().positive().finite() }).strict(),
  z.object({ ...controlBase, type: z.literal('number'), binding: inputBinding, unit: z.string().max(16), default: z.number().finite(), min: z.number().finite(), max: z.number().finite(), step: z.number().positive().finite() }).strict(),
  z.object({ ...controlBase, type: z.literal('select'), binding: inputBinding, default: z.string(), options: z.array(z.object({ value: z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/), label: controlText(PLAN_LIMITS.label) }).strict()).min(2).max(CONTRACT_LIMITS.options) }).strict(),
  z.object({ ...controlBase, type: z.literal('boolean'), binding: inputBinding, default: z.boolean() }).strict(),
  z.object({ ...controlBase, type: z.literal('index'), binding: inputBinding, default: z.number().int().min(0), dataRef: id, items, presentation: z.enum(['picker', 'slider']) }).strict(),
  z.object({ ...controlBase, type: z.literal('multi_select'), binding: inputBinding, default: z.array(z.number().int().min(0)).max(PLAN_LIMITS.items), dataRef: id, items }).strict(),
  z.object({ ...controlBase, type: z.literal('action'), binding: z.object({ kind: z.literal('action'), id }).strict(), effect: controlText(PLAN_LIMITS.entry) }).strict(),
  z.object({ ...controlBase, type: z.literal('target'), binding: z.object({ kind: z.literal('target'), id }).strict(), interaction: z.enum(['select', 'drag']), effect: controlText(PLAN_LIMITS.entry) }).strict(),
  z.object({ ...controlBase, type: z.literal('reset'), binding: z.object({ kind: z.literal('reset') }).strict(), effect: controlText(PLAN_LIMITS.entry) }).strict(),
]);

const timeline = z.object({
  label: text(PLAN_LIMITS.label), unit: z.literal('s'), start: z.literal(0), end: scalarExpr, displayOffset: scalarExpr,
  markers: z.array(z.object({ id, label: text(PLAN_LIMITS.label), time: scalarExpr }).strict()).max(PLAN_LIMITS.markers),
  initialTime: z.literal(0), initialPlayback: z.literal('paused'), playbackRate: z.number().positive().finite().max(PLAN_LIMITS.playbackRate),
}).strict();

const scene = z.object({
  description: text(), runtime, entities: z.array(entity).max(PLAN_LIMITS.entities), quantities: z.array(quantity).max(PLAN_LIMITS.quantities),
  observations: z.array(observation).max(PLAN_LIMITS.observations), checkpoints: z.array(checkpoint).max(PLAN_LIMITS.checkpoints), readoutIds: idList(16),
}).strict();
const mode = z.object({
  kind: z.enum(['static', 'time', 'experiment']), initialState: text(), fixedValues: z.record(id, scalar), adjustableIds: idList(8),
  timeline: timeline.nullable(), onInputChange: z.enum(['recompute_still', 'reset_pause']),
}).strict();
const claim = z.object({ id, text: text(), evidenceIds: z.array(z.string().min(1).max(128)).max(16), check: text() }).strict();

// A card description is plain text the card shows in 2 to 4 rendered lines. The schema bounds the input (500 characters);
// whether it renders in 2 to 4 lines is a fit receipt (DescriptionFitSchema), because character count is no substitute.
const cardDescription = z.string().min(1).max(PLAN_LIMITS.cardDescription).refine(value => value.trim().length > 0, 'must not be blank')
  .refine(value => !HTML_TAG.test(value) && !CONTROL_CHARS.test(value), 'plain single-paragraph text only');

const planShape = z.object({
  schemaVersion: z.literal(SCENE_PLAN_VERSION, { error: () => `unknown ScenePlan version: expected ${SCENE_PLAN_VERSION}` }),
  depth: z.enum(['brief', 'balanced', 'detailed', 'overview', 'standard', 'deep']), // brief | balanced | detailed; the old names stay readable (a plan saved before the 2026-11-08 rename keeps its hash)
  title: text(PLAN_LIMITS.title), story: text(PLAN_LIMITS.story), cardDescription, learningGoal: text(),
  supportingVisuals: z.array(support).max(PLAN_LIMITS.supports), scene, mode,
  controls: z.array(control).max(PLAN_LIMITS.controls),
  assumptions: z.array(text()).max(16), limitations: z.array(text()).max(16), claims: z.array(claim).max(PLAN_LIMITS.claims),
}).strict();

// ---- cross-field consistency ----------------------------------------------------------------------------------------------

// Strict schemas already refuse every unknown or script-bearing key (explain-contract's findExecutable also bans keys named on*,
// which would refuse the spec's own mode.onInputChange), so only string values need scanning. Iterative: no stack growth.
const EXECUTABLE_TEXT = /^\s*(javascript|vbscript|data)\s*:|@import\b/i;
function executableString(root) {
  const stack = [[root, []]];
  for (let visited = 0; stack.length && visited < 50000; visited += 1) {
    const [value, path] = stack.pop();
    if (typeof value === 'string') { if (EXECUTABLE_TEXT.test(value)) return path; }
    else if (value && typeof value === 'object') for (const key of Object.keys(value)) stack.push([value[key], [...path, key]]);
  }
  return null;
}

export function planProblems(plan) {
  const out = [];
  const bad = (path, code, message) => out.push({ path, code, message });
  const found = executableString(plan);
  if (found) bad(found, 'executable_content', 'executable text is not allowed');
  const dupes = (path, list, key = item => item.id, code = 'duplicate_id') => {
    const seen = new Set();
    list.forEach((item, index) => { const k = key(item); if (seen.has(k)) bad([...path, index], code, `duplicate "${k}"`); seen.add(k); });
  };
  const { scene: main, mode: modeBlock, controls, supportingVisuals: supports } = plan;
  const tl = modeBlock.timeline;

  dupes(['scene', 'entities'], main.entities);
  dupes(['scene', 'quantities'], main.quantities);
  dupes(['scene', 'observations'], main.observations);
  dupes(['scene', 'checkpoints'], main.checkpoints);
  dupes(['scene', 'readoutIds'], main.readoutIds, x => x);
  dupes(['supportingVisuals'], supports);
  dupes(['controls'], controls);
  dupes(['claims'], plan.claims);
  if (tl) dupes(['mode', 'timeline', 'markers'], tl.markers);
  supports.forEach((panel, i) => {
    if (panel.id === 'main') bad(['supportingVisuals', i, 'id'], 'duplicate_id', '"main" names the main scene');
    dupes(['supportingVisuals', i, 'observations'], panel.observations);
    dupes(['supportingVisuals', i, 'readoutIds'], panel.readoutIds, x => x);
  });
  dupes(['controls'], controls, c => (c.binding.kind === 'timeline' ? `timeline:${c.type}` : c.binding.kind === 'reset' ? 'reset' : `${c.binding.kind}:${c.binding.id}`), 'duplicate_binding');

  // Controls: per-type domain checks and the declared inputs/actions.
  const inputs = new Map(), actionIds = new Set(), domains = {};
  controls.forEach((c, i) => {
    const at = key => ['controls', i, key];
    if (c.binding.kind === 'input') inputs.set(c.binding.id, c);
    if (c.binding.kind === 'action') actionIds.add(c.binding.id);
    if (c.type === 'number') {
      if (!(c.min < c.max)) bad(at('max'), 'range_invalid', 'min must be below max');
      else {
        domains[c.binding.id] = [c.min, c.max];
        const steps = (c.default - c.min) / c.step;
        if (c.default < c.min || c.default > c.max) bad(at('default'), 'default_out_of_range', 'default must lie in min..max');
        else if (Math.abs(steps - Math.round(steps)) > 1e-6) bad(at('default'), 'default_off_grid', 'default must sit on the step grid from min');
      }
    } else if (c.type === 'select') {
      dupes(['controls', i, 'options'], c.options, o => o.value);
      if (!c.options.some(o => o.value === c.default)) bad(at('default'), 'default_not_an_option', 'default must be one of the options');
    } else if (c.type === 'index' || c.type === 'multi_select') {
      dupes(['controls', i, 'items'], c.items);
      const n = c.items.length, inside = v => Number.isInteger(v) && v >= 0 && v < n;
      if (c.type === 'index' && !inside(c.default)) bad(at('default'), 'default_out_of_range', `default must be an item position 0..${n - 1}`);
      if (c.type === 'multi_select' && !(c.default.every(inside) && c.default.every((v, k) => k === 0 || v > c.default[k - 1]))) bad(at('default'), 'default_out_of_range', `default must be a sorted unique list of positions 0..${n - 1}`);
    }
  });

  // Mode, timeline and controls agree.
  const kinds = type => controls.filter(c => c.type === type);
  const mutable = inputs.size > 0 || kinds('action').length > 0 || kinds('target').length > 0;
  const transport = kinds('playback').length + kinds('scrubber').length;
  if (tl && (kinds('playback').length !== 1 || kinds('scrubber').length !== 1)) bad(['controls'], 'timeline_controls_mismatch', 'a timed plan declares exactly one playback and one scrubber control');
  if (!tl && transport) bad(['controls'], 'timeline_controls_mismatch', 'playback and scrubber controls need mode.timeline');
  if (modeBlock.onInputChange !== (tl ? 'reset_pause' : 'recompute_still')) bad(['mode', 'onInputChange'], 'on_input_change_mismatch', tl ? 'a timed scene uses reset_pause' : 'an untimed scene uses recompute_still');
  if (modeBlock.kind === 'static' && tl) bad(['mode', 'timeline'], 'mode_mismatch', 'Static has no timeline');
  if (modeBlock.kind === 'time' && !tl) bad(['mode', 'timeline'], 'mode_mismatch', 'Over time needs a timeline');
  if (modeBlock.kind === 'time' && (mutable || kinds('reset').length)) bad(['controls'], 'mode_mismatch', 'Over time has fixed inputs; transport controls are not experiment inputs');
  if (modeBlock.kind === 'experiment' && !mutable) bad(['mode', 'kind'], 'mode_mismatch', 'Experiment needs an adjustable input, an action or a target');
  if (kinds('reset').length && !mutable) bad(['controls'], 'mode_mismatch', 'Reset needs something to restore');
  dupes(['mode', 'adjustableIds'], modeBlock.adjustableIds, x => x);
  modeBlock.adjustableIds.forEach((name, i) => { if (!inputs.has(name)) bad(['mode', 'adjustableIds', i], 'dangling_reference', `adjustable input "${name}" has no control`); });
  for (const name of inputs.keys()) if (!modeBlock.adjustableIds.includes(name)) bad(['mode', 'adjustableIds'], 'dangling_reference', `input "${name}" has a control but is not in adjustableIds`);
  const quantityIds = new Set(main.quantities.map(q => q.id));
  for (const name of Object.keys(modeBlock.fixedValues)) {
    if (!quantityIds.has(name)) bad(['mode', 'fixedValues', name], 'dangling_reference', `fixed value "${name}" has no quantity recording its unit`);
    if (modeBlock.adjustableIds.includes(name)) bad(['mode', 'fixedValues', name], 'duplicate_id', `"${name}" cannot be both fixed and adjustable`);
  }

  // Timeline arithmetic over the whole admitted input domain, not only the defaults.
  const span = (expr, path) => { try { return scalarInterval(expr, domains); } catch (error) { bad(path, error.code || 'unsafe_expression', error.message); return null; } };
  if (tl) {
    const end = span(tl.end, ['mode', 'timeline', 'end']);
    span(tl.displayOffset, ['mode', 'timeline', 'displayOffset']);
    if (end && !(end[0] > 0 && end[1] <= PLAN_LIMITS.timeline)) bad(['mode', 'timeline', 'end'], 'out_of_domain', `the end must stay positive and within ${PLAN_LIMITS.timeline} s for every admitted input (resolved ${end[0]}..${end[1]})`);
    const inside = (expr, path) => {
      const t = span(expr, path);
      if (!t || !end) return;
      if (t[0] < 0) return bad(path, 'out_of_domain', 'a time before 0 is outside the elapsed timeline');
      if (canonicalJson(expr) === canonicalJson(tl.end)) return; // exactly the end: trivially inside
      const gap = span({ op: 'subtract', left: tl.end, right: expr }, path);
      if (gap && gap[0] < 0) bad(path, 'out_of_domain', 'a time can land after the end for some admitted input');
    };
    tl.markers.forEach((marker, i) => inside(marker.time, ['mode', 'timeline', 'markers', i, 'time']));
    main.checkpoints.forEach((cp, i) => { if (cp.time) inside(cp.time, ['scene', 'checkpoints', i, 'time']); });
  }
  main.checkpoints.forEach((cp, i) => {
    if (!tl && cp.time) bad(['scene', 'checkpoints', i, 'time'], 'mode_mismatch', 'an untimed scene has null checkpoint times');
    if (tl && !cp.time) bad(['scene', 'checkpoints', i, 'time'], 'mode_mismatch', 'a timed scene gives every checkpoint a time');
    cp.actions.forEach((action, k) => { if (!actionIds.has(action)) bad(['scene', 'checkpoints', i, 'actions', k], 'dangling_reference', `action "${action}" is not declared`); });
    for (const [name, value] of Object.entries(cp.inputOverrides)) {
      const at = ['scene', 'checkpoints', i, 'inputOverrides', name], c = inputs.get(name);
      if (!c) bad(at, 'dangling_reference', `input "${name}" is not declared`);
      else if (c.type === 'multi_select') bad(at, 'override_not_scalar', 'a multi_select value is a list, not a JSON scalar');
      else if (c.type === 'number' ? !(typeof value === 'number' && value >= c.min && value <= c.max)
        : c.type === 'select' ? !c.options.some(o => o.value === value)
          : c.type === 'boolean' ? typeof value !== 'boolean'
            : !(Number.isInteger(value) && value >= 0 && value < c.items.length)) bad(at, 'out_of_domain', `${JSON.stringify(value)} is outside the declared domain of "${name}"`);
    }
  });

  // References resolve inside their own panel; main and support namespaces are never interchangeable.
  const mainRefs = { entity: new Set(main.entities.map(e => e.id)), quantity: quantityIds, readout: new Set(main.readoutIds) };
  const refs = (path, observations, quantities, readouts) => observations.forEach((o, i) => {
    o.quantityIds.forEach((q, k) => { if (!quantities.has(q)) bad([...path, i, 'quantityIds', k], 'dangling_reference', `quantity "${q}" is not declared for this panel`); });
    o.readoutIds.forEach((r, k) => { if (!readouts.has(r)) bad([...path, i, 'readoutIds', k], 'dangling_reference', `readout "${r}" is not declared for this panel`); });
  });
  refs(['scene', 'observations'], main.observations, quantityIds, mainRefs.readout);
  const supportReadouts = new Map(supports.map(s => [s.id, new Set(s.readoutIds)]));
  supports.forEach((panel, i) => {
    refs(['supportingVisuals', i, 'observations'], panel.observations, new Set(), supportReadouts.get(panel.id)); // a support declares no quantities
    dupes(['supportingVisuals', i, 'parameterBindings'], panel.parameterBindings, b => b.toInputId, 'duplicate_binding');
    // ponytail: toInputId names an input of the support panel's own program; the builder checks it against the built panel.
    panel.parameterBindings.forEach((b, k) => { if (!inputs.has(b.fromInputId)) bad(['supportingVisuals', i, 'parameterBindings', k, 'fromInputId'], 'dangling_reference', `main input "${b.fromInputId}" is not declared`); });
  });
  controls.forEach((c, i) => c.affects.forEach((a, k) => {
    const at = ['controls', i, 'affects', k];
    if (a.scope === 'main') { if (!mainRefs[a.kind].has(a.id)) bad(at, 'dangling_reference', `main ${a.kind} "${a.id}" is not declared`); }
    else if (!supportReadouts.has(a.scope)) bad([...at, 'scope'], 'dangling_reference', `panel "${a.scope}" is not declared`);
    else if (a.kind !== 'readout' || !supportReadouts.get(a.scope).has(a.id)) bad(at, 'dangling_reference', `panel "${a.scope}" declares readout ids only, and not "${a.id}"`);
  }));
  return out;
}

// Per-field issues and cross-field checks come from one validator, so a standalone schema.safeParse is as strict as parseScenePlan.
export const ScenePlanSchema = planShape.superRefine((plan, ctx) => {
  for (const p of planProblems(plan)) ctx.addIssue({ code: 'custom', message: p.message, path: p.path, params: { code: p.code } });
});

// ---- design review and revision ---------------------------------------------------------------------------------------------

const score = z.number().int().min(1).max(5);
const finding = z.object({
  id, severity: z.enum(['blocker', 'major', 'minor']), category: z.enum(['fact', 'depth', 'pedagogy', 'layout', 'mode', 'control', 'capability']),
  path: z.string().min(1).max(200), claimId: id.nullable(), message: text(), requiredChange: text(), verification: text(),
}).strict();
const prompted = z.object({ prompt: text(), expectedReasoning: text() }).strict();
export const DesignReviewSchema = z.object({
  planHash: hash,
  learning: z.object({ goal: text(), likelyUnderstanding: text(), visualEvidence: text(), transfer: prompted, teachBack: prompted, improvement: text(), score }).strict(),
  sceneQuality: z.object({ accuracy: text(), clarity: text(), modeControls: text(), buildability: text(), score }).strict(),
  findings: z.array(finding).max(64),
  openChecks: z.array(z.object({ kind: z.enum(['fact_needs_evidence', 'visual_needs_render']), text: text() }).strict()).max(32),
  verdict: z.enum(['pass', 'revise', 'gap']),
}).strict().superRefine((review, ctx) => {
  const ids = review.findings.map(f => f.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'duplicate finding id', path: ['findings'], params: { code: 'duplicate_id' } });
  // A blocker or major finding overrides a claimed pass.
  if (review.verdict === 'pass' && review.findings.some(f => f.severity !== 'minor')) ctx.addIssue({ code: 'custom', message: 'a blocker or major finding cannot accompany a pass verdict', path: ['verdict'], params: { code: 'verdict_overridden' } });
});

// The whole plan comes back, never a patch; no hash or "fixed" flag is accepted (strict), the server computes the hash and diff.
export const DesignRevisionSchema = z.object({
  plan: ScenePlanSchema,
  changes: z.array(z.object({ findingId: id, paths: z.array(z.string().min(1).max(200)).min(1).max(32), explanation: text() }).strict()).max(64),
  unresolvedFindingIds: z.array(id).max(64),
}).strict();

// The request and selected depth stay unchanged across a revision.
export function revisionProblems(previous, revision) {
  const out = [];
  if (revision.plan.depth !== previous.depth) out.push({ path: 'plan.depth', code: 'depth_changed', message: `a revision keeps depth "${previous.depth}"` });
  return out;
}

// ---- parse, bind, hash --------------------------------------------------------------------------------------------------------

const dotted = path => path.map(String).join('.');
function fromIssue(issue) {
  const base = dotted(issue.path);
  if (issue.code === 'unrecognized_keys') return issue.keys.map(key => ({ path: [base, key].filter(Boolean).join('.'), code: 'unknown_field', message: `unknown field "${key}"` }));
  const code = issue.params?.code || (issue.code === 'invalid_type' ? (/received undefined/.test(issue.message) ? 'missing_field' : 'invalid_type') : issue.code === 'too_big' ? 'too_large' : issue.code === 'too_small' ? 'too_small' : issue.code);
  return [{ path: base, code, message: issue.message }];
}

export function validatePlanBindings(plan, capabilities) {
  const out = [];
  const bad = (path, code, message) => out.push({ path: dotted(path), code, message });
  const catalogue = capabilities?.catalogue;
  if (!Array.isArray(catalogue)) return [{ path: '', code: 'capabilities_missing', message: 'capabilities.catalogue (the control catalogue the plan was designed against) is required' }];
  const enabled = new Set(catalogue.map(d => d.renderer));
  const supportedTuples = new Set(SUPPORTED_PROGRAM_TUPLES.map(canonicalJson));

  const checkRuntime = (rt, path) => {
    if (!enabled.has(rt.renderer)) bad(path, 'renderer_unavailable', `the ${rt.renderer} renderer is not enabled`);
    if (rt.catalogueHash !== capabilities.catalogueHash) bad([...path, 'catalogueHash'], 'catalogue_mismatch', 'the plan was designed against a different control catalogue; revise and review again');
    if (rt.renderer !== 'program') return;
    if (!supportedTuples.has(canonicalJson(rt.programTuple))) bad([...path, 'programTuple'], 'unsupported_tuple', 'programTuple is not one of the supported sealed tuples');
    for (const need of rt.requiredCapabilities) if (!CAPABILITIES.includes(need)) bad([...path, 'requiredCapabilities'], 'unsupported_capability', `"${need}" is not a program capability`);
    if (rt.schemaVersion === 2 && !capabilities.stateful) bad([...path, 'schemaVersion'], 'stateful_unavailable', 'the stateful program schema is not enabled');
  };
  checkRuntime(plan.scene.runtime, ['scene', 'runtime']);
  plan.supportingVisuals.forEach((panel, i) => checkRuntime(panel.runtime, ['supportingVisuals', i, 'runtime']));

  // One compatible main renderer: every main control resolves to a catalogue entry of the scene's own renderer and semantic type.
  const renderer = plan.scene.runtime.renderer;
  const used = new Map();
  plan.controls.forEach((c, i) => {
    const at = key => ['controls', i, key];
    const offered = catalogue.filter(d => d.renderer === renderer && d.semanticType === c.type);
    if (!offered.length) return bad(at('type'), 'unsupported_control', `the ${renderer} renderer offers no ${c.type} control${c.type === 'boolean' && renderer === 'program' ? '; plan a two-option select such as Off/On' : ''}`);
    const d = catalogue.find(entry => entry.id === c.nativeControlId);
    if (!d) return bad(at('nativeControlId'), 'unknown_native_control', `"${c.nativeControlId}" is not offered by the enabled catalogue (invented, disabled or unavailable)`);
    if (d.renderer !== renderer || d.semanticType !== c.type) return bad(at('nativeControlId'), 'incompatible_control', `"${d.id}" is a ${d.renderer} ${d.semanticType} control; this plan's main renderer is ${renderer} and this control is a ${c.type}`);
    if (c.type === 'index' && d.presentation !== c.presentation) bad(at('presentation'), 'incompatible_control', `"${d.id}" presents as ${d.presentation}`);
    if (c.type === 'target' && c.interaction === 'drag' && !d.limits.drag) bad(at('interaction'), 'incompatible_control', `"${d.id}" cannot drag`);
    if (c.type === 'select' && c.options.length > (d.limits.maxOptions ?? Infinity)) bad(at('options'), 'limit_exceeded', `"${d.id}" offers at most ${d.limits.maxOptions} options`);
    if ((c.type === 'index' || c.type === 'multi_select') && c.items.length > (d.limits.maxItems ?? Infinity)) bad(at('items'), 'limit_exceeded', `"${d.id}" offers at most ${d.limits.maxItems} items`);
    used.set(d.id, (used.get(d.id) || 0) + 1);
    if (used.get(d.id) > (d.limits.maxControls ?? Infinity)) bad(at('nativeControlId'), 'limit_exceeded', `"${d.id}" is limited to ${d.limits.maxControls} controls`);
    if (d.requires.includes('stateful') && (!capabilities.stateful || plan.scene.runtime.schemaVersion !== 2)) bad(at('nativeControlId'), 'stateful_unavailable', `"${d.id}" needs the stateful program (schema 2), which this plan's runtime does not select`);
  });
  if (renderer === 'program') {
    const inputControls = plan.controls.filter(c => c.type === 'number' || c.type === 'select');
    if (inputControls.length > CONTRACT_LIMITS.inputs) bad(['controls'], 'limit_exceeded', `a program declares at most ${CONTRACT_LIMITS.inputs} inputs`);
    const combos = inputControls.filter(c => c.type === 'select').reduce((n, c) => n * c.options.length, 1);
    if (combos > CONTRACT_LIMITS.optionCombinations) bad(['controls'], 'limit_exceeded', `select options combine to ${combos} states (at most ${CONTRACT_LIMITS.optionCombinations})`);
    if (plan.scene.readoutIds.length > CONTRACT_LIMITS.readouts) bad(['scene', 'readoutIds'], 'limit_exceeded', `a program declares at most ${CONTRACT_LIMITS.readouts} readouts`);
    plan.scene.readoutIds.forEach((r, k) => { if (plan.controls.some(c => c.binding.id === r && c.binding.kind === 'input')) bad(['scene', 'readoutIds', k], 'duplicate_id', `"${r}" is both an input and a readout (they share one namespace)`); });
  }
  const evidence = new Set(capabilities.evidenceIds || []);
  plan.claims.forEach((c, i) => c.evidenceIds.forEach((e, k) => { if (!evidence.has(e)) bad(['claims', i, 'evidenceIds', k], 'unknown_evidence', `evidence "${e}" was not supplied`); }));
  return out;
}

// -> {ok:true,value} | {ok:false,problems:[{path,code,message}]}. Capabilities are required: a plan is never accepted unchecked.
export function parseScenePlan(raw, capabilities) {
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw && raw.schemaVersion !== SCENE_PLAN_VERSION) {
    return { ok: false, problems: [{ path: 'schemaVersion', code: 'unknown_version', message: `unknown ScenePlan version: expected ${SCENE_PLAN_VERSION}` }] };
  }
  const parsed = ScenePlanSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.flatMap(fromIssue) };
  const problems = validatePlanBindings(parsed.data, capabilities);
  return problems.length ? { ok: false, problems } : { ok: true, value: parsed.data };
}

// The provider-facing JSON Schema. Providers may normalise syntax; the reply is always re-checked by parseScenePlan.
const SCALAR_EXPR_DEF = {
  description: `Bounded arithmetic, at most ${PLAN_LIMITS.exprNodes} nodes and ${PLAN_LIMITS.exprDepth} levels. Only declared number inputs are readable.`,
  oneOf: [
    { type: 'object', properties: { op: { const: 'literal' }, value: { type: 'number' } }, required: ['op', 'value'], additionalProperties: false },
    { type: 'object', properties: { op: { const: 'input' }, id: { type: 'string' } }, required: ['op', 'id'], additionalProperties: false },
    { type: 'object', properties: { op: { enum: BINARY }, left: { $ref: '#/$defs/ScalarExpr' }, right: { $ref: '#/$defs/ScalarExpr' } }, required: ['op', 'left', 'right'], additionalProperties: false },
  ],
};
export function scenePlanJsonSchema() {
  const schema = z.toJSONSchema(planShape, { unrepresentable: 'any', io: 'input' });
  schema.$id = `scene-plan-v${SCENE_PLAN_VERSION}`;
  schema.$defs = { ...schema.$defs, ScalarExpr: SCALAR_EXPR_DEF };
  return schema;
}
// The provider-facing schemas of the other two design roles (the validators stay DesignReviewSchema / DesignRevisionSchema; the
// reply is always re-checked by them). The revision embeds the whole plan, so it carries the same ScalarExpr definition.
export function designReviewJsonSchema() {
  const schema = z.toJSONSchema(DesignReviewSchema, { unrepresentable: 'any', io: 'input' });
  schema.$id = `design-review-v${SCENE_PLAN_VERSION}`;
  return schema;
}
export function designRevisionJsonSchema() {
  const schema = z.toJSONSchema(DesignRevisionSchema, { unrepresentable: 'any', io: 'input' });
  schema.$id = `design-revision-v${SCENE_PLAN_VERSION}`;
  schema.$defs = { ...schema.$defs, ScalarExpr: SCALAR_EXPR_DEF };
  return schema;
}

// Hashes are computed here over validated data and are never taken from a model. Async: Web Crypto, as explain-inputs.js does.
export const contentHash = async value => [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value))))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
export async function planHash(plan) {
  const parsed = ScenePlanSchema.safeParse(plan);
  if (!parsed.success) throw new Error(`planHash needs a valid ScenePlan: ${parsed.error.issues[0].path.join('.')}: ${parsed.error.issues[0].message}`);
  return contentHash({ schemaVersion: SCENE_PLAN_VERSION, plan: parsed.data });
}

// ---- description fit, envelope size, legacy briefs -------------------------------------------------------------------------

// The trusted render-service receipt (INT-06-C17): the real card styles measured the final copy at each supported width.
export const DescriptionFitSchema = z.object({
  descriptionHash: hash, styleVersion: z.string().min(1).max(64),
  widths: z.array(z.object({ cardWidth: z.number().int().positive(), lines: z.number().int().min(0) }).strict()).min(1).max(8),
}).strict();
export async function descriptionFitProblems(plan, receipt) {
  const parsed = DescriptionFitSchema.safeParse(receipt);
  if (!parsed.success) return [{ path: 'receipt', code: 'invalid_receipt', message: parsed.error.issues[0].message }];
  const out = [];
  if (parsed.data.descriptionHash !== await contentHash(plan.cardDescription)) out.push({ path: 'receipt.descriptionHash', code: 'stale_receipt', message: 'the receipt measured different copy' });
  parsed.data.widths.forEach((w, i) => { if (w.lines < 2 || w.lines > 4) out.push({ path: `receipt.widths.${i}.lines`, code: 'description_fit', message: `the description renders in ${w.lines} lines at ${w.cardWidth}px; it must be 2 to 4` }); });
  return out;
}

// Fail before sending when an envelope exceeds the configured byte limit. Never truncates the Story, controls or findings.
export function checkEnvelope(value, maxBytes) {
  const bytes = new TextEncoder().encode(canonicalJson(value)).length;
  return bytes <= maxBytes ? { ok: true, bytes } : { ok: false, bytes, problems: [{ path: '', code: 'envelope_too_large', message: `the envelope is ${bytes} bytes, over the ${maxBytes} byte input limit; shorten the source material, never the plan` }] };
}

// The only compatibility conversion: a legacy VisualBrief becomes authoring context for a new design. It is never a reviewed plan
// (no story, controls, review or runtime), so parseScenePlan refuses it and the design stages still run.
export function legacyBriefToDraft(rawBrief, depth) {
  if (!['brief', 'balanced', 'detailed', 'overview', 'standard', 'deep'].includes(depth)) return { ok: false, problems: [{ path: 'depth', code: 'invalid_value', message: 'depth is brief, balanced or detailed' }] };
  let brief;
  try { brief = validateVisualBrief(rawBrief); } catch (error) { return { ok: false, problems: [{ path: 'brief', code: 'invalid_brief', message: error.message }] }; }
  return { ok: true, reviewed: false, draft: { depth: { overview: 'brief', standard: 'balanced', deep: 'detailed' }[depth] ?? depth, legacyMeaning: brief.meaning, assumptions: brief.assumptions, evidenceIds: brief.evidence } };
}
