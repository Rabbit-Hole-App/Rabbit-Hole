// Regression checks for the review of cf9216b2..5b3552a5 (mocked transport; no provider). Each failed on 5b3552a5
// unless it says otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInlineSession } from './inline-ai-session.js';

let clock = 0;
const now = () => (clock += 1);
const target = { objects: [{ id: 'n23', type: 'shape', kind: 'ellipse', text: '23' }] };
const snapshot = (prints = 't1', objects = target.objects) => () => ({ context: { target: { objects } }, summary: objects.map(entry => `${entry.type}:${entry.kind} "${entry.text}"`).join('; '), frozen: { ids: objects.map(entry => entry.id), prints: { target: prints, relations: 'r' } }, prints: { target: prints, relations: 'r' }, selectionOnly: false });
const make = (transport, extra = {}) => createInlineSession({ transport, boardKey: 'b', enabled: ['note', 'diagram', 'image', 'motion'], validate: result => ({ ok: true, preview: { text: result.text, block: result.block } }), now, flushMs: 0, ...extra });
const held = () => { let release; const gate = new Promise(resolve => { release = resolve; }); return { gate, release: () => release() }; };

test('accept snapshot: a failed refine leaves the preview bound to the board it was made from', async () => {
  let round = 0;
  const session = make({ generate: async () => { round += 1; if (round === 2) throw new Error('The model failed.'); return { result: { kind: 'note', text: 'P1' } }; } });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('before-edit') });
  assert.equal(session.state.preview.frozen.prints.target, 'before-edit');
  await session.submit({ mode: 'explain', prompt: 'shorter', prepare: snapshot('after-edit') });
  assert.equal(session.state.status, 'preview');
  assert.equal(session.state.preview.text, 'P1');
  assert.equal(session.state.preview.frozen.prints.target, 'before-edit');
});

test('accept snapshot: a cancelled refine leaves the preview bound to the board it was made from', async () => {
  const wait = held();
  let round = 0;
  const session = make({ generate: async () => { round += 1; if (round === 2) await wait.gate; return { result: { kind: 'note', text: `P${round}` } }; } });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('before-edit') });
  const refine = session.submit({ mode: 'explain', prompt: 'shorter', prepare: snapshot('after-edit') });
  session.cancel();
  wait.release();
  await refine;
  assert.equal(session.state.status, 'preview');
  assert.equal(session.state.preview.text, 'P1');
  assert.equal(session.state.preview.frozen.prints.target, 'before-edit');
});

test('accept snapshot: a successful refine binds the new preview to the board at the refine', async () => {
  let round = 0;
  const session = make({ generate: async () => { round += 1; return { result: { kind: 'note', text: `P${round}` } }; } });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('before-edit') });
  await session.submit({ mode: 'explain', prompt: 'shorter', prepare: snapshot('after-edit') });
  assert.equal(session.state.preview.text, 'P2');
  assert.equal(session.state.preview.frozen.prints.target, 'after-edit');
});

test('accept snapshot: a reused result is bound to the board it is reused on', async () => {
  const session = make({ generate: async () => ({ result: { kind: 'note', text: 'P' } }) });
  await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('same') });
  session.reject();
  assert.equal(await session.submit({ mode: 'explain', prompt: 'explain this', prepare: snapshot('same') }), 'reused');
  assert.equal(session.state.preview.frozen.prints.target, 'same');
});
