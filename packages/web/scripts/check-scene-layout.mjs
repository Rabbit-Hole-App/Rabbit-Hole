#!/usr/bin/env node
// Run the layout lint (second priority - see scene-layout-lint.js) against
// one or more scene-spec.json files.
//
//   node scripts/check-scene-layout.mjs ../../viz-benchmarks/.../scene-spec.json
import { readFileSync } from 'node:fs';
import { validateScene } from '../src/animation-scene.js';
import { checkLayoutLint } from '../src/scene-layout-lint.js';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('usage: node scripts/check-scene-layout.mjs <scene-spec.json> [...]');
  process.exit(2);
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
  const { passed, issues } = checkLayoutLint(scene);
  if (passed) {
    console.log('  PASS');
    continue;
  }
  anyFailed = true;
  console.log(`  FAIL (${issues.length} issue${issues.length === 1 ? '' : 's'})`);
  for (const issue of issues) console.log(`    [${issue.check}] ${issue.message}`);
}
process.exit(anyFailed ? 1 : 0);
