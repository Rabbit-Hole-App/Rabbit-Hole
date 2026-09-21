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
import { GEOMETRY } from './scene-vocab.js';

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

// An arrow's landing row/column must carry the same token identity as the
// object it left - the same class of defect as a displayed number its
// inputs contradict (see docs/superpowers/specs/2026-09-18-visual-language-
// and-motion-design.md): an arrow asserting a provenance its own endpoints
// contradict. Generic across any teaching scene that draws an identified
// vector (a strip, or a labelled row of a grid) feeding an arrow into a
// labelled grid - not specific to Q/K/V or to any one case's token names.
//
// An arrow carries no object reference (`from`/`to` are bare points - see
// animation-scene.js's objectSchema), so "which object is this arrow
// leaving/entering" is resolved geometrically: the object whose own frame
// contains the point. The source's implied row/column is then resolved by
// matching a whole word of its own label/text against the destination
// grid's rowLabels/columnLabels, case-insensitively - "query (Q) - south"
// names "south", the same word a grid's rowLabels can carry. An object with
// no such word in its label makes no identity claim this check can verify,
// so it is silently skipped rather than guessed at - no false positive.
const WORD = /[a-z][a-z0-9]*/g;
const wordsOf = text => (text || '').toLowerCase().match(WORD) || [];

function bboxOf(object) {
  const state = object.initialState;
  const cell = state.cell || GEOMETRY.cellPitch;
  const w = state.w ?? (object.type === 'grid' ? (state.cols || 1) * cell : object.type === 'strip' ? (state.values?.length || 1) * cell : 0);
  const h = state.h ?? (object.type === 'grid' ? (state.rows || 1) * cell : object.type === 'strip' ? cell : 0);
  return { x: state.x ?? 0, y: state.y ?? 0, w, h };
}
const containsPoint = (box, point, pad = 0.5) =>
  point.x >= box.x - pad && point.x <= box.x + box.w + pad && point.y >= box.y - pad && point.y <= box.y + box.h + pad;

function checkArrowIdentityIntoGrid(scene) {
  const issues = [];
  const boxed = scene.objects.filter(object => !['arrow', 'line'].includes(object.type) && object.initialState.x != null);
  for (const arrow of scene.objects) {
    if (arrow.type !== 'arrow' || !arrow.initialState.from || !arrow.initialState.to) continue;
    const { from, to } = arrow.initialState;
    const source = boxed.find(object => containsPoint(bboxOf(object), from));
    const grid = boxed.find(object => object.type === 'grid' && (object.initialState.rowLabels?.length || object.initialState.columnLabels?.length) && containsPoint(bboxOf(object), to));
    if (!source || !grid || source === grid) continue;
    // Scoped to objects that carry IDENTITY (scene-vocab.js's own peer axis -
    // "which Q/K/V is this"), not any word a free-text caption happens to
    // share with a grid's row/column label. A caption naming which query a
    // whole vector belongs to (case 04's "raw score (south's row)") is
    // metadata about the OBJECT, not a claim about which slot of a
    // differently-indexed destination it lands in - IDENTITY is the axis
    // this rule is actually about (see the spec's "same token identity"
    // language), and scoping to it is what keeps the check from guessing at
    // captions that were never making a positional claim at all.
    if (!source.initialState.identity) continue;
    const sourceWords = new Set([...wordsOf(source.initialState.label), ...wordsOf(source.initialState.text)]);
    if (!sourceWords.size) continue;
    const { rowLabels, columnLabels } = grid.initialState;
    const rows = grid.initialState.rows || 1, cols = grid.initialState.cols || 1;
    const cell = grid.initialState.cell || GEOMETRY.cellPitch;
    const box = bboxOf(grid);
    const landedRow = Math.min(rows - 1, Math.max(0, Math.floor((to.y - box.y) / cell)));
    const landedCol = Math.min(cols - 1, Math.max(0, Math.floor((to.x - box.x) / cell)));
    // Which axis is this arrow actually CLAIMING - not "does the source's
    // word happen to also spell a column name", which false-fires the
    // moment a grid's row and column labels are the same token set (a
    // self-attention score matrix, rows and columns both the sequence). An
    // arrow's own entry side says which axis it means: entering near the
    // LEFT edge is a row claim (a row header's own side), entering near the
    // TOP edge is a column claim (a column header's own side) - the same
    // convention this renderer already draws rowLabels/columnLabels on (see
    // scene-layout.js's gridAxisLabelBoxes). Whichever edge the landing
    // point sits closer to wins; the other axis is not this arrow's claim
    // to make, so it is left unchecked rather than guessed at.
    const distLeft = Math.abs(to.x - box.x), distTop = Math.abs(to.y - box.y);
    if (rowLabels && (!columnLabels || distLeft <= distTop)) {
      const impliedRow = rowLabels.findIndex(label => sourceWords.has(label.toLowerCase()));
      if (impliedRow !== -1 && impliedRow !== landedRow) {
        issues.push({
          check: 'arrow-identity', objectId: arrow.id,
          message: `arrow "${arrow.id}" leaves "${source.id}" (${rowLabels[impliedRow]}) but lands in grid "${grid.id}"'s "${rowLabels[landedRow]}" row, not "${rowLabels[impliedRow]}" - the arrow, its source and the row it lands in must carry the same identity`,
        });
      }
    } else if (columnLabels) {
      const impliedCol = columnLabels.findIndex(label => sourceWords.has(label.toLowerCase()));
      if (impliedCol !== -1 && impliedCol !== landedCol) {
        issues.push({
          check: 'arrow-identity', objectId: arrow.id,
          message: `arrow "${arrow.id}" leaves "${source.id}" (${columnLabels[impliedCol]}) but lands in grid "${grid.id}"'s "${columnLabels[landedCol]}" column, not "${columnLabels[impliedCol]}" - the arrow, its source and the column it lands in must carry the same identity`,
        });
      }
    }
  }
  return issues;
}

// The third of the three ways "local" gets refused (see animation-scene.js's
// valueScaleGroup and derive-chain gates for the other two): a case whose
// own pattern coverage declares matrix_operation or live_computation has, by
// definition, a transformation the learner must see rather than infer - the
// whole subject of the pattern is a computation, so its stages cannot let
// each other self-normalise. No scene-local signal says this - `patterns`
// is authored in a benchmark case's target.json, not the scene - so a
// caller that knows the case's patterns passes them in; a caller that does
// not (an ordinary scene with no case context) passes none, and this check
// is simply inert rather than refusing something it cannot see.
const PATTERNS_REQUIRING_SHARED_SCALE = new Set(['matrix_operation', 'live_computation']);
function checkPatternRequiresSharedScale(scene, patterns) {
  if (!patterns?.some(pattern => PATTERNS_REQUIRING_SHARED_SCALE.has(pattern))) return [];
  const matched = patterns.filter(pattern => PATTERNS_REQUIRING_SHARED_SCALE.has(pattern));
  const issues = [];
  for (const object of scene.objects) {
    if (object.initialState.heat && object.initialState.valueScale === 'local') {
      issues.push({
        check: 'pattern-requires-shared-scale', objectId: object.id,
        message: `"${object.id}" declares valueScale "local", but this case declares pattern(s) ${matched.join(', ')} - a transformation the learner must see cannot let its own stages self-normalise, so valueScale must be shared or fixed`,
      });
    }
  }
  return issues;
}

// The single entry point. Takes a scene already through validateScene.
// `patterns` (optional) is the benchmark case's own target.json `patterns`
// array - see checkPatternRequiresSharedScale above for why it is not part
// of the scene itself.
export function checkSceneConsistency(scene, { patterns } = {}) {
  const issues = [
    ...checkProvenanceOnComputedClaims(scene),
    ...checkDotProductArithmetic(scene),
    ...checkMatrixDimensionsMatchVectors(scene),
    ...checkProbabilityClaims(scene),
    ...checkDimensionLabelText(scene),
    ...checkArrowIdentityIntoGrid(scene),
    ...checkPatternRequiresSharedScale(scene, patterns),
  ];
  return { passed: issues.length === 0, issues };
}
