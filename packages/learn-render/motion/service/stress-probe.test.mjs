// The phased resource probe (stress-probe.mjs) against a fake kernel: pids.current, cpu.stat and
// the phase subprocesses are simulated, time is a fake clock. The real kernel limits are proven
// in service.linux.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE_SLACK, ProbeError, runResourceProbe, waitForPidBaseline } from './stress-probe.mjs';

// A fake job: pids.current starts at the baseline; the PID storm saturates it at 1024 and the
// dying sleepers are reaped over `reapPolls` polls. Spawning a phase while the task count is at
// the limit fails with EAGAIN, exactly as the first Fly run saw for the CPU workers.
function fakeKernel({ baseline = 14, reapPolls = 5, neverReaps = false } = {}) {
  let clock = 0, current = baseline, reaping = 0;
  const events = [];
  const cpuStat = { nr_periods: 0, nr_throttled: 0, throttled_time: 0 };
  return {
    events,
    now: () => clock,
    sleep: async ms => { clock += ms; if (reaping > 0 && !neverReaps) { reaping--; current = reaping ? Math.max(baseline, current - 300) : baseline; } },
    pidsCurrent: () => { events.push(`read ${current}`); return current; },
    cpuStat: () => ({ ...cpuStat }),
    runPhase: async name => {
      if (current >= 1024) { events.push(`spawn ${name}: EAGAIN`); return { error: 'EAGAIN' }; }
      events.push(`phase ${name}`);
      if (name === 'pids') { current = 1024; reaping = reapPolls; return { code: 0, signal: null, out: { started: 1009, refused: 'EAGAIN', same_groups: true } }; }
      if (name === 'cpu') { Object.assign(cpuStat, { nr_periods: 30, nr_throttled: 12, throttled_time: 600000000 }); return { code: 0, signal: null, out: { workers: 2 } }; }
      return { code: null, signal: 'SIGKILL', out: null }; // memory: the 4 GiB allocation is OOM-killed
    },
  };
}

test('the PID phase hits the limit (EAGAIN is recorded as evidence) and the probe waits for pids.current to settle before the CPU phase', async () => {
  const k = fakeKernel();
  const r = await runResourceProbe(k);
  assert.equal(r.processes.refused, 'EAGAIN');
  assert.equal(r.processes.started, 1009);
  assert.equal(r.processes.settled.ok, true);
  assert.ok(r.processes.settled.waited_ms > 0, 'it really waited for the reaping');
  // The CPU phase started only after a read at or under baseline + slack.
  const cpuAt = k.events.indexOf('phase cpu');
  const lastRead = k.events.slice(0, cpuAt).filter(e => e.startsWith('read ')).at(-1);
  assert.ok(Number(lastRead.split(' ')[1]) <= 14 + BASELINE_SLACK, lastRead);
  assert.ok(!k.events.includes('spawn cpu: EAGAIN'));
});

test('CPU throttling is measured across the CPU phase and the memory phase still runs after the others', async () => {
  const k = fakeKernel();
  const r = await runResourceProbe(k);
  assert.deepEqual([r.cpu.periods, r.cpu.throttled_periods, r.cpu.throttled_time_us], [30, 12, 600000]);
  assert.equal(r.memory.signal, 'SIGKILL');
  assert.equal(r.memory.allocated, false);
  assert.deepEqual(k.events.filter(e => e.startsWith('phase ')), ['phase pids', 'phase cpu', 'phase memory']);
});

test('regression: starting the next phase without settling reproduces the old EAGAIN; the probe turns it into an explicit failure, never a crash', async () => {
  // The old sequence: the CPU workers spawned straight after the PID storm.
  const k = fakeKernel();
  await k.runPhase('pids');
  assert.deepEqual(await k.runPhase('cpu'), { error: 'EAGAIN' });
  // A phase that cannot start is a ProbeError naming the phase, not an unhandled 'error' event.
  const blocked = { ...fakeKernel(), runPhase: async name => (name === 'pids' ? { code: 0, out: { started: 1, refused: 'EAGAIN' } } : { error: 'EAGAIN' }) };
  await assert.rejects(runResourceProbe(blocked), e => e instanceof ProbeError && /cpu phase could not start: EAGAIN/.test(e.message));
});

test('if the task count never returns to the baseline, the probe fails explicitly within its bounded window', async () => {
  const k = fakeKernel({ neverReaps: true });
  await assert.rejects(runResourceProbe({ ...k, settleMs: 2000 }), e => e instanceof ProbeError && /after the pids phase pids.current stayed at 1024 \(baseline 14, allowed 22\) for 2000 ms/.test(e.message));
  assert.ok(!k.events.includes('phase cpu'));
});

test('waitForPidBaseline polls the kernel value, not a fixed sleep', async () => {
  let clock = 0;
  const values = [900, 400, 40, 20];
  const r = await waitForPidBaseline({ read: () => values.shift() ?? 20, expectedMax: 22, timeoutMs: 5000, sleep: async ms => { clock += ms; }, now: () => clock });
  assert.deepEqual([r.ok, r.current, r.waited_ms], [true, 20, 300]);
});
