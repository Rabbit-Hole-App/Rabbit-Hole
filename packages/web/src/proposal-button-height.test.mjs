// Generate, Stop, Edit, Cancel and Go to card in a proposal card are one height (owner 2026-11-07): every one is a size sm Button, with no
// per-button height override. Source check, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./GenerationProposalCard.jsx', import.meta.url), 'utf8');

test('the proposal action buttons share one height', () => {
  assert.ok(!/\bh-9\b/.test(source), 'no h-9 override left on a proposal button');
  for (const slot of ['generate', 'stop', 'edit', 'cancel', 'go-to-card', 'discard', 'save']) {
    const buttons = source.match(new RegExp('<Button[^>]*data-proposal-' + slot + '(?=[ =])[^>]*>', 'g')) || [];
    assert.ok(buttons.length > 0, slot + ' button exists');
    for (const button of buttons) assert.match(button, /size="sm"/, slot + ' is size sm: ' + button.slice(0, 80));
  }
});
