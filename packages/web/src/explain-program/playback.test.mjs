import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameScheduler, frameKey, watchSeen } from './playback.js';
import { RuntimeError } from './contract.js';

// A fake host whose every evaluation takes `latency` ms of fake time, one at a time (host.js keeps one in flight and the newest
// waiting), and a fake animation clock of 16 ms frames. Regression for the starved playback seen on the genuine sandbox-ex1-b
// card: the drawing stayed at t=0 while the time readout ran, because every answer slower than one frame was dropped.
function rig({ latency = 50 } = {}) {
  let now = 0;
  const timers = [];
  const later = (ms, fn) => timers.push({ at: now + ms, fn });
  const advance = ms => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > end) break;
      const next = timers.shift();
      now = next.at;
      next.fn();
    }
    now = end;
  };
  let busy = false, pending = null;
  const requests = [];
  const run = () => {
    if (busy || !pending) return;
    const job = pending;
    pending = null;
    busy = true;
    later(job.latency ?? latency, () => { busy = false; job.resolve({ frame: { at: job.request.time, inputs: job.request.inputs } }); run(); });
  };
  const evaluate = request => new Promise((resolve, reject) => {
    requests.push(request);
    if (pending) pending.reject(new DOMException('superseded', 'AbortError'));
    pending = { request, resolve, reject };
    run();
  });
  const shown = [], failures = [];
  const scheduler = createFrameScheduler({ evaluate: job => evaluate(job), show: (reply, job) => shown.push({ ...job, reply }), fail: error => failures.push(error) });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  // Fake animation frames: the card's clock asks for the moment of each frame, the way ProgramScene's effect does.
  const play = async ({ key, inputs = {}, from = 0, ms, speed = 1 }) => {
    const start = now;
    while (now - start < ms) {
      scheduler.want({ key, time: from + (now - start) / 1000 * speed, inputs });
      advance(16);
      await flush();
    }
  };
  const settle = async () => { for (let i = 0; i < 50; i++) { advance(1000); await flush(); } };
  return { scheduler, shown, failures, requests, play, settle, advance, flush, get now() { return now; } };
}

test('frames slower than one animation frame are drawn while the clock runs, in chronological order', async () => {
  const r = rig({ latency: 50 }); // about three animation frames per evaluation
  await r.play({ key: 'a', ms: 2000 });
  // 2 s at 50 ms per evaluation, each next request sent on the next fake frame (64 ms): about 31 completed frames, every one
  // drawn (the old card drew none of them).
  assert.ok(r.shown.length >= 28, `drew ${r.shown.length} frames`);
  const times = r.shown.map(frame => frame.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b), 'never an older moment after a newer one');
  assert.ok(times.at(-1) > 1.8, 'the drawing follows the clock');
  // Coalescing: only the newest moment is ever asked for, so requests track completions, not animation frames (125 here).
  assert.ok(r.requests.length <= r.shown.length + 2, `${r.requests.length} requests for ${r.shown.length} frames`);
});

test('after the clock stops, the drawing settles on the exact requested moment', async () => {
  const r = rig({ latency: 70 });
  await r.play({ key: 'a', ms: 1000 });
  r.scheduler.want({ key: 'a', time: 1.234, inputs: {} }); // pause at an arbitrary moment
  await r.settle();
  assert.equal(r.shown.at(-1).time, 1.234);
  const before = r.requests.length;
  r.scheduler.want({ key: 'a', time: 1.234, inputs: {} });
  await r.settle();
  assert.equal(r.requests.length, before, 'a settled card asks for nothing more');
});

test('a scrub (new epoch) never draws an answer asked for before it, and settles on the scrubbed moment', async () => {
  const r = rig({ latency: 80 });
  await r.play({ key: 'a#0', from: 10, ms: 500 });
  const drawnBefore = r.shown.length;
  r.scheduler.want({ key: 'a#1', time: 3, inputs: {} }); // scrub back to 3 s while a 10.x s frame is in flight
  await r.settle();
  const after = r.shown.slice(drawnBefore);
  assert.deepEqual(after.map(frame => [frame.key, frame.time]), [['a#1', 3]], 'the in-flight 10 s answer is not drawn after the scrub');
});

test('rapid input changes never draw a stale result: only the last inputs are drawn', async () => {
  const r = rig({ latency: 60 });
  for (let value = 0; value <= 20; value++) { // a slider dragged through 21 values, one per animation frame
    r.scheduler.want({ key: `room=${value}#0`, time: 5, inputs: { room: value } });
    r.advance(16);
    await r.flush();
  }
  await r.settle();
  const last = r.shown.at(-1);
  assert.deepEqual([last.key, last.reply.frame.inputs], ['room=20#0', { room: 20 }]);
  // Every frame drawn was the newest state at the moment it was drawn: never one the slider had already left.
  for (const frame of r.shown) assert.equal(frame.key, frame.reply.frame.inputs && `room=${frame.reply.frame.inputs.room}#0`);
  const drawnKeys = r.shown.map(frame => frame.key);
  assert.deepEqual(drawnKeys, [...new Set(drawnKeys)], 'no state is drawn twice or after a newer one');
  assert.deepEqual(r.failures, [], 'superseded requests are not failures');
});

test('a reset during playback draws defaults at time zero, and nothing is drawn after dispose', async () => {
  const r = rig({ latency: 40 });
  await r.play({ key: 'room=25#0', inputs: { room: 25 }, ms: 400 });
  r.scheduler.want({ key: 'room=10#1', time: 0, inputs: { room: 10 } });
  await r.settle();
  assert.deepEqual([r.shown.at(-1).key, r.shown.at(-1).time], ['room=10#1', 0]);
  const count = r.shown.length;
  r.scheduler.want({ key: 'room=10#1', time: 4, inputs: { room: 10 } });
  r.scheduler.dispose();
  await r.settle();
  assert.equal(r.shown.length, count);
});

test('a failure of the current state is reported once; a failure of an older state is not', async () => {
  const errors = [];
  let calls = 0;
  const scheduler = createFrameScheduler({
    evaluate: job => { calls += 1; return Promise.reject(Object.assign(new Error('runtime'), { code: job.key === 'old' ? 'x' : 'runtime_limit' })); },
    show: () => assert.fail('nothing to draw'), fail: error => errors.push(error.code),
  });
  scheduler.want({ key: 'old', time: 0, inputs: {} });
  scheduler.want({ key: 'new', time: 0, inputs: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, ['runtime_limit']);
  assert.equal(calls, 2, 'no retry loop');
});

// Blank-frame investigation (2026-10-28): one failed frame during playback swapped the card for its error message for about three
// frames, then the next good frame drew over it, and the card stayed short by its rows until reload. The scheduler reports the
// failure once and asks for nothing more by itself; ProgramScene stops the clock on it (so no later tick draws over the message)
// and ends the rows' size observer while the message shows (drawn is false), so Restart measures the rows again.
test('a failed frame during playback is reported once and nothing is drawn after it while the card asks for nothing more', async () => {
  const errors = [], drawn = [];
  let calls = 0;
  const scheduler = createFrameScheduler({
    evaluate: job => { calls += 1; return job.time === 1 ? Promise.reject(Object.assign(new Error('bad frame'), { code: 'invalid_output' })) : Promise.resolve({ frame: job.time }); },
    show: (reply, job) => drawn.push(job.time), fail: error => errors.push(error.code),
  });
  for (const time of [0, 0.5, 1]) { scheduler.want({ key: 'a', time, inputs: {} }); await new Promise(resolve => setImmediate(resolve)); }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([drawn, errors, calls], [[0, 0.5], ['invalid_output'], 3]);
  const scene = (await import('node:fs')).readFileSync(new URL('./ProgramScene.jsx', import.meta.url), 'utf8');
  assert.match(scene, /const stop = error => \{ setPlaying\(false\); setFailure\(error\); \};/, 'a failure stops the clock');
  assert.match(scene, /else stop\(out\.error\);\s*\},\s*fail: stop,/, 'a failed evaluation and a frame that fails its checks both stop the card');
  assert.match(scene, /const drawn = !!\(manifest && view && !failure\);/, 'the rows observer ends while the message replaces them');
});

// Owner decision 2026-10-29 (option A): a frame that misses the 50 ms operation deadline is skipped and the last frame stays; a
// completed frame resets the count; the third overrun in a row stops the card; every other error still stops it at once.
const OVERRUN = () => new RuntimeError('runtime_limit', 'time limit'); // what host.js rejects for runtime.js's interrupt
function scripted(outcomes) {
  const drawn = [], errors = [], asked = [];
  const scheduler = createFrameScheduler({
    evaluate: job => { asked.push(job.time); const next = outcomes.shift(); return next === 'ok' ? Promise.resolve({ frame: job.time }) : Promise.reject(next()); },
    show: (reply, job) => drawn.push(job.time), fail: error => errors.push(error),
  });
  const at = async time => { scheduler.want({ key: 'a', time, inputs: {} }); for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { drawn, errors, asked, at };
}

test('one overrun keeps the last frame, the newest moment is asked for again and drawn, and the count resets', async () => {
  const r = scripted(['ok', OVERRUN, 'ok', OVERRUN, OVERRUN, 'ok']);
  await r.at(0);
  await r.at(1); // overrun, then t=1 again: drawn
  assert.deepEqual([r.drawn, r.errors.length], [[0, 1], 0]);
  await r.at(2); // two more overruns: under three in a row since the reset
  assert.deepEqual([r.drawn, r.errors.length, r.asked], [[0, 1, 2], 0, [0, 1, 1, 2, 2, 2]]);
});

test('three overruns in a row stop the card once, with the frame drawn before them still the last one drawn', async () => {
  const r = scripted(['ok', OVERRUN, OVERRUN, OVERRUN, 'ok']);
  await r.at(0);
  await r.at(1);
  assert.deepEqual([r.drawn, r.errors.map(error => error.code), r.asked], [[0], ['runtime_limit'], [0, 1, 1, 1]]);
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(r.asked, [0, 1, 1, 1], 'the scheduler asks for nothing more by itself after the stop');
});

test('overrun, success, overrun, overrun does not stop the card', async () => {
  const r = scripted([OVERRUN, 'ok', OVERRUN, OVERRUN, 'ok']);
  await r.at(0); // overrun, then drawn
  await r.at(1); // overrun, overrun, then drawn
  assert.deepEqual([r.drawn, r.errors.length], [[0, 1], 0]);
});

test('every other error stops the card at once: watchdog, boot, setup, memory, output, version, Worker failure', async () => {
  const others = [
    ['runtime_limit', 'host watchdog: Worker terminated'], ['runtime_limit', 'engine boot deadline'], ['runtime_limit', 'setup time limit'],
    ['runtime_limit', 'InternalError: out of memory'], ['runtime_limit', 'state is over its size limit'], ['invalid_output', 'output over its size limit'],
    ['version_unavailable', 'engine did not load'], ['runtime_error', 'Worker failed'], ['invalid_program', 'time limit'],
  ];
  for (const [code, diagnostic] of others) {
    const r = scripted(['ok', () => new RuntimeError(code, diagnostic), 'ok']);
    await r.at(0);
    await r.at(1);
    assert.deepEqual([r.drawn, r.errors.map(error => error.code), r.asked], [[0], [code], [0, 1]], diagnostic);
  }
});

test('a frame asked for an older state never draws after a newer one: a transition, a reset and a replaced artifact', async () => {
  const r = rig({ latency: 80 });
  const inputs = { step: 2 };
  const committed = (bundleHash, revision, count) => ({ bundleHash, revision, state: { count }, seed: 0 });
  const want = (epoch, envelope, time = 0) => r.scheduler.want({ key: frameKey(inputs, epoch, envelope), time, inputs, state: envelope.state });
  const one = committed('a'.repeat(64), 1, 2), two = committed('a'.repeat(64), 2, 4);
  want(0, one); // in flight
  r.advance(10); await r.flush();
  want(0, two); // a transition commits while the older state's frame is still being evaluated
  await r.settle();
  assert.deepEqual(r.shown.map(frame => frame.state.count), [4], 'the older state was never drawn');
  // Reset: a time jump (epoch) and the initial state at a newer revision, while the old state's frame is in flight.
  const drawn = r.shown.length;
  want(0, two, 1);
  r.advance(10); await r.flush();
  const initial = committed('a'.repeat(64), 3, 0);
  want(1, initial);
  await r.settle();
  assert.deepEqual(r.shown.slice(drawn).map(frame => [frame.state.count, frame.time]), [[0, 0]]);
  // A replaced artifact: the same revision number of another program's state is another key.
  assert.notEqual(frameKey(inputs, 1, initial), frameKey(inputs, 1, committed('b'.repeat(64), 3, 0)));
  assert.equal(frameKey(inputs, 0), `${JSON.stringify(inputs)}#0#-`, 'a schema 1 card keys on inputs and epoch, as before');
});

// Task 10.1: a card that cannot be seen pauses. A fake document and IntersectionObserver stand in for the browser's.
function seen({ focused = false } = {}) {
  const listeners = new Set(), doc = { hidden: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  let observer = null;
  class Observer { constructor(fn) { observer = this; this.fn = fn; this.watched = []; } observe(el) { this.watched.push(el); } disconnect() { this.watched = []; } }
  const element = { closest: selector => (selector === '[data-focus-host]' && focused ? element : null) };
  const paused = [];
  const stop = watchSeen(element, () => paused.push(true), { doc, Observer });
  return {
    paused, stop, listeners, get observer() { return observer; },
    view: isIntersecting => observer.fn([{ isIntersecting }]),
    tab: hidden => { doc.hidden = hidden; listeners.forEach(fn => fn()); },
  };
}

test('a card that leaves the view or a hidden tab pauses; coming back into view does not resume it', () => {
  const s = seen();
  s.view(true);
  assert.equal(s.paused.length, 0);
  s.view(false);
  assert.equal(s.paused.length, 1, 'panned out of view');
  s.view(true);
  assert.equal(s.paused.length, 1, 're-entry starts nothing: the card stays paused at its moment');
  s.tab(true);
  assert.equal(s.paused.length, 2, 'hidden tab');
  s.tab(false);
  assert.equal(s.paused.length, 2);
});

test('a card in Focus counts as seen wherever its canvas spot is', () => {
  const s = seen({ focused: true });
  s.view(false);
  assert.equal(s.paused.length, 0);
  s.tab(true);
  assert.equal(s.paused.length, 1, 'a hidden tab still pauses a focused card');
});

test('stopping the watch removes the tab listener and the observer; without an element only the tab is watched', () => {
  const s = seen();
  assert.equal(s.observer.watched.length, 1);
  s.stop();
  assert.equal(s.listeners.size, 0);
  assert.equal(s.observer.watched.length, 0);
  const listeners = new Set(), paused = [];
  const doc = { hidden: true, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const stop = watchSeen(null, () => paused.push(true), { doc, Observer: class { constructor() { throw Error('no element, no observer'); } } });
  listeners.forEach(fn => fn());
  assert.equal(paused.length, 1);
  stop();
  assert.equal(listeners.size, 0);
});

test('paused offscreen, the scheduler asks for nothing more and keeps the last drawn frame', async () => {
  const asked = [], drawn = [];
  const scheduler = createFrameScheduler({ evaluate: job => (asked.push(job.time), Promise.resolve({})), show: (_, job) => drawn.push(job.time) });
  // The clock wants t=1.2 when the card leaves view; paused, the clock stops, so no later moment is ever wanted.
  scheduler.want({ key: 'k', time: 1.2, inputs: {} });
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  scheduler.want({ key: 'k', time: 1.2, inputs: {} }); // re-entry re-renders the same wanted moment
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([asked, drawn], [[1.2], [1.2]], 'settled: the same moment is not evaluated again');
  scheduler.dispose();
});
