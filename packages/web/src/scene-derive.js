// The derive seam. One mechanism, reused everywhere a scene needs a number
// that is the result of an operation it already represents, instead of a
// second one invented per lesson. See docs/superpowers/specs/
// 2026-09-18-tier1-visual-library-design.md's "Derive" section - same shape
// (a named, pure, allowlisted registry entry, `{defined, value}` or
// `{defined: false, reason}`, never throws) - and docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md's rule this exists to
// enforce: a teaching visualization must never display a numeric relationship
// that is not mechanically consistent with the data it visibly presents.
//
// Deliberately small: dot product, a small matrix multiply, softmax and sum -
// the operations the current static benchmark cases actually need, not a
// general expression engine. Add the next one the day a scene references it.

export const round = value => {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
};

const isVector = value => Array.isArray(value) && value.length > 0 && value.every(entry => typeof entry === 'number' && Number.isFinite(entry));

export const DERIVATIONS = {
  dot: {
    outputs: ['value'],
    derive([a, b]) {
      if (!isVector(a) || !isVector(b)) return { defined: false, reason: 'dot needs two vectors of numbers' };
      if (a.length !== b.length) return { defined: false, reason: `dot needs equal-length vectors, got lengths ${a.length} and ${b.length}` };
      return { defined: true, value: round(a.reduce((sum, ai, i) => sum + ai * b[i], 0)) };
    },
  },
  // A x Bᵀ: every row of a dotted against every row of b. This is the shape
  // every teaching score matrix in this benchmark needs (Q x Kᵀ, a similarity
  // matrix, a cost matrix) - never a general matrix product.
  matmul: {
    outputs: ['value'],
    derive([a, b]) {
      if (!Array.isArray(a) || !Array.isArray(b) || !a.every(isVector) || !b.every(isVector)) {
        return { defined: false, reason: 'matmul needs two lists of equal-length vectors' };
      }
      const width = a[0].length;
      if (!a.every(row => row.length === width) || !b.every(row => row.length === width)) {
        return { defined: false, reason: 'matmul needs every row across both lists to share the same length' };
      }
      return { defined: true, value: a.map(rowA => b.map(rowB => round(rowA.reduce((sum, x, i) => sum + x * rowB[i], 0)))) };
    },
  },
  softmax: {
    outputs: ['value'],
    derive([a]) {
      const row = values => {
        const max = Math.max(...values);
        const exps = values.map(x => Math.exp(x - max));
        const total = exps.reduce((sum, x) => sum + x, 0);
        return exps.map(x => round(x / total));
      };
      if (isVector(a)) return { defined: true, value: row(a) };
      if (Array.isArray(a) && a.every(isVector)) return { defined: true, value: a.map(row) };
      return { defined: false, reason: 'softmax needs a vector, or a list of equal-length vectors, of numbers' };
    },
  },
  sum: {
    outputs: ['value'],
    derive([a]) {
      if (!isVector(a)) return { defined: false, reason: 'sum needs a vector of numbers' };
      return { defined: true, value: round(a.reduce((total, x) => total + x, 0)) };
    },
  },
  // weights (length N) combined with N rows of equal width: output[j] =
  // sum_i weights[i] * rows[i][j] - a real vector-matrix product, not a
  // second dot product. Attention's own "weighted mix of V" is one instance;
  // any weighted average of rows (a mixture, an ensemble, a cost blend) is
  // the same operation.
  weighted_sum: {
    outputs: ['value'],
    derive([weights, rows]) {
      if (!isVector(weights) || !Array.isArray(rows) || !rows.every(isVector)) {
        return { defined: false, reason: 'weighted_sum needs a vector of weights and a list of equal-length vectors' };
      }
      if (rows.length !== weights.length) {
        return { defined: false, reason: `weighted_sum needs one weight per row, got ${weights.length} weight(s) and ${rows.length} row(s)` };
      }
      const width = rows[0].length;
      if (!rows.every(row => row.length === width)) return { defined: false, reason: 'weighted_sum needs every row to share the same length' };
      const value = Array.from({ length: width }, (_, j) => round(rows.reduce((sum, row, i) => sum + weights[i] * row[j], 0)));
      return { defined: true, value };
    },
  },
  // A vector times a scalar factor - dividing raw scores by root(dk) before
  // softmax is the instance that motivated it, but rescaling a vector by a
  // named constant is generic (a temperature, a learning rate).
  scale: {
    outputs: ['value'],
    derive([vector, factor]) {
      if (!isVector(vector) || typeof factor !== 'number' || !Number.isFinite(factor)) {
        return { defined: false, reason: 'scale needs a vector and a finite numeric factor' };
      }
      return { defined: true, value: vector.map(x => round(x * factor)) };
    },
  },
  // Two equal-length vectors multiplied position by position - "weight times
  // value" is the instance case 04 needs; a mask, a per-element gate or a
  // cost weighting are the same operation.
  elementwise: {
    outputs: ['value'],
    derive([a, b]) {
      if (!isVector(a) || !isVector(b)) return { defined: false, reason: 'elementwise needs two vectors of numbers' };
      if (a.length !== b.length) return { defined: false, reason: `elementwise needs equal-length vectors, got lengths ${a.length} and ${b.length}` };
      return { defined: true, value: a.map((x, i) => round(x * b[i])) };
    },
  },
  // Combines several already-named numbers (or vectors) into one row, in the
  // order given - the one place a scene needs "these three separately
  // computed scalars, side by side" rather than a shape matmul or
  // weighted_sum already produces as a single call.
  concat: {
    outputs: ['value'],
    derive(args) {
      const flat = [];
      for (const arg of args) {
        if (typeof arg === 'number' && Number.isFinite(arg)) flat.push(round(arg));
        else if (isVector(arg)) flat.push(...arg.map(round));
        else return { defined: false, reason: 'concat needs numbers or vectors of numbers' };
      }
      return { defined: true, value: flat };
    },
  },
};

// A dotted path into a scene's exampleData - "q" or, for a named matrix,
// "Q.0" for its first row. Generic on purpose: exampleData is a bag of named
// vectors and small matrices, never attention-specific.
const lookupPath = (data, path) => path.split('.').reduce((node, key) => (node == null ? node : node[key]), data);

// pool starts as exampleData and gains one entry per resolved derivation (see
// resolveDerived below), so a later derivation may name an earlier one as an
// arg - "softmax.2" for row 2 of a softmax result - the same dotted-path
// convention as an exampleData vector, because to a derivation the two look
// identical: both are just named values it can read.
function resolveOneDerivation(name, spec, pool) {
  const entry = DERIVATIONS[spec?.op];
  if (!entry) throw new Error(`Scene "derived.${name}": unknown op "${spec?.op}" - known ops are ${Object.keys(DERIVATIONS).join(', ')}`);
  // An arg is a path into the pool (a name, or "name.2" for a row) UNLESS it
  // is itself already a number - a literal numeric parameter of the
  // operation (root(dk)'s reciprocal for `scale`), never a second way to
  // author a result the seam should have derived instead.
  const args = (spec.args || []).map(arg => (typeof arg === 'number' ? arg : lookupPath(pool, arg)));
  const result = entry.derive(args);
  if (!result.defined) throw new Error(`Scene "derived.${name}" (${spec.op}): ${result.reason}`);
  return result;
}

// True the moment a node contains an unresolved marker anywhere inside it -
// checked against the ORIGINAL initialState, before walk() has a chance to
// resolve anything, so a lie ("provenance: derived" with nothing to derive
// it from) can be told apart from the real thing.
const usesDeriveMarker = node => /"\$derive"|\{\{\w+\}\}/.test(JSON.stringify(node ?? null));

// pool (exampleData plus every resolved derivation's .value) is what both a
// derivation's own args AND a scene's $derive/{{}} markers read from - one
// lookup mechanism, not two. "scores.2" reaches row 2 of a matmul result the
// same way "Q.0" reaches a row of exampleData, because by the time a marker
// is resolved, a derived matrix and an authored one are the same shape of
// thing: a named value in the pool.
function walk(node, pool) {
  if (Array.isArray(node)) return node.map(entry => walk(entry, pool));
  if (node && typeof node === 'object') {
    if (typeof node.$derive === 'string' && Object.keys(node).length === 1) {
      const value = lookupPath(pool, node.$derive);
      if (value === undefined) throw new Error(`"$derive": "${node.$derive}" names no entry in the scene's "derived" block (or "exampleData")`);
      return value;
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      const resolved = walk(value, pool);
      // A grid or strip's `values` is always the flat array the schema
      // expects; a matmul's own shape is two-dimensional, so it is flattened
      // row-major exactly here, the one place a derived value ever meets it.
      out[key] = key === 'values' && Array.isArray(resolved) && Array.isArray(resolved[0]) ? resolved.flat() : resolved;
    }
    return out;
  }
  if (typeof node === 'string' && /\{\{\w+\}\}/.test(node)) {
    return node.replace(/\{\{([\w.]+)\}\}/g, (_, name) => {
      const value = lookupPath(pool, name);
      if (value === undefined) throw new Error(`"{{${name}}}" names no entry in the scene's "derived" block (or "exampleData")`);
      if (Array.isArray(value)) throw new Error(`"{{${name}}}" resolves to a list, not a number - reference it as a value instead of inside text`);
      return String(value);
    });
  }
  return node;
}

// The authored-data boundary: exampleData -> derived -> everything else.
// exampleData is the one place a lesson's ground-truth numbers are typed in;
// `derived` names, once each, every calculation the scene performs on it;
// every equation, matrix cell and caption that states one of those results
// must reference the name rather than repeat the number. Runs once, at the
// authoring gate, before validateScene's zod parse - never inside
// getSceneState, which stays pure, total and silent and does no arithmetic.
export function resolveDerived(raw) {
  const derivedSpecs = raw?.derived || {};
  // Grows by one entry per derivation, in declared order, so entry two may
  // reference entry one by name - a real pipeline (scores -> softmax ->
  // weighted output), not three unrelated lookups into exampleData.
  const pool = { ...(raw?.exampleData || {}) };
  for (const [name, spec] of Object.entries(derivedSpecs)) {
    const result = resolveOneDerivation(name, spec, pool);
    pool[name] = result.value;
  }
  const objects = (raw?.objects || []).map(object => {
    // An object may author no initialState at all - the schema defaults it
    // to {} at the zod stage, which runs after this - so the same default
    // applies here, or an object with nothing to derive would throw on the
    // provenance check below instead of passing through untouched.
    const authoredState = object.initialState || {};
    const usesDerive = usesDeriveMarker(authoredState);
    const initialState = walk(authoredState, pool);
    if (usesDerive) {
      // Earned, not claimed: a derived value stamps its own provenance so an
      // author cannot separately mark the same object illustrative or
      // literal. A displayed relationship still must derive honestly - this
      // only stops the label lying about work that did happen.
      if (initialState.provenance && initialState.provenance !== 'derived') {
        throw new Error(`Object "${object.id}" uses a derived value but declares provenance "${initialState.provenance}"`);
      }
      initialState.provenance = 'derived';
    } else if (initialState.provenance === 'derived') {
      // The other direction of the same lie: claiming the credit of the seam
      // without doing the work. See the consistency checker's provenance-gate
      // check for the reason this must be impossible to fake, not just
      // discouraged.
      throw new Error(`Object "${object.id}" claims provenance "derived" but authors no derived reference`);
    }
    return { ...object, initialState };
  });
  const timeline = (raw?.timeline || []).map(event => walk(event, pool));
  const { exampleData: _exampleData, derived: _derived, ...rest } = raw || {};
  return { ...rest, objects, timeline };
}
