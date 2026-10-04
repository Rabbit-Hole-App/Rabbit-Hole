// Proof-only resource probe (Linux service tests): push against each kernel limit inside an
// already-sandboxed job and record where the kernel stops it. Never reachable over HTTP.
//
// Each stress phase is its own subprocess, and the next phase starts only after the job's
// task count (pids.current) has polled back to its baseline, so one phase cannot exhaust the
// limit for the next (the earlier single-process probe hit EAGAIN spawning its CPU workers
// while the PID storm's sleepers were still being reaped).
//
//   pids     spawn sleepers until the kernel refuses (EAGAIN is the expected evidence), check a
//            sleeper sits in our job groups, SIGKILL every sleeper and wait for each to be reaped
//   cpu      two busy workers for 3 s against the 1.5-CPU quota, both reaped
//   memory   touch 4 GiB in this process; the 3 GiB limit with no swap must kill it
//
//   node stress-probe.mjs pids|cpu|memory     one phase, one JSON line on stdout
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pollUntil } from './resource-control.mjs';

const SELF = fileURLToPath(import.meta.url);
// pids.current may sit a few tasks above the starting count once phases have run (Node adds
// worker threads on first use); anything more means the previous phase has not been reaped.
export const BASELINE_SLACK = 8;
export const SETTLE_MS = 30000;

export class ProbeError extends Error {}

// Poll pids.current until it is back at or under expectedMax, or fail after timeoutMs.
export async function waitForPidBaseline({ read, expectedMax, timeoutMs = SETTLE_MS, sleep, now }) {
  let current = null;
  const r = await pollUntil(() => { current = read(); return current !== null && current <= expectedMax; }, { timeoutMs, intervalMs: 100, sleep, now });
  return { ok: r.ok, current, expected_max: expectedMax, waited_ms: r.waited_ms };
}

// The orchestrator. Every dependency is injected so the phase order and the settling rules are
// unit-tested; child.mjs passes the real subprocess runner and the job's cgroup files.
export async function runResourceProbe({ runPhase, pidsCurrent, cpuStat, sleep, now, slack = BASELINE_SLACK, settleMs = SETTLE_MS }) {
  const baseline = pidsCurrent();
  if (baseline === null) throw new ProbeError('pids.current is unreadable');
  const settle = async phase => {
    const w = await waitForPidBaseline({ read: pidsCurrent, expectedMax: baseline + slack, timeoutMs: settleMs, sleep, now });
    if (!w.ok) throw new ProbeError(`after the ${phase} phase pids.current stayed at ${w.current} (baseline ${baseline}, allowed ${baseline + slack}) for ${settleMs} ms`);
    return w;
  };
  const phase = async name => {
    const r = await runPhase(name);
    // Spawning the phase itself must succeed: the previous phase was settled first.
    if (r.error) throw new ProbeError(`the ${name} phase could not start: ${r.error}`);
    return r;
  };
  const pids = await phase('pids');
  if (pids.code !== 0 || !pids.out) throw new ProbeError(`the pids phase failed (${pids.signal || pids.code})`);
  const afterPids = await settle('pids');

  const before = cpuStat();
  const cpu = await phase('cpu');
  if (cpu.code !== 0 || !cpu.out?.workers) throw new ProbeError(`the cpu phase failed (${cpu.signal || cpu.code})`);
  const after = cpuStat();
  const afterCpu = await settle('cpu');

  const memory = await phase('memory');
  const afterMemory = await settle('memory');
  return {
    baseline,
    processes: { ...pids.out, settled: afterPids },
    cpu: {
      periods: after.nr_periods - before.nr_periods, throttled_periods: after.nr_throttled - before.nr_throttled,
      // throttled time is ns in cgroup v1 cpu.stat, us in v2
      throttled_time_us: after.throttled_usec !== undefined ? after.throttled_usec - before.throttled_usec : Math.round((after.throttled_time - before.throttled_time) / 1000),
      settled: afterCpu,
    },
    memory: { signal: memory.signal, status: memory.code, allocated: memory.out?.allocated === true, settled: afterMemory },
  };
}

// The real phase runner: a fresh Node subprocess per phase. A spawn failure (EAGAIN included)
// comes back as data, never as an unhandled 'error' event.
export function runPhaseProcess(name) {
  return new Promise(done => {
    let out = '';
    const p = spawn(process.execPath, [SELF, name], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', d => { out += d; });
    p.once('error', e => done({ error: e.code || e.message }));
    p.once('exit', (code, signal) => {
      let parsed = null;
      try { parsed = JSON.parse(out.trim().split('\n').at(-1)); } catch { /* killed before it printed */ }
      done({ code, signal, out: parsed });
    });
  });
}

const reaped = child => new Promise(r => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('exit', r)));

async function pidsPhase() {
  const kids = [];
  let refused = null;
  for (let i = 0; i < 1500 && !refused; i++) {
    const kid = spawn('sleep', ['60'], { stdio: 'ignore' });
    refused = await new Promise(r => { kid.once('spawn', () => r(null)); kid.once('error', e => r(e.code || e.message)); });
    if (!refused) kids.push(kid);
  }
  // Descendants stay in the job's groups: a sleeper's /proc/<pid>/cgroup equals ours.
  const own = readFileSync('/proc/self/cgroup', 'utf8');
  const sameGroups = kids.length > 0 && [kids[0], kids.at(-1)].every(k => readFileSync(`/proc/${k.pid}/cgroup`, 'utf8') === own);
  for (const k of kids) k.kill('SIGKILL');
  await Promise.all(kids.map(reaped));
  return { started: kids.length, refused, same_groups: sameGroups };
}

async function cpuPhase() {
  const busy = [1, 2].map(() => spawn(process.execPath, ['-e', 'const t = Date.now(); while (Date.now() - t < 3000);'], { stdio: 'ignore' }));
  await Promise.all(busy.map(reaped));
  return { workers: busy.length };
}

function memoryPhase() {
  const held = [];
  for (let i = 0; i < 16; i++) held.push(Buffer.alloc(256 * 1024 * 1024, 1));
  return { allocated: true, bytes: held.length * 256 * 1024 * 1024 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const phases = { pids: pidsPhase, cpu: cpuPhase, memory: memoryPhase };
  const name = process.argv[2];
  if (!phases[name]) { console.error('usage: stress-probe.mjs pids|cpu|memory'); process.exit(2); }
  console.log(JSON.stringify(await phases[name]()));
  process.exit(0);
}
