// R6.03 client side: the automatic next proposal appears from the server's view without the client asking for it, without moving the camera, adding a
// Chat line or stealing focus; the delivery-to-visible time is measured with a fake clock; a manual Propose next step is not counted. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRoadmapController } from './roadmap-controller.js';
import { chatOf, pillOf } from './roadmap-client.js';
import { FOLLOW_UP_MS, createAutoMeter, percentile, summarize } from './roadmap-auto.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const clone = v => JSON.parse(JSON.stringify(v));
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const generated = () => { const v = clone(view('accept-proposal-response-generating')); v.results[0].generation = 'generated'; v.results[0].billing = 'settled'; return v; };
// The delivered view with the next proposal not yet offered (the server has not composed it), and the same roadmap one revision later with it pending.
const quiet = () => { const v = clone(view('status-delivered-next-ready')); v.proposal = null; v.nextStepReady = false; return v; };
const withProposal = () => view('status-delivered-next-ready');

function harness({ get }) {
  const calls = [], timers = [], cancelled = [], clock = { t: 1000 };
  const focus = [];
  const api = async (path, opts = {}) => {
    const method = opts.method || 'GET';
    const tail = path.replace('/api/learn/roadmap', '').replace(/\?.*/, '');
    calls.push({ method, tail });
    if (method === 'GET' && tail === '') return get();
    if (tail.endsWith('/deliver')) return view('result-deliver-response');
    if (tail.endsWith('/ack')) return quiet();
    if (tail.endsWith('/steps/propose')) return withProposal();
    throw Object.assign(new Error('no route'), { status: 404, data: { code: 'not_found' } });
  };
  const board = new Set();
  const host = { hasBlock: id => board.has(id), insertCard: block => { board.add(block.id); return block.id; }, persist: async () => ({ ok: true }), boardRevision: () => 41, savedHas: () => true, readOnly: () => false, focusBlock: id => focus.push(id) };
  const controller = createRoadmapController({ api, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host, schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, cancel: id => cancelled.push(id), now: () => clock.t, random: (() => { let n = 0; return () => `key${++n}aaaaaaaa`; })() });
  return { controller, calls, timers, cancelled, clock, focus };
}
const count = (calls, tail) => calls.filter(c => c.tail.endsWith(tail)).length;

test('a manual Propose next step is not an automatic sample', async () => {
  const meter = createAutoMeter({ now: (() => { let t = 0; return () => (t += 100); })() });
  meter.ack();
  meter.manual();
  meter.observe({ proposal: { id: 'pr_1', version: 1, state: 'pending' } });
  assert.equal(meter.summary().n, 0);
  meter.ack();
  meter.observe({ proposal: { id: 'pr_2', version: 1, state: 'pending' } });
  assert.equal(meter.summary().n, 1);
  meter.observe({ proposal: { id: 'pr_2', version: 1, state: 'pending' } });
  meter.observe({ proposal: null });
  meter.observe({ proposal: { id: 'pr_2', version: 1, state: 'pending' } });
  assert.equal(meter.summary().n, 1, 'seen again after a gap, but no acknowledgment is waiting');
});

test('percentiles: nearest rank, empty is null', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5, 1, 3], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.deepEqual(summarize([{ ackToVisibleMs: 900 }, { ackToVisibleMs: 2500 }]), { n: 2, p50: 900, p95: 2500 });
});
