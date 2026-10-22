// The component catalogue: every definition is checked against the
// ComponentDefinition contract when it is registered, so the compiler and the
// author prompt (T17) read the same declared parameters, hints and anchors.
import { validateComponentDefinition, validateLabelContent } from '../explain-contract.js';
import attentionFanout from './components/attention-fanout.js';
import callout from './components/callout.js';
import flow from './components/flow.js';
import legend from './components/legend.js';
import module from './components/module.js';
import patternStack from './components/pattern-stack.js';
import section from './components/section.js';
import stack from './components/stack.js';

const REGISTRY = new Map();

export function register(definition) {
  const checked = validateComponentDefinition(definition);
  const key = `${checked.name}@${checked.version}`;
  if (REGISTRY.has(key)) throw new Error(`component ${key} is already registered`);
  REGISTRY.set(key, Object.freeze(checked));
  return checked;
}

for (const definition of [section, module, stack, flow, callout, legend, patternStack, attentionFanout]) register(definition);

export function componentFor(name, version) {
  const found = REGISTRY.get(`${name}@${version}`);
  if (found) return found;
  const known = [...REGISTRY.values()].filter(item => item.name === name).map(item => item.version);
  throw new Error(known.length ? `component "${name}" has no version ${version} (known: ${known.join(', ')})` : `unknown component "${name}"`);
}

// What an author may use: the declarative half only, newest version of each.
export function catalogue() {
  const newest = new Map();
  for (const item of REGISTRY.values()) if (!(newest.get(item.name)?.version > item.version)) newest.set(item.name, item);
  return [...newest.values()].map(({ compile, ...rest }) => rest);
}

// Semantic parameters, checked against the definition and given defaults.
// Unknown names are refused: a misspelt parameter must not silently vanish.
export function resolveParams(definition, raw = {}) {
  const out = {};
  for (const name of Object.keys(raw)) if (!(name in definition.params)) throw new Error(`unknown parameter "${name}"`);
  for (const [name, spec] of Object.entries(definition.params)) {
    const value = raw[name] ?? spec.default;
    if (value === undefined) {
      if (spec.required) throw new Error(`parameter "${name}" is required`);
      continue;
    }
    out[name] = checkValue(name, spec, value);
  }
  return out;
}

// Layout hints: finite, typed, defaulted. Repairs may change only these.
export function resolveHints(definition, raw = {}) {
  const out = {};
  for (const name of Object.keys(raw)) if (!(name in definition.hints)) throw new Error(`unknown layout hint "${name}"`);
  for (const [name, spec] of Object.entries(definition.hints)) out[name] = checkValue(name, spec, raw[name] ?? spec.default);
  return out;
}

function checkValue(name, spec, value) {
  const fail = why => { throw new Error(`parameter "${name}" ${why}`); };
  switch (spec.type) {
    case 'int': case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('must be a number');
      if (spec.type === 'int' && !Number.isInteger(value)) fail('must be a whole number');
      if (spec.min !== undefined && value < spec.min) fail(`must be at least ${spec.min}`);
      if (spec.max !== undefined && value > spec.max) fail(`must be at most ${spec.max}`);
      return value;
    case 'string':
      if (typeof value !== 'string') fail('must be text');
      if (spec.maxLength && value.length > spec.maxLength) fail(`must be at most ${spec.maxLength} characters`);
      return value;
    case 'enum':
      if (!spec.values.includes(value)) fail(`must be one of ${spec.values.join(', ')}`);
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') fail('must be true or false');
      return value;
    case 'label': {
      const label = validateLabelContent(value);
      const length = typeof label === 'string' ? label.length : label.runs.reduce((sum, run) => sum + (run.text ?? run.tex).length, 0);
      if (!length) fail('must not be empty');
      if (spec.maxLength && length > spec.maxLength) fail(`must be at most ${spec.maxLength} characters`);
      return label;
    }
    case 'list':
      if (!Array.isArray(value)) fail('must be a list');
      if (spec.min !== undefined && value.length < spec.min) fail(`needs at least ${spec.min} items`);
      if (spec.max !== undefined && value.length > spec.max) fail(`takes at most ${spec.max} items`);
      return value;
    default: return fail(`has an unknown type ${spec.type}`);
  }
}
