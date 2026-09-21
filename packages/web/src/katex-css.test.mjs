import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// AnimatedScene.jsx renders equation objects through katex.renderToString,
// which emits unstyled markup without katex's own stylesheet - no
// superscript, no proper fraction/sqrt layout, just flat text. The shipped
// app has never actually shown this: main.jsx imports ask.jsx (MathText's
// caller) eagerly, and dist/index.html confirms ask's CSS is a top-level
// <link rel="stylesheet">, loaded on every page regardless of route. But
// that made correct rendering an accident of a sibling component's import
// graph, not something this file owns - a standalone mount of AnimatedScene
// with no main.jsx in the tree (see viz-benchmarks' scene-render-harness.jsx)
// has no such CSS and renders every equation as flat text. A source-level
// check, not a render test, for the same reason motion-ownership.test.mjs
// is one: cannot flake on chunk load order.
test('AnimatedScene imports katex\'s own stylesheet, not just the katex module', () => {
  const source = readFileSync(fileURLToPath(new URL('./AnimatedScene.jsx', import.meta.url)), 'utf8');
  assert.match(source, /import\s+['"]katex\/dist\/katex\.min\.css['"]/);
});
