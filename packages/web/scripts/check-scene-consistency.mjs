#!/usr/bin/env node
// Run the teaching-scene consistency pass against one or more scene-spec.json
// files. Used to prove a case fails before a fix, and to re-check it after.
//
//   node scripts/check-scene-consistency.mjs ../../viz-benchmarks/.../scene-spec.json
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateScene } from '../src/animation-scene.js';
import { checkSceneConsistency } from '../src/scene-consistency.js';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('usage: node scripts/check-scene-consistency.mjs <scene-spec.json> [...]');
  process.exit(2);
}

// A case's own patterns (matrix_operation, live_computation, ...) live in
// target.json, not the scene - see scene-consistency.js's
// checkPatternRequiresSharedScale. A committed case's scene-spec.json sits
// at .../generated/latest/scene-spec.json or .../generated/history/vNNN/
// scene-spec.json; target.json sits three directories up, beside `cases`'s
// own case directory. Anything else (a bare fixture, a demo scene) has no
// target.json to find, and patterns stays undefined - the check is simply
// inert for it, per its own comment.
function patternsFor(scenePath) {
  const targetPath = join(dirname(dirname(dirname(scenePath))), 'target.json');
  if (!existsSync(targetPath)) return undefined;
  try { return JSON.parse(readFileSync(targetPath, 'utf8')).patterns; }
  catch { return undefined; }
}

let anyFailed = false;
for (const path of paths) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`\n${path}`);
  let scene;
  try {
    scene = validateScene(raw);
  } catch (error) {
    anyFailed = true;
    console.log(`  REFUSED AT THE GATE: ${error.message}`);
    continue;
  }
  const { passed, issues } = checkSceneConsistency(scene, { patterns: patternsFor(path) });
  if (passed) {
    console.log('  PASS');
    continue;
  }
  anyFailed = true;
  console.log(`  FAIL (${issues.length} issue${issues.length === 1 ? '' : 's'})`);
  for (const issue of issues) console.log(`    [${issue.check}] ${issue.message}`);
}
process.exit(anyFailed ? 1 : 0);
