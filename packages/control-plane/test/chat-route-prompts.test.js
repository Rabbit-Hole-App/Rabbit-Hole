import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../../web/src/agent/slash-flags-test-on.mjs'; // every command on: this pins the labelled set, not which commands ship
import { CHAT_CAPABILITIES } from '../../web/src/inline-ai-route.js';
import { SLASH } from '../../web/src/agent/slash.js';

// Owner 2026-11-13: test/chat-route-prompts.json is the labelled set the JEV chat classifier is measured and tuned on: for every routable command, messages
// a learner would type that do not contain the command's own word, plus messages that must stay a normal chat answer. This pins its shape; it calls no model.
const set = JSON.parse(readFileSync(new URL('./chat-route-prompts.json', import.meta.url), 'utf8'));
const routable = Object.keys(CHAT_CAPABILITIES).filter(id => !CHAT_CAPABILITIES[id].explicit);
const wordsOf = id => { const entry = SLASH.find(command => command.name === id); return [...new Set([id, entry?.typed, ...(entry?.aliases || [])].filter(Boolean))]; };
const has = (text, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text);

test('every routable command has at least six labelled messages, and nothing else is labelled', () => {
  assert.deepEqual(Object.keys(set.capabilities).sort(), routable.sort());
  for (const [id, prompts] of Object.entries(set.capabilities)) assert.ok(prompts.length >= 6, `/${id} has ${prompts.length}`);
});

test('no labelled message contains its own command word (it must be recognised by meaning)', () => {
  for (const [id, prompts] of Object.entries(set.capabilities)) {
    for (const prompt of prompts) for (const word of wordsOf(id)) assert.ok(!has(prompt, word), `/${id}: "${prompt}" contains "${word}"`);
  }
});

test('messages are unique across the whole set, and the answer and follow-up cases are well formed', () => {
  const all = [...Object.values(set.capabilities).flat(), ...set.answer, ...set.followups.map(item => item.text)];
  assert.equal(new Set(all.map(text => text.toLowerCase())).size, all.length, 'a message is labelled once');
  assert.ok(set.answer.length >= 20);
  const expectable = new Set([...routable, 'answer']);
  assert.ok(set.followups.length >= 6);
  for (const item of set.followups) {
    assert.ok(expectable.has(item.expect), `${item.text}: ${item.expect}`);
    assert.ok(Array.isArray(item.history) && item.history.length > 0 && item.history.every(turn => typeof turn.user === 'string' && turn.user));
  }
});
