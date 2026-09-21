// Teaching-scene consistency: run before a scene renders, on the OUTPUT of
// validateScene (so provenance defaults and heat normalisation have already
// happened). Generic across subjects - attention, gradients, IoU, cost - by
// construction: every check reasons about shapes (equation text, grid rows
// and columns, identity letters, labels) that any teaching scene can carry,
// never about "query" or "key" as literal strings.
//
// Deliberately narrow. It proves a scene is not lying about arithmetic it
// visibly performs; it does not grade layout, prose, or whether the right
// concept was chosen. See docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md for the invariant this
// exists to enforce and viz-benchmarks/illustrated-transformer/
// independent-review.md for the case that motivated it.
import { round, DERIVATIONS } from './scene-derive.js';

const dot = DERIVATIONS.dot.derive;

// A displayed relationship: an operator, then "= number". "d_k = 3" states a
// fact and has no operator, so it is not one; "q_{river}\cdot k_{river}
// = .54" is. Generic across notations - \cdot, \times, +, -, softmax(...) -
// not tied to any one domain's operator.
const HAS_OPERATOR = /\\cdot|\\times|\\div|softmax|\\sum|[+\-*/]/;
const HAS_NUMERIC_RESULT = /=\s*-?\d*\.?\d+/;
const statesAComputedRelationship = text => HAS_OPERATOR.test(text || '') && HAS_NUMERIC_RESULT.test(text || '');

// "x_{sub} \cdot y_{sub} = number" - letter-and-subscript notation, generic to
// any two-vector dot product a lesson might draw, not just Q and K.
const DOT_EQUATION = /([a-zA-Z])_\{[^}]+\}\s*\\cdot\s*([a-zA-Z])_\{[^}]+\}\s*=\s*(-?\d*\.?\d+)/g;

// How many source vectors this scene actually draws: one per `strip`, and
// one per row of a grid explicitly declared matrixKind: 'input' - a full
// Q/K/V matrix drawn as such a grid is a legitimate source of N vectors, the
// same as N separate strips would be. Gated on the explicit declaration, not
// on whether the grid happens to carry rowLabels - a labelling choice must
// not decide whether a downstream arithmetic gate applies (see
// checkProvenanceOnComputedClaims's comment, and docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md's audit note: a check
// switched off by changing how something looks is not a check).
function vectorSupply(scene) {
  let count = 0;
  for (const object of scene.objects) {
    const state = object.initialState;
    if (object.type === 'strip' && Array.isArray(state.values)) count += 1;
    if (object.type === 'grid' && state.matrixKind === 'input') count += state.rows || 1;
  }
  return count;
}

// Rule 1 (the hard rule): a displayed numeric relationship must be provenance
// "derived", never "literal" and never "illustrative" - marking a false
// result illustrative does not exempt it, because "illustrative" only covers
// a value with NO claim of being computed, and stating "a . b = x" for
// visible a and b is exactly that claim.
//
// A grid's gate is matrixKind, an explicit authored declaration - never
// rowLabels/columnLabels/heat, all three of which are presentation and can
// be added, omitted or restyled without changing what the matrix claims to
// be. An author who deletes an axis label, or draws the same matrix with no
// heat at all, cannot switch this check off - matrixKind is the one thing
// that does, and only by declaring 'input' (a fact about the data, not a
// claimed relationship).
function checkProvenanceOnComputedClaims(scene) {
  const issues = [];
  for (const object of scene.objects) {
    const state = object.initialState;
    if (object.type === 'equation' && statesAComputedRelationship(state.text)) {
      if (state.provenance !== 'derived') {
        issues.push({
          check: 'provenance-required', objectId: object.id,
          message: `equation "${object.id}" (${JSON.stringify(state.text)}) states a computed relationship, so its provenance must be "derived" - it is "${state.provenance}"`,
        });
      }
    }
    if (object.type === 'grid' && (state.matrixKind === 'relational' || state.matrixKind === 'derived')) {
      if (state.provenance !== 'derived') {
        issues.push({
          check: 'provenance-required', objectId: object.id,
          message: `grid "${object.id}" declares matrixKind "${state.matrixKind}", so its provenance must be "derived" - it is "${state.provenance}"`,
        });
      }
    }
  }
  return issues;
}

// Independent recomputation, using the same dot() the derive seam uses (see
// the module doc - one mechanism, not a second one built here to check the
// first). Two things fall out of the same pass: a wrong number, quoted
// exactly, and an impossible one - two different claimed results from what
// the scene draws as one fixed pair of vectors.
function checkDotProductArithmetic(scene) {
  const issues = [];
  const vectorsByLetter = new Map();
  for (const object of scene.objects) {
    const identity = object.initialState.identity;
    const values = object.initialState.values;
    if (object.type !== 'strip' || !identity || !Array.isArray(values)) continue;
    const letter = identity[0].toLowerCase();
    if (!vectorsByLetter.has(letter)) vectorsByLetter.set(letter, object);
  }
  const claimsByPair = new Map();
  for (const object of scene.objects) {
    if (object.type !== 'equation') continue;
    const text = object.initialState.text || '';
    for (const match of text.matchAll(DOT_EQUATION)) {
      const [, leftLetter, rightLetter, claimedText] = match;
      const left = vectorsByLetter.get(leftLetter.toLowerCase());
      const right = vectorsByLetter.get(rightLetter.toLowerCase());
      if (!left || !right) continue; // cannot resolve to a drawn vector - no false positive
      const claimed = Number(claimedText);
      const result = dot([left.initialState.values, right.initialState.values]);
      if (!result.defined) {
        issues.push({ check: 'dot-arithmetic', objectId: object.id, message: `"${object.id}": ${result.reason}` });
        continue;
      }
      if (Math.abs(result.value - claimed) > 0.015) {
        issues.push({
          check: 'dot-arithmetic', objectId: object.id,
          message: `"${object.id}" claims ${claimedText}, but ${left.id}=[${left.initialState.values}] . ${right.id}=[${right.initialState.values}] = ${result.value}`,
        });
      }
      const pairKey = `${left.id}|${right.id}`;
      if (!claimsByPair.has(pairKey)) claimsByPair.set(pairKey, new Map());
      const claims = claimsByPair.get(pairKey);
      claims.set(claimed, [...(claims.get(claimed) || []), object.id]);
    }
  }
  for (const [pairKey, claims] of claimsByPair) {
    if (claims.size <= 1) continue;
    const [leftId, rightId] = pairKey.split('|');
    const detail = [...claims.entries()].map(([value, ids]) => `${value} (${ids.join(', ')})`).join(' vs ');
    issues.push({
      check: 'dot-contradiction', objectId: pairKey,
      message: `${claims.size} equations claim different results from the same fixed vectors "${leftId}" and "${rightId}": ${detail} - one pair of vectors has exactly one dot product`,
    });
  }
  return issues;
}

// A RELATIONAL grid (matrixKind explicitly 'relational' - see
// checkProvenanceOnComputedClaims) claiming N distinct rows or columns needs
// at least N drawn source vectors to have produced them. Generic dimension
// agreement, not "every key needs its own box": the same shape check applies
// to a confusion matrix, a cost table or a per-expert score row. 'derived'
// is exempt from THIS check on purpose - a general computed tensor (a
// projection, an elementwise transform) is not necessarily a pairwise
// comparison of two vector sets, so "enough vectors to have produced N rows"
// is not a claim it makes. 'input' is exempt as it is from the provenance
// rule, for the same reason: a fact about the data, not a claimed
// relationship.
function checkMatrixDimensionsMatchVectors(scene) {
  const issues = [];
  const vectorObjectCount = vectorSupply(scene);
  for (const object of scene.objects) {
    if (object.type !== 'grid' || object.initialState.matrixKind !== 'relational') continue;
    const { rows = 1, cols = 1, rowLabels, columnLabels } = object.initialState;
    const need = Math.max(rows, cols);
    if (need > 1 && vectorObjectCount > 0 && vectorObjectCount < need) {
      const labels = [...(rowLabels || []), ...(columnLabels || [])].join(', ') || 'none';
      issues.push({
        check: 'matrix-vector-count', objectId: object.id,
        message: `grid "${object.id}" is ${rows}x${cols} (labels: ${labels}) but the scene draws only ${vectorObjectCount} vector object(s) - at least ${need} would be needed to produce ${need} distinct rows or columns`,
      });
    }
  }
  return issues;
}

// Probabilities in range, and softmax rows summing to ~1 - only where a
// scene itself EXPLICITLY DECLARES the values are one (distribution: true),
// never inferred from a caption's wording. A caption is prose; rewording it
// ("attention weights" instead of "softmax weights") must not turn this
// check off, and omitting a caption entirely must not either.
function checkProbabilityClaims(scene) {
  const issues = [];
  for (const object of scene.objects) {
    if (!['grid', 'strip', 'bars'].includes(object.type) || !object.initialState.distribution) continue;
    const values = object.initialState.values || [];
    for (const value of values) {
      if (value != null && (value < -0.001 || value > 1.001)) {
        issues.push({ check: 'probability-range', objectId: object.id, message: `"${object.id}" declares distribution: true but holds ${value}, outside [0, 1]` });
      }
    }
    if (object.type === 'grid') {
      const rows = object.initialState.rows || 1;
      const cols = object.initialState.cols || 1;
      for (let r = 0; r < rows; r += 1) {
        const row = values.slice(r * cols, (r + 1) * cols).filter(value => value != null);
        if (!row.length) continue;
        const total = round(row.reduce((sum, value) => sum + value, 0));
        if (Math.abs(total - 1) > 0.02) {
          issues.push({ check: 'softmax-row-sum', objectId: object.id, message: `"${object.id}" row ${r} declares distribution: true but sums to ${total}, not 1` });
        }
      }
    }
  }
  return issues;
}

// "3x3", "8x8" and similar dimension labels agree with the one grid actually
// on screen. Skipped, deliberately, the moment more than one grid exists -
// which grid a label refers to is then ambiguous and guessing would invent a
// false positive worse than the miss.
function checkDimensionLabelText(scene) {
  const grids = scene.objects.filter(object => object.type === 'grid');
  if (grids.length !== 1) return [];
  const [grid] = grids;
  const actualRows = grid.initialState.rows || 1;
  const actualCols = grid.initialState.cols || 1;
  const issues = [];
  for (const object of scene.objects) {
    if (!['text', 'equation'].includes(object.type)) continue;
    const match = /(\d+)\s*[x×]\s*(\d+)/.exec(object.initialState.text || object.initialState.label || '');
    if (!match) continue;
    const [, claimedRows, claimedCols] = match;
    if (Number(claimedRows) !== actualRows || Number(claimedCols) !== actualCols) {
      issues.push({
        check: 'dimension-label', objectId: object.id,
        message: `"${object.id}" states ${claimedRows}x${claimedCols} but the grid "${grid.id}" is ${actualRows}x${actualCols}`,
      });
    }
  }
  return issues;
}

// The single entry point. Takes a scene already through validateScene.
export function checkSceneConsistency(scene) {
  const issues = [
    ...checkProvenanceOnComputedClaims(scene),
    ...checkDotProductArithmetic(scene),
    ...checkMatrixDimensionsMatchVectors(scene),
    ...checkProbabilityClaims(scene),
    ...checkDimensionLabelText(scene),
  ];
  return { passed: issues.length === 0, issues };
}
