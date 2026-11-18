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
// The pattern a reference teaches that its bands must keep, for the references where the bands alone do not say it (hand-written from the reference's text; not product code).
const vals = (d, s) => d.series[s].values;
const patterns = {
  'boosting-signed-corrections': d => { const i = vals(d, 0), f = vals(d, 1), s = vals(d, 2); return i.every(x => x === 3) && f[0] > 0 && f[1] < 0 && f[2] > 0 && s[0] < 0 && s[1] < 0 && s[2] > 0 && s.every((x, k) => Math.abs(x) <= Math.abs(f[k]) + 1e-9); }, // signs hold; |second| <= |first| per sample
  'class-weighted-loss': d => { const u = vals(d, 0), w = vals(d, 1); return u[0] === 1 && u[1] === 1 && w[0] === 1 && w[1] >= 2 && Number.isInteger(w[1]); }, // equal raw losses, common weight 1, the rare class weighted larger
  'permutation-feature-importance': d => [0, 1].every(s => { const v = vals(d, s); return v[0] > v[1] && v[1] > v[2] && Math.abs(v[2]) <= 0.02 + 1e-9; }), // A > B > C in each shuffle, C near zero
  'feature-selection-stability': d => [0, 1].every(s => { const v = vals(d, s); return v.every(x => x >= 0 && x <= 1) && v[0] > v[1] && v[1] > v[2]; }), // fractions in [0, 1], A > B > C under both selectors
  'ensemble-votes': d => { const h = vals(d, 0), w = vals(d, 1); return h.every(Number.isInteger) && h[0] > h[1] && h[1] > h[2] && w[0] > w[1] && w[1] > w[2] && w[0] <= h[0] + 1e-9 && w[2] <= h[2] + 1e-9; }, // whole hard votes A > B > C; weighted A > B > C; weighted <= hard for A and C
};

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
        if (patterns[ref.id]) assert.ok(patterns[ref.id](spec.diagram), `${name}, ${seed}: the reference's pattern broke`);
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
