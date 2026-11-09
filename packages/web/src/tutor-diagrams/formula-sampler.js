const MAX_COORDINATE = 1e9;
const MAX_FORMULA_LENGTH = 256;
const MAX_TOKENS = 128;
const MAX_DEPTH = 32;

const TOKEN = /\s*(?:((?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*|[()+*/^,-]))/gy;

const BINARY = new Map([
  ['+', [1, (a, b) => a + b]],
  ['-', [1, (a, b) => a - b]],
  ['*', [2, (a, b) => a * b]],
  ['/', [2, (a, b) => a / b]],
  ['^', [4, (a, b) => a ** b]],
]);
const SIGN_PRECEDENCE = 3;

const FUNCTIONS = new Map([
  ['exp', [Math.exp]],
  ['log', [Math.log]],
  ['log2', [Math.log2]],
  ['sqrt', [Math.sqrt]],
  ['abs', [Math.abs]],
  ['sin', [Math.sin]],
  ['cos', [Math.cos]],
  ['tanh', [Math.tanh]],
  ['max', [Math.max, 2, 8]],
  ['min', [Math.min, 2, 8]],
]);

function finite(value) {
  if (!Number.isFinite(value)) throw new RangeError('Formula produces a nonfinite number');
  return value;
}

function tokenize(formula) {
  if (typeof formula !== 'string') throw new TypeError('Formula must be a string');
  if (formula.length > MAX_FORMULA_LENGTH) throw new RangeError('Formula is too long');

  const source = formula.trim().replaceAll('−', '-');
  const tokens = [];
  let end = 0;
  for (const match of source.matchAll(TOKEN)) {
    if (tokens.length === MAX_TOKENS) throw new RangeError('Formula has too many tokens');
    const [text, number, symbol] = match;
    tokens.push(number === undefined ? symbol : finite(Number(number)));
    end = match.index + text.length;
  }
  if (end !== source.length) throw new SyntaxError('Invalid character in formula');
  return tokens;
}

function compileFormula(formula) {
  const tokens = tokenize(formula);
  let index = 0;

  function consume(token) {
    if (tokens[index] !== token) return false;
    index += 1;
    return true;
  }

  function expect(token) {
    if (!consume(token)) throw new SyntaxError(`Expected "${token}" in formula`);
  }

  function parseOperand(depth) {
    const token = tokens[index++];
    if (typeof token === 'number') return () => token;
    if (token === 'x') return x => x;
    if (token === '+' || token === '-') {
      const operand = parseExpression(SIGN_PRECEDENCE, depth + 1);
      return token === '-' ? x => -operand(x) : operand;
    }
    if (token === '(') {
      const operand = parseExpression(1, depth + 1);
      expect(')');
      return operand;
    }

    const builtin = FUNCTIONS.get(token);
    if (!builtin) throw new SyntaxError('Expected a number, x, or an allowlisted function');
    const [apply, minArgs = 1, maxArgs = minArgs] = builtin;
    const args = [];
    expect('(');
    do {
      if (args.length === maxArgs) throw new SyntaxError(`Too many arguments to ${token}`);
      args.push(parseExpression(1, depth + 1));
    } while (consume(','));
    expect(')');
    if (args.length < minArgs) throw new SyntaxError(`Too few arguments to ${token}`);
    return x => finite(apply(...args.map(arg => arg(x))));
  }

  function parseExpression(minPrecedence, depth) {
    if (depth > MAX_DEPTH) throw new RangeError('Formula nesting is too deep');
    let evaluate = parseOperand(depth);
    for (;;) {
      const token = tokens[index];
      const operator = BINARY.get(token);
      if (!operator || operator[0] < minPrecedence) return evaluate;
      const [precedence, apply] = operator;
      index += 1;
      const left = evaluate;
      // Allow a power of the same precedence on the right so 2^3^2 is 2^(3^2).
      const right = parseExpression(token === '^' ? precedence : precedence + 1, depth + 1);
      evaluate = x => finite(apply(left(x), right(x)));
    }
  }

  const evaluate = parseExpression(1, 0);
  if (index !== tokens.length) throw new SyntaxError('Unexpected token in formula');
  return evaluate;
}

function checkAxis(name, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max || min < -MAX_COORDINATE || max > MAX_COORDINATE) {
    throw new RangeError(`${name} axis bounds must be increasing numbers within ±${MAX_COORDINATE}`);
  }
}

/**
 * Sample a formula at 2–24 evenly spaced x values, including both endpoints.
 * Accepts decimal literals, x, + - − * / ^, parentheses, and allowlisted calls.
 * min and max take 2–8 arguments. exp, log (natural), log2, sqrt, abs, sin,
 * cos, and tanh take one. Parsing is capped at 256 characters, 128 tokens,
 * and 32 levels of recursion. Axis bounds must increase within ±1e9.
 * Invalid inputs and nonfinite or out-of-bounds results throw.
 */
export function sampleFormula({ formula, xMin, xMax, samples }, { yMin = -MAX_COORDINATE, yMax = MAX_COORDINATE } = {}) {
  checkAxis('x', xMin, xMax);
  checkAxis('y', yMin, yMax);
  if (!Number.isInteger(samples) || samples < 2 || samples > 24) {
    throw new RangeError('Sample count must be an integer from 2 to 24');
  }

  const evaluate = compileFormula(formula);
  const span = xMax - xMin;
  const last = samples - 1;
  return Array.from({ length: samples }, (_, index) => {
    let x = xMin + (span * index) / last;
    if (index === 0) x = xMin;
    if (index === last) x = xMax;
    const y = evaluate(x);
    if (y < yMin || y > yMax) throw new RangeError(`Formula sample ${index + 1} is outside the y axis bounds`);
    return { x, y };
  });
}
