import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { classify } from './affected.mjs';
const map = JSON.parse(readFileSync(new URL('./check-map.json', import.meta.url), 'utf8'));
test('every tracked executable file has a class (a new file is classified in the push that adds it)', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
  const unclassified = files.filter(f => classify(f, map) === 'unmapped');
  assert.deepEqual(unclassified, []);
});
test('every e2e check has a runner and a duration', () => {
  const checks = readdirSync('packages/web/e2e').filter(f => f.endsWith('-check.mjs'));
  assert.deepEqual(checks.filter(c => !map.checks[c]), []);
});
test('every mapped glob names checks that exist, and every windows-only check says why', () => {
  const unknown = Object.entries(map.mapped).flatMap(([g, v]) => v.filter(c => !map.checks[c]).map(c => `${g} -> ${c}`));
  assert.deepEqual(unknown, []);
  assert.deepEqual(Object.keys(map.checks).filter(c => map.checks[c].runner === 'windows-only' && !map.checks[c].why), []);
  assert.deepEqual(Object.keys(map.checks).filter(c => !['harness', 'fork', 'windows-only'].includes(map.checks[c].runner) || !(map.checks[c].seconds > 0)), []);
});
test('every none glob has a reason, and no reason is orphaned', () => {
  assert.deepEqual(map.none.filter(g => !map.noneReasons[g]).sort(), []);
  assert.deepEqual(Object.keys(map.noneReasons).filter(g => !map.none.includes(g)).sort(), []);
});
