// MVP4 (owner 2026-11-19): a reference whose diagram has results that follow from its inputs carries a calculation: the `variables` that name those numbers and a function that takes the inputs
// and returns the results under the same names. The author (Gemini) chooses the inputs; the server runs the function and writes the results onto the card, so the numbers that depend on each
// other are right. Nothing here knows a reference id or a diagram kind: it reads the card's own `variables` list and the calculation's.
//
// A calculation is { variables: [{ name, role: 'input' | 'result', type: 'int' | 'float', min, max, at? | value? }], run(inputs) -> results }. `run` throws CalculationRefused for inputs that cannot be right.

export class CalculationRefused extends Error {}

const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const clean = value => (isNumber(value) ? Number(value.toFixed(6)) : value);

// The value at a dot path of the diagram (keys and array positions), undefined when the path leads nowhere.
export const readAt = (root, at) => String(at).split('.').reduce((node, key) => (node !== null && typeof node === 'object' ? node[key] : undefined), root);
// Writes where the path already leads to a field (the parent exists and holds the key): the author drew the figure, the server only replaces its numbers.
function writeAt(root, at, value) {
  const keys = String(at).split('.'), last = keys.pop();
  const parent = keys.reduce((node, key) => (node !== null && typeof node === 'object' ? node[key] : undefined), root);
  if (parent === null || typeof parent !== 'object' || !(last in parent)) return false;
  parent[last] = value;
  return true;
}

// What a limit says about a number or a list of numbers (the type and the limits apply to every item of a list); null when it holds.
export function limitProblem({ type, min, max }, value) {
  const items = Array.isArray(value) ? value : [value];
  if (!items.length) return 'is an empty list';
  for (const item of items) {
    if (!isNumber(item)) return 'must be a number';
    if (type === 'int' && !Number.isInteger(item)) return `must be a whole number (got ${item})`;
    if (item < min || item > max) return `must be from ${min} to ${max} (got ${item})`;
  }
  return null;
}

const declared = diagram => (Array.isArray(diagram?.variables) ? diagram.variables : null);
const valueOf = (diagram, entry) => (entry?.at !== undefined ? readAt(diagram, entry.at) : entry?.value);

// Runs a calculation on one card diagram. -> { problem } or { diagram, values, overwritten }:
//   diagram      a copy with every result written (a result with `at` replaced where it is drawn, a result with `value` updated in the variables list),
//   values       every variable's value by name (inputs as read, results as computed),
//   overwritten  the names of the results that differed from what the card carried,
//   written      the results as the card carried them before (what the author wrote).
// A card problem (the one repair) is: no variables list, a variable missing or with the wrong role, an input that is not where it says, an input outside its limits or refused by the function,
// a result outside its limits, or a result that cannot be written where it is drawn.
export function runCalculation(diagram, calculation) {
  const entries = declared(diagram);
  if (!entries) return { problem: 'the diagram has no variables list (write the variables as the example does)' };
  const byName = new Map(entries.filter(entry => entry && typeof entry === 'object').map(entry => [entry.name, entry]));
  const inputs = {};
  for (const spec of calculation.variables.filter(variable => variable.role === 'input')) {
    const entry = byName.get(spec.name);
    if (!entry || entry.role !== 'input') return { problem: `variables has no input named ${spec.name}` };
    const value = valueOf(diagram, entry);
    if (value === undefined) return { problem: `input ${spec.name} is not where variables says (${entry.at !== undefined ? `no number at ${entry.at}` : 'no value'})` };
    const bad = limitProblem(spec, value);
    if (bad) return { problem: `input ${spec.name} ${bad}` };
    inputs[spec.name] = value;
  }
  let computed;
  try { computed = calculation.run(structuredClone(inputs)); } catch (error) {
    if (error instanceof CalculationRefused) return { problem: `the inputs are refused: ${error.message}` };
    throw error;
  }
  const next = structuredClone(diagram), overwritten = [], before = {};
  for (const spec of calculation.variables.filter(variable => variable.role === 'result')) {
    const entry = byName.get(spec.name);
    if (!entry || entry.role !== 'result') return { problem: `variables has no result named ${spec.name}` };
    const value = computed[spec.name], bad = limitProblem(spec, value);
    if (bad) return { problem: `result ${spec.name} ${bad}` };
    const written = valueOf(diagram, entry);
    before[spec.name] = written;
    if (entry.at !== undefined) {
      if (!writeAt(next, entry.at, value)) return { problem: `result ${spec.name} cannot be written at ${entry.at}` };
    } else next.variables[next.variables.findIndex(variable => variable === entry || variable.name === spec.name)].value = value;
    if (JSON.stringify(written) !== JSON.stringify(value)) overwritten.push(spec.name);
  }
  return { diagram: next, values: { ...inputs, ...computed }, overwritten, written: before };
}

// {{v:name}} or {{v:name.N}} (N the position in a list from 0): the number of a variable written inside a sentence, filled by the server after the function ran.
export const VARIABLE_TOKEN = /\{\{v:([A-Za-z][A-Za-z0-9]*)(?:\.(\d+))?\}\}/g;
export const hasVariableToken = value => /\{\{v:/.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));
// -> { text } or { problem }: every token of the text replaced by its number, or the first one that names no variable (or a list without that position).
export function fillVariableText(text, values) {
  let problem = null;
  const filled = String(text).replace(VARIABLE_TOKEN, (whole, name, index) => {
    const value = values[name];
    const item = index === undefined ? value : Array.isArray(value) ? value[Number(index)] : undefined;
    if (!isNumber(item)) { problem ??= `${whole} does not name a number of variables${index === undefined && Array.isArray(value) ? ' (it is a list: write {{v:name.0}} for an item)' : ''}`; return whole; }
    return String(clean(item));
  });
  return problem ? { problem } : { text: filled };
}
