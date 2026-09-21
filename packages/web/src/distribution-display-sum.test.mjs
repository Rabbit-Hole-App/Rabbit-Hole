import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScene } from './animation-scene.js';
import { distributeRounding } from './scene-derive.js';

// A `distribution: true` row is a row-level claim - "these sum to one" - and
// AnimatedScene.jsx used to round each cell's displayed text independently,
// which can total 1.01 even when every underlying float is correct (case 01's
// softmax row [0.086, 0.139, 0.775] displays as .09 + .14 + .78). This mirrors
// AnimatedScene.jsx's own num() precision (2 decimals; distribution values are
// always < 10 in magnitude) and distributeRounding, the fix - see both
// comments in scene-derive.js and docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md.
const num = value => value.toFixed(2);
const DISPLAY_DECIMALS = 2;

const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))); // packages/web/src -> repo root
const SKIP_DIRS = new Set(['node_modules', '.git', '.local-benchmark-cache', '.operator', '.critic-packet', 'dist', 'build']);

function findSceneSpecs(dir, found) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) findSceneSpecs(full, found);
    else if (entry === 'scene-spec.json' && full.replace(/\\/g, '/').includes('/generated/latest/')) found.push(full);
  }
  return found;
}

function distributionRows(scene) {
  const rows = [];
  for (const object of scene.objects) {
    const state = object.initialState;
    if (!state.distribution || !Array.isArray(state.values)) continue;
    const cols = state.cols || state.values.length;
    const rowCount = state.rows || 1;
    for (let r = 0; r < rowCount; r += 1) {
      const row = state.values.slice(r * cols, (r + 1) * cols).filter(v => v != null);
      if (row.length) rows.push({ objectId: object.id, row: r, values: row });
    }
  }
  return rows;
}

test('every committed distribution row displays at exactly 1 once distributeRounding runs, the fix AnimatedScene.jsx actually applies', () => {
  const files = findSceneSpecs(ROOT, []);
  assert.ok(files.length > 5, `expected several scene-spec.json files, found ${files.length} - did the scan break?`);
  let checked = 0;
  const failures = [];
  for (const file of files) {
    let scene;
    try { scene = validateScene(JSON.parse(readFileSync(file, 'utf8'))); } catch { continue; } // a scene invalid for unrelated reasons is not this test's concern
    for (const { objectId, row, values } of distributionRows(scene)) {
      checked += 1;
      const displayed = distributeRounding(values, DISPLAY_DECIMALS).map(num);
      const displaySum = Number(displayed.reduce((sum, s) => sum + Number(s), 0).toFixed(DISPLAY_DECIMALS));
      if (Math.abs(displaySum - 1) > 1e-9) {
        failures.push(`${file} "${objectId}" row ${row}: ${JSON.stringify(values)} displays as ${displayed.join(' + ')} = ${displaySum}, not 1`);
      }
    }
  }
  assert.ok(checked > 0, 'expected at least one committed distribution row to check');
  assert.deepEqual(failures, [], `distribution row(s) whose DISPLAYED cells do not sum to exactly 1:\n${failures.join('\n')}`);
});

test('distributeRounding fixes the real case 01 regression: [0.086, 0.139, 0.775] displays as exactly 1, not 1.01', () => {
  const raw = [0.086, 0.139, 0.775];
  const naive = raw.map(num).reduce((sum, s) => sum + Number(s), 0);
  assert.equal(Number(naive.toFixed(2)), 1.01, 'the naive per-cell rounding this fix replaces must still reproduce the original bug');
  const fixed = distributeRounding(raw, 2).map(num);
  assert.equal(fixed.reduce((sum, s) => sum + Number(s), 0), 1);
});

test('distributeRounding is a no-op on values already exact at the target precision', () => {
  assert.deepEqual(distributeRounding([0.5, 0.5], 2), [0.5, 0.5]);
});

test('distributeRounding passes null cells (masked positions) through untouched', () => {
  assert.deepEqual(distributeRounding([0.5, null, 0.5], 2), [0.5, null, 0.5]);
});
