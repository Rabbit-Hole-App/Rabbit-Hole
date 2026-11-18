// VAR-1 step 4: every library reference that carries `vary` draws valid cards. For 20 seeds (and every depth variant) the sampled spec parses, draws at three widths, keeps each value
// inside its band, and keeps the reference's own pattern (orders by construction); the reference as written is one of its draws (its values lie inside the bands).
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { diagramReferences } from './reference-library.js';
import { renderTutorDiagram } from './TutorDiagram.js';
import { parseTutorDiagram } from './spec.js';
import { varySpec } from './vary.js';

const at = (root, path) => path.split('.').reduce((node, key) => node?.[key], root);
const SEEDS = Array.from({ length: 20 }, (_, i) => `request-${i}`);
const varied = diagramReferences.filter(ref => ref.vary);

for (const ref of varied) {
  const variants = [[ref.id, ref], ...Object.entries(ref.depths ?? {}).map(([depth, entry]) => [`${ref.id} (${depth})`, { ...ref, ...entry }])];
  test(`${ref.id}: 20 seeds draw valid cards inside their bands`, () => {
    for (const [name, variant] of variants) {
      for (const [path, [min, max]] of Object.entries(variant.vary)) {
        const written = at(variant.spec.diagram, path);
        assert.ok(written >= min - 1e-9 && written <= max + 1e-9, `${name}: the written ${path} = ${written} lies outside [${min}, ${max}]`);
      }
      for (const seed of SEEDS) {
        const spec = varySpec(variant.spec, variant.vary, seed, variant.id);
        parseTutorDiagram(spec);
        for (const [path, [min, max]] of Object.entries(variant.vary)) {
          const value = at(spec.diagram, path);
          assert.ok(value >= min - 1e-9 && value <= max + 1e-9, `${name}, ${seed}: ${path} = ${value} outside [${min}, ${max}]`);
        }
        for (const width of [320, 408, 720]) assert.ok(renderToStaticMarkup(renderTutorDiagram(spec, width).element).length > 200, `${name}, ${seed}: no drawing at ${width}`);
        for (const s of spec.diagram.series ?? []) if (s.kind === 'line' && s.smooth === false) assert.ok(s.points.every((p, i) => i === 0 || p.x >= s.points[i - 1].x), `${name}, ${seed}: x of ${s.label} goes backwards`);
      }
    }
  });
}
