import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearGuestDraft, draftKey, forkDraft, loadGuestDraft, saveGuestDraft } from './guest-draft.js';
import { forkAction } from './canvas-fork.js';

const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map }; };

test('a guest draft is kept per link in this tab, read back as written, and cleared', () => {
  const store = memory(), storage = () => store;
  const state = { shapes: [{ id: 's1' }], blocks: [{ id: 'b1', dx: 40 }] };
  assert.equal(loadGuestDraft(storage, 'tok-a'), null);
  assert.equal(saveGuestDraft(storage, 'tok-a', 7, state), true);
  assert.deepEqual([...store.map.keys()], [draftKey('tok-a')]);
  const kept = loadGuestDraft(storage, 'tok-a');
  assert.deepEqual([kept.base_version, kept.state], [7, state]);
  assert.equal(loadGuestDraft(storage, 'tok-b'), null, 'another link has its own draft');
  assert.deepEqual(forkDraft(kept), { base_version: 7, state });
  clearGuestDraft(storage, 'tok-a');
  assert.equal(loadGuestDraft(storage, 'tok-a'), null);
  assert.equal(forkDraft(null), null);
});

test('blocked or full storage and bad JSON never throw: the draft is just not kept', () => {
  const blocked = () => { throw new Error('SecurityError'); };
  assert.equal(saveGuestDraft(blocked, 't', 1, {}), false);
  assert.equal(loadGuestDraft(blocked, 't'), null);
  clearGuestDraft(blocked, 't');
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  assert.equal(saveGuestDraft(() => full, 't', 1, {}), false);
  const bad = memory(); bad.setItem(draftKey('t'), '{nope'); assert.equal(loadGuestDraft(() => bad, 't'), null);
  bad.setItem(draftKey('t'), JSON.stringify({ state: [] })); assert.equal(loadGuestDraft(() => bad, 't'), null);
});

test('Fork carries the draft once per action: a double click and a retry send the same key and the same draft', async () => {
  const sent = [];
  const replies = [new Error('network'), { name: 'canvas-00000001', replayed: true }];
  const fork = forkAction(body => { sent.push(body); const next = replies.shift(); return next instanceof Error ? Promise.reject(next) : Promise.resolve(next); }, () => 'key-1-abcdefgh');
  const draft = { base_version: 3, state: { shapes: [{ id: 's' }] } };
  await assert.rejects(Promise.all([fork({ source: { token: 't' }, draft }), fork({ source: { token: 't' }, draft })]), /network/);
  await fork({ source: { token: 't' }, draft });
  assert.equal(sent.length, 2, 'the double click joined the first request');
  assert.deepEqual(sent.map(body => [body.key, body.draft]), [['key-1-abcdefgh', draft], ['key-1-abcdefgh', draft]]);
  const plain = forkAction(body => { sent.push(body); return Promise.resolve({}); }, () => 'key-2-abcdefgh');
  await plain({ source: { token: 't' } });
  assert.equal('draft' in sent.at(-1), false, 'no draft, no field: today\'s fork');
});
