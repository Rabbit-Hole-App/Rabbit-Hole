import { round } from './scene-derive.js';

// The typed learning-input contract for interactive scenes (spec:
// docs/rabbit-hole-interactive-visuals-agent-spec-v2.md §6.3). Two gates with
// opposite failure modes, on purpose:
//
//   validateInputDeclarations - the AUTHORED contract. Wrong is wrong: an
//   unknown type, a default outside its own domain, a name that shadows the
//   scene's data - each throws with the field named, at authoring/validation
//   time, never in front of a learner.
//
//   coerceInputs - RAW learner or persisted values. These arrive from
//   localStorage and old saves, so they can be anything; coercion never
//   throws and never guesses. A value the declaration cannot honestly accept
//   resets to the declared default rather than being reinterpreted - an index
//   saved against a longer list is stale content, not a nearby intention.
//   Idempotent: coerce(coerce(x)) === coerce(x).
//
// Domains stay explicit: index/indices point into a named exampleData list
// ("of"), a choice into its own stable option ids (reorder-proof - identity,
// never position), vec2 into one symmetric ±range.

export const INPUT_TYPES = ['index', 'bool', 'choice', 'indices', 'vec2'];

const NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

// Which fields each type owns beyond the common four. A declaration carrying
// a field its type has no meaning for is refused, not ignored - "index with
// options" is a confusion about what the input is, and silence would let the
// author believe the options do something.
const TYPE_FIELDS = {
  index: ['of', 'presentation'],
  bool: [],
  choice: ['options'],
  indices: ['of'],
  vec2: ['range'],
};

// How an index control presents: 'picker' (one labelled chip per position,
// the default), 'slider' (an integer slider with Previous/Next steppers, for
// domains too long to read as chips), or 'visual' (the scene object bound
// via pickInput IS the control - accessible items on the visual itself, no
// duplicate strip widget), or 'pager' (the scene's sub-cards: Previous / Next
// in the card header, not a row in INTERACT - its list names the parts, and
// objects declare which part they belong to; see scene-evaluate.js). At most
// one pager per scene. Presentation only - all edit the same input.
const INDEX_PRESENTATIONS = ['picker', 'slider', 'visual', 'pager'];
// `hidden: true` declares an input the ACTIVITY machinery owns - a commit/
// reveal latch. It renders no widget, and the generic learner command path
// refuses to write it (see applyInputToBlock); only the activity reducer
// supplies its value at evaluation time. Hiding the widget alone would not
// be enforcement - this is the command-path half of the latch.
const COMMON_FIELDS = ['name', 'type', 'label', 'default', 'hidden'];

const domainLength = (declaration, exampleData) => {
  const list = exampleData?.[declaration.of];
  return Array.isArray(list) ? list.length : null;
};

export function validateInputDeclarations(declarations, exampleData = {}, reservedNames = []) {
  if (!Array.isArray(declarations)) throw new Error('inputs must be an array of typed declarations');
  const seen = new Set();
  const reserved = new Set([...Object.keys(exampleData || {}), ...reservedNames]);
  for (const declaration of declarations) {
    const where = `Input "${declaration?.name ?? '?'}"`;
    if (!INPUT_TYPES.includes(declaration?.type)) {
      throw new Error(`${where}: unknown input type "${declaration?.type}" - one of ${INPUT_TYPES.join(', ')}`);
    }
    if (typeof declaration.name !== 'string' || !NAME.test(declaration.name)) {
      throw new Error(`${where}: an input needs a short alphanumeric name`);
    }
    if (typeof declaration.label !== 'string' || !declaration.label.trim() || declaration.label.length > 60) {
      throw new Error(`${where}: an input needs a label (max 60 chars) - it names the control the learner sees`);
    }
    if (seen.has(declaration.name)) throw new Error(`${where}: declared twice`);
    seen.add(declaration.name);
    if (declaration.hidden !== undefined && typeof declaration.hidden !== 'boolean') {
      throw new Error(`${where}: hidden must be true or false`);
    }
    if (reserved.has(declaration.name)) {
      throw new Error(`${where}: collides with "${declaration.name}" in the scene's exampleData/derived - inputs join the same pool and may not shadow data`);
    }
    const allowed = new Set([...COMMON_FIELDS, ...TYPE_FIELDS[declaration.type]]);
    for (const key of Object.keys(declaration)) {
      if (!allowed.has(key)) throw new Error(`${where}: "${key}" has no meaning on type "${declaration.type}"`);
    }
    if (declaration.type === 'index' || declaration.type === 'indices') {
      const length = domainLength(declaration, exampleData);
      if (length == null || length < 1) {
        throw new Error(`${where}: "of" must name a non-empty exampleData list, "${declaration.of}" is missing or not a list`);
      }
      if (declaration.type === 'index' && !(Number.isInteger(declaration.default) && declaration.default >= 0 && declaration.default < length)) {
        throw new Error(`${where}: default ${declaration.default} is outside 0..${length - 1}`);
      }
      if (declaration.type === 'index' && declaration.presentation !== undefined && !INDEX_PRESENTATIONS.includes(declaration.presentation)) {
        throw new Error(`${where}: presentation must be one of ${INDEX_PRESENTATIONS.join(', ')}`);
      }
      if (declaration.presentation === 'pager') {
        if (declaration.hidden) throw new Error(`${where}: a pager is the learner's navigation and cannot be hidden`);
        if (length < 2 || length > 4) throw new Error(`${where}: a pager pages through 2 to 4 sub-cards, "${declaration.of}" lists ${length}`);
        if (declarations.filter(other => other?.presentation === 'pager').length > 1) throw new Error(`${where}: a scene has at most one pager`);
      }
      if (declaration.type === 'indices' && !(Array.isArray(declaration.default) && declaration.default.every(i => Number.isInteger(i) && i >= 0 && i < length))) {
        throw new Error(`${where}: default must be a list of positions inside 0..${length - 1}`);
      }
    }
    if (declaration.type === 'bool' && typeof declaration.default !== 'boolean') {
      throw new Error(`${where}: default must be true or false`);
    }
    if (declaration.type === 'choice') {
      const options = declaration.options;
      if (!Array.isArray(options) || options.length < 2) throw new Error(`${where}: a choice needs at least two options`);
      const ids = new Set();
      for (const option of options) {
        if (typeof option?.id !== 'string' || !option.id.trim() || typeof option?.label !== 'string' || !option.label.trim()) {
          throw new Error(`${where}: every option needs a stable string id and a label`);
        }
        if (ids.has(option.id)) throw new Error(`${where}: option id "${option.id}" appears twice - ids are identity and must be unique`);
        ids.add(option.id);
      }
      if (!ids.has(declaration.default)) throw new Error(`${where}: default "${declaration.default}" is not one of the declared option ids`);
    }
    if (declaration.type === 'vec2') {
      if (!(Number.isFinite(declaration.range) && declaration.range > 0)) {
        throw new Error(`${where}: range must be one positive number - the domain is the symmetric ±range`);
      }
      if (!(Array.isArray(declaration.default) && declaration.default.length === 2
        && declaration.default.every(v => Number.isFinite(v) && Math.abs(v) <= declaration.range))) {
        throw new Error(`${where}: default must be two finite numbers within ±${declaration.range}`);
      }
    }
  }
  return declarations;
}

// One raw value against one declaration. Returns the declared default for
// anything the declaration cannot honestly accept - never a reinterpretation.
function coerceOne(declaration, raw, exampleData) {
  if (declaration.type === 'bool') {
    return typeof raw === 'boolean' ? raw : declaration.default;
  }
  if (declaration.type === 'index') {
    const length = domainLength(declaration, exampleData) ?? 0;
    const value = Math.round(Number(raw));
    return Number.isFinite(value) && value >= 0 && value < length ? value : declaration.default;
  }
  if (declaration.type === 'choice') {
    return declaration.options.some(option => option.id === raw) ? raw : declaration.default;
  }
  if (declaration.type === 'indices') {
    const length = domainLength(declaration, exampleData) ?? 0;
    const source = Array.isArray(raw) ? raw : declaration.default;
    const members = new Set();
    for (const entry of source) {
      const value = Math.round(Number(entry));
      if (Number.isFinite(value) && value >= 0 && value < length) members.add(value);
    }
    return [...members].sort((a, b) => a - b);
  }
  if (declaration.type === 'vec2') {
    const pair = Array.isArray(raw) && raw.length === 2 && raw.every(v => Number.isFinite(Number(v))) ? raw.map(Number) : declaration.default;
    // round() also normalises -0, so no negative zero reaches geometry.
    return pair.map(component => round(Math.max(-declaration.range, Math.min(declaration.range, component))));
  }
  return declaration.default;
}

// An input's value in the words its own control shows: the domain entry for
// an index (one-based "k of n" when the entries are not words), the option
// label for a choice, On/Off for a bool, the chip labels for a set.
function valueWords(declaration, value, data) {
  const list = data?.[declaration.of];
  const entry = index => (Array.isArray(list) && typeof list[index] === 'string' ? list[index] : null);
  if (declaration.type === 'index') return entry(value) ?? `${value + 1} of ${list?.length ?? '?'}`;
  if (declaration.type === 'bool') return value ? 'On' : 'Off';
  if (declaration.type === 'choice') return declaration.options.find(option => option.id === value)?.label ?? value;
  if (declaration.type === 'indices') return (value || []).map(index => entry(index) ?? String(index + 1)).join(', ') || 'none';
  if (declaration.type === 'vec2') return `(${value[0]}, ${value[1]})`;
  return JSON.stringify(value);
}

// The tutor's statement of an input: the full control label, the value's
// words, and for an index its position too - the payload's state names
// cells by index (cellHighlight), so the tutor needs both.
export function describeInputValue(declaration, value, data) {
  if (declaration.type === 'index') return `${declaration.label} = ${valueWords(declaration, value, data)} (index ${value})`;
  if (declaration.type === 'indices') return `${declaration.label} = [${(value || []).join(', ')}]`;
  return `${declaration.label} = ${valueWords(declaration, value, data)}`;
}

// The learner's statement of an input, shared by the practice lock line and a
// locked control in INTERACT so the two never disagree: no index, no
// qualifier about the control itself ("(preset)"), and a value that already
// names its quantity ("block_size 3" under a label ending in block_size) says
// the name once - "block_size = 3", never "... block_size = block_size 3".
export function describeInputForLearner(declaration, value, data) {
  const name = declaration.label.replace(/\s*\([^)]*\)/g, '').trim();
  const words = String(valueWords(declaration, value, data));
  const quantity = name.split(' ').pop();
  const own = words.startsWith(quantity) && words.slice(quantity.length).match(/^(?:\s*=\s*|\s+)(\S.*)$/);
  return own ? `${quantity} = ${own[1]}` : `${name} = ${words}`;
}

export function coerceInputs(declarations, raw, exampleData = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const effective = {};
  for (const declaration of declarations) {
    effective[declaration.name] = coerceOne(declaration, source[declaration.name], exampleData);
  }
  return effective;
}
