import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, validateConfigTarget } from '../package-private.mjs';

test('private packaging requires an explicit matching target', () => {
  assert.throws(() => parseCommand(['installation.json']), /--target/);
  assert.throws(() => parseCommand(['--target', 'preview', 'installation.json']), /dev or live/);
  assert.equal(parseCommand(['--target', 'dev', 'installation.json']).target, 'dev');
  assert.throws(() => validateConfigTarget({ target: 'live' }, 'dev'), /must match/);
  assert.doesNotThrow(() => validateConfigTarget({ target: 'dev' }, 'dev'));
});

test('live packaging requires the exact confirmation phrase', () => {
  assert.throws(() => parseCommand(['--target', 'live', 'installation.json']), /--confirm.*DEPLOY LIVE/);
  assert.throws(() => parseCommand(['--target', 'live', '--confirm', 'deploy live', 'installation.json']), /--confirm.*DEPLOY LIVE/);
  assert.equal(parseCommand(['--target', 'live', '--confirm', 'DEPLOY LIVE', 'installation.json']).target, 'live');
});
