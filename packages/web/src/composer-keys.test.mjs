import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composerKey } from './composer-keys.js';

test('Enter sends and Shift+Enter adds a line (T02 §6.2)', () => {
  assert.equal(composerKey({ key: 'Enter', shiftKey: false }), 'send');
  assert.equal(composerKey({ key: 'Enter', shiftKey: true }), 'newline');
});

test('nothing fires while an input method is composing, or for other keys', () => {
  assert.equal(composerKey({ key: 'Enter', shiftKey: false, isComposing: true }), 'none');
  assert.equal(composerKey({ key: 'Enter', shiftKey: false, keyCode: 229 }), 'none'); // Safari IME
  assert.equal(composerKey({ key: 'a', shiftKey: false }), 'none');
});

test('with the Ctrl/Cmd+Enter preference, only a modified Enter sends; Enter and Shift+Enter add a line', () => {
  assert.equal(composerKey({ key: 'Enter' }, 'mod'), 'newline');
  assert.equal(composerKey({ key: 'Enter', shiftKey: true }, 'mod'), 'newline');
  assert.equal(composerKey({ key: 'Enter', ctrlKey: true }, 'mod'), 'send');
  assert.equal(composerKey({ key: 'Enter', metaKey: true }, 'mod'), 'send');
  assert.equal(composerKey({ key: 'Enter', ctrlKey: true, isComposing: true }, 'mod'), 'none');
  // The default is unchanged, including Ctrl+Enter, which still sends.
  assert.equal(composerKey({ key: 'Enter', ctrlKey: true }), 'send');
  assert.equal(composerKey({ key: 'Enter' }, 'enter'), 'send');
});
