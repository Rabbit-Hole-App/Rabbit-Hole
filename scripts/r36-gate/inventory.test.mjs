import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inventory } from './inventory.mjs';
import { focusedScript } from './prepare.mjs';
import { SHARDS } from './shards.mjs';
// LF whatever the checkout's line endings (prepare.mjs normalizes the same way).
const int35 = readFileSync(new URL('./templates/int35.sh', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
test('every logical test runs exactly once after the duplicates are removed', () => {
  const rows = inventory(int35, null, SHARDS);
  const twice = rows.filter(r => r.parts.length !== 1).map(r => r.stage);
  assert.deepEqual(twice, []);
});
test('the old configuration ran these exactly twice (the recorded duplicates)', () => {
  const OLD = [['make test-unit', 'fixture regression', ...SHARDS[0]], ...SHARDS.slice(1)];
  const rows = inventory(int35, focusedScript(int35), OLD);
  assert.deepEqual(rows.filter(r => r.parts.length === 2).map(r => r.stage).sort(), ['journey J1-J8', 'sca', 'selected-pill', 'tutor-slice'].sort());
});
