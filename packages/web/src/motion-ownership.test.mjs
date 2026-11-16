import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import * as acorn from 'acorn';

// Deterministic source-level invariant, in place of a timing-dependent
// behavioural test: no visual property on a `motion.*` element may be
// conditionally owned by BOTH `style` (or a plain SVG attribute) and
// Motion's `animate` prop. That split is what actually broke the heat-cell
// fill (see AnimatedScene.jsx's grid/strip cell comment) - `heat`'s truthy
// branch put `fill` in `animate`, its falsy branch put it in `style`, on
// the SAME <motion.rect>. A behavioural Playwright test that scrubs the
// rendered page and checks computed style was tried first and rejected:
// mutating the fix back to the exact prior defect (33dda4a) still passed it
// - Motion's freeze is not reliably reproducible through browser automation
// timing, so a test built on it is not evidence, regardless of how it reads.
// This test looks at the JSX itself and cannot flake.
//
// Chose esbuild (already installed - it's Vite's own JSX transform) + acorn
// (already installed - Vite/Rollup's own JS parser) over adding a JSX-aware
// parser as a new dependency. esbuild strips JSX to plain jsx()/jsxs() calls
// via the automatic runtime; acorn then gives a real AST to walk, so this
// looks at each element's actual props, not text patterns.

const here = fileURLToPath(new URL('.', import.meta.url));
const source = readFileSync(`${here}AnimatedScene.jsx`, 'utf8').replace(/\r\n/g, '\n');

function findMotionOwnershipViolations(src) {
  const { code } = esbuild.transformSync(src, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

  // Every `const NAME = { ... }` at any scope, so a prop that references a
  // variable (e.g. `animate={ring}`) can be resolved to the object it
  // actually holds, not just the identifier.
  const objectVars = new Map();
  walk(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'ObjectExpression') {
      objectVars.set(node.id.name, node.init);
    }
  });

  // Every property key reachable inside a prop's value, following ternaries,
  // logical expressions, spreads and local variable references - so
  // `heat ? { fill } : undefined` yields {fill} regardless of which branch
  // is "live".
  function keysIn(valueNode, seen = new Set()) {
    const keys = new Set();
    walk(valueNode, node => {
      if (node.type === 'ObjectExpression') {
        for (const prop of node.properties) {
          if (prop.type === 'Property' && !prop.computed) keys.add(prop.key.name ?? prop.key.value);
          if (prop.type === 'SpreadElement' && prop.argument.type === 'Identifier') {
            const resolved = objectVars.get(prop.argument.name);
            if (resolved && !seen.has(prop.argument.name)) {
              seen.add(prop.argument.name);
              for (const k of keysIn(resolved, seen)) keys.add(k);
            }
          }
        }
      }
      if (node.type === 'Identifier' && objectVars.has(node.name) && !seen.has(node.name)) {
        seen.add(node.name);
        for (const k of keysIn(objectVars.get(node.name), seen)) keys.add(k);
      }
    });
    return keys;
  }

  const violations = [];
  walk(ast, node => {
    if (node.type !== 'CallExpression') return;
    if (!(node.callee.type === 'Identifier' && (node.callee.name === 'jsx' || node.callee.name === 'jsxs'))) return;
    const [tag, props] = node.arguments;
    const isMotionTag = tag?.type === 'MemberExpression' && tag.object.type === 'Identifier' && tag.object.name === 'motion';
    if (!isMotionTag || props?.type !== 'ObjectExpression') return;
    const styleProp = props.properties.find(p => p.type === 'Property' && p.key.name === 'style');
    const animateProp = props.properties.find(p => p.type === 'Property' && p.key.name === 'animate');
    if (!styleProp || !animateProp) return; // only one ownership path is present at all - fine
    const animateKeys = keysIn(animateProp.value);
    const overlap = [...keysIn(styleProp.value)].filter(k => animateKeys.has(k));
    if (overlap.length) violations.push({ line: node.loc?.start.line, element: `motion.${tag.property.name}`, keys: overlap });
  });
  return violations;
}

// Generic AST walk: every own-enumerable child that looks like a node (or
// an array of them) is visited, so ternaries/&&/spreads/etc. all fall out
// for free without special-casing each expression type.
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

test('no motion.* element in AnimatedScene.jsx owns the same visual property through both style and animate', () => {
  const violations = findMotionOwnershipViolations(source);
  assert.deepEqual(violations, []);
});

test('mutation proof: reintroducing the prior heat-keyed style/animate split fails the invariant', () => {
  const mutated = source.replace(
    `<rect x={cellX} y={cellY} width={cell} height={cell} style={{ fill }} />
            <motion.rect x={cellX} y={cellY} width={cell} height={cell} fill="none"
              animate={ring} transition={pop} />`,
    `<motion.rect x={cellX} y={cellY} width={cell} height={cell}
              style={heat ? { fill } : undefined}
              animate={heat ? ring : { fill, ...ring }}
              transition={pop} />`,
  );
  assert.notEqual(mutated, source, 'the mutation target text was not found - update it to match the current source');
  const violations = findMotionOwnershipViolations(mutated);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].element, 'motion.rect');
  assert.deepEqual(violations[0].keys, ['fill']);
});
