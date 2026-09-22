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

// A row captioned "sums to 1" whose cells are each rounded independently for
// display can total 1.01 even though every underlying float is correct -
// case 01's softmax row [0.086, 0.139, 0.775] displays as .09 + .14 + .78.
// Rounding the concept away ("approximately 1") is not the fix: when the
// concept being taught IS normalisation, the sum being exactly one is the
// lesson. This distributes the rounding residual instead, so the DISPLAYED
// values sum to exactly 1 at the given precision - see docs/superpowers/
// specs/2026-09-18-visual-language-and-motion-design.md.
//
// Standard largest-remainder apportionment (the method elections use to
// allocate seats to an exact total): floor every cell to `decimals` places,
// which can only ever undershoot the target, then hand the leftover units
// one each to the cells with the largest fractional remainder - or, on the
// rarer other side, take a unit back from the smallest remainder - until the
// residual is gone. Deterministic: ties break by position. `null` (a masked
// cell) passes through untouched and takes no part in the total.
export function distributeRounding(values, decimals = 2) {
  const scale = 10 ** decimals;
  const idx = [];
  const floors = [];
  const remainders = [];
  values.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    const scaled = v * scale;
    idx.push(i);
    floors.push(Math.floor(scaled));
    remainders.push(scaled - Math.floor(scaled));
  });
  const target = Math.round(scale); // "1" at this precision - 100 for 2 decimals
  let deficit = target - floors.reduce((sum, f) => sum + f, 0);
  if (deficit > 0) {
    const order = floors.map((_, k) => k).sort((a, b) => remainders[b] - remainders[a]);
    for (let k = 0; k < order.length && deficit > 0; k += 1, deficit -= 1) floors[order[k]] += 1;
  } else if (deficit < 0) {
    const order = floors.map((_, k) => k).sort((a, b) => remainders[a] - remainders[b]);
    for (let k = 0; k < order.length && deficit < 0; k += 1, deficit += 1) floors[order[k]] -= 1;
  }
  const out = [...values];
  idx.forEach((i, k) => { out[i] = floors[k] / scale; });
  return out;
}

const isVector = value => Array.isArray(value) && value.length > 0 && value.every(entry => typeof entry === 'number' && Number.isFinite(entry));
// A vector that may carry masked entries: null means "excluded from this
// computation", a different fact from zero, and it survives the operation
// (softmax keeps the blank blank; weighted_sum lets it contribute nothing).
const isMaskableVector = value => Array.isArray(value) && value.length > 0 && value.every(entry => entry === null || (typeof entry === 'number' && Number.isFinite(entry)));

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
      // A masked (null) entry is excluded from the distribution and stays
      // null in the result: the remaining entries normalise among themselves,
      // exactly what a causal mask means. null in, null out - never a zero,
      // which would claim "measured, and found to be nothing".
      const row = values => {
        const kept = values.filter(x => x !== null);
        if (!kept.length) return values.map(() => null);
        const max = Math.max(...kept);
        const exps = kept.map(x => Math.exp(x - max));
        const total = exps.reduce((sum, x) => sum + x, 0);
        let cursor = 0;
        return values.map(x => (x === null ? null : round(exps[cursor++] / total)));
      };
      if (isMaskableVector(a)) return { defined: true, value: row(a) };
      if (Array.isArray(a) && a.every(isMaskableVector)) return { defined: true, value: a.map(row) };
      return { defined: false, reason: 'softmax needs a vector, or a list of equal-length vectors, of numbers (null marks a masked entry)' };
    },
  },
  // Blank out every strictly-future position of a square matrix - row i keeps
  // columns 0..i - when the second arg is true; hand the matrix back
  // untouched when it is false. The toggle is data, so turning masking off
  // recomputes the real full-attention numbers rather than repainting cells.
  causal_mask: {
    outputs: ['value'],
    derive([matrix, enabled]) {
      if (typeof enabled !== 'boolean') return { defined: false, reason: 'causal_mask needs a boolean saying whether the mask is on' };
      if (!Array.isArray(matrix) || !matrix.every(isVector) || matrix.some(row => row.length !== matrix.length)) {
        return { defined: false, reason: 'causal_mask needs a square matrix (a list of equal-length numeric rows)' };
      }
      if (!enabled) return { defined: true, value: matrix.map(row => [...row]) };
      return { defined: true, value: matrix.map((row, i) => row.map((value, j) => (j <= i ? value : null))) };
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
      // A null weight is a masked row: it takes no part in the mix, which is
      // mathematically exactly a weight of zero but semantically "excluded",
      // so the same masked softmax row drives this without a translation step.
      if (!isMaskableVector(weights) || !Array.isArray(rows) || !rows.every(isVector)) {
        return { defined: false, reason: 'weighted_sum needs a vector of weights (null marks a masked row) and a list of equal-length vectors' };
      }
      if (rows.length !== weights.length) {
        return { defined: false, reason: `weighted_sum needs one weight per row, got ${weights.length} weight(s) and ${rows.length} row(s)` };
      }
      const width = rows[0].length;
      if (!rows.every(row => row.length === width)) return { defined: false, reason: 'weighted_sum needs every row to share the same length' };
      const value = Array.from({ length: width }, (_, j) => round(rows.reduce((sum, row, i) => sum + (weights[i] ?? 0) * row[j], 0)));
      return { defined: true, value };
    },
  },
  // A vector times a scalar factor - dividing raw scores by root(dk) before
  // softmax is the instance that motivated it, but rescaling a vector by a
  // named constant is generic (a temperature, a learning rate). Also accepts
  // a list of equal-length vectors, the same single/matrix duality softmax
  // already supports - case 06 needs a whole raw-score matrix divided by
  // root(dk) at once, not one row at a time.
  scale: {
    outputs: ['value'],
    derive([vector, factor]) {
      if (typeof factor !== 'number' || !Number.isFinite(factor)) {
        return { defined: false, reason: 'scale needs a finite numeric factor' };
      }
      if (isVector(vector)) return { defined: true, value: vector.map(x => round(x * factor)) };
      if (Array.isArray(vector) && vector.every(isVector)) return { defined: true, value: vector.map(row => row.map(x => round(x * factor))) };
      return { defined: false, reason: 'scale needs a vector, or a list of equal-length vectors, of numbers' };
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
  // Two equal-length vectors added position by position - an embedding plus
  // a positional encoding is the instance case 10 needs; any elementwise
  // combination (a residual add, a bias) is the same operation.
  add: {
    outputs: ['value'],
    derive([a, b]) {
      if (!isVector(a) || !isVector(b)) return { defined: false, reason: 'add needs two vectors of numbers' };
      if (a.length !== b.length) return { defined: false, reason: `add needs equal-length vectors, got lengths ${a.length} and ${b.length}` };
      return { defined: true, value: a.map((x, i) => round(x + b[i])) };
    },
  },
  // The generic indexed selector: one declared collection, one key, one
  // record out. A list takes a whole integer position; a record map takes a
  // string key (a choice input's stable option id). This is how a learning
  // input selects "its" row/record for every bound view at once - the
  // selection happens here, in the seam, never re-derived per view.
  pick: {
    outputs: ['value'],
    derive([table, key]) {
      if (Array.isArray(table)) {
        if (!Number.isInteger(key)) return { defined: false, reason: `pick into a list needs a whole-number position, got ${JSON.stringify(key)}` };
        if (key < 0 || key >= table.length) return { defined: false, reason: `pick position ${key} is outside 0..${table.length - 1}` };
        return { defined: true, value: table[key] };
      }
      if (table && typeof table === 'object') {
        if (typeof key !== 'string' || !(key in table)) return { defined: false, reason: `pick key ${JSON.stringify(key)} names no entry in the record map` };
        return { defined: true, value: table[key] };
      }
      return { defined: false, reason: 'pick needs a list or a record map to select from' };
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
  // author a result the seam should have derived instead. A path that names
  // nothing is reported by name here, before the op can produce a vaguer
  // complaint about the undefined it would have received.
  const args = (spec.args || []).map(arg => {
    if (typeof arg === 'number') return arg;
    const value = lookupPath(pool, arg);
    if (value === undefined) throw new Error(`Scene "derived.${name}" (${spec.op}): arg "${arg}" names no entry in the scene's "derived" block (or "exampleData")`);
    return value;
  });
  const result = entry.derive(args);
  if (!result.defined) throw new Error(`Scene "derived.${name}" (${spec.op}): ${result.reason}`);
  return result;
}

// True the moment a node contains an unresolved marker anywhere inside it -
// checked against the ORIGINAL initialState, before walk() has a chance to
// resolve anything, so a lie ("provenance: derived" with nothing to derive
// it from) can be told apart from the real thing. cellHighlight is excluded:
// a selection bound to a learning input says which part is looked at, not
// where the object's own numbers came from, so it must not be able to flip
// an input matrix's provenance to "derived".
const usesDeriveMarker = ({ cellHighlight: _selection, ...node } = {}) => /"\$derive"|\{\{[\w.]+\}\}/.test(JSON.stringify(node ?? null));

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
  if (typeof node === 'string' && /\{\{[\w.]+\}\}/.test(node)) {
    return node.replace(/\{\{([\w.]+)\}\}/g, (_, name) => {
      const value = lookupPath(pool, name);
      if (value === undefined) throw new Error(`"{{${name}}}" names no entry in the scene's "derived" block (or "exampleData")`);
      if (Array.isArray(value)) throw new Error(`"{{${name}}}" resolves to a list, not a number - reference it as a value instead of inside text`);
      return String(value);
    });
  }
  return node;
}

// A DECLARATION IS NOT AUTOMATICALLY HONEST. Requiring valueScale (see
// animation-scene.js) stops a scene shipping with no scaling gate at all,
// but an author can still type `valueScale: 'local'` on an object that is
// plainly mid-computation - the same shape as the `illustrative` dodge this
// module's own provenance rule already closes (a false result cannot buy an
// exemption by claiming to be a sketch). So a chain that exists in the
// scene's OWN `derived` graph is one of the places `local` is refused at the
// gate, whether or not an author also wrote a valueScaleGroup: the object's
// values are derived from, or feed into, another heat object in the same
// scene's computation, and that is a comparison whether or not anyone
// declared it one.
//
// Returns Map<objectId, groupKey> - objects absent from the map author no
// $derive reference on their own `values` at all, so they have nothing this
// particular rule can catch (a plain authored literal is not, by this
// mechanism, provably part of a chain - see valueScaleGroup and the
// pattern-level gate in scene-consistency.js for the other two ways `local`
// gets refused). Two objects share a groupKey exactly when their backing
// derived/exampleData names are connected - directly, or through any chain
// of derived-op arguments - in the scene's OWN `derived` block.
export function computeValueChainGroups(raw) {
  const derivedSpecs = raw?.derived || {};
  const parent = new Map();
  const find = key => { let root = key; while (parent.get(root) !== root) root = parent.get(root); return root; };
  const ensure = key => { if (!parent.has(key)) parent.set(key, key); return key; };
  const union = (a, b) => { const rootA = find(ensure(a)), rootB = find(ensure(b)); if (rootA !== rootB) parent.set(rootA, rootB); };
  const rootOf = arg => (typeof arg === 'string' ? arg.split('.')[0] : null);
  for (const [name, spec] of Object.entries(derivedSpecs)) {
    ensure(name);
    for (const arg of spec?.args || []) {
      const root = rootOf(arg);
      if (root) union(name, root);
    }
  }
  const objectName = new Map();
  for (const object of raw?.objects || []) {
    const values = object?.initialState?.values;
    const name = values && typeof values === 'object' && typeof values.$derive === 'string' ? rootOf(values.$derive) : null;
    if (name && object.id) { objectName.set(object.id, name); ensure(name); }
  }
  const groups = new Map();
  for (const [id, name] of objectName) groups.set(id, find(name));
  return groups;
}

// The authored-data boundary: exampleData -> derived -> everything else.
// exampleData is the one place a lesson's ground-truth numbers are typed in;
// `derived` names, once each, every calculation the scene performs on it;
// every equation, matrix cell and caption that states one of those results
// must reference the name rather than repeat the number. Runs once, at the
// authoring gate, before validateScene's zod parse - never inside
// getSceneState, which stays pure, total and silent and does no arithmetic.
// The pool alone - exampleData plus every derivation's value, in declared
// order, so entry two may reference entry one by name (a real pipeline:
// scores -> softmax -> weighted output). Exported for evaluateScene, which
// hands the derived values to checks and the tutor context without re-doing
// the arithmetic a second way.
export function buildPool(raw) {
  const pool = { ...(raw?.exampleData || {}) };
  for (const [name, spec] of Object.entries(raw?.derived || {})) {
    pool[name] = resolveOneDerivation(name, spec, pool).value;
  }
  return pool;
}

export function resolveDerived(raw) {
  const pool = buildPool(raw);
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
