// R8b restricted calculator (implementation checklist R8b.01-R8b.03; v1.3 3.9, D41). A deliberately small arithmetic language: a tokenizer, a
// recursive-descent parser and a tree evaluator. There is NO eval, NO Function, no property access, no strings, no assignment, no package and no
// uploaded code; an identifier that is not a supplied variable, a listed constant or a listed function is refused before anything is evaluated.
// Pure and deterministic: no clock, no network, no model, no D1, no learner charge. A finite floating-point answer is IEEE-754 double arithmetic,
// not an exact-arithmetic proof; the evidence says so (`precision`).
//
// Grammar (lowest to highest precedence), all binary operators left-associative except `^`:
//   expr   := term (('+' | '-') term)*
//   term   := unary (('*' | '/' | '%') unary)*
//   unary  := ('-' | '+') unary | power             -2^2 = -(2^2) = -4
//   power  := atom ('^' unary)?                      right-associative: 2^3^2 = 2^(3^2); 2^-1 = 0.5
//   atom   := number | name | name '(' expr (',' expr)* ')' | '(' expr ')'
import { canonicalJson, sha256Hex } from '../../../web/src/explain-program/contract.js';

export const EVALUATOR_VERSION = 'roadmap-calc-1';
export const CALC_LIMITS_VERSION = 'roadmap-calc-limits-1';
export const CALC_LIMITS = Object.freeze({ chars: 500, tokens: 200, depth: 24, nodes: 200, operations: 400, variables: 16, nameChars: 32, unitChars: 24, exponent: 10000, magnitude: 1e300 });
export const PRECISION = Object.freeze({ kind: 'ieee754-double', displayDigits: 12, note: 'Floating-point result, not an exact-arithmetic proof.' });

const FUNCTIONS = Object.freeze({
  abs: [1, 1, Math.abs], sqrt: [1, 1, Math.sqrt], cbrt: [1, 1, Math.cbrt], floor: [1, 1, Math.floor], ceil: [1, 1, Math.ceil], round: [1, 1, Math.round],
  trunc: [1, 1, Math.trunc], ln: [1, 1, Math.log], log10: [1, 1, Math.log10], log2: [1, 1, Math.log2], exp: [1, 1, Math.exp],
  sin: [1, 1, Math.sin], cos: [1, 1, Math.cos], tan: [1, 1, Math.tan], asin: [1, 1, Math.asin], acos: [1, 1, Math.acos], atan: [1, 1, Math.atan],
  min: [2, 8, Math.min], max: [2, 8, Math.max],
});
const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
export const CALC_GRAMMAR = Object.freeze({ operators: ['+', '-', '*', '/', '%', '^'], functions: Object.keys(FUNCTIONS), constants: Object.keys(CONSTANTS) });

class Refusal extends Error { constructor(reason, detail) { super(reason); this.reason = reason; this.detail = detail; } }
const refuse = (reason, detail) => { throw new Refusal(reason, detail); };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// --- tokenizer (bounded before any parsing) -----------------------------------------------------------------------------------------------
const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
function tokenize(text, limits) {
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === ' ' || c === '\t') { i += 1; continue; }
    const rest = text.slice(i, i + limits.chars);
    let m;
    if ((m = NUMBER.exec(rest))) { tokens.push({ t: 'num', v: Number(m[0]), at: i }); i += m[0].length; }
    else if ((m = NAME.exec(rest))) {
      if (m[0].length > limits.nameChars) refuse('name_too_long');
      tokens.push({ t: 'name', v: m[0], at: i }); i += m[0].length;
    } else if ('+-*/%^(),'.includes(c)) { tokens.push({ t: c, at: i }); i += 1; }
    else refuse('bad_character', `position ${i}`); // quotes, brackets, dots, =, ;, backticks, $, unicode ... never reach the parser
    if (tokens.length > limits.tokens) refuse('too_many_tokens');
    if (tokens.at(-1).t === 'num' && !Number.isFinite(tokens.at(-1).v)) refuse('not_finite');
    if (tokens.length >= 2 && tokens.at(-1).t === 'num' && tokens.at(-2).t === 'num') refuse('syntax', 'two numbers in a row');
  }
  return tokens;
}

// --- parser -> tree; node count and nesting depth bounded while parsing -------------------------------------------------------------------
function parse(tokens, limits) {
  let p = 0, nodes = 0;
  const peek = () => tokens[p]?.t, next = () => tokens[p++];
  const node = n => { nodes += 1; if (nodes > limits.nodes) refuse('too_many_nodes'); return n; };
  const enter = depth => { if (depth > limits.depth) refuse('too_deep'); };
  const expect = t => { if (peek() !== t) refuse('syntax', `expected ${t}`); return next(); };
  function expr(d) {
    enter(d);
    let left = term(d);
    while (peek() === '+' || peek() === '-') { const op = next().t; left = node({ k: 'bin', op, l: left, r: term(d) }); }
    return left;
  }
  function term(d) {
    let left = unary(d);
    while (peek() === '*' || peek() === '/' || peek() === '%') { const op = next().t; left = node({ k: 'bin', op, l: left, r: unary(d) }); }
    return left;
  }
  function unary(d) {
    enter(d);
    if (peek() === '-' || peek() === '+') { const op = next().t; return node({ k: 'neg', op, a: unary(d + 1) }); }
    return power(d);
  }
  function power(d) {
    const base = atom(d);
    if (peek() === '^') { next(); return node({ k: 'bin', op: '^', l: base, r: unary(d + 1) }); }
    return base;
  }
  function atom(d) {
    enter(d);
    const tok = next();
    if (!tok) refuse('syntax', 'unexpected end');
    if (tok.t === 'num') return node({ k: 'num', v: tok.v });
    if (tok.t === '(') { const inner = expr(d + 1); expect(')'); return inner; }
    if (tok.t === 'name') {
      if (peek() === '(') {
        if (!own(FUNCTIONS, tok.v)) refuse('unlisted_function', tok.v);
        next();
        const args = [expr(d + 1)];
        while (peek() === ',') { next(); args.push(expr(d + 1)); }
        expect(')');
        const [lo, hi] = FUNCTIONS[tok.v];
        if (args.length < lo || args.length > hi) refuse('syntax', `${tok.v} takes ${lo === hi ? lo : `${lo} to ${hi}`} arguments`);
        return node({ k: 'call', f: tok.v, args });
      }
      return node({ k: 'name', v: tok.v });
    }
    return refuse('syntax', `unexpected ${tok.t}`);
  }
  const tree = expr(0);
  if (p !== tokens.length) refuse('syntax', 'unexpected trailing input');
  return tree;
}

// --- evaluator: every intermediate is checked finite and within magnitude; operations are counted ------------------------------------------
function evaluate(tree, vars, limits) {
  let ops = 0;
  const tick = () => { ops += 1; if (ops > limits.operations) refuse('too_many_operations'); };
  const fin = x => { if (!Number.isFinite(x) || Math.abs(x) > limits.magnitude) refuse('not_finite'); return x === 0 ? 0 : x; }; // -0 -> 0
  function go(n) {
    switch (n.k) {
      case 'num': return fin(n.v);
      case 'name':
        if (vars.has(n.v)) return vars.get(n.v);
        if (own(CONSTANTS, n.v)) return CONSTANTS[n.v];
        return refuse('unbound_name', n.v);
      case 'neg': { tick(); const a = go(n.a); return fin(n.op === '-' ? -a : a); }
      case 'call': {
        tick();
        const args = n.args.map(go), f = n.f;
        if (f === 'sqrt' && args[0] < 0) refuse('domain_error', 'sqrt of a negative number');
        if ((f === 'ln' || f === 'log10' || f === 'log2') && args[0] <= 0) refuse('domain_error', `${f} of a non-positive number`);
        if ((f === 'asin' || f === 'acos') && Math.abs(args[0]) > 1) refuse('domain_error', `${f} outside [-1, 1]`);
        return fin(FUNCTIONS[f][2](...args));
      }
      default: {
        tick();
        const a = go(n.l), b = go(n.r);
        switch (n.op) {
          case '+': return fin(a + b);
          case '-': return fin(a - b);
          case '*': return fin(a * b);
          case '/': if (b === 0) refuse('division_by_zero'); return fin(a / b);
          case '%': if (b === 0) refuse('division_by_zero'); return fin(a % b);
          default:
            if (Math.abs(b) > limits.exponent) refuse('exponent_too_large');
            if (a < 0 && !Number.isInteger(b)) refuse('domain_error', 'negative base with a fractional exponent');
            if (a === 0 && b < 0) refuse('division_by_zero');
            return fin(a ** b);
        }
      }
    }
  }
  return { value: go(tree), operations: ops };
}

// Variables: own enumerable string keys only, finite numbers, bounded count; constants cannot be shadowed. A Map, so `__proto__` is just a name.
function variableMap(variables, limits) {
  if (variables == null) return new Map();
  if (typeof variables !== 'object' || Array.isArray(variables)) refuse('bad_variables');
  const entries = Object.entries(variables);
  if (entries.length > limits.variables) refuse('too_many_variables');
  const map = new Map();
  for (const [name, value] of entries) {
    if (!NAME.test(name) || NAME.exec(name)[0] !== name || name.length > limits.nameChars || own(CONSTANTS, name) || own(FUNCTIONS, name)) refuse('bad_variable', name);
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limits.magnitude) refuse('bad_variable', name);
    map.set(name, value === 0 ? 0 : value);
  }
  return map;
}

const display = x => String(Number(x.toPrecision(PRECISION.displayDigits)));

// calculateExpression({ expression, variables }, limits) -> { ok: true, value, display, operations } | { ok: false, reason, detail? }
export function calculateExpression({ expression, variables } = {}, limits = CALC_LIMITS) {
  try {
    if (typeof expression !== 'string') refuse('expression_not_text');
    if (expression.length > limits.chars) refuse('too_long');
    if (!expression.trim()) refuse('empty');
    const vars = variableMap(variables, limits);
    const tree = parse(tokenize(expression, limits), limits);
    const { value, operations } = evaluate(tree, vars, limits);
    return { ok: true, value, display: display(value), operations };
  } catch (err) {
    if (err instanceof Refusal) return { ok: false, reason: err.reason, ...(err.detail ? { detail: err.detail } : {}) };
    if (err instanceof RangeError) return { ok: false, reason: 'too_deep' }; // a stack overflow the depth bound should already prevent
    throw err;
  }
}

// --- R8b.02 computational evidence ---------------------------------------------------------------------------------------------------------
// A discriminated record: kind 'computation', never a fake URL in the web evidence shape. id and inputHash are deterministic functions of the
// expression, the inputs and the evaluator and limits versions: the same inputs replay to the same id; a new source value gives a new one.
// inputs: [{ name, value, unit?, premiseId? }]; premiseId names the verified premise (evidence record id) the value came from.
const normalizeInputs = (variables, units = {}, premises = {}) => Object.keys(variables || {}).sort().map(name => ({
  name, value: variables[name], ...(units?.[name] ? { unit: units[name] } : {}), ...(premises?.[name] ? { premiseId: premises[name] } : {}) }));
const canonicalExpression = expression => expression.trim().replace(/\s+/g, ' ');
const idHash = async (expression, inputs) => sha256Hex(canonicalJson({ expression: canonicalExpression(expression), inputs, evaluatorVersion: EVALUATOR_VERSION, limitsVersion: CALC_LIMITS_VERSION }));

export async function computationEvidence({ expression, variables, units, premises, resultUnit }, limits = CALC_LIMITS) {
  const unitProblem = unitIssue(variables, units, resultUnit, limits);
  if (unitProblem) return { status: 'needs_clarification', reason: unitProblem };
  const out = calculateExpression({ expression, variables }, limits);
  if (!out.ok) return { status: out.reason === 'unbound_name' ? 'needs_clarification' : 'unsupported', reason: out.reason, ...(out.detail ? { detail: out.detail } : {}) };
  const inputs = normalizeInputs(variables, units, premises), inputHash = await idHash(expression, inputs);
  const distinct = new Set(inputs.map(i => i.unit).filter(Boolean));
  const limitations = ['floating_point_not_exact_proof', 'arithmetic_only_assumptions_not_checked',
    ...(distinct.size > 1 ? ['units_labels_only_no_dimensional_analysis'] : []), ...(inputs.some(i => !i.premiseId) && inputs.length ? ['inputs_not_bound_to_a_source'] : [])];
  return { status: 'ok', evidence: { kind: 'computation', id: `cmp_${inputHash.slice(0, 16)}`, expression: canonicalExpression(expression), inputs, result: out.value, display: out.display,
    ...(resultUnit ? { resultUnit } : {}), evaluatorVersion: EVALUATOR_VERSION, limitsVersion: CALC_LIMITS_VERSION, inputHash: `sha256:${inputHash}`, precision: PRECISION, operations: out.operations, limitations } };
}

// The evaluator does labels, not conversions: a result unit that is not the single common input unit, or units that are not strings, ask the learner.
function unitIssue(variables, units, resultUnit, limits) {
  const bad = u => typeof u !== 'string' || !u || u.length > limits.unitChars || !/^[A-Za-z0-9_/^%.* -]+$/.test(u);
  for (const [name, u] of Object.entries(units || {})) if (!own(variables || {}, name) || bad(u)) return 'unit_unsupported';
  if (resultUnit === undefined) return null;
  if (bad(resultUnit)) return 'unit_unsupported';
  const distinct = new Set(Object.values(units || {}));
  return distinct.size === 1 && distinct.has(resultUnit) ? null : 'unit_conversion_unsupported';
}

// verifyComputationEvidence(evidence, { premises, limits }) -> { ok: true, evidenceClass: 'computed' } | { ok: false, reason }.
// Re-evaluates from the retained expression and inputs: a tampered result, a mismatched hash, a foreign evaluator version, a non-finite value or a
// premise that no longer matches (stale revision, changed value) is refused. premises: { [premiseId]: { value, unit?, revision? } } as re-read
// from the cited evidence by the caller; an input bound to a premise must still equal it. Only then may a check cite the derivation.
export async function verifyComputationEvidence(ev, { premises = {}, limits = CALC_LIMITS } = {}) {
  const no = reason => ({ ok: false, reason });
  if (!ev || ev.kind !== 'computation') return no('not_a_computation');
  if (ev.evaluatorVersion !== EVALUATOR_VERSION || ev.limitsVersion !== CALC_LIMITS_VERSION) return no('evaluator_version_mismatch');
  if (!Array.isArray(ev.inputs) || typeof ev.expression !== 'string') return no('malformed');
  if (typeof ev.result !== 'number' || !Number.isFinite(ev.result)) return no('not_finite');
  const variables = {}, units = {}, bound = {};
  for (const i of ev.inputs) { variables[i.name] = i.value; if (i.unit) units[i.name] = i.unit; if (i.premiseId) bound[i.name] = i.premiseId; }
  for (const i of ev.inputs) {
    if (!i.premiseId) continue;
    const p = premises[i.premiseId];
    if (!p) return no('premise_missing');
    if (p.value !== i.value || (p.unit ?? undefined) !== (i.unit ?? undefined)) return no('premise_changed');
    if (p.stale) return no('premise_stale');
  }
  const again = await computationEvidence({ expression: ev.expression, variables, units, premises: bound, ...(ev.resultUnit ? { resultUnit: ev.resultUnit } : {}) }, limits);
  if (again.status !== 'ok') return no('not_reproducible');
  if (again.evidence.inputHash !== ev.inputHash || again.evidence.id !== ev.id) return no('input_hash_mismatch');
  if (again.evidence.result !== ev.result || again.evidence.display !== ev.display) return no('result_mismatch');
  return { ok: true, evidenceClass: 'computed' };
}

// --- dispatcher registration (roadmap-tools.js `calculate_expression`) ---------------------------------------------------------------------
// Separate switch, default off, and also behind ROADMAP_ENABLED. Both must be exactly 'true'.
export const calculatorEnabled = env => env?.ROADMAP_ENABLED === 'true' && env?.ROADMAP_CALCULATOR === 'true';

// calculatorHandlers(env, { premise }) -> { calculate_expression } | {}   Flag off: no handler exists, so nothing can run.
// deps.premise(id) -> { value, unit?, stale? } | null re-reads the verified premise the model named; an input claiming a premise whose value differs
// from the premise is refused (needs_clarification), so the model cannot dress an invented number as a cited one.
export function calculatorHandlers(env, deps = {}) {
  if (!calculatorEnabled(env)) return {};
  return { calculate_expression: async args => {
    const premiseIds = args.premises || {};
    if (Object.keys(premiseIds).length) {
      if (typeof deps.premise !== 'function') return { status: 'unavailable', reason: 'no_premise_reader' };
      for (const [name, id] of Object.entries(premiseIds)) {
        const p = await deps.premise(id);
        if (!p || p.stale) return { status: 'needs_clarification', reason: 'premise_unavailable', detail: name };
        if (p.value !== args.variables?.[name] || (p.unit ?? undefined) !== (args.units?.[name] ?? undefined)) return { status: 'needs_clarification', reason: 'premise_mismatch', detail: name };
      }
    }
    return computationEvidence({ expression: args.expression, variables: args.variables, units: args.units, premises: premiseIds, resultUnit: args.resultUnit });
  } };
}

// What the learner may see of a computation (R8b.03): the expression, inputs, the displayed result and its caveats; never evaluator ids or hashes.
export const computationDisclosure = ev => ({ expression: ev.expression, inputs: ev.inputs.map(({ name, value, unit }) => ({ name, value, ...(unit ? { unit } : {}) })),
  result: ev.display, ...(ev.resultUnit ? { unit: ev.resultUnit } : {}), note: 'Calculated with floating-point arithmetic from the values shown; the values themselves are as given.' });
