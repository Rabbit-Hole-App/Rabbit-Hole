'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('installer rejects unsupported arguments with a concise error', () => {
  const script = path.join(__dirname, '..', 'bin', 'install.js');
  const result = spawnSync(process.execPath, [script, '--unexpected'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^small-skill: unsupported argument --unexpected\r?\n$/);
  assert.doesNotMatch(result.stderr, /\bat\s+\S+|Error:/);
});
