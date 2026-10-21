// CAD parameter definitions `cad-params/1` (docs: C:/s/spec/cad-controls/design.md section 1). Pure and shared: the
// control plane validates model-provided definitions and edited values with it; the card derives its controls from it.
// Behaviour comes only from the fields below, never from a parameter's id or label. Nothing here is evaluated as code.
export const CAD_PARAMS_SCHEMA = 'cad-params/1';
const ID = /^[a-z][a-z0-9_]{0,47}$/;
const UNITS = { length: ['mm', 'cm', 'm', 'in'], angle: ['deg'] };
const TYPES = ['length', 'angle', 'number', 'count', 'choice', 'boolean'];
const OPS = { lt: (a, b) => a < b, le: (a, b) => a <= b, gt: (a, b) => a > b, ge: (a, b) => a >= b };
const OP_TEXT = { lt: 'less than', le: 'at most', gt: 'greater than', ge: 'at least' };
const finite = v => typeof v === 'number' && Number.isFinite(v);
const text = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;
const numeric = type => ['length', 'angle', 'number', 'count'].includes(type);
const invalid = message => Object.assign(new Error(message), { status: 422, code: 'invalid_controls' });

// A value's own problem for one definition, or ''. Used for defaults and edited values alike.
export function valueProblem(def, value) {
  if (def.type === 'boolean') return typeof value === 'boolean' ? '' : 'must be on or off';
  if (def.type === 'choice') return def.choices.some(c => c.value === value) ? '' : 'must be one of the listed choices';
  if (!finite(value)) return 'must be a number';
  if (def.type === 'count' && !Number.isSafeInteger(value)) return 'must be a whole number';
  if (def.min !== undefined && value < def.min) return `must be at least ${def.min}${def.unit ? ` ${def.unit}` : ''}`;
  if (def.max !== undefined && value > def.max) return `must be at most ${def.max}${def.unit ? ` ${def.unit}` : ''}`;
  if (def.step !== undefined) {
    const base = def.min ?? 0, steps = (value - base) / def.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9 * Math.max(1, Math.abs(steps))) return `must be in steps of ${def.step}`;
  }
  return '';
}

// Model-provided controls -> normalized controls, or a 422 error naming the first problem. Missing units are refused.
export function validateControls(controls) {
  if (controls == null) return null;
  if (typeof controls !== 'object' || controls.schema !== CAD_PARAMS_SCHEMA || !Array.isArray(controls.parameters)) throw invalid('CAD parameter definitions must use cad-params/1.');
  if (controls.parameters.length > 40) throw invalid('A CAD model may expose at most 40 parameters.');
  const constraints = controls.constraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > 20) throw invalid('A CAD model may declare at most 20 constraints.');
  const seen = new Map();
  const parameters = controls.parameters.map(p => {
    if (!p || typeof p !== 'object' || !ID.test(p.id || '') || seen.has(p.id)) throw invalid('Each CAD parameter needs a unique snake_case id.');
    const where = `Parameter ${p.id}`;
    if (!text(p.label, 80)) throw invalid(`${where} needs a readable label.`);
    if (!['input', 'computed'].includes(p.role)) throw invalid(`${where} must be an input or computed.`);
    if (!TYPES.includes(p.type)) throw invalid(`${where} has an unsupported type.`);
    const def = { id: p.id, label: p.label.trim(), role: p.role, type: p.type };
    if (UNITS[p.type]) { if (!UNITS[p.type].includes(p.unit)) throw invalid(`${where} needs explicit units.`); def.unit = p.unit; }
    else if (p.unit !== undefined) throw invalid(`${where} cannot carry a unit.`);
    if (numeric(p.type)) {
      for (const key of ['min', 'max', 'step']) if (p[key] !== undefined) { if (!finite(p[key])) throw invalid(`${where} has an invalid ${key}.`); def[key] = p[key]; }
      if (def.min !== undefined && def.max !== undefined && def.min > def.max) throw invalid(`${where} has min above max.`);
      if (def.step !== undefined && def.step <= 0) throw invalid(`${where} needs a positive step.`);
      if (p.type === 'count' && [def.min, def.max, def.step].some(v => v !== undefined && !Number.isSafeInteger(v))) throw invalid(`${where} is a count and needs whole-number bounds.`);
      if (p.precision !== undefined) { if (!Number.isInteger(p.precision) || p.precision < 0 || p.precision > 6) throw invalid(`${where} has an invalid precision.`); def.precision = p.precision; }
      if (p.slider === true) { if (def.min === undefined || def.max === undefined) throw invalid(`${where} needs min and max for a slider.`); def.slider = true; }
    } else if (['min', 'max', 'step', 'precision', 'slider'].some(k => p[k] !== undefined)) throw invalid(`${where} cannot carry numeric bounds.`);
    if (p.type === 'choice') {
      if (!Array.isArray(p.choices) || p.choices.length < 2 || p.choices.length > 20) throw invalid(`${where} needs 2 to 20 choices.`);
      def.choices = p.choices.map(c => { if (!c || !text(c.value, 60) || !text(c.label, 80)) throw invalid(`${where} has an invalid choice.`); return { value: c.value, label: c.label.trim() }; });
      if (new Set(def.choices.map(c => c.value)).size !== def.choices.length) throw invalid(`${where} repeats a choice.`);
    } else if (p.choices !== undefined) throw invalid(`${where} cannot carry choices.`);
    if (p.priority !== undefined) { if (!Number.isInteger(p.priority) || p.priority < 0 || p.priority > 100) throw invalid(`${where} has an invalid priority.`); def.priority = p.priority; }
    if (p.check !== undefined) { if (!text(p.check, 100)) throw invalid(`${where} names an invalid check.`); def.check = p.check; }
    if (p.dependsOn !== undefined) {
      if (p.role !== 'computed' || !Array.isArray(p.dependsOn) || p.dependsOn.length > 20) throw invalid(`${where}: only computed parameters list dependencies.`);
      def.dependsOn = [...new Set(p.dependsOn)];
    }
    // A computed value is reported by the saved source; a value here is only the last report, so it may be absent.
    if (p.value !== undefined || p.role === 'input') {
      const problem = valueProblem(def, p.value);
      if (problem) throw invalid(`${where} ${problem}.`);
      def.value = p.value;
    }
    seen.set(p.id, def);
    return def;
  });
  for (const def of parameters) for (const dep of def.dependsOn || []) if (seen.get(dep)?.role !== 'input') throw invalid(`Parameter ${def.id} depends on unknown input ${dep}.`);
  const ids = new Set();
  const normalized = constraints.map(c => {
    if (!c || c.kind !== 'compare' || !ID.test(c.id || '') || ids.has(c.id)) throw invalid('Each CAD constraint needs a unique id and kind compare.');
    ids.add(c.id);
    const left = seen.get(c.left), right = typeof c.right === 'string' ? seen.get(c.right) : null;
    if (!left || left.role !== 'input' || !numeric(left.type)) throw invalid(`Constraint ${c.id} must compare a numeric input.`);
    if (typeof c.right === 'string' ? !right || !numeric(right.type) || right.role !== 'input' : !finite(c.right)) throw invalid(`Constraint ${c.id} has an invalid right side.`);
    if (right && (right.unit || null) !== (left.unit || null)) throw invalid(`Constraint ${c.id} compares different units.`);
    if (!OPS[c.op]) throw invalid(`Constraint ${c.id} has an unsupported comparison.`);
    if (!text(c.message, 200)) throw invalid(`Constraint ${c.id} needs an explanation.`);
    for (const key of ['factor', 'offset']) if (c[key] !== undefined && !finite(c[key])) throw invalid(`Constraint ${c.id} has an invalid ${key}.`);
    return { id: c.id, kind: 'compare', left: c.left, op: c.op, right: c.right, ...(c.factor !== undefined ? { factor: c.factor } : {}), ...(c.offset !== undefined ? { offset: c.offset } : {}), message: c.message.trim() };
  });
  const values = Object.fromEntries(parameters.filter(p => p.role === 'input').map(p => [p.id, p.value]));
  const broken = constraintProblems({ parameters, constraints: normalized }, values);
  if (broken.length) throw invalid(`The default values break a constraint: ${broken[0].message}`);
  return { schema: CAD_PARAMS_SCHEMA, parameters, constraints: normalized };
}

export function constraintProblems(controls, values) {
  const defs = new Map(controls.parameters.map(p => [p.id, p]));
  return (controls.constraints || []).flatMap(c => {
    const left = values[c.left], right = typeof c.right === 'string' ? values[c.right] : c.right;
    const bound = (c.factor ?? 1) * right + (c.offset ?? 0);
    if (OPS[c.op](left, bound)) return [];
    const of = typeof c.right === 'string' ? defs.get(c.right).label : `${c.right}`;
    return [{ id: c.left, constraint: c.id, message: `${c.message} (${defs.get(c.left).label} must be ${OP_TEXT[c.op]} ${c.factor !== undefined && c.factor !== 1 ? `${c.factor} x ` : ''}${of}${c.offset ? ` ${c.offset > 0 ? '+' : '-'} ${Math.abs(c.offset)}` : ''}.)` }];
  });
}

// Edited values against validated controls. bound: the input ids the trusted build read (only those may change).
// Returns { values, problems:[{id,message}] }; values is the complete input map with unchanged inputs carried over.
export function validateValues(controls, edits, { bound = [], current = null } = {}) {
  const defs = new Map(controls.parameters.map(p => [p.id, p])), problems = [];
  const values = { ...Object.fromEntries(controls.parameters.filter(p => p.role === 'input').map(p => [p.id, p.value])), ...(current || {}) };
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return { values, problems: [{ id: null, message: 'Send the changed parameter values.' }] };
  for (const [id, value] of Object.entries(edits)) {
    const def = defs.get(id);
    if (!def) { problems.push({ id, message: 'This model has no such parameter.' }); continue; }
    if (def.role !== 'input') { problems.push({ id, message: `${def.label} is computed by the model and cannot be edited.` }); continue; }
    if (!bound.includes(id)) { problems.push({ id, message: `${def.label} is not bound to this model's source, so it cannot be rebuilt deterministically.` }); continue; }
    const problem = valueProblem(def, value);
    if (problem) problems.push({ id, message: `${def.label} ${problem}.` });
    else values[id] = value;
  }
  if (!problems.length) problems.push(...constraintProblems(controls, values));
  return { values, problems };
}

// Whether edited controls keep the same design structure (ids, roles, types, units, choices, constraints).
// A structural change needs re-preparation; anything else is a field edit.
export function structuralChange(a, b) {
  const shape = c => JSON.stringify([(c?.parameters || []).map(p => [p.id, p.role, p.type, p.unit || null, (p.choices || []).map(x => x.value), p.dependsOn || []]), c?.constraints || []]);
  return shape(a) !== shape(b);
}
