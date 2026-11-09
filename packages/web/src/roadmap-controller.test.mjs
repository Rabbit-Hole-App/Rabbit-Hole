// The roadmap controller against a fake server serving the recorded fixtures and a fake canvas host: one request for a Tab plus a
// click, 409 recovery, delivery exactly once across polls and reloads, save-before-ack, lost acknowledgement, removal, flag off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoadmapController } from './roadmap-controller.js';
import { keyboardOwned, pillOf } from './roadmap-client.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const clone = v => JSON.parse(JSON.stringify(v));
const fail = (status, data) => Object.assign(new Error(data.error || 'x'), { status, data });

// routes: (method path-suffix) -> handler(body) returning a body or throwing fail(...)
function harness({ routes, board = new Set(), persist = async () => ({ ok: true }), readOnly = false, revision = null, busy = () => false, depth = undefined, sourceRev = undefined, host: extra = {} } = {}) {
  const calls = [], saved = { cards: new Set(board), revision: 40 }; // the SAVED board: a successful persist copies the canvas into it
  const api = async (path, opts = {}) => {
    const method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, path, body });
    await Promise.resolve();
    for (const [pattern, handler] of Object.entries(routes)) {
      if (`${method} ${path.replace('/api/learn/roadmap', '').replace(/\?.*/, '')}`.match(new RegExp(`^${pattern}$`))) return handler(body, path);
    }
    throw fail(404, { error: 'Not available', code: 'not_found' });
  };
  const host = { hasBlock: id => board.has(id), insertCard: block => { board.add(block.id); return block.id; }, persist: async () => { const out = await persist(); if (out?.ok === true) { saved.cards = new Set(board); saved.revision += 1; } return out; }, boardRevision: () => (revision ? revision() : saved.revision), savedHas: id => saved.cards.has(id), readOnly: () => readOnly, busy, depth, sourceRev, ...extra };
  const timers = [];
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host, schedule: fn => timers.push(fn) && timers.length, cancel() {}, random: (() => { let n = 0; return () => `key${++n}aaaaaaaa`; })() });
  return { controller, calls, board, host, timers };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const post = (calls, suffix) => calls.filter(c => c.method === 'POST' && c.path.endsWith(suffix));

test('Tab and a click together send exactly one accept; the answer is applied', async () => {
  const { controller, calls } = harness({ routes: { 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/proposals/pr_[^/]+/accept': () => view('accept-proposal-response-generating') } });
  controller.start(); await settle();
  assert.equal(pillOf(controller.getState()).accept, true);
  const first = controller.acceptProposal(), second = controller.acceptProposal();
  await first; await second; await settle();
  assert.equal(post(calls, '/accept').length, 1);
  assert.equal(post(calls, '/accept')[0].body.revision, 7);
  assert.equal(post(calls, '/accept')[0].body.proposalVersion, 1);
  assert.equal(controller.getState().view.roadmap.revision, 8);
  assert.equal(pillOf(controller.getState()), null);
});

test('while the accept is in flight the pill reads accepting, and a second press sends nothing more', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { controller, calls } = harness({ routes: { 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/proposals/pr_[^/]+/accept': async () => { await gate; return view('accept-proposal-response-generating'); } } });
  controller.start(); await settle();
  const first = controller.acceptProposal(); await settle();
  assert.equal(pillOf(controller.getState()).accepting, true);
  assert.equal(await controller.acceptProposal(), null, 'a duplicate press while in flight is a no-op');
  release(); await first; await settle();
  assert.equal(post(calls, '/accept').length, 1);
  assert.equal(pillOf(controller.getState()), null);
});

test('a refused accept because another device won: current state replaces ours with the plain sentence', async () => {
  const { controller } = harness({ routes: { 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/proposals/pr_[^/]+/accept': () => { throw fail(409, view('error-stale-409')); } } });
  controller.start(); await settle();
  await controller.acceptProposal(); await settle();
  assert.equal(controller.getState().view.roadmap.revision, 8);
  assert.equal(controller.getState().notice, 'This roadmap changed. Showing the latest.');
});

test('insufficient credits: the sentence from the response, proposal still pending', async () => {
  const body = view('error-insufficient-allowance');
  const { controller } = harness({ routes: { 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/proposals/pr_[^/]+/accept': () => { throw fail(429, body); } } });
  controller.start(); await settle();
  await controller.acceptProposal(); await settle();
  assert.equal(controller.getState().notice, body.error);
  assert.equal(pillOf(controller.getState()).accept, true);
});

test('a retry of the same gesture after a failure reuses the action key', async () => {
  let attempts = 0;
  const { controller, calls } = harness({ routes: { 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/proposals/pr_[^/]+/accept': () => { attempts += 1; if (attempts === 1) throw fail(500, { error: 'x' }); return view('accept-proposal-response-generating'); } } });
  controller.start(); await settle();
  await controller.acceptProposal(); await settle();
  await controller.acceptProposal(); await settle();
  const keys = post(calls, '/accept').map(c => c.body.actionKey);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], undefined);
});

const generated = () => { const v = clone(view('accept-proposal-response-generating')); v.results[0].generation = 'generated'; v.results[0].billing = 'settled'; return v; };

test('delivery: authorized card inserted once by its minted id, board saved, then acknowledged; polls and reload add nothing', async () => {
  const order = [];
  const deliveredView = view('status-delivered-next-ready');
  const { controller, calls, board } = harness({
    board: new Set(),
    persist: async () => { order.push('persist'); return { ok: true }; },
    routes: {
      'GET ': () => generated(),
      'POST /rm_[^/]+/results/rs_[^/]+/deliver': () => { order.push('deliver'); return view('result-deliver-response'); },
      'POST /rm_[^/]+/results/rs_[^/]+/ack': body => { order.push('ack'); assert.equal(body.cardId, 'cd_71e20ac49f8b3d5612a7c0e4'); assert.equal(body.boardRevision, 41); assert.equal(body.resultVersion, 1); return deliveredView; },
    },
  });
  controller.start(); await settle(); await settle();
  assert.deepEqual([...board], ['cd_71e20ac49f8b3d5612a7c0e4']);
  assert.deepEqual(order, ['deliver', 'persist', 'ack']);
  assert.equal(controller.getState().view.roadmap.deliveredCount, 1);
  // a reload / second device: the saved board already holds the card, the server still says not delivered (lost ack)
  const second = harness({ board: new Set(['cd_71e20ac49f8b3d5612a7c0e4']), routes: { 'GET ': () => generated(), 'POST /rm_[^/]+/results/rs_[^/]+/deliver': () => view('result-deliver-response'), 'POST /rm_[^/]+/results/rs_[^/]+/ack': () => deliveredView } });
  second.controller.start(); await settle(); await settle();
  assert.equal(second.board.size, 1, 'the same card, not a second');
  assert.equal(post(second.calls, '/ack').length, 1, 'the acknowledgement is re-sent');
  assert.equal(post(calls, '/deliver').length, 1);
});

test('a failed board save ({ ok:false }) sends no acknowledgement; the retry reuses the same card and acknowledges once', async () => {
  let saves = 0;
  const { controller, calls, board } = harness({
    persist: async () => { saves += 1; return saves === 1 ? { ok: false, local: true, remote: 'failed' } : { ok: true }; },
    routes: { 'GET ': () => generated(), 'POST /rm_[^/]+/results/rs_[^/]+/deliver': () => view('result-deliver-response'), 'POST /rm_[^/]+/results/rs_[^/]+/ack': body => { assert.equal(body.boardRevision, 41, 'the real saved revision'); return view('status-delivered-next-ready'); } },
  });
  controller.start(); await settle(); await settle();
  assert.equal(post(calls, '/ack').length, 0, 'not acknowledged after a failed save');
  assert.equal(board.size, 1, 'the card stays on the canvas');
  await controller.refresh(); await settle(); await settle();
  assert.deepEqual([...board], ['cd_71e20ac49f8b3d5612a7c0e4'], 'one card, never a second');
  assert.equal(post(calls, '/ack').length, 1);
  assert.equal(post(calls, '/deliver').length, 2, 'the retry asks for the already generated result again: no generation call exists on this path');
});

test('a save that rejects, or that does not yet hold the card, or has no revision, sends no acknowledgement', async () => {
  for (const [name, persist, revision] of [['rejects', async () => { throw new Error('offline'); }, undefined], ['null revision', undefined, () => null], ['stale save', async () => ({ ok: true }), undefined]]) {
    const { controller, calls, host } = harness({ persist, ...(revision ? { revision } : {}),
      routes: { 'GET ': () => generated(), 'POST /rm_[^/]+/results/rs_[^/]+/deliver': () => view('result-deliver-response'), 'POST /rm_[^/]+/results/rs_[^/]+/ack': () => view('status-delivered-next-ready') } });
    if (name === 'stale save') host.savedHas = () => false; // the board that was saved is older than the insert
    controller.start(); await settle(); await settle();
    assert.equal(post(calls, '/ack').length, 0, name);
  }
});

test('held result is never delivered', async () => {
  const { controller, calls } = harness({ routes: { 'GET ': () => view('status-held-for-checking') } });
  controller.start(); await settle();
  assert.equal(post(calls, '/deliver').length, 0);
});

test('a delivered card removed from the canvas is reported once', async () => {
  const board = new Set(['cd_71e20ac49f8b3d5612a7c0e4']);
  const { controller, calls } = harness({ board, routes: { 'GET ': () => view('status-delivered-next-ready'), 'POST /rm_[^/]+/results/rs_[^/]+/removed': () => view('status-delivered-next-ready') } });
  controller.start(); await settle();
  board.delete('cd_71e20ac49f8b3d5612a7c0e4');
  await controller.refresh(); await settle(); await controller.refresh(); await settle();
  assert.equal(post(calls, '/removed').length, 1);
  assert.equal(post(calls, '/removed')[0].body.cardId, 'cd_71e20ac49f8b3d5612a7c0e4');
});

test('flag off: 404 roadmap_disabled hides everything and nothing else is sent', async () => {
  const { controller, calls } = harness({ routes: { 'GET ': () => { throw fail(404, { error: 'Not found', code: 'roadmap_disabled' }); } } });
  controller.start(); await settle();
  assert.equal(controller.getState().flag, 'off');
  await controller.proposeNext(); await controller.end();
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});

test('a shared or read-only view stays silent: no request at all', async () => {
  const { controller, calls } = harness({ readOnly: true, routes: { 'GET ': () => view('status-active-proposal-pending') } });
  controller.start(); await settle();
  assert.equal(calls.length, 0);
});

test('manual progression and End roadmap send their own actions with the current revision', async () => {
  const paused = view('status-cancelled-paused');
  const { controller, calls } = harness({ routes: { 'GET ': () => paused, 'POST /rm_[^/]+/steps/propose': () => view('status-delivered-next-ready'), 'POST /rm_[^/]+/end': () => view('status-completed') } });
  controller.start(); await settle();
  await controller.proposeNext(); await settle();
  assert.equal(post(calls, '/steps/propose')[0].body.revision, 11);
  assert.equal('recover' in controller, false, 'no recovery action (owner 2026-11-06)');
  await controller.end(); await settle();
  assert.equal(post(calls, '/end').length, 1);
});

test('Cancel posts the proposal version; dismiss and explain act on the one invitation', async () => {
  const { controller, calls } = harness({ routes: {
    'GET ': () => view('status-active-proposal-pending'),
    'POST /rm_[^/]+/proposals/pr_[^/]+/cancel': () => view('status-cancelled-paused'),
  } });
  controller.start(); await settle();
  await controller.cancelProposal(); await settle();
  assert.equal(post(calls, '/cancel')[0].body.proposalVersion, 1);
  assert.equal(controller.getState().view.roadmap.state, 'paused');
  const inv = harness({ routes: { 'GET ': () => ({ roadmap: null }), 'GET /invitations': () => view('invitation-offered'), 'POST /invitations/iv_[^/]+/dismiss': () => view('invitation-dismiss'), 'POST /': () => view('create-response-draft') } });
  inv.controller.start(); await settle();
  assert.ok(inv.controller.getState().invitation);
  await inv.controller.dismiss(); await settle();
  assert.equal(inv.controller.getState().invitation, null);
});

test('Ask mode is recorded server side only while a roadmap is unfinished', async () => {
  const { controller, calls } = harness({ routes: { 'GET ': () => view('status-active-proposal-pending'), 'POST /rm_[^/]+/mode': () => view('status-active-proposal-pending') } });
  controller.setMode('ask');
  assert.equal(post(calls, '/mode').length, 0);
  controller.start(); await settle();
  controller.setMode('tutor'); await settle();
  assert.equal(post(calls, '/mode').length, 1);
  assert.equal(post(calls, '/mode')[0].body.mode, 'tutor');
});

test('keyboard ownership: page, canvas surface and the overlay hold Tab; any other focused control does not', () => {
  const el = (selectors = [], tagName = 'DIV') => ({ tagName, ownerDocument: { documentElement: {} }, closest: sel => (selectors.some(s => sel.includes(s)) ? {} : null) });
  assert.equal(keyboardOwned(null), true);
  assert.equal(keyboardOwned(el([], 'BODY')), true);
  assert.equal(keyboardOwned(el(['data-canvas-surface'])), true);
  assert.equal(keyboardOwned(el(['data-roadmap-overlay'], 'BUTTON')), true);
  assert.equal(keyboardOwned(el([], 'BUTTON')), false, 'a toolbar or ToC control keeps normal focus order');
});

test('Explain on canvas sends the selected Depth and the source revision; a missing Depth is Standard', async () => {
  for (const [selected, sent] of [['deep', 'deep'], ['overview', 'overview'], [undefined, 'standard']]) {
    const { controller, calls } = harness({ depth: selected && (() => selected), sourceRev: key => `rev-of-${key}`, routes: { 'GET ': () => ({ roadmap: null }), 'GET /invitations': () => view('invitation-offered'), 'POST /': () => view('create-response-draft') } });
    controller.start(); await settle();
    await controller.explain(); await settle();
    const create = post(calls, '/api/learn/roadmap')[0] || calls.find(c => c.method === 'POST' && c.body?.invitationId);
    assert.equal(create.body.depth, sent);
    assert.match(create.body.source.rev, /^rev-of-file:/, 'the stored revision of the dropped source');
  }
});

// UI.01 / BE.01: a drop is acknowledged at once (no typing or idle deferral), one source per report under a 'drop-' key, its repeats
// coalesced; no planner, author or paid request happens before Explain. A second source over an unfinished roadmap gets the boundary.
test('a dropped source is reported at once even while typing, once per source, with no paid call; a second source over a roadmap gets the boundary', async () => {
  let suppress = false;
  const { controller, calls } = harness({ busy: () => true, host: { sourceName: key => (key === 'file:fs_cd34' ? 'Second.md' : 'First.md') },
    routes: { 'GET ': () => ({ roadmap: null }), 'GET /invitations': () => ({ invitation: null }), 'POST /invitations': () => (suppress ? { invitation: null, suppressed: { reason: 'unfinished_roadmap' } } : view('invitation-offered')) } });
  controller.start(); await settle();
  controller.sourceReady('file:fs_ab12'); controller.sourceReady('file:fs_ab12'); await settle();
  const sent = calls.filter(c => c.method === 'POST' && c.path.endsWith('/invitations'));
  assert.equal(sent.length, 1, 'repeated ready events for one source coalesce');
  assert.deepEqual(sent[0].body.sourceKeys, ['file:fs_ab12']);
  assert.match(sent[0].body.idleKey, /^drop-/);
  assert.ok(controller.getState().invitation, 'the invitation is held in state at once, typing or not');
  assert.equal(calls.filter(c => c.method === 'POST' && !c.path.endsWith('/invitations')).length, 0, 'no roadmap, planner or card request before Explain');
  suppress = true;
  controller.sourceReady('file:fs_cd34'); await settle();
  assert.deepEqual(controller.getState().boundary, { key: 'file:fs_cd34', name: 'Second.md' });
});

test('bindThread records the Tutor thread and shows the view the server answers; a refusal rejects so the page starts a fresh thread', async () => {
  const pending = view('status-active-proposal-pending'), threadId = 'canvaschat-11111111-1111-4111-8111-111111111111';
  const bound = { ...pending, roadmap: { ...pending.roadmap, threadId } };
  let refuse = false;
  const { controller, calls } = harness({ routes: { 'GET ': () => pending, 'POST /rm_[^/]+/thread': () => { if (refuse) throw Object.assign(new Error('Save the thread first'), { status: 404, data: { code: 'not_found' } }); return bound; } } });
  controller.start(); await settle();
  const body = await controller.bindThread(threadId);
  assert.equal(body.roadmap.threadId, threadId);
  assert.deepEqual(post(calls, '/thread')[0].body, { boardId: pending.roadmap.boardId, threadId });
  assert.equal(controller.getState().view.roadmap.threadId, threadId, 'the answer is applied');
  refuse = true;
  await assert.rejects(controller.bindThread('canvaschat-22222222-2222-4222-8222-222222222222'));
});

// UI.06 delivery handoff: the card's final offsets settle in the canvas before the board is saved (host.settled), the save is checked, and only then the ack.
// A card that never settles is neither saved nor acknowledged; the next poll reuses the same card (no second insert, no generation route on this path).
test('delivery waits for the settled geometry, then saves, verifies and acknowledges; unsettled sends nothing; the slot reads Saving meanwhile', async () => {
  const order = [];
  let release, settledOk = false;
  const { controller, calls, board, host } = harness({
    persist: async () => { order.push('persist'); return { ok: true }; },
    routes: { 'GET ': () => generated(), 'POST /rm_[^/]+/results/rs_[^/]+/deliver': () => { order.push('deliver'); return view('result-deliver-response'); }, 'POST /rm_[^/]+/results/rs_[^/]+/ack': () => { order.push('ack'); return view('status-delivered-next-ready'); } },
  });
  host.settled = id => { order.push(`settled:${id}`); return settledOk ? Promise.resolve(true) : new Promise(resolve => { release = resolve; }); };
  controller.start(); await settle(); await settle();
  assert.deepEqual(order, ['deliver', 'settled:cd_71e20ac49f8b3d5612a7c0e4'], 'nothing saved before the place settles');
  const rid = generated().results[0].id;
  assert.ok(controller.getState().busy.includes(`deliver:${rid}`), 'the slot says Saving while delivery runs');
  release(false); await settle(); await settle();
  assert.equal(post(calls, '/ack').length, 0, 'not settled: no save, no acknowledgement');
  assert.equal(order.includes('persist'), false);
  assert.equal(controller.getState().busy.includes(`deliver:${rid}`), false);
  settledOk = true;
  await controller.refresh(); await settle(); await settle();
  assert.deepEqual(order.slice(2), ['deliver', 'settled:cd_71e20ac49f8b3d5612a7c0e4', 'persist', 'ack']);
  assert.equal(board.size, 1, 'the same card, inserted once');
});

test('Restore: a removed card is re-inserted from the stored result, saved, and only then returned to delivered; nothing is generated or acknowledged', async () => {
  const id = 'cd_71e20ac49f8b3d5612a7c0e4', resultId = 'rs_90ab12cd34ef56789a0b1c2d';
  const removed = clone(view('status-delivered-next-ready')); removed.results[0].delivery = 'removed';
  const delivered = view('status-delivered-next-ready');
  let current = removed;
  const board = new Set();
  const { controller, calls } = harness({ board, routes: {
    'GET ': () => current,
    'POST /rm_[^/]+/results/rs_[^/]+/deliver': () => ({ ...view('result-deliver-response'), ackRequired: false }),
    'POST /rm_[^/]+/results/rs_[^/]+/restored': () => { current = delivered; return { resultId, delivery: 'delivered' }; },
  } });
  controller.start(); await settle();
  const done = await controller.restoreCard(resultId); await settle();
  assert.ok(done, 'restored');
  assert.ok(board.has(id), 'the stored card is back on the canvas');
  assert.equal(post(calls, '/deliver').length, 1);
  assert.equal(post(calls, '/restored').length, 1);
  assert.equal(post(calls, '/ack').length, 0, 'no second acknowledgement');
  assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.path.split('/').slice(-1)[0]), ['deliver', 'restored'], 'only these two requests: nothing is generated, proposed or charged');
  assert.equal(controller.getState().view.results[0].delivery, 'delivered', 'the row is read again at once');
  assert.equal(await controller.restoreCard(resultId), null, 'a delivered result has nothing to restore');
});

test('Restore: a failed save leaves the result removed and sends no restored; pressing again retries without a second card', async () => {
  const id = 'cd_71e20ac49f8b3d5612a7c0e4', resultId = 'rs_90ab12cd34ef56789a0b1c2d';
  const removed = clone(view('status-delivered-next-ready')); removed.results[0].delivery = 'removed';
  let ok = false, inserts = 0;
  const board = new Set();
  const { controller, calls, host } = harness({ board, persist: async () => ({ ok }), routes: { 'GET ': () => removed,
    'POST /rm_[^/]+/results/rs_[^/]+/deliver': () => ({ ...view('result-deliver-response'), ackRequired: false }),
    'POST /rm_[^/]+/results/rs_[^/]+/restored': () => ({ resultId, delivery: 'delivered' }) } });
  const insert = host.insertCard; host.insertCard = block => { inserts += 1; return insert(block); };
  controller.start(); await settle();
  assert.equal(await controller.restoreCard(resultId), null);
  assert.equal(post(calls, '/restored').length, 0);
  ok = true;
  assert.ok(await controller.restoreCard(resultId));
  assert.equal(inserts, 1, 'the card already on the canvas is not inserted twice');
  assert.equal(post(calls, '/restored').length, 1);
});
