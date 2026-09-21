import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './animation-scene.js';
import { checkSceneConsistency } from './scene-consistency.js';

// Case 03 is fixed now (see the live-file test near the bottom of this file)
// - so the ORIGINAL broken shape is preserved here, verbatim, as a snapshot
// rather than read from disk. This is what the checker caught before the
// fix, and it must keep catching this SHAPE of bug even after the one
// instance of it is gone. See docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md.
const BROKEN_CASE_03_SNAPSHOT = () => ({
  id: 'case03-attention-score-matrix', duration: 1,
  objects: [
    { id: 'q', type: 'strip', initialState: { label: 'query (Q)', identity: 'query', heat: { mode: 'signed' }, values: [0.9, -0.4, 1.3] } },
    { id: 'k', type: 'strip', initialState: { label: 'key (K)', identity: 'key', heat: { mode: 'signed' }, values: [0.6, 1.1, -0.7] } },
    { id: 'eq-1', type: 'equation', initialState: { text: 'q_{river}\\cdot k_{river} = .54', x: 320, y: 148, w: 220, h: 36 } },
    { id: 'eq-2', type: 'equation', initialState: { text: 'q_{river}\\cdot k_{flows} = .99', x: 320, y: 202, w: 220, h: 36 } },
    { id: 'eq-3', type: 'equation', initialState: { text: 'q_{river}\\cdot k_{south} = -.63', x: 320, y: 256, w: 220, h: 36 } },
    { id: 'scores', type: 'grid', initialState: {
      label: "every query's row: Q . Kᵀ", rows: 3, cols: 3, heat: { mode: 'signed' }, matrixKind: 'relational',
      rowLabels: ['river', 'flows', 'south'], columnLabels: ['river', 'flows', 'south'],
      values: [0.54, 0.99, -0.63, -0.24, -0.44, 0.28, 0.78, 1.43, -0.91],
    } },
  ],
  timeline: [],
});

test('evidence 1+2: the checker runs against case 03\'s original scene shape and fails, quoting the exact numbers', () => {
  const scene = validateScene(BROKEN_CASE_03_SNAPSHOT());
  const { passed, issues } = checkSceneConsistency(scene);
  assert.equal(passed, false, 'a checker that passes the known-false scene is worthless');
  const arithmetic = issues.find(issue => issue.check === 'dot-arithmetic' && issue.objectId === 'eq-1');
  assert.ok(arithmetic, 'expected an arithmetic finding for eq-1');
  assert.match(arithmetic.message, /claims \.54, but q=\[0\.9,-0\.4,1\.3\] \. k=\[0\.6,1\.1,-0\.7\] = -0\.81/);
  const contradiction = issues.find(issue => issue.check === 'dot-contradiction');
  assert.ok(contradiction, 'expected the impossible-two-results finding');
  assert.match(contradiction.message, /0\.54 \(eq-1\) vs 0\.99 \(eq-2\) vs -0\.63 \(eq-3\)/);
  const dimensionMismatch = issues.find(issue => issue.check === 'matrix-vector-count');
  assert.ok(dimensionMismatch, 'expected the 3x3-matrix-from-2-vectors finding');
});

test('evidence 3: fixing the source data through the derive seam makes the same class of scene pass', () => {
  // The same q/k numbers as case 03, wired through exampleData + derived
  // instead of hand-authored twice. Not the committed file - re-authoring
  // case 03 itself is out of scope for this pass.
  const fixed = validateScene({
    id: 'case03-fixed', duration: 1,
    exampleData: { q: [0.9, -0.4, 1.3], k: [0.6, 1.1, -0.7] },
    derived: { qk: { op: 'dot', args: ['q', 'k'] } },
    objects: [
      { id: 'q', type: 'strip', initialState: { values: [0.9, -0.4, 1.3], identity: 'query' } },
      { id: 'k', type: 'strip', initialState: { values: [0.6, 1.1, -0.7], identity: 'key' } },
      { id: 'eq-1', type: 'equation', initialState: { text: 'q_{river}\\cdot k_{river} = {{qk}}', w: 220, h: 36 } },
    ],
    timeline: [],
  });
  const result = checkSceneConsistency(fixed);
  assert.deepEqual(result.issues, []);
  assert.equal(result.passed, true);
  assert.equal(fixed.objects.find(o => o.id === 'eq-1').initialState.text, 'q_{river}\\cdot k_{river} = -0.81');
});

test('evidence 4: marking the false result illustrative does not let it slip through the gate', () => {
  const raw = BROKEN_CASE_03_SNAPSHOT();
  const eq1 = raw.objects.find(object => object.id === 'eq-1');
  eq1.initialState.provenance = 'illustrative'; // the exact escape hatch this rule closes
  const scene = validateScene(raw);
  const { passed, issues } = checkSceneConsistency(scene);
  assert.equal(passed, false, 'illustrative must not exempt a claimed computed relationship');
  const gate = issues.find(issue => issue.check === 'provenance-required' && issue.objectId === 'eq-1');
  assert.ok(gate, 'expected the provenance-gate finding to still fire');
  assert.match(gate.message, /must be "derived" - it is "illustrative"/);
});

// Step 6 proof: the real, committed scene now passes, having been re-authored
// through the derive seam (exampleData -> derived -> the equations, the
// matrix cells) rather than patched with hand-corrected numbers.
test('evidence (step 6): the committed case 03 scene-spec now passes, fixed through the derive seam', () => {
  const path = new URL(
    '../../../viz-benchmarks/illustrated-transformer/cases/03-attention-score-matrix/generated/latest/scene-spec.json',
    import.meta.url,
  );
  const scene = validateScene(JSON.parse(readFileSync(path, 'utf8')));
  assert.deepEqual(checkSceneConsistency(scene), { passed: true, issues: [] });
  const eq1 = scene.objects.find(o => o.id === 'eq-1');
  assert.equal(eq1.initialState.provenance, 'derived');
  assert.match(eq1.initialState.text, /-0\.81/, 'the equation now states the real dot product, not the old .54');
});

test('evidence (step 6): the committed case 01 scene-spec now passes, its scores and softmax matrices genuinely derived from three query and three key vectors', () => {
  const path = new URL(
    '../../../viz-benchmarks/illustrated-transformer/cases/01-self-attention-computation-flow/generated/latest/scene-spec.json',
    import.meta.url,
  );
  const scene = validateScene(JSON.parse(readFileSync(path, 'utf8')));
  assert.deepEqual(checkSceneConsistency(scene), { passed: true, issues: [] });
  const scores = scene.objects.find(o => o.id === 'scores');
  const softmax = scene.objects.find(o => o.id === 'softmax');
  assert.equal(scores.initialState.provenance, 'derived');
  assert.equal(softmax.initialState.provenance, 'derived');
});

test('evidence 5: the checker recomputes with the same dot() the derive seam uses, not a second copy', () => {
  const source = readFileSync(new URL('./scene-consistency.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/scene-derive\.js'/, 'the checker must import its arithmetic from the one derive module');
  assert.doesNotMatch(source, /function\s+dot\s*\(/, 'no second dot-product implementation may exist in the checker');
});

test('a matrixKind: input grid is not forced through the derive seam, however it is labelled', () => {
  // Rows named (river/flows/south), columns not (they are embedding
  // dimensions, not a second entity) - a fact about the data, never a
  // relationship an equation claims with "=". The declaration, not the
  // labels, is what exempts it.
  const scene = validateScene({
    id: 'input-table', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [0.9, -0.4, 1.3] } },
      { id: 'K', type: 'grid', initialState: { matrixKind: 'input', rows: 3, cols: 3, heat: true, rowLabels: ['river', 'flows', 'south'], values: [0.6, 1.1, -0.7, -0.3, 0.8, 0.2, 0.5, -0.4, 0.6] } },
    ],
    timeline: [],
  });
  assert.deepEqual(checkSceneConsistency(scene), { passed: true, issues: [] });
});

test('a matrixKind: relational grid requires derived provenance, even alongside a matrixKind: input table', () => {
  const scene = validateScene({
    id: 'both', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 2] } },
      { id: 'scores', type: 'grid', initialState: { matrixKind: 'relational', rows: 2, cols: 2, heat: true, rowLabels: ['a', 'b'], columnLabels: ['a', 'b'], values: [1, 2, 3, 4] } },
    ],
    timeline: [],
  });
  const { passed, issues } = checkSceneConsistency(scene);
  assert.equal(passed, false);
  assert.ok(issues.some(issue => issue.check === 'provenance-required' && issue.objectId === 'scores'));
});

test('a grid with no matrixKind at all is treated as a plain fact, not a claim - the declaration is what makes a check apply, never its absence', () => {
  const scene = validateScene({
    id: 'undeclared', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 2] } },
      { id: 'grid', type: 'grid', initialState: { rows: 2, cols: 2, heat: true, rowLabels: ['a', 'b'], columnLabels: ['a', 'b'], values: [1, 2, 3, 4] } },
    ],
    timeline: [],
  });
  assert.deepEqual(checkSceneConsistency(scene), { passed: true, issues: [] });
});

test('a scene with no computed claims passes cleanly', () => {
  const scene = validateScene({
    id: 'plain', duration: 1,
    objects: [
      { id: 'a', type: 'box', initialState: { label: 'Input X' } },
      { id: 'formula', type: 'equation', initialState: { text: 'LayerNorm(X + Z)', w: 200, h: 30 } },
    ],
    timeline: [],
  });
  assert.deepEqual(checkSceneConsistency(scene), { passed: true, issues: [] });
});

test('a distribution: true row that does not sum to one is caught, whatever its caption says', () => {
  const scene = validateScene({
    id: 'bad-softmax', duration: 1,
    objects: [{ id: 'w', type: 'grid', initialState: { label: 'attention weights', distribution: true, rows: 1, cols: 3, values: [0.91, 0.03, -0.01] } }],
    timeline: [],
  });
  const { passed, issues } = checkSceneConsistency(scene);
  assert.equal(passed, false);
  assert.ok(issues.some(issue => issue.check === 'softmax-row-sum'));
  assert.ok(issues.some(issue => issue.check === 'probability-range'), 'a negative entry in a claimed probability row is also out of range');
});

test('a probability row with no distribution declaration is not checked, even when its caption says "softmax"', () => {
  // The mirror of the test above: wording alone must not switch the check
  // ON either. A caption is prose; distribution is the claim.
  const scene = validateScene({
    id: 'undeclared-softmax', duration: 1,
    objects: [{ id: 'w', type: 'grid', initialState: { label: 'softmax weights', rows: 1, cols: 3, values: [0.91, 0.03, -0.01] } }],
    timeline: [],
  });
  assert.deepEqual(checkSceneConsistency(scene), { passed: true, issues: [] });
});

// ---------------------------------------------------------------------------
// The semantic-gate audit: labels, styling, coordinates, visibility, layout.
// Two gates were found keyed off presentation (matrixKind/distribution
// above, both now fixed). For the other three, the audit found nothing to
// fix - proved here rather than merely asserted, per the "a clean category
// reported is a real result" instruction.
// ---------------------------------------------------------------------------

test('audit/labels: deleting BOTH axis labels from a relational matrix does not switch the math gate off', () => {
  const scene = validateScene({
    id: 'no-labels-at-all', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 2] } },
      // Same matrix as the "both axes" test above, minus every rowLabels/
      // columnLabels entry - the exact bypass a stubborn author would try.
      { id: 'scores', type: 'grid', initialState: { matrixKind: 'relational', rows: 2, cols: 2, values: [1, 2, 3, 4] } },
    ],
    timeline: [],
  });
  const { passed, issues } = checkSceneConsistency(scene);
  assert.equal(passed, false, 'removing every label must not exempt a declared relational matrix');
  assert.ok(issues.some(issue => issue.check === 'provenance-required' && issue.objectId === 'scores'));
  assert.ok(issues.some(issue => issue.check === 'matrix-vector-count' && issue.objectId === 'scores'), 'the dimension check also has to survive losing its labels');
});

test('audit/styling: a relational matrix with no heat at all still requires derived provenance', () => {
  const scene = validateScene({
    id: 'no-heat', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 2] } },
      { id: 'scores', type: 'grid', initialState: { matrixKind: 'relational', rows: 2, cols: 2, rowLabels: ['a', 'b'], columnLabels: ['a', 'b'], values: [1, 2, 3, 4] } },
    ],
    timeline: [],
  });
  const { passed, issues } = checkSceneConsistency(scene);
  assert.equal(passed, false, 'a plain, unstyled grid making the same claim must be checked exactly as a heat-mapped one is');
  assert.ok(issues.some(issue => issue.check === 'provenance-required' && issue.objectId === 'scores'));
});

test('audit/coordinates: moving the false equation off-canvas does not exempt it', () => {
  const onCanvas = validateScene({
    id: 'on-canvas', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 0] } },
      { id: 'k', type: 'strip', initialState: { identity: 'key', values: [0, 1] } },
      { id: 'eq', type: 'equation', initialState: { text: 'q_{a}\\cdot k_{a} = 99', x: 100, y: 100, w: 100, h: 30 } },
    ],
    timeline: [],
  });
  const offCanvas = validateScene({
    id: 'off-canvas', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 0] } },
      { id: 'k', type: 'strip', initialState: { identity: 'key', values: [0, 1] } },
      { id: 'eq', type: 'equation', initialState: { text: 'q_{a}\\cdot k_{a} = 99', x: -999999, y: 999999, w: 100, h: 30 } },
    ],
    timeline: [],
  });
  const onIssues = checkSceneConsistency(onCanvas).issues;
  const offIssues = checkSceneConsistency(offCanvas).issues;
  assert.ok(onIssues.some(issue => issue.check === 'provenance-required'));
  assert.ok(onIssues.some(issue => issue.check === 'dot-arithmetic'));
  // Same findings, position is not part of the comparison (object ids match).
  assert.deepEqual(offIssues.map(i => i.check).sort(), onIssues.map(i => i.check).sort(), 'position must not change which checks fire');
});

test('audit/visibility: an invisible (opacity: 0) false equation is still caught', () => {
  const scene = validateScene({
    id: 'hidden', duration: 1,
    objects: [
      { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 0] } },
      { id: 'k', type: 'strip', initialState: { identity: 'key', values: [0, 1] } },
      { id: 'eq', type: 'equation', initialState: { text: 'q_{a}\\cdot k_{a} = 99', x: 0, y: 0, w: 100, h: 30, opacity: 0 } },
    ],
    timeline: [],
  });
  const { passed, issues } = checkSceneConsistency(scene);
  assert.equal(passed, false, 'an object authored invisible still authors a false claim - opacity is not an acceptance excuse');
  assert.ok(issues.some(issue => issue.check === 'dot-arithmetic' && issue.objectId === 'eq'));
});

test('audit/layout: reordering the same objects in the array does not change which checks fire', () => {
  const objects = [
    { id: 'q', type: 'strip', initialState: { identity: 'query', values: [1, 0] } },
    { id: 'k', type: 'strip', initialState: { identity: 'key', values: [0, 1] } },
    { id: 'eq', type: 'equation', initialState: { text: 'q_{a}\\cdot k_{a} = 99', x: 0, y: 0, w: 100, h: 30 } },
  ];
  const forwards = checkSceneConsistency(validateScene({ id: 'forwards', duration: 1, objects, timeline: [] }));
  const backwards = checkSceneConsistency(validateScene({ id: 'backwards', duration: 1, objects: [...objects].reverse(), timeline: [] }));
  assert.deepEqual(forwards.issues.map(i => i.check).sort(), backwards.issues.map(i => i.check).sort());
});
