// CK-6 (owner 2026-11-14): Ctrl+K /explain makes its card on the canvas and opens no Chat pane. The line used to go through Chat's
// handoff (LearnPage inlineAi.handoff), which calls panels.openChat() and needs Chat's send loop; /explain with words now goes to
// the page's own explain job (config.explain) and only falls back to Chat where that job is off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliverLine } from './inline-ai-command.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('CK-6 deliverLine: /explain with words goes to config.explain and never touches Chat (no pane opens)', async () => {
  const calls = [];
  const config = { explain: async (words, about) => { calls.push(['explain', words, about]); return { blockId: 'b1' }; }, handoff: async () => { calls.push(['handoff']); return true; } };
  assert.equal(await deliverLine(config, '/explain what is gini impurity', { selection: { id: 'c' } }), true);
  assert.deepEqual(calls, [['explain', 'what is gini impurity', { selection: { id: 'c' } }]]);
});

test('CK-6 deliverLine: other commands, a bare /explain and explain v2 being off use Chat as before', async () => {
  const calls = [];
  const config = { explain: async () => null, handoff: async line => { calls.push(line); return true; } };
  assert.equal(await deliverLine(config, '/explain words', {}), true);
  assert.equal(await deliverLine({ ...config, explain: async () => { throw Error('not called'); } }, '/motion words', {}), true);
  assert.equal(await deliverLine({ ...config, explain: async () => { throw Error('not called'); } }, '/explain', {}), true);
  assert.deepEqual(calls, ['/explain words', '/motion words', '/explain']);
  assert.equal(await deliverLine({}, '/explain words', {}), false, 'no Chat and no explain job: not taken');
});

test('CK-6 the editor sends every explain line through deliverLine, and the page supplies config.explain without opening Chat', () => {
  const editor = read('./InlineAiEditor.jsx');
  assert.equal((editor.match(/config\.handoff\(/g) || []).length, 0, 'no direct hand-off call: deliverLine is the one door');
  assert.equal((editor.match(/await deliver\(/g) || []).length, 3, 'router hand-off, Explain selection, typed command');
  const page = read('./LearnPage.jsx');
  const at = page.indexOf('    explain: async (words');
  assert.ok(at > 0, 'inlineAi.explain exists');
  const block = page.slice(at, page.indexOf('\n', at));
  assert.ok(block.includes('startExplain(') && !/openChat|panels/.test(block), 'it starts the job directly; it opens no panel');
});
