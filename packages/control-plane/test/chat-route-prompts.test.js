import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import '../../web/src/agent/slash-flags-test-on.mjs'; // every command on: this pins the labelled files, not which commands ship
import { CHAT_CAPABILITIES } from '../../web/src/inline-ai-route.js';
import { SLASH, typedOf } from '../../web/src/agent/slash.js';

// Owner 2026-11-13: test/chat-route/ holds one file per slash command (named by its typed name: explain.json, interactive.json, image.json, photos.json, ...) and answer.json
// for a normal chat reply. A file has the command's messages (what a learner would type WITHOUT the command's own word), its chat-history follow-ups and its near-misses, each with
// the expected route. They are what the JEV chat classifier is measured and tuned on (scripts/chat-route-eval.mjs). This pins their shape; it calls no model.
const dir = new URL('./chat-route/', import.meta.url);
const files = Object.fromEntries(readdirSync(dir).filter(name => name.endsWith('.json')).map(name => [name.replace(/\.json$/, ''), JSON.parse(readFileSync(new URL(name, dir), 'utf8'))]));
const routable = Object.keys(CHAT_CAPABILITIES).filter(id => !CHAT_CAPABILITIES[id].explicit);
const wordsOf = id => { const entry = SLASH.find(command => command.name === id); return [...new Set([id, entry?.typed, ...(entry?.aliases || [])].filter(Boolean))]; };
const has = (text, word) => new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(text);

test('every routable command has its own file, named by its typed name, with at least six of its own messages; answer.json is the chat replies', () => {
  assert.deepEqual(Object.keys(files).sort(), [...routable.map(typedOf), 'answer'].sort());
  for (const id of routable) {
    const file = files[typedOf(id)];
    assert.equal(file.command, id, `${typedOf(id)}.json names its registry id`);
    assert.equal(file.typed, typedOf(id));
    assert.ok(file.about && file.about.length > 20, `${typedOf(id)}.json says what the command is`);
    assert.ok(file.cases.filter(item => item.expect === id).length >= 6, `/${typedOf(id)} has at least six messages that expect it`);
  }
  assert.ok(files.answer.cases.length >= 20);
});

test('no message that expects a command contains that command\'s own word (it must be recognised by meaning)', () => {
  for (const id of routable) {
    for (const item of files[typedOf(id)].cases.filter(entry => entry.expect === id)) for (const word of wordsOf(id)) assert.ok(!has(item.text, word), `/${typedOf(id)}: "${item.text}" contains "${word}"`);
  }
});

test('cases are well formed, expect a real route, and no message is labelled twice', () => {
  const expectable = new Set([...routable, 'answer']), texts = [];
  for (const [name, file] of Object.entries(files)) {
    for (const item of file.cases) {
      assert.ok(typeof item.text === 'string' && item.text.trim(), `${name}: a case has words`);
      assert.ok(expectable.has(item.expect), `${name}: "${item.text}" expects ${item.expect}`);
      if (item.history) assert.ok(Array.isArray(item.history) && item.history.length > 0 && item.history.every(turn => typeof turn.user === 'string' && turn.user), `${name}: "${item.text}" history`);
      texts.push(item.text.toLowerCase());
    }
  }
  assert.equal(new Set(texts).size, texts.length, 'a message is labelled once');
  assert.ok(Object.values(files).flatMap(file => file.cases).filter(item => item.history).length >= 6, 'a few with chat history');
});
