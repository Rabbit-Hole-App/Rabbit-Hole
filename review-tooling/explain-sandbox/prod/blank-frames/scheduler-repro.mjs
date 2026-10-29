// Node only. playback.js (c59bae962) driven the way ProgramScene drives it during Play (one want per clock tick, same key),
// with an evaluate that answers like host.js and fails ONCE with the guest deadline error runtime.js returns
// (RuntimeError runtime_limit, phase evaluate, "time limit"). It records what ProgramScene's callbacks would set:
// show -> setView + setFailure(null); fail -> setFailure(error) (ProgramScene.jsx 103-107), and whether the card would be
// in its failure branch (ProgramScene.jsx 163-171: no drawing, no readouts, no transport, no time label) at each tick.
import assert from 'node:assert/strict';
const WEB = 'file:///C:/s/wt-blank-frames/packages/web/src/explain-program/';
const { createFrameScheduler } = await import(WEB + 'playback.js');
const { RuntimeError } = await import(WEB + 'contract.js');

let failure = null, view = null, calls = 0;
const failOn = 5; // the 5th evaluation misses the deadline
const scheduler = createFrameScheduler({
  evaluate: job => new Promise((resolve, reject) => setTimeout(() => (++calls === failOn
    ? reject(new RuntimeError('runtime_limit', 'time limit'))
    : resolve({ frame: { t: job.time } })), 4)), // ~4 ms per evaluation, as measured in runtime-timing
  show: (reply, job) => { view = job.time; failure = null; },
  fail: error => { failure = error; },
});
const ticks = [];
for (let i = 0; i < 20; i++) { // 20 clock ticks at ~16.7 ms, as the rAF loop in ProgramScene.jsx 126-137
  scheduler.want({ key: '{"room":10}#0', time: i / 60, inputs: { room: 10 } });
  await new Promise(r => setTimeout(r, 16.7));
  ticks.push({ tick: i, failureBranch: !!failure, code: failure?.code ?? null, drawnTime: view });
}
scheduler.dispose();
const blank = ticks.filter(t => t.failureBranch);
console.log(JSON.stringify({ evaluations: calls, ticks: ticks.length, ticksInFailureBranch: blank.length, blank, recoveredAfter: ticks.find(t => t.tick > (blank.at(-1)?.tick ?? 0))?.drawnTime }));
assert.ok(blank.length >= 1, 'a single deadline miss puts the card in its failure branch for at least one tick');
assert.equal(ticks.at(-1).failureBranch, false, 'the next successful evaluation clears the failure (the card comes back)');
assert.equal(blank[0].code, 'runtime_limit');
console.log('scheduler-repro: PASS (one transient runtime_limit -> failure branch for', blank.length, 'tick(s), then the drawing returns)');
