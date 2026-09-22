#!/usr/bin/env node
// "No scene-specific renderer" is one of every case's own target.json
// constraints (noSceneSpecificRenderer: true) - the anti-goal Plan A.5 was
// built to hold structurally: `same scene spec -> renderer + style system ->
// polished output`, with no per-case branch anywhere in between. A blind
// critic reviewing an exported packet cannot check this: the packet ships
// rendered PNGs and scene-spec.json, never AnimatedScene.jsx's own source
// (see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md's
// "Do not ship renderer source to fix this" - the packet isolation the whole
// export exists to hold). So this is checked mechanically, in the AST style
// motion-ownership.test.mjs already established (esbuild strips JSX, acorn
// parses - both already installed as Vite's own toolchain), and the result
// - never the source - is what a packet can carry: a pass/fail plus enough
// provenance (which files, which hash) that "the gate ran" is itself a
// checkable claim.
//
// What counts as bespoke: a branch in the RENDERER (see render-fingerprint.
// mjs's RENDERER_FILES - the same files that determine a rendered pixel)
// that compares an object's own IDENTITY (id, semanticId, conceptId, label,
// or text - "which specific authored thing is this") against a hardcoded
// string. That is a scene being special-cased by name. Branching on `type`,
// `role`, `heat.mode`, `matrixKind` and the rest of the closed vocabularies
// is exactly what the renderer is FOR - those are not per-case, they are
// the shared vocabulary every scene draws through - so only identity-field
// comparisons are in scope, never every string comparison in the file.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';
import { RENDERER_FILES } from './render-fingerprint.mjs';

// Fields that name WHICH authored thing an object is, as opposed to WHAT
// KIND of thing it is (type/role/heat.mode/matrixKind/...) - the latter are
// the closed vocabularies the renderer is built to dispatch on, and are
// deliberately excluded so this gate only fires on per-case special-casing.
// `title` joins them: a scene's title is as much a name for one specific
// authored thing as its id is, and branching on it is the same defect wearing
// a different field.
const IDENTITY_FIELDS = new Set(['id', 'semanticId', 'conceptId', 'label', 'text', 'title']);
// Set membership is the other spelling of the same branch: `['a','b'].includes
// (object.id)` and `object.id === 'a' || object.id === 'b'` are one check. A
// gate that only knew the second would be switched off by a refactor.
const MEMBERSHIP_METHODS = new Set(['includes', 'indexOf', 'has']);
const COMPARISON_OPERATORS = new Set(['===', '!==', '==', '!=']);

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

// A MemberExpression's own property name, only when it is a plain `.name`
// access (not computed, e.g. `obj[x]`, which this gate has no way to
// resolve statically and is not the shape a hardcoded per-case comparison
// takes anyway).
const memberPropertyName = node => (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' ? node.property.name : null);

export function findBespokeComparisons(source, loader) {
  const { code } = esbuild.transformSync(source, { loader, jsx: 'automatic', format: 'esm' });
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const violations = [];
  walk(ast, node => {
    if (node.type !== 'BinaryExpression' || !COMPARISON_OPERATORS.has(node.operator)) return;
    const sides = [node.left, node.right];
    const literalSide = sides.find(side => side.type === 'Literal' && typeof side.value === 'string');
    const memberSide = sides.find(side => side !== literalSide && memberPropertyName(side));
    if (!literalSide || !memberSide) return;
    const property = memberPropertyName(memberSide);
    if (!IDENTITY_FIELDS.has(property)) return;
    violations.push({
      line: node.loc?.start.line ?? null,
      property,
      comparedAgainst: literalSide.value,
      snippet: `.${property} ${node.operator} ${JSON.stringify(literalSide.value)}`,
    });
  });
  walk(ast, node => {
    if (node.type !== 'CallExpression' || node.arguments.length !== 1) return;
    const method = memberPropertyName(node.callee);
    if (!MEMBERSHIP_METHODS.has(method)) return;
    const property = memberPropertyName(node.arguments[0]);
    if (!property || !IDENTITY_FIELDS.has(property)) return;
    // Only a hardcoded list is a per-case branch; a lookup against a value
    // that arrived from the scene (a selection, a set of visible ids) is
    // ordinary generic work and must not be flagged.
    const subject = node.callee.object;
    const literals = subject?.type === 'ArrayExpression'
      ? subject.elements.filter(element => element?.type === 'Literal' && typeof element.value === 'string').map(element => element.value)
      : subject?.type === 'NewExpression' && subject.callee?.name === 'Set' && subject.arguments[0]?.type === 'ArrayExpression'
        ? subject.arguments[0].elements.filter(element => element?.type === 'Literal' && typeof element.value === 'string').map(element => element.value)
        : null;
    if (!literals || !literals.length) return;
    violations.push({
      line: node.loc?.start.line ?? null,
      property,
      comparedAgainst: literals.join(', '),
      snippet: `[${literals.map(value => JSON.stringify(value)).join(', ')}].${method}(.${property})`,
    });
  });
  return violations;
}

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

// The single entry point: scan every RENDERER_FILES entry, return a plain
// result object - passed/violations/provenance - never console output, so a
// caller (the test, or the CLI writer below) decides what to do with it.
export function checkBespokeRenderer(webRoot) {
  const files = RENDERER_FILES.map(relativePath => {
    const fullPath = join(webRoot, relativePath);
    const source = readFileSync(fullPath, 'utf8');
    const loader = relativePath.endsWith('.jsx') ? 'jsx' : 'js';
    const violations = findBespokeComparisons(source, loader).map(v => ({ file: relativePath, ...v }));
    return { file: relativePath, sha256: sha256(Buffer.from(source)), violations };
  });
  const violations = files.flatMap(f => f.violations);
  return {
    check: 'no-bespoke-per-case-renderer-logic',
    passed: violations.length === 0,
    scannedFiles: files.map(({ file, sha256: hash }) => ({ file, sha256: hash })),
    violations,
  };
}

// CLI: node check-bespoke-renderer.mjs [--out <path>]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('check-bespoke-renderer.mjs')) {
  const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const result = { ...checkBespokeRenderer(webRoot), generatedAt: new Date().toISOString() };
  const outIndex = process.argv.indexOf('--out');
  if (outIndex !== -1 && process.argv[outIndex + 1]) {
    writeFileSync(process.argv[outIndex + 1], JSON.stringify(result, null, 2));
    console.log(`wrote ${process.argv[outIndex + 1]}`);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
