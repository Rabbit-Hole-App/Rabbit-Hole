// Load sample section (Reviewer 2026-11-18 13:32): the dev row shows in a dev build or on a stack served from this machine, never on a deployed host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sampleSectionOn: on 127.0.0.1 and localhost, not on the deployed host; the fixture is a board state', async () => {
  const { sampleSectionOn } = await import('./learn-sample-section.js');
  for (const [hostname, on] of [['127.0.0.1', true], ['localhost', true], ['digrabbithole.com', false], ['preview.digrabbithole.com', false]]) {
    globalThis.location = { hostname };
    assert.equal(sampleSectionOn(), on, hostname);
  }
  delete globalThis.location;
  const { state } = JSON.parse(readFileSync(new URL('../../../docs/features/learn-sections/run/fixture-nanogpt-1.1.json', import.meta.url), 'utf8'));
  assert.ok(state.blocks.some(block => block.learn?.role === 'card') && state.items.some(item => item.learn?.role === 'section') && state.toc.length);
  assert.ok(!state.items.some(item => item.learn && String(item.text).includes('`')), 'no backticks in the text items');
  assert.ok(!state.blocks.some(block => block.learn?.done), 'the walk marks are cleared: the section reads Start');
});
