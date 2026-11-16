import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findStrayHex } from './stray-hex-lint.mjs';

test('no hex colour literal lives outside theme/palette.js in tutor-diagrams, explain-program, interact-style.js and learn-scene-author.js', () => {
  const found = findStrayHex();
  assert.deepEqual(found.map(({ file, line, hex }) => `${file}:${line} ${hex}`), []);
});

test('the --viz-* declarations of index.css are the ones theme/palette.js generates', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./generate-css.mjs', import.meta.url))], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout);
});
