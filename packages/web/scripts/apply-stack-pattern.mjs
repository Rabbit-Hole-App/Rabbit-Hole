#!/usr/bin/env node
// Regenerates a scene-spec.json's repetition affordance from scene-repeat.js
// rather than hand-editing ghost objects into the JSON - the pattern lives
// in code once, and every case that needs it calls the same function.
//
//   node scripts/apply-stack-pattern.mjs <scene-spec.json> '<unitBoxJson>' <count> [direction]
import { readFileSync, writeFileSync } from 'node:fs';
import { stackSilhouettes } from '../src/scene-repeat.js';

const [scenePath, unitBoxJson, countArg, direction] = process.argv.slice(2);
if (!scenePath || !unitBoxJson || !countArg) {
  console.error('usage: node scripts/apply-stack-pattern.mjs <scene-spec.json> \'{"x":..,"y":..,"w":..,"h":..}\' <count> [direction] [idPrefix]');
  process.exit(2);
}
const idPrefix = process.argv[6] || 'stack';
const raw = JSON.parse(readFileSync(scenePath, 'utf8'));
const { objects } = stackSilhouettes({ unitBox: JSON.parse(unitBoxJson), count: Number(countArg), direction: direction || undefined, idPrefix });
raw.objects.push(...objects);
writeFileSync(scenePath, `${JSON.stringify(raw, null, 2)}\n`);
console.log(`added ${objects.length} object(s) to ${scenePath}`);
