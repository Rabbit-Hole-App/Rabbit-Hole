// The Chat composer's draft store and / slot (chat-workspace-CONTRACT.md A5, A6; owner brief section 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDraft, draftKey, draftSlot, pickDraft, refsForSend } from './chat-draft.js';

test('the draft is kept per canvas and thread; a new chat is "new"', () => {
  assert.equal(draftKey('canvas-1a2b3c4d', null), 'rh.chat.draft.canvas-1a2b3c4d.new');
  assert.equal(draftKey('canvas-1a2b3c4d', 'canvaschat-9'), 'rh.chat.draft.canvas-1a2b3c4d.canvaschat-9');
});

test('restore: the server draft only when it is newer or there is no local copy', () => {
  const local = { text: 'mine', command: null, savedAt: 200 };
  assert.deepEqual(pickDraft(null, null), { text: '', command: null, savedAt: 0 });
  assert.deepEqual(pickDraft(null, { text: 'server', command: 'diagram' }), { text: 'server', command: 'diagram', savedAt: 0 });
  assert.equal(pickDraft(local, null), local);
  assert.equal(pickDraft(local, { text: 'older', command: null, savedAt: 100 }), local);
  assert.equal(pickDraft(local, { text: 'untimed', command: null }), local, 'an untimed server draft cannot be shown newer');
  assert.equal(pickDraft(local, { text: 'newer', command: null, savedAt: 300 }).text, 'newer');
  // A sent draft leaves an empty local copy with its time, which beats the server's older unsent one.
  assert.equal(pickDraft({ text: '', command: null, savedAt: 500 }, { text: 'already sent', command: null, savedAt: 400 }).text, '');
});

test('prepare appends after a blank line and never replaces written text', () => {
  assert.equal(appendDraft('', 'Why?'), 'Why?');
  assert.equal(appendDraft('   ', 'Why?'), 'Why?');
  assert.equal(appendDraft('my words\n', 'Why?'), 'my words\n\nWhy?');
  assert.equal(appendDraft('my words', ''), 'my words');
  assert.equal(appendDraft('my words', undefined), 'my words');
});

test('the / slot: a picked command is its own state, removing it returns the slot to "/" and keeps the text', () => {
  let draft = draftSlot({ text: '', command: null, savedAt: 0 }, { type: 'text', text: 'the cache', at: 1 });
  assert.equal(draft.command, null);
  draft = draftSlot(draft, { type: 'command', command: 'diagram', at: 2 });
  assert.deepEqual(draft, { text: 'the cache', command: 'diagram', savedAt: 2 });
  draft = draftSlot(draft, { type: 'command', command: null, at: 3 });
  assert.deepEqual(draft, { text: 'the cache', command: null, savedAt: 3 });
  assert.equal('mode' in draft, false, 'the mode is the thread\'s, never the slot\'s');
});

test('prepare sets the command only when given and keeps the draft; clear empties both', () => {
  const draft = { text: 'mine', command: 'quiz', savedAt: 1 };
  assert.deepEqual(draftSlot(draft, { type: 'prepare', text: 'Next?', at: 2 }), { text: 'mine\n\nNext?', command: 'quiz', savedAt: 2 });
  assert.deepEqual(draftSlot(draft, { type: 'prepare', command: 'graph', text: 'the curve', at: 2 }), { text: 'mine\n\nthe curve', command: 'graph', savedAt: 2 });
  assert.deepEqual(draftSlot(draft, { type: 'clear', at: 3 }), { text: '', command: null, savedAt: 3 });
});

test('context_refs at Send: card text resolved now and cut to the limits; other kinds carry none', () => {
  let reads = 0;
  const card = { sourceId: 'card:shape:a', kind: 'card', name: 'A', version: 'h1', range: null, text: () => { reads += 1; return 'live text'; } };
  const doc = { sourceId: 'doc:7', kind: 'doc', name: 'paper.pdf', version: '2026-10-14', range: { page: 3 }, text: 'never sent' };
  const [sentCard, sentDoc] = refsForSend([card, doc]);
  assert.equal(reads, 1);
  assert.equal(sentCard.text, 'live text');
  assert.equal(typeof sentCard.text, 'string');
  assert.equal('text' in sentDoc, false);
  const big = kind => ({ sourceId: `${kind}:x`, kind, name: kind, version: 'v', range: null, text: 'x'.repeat(10) });
  const cut = refsForSend([big('card'), big('group'), big('media')], { text: 6, texts: 14 });
  assert.deepEqual(cut.map(ref => ref.text?.length), [6, 6, 2]);
  assert.equal('text' in refsForSend([{ ...big('image'), text: '' }])[0], false);
});
