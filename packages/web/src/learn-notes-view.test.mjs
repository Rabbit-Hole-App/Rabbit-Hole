import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// LearnPage.jsx cannot be rendered under node, so these read its source: the
// My notes view and its right-panel Learn Agent chat, with no lesson player.
const source = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// The demo needs the parked tldraw player, so it is always disabled: a pill
// that never enabled, and typing its prompt silently sent nothing.
test('no AskPanel in LearnPage gets the parked sigmoid demo', () => {
  const panels = source.match(/<AskPanel\b[^\n]*/g);
  assert.ok(panels.some(panel => panel.includes('headerTitle="Learn Agent"')));
  assert.deepEqual(panels.filter(panel => /\bdemo=/.test(panel)), []);
});
