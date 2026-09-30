// The worker validates this specification again before rendering; this copy
// fails a bad request fast, without a round trip, and keeps the two strings
// that reach an interpreter allowlisted on both sides.
import SCHEMA from '../../math-renderer/math-schema.json' with { type: 'json' };
import { validateToolInput } from './learn-validation.js';

const TEX_COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'sqrt', 'sum', 'prod', 'int', 'lim', 'log', 'ln', 'exp',
  'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'min', 'max', 'arg', 'det',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda',
  'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  'cdot', 'cdots', 'ldots', 'dots', 'times', 'div', 'pm', 'mp', 'ast', 'star',
  'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'propto', 'in', 'notin', 'subset', 'supset', 'cup', 'cap',
  'to', 'mapsto', 'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'leftrightarrow', 'infty', 'partial', 'nabla',
  'hat', 'bar', 'vec', 'tilde', 'dot', 'ddot', 'overline', 'underline',
  'text', 'mathrm', 'mathbf', 'mathbb', 'mathcal', 'operatorname',
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'quad', 'qquad', 'space',
  'begin', 'end', 'matrix', 'pmatrix', 'bmatrix', 'cases', 'aligned']);
const TEX_CHARACTERS = /^[A-Za-z0-9\s+\-*/=<>()[\]{}|,.!'^_:;~\\&]*$/;
const EXPRESSION_NAMES = new Set(['x', 'pi', 'e', 'tau']);
const EXPRESSION_CALLS = new Set(['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log2', 'log10',
  'sqrt', 'abs', 'floor', 'ceil', 'atan', 'asin', 'acos', 'pow', 'erf']);
const STEP_FIELDS = {
  equation: ['expressions', 'highlight'],
  plot: ['functions', 'xRange', 'yRange', 'marker'],
  shapes: ['objects', 'moves'],
  matrix: ['rows', 'emphasise', 'grid'],
};
const STEP_REQUIRED = { equation: 'expressions', plot: 'functions', shapes: 'objects', matrix: 'rows' };
const MAX_SECONDS = 45;

export function safeTex(value, path) {
  // Control characters are what a lost backslash leaves behind ('\f' is a form feed).
  if (!TEX_CHARACTERS.test(value) || /[$%#]/.test(value) || /[\x00-\x08\x0b-\x1f\x7f]/.test(value)) throw new Error(`${path}: unsupported characters in a maths expression`);
  for (const [, command] of value.matchAll(/\\([A-Za-z]+)/g)) {
    if (!TEX_COMMANDS.has(command)) throw new Error(`${path}: unsupported LaTeX command \\${command}`);
  }
  return value;
}

// Arithmetic only: numbers, x, the allowlisted functions and the operators
// between them. Calls are checked by name, then every remaining word must be
// a known constant, and what is left has to be arithmetic.
export function safeExpression(value, path) {
  const withoutCalls = value.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, (match, name) => {
    if (!EXPRESSION_CALLS.has(name)) throw new Error(`${path}: unsupported function call ${name}`);
    return '(';
  });
  const bare = withoutCalls.replace(/[A-Za-z_][A-Za-z0-9_]*/g, name => {
    if (!EXPRESSION_NAMES.has(name)) throw new Error(`${path}: unknown name ${name}`);
    return '1';
  });
  if (!/^[\d\s+\-*/%^().]*$/.test(bare)) throw new Error(`${path}: unsupported expression element`);
  return value;
}

export function validateMathAnimation(value) {
  validateToolInput(value, SCHEMA, 'generate_math_animation');
  let total = 0;
  value.scene.steps.forEach((step, index) => {
    const path = `scene.steps[${index}]`;
    const allowed = new Set([...STEP_FIELDS[step.kind], 'kind', 'note', 'hold']);
    if (Object.keys(step).some(key => !allowed.has(key))) throw new Error(`${path}: fields that do not belong to a ${step.kind} step`);
    if (!(STEP_REQUIRED[step.kind] in step)) throw new Error(`${path}: a ${step.kind} step needs ${STEP_REQUIRED[step.kind]}`);
    total += step.hold ?? 2;
    if (step.note) safeTex(step.note, `${path}.note`);
    if (step.kind === 'equation') {
      step.expressions.forEach((expression, spot) => safeTex(expression, `${path}.expressions[${spot}]`));
      (step.highlight || []).forEach((fragment, spot) => safeTex(fragment, `${path}.highlight[${spot}]`));
    } else if (step.kind === 'plot') {
      step.functions.forEach((fn, spot) => {
        safeExpression(fn.expression, `${path}.functions[${spot}].expression`);
        if (fn.label) safeTex(fn.label, `${path}.functions[${spot}].label`);
      });
      for (const axis of ['xRange', 'yRange']) {
        if (step[axis] && step[axis][0] >= step[axis][1]) throw new Error(`${path}.${axis}: the range must increase`);
      }
      const span = step.xRange || [-5, 5];
      if (step.marker && !(span[0] <= step.marker.from && step.marker.from <= span[1] && span[0] <= step.marker.to && step.marker.to <= span[1])) {
        throw new Error(`${path}.marker: the marker leaves the plotted range`);
      }
    } else if (step.kind === 'shapes') {
      const ids = step.objects.map(item => item.id);
      if (new Set(ids).size !== ids.length) throw new Error(`${path}.objects: duplicate ids`);
      step.objects.forEach((item, spot) => {
        if (['arrow', 'line'].includes(item.type) && !item.to) throw new Error(`${path}.objects[${spot}]: a ${item.type} needs an end point`);
        if (['label', 'brace'].includes(item.type) && !item.text) throw new Error(`${path}.objects[${spot}]: a ${item.type} needs text`);
        if (item.text) safeTex(item.text, `${path}.objects[${spot}].text`);
      });
      (step.moves || []).forEach((move, spot) => {
        if (!ids.includes(move.target)) throw new Error(`${path}.moves[${spot}].target: no object with that id in this step`);
      });
    } else {
      const widths = new Set(step.rows.map(row => row.length));
      if (widths.size !== 1) throw new Error(`${path}.rows: every row needs the same number of entries`);
      step.rows.forEach((row, rowIndex) => row.forEach((entry, column) => safeTex(entry, `${path}.rows[${rowIndex}][${column}]`)));
      const spot = step.emphasise || {};
      if ('row' in spot && spot.row >= step.rows.length) throw new Error(`${path}.emphasise.row: no such row`);
      if ('column' in spot && spot.column >= [...widths][0]) throw new Error(`${path}.emphasise.column: no such column`);
    }
  });
  if (total > MAX_SECONDS) throw new Error(`The animation runs ${Math.round(total)}s; the limit is ${MAX_SECONDS}s`);
  return { ...value, quality: value.quality || 'low' };
}
