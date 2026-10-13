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

// Namespace import: on 5b3552a5 the missing export fails these checks, not the whole file.
import * as sessionModule from './inline-ai-session.js';

test('telemetry route column: jev only when this request asked JEV (its meaning, pinned)', () => {
  const routeColumn = entry => sessionModule.routeColumn(entry);
  assert.equal(routeColumn({ routing: 'jev', via: 'jev' }), 'jev');
  assert.equal(routeColumn({ routing: 'jev', via: 'jev-low' }), 'jev');
  assert.equal(routeColumn({ routing: 'fallback:timeout', via: 'fallback' }), 'jev', 'it asked JEV and fell back');
  assert.equal(routeColumn({ routing: 'bypassed', via: 'command' }), 'direct');
  assert.equal(routeColumn({ routing: 'bypassed', via: 'default' }), 'bypassed');
  assert.equal(routeColumn({ routing: 'bypassed', via: 'mode' }), 'bypassed');
  assert.equal(routeColumn({ routing: 'reused', via: 'jev' }), 'bypassed', 'a reused result made no routing call');
  assert.equal(routeColumn({ routing: 'clarified', via: 'clarified' }), 'bypassed', 'the routing call was the earlier request');
});

test('telemetry units: stage times are milliseconds to 0.1 ms from the monotonic clock (passes on 5b3552a5 too)', async () => {
  const marks = [1000, 1003.27, 1003.3, 1310.45, 1400, 1520.06, 2100, 2350.5, 2350.55, 2600, 2700, 2800];
  let at = 0;
  const session = createInlineSession({ transport: { route: async () => ({ choice: 'note', confidence: 0.9, probability: 0.9, ranked: ['note'] }), generate: async (input, { onEvent }) => { onEvent({ type: 'delta', text: 'a' }); return { result: { kind: 'note', text: 'a' } }; } }, boardKey: 'b', validate: result => ({ ok: true, preview: { text: result.text } }), now: () => marks[at++], flushMs: 0 });
  await session.submit({ mode: 'explain', prompt: 'Show the shape of this', prepare: snapshot('u') });
  const timings = sessionModule.stageTimings(session.metrics(session.state.preview.requestId));
  for (const value of Object.values(timings)) assert.ok(value == null || value === 'bypassed' || (typeof value === 'number' && Math.round(value * 10) === value * 10), `ms with one decimal: ${value}`);
  assert.equal(timings.refresh, 3.3);
  assert.equal(timings.routing, 307.2);
});
