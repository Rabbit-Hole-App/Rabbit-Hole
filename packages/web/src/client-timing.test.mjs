// Timing events (client-timing.js; docs/features/telemetry.md "Timing events"): pairing, replacing, stale starts, clamping, never throwing, the
// server contract, and that every interval is started and ended where the file says it is. Node only: no browser, no network.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EVENTS, makeEvent, validateEvent } from '../../control-plane/src/telemetry-contract.js';
import { INTERVALS, MAX_MS, STALE_MS, configureTimingForTests, markEnd, markMove, markStart, startTiming } from './client-timing.js';

let now = 0, sent = [];
beforeEach(() => { now = 0; sent = []; configureTimingForTests({ clock: () => now, sink: (name, payload) => { sent.push({ name, payload }); return true; }, route: () => '/apps/:id' }); });
const read = name => readFileSync(fileURLToPath(new URL('./' + name, import.meta.url)), 'utf8');

test('startTiming reports whole milliseconds once, with its outcome, route and context', () => {
  const timing = startTiming('chat_route_ms', { mode: 'auto', depth: undefined });
  now = 41.6;
  timing.end('ok', { path: 'routed' });
  timing.end('failed'); // a second end is ignored
  assert.deepEqual(sent, [{ name: 'client.timing', payload: { interval: 'chat_route_ms', ms: 42, outcome: 'ok', route: '/apps/:id', mode: 'auto', path: 'routed' } }]);
  const cancelled = startTiming('chat_total_ms'); cancelled.cancel(); cancelled.end();
  assert.equal(sent.length, 1, 'a cancelled timing reports nothing');
});

test('markStart and markEnd pair by key across files; an unmatched end is ignored; a restart replaces the start', () => {
  markEnd('nothing');
  assert.equal(sent.length, 0);
  markStart('plan', 'roadmap_plan_ms'); now = 100;
  markStart('plan', 'roadmap_plan_ms'); now = 250; // restarted at 100
  markEnd('plan', 'ok', { count: 4 });
  markEnd('plan'); // already ended
  assert.deepEqual(sent.map(e => [e.payload.interval, e.payload.ms, e.payload.count]), [['roadmap_plan_ms', 150, 4]]);
});

test('markMove carries a start to its new key', () => {
  markStart('drop:block', 'drop_to_invite_ms'); now = 900;
  markMove('drop:block', 'drop:source'); markMove('missing', 'elsewhere');
  markEnd('drop:block'); assert.equal(sent.length, 0);
  markEnd('drop:source');
  assert.deepEqual(sent.map(e => [e.payload.interval, e.payload.ms]), [['drop_to_invite_ms', 900]]);
});

test('a start older than ten minutes is dropped, and a long interval is clamped', () => {
  markStart('old', 'card_ready_ms'); now = STALE_MS + 1;
  markEnd('old'); assert.equal(sent.length, 0);
  const long = startTiming('card_ready_ms'); now += MAX_MS * 3;
  long.end(); assert.equal(sent[0].payload.ms, MAX_MS);
});

test('it never throws, even when the sink or the clock does', () => {
  configureTimingForTests({ sink: () => { throw new Error('sink'); } });
  assert.doesNotThrow(() => { startTiming('chat_route_ms').end(); markStart('k', 'chat_total_ms'); markEnd('k', 'failed'); });
  configureTimingForTests({ clock: () => { throw new Error('clock'); } });
  assert.throws(() => startTiming('chat_route_ms')); // the only call that reads the clock outside send(); callers pass it a constant name
});

test('with telemetry not installed the real sink does nothing', async () => {
  configureTimingForTests({ clock: () => 0, sink: undefined, route: () => '/' });
  const { reportClientEvent } = await import('./client-telemetry.js');
  assert.equal(reportClientEvent('client.timing', {}), false);
  assert.doesNotThrow(() => { startTiming('chat_route_ms').end(); });
});

test('every interval is registered, and every event the module can send passes the server contract', () => {
  assert.deepEqual([...INTERVALS], EVENTS['client.timing'].interval.enum, 'the module and the registry list the same intervals');
  for (const interval of INTERVALS) {
    const event = makeEvent('client.timing', { payload: { interval, ms: 1234, outcome: 'ok', route: '/apps/:id', mode: 'ask', depth: 'deep', path: 'answer_only', size: 'm', count: 6 } }, { environment: 'production', service: 'web', release: null });
    assert.equal(validateEvent(event).ok, true, interval);
  }
  const bad = makeEvent('client.timing', { payload: { interval: 'made_up', ms: 1, route: '/' } }, { environment: 'production', service: 'web', release: null });
  assert.equal(validateEvent(bad).ok, false);
  const texty = makeEvent('client.timing', { payload: { interval: 'chat_total_ms', ms: 1, route: '/', mode: 'a sentence with spaces' } }, { environment: 'production', service: 'web', release: null });
  assert.equal(validateEvent(texty).ok, false, 'free text cannot ride a timing');
});

test('each interval is started and ended where the docs say', () => {
  const ask = read('ask.jsx'), chat = read('generation-proposal-chat.js'), controller = read('roadmap-controller.js'), page = read('LearnPage.jsx'), refs = read('source-refs.js');
  assert.ok(chat.includes("startTiming('chat_route_ms'") && chat.includes("timing.end('ok'"), 'chat_route_ms');
  for (const needle of ["'chat_first_chunk_ms'", "'chat_total_ms'", 'markEnd(`${replyId}:first`)', "markEnd(`${replyId}:${part}`"]) assert.ok(ask.includes(needle), needle);
  for (const needle of ["'roadmap_plan_ms'", "'roadmap_revise_ms'", "'roadmap_accept_plan_ms'", "'roadmap_first_proposal_ms'", "'card_accept_ms'", "'card_ready_ms'", "'card_stage_' + now + '_ms'", "markEnd('drop:' + key)", 'timeViews(state.view, body)', "timeStart(gesture)", "timeEnd(gesture, 'ok')"]) assert.ok(controller.includes(needle), needle);
  for (const needle of ["'drop_to_ready_ms'", "'drop_to_invite_ms'", "markMove('drop:' + blockId", "markStart('canvas', 'canvas_ready_ms')", "markEnd('canvas')"]) assert.ok(page.includes(needle), needle);
  assert.equal([...refs.matchAll(/startTiming\('source_resolve_ms'\)/g)].length, 2, 'both resolve paths');
  for (const stage of ['generating', 'checking', 'saving']) assert.ok(INTERVALS.includes(`card_stage_${stage}_ms`), stage);
});

test('a page sends at most PAGE_MAX_TIMINGS timings, so error reports keep their share of the page budget', async () => {
  const { PAGE_MAX_TIMINGS, configureTimingForTests, startTiming } = await import('./client-timing.js');
  const seen = [];
  configureTimingForTests({ clock: () => 0, sink: (name, payload) => seen.push([name, payload]) });
  for (let i = 0; i < PAGE_MAX_TIMINGS + 10; i += 1) startTiming('chat_route_ms').end('ok');
  assert.equal(seen.length, PAGE_MAX_TIMINGS);
  configureTimingForTests({});
});
