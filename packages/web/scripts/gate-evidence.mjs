#!/usr/bin/env node
// Introspects, per case, which of scene-consistency.js's internal gates had
// anything to examine (not just whether the overall result passed). Mirrors
// the internal logic of each check function so the report can state exactly
// what ran, not just "passed: true".
import { readFileSync } from 'node:fs';
import { validateScene } from '../src/animation-scene.js';
import { DERIVATIONS } from '../src/scene-derive.js';
import { checkLayoutLint } from '../src/scene-layout-lint.js';

const dot = DERIVATIONS.dot.derive;
const DOT_EQUATION = /([a-zA-Z])_\{[^}]+\}\s*\\cdot\s*([a-zA-Z])_\{[^}]+\}\s*=\s*(-?\d*\.?\d+)/g;
const HAS_OPERATOR = /\\cdot|\\times|\\div|softmax|\\sum|[+\-*/]/;
const HAS_NUMERIC_RESULT = /=\s*-?\d*\.?\d+/;

const [, , path] = process.argv;
const scene = validateScene(JSON.parse(readFileSync(path, 'utf8')));
console.log(`\n${path}`);

const grids = scene.objects.filter(o => o.type === 'grid');
console.log('  grids:');
for (const g of grids) {
  const s = g.initialState;
  console.log(`    ${g.id}: matrixKind=${s.matrixKind ?? '(none, no values)'} provenance=${s.provenance} distribution=${!!s.distribution} rows=${s.rows ?? 1} cols=${s.cols ?? 1}`);
}

// provenance-required (equations)
const equations = scene.objects.filter(o => o.type === 'equation');
const computedEqs = equations.filter(e => HAS_OPERATOR.test(e.initialState.text || '') && HAS_NUMERIC_RESULT.test(e.initialState.text || ''));
console.log(`  equations stating a computed relationship: ${computedEqs.map(e => e.id).join(', ') || '(none)'}`);

// provenance-required + matrix-vector-count (grids)
const relOrDerived = grids.filter(g => ['relational', 'derived'].includes(g.initialState.matrixKind));
console.log(`  grids gated by provenance-required (matrixKind relational/derived): ${relOrDerived.map(g => g.id).join(', ') || '(none)'}`);
const relational = grids.filter(g => g.initialState.matrixKind === 'relational');
console.log(`  grids gated by matrix-vector-count (matrixKind relational): ${relational.map(g => g.id).join(', ') || '(none)'}`);

// dot-arithmetic: does it match, and does it resolve?
const stripsByLetter = new Map();
for (const o of scene.objects) {
  if (o.type !== 'strip' || !o.initialState.identity || !Array.isArray(o.initialState.values)) continue;
  const letter = o.initialState.identity[0].toLowerCase();
  if (!stripsByLetter.has(letter)) stripsByLetter.set(letter, o);
}
let dotMatches = 0, dotResolved = 0;
for (const eq of equations) {
  const text = eq.initialState.text || '';
  for (const m of text.matchAll(DOT_EQUATION)) {
    dotMatches += 1;
    const [, l1, l2] = m;
    if (stripsByLetter.get(l1.toLowerCase()) && stripsByLetter.get(l2.toLowerCase())) dotResolved += 1;
  }
}
console.log(`  dot-arithmetic: ${dotMatches} equation(s) matched the q_x . k_y = n pattern, ${dotResolved} resolved to real strip vectors`);

// probability claims
const distObjs = scene.objects.filter(o => o.initialState.distribution);
console.log(`  distribution: true objects: ${distObjs.map(o => o.id).join(', ') || '(none)'}`);

// dimension-label
console.log(`  grid count for dimension-label check: ${grids.length} (${grids.length === 1 ? 'runs' : 'skipped - ambiguous unless exactly 1'})`);

// layout lint
const lint = checkLayoutLint(scene);
console.log(`  layout lint: ${lint.passed ? 'PASS' : `FAIL (${lint.issues.length})`}`);
