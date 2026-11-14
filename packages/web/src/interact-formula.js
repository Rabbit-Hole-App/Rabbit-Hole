import { PLAN_LIMITS, SCALAR_FUNCTIONS, ScalarExprError, evalScalar, scalarExprProblem } from './interact-plan.js';
import { curveRoles, curveWords, independent } from './interact-curve-data.js';

// Formula strings for plan quantities (owner brief 2026-11-13 15:35, template build). A quantity's `formula` is text such as `launchSpeed * t - gravity * t^2 / 2`; this file turns it into the
// bounded ScalarExpr tree (interact-plan.js: data, never code, 32 nodes, 8 levels) with our own recursive-descent parser: no eval, no Function. The six function operations have interval proofs there;
// piecewise lives one level up, on the quantity: `formula` applies while t < switchAt, `formulaAfter` from switchAt on (switchAt is over inputs and fixed values only, no t).
//
// Grammar: numbers (1, 1.62, .5, 2e-3), identifiers, + - * /, unary minus, parentheses, `^` with a LITERAL integer exponent 2 to 4 (expanded to multiplies),
// and exp/log/sqrt/abs (one argument), min/max (two). Nothing else, at most 200 characters.
//   expr := term (('+'|'-') term)*     term := unary (('*'|'/') unary)*     unary := '-' unary | power     power := primary ('^' INT)?
//   primary := NUMBER | NAME | '(' expr ')' | FUNCTION '(' expr (',' expr)? ')'
// Readable names: `t`, the plan's number-input ids (`names`), and the keys of mode.fixedValues (`fixed`, a number each; the value becomes a literal). -x on a literal folds to a negative literal.
// This module imports interact-plan.js and interact-plan.js imports it (plan validation parses the formulas): every use of the other module's bindings is inside a function, never at load time.

export const FORMULA_EXPONENT = Object.freeze({ min: 2, max: 4 });

// The roles each template reads (interact-templates/). `slots` on a plan's scene maps each role to a quantity id.
//   one-body : slots = { height, velocity, acceleration }                                   one moving body
//   two-lane : slots = { <laneName>: { height, velocity, acceleration }, <laneName>: {...} } two lanes, one set of roles per lane (the plan's own lane names, for example toss and drop); exactly two lanes
//   body-plot: slots = { height, velocity, acceleration, force, plotted }                     one body with a velocity-time plot; `plotted` is the quantity the plot draws
export const TEMPLATE_ROLES = Object.freeze({
  'one-body': Object.freeze({ lanes: 0, roles: Object.freeze(['height', 'velocity', 'acceleration']) }),
  'two-lane': Object.freeze({ lanes: 2, roles: Object.freeze(['height', 'velocity', 'acceleration']) }),
  'body-plot': Object.freeze({ lanes: 0, roles: Object.freeze(['height', 'velocity', 'acceleration', 'force', 'plotted']) }),
  'curve-one': Object.freeze({ lanes: 0, roles: curveRoles, independent }),
  'curve-compare': Object.freeze({ lanes: 0, roles: curveRoles, independent }),
  'curve-readouts': Object.freeze({ lanes: 0, roles: curveRoles, independent }),
});

// The words each template draws (owner brief 11: the template holds no wording; the plan's scene.words does). Each entry is [path, maxCharacters, what it is]: the path is where the template reads it
// (nested, for example "where.top"), the plan stores it flat under the key with the dots turned to underscores ("where_top"). Limits are the sdk helpers' own: a lane heading is at most 24 characters,
// a lane state line 32, a callout line 40 (sdk-figures.js), a letter beside an arrow 4.
const WORDS = {
  ...curveWords,
  'one-body': [['lane', 24, 'heading of the lane'], ['launch', 40, 'label of the launch-height guide'], ['gravity.pulls', 40, 'callout line while gravity pulls the body down'], ['gravity.none', 40, 'callout line when nothing pulls'],
    ['motion.up', 40, 'callout line while the body moves up'], ['motion.top', 40, 'callout line while the body is still for an instant at the top'], ['motion.down', 40, 'callout line while the body moves down'],
    ['where.launch', 32, 'lane state at launch'], ['where.top', 32, 'lane state at the top'], ['where.end', 32, 'lane state when back at the launch height'], ['where.up', 32, 'lane state while rising'], ['where.down', 32, 'lane state while falling'],
    ['readout.motion', 24, 'label of the Motion state readout'], ['readout.gravity', 24, 'label of the Gravity state readout']],
  'two-lane': [['lane.first', 24, 'heading of the first lane (the toss)'], ['lane.second', 24, 'heading of the second lane (the released ball)'],
    ['first.where.launch', 32, 'first lane state at launch'], ['first.where.top', 32, 'first lane state at the top'], ['first.where.end', 32, 'first lane state when back at the launch height'], ['first.where.up', 32, 'first lane state while rising'], ['first.where.down', 32, 'first lane state while falling'],
    ['second.where.held', 32, 'second lane state while the gate holds the ball'], ['second.where.released', 32, 'second lane state at the instant of release'], ['second.where.end', 32, 'second lane state when back at the launch height'], ['second.where.falling', 32, 'second lane state while both fall together'],
    ['launch', 40, 'label of the launch-height guide'], ['axis.label', 40, 'title of the height axis'], ['v', 4, 'letter beside a velocity arrow'], ['a', 4, 'letter beside an acceleration arrow']],
  'body-plot': [['lane', 24, 'heading of the lane'], ['launch', 40, 'label of the launch-height guide'], ['axis.label', 40, 'title of the height axis'], ['v', 4, 'letter beside the velocity arrow'], ['a', 4, 'letter beside the acceleration arrow'], ['force', 4, 'letter of the force in its callout line'],
    ['where.launch', 32, 'lane state at launch'], ['where.top', 32, 'lane state at the top'], ['where.end', 32, 'lane state when back at the launch height'], ['where.up', 32, 'lane state while rising'], ['where.down', 32, 'lane state while falling'],
    ['plot.heading', 40, 'heading of the plot'], ['plot.yLabel', 40, 'title of the plot value axis'], ['plot.line', 40, 'legend label of the plotted line'], ['plot.now', 40, 'legend label of the moving dot'], ['plot.slope', 24, 'start of the slope note (a number follows it)'], ['plot.eq', 24, 'start of the equation beside the heading (numbers follow it)'],
    ['readout.motion', 24, 'label of the Motion state readout']],
};
export const wordKey = path => path.split('.').join('_');
export const TEMPLATE_WORDS = Object.freeze(Object.fromEntries(Object.entries(WORDS).map(([name, list]) => [name, Object.freeze(list.map(([path, max, what]) => Object.freeze({ path, key: wordKey(path), max, what })))])));
// -> the nested object a template program reads (W.where.top) from the plan's flat scene.words.
export function nestWords(template, words) {
  const out = {};
  for (const { path, key } of TEMPLATE_WORDS[template] ?? []) {
    const parts = path.split('.'); let at = out;
    for (const part of parts.slice(0, -1)) at = at[part] ??= {};
    at[parts.at(-1)] = words[key];
  }
  return out;
}

const fail = (code, message, position, token) => Object.assign(new ScalarExprError(code, message), { position, token });
const lit = value => ({ op: 'literal', value }), input = id => ({ op: 'input', id });
const BIN = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide' };

function tokenize(text) {
  const tokens = [], re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z][A-Za-z0-9_]*)|([-+*/^(),])|(\S))/y;
  re.lastIndex = 0;
  for (let m; re.lastIndex < text.length && (m = re.exec(text));) {
    const position = m.index + m[0].length - (m[1] ?? m[2] ?? m[3] ?? m[4]).length;
    if (m[4] !== undefined) throw fail('formula_syntax', `unexpected "${m[4]}" at character ${position + 1}`, position, m[4]);
    tokens.push(m[1] !== undefined ? { type: 'num', text: m[1], position } : m[2] !== undefined ? { type: 'name', text: m[2], position } : { type: m[3], text: m[3], position });
  }
  return tokens;
}

const nodeCount = node => (node.op === 'literal' || node.op === 'input' ? 1 : node.arg ? 1 + nodeCount(node.arg) : 1 + nodeCount(node.left) + nodeCount(node.right));
const depthOf = node => (node.op === 'literal' || node.op === 'input' ? 1 : node.arg ? 1 + depthOf(node.arg) : 1 + Math.max(depthOf(node.left), depthOf(node.right)));

// -> ScalarExpr. `names`: the readable names besides `t` (the number inputs); `fixed`: { id: number } literals; `time: false` makes `t` unreadable (switchAt). Throws ScalarExprError with a position and token.
export function parseFormula(text, { names = [], fixed = {}, time = true } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw fail('formula_syntax', 'a formula is not empty', 0, '');
  if (text.length > PLAN_LIMITS.formula) throw fail('formula_too_long', `a formula is at most ${PLAN_LIMITS.formula} characters (this one has ${text.length})`, PLAN_LIMITS.formula, text.slice(PLAN_LIMITS.formula, PLAN_LIMITS.formula + 8));
  const readable = new Set([...(time ? ['t'] : []), ...names]), tokens = tokenize(text);
  let at = 0;
  const peek = () => tokens[at], take = () => tokens[at++];
  const unexpected = (token, wanted) => fail('formula_syntax', token ? `unexpected "${token.text}" at character ${token.position + 1}${wanted ? `, expected ${wanted}` : ''}` : `the formula ends too soon${wanted ? `, expected ${wanted}` : ''}`, token?.position ?? text.length, token?.text ?? '');
  const primary = () => {
    const token = take();
    if (!token) throw unexpected(null, 'a number, a name or "("');
    if (token.type === 'num') { const value = Number(token.text); if (!Number.isFinite(value)) throw fail('formula_syntax', `"${token.text}" is not a finite number (character ${token.position + 1})`, token.position, token.text); return lit(value); }
    if (token.type === 'name') {
      if (Object.hasOwn(SCALAR_FUNCTIONS, token.text) && peek()?.type === '(') {
        take();
        const args = [];
        if (peek()?.type !== ')') {
          args.push(expr());
          while (peek()?.type === ',') { take(); args.push(expr()); }
        }
        const close = take();
        if (!close || close.type !== ')') throw unexpected(close, '")"');
        const arity = SCALAR_FUNCTIONS[token.text];
        if (args.length !== arity) throw fail('formula_arity', `${token.text} takes ${arity} argument${arity === 1 ? '' : 's'} (got ${args.length}, character ${token.position + 1})`, token.position, token.text);
        return arity === 1 ? { op: token.text, arg: args[0] } : { op: token.text, left: args[0], right: args[1] };
      }
      if (token.text in fixed && typeof fixed[token.text] === 'number' && Number.isFinite(fixed[token.text])) return lit(fixed[token.text]);
      if (readable.has(token.text)) return input(token.text);
      throw fail('formula_name', `unknown name "${token.text}" at character ${token.position + 1}${token.text === 't' && !time ? ' (this formula reads inputs and fixed values only, not t)' : `; readable: ${[...readable, ...Object.keys(fixed)].join(', ') || 'none'}`}`, token.position, token.text);
    }
    if (token.type === '(') { const inner = expr(); const close = take(); if (!close || close.type !== ')') throw unexpected(close, '")"'); return inner; }
    throw unexpected(token, 'a number, a name or "("');
  };
  const power = () => {
    const base = primary();
    if (peek()?.type !== '^') return base;
    const hat = take(), exponent = take();
    if (!exponent || exponent.type !== 'num' || !/^\d+$/.test(exponent.text) || Number(exponent.text) < FORMULA_EXPONENT.min || Number(exponent.text) > FORMULA_EXPONENT.max) {
      throw fail('formula_exponent', `"^" takes a literal whole exponent ${FORMULA_EXPONENT.min} to ${FORMULA_EXPONENT.max} (character ${hat.position + 1})`, exponent?.position ?? hat.position, exponent?.text ?? '^');
    }
    if (peek()?.type === '^') throw fail('formula_exponent', `"^" does not chain (character ${peek().position + 1}); write the product out`, peek().position, '^');
    let out = base;
    for (let k = 1; k < Number(exponent.text); k += 1) out = { op: 'multiply', left: out, right: structuredClone(base) };
    return out;
  };
  const unary = () => {
    if (peek()?.type !== '-') return power();
    take();
    const operand = unary();
    return operand.op === 'literal' ? lit(operand.value === 0 ? 0 : -operand.value) : { op: 'multiply', left: lit(-1), right: operand };
  };
  const chain = (next, kinds) => () => {
    let left = next();
    while (peek() && kinds.includes(peek().type)) {
      const operator = take(), right = next();
      if (operator.type === '/' && right.op === 'literal' && right.value === 0) throw fail('division_by_zero', `division by zero at character ${operator.position + 1}`, operator.position, '/');
      left = { op: BIN[operator.type], left, right };
    }
    return left;
  };
  const term = chain(unary, ['*', '/']), expr = chain(term, ['+', '-']);
  const tree = expr();
  if (at < tokens.length) throw unexpected(peek(), 'an operator or the end');
  const nodes = nodeCount(tree), levels = depthOf(tree);
  if (nodes > PLAN_LIMITS.exprNodes) throw fail('unsafe_expression', `this formula needs ${nodes} nodes; at most ${PLAN_LIMITS.exprNodes} (simplify it or split it into quantities)`, 0, '');
  if (levels > PLAN_LIMITS.exprDepth) throw fail('unsafe_expression', `this formula is ${levels} levels deep; at most ${PLAN_LIMITS.exprDepth}`, 0, '');
  const problem = scalarExprProblem(tree);
  if (problem) throw fail('unsafe_expression', problem.message, 0, '');
  return tree;
}

// Numeric controls and fixed values, plus a still template's declared independent
// name. Timed/legacy formulas retain t; a still curve admits x instead of t.
export function formulaScope(plan) {
  const names = plan.controls.filter(c => c.type === 'number' && c.binding.kind === 'input').map(c => c.binding.id);
  const fixed = Object.fromEntries(Object.entries(plan.mode.fixedValues ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));
  const independent = TEMPLATE_ROLES[plan.scene?.template]?.independent;
  return { names: [...names, ...(independent ? [independent.id] : [])], fixed, ...(independent ? { time: false } : {}) };
}

// -> { formula, switchAt?, formulaAfter? } as ScalarExpr trees, or null when the quantity has no formula. Throws ScalarExprError, the message naming the quantity and which text failed.
export function parseQuantity(quantity, scope) {
  if (quantity.formula === undefined) return null;
  const wrap = (which, run) => { try { return run(); } catch (error) { if (error instanceof ScalarExprError) error.message = `quantity "${quantity.id}" ${which}: ${error.message}`; throw error; } };
  const out = { formula: wrap('formula', () => parseFormula(quantity.formula, scope)) };
  if (quantity.switchAt !== undefined || quantity.formulaAfter !== undefined) {
    if (quantity.switchAt === undefined || quantity.formulaAfter === undefined) throw fail('formula_pair', `quantity "${quantity.id}": switchAt and formulaAfter come together or not at all`, 0, '');
    out.switchAt = wrap('switchAt', () => parseFormula(quantity.switchAt, { ...scope, time: false }));
    out.formulaAfter = wrap('formulaAfter', () => parseFormula(quantity.formulaAfter, scope));
  }
  return out;
}

// The quantity's value at inputs and t. `inputs` holds the number inputs; `fixed` the plan's fixed numbers (literals). The after branch applies at t == switchAt.
export function evalQuantity(quantity, inputs, t, domains = {}, fixed = {}) {
  const parsed = parseQuantity(quantity, { names: Object.keys(inputs), fixed });
  if (!parsed) throw new ScalarExprError('no_formula', `quantity "${quantity.id}" has no formula`);
  const values = { ...inputs, t };
  const after = parsed.switchAt && !(t < evalScalar(parsed.switchAt, inputs, domains));
  return evalScalar(after ? parsed.formulaAfter : parsed.formula, values, domains);
}

// ScalarExpr -> JS using numeric literals, readable names, arithmetic and only
// the six whitelisted Math functions. `allowed` refuses any other input name.
// Domain/division/non-finite results remain the caller's concern (evalScalar
// and scalarInterval refuse them; emitted JS follows the same Math semantics).
export function exprToJs(expr, allowed = null) {
  const problem = scalarExprProblem(expr);
  if (problem) throw new ScalarExprError('unsafe_expression', problem.message);
  const ok = allowed ? new Set(allowed) : null, SIGN = { add: '+', subtract: '-', multiply: '*', divide: '/' };
  const go = node => {
    if (node.op === 'literal') return node.value < 0 || Object.is(node.value, -0) ? `(${node.value})` : String(node.value);
    if (node.op === 'input') { if (ok && !ok.has(node.id)) throw new ScalarExprError('unknown_input', `name "${node.id}" is not allowed here`); return node.id; }
    if (Object.hasOwn(SCALAR_FUNCTIONS, node.op)) {
      const args = SCALAR_FUNCTIONS[node.op] === 1 ? [go(node.arg)] : [go(node.left), go(node.right)];
      return `Math.${node.op}(${args.join(', ')})`;
    }
    return `(${go(node.left)} ${SIGN[node.op]} ${go(node.right)})`;
  };
  return go(expr);
}
