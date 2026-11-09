import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';

const snapshotFile = new URL('./svg-snapshots.json', import.meta.url);
const updateCommand = 'UPDATE_TUTOR_SVG_SNAPSHOTS=1 node --test packages/web/src/tutor-diagrams/svg-snapshots.test.mjs';

test('reference and gallery SVG fingerprints match at every requested width', async () => {
  const update = process.env.UPDATE_TUTOR_SVG_SNAPSHOTS === '1';
  if (!update) assert.ok(existsSync(snapshotFile), `SVG snapshot file is missing. Generate it with ${updateCommand}`);

  const { captureSvgSnapshots } = await import('../../scripts/explanation-svg-snapshots.mjs');
  const actual = captureSvgSnapshots();
  if (update) {
    writeFileSync(snapshotFile, JSON.stringify(actual, null, 2) + '\n');
    return;
  }

  const expected = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  assert.equal(actual.version, expected.version);
  assert.deepEqual(actual.widths, expected.widths);
  const keys = new Set([...Object.keys(expected.entries), ...Object.keys(actual.entries)]);
  const changed = [...keys].filter(key => !isDeepStrictEqual(actual.entries[key], expected.entries[key])).sort();
  assert.equal(changed.length, 0,
    `SVG fingerprints differ for ${changed.slice(0, 12).join(', ')}. After review, update with ${updateCommand}`);
});
