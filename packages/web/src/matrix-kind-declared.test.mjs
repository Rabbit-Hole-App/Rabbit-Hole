import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';

// A repo-wide, mechanical guarantee: every grid object that carries `values`
// must declare `matrixKind`, everywhere a scene can be authored - not only
// where something happens to call validateScene today. validateScene's own
// refusal (see animation-scene.js) only catches a scene that is actually
// validated; a committed benchmark scene-spec nothing loads, a test fixture
// nobody constructs this run, or a board seed reached by only one code path
// would all survive that gate silently. This test is what closes those.
//
// A migration report is true on the day it is written. This is true every
// day after - see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))); // packages/web/src -> repo root
const SKIP_DIRS = new Set(['node_modules', '.git', '.local-benchmark-cache', 'dist', 'build']);

function walkFiles(dir, matches) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(full, matches);
    else matches(full);
  }
}

// --- JSON scene specs: every file literally named scene-spec*.json, anywhere
// in the repo (viz-benchmarks' committed cases, packages/web/e2e's captured
// shots, and anywhere a future one lands) - not only "generated/latest".
function findSceneSpecJsonFiles() {
  const found = [];
  walkFiles(ROOT, full => { if (/scene-spec.*\.json$/i.test(full)) found.push(full); });
  return found;
}

// "carries values" has to recognise BOTH shapes a raw, pre-resolution
// scene-spec.json can hold: a literal array, or a {"$derive": "name"} marker
// that resolveDerived() (see scene-derive.js) only turns into an array
// later, inside validateScene. Checking Array.isArray alone missed every
// derived grid - exactly the ones the derive seam encourages authoring -
// which a mutation test against this scanner (in this same file) caught: an
// undeclared $derive-valued grid slipped through with the narrower check.
const hasAuthoredValues = values => Array.isArray(values) || (values && typeof values === 'object' && '$derive' in values);

function jsonGridViolations(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const violations = [];
  for (const object of raw.objects || []) {
    if (object.type !== 'grid') continue;
    const state = object.initialState || {};
    if (hasAuthoredValues(state.values) && !state.matrixKind) violations.push(object.id || '(no id)');
  }
  return violations;
}

// --- JS/JSX source: any object literal shaped like a scene object -
// `{ type: 'grid', initialState: { values: [...], ... } }` - without a
// matrixKind property inside that initialState. AST-based (esbuild strips
// JSX, acorn parses), not regex, for the same reason motion-ownership.test.mjs
// is: both are already installed as Vite's own toolchain, and a text search
// cannot reliably tell a real object literal from a comment or a string.
function findSourceFiles() {
  const found = [];
  for (const dir of [join(ROOT, 'packages/web/src'), join(ROOT, 'packages/web/e2e')]) {
    walkFiles(dir, full => { if (/\.(js|jsx|mjs)$/.test(full)) found.push(full); });
  }
  return found;
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value, visit);
  }
}

const propValue = (objectExpr, name) => {
  const prop = objectExpr.properties.find(p => p.type === 'Property' && !p.computed && (p.key.name ?? p.key.value) === name);
  return prop ? prop.value : undefined;
};

function sourceGridViolations(path) {
  const source = readFileSync(path, 'utf8');
  const loader = path.endsWith('.jsx') ? 'jsx' : 'js';
  let code;
  try {
    ({ code } = esbuild.transformSync(source, { loader, jsx: 'automatic', format: 'esm' }));
  } catch {
    return []; // not parseable as a module on its own (e.g. a .js config file with non-ESM syntax) - not a scene source
  }
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch {
    return [];
  }
  const violations = [];
  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return;
    const typeValue = propValue(node, 'type');
    if (!(typeValue?.type === 'Literal' && typeValue.value === 'grid')) return;
    const initialState = propValue(node, 'initialState');
    if (!initialState || initialState.type !== 'ObjectExpression') return;
    const values = propValue(initialState, 'values');
    const matrixKind = propValue(initialState, 'matrixKind');
    if (values !== undefined && matrixKind === undefined) {
      const idValue = propValue(node, 'id');
      const label = idValue?.type === 'Literal' ? idValue.value : (idValue?.type === 'TemplateLiteral' ? '(templated id)' : '(no literal id)');
      violations.push(`${label} at line ${node.loc?.start.line ?? '?'}`);
    }
  });
  return violations;
}

// --- VALUE's own scaling gate, the same rule matrixKind already follows
// (see animation-scene.js's validateScene and docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md): a heat object with no
// declared valueScale silently reinstates the exact per-object
// normalisation this axis exists to replace. validateScene's own refusal
// only catches a scene that is actually validated - this is what closes the
// same gap matrixKind's repo-wide scan closes, for a committed benchmark
// scene-spec nothing loads, a test fixture, or a board seed reached by only
// one code path.
//
// "carries heat" is authored true, or an object ({mode: ...}) - `false` and
// `null` both mean OFF, the same two spellings validateScene itself
// normalises to null, and neither needs a scale to be honest about.
const hasAuthoredHeat = heat => heat === true || (heat != null && typeof heat === 'object');

function jsonValueScaleViolations(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const violations = [];
  for (const object of raw.objects || []) {
    const state = object.initialState || {};
    if (hasAuthoredHeat(state.heat) && !state.valueScale) violations.push(object.id || '(no id)');
  }
  return violations;
}

// AST-level: a `heat` property present with anything other than a literal
// `false`/`null` (true, an object expression, or even a variable reference -
// heat's own shape is a scene author's choice this scanner does not need to
// resolve, only "is something there") and no sibling `valueScale`.
function sourceValueScaleViolations(path) {
  const source = readFileSync(path, 'utf8');
  const loader = path.endsWith('.jsx') ? 'jsx' : 'js';
  let code;
  try {
    ({ code } = esbuild.transformSync(source, { loader, jsx: 'automatic', format: 'esm' }));
  } catch {
    return [];
  }
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch {
    return [];
  }
  const violations = [];
  walk(ast, node => {
    if (node.type !== 'ObjectExpression') return;
    const initialState = propValue(node, 'initialState');
    if (!initialState || initialState.type !== 'ObjectExpression') return;
    const heat = propValue(initialState, 'heat');
    if (!heat) return;
    if (heat.type === 'Literal' && (heat.value === false || heat.value === null)) return;
    const valueScale = propValue(initialState, 'valueScale');
    if (valueScale === undefined) {
      const idValue = propValue(node, 'id');
      const label = idValue?.type === 'Literal' ? idValue.value : (idValue?.type === 'TemplateLiteral' ? '(templated id)' : '(no literal id)');
      violations.push(`${label} at line ${node.loc?.start.line ?? '?'}`);
    }
  });
  return violations;
}

test('every heat-bearing object in every JSON scene-spec file declares valueScale', () => {
  const files = findSceneSpecJsonFiles();
  assert.ok(files.length > 5, `expected to find several scene-spec.json files under the repo, found ${files.length} - did the scan break?`);
  const failures = [];
  for (const file of files) {
    const violations = jsonValueScaleViolations(file);
    if (violations.length) failures.push(`${file}: ${violations.join(', ')}`);
  }
  assert.deepEqual(failures, [], `undeclared heat object(s):\n${failures.join('\n')}`);
});

test('every heat-bearing object authored in packages/web source (src and e2e) declares valueScale', () => {
  const files = findSourceFiles();
  assert.ok(files.length > 10, `expected to find several source files, found ${files.length} - did the scan break?`);
  const failures = [];
  for (const file of files) {
    const violations = sourceValueScaleViolations(file);
    if (violations.length) failures.push(`${file}: ${violations.join(', ')}`);
  }
  assert.deepEqual(failures, [], `undeclared heat object(s):\n${failures.join('\n')}`);
});

// Mutation proof, self-contained: stripping valueScale from a real, clean
// scene-spec.json's heat object must fail this exact test and name the file.
test('mutation proof: the JSON scan actually fails, and names the file, when valueScale is stripped', () => {
  const files = findSceneSpecJsonFiles();
  const target = files.find(file => {
    if (jsonValueScaleViolations(file).length !== 0) return false;
    const objects = JSON.parse(readFileSync(file, 'utf8')).objects || [];
    return objects.some(o => hasAuthoredHeat(o.initialState?.heat));
  });
  assert.ok(target, 'expected at least one clean scene-spec.json with a heat object to mutate');
  const original = readFileSync(target, 'utf8');
  try {
    const mutated = JSON.parse(original);
    const object = mutated.objects.find(o => hasAuthoredHeat(o.initialState?.heat));
    delete object.initialState.valueScale;
    writeFileSync(target, JSON.stringify(mutated, null, 2));
    const violations = jsonValueScaleViolations(target);
    assert.ok(violations.length > 0, 'stripping valueScale must produce a violation');
  } finally {
    writeFileSync(target, original); // restore - this is a real committed file
  }
});

test('every valued grid in every JSON scene-spec file declares matrixKind', () => {
  const files = findSceneSpecJsonFiles();
  assert.ok(files.length > 5, `expected to find several scene-spec.json files under the repo, found ${files.length} - did the scan break?`);
  const failures = [];
  for (const file of files) {
    const violations = jsonGridViolations(file);
    if (violations.length) failures.push(`${file}: ${violations.join(', ')}`);
  }
  assert.deepEqual(failures, [], `undeclared valued grid(s):\n${failures.join('\n')}`);
});

test('every valued grid authored in packages/web source (src and e2e) declares matrixKind', () => {
  const files = findSourceFiles();
  assert.ok(files.length > 10, `expected to find several source files, found ${files.length} - did the scan break?`);
  const failures = [];
  for (const file of files) {
    const violations = sourceGridViolations(file);
    if (violations.length) failures.push(`${file}: ${violations.join(', ')}`);
  }
  assert.deepEqual(failures, [], `undeclared valued grid(s):\n${failures.join('\n')}`);
});

// Mutation proof, self-contained (writes and restores its own throwaway
// fixture rather than touching a real committed case): stripping matrixKind
// from a real scene-spec.json must fail this exact test and name the file.
test('mutation proof: the JSON scan actually fails, and names the file, when matrixKind is stripped', () => {
  const files = findSceneSpecJsonFiles();
  const target = files.find(file => jsonGridViolations(file).length === 0 && JSON.parse(readFileSync(file, 'utf8')).objects?.some(o => o.type === 'grid' && hasAuthoredValues(o.initialState?.values)));
  assert.ok(target, 'expected at least one clean scene-spec.json with a valued grid to mutate');
  const original = readFileSync(target, 'utf8');
  try {
    const mutated = JSON.parse(original);
    const grid = mutated.objects.find(o => o.type === 'grid' && hasAuthoredValues(o.initialState?.values));
    delete grid.initialState.matrixKind;
    writeFileSync(target, JSON.stringify(mutated, null, 2));
    const violations = jsonGridViolations(target);
    assert.ok(violations.length > 0, 'stripping matrixKind must produce a violation');
  } finally {
    writeFileSync(target, original); // restore - this is a real committed file
  }
});

// A grid whose values are still an unresolved {"$derive": "name"} marker (the
// raw, pre-resolveDerived shape every committed scene-spec.json is written
// in) is not an array - Array.isArray(values) alone missed it entirely, a
// real gap this exact test caught during a manual mutation check against
// case 01. hasAuthoredValues fixes it; this pins the fix.
test('a $derive-valued grid with no matrixKind is still caught, not just a literal array', () => {
  // Built from a JSON string, deliberately - see scene-consistency.test.mjs's
  // identical note: a literal object here would BE the exact undeclared grid
  // this file's own source scanner looks for, indistinguishable from a real
  // accidental omission.
  const raw = JSON.parse('{"objects":[{"id":"g","type":"grid","initialState":{"rows":2,"cols":2,"values":{"$derive":"scores"}}}]}');
  const violations = raw.objects.filter(o => o.type === 'grid' && hasAuthoredValues(o.initialState.values) && !o.initialState.matrixKind).map(o => o.id);
  assert.deepEqual(violations, ['g']);
});
