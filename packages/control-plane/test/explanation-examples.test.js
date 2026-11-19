import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exampleReferences, examplePoolSize, EXAMPLES_WANTED } from '../src/explanation-examples.js';
import { sampledSpec } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

const DEPTHS = ['brief', 'balanced', 'detailed'];
const KINDS = ['flow', 'comparison', 'timeline', 'sequence', 'matrix', 'layers', 'cycle', 'figure', 'tree', 'relationship', 'transformation', 'argument', 'number-line', 'coordinate-plot', 'bar-chart', 't-account', 'waterfall', 'heatmap', 'sample-set', 'histogram', 'box-plot', 'tensor', 'token-links', 'block-stack'];
const SEEDS = Array.from({ length: 25 }, (_, i) => `request-${i}`);

test('GEN-1 G1 pool: sizes per kind and depth (main plus SAME-1\'s top-k bar-chart plus Codex\'s 10 pool references: number-line, t-account, waterfall, box-plot now 3 each)', () => {
  const want = { // [brief, balanced, detailed]
    flow: [36, 27, 28], comparison: [10, 8, 8], timeline: [10, 10, 10], sequence: [9, 9, 9], matrix: [94, 92, 92], layers: [1, 1, 1], cycle: [5, 5, 4], figure: [0, 0, 0], tree: [14, 14, 14], relationship: [22, 22, 22],
    transformation: [10, 3, 2], argument: [0, 0, 0], 'number-line': [3, 3, 3], 'coordinate-plot': [95, 96, 96], 'bar-chart': [20, 20, 21], 't-account': [3, 3, 3], waterfall: [3, 3, 3], heatmap: [27, 27, 27],
    'sample-set': [9, 9, 9], histogram: [5, 5, 5], 'box-plot': [3, 3, 3], tensor: [0, 0, 0], 'token-links': [6, 6, 6], 'block-stack': [29, 29, 29],
  };
  for (const kind of KINDS) assert.deepEqual(DEPTHS.map(d => examplePoolSize(kind, d)), want[kind], kind);
  assert.deepEqual(DEPTHS.map(d => KINDS.reduce((s, k) => s + examplePoolSize(k, d), 0)), [414, 395, 395]);
});

test('GEN-1 G1: three distinct library examples as { id, spec } only, none general-* or shape-*, deterministic for a seed and different across seeds', () => {
  const a = exampleReferences('flow', 'balanced', 'request-1'), b = exampleReferences('flow', 'balanced', 'request-1');
  assert.deepEqual(a, b, 'the same seed draws the same examples');
  assert.equal(a.examples.length, EXAMPLES_WANTED);
  assert.equal(new Set(a.examples.map(e => e.id)).size, EXAMPLES_WANTED, 'distinct ids');
  assert.equal(a.galleryFilled, false);
  assert.equal(a.short, false);
  for (const e of a.examples) {
    assert.deepEqual(Object.keys(e), ['id', 'spec'], 'no useWhen, no detailSpec');
    assert.ok(!/^(?:shape|general)-/.test(e.id));
    assert.equal(e.spec.diagram.kind, 'flow');
    assert.doesNotThrow(() => parseTutorDiagram(e.spec));
  }
  const sets = new Set(SEEDS.map(s => exampleReferences('flow', 'balanced', s).examples.map(e => e.id).join(',')));
  assert.ok(sets.size >= 15, `25 seeds give ${sets.size} different triples`);
  assert.notDeepEqual(exampleReferences('flow', 'brief', 'request-1').examples.map(e => e.id), a.examples.map(e => e.id), 'a depth is its own pool');
});

test('GEN-1 G1: a pool of one is filled with the kind\'s gallery example, a pool of none is the gallery example alone, and the card says it got fewer than three', () => {
  const one = exampleReferences('layers', 'balanced', 'request-1');
  assert.equal(one.pool, 1);
  assert.deepEqual([one.examples.length, one.galleryFilled, one.short], [2, true, true]);
  assert.equal(one.examples[1].id, 'shape-layers');
  const none = exampleReferences('figure', 'balanced', 'request-1');
  assert.deepEqual([none.pool, none.examples.map(e => e.id), none.galleryFilled, none.short], [0, ['shape-figure'], true, true]);
  assert.equal(exampleReferences('transformation', 'detailed', 'request-1').examples.length, 3, 'pool 2 + the gallery example');
  assert.deepEqual(exampleReferences('no-such-kind', 'balanced', 'request-1'), { examples: [], pool: 0, galleryFilled: false, short: true });
});

test('GEN-1 G1: `vary` is applied exactly as the request path does, so two seeds draw other inputs of the same reference', () => {
  const byId = new Map(diagramReferences.map(r => [r.id, r]));
  let checked = 0;
  for (const seed of SEEDS) for (const kind of ['bar-chart', 'coordinate-plot']) {
    for (const e of exampleReferences(kind, 'balanced', seed).examples) {
      const ref = byId.get(e.id);
      if (!ref?.vary) continue;
      const level = ref.depths?.standard ? { ...ref, ...ref.depths.standard } : ref;
      assert.deepEqual(e.spec, parseTutorDiagram(sampledSpec(level, seed)), `${e.id} drawn with seed ${seed}`);
      checked++;
    }
  }
  assert.ok(checked >= 5, `${checked} varied examples were checked`);
});

test('GEN-1 G1: the block stays inside MAX_CONTEXT for every kind, depth and 25 seeds (worst case recorded here)', () => {
  let worst = 0;
  for (const kind of KINDS) for (const depth of DEPTHS) for (const seed of SEEDS) {
    const size = 600 + exampleReferences(kind, depth, seed).examples.reduce((s, e) => s + JSON.stringify(e).length, 0);
    assert.ok(size <= 14_000, `${kind} ${depth} ${seed}: ${size}`);
    worst = Math.max(worst, size);
  }
  console.log(`worst examples block over 24 kinds x 3 depths x 25 seeds: ${worst} of 14000`);
});

test('GEN-1 G1 and G4: only the R2 wiring (learn-artifact.js) imports explanation-examples.js; drawKind (explanation-kind-draw.js) is still unused until R3', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const hits = [], drawHits = [];
  const walk = dir => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name === 'dist' || f.name === 'dist-dev') continue;
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walk(full);
    else if (/\.(?:js|jsx|mjs)$/.test(f.name) && !/\.test\./.test(f.name) && !/explanation-(?:examples|kind-draw)\.js$/.test(f.name)) { const text = fs.readFileSync(full, 'utf8'); if (/from '[^']*explanation-examples/.test(text)) hits.push(path.relative(root, full).replace(/\\/g, '/')); if (/from '[^']*explanation-kind-draw/.test(text)) drawHits.push(path.relative(root, full).replace(/\\/g, '/')); }
  } };
  walk(path.join(root, 'control-plane', 'src')); walk(path.join(root, 'web', 'src'));
  assert.deepEqual(hits, ['control-plane/src/learn-artifact.js']);
  assert.deepEqual(drawHits, []);
});
