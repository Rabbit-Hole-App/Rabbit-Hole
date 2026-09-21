// Fast local check: does this scene-spec.json pass validateScene without a
// browser? Catches authoring mistakes (bad enum, missing rowLabels, etc.)
// before paying for a Playwright launch.
// Usage: node viz-benchmark-validate.mjs <scene-spec.json>
import { validateScene } from '../src/animation-scene.js';
import { readFileSync } from 'node:fs';

const scene = JSON.parse(readFileSync(process.argv[2], 'utf8'));
try {
  validateScene(scene);
  console.log('OK:', process.argv[2]);
} catch (error) {
  console.error('INVALID:', process.argv[2], '-', error.message);
  process.exit(1);
}
