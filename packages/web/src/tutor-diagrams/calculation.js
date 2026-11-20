// Calculations (owner 2026-11-19, the same-JSON change set). A stored reference DECLARES how its diagram's numbers come about: either a calculation (the `variables` that name the numbers and a function
// that takes the inputs and returns the results under the same names) or that it needs none (`calculation: { none: true }`). The author (Gemini) chooses the inputs; the server runs the function and
// writes the results onto the card, so numbers that depend on each other are right. Nothing here knows a reference id or a diagram kind: it reads the card's own `variables` list and the calculation's.
//
// A calculation is { variables: [{ name, role: 'input' | 'result', type: 'int' | 'float', min, max, at? | value? }], run(inputs) -> results }. `run` throws CalculationRefused for inputs that cannot be right.

export class CalculationRefused extends Error {}

// A reference that declares a calculation (its function, or that it needs none) gets the new behaviour; every other reference is untouched.
export const isDeclared = ref => Boolean(ref?.calculation);
export const hasFunction = ref => typeof ref?.calculation?.run === 'function';

const isNumber = value => typeof value === 'number' && Number.isFinite(value);
const clean = value => (isNumber(value) ? Number(value.toFixed(6)) : value);

// The value at a dot path of the diagram (keys and array positions); a `*` reads every item of a list ('series.0.points.*.y' is the list of the y of every point). undefined when the path leads nowhere.
export function readAt(root, at) {
  const keys = String(at).split('.');
  const walk = (node, index) => {
    if (index === keys.length) return node;
    if (keys[index] === '*') {
      if (!Array.isArray(node)) return undefined;
      const items = node.map(item => walk(item, index + 1));
      return items.length && items.every(item => item !== undefined) ? items : undefined;
    }
    return node !== null && typeof node === 'object' ? walk(node[keys[index]], index + 1) : undefined;
  };
  return walk(root, 0);
}
// Writes where the path already leads to a field (the parent exists and holds the key): the author drew the figure, the server only replaces its numbers. A `*` path is read only.
function writeAt(root, at, value) {
  const keys = String(at).split('.');
  if (keys.includes('*')) return false;
  const last = keys.pop();
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

// Runs a calculation on one card diagram. -> { problem } or { diagram, values, overwritten, written }:
//   diagram      a copy with every result written (a result with `at` replaced where it is drawn, a result with `value` updated in the variables list),
//   values       every variable's value by name (inputs as read, results as computed),
//   overwritten  the names of the results that differed from what the card carried,
//   written      the results as the card carried them before (what the author wrote).
// A card problem (the one repair) is: no variables list, a variable missing or with the wrong role, an input that is not where it says, an input outside its limits or refused by the function,
// a result outside its limits, or a result that cannot be written where it is drawn.
export function runCalculation(diagram, calculation) {
  const entries = declared(diagram);
  const byName = new Map((entries ?? []).filter(entry => entry && typeof entry === 'object').map(entry => [entry.name, entry]));
  const inputs = {};
  for (const spec of calculation.variables.filter(variable => variable.role === 'input')) {
    // An input the reference's figure draws is found where the reference says it is; an input the figure does not draw (a list of weights, a k) is read from the card's own variables list.
    const entry = byName.get(spec.name);
    if (entry && entry.role !== 'input') return { problem: `variables names ${spec.name} as something other than an input` };
    const at = entry?.at ?? spec.at;
    if (!entry && at === undefined) return { problem: entries ? `variables has no input named ${spec.name}` : 'the diagram has no variables list (write the variables as the example does)' };
    const value = at !== undefined ? readAt(diagram, at) : entry.value;
    if (value === undefined) return { problem: `input ${spec.name} is not where variables says (${at !== undefined ? `no number at ${at}` : 'no value'})` };
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
    // A result the figure draws is written where the reference says it is drawn (the card's entry may name another place); a result the card did not list is still computed (a placeholder may name it).
    const entry = byName.get(spec.name);
    if (entry && entry.role !== 'result') return { problem: `variables names ${spec.name} as something other than a result` };
    const value = computed[spec.name], bad = limitProblem(spec, value);
    if (bad) return { problem: `result ${spec.name} ${bad}` };
    const at = entry?.at ?? spec.at;
    const written = at !== undefined ? readAt(diagram, at) : entry?.value;
    before[spec.name] = written;
    if (at !== undefined) {
      if (!writeAt(next, at, value)) return { problem: `result ${spec.name} cannot be written at ${at}` };
    } else if (entry) next.variables[next.variables.findIndex(variable => variable.name === spec.name)].value = value;
    if ((at !== undefined || entry) && JSON.stringify(written) !== JSON.stringify(value)) overwritten.push(spec.name);
  }
  return { diagram: next, values: { ...inputs, ...computed }, overwritten, written: before };
}

// {{v:name}} or {{v:name.N}} (N the position in a list from 0): the number of a variable written inside a text, filled by the server after the function ran.
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

// Every text field of a diagram (a title, a caption, a label, a heading, a note: any string, the variables list apart) with its placeholders filled. -> { diagram } or { problem }.
export function fillDiagramText(diagram, values) {
  let problem = null;
  const walk = (node, key) => {
    if (key === 'variables') return node;
    if (typeof node === 'string') {
      if (!node.includes('{{v:')) return node;
      const filled = fillVariableText(node, values);
      if (filled.problem) { problem ??= filled.problem; return node; }
      return filled.text;
    }
    if (Array.isArray(node)) return node.map(item => walk(item, key));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([name, item]) => [name, walk(item, name)]));
    return node;
  };
  const next = walk(diagram, '');
  return problem ? { problem } : { diagram: next };
}

// A stored reference written from its template (a spec whose text fields carry {{v:name}} where a number stood) and the worked example's values.
export function specFromTemplate(template, values) {
  const filled = fillDiagramText(template.diagram, values);
  if (filled.problem) throw new Error(`reference template: ${filled.problem}`);
  return { ...template, diagram: filled.diagram };
}

// A "?" that stands for a number is left in a text field of the diagram (the example shows a removed number as "?"): the paths of those fields, [] when there is none.
// A "?" that ends a question ("What is top-k?") stands for no number: it follows a letter.
const NUMBER_QUESTION_MARK = /(?:^|[\s(\-$/])\?(?=%|\s*%|[\s),.:;/-]|$)/;
export function unfilledNumbers(diagram) {
  const paths = [];
  const walk = (node, path) => {
    if (typeof node === 'string') { if (node === '?' || NUMBER_QUESTION_MARK.test(node)) paths.push(path.join('.')); return; }
    if (Array.isArray(node)) return node.forEach((item, index) => walk(item, [...path, index]));
    if (node && typeof node === 'object') for (const [name, item] of Object.entries(node)) if (name !== 'variables') walk(item, [...path, name]);
  };
  walk(diagram, []);
  return paths;
}

// A stored reference (or one depth of it) that declares a calculation. `holder` is { spec } whose diagram is the authoring template: its numbers are the worked example's inputs where the figure draws
// them, and its text fields carry {{v:name}} where a number that follows from the inputs stood. `calculation.variables` list name, role, type and limits, with `at` where the figure draws the number or
// `drawn: false` for one it does not draw; `inputs` gives the worked example's value of every undrawn input. The stored spec is the template with the variables list added, the function run on it (so every
// stored result comes from the function) and the placeholders filled; `template` is the same diagram with its placeholders kept (what the author is shown, its numbers masked).
export function declareSpec(holder, calculation, inputs = {}) {
  const diagram = structuredClone(holder.spec.diagram);
  diagram.variables = calculation.variables.map(({ name, role, type, min, max, at, drawn }) => ({
    name, role, type, min, max, ...(at !== undefined ? { at } : { value: role === 'input' ? inputs[name] : min }),
  }));
  const run = runCalculation(diagram, calculation);
  if (run.problem) throw new Error(`reference calculation: ${run.problem}`);
  const filled = fillDiagramText(run.diagram, run.values);
  if (filled.problem) throw new Error(`reference template: ${filled.problem}`);
  return { ...holder, spec: { ...holder.spec, diagram: filled.diagram }, template: { ...holder.spec, diagram: run.diagram } };
}
export const declareReference = (reference, calculation, inputs) => ({ ...declareSpec(reference, calculation, inputs), calculation });
// A reference whose numbers need no calculation (they are typed, or the figure computes its own, as a token-links weight is normalised by the server): it still gets the new behaviour of a declared reference.
export const needsNoCalculation = reference => ({ ...reference, calculation: { none: true } });
