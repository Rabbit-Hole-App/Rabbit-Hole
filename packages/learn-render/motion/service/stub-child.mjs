// Test double for child.mjs (service.test.mjs only): the same job-directory protocol with no
// rendering, so the service's HTTP, limits, cleanup and environment rules test in seconds.
//   node stub-child.mjs <jobDir> ready | sleep | tree | big | crash | failed | nolimits | oom | oom-result | dirty
// nolimits / dirty stand in for motion-sandbox's out/sandbox-exit.json on Linux. oom and
// oom-result write the record the REAL ResourceController produces (finishJob + normalize) over
// a fake cgroup v1 tree whose memory controller counted a kernel OOM kill; only the kernel is fake.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { controllerFor, detect, finishJob, normalize } from './resource-control.mjs';

const [dir, mode] = process.argv.slice(2);
const out = join(dir, 'out');
mkdirSync(out, { recursive: true });
const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
const octal = p => (statSync(p).mode & 0o7777).toString(8);
const sandbox = { mode: process.env.MOTION_SANDBOX, env_keys: Object.keys(process.env).sort(), job_modes: { dir: octal(dir), out: octal(out), input: octal(join(dir, 'job.json')) } };
const result = r => writeFileSync(join(out, 'result.json'), JSON.stringify({ render_id: job.render_id, sandbox, ...r }));
const ready = (finalBytes = 64) => {
  for (const [name, n] of [['final.mp4', finalBytes], ['preview.mp4', 32], ['contact-sheet.png', 16], ['poster.png', 16]]) writeFileSync(join(out, name), Buffer.alloc(n, name[0]));
  result({ status: 'ready', duration_seconds: 15, fps: 30, width: 1920, height: 1080, frame_count: 450, output_bytes: finalBytes, determinism: { identical: true }, not_a_result_field: 'dropped' });
};
const forever = () => setInterval(() => {}, 1000);
// motion-sandbox's exit record for a job whose memory group recorded one kernel OOM kill.
async function kernelOomRecord(exitStatus) {
  const root = join(dir, 'fake-cgroup').replaceAll('\\', '/');
  const files = {
    '/proc/mounts': ['memory', 'pids', 'cpu,cpuacct', 'freezer'].map(c => `cgroup /sys/fs/cgroup/${c} cgroup rw,nosuid,nodev,noexec,relatime,${c} 0 0`).join('\n'),
    '/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes': '9223372036854771712',
  };
  for (const [p, text] of Object.entries(files)) { mkdirSync(dirname(root + p), { recursive: true }); writeFileSync(root + p, text); }
  const fakeFs = { ...fs, rmdirSync: p => rmSync(p, { recursive: true, force: true }) };
  const d = detect({ fs: fakeFs, root }), ctl = controllerFor(d, { fs: fakeFs, root });
  ctl.create(job.render_id);
  writeFileSync(`${root}/sys/fs/cgroup/memory/motion/${job.render_id}/memory.oom_control`, 'oom_kill_disable 0\nunder_oom 0\noom_kill 1');
  const { stats, cleanup } = await finishJob(ctl, job.render_id, { renderProcs: () => [], kill: () => {}, sleep: async () => {} });
  return { exit_status: exitStatus, ...normalize(d.backend, stats), controllers: d.controllers, cleanup };
}

if (mode === 'ready') ready();
else if (mode === 'big') ready(2000);
else if (mode === 'failed') result({ status: 'failed', error: 'nondeterministic', detail: 'frames differ' });
else if (mode === 'crash') process.exit(3);
else if (mode === 'nolimits') {
  writeFileSync(join(out, 'sandbox-exit.json'), JSON.stringify({ error: 'resource_limits_unavailable', detail: 'the memory cgroup controller is not available' }));
  process.exit(70);
} else if (mode === 'dirty') {
  ready();
  writeFileSync(join(out, 'sandbox-exit.json'), JSON.stringify({ exit_status: 0, backend: 'cgroup-v1', cleanup: { freezer: 'used', terminated: 1, killed: 1, remaining: 1, groups_removed: false, render_user_processes: 1, ok: false } }));
} else if (mode === 'oom' || mode === 'oom-result') {
  writeFileSync(join(out, 'sandbox-exit.json'), JSON.stringify(await kernelOomRecord(mode === 'oom' ? 137 : 0)));
  // oom: the kernel killed the child itself, so there is no result. oom-result: it killed the
  // biggest process (Chromium), and the child reported the broken render.
  if (mode === 'oom') process.exit(137);
  result({ status: 'failed', error: 'renderer_failure', detail: 'Target closed (the browser process was killed)' });
}
else if (mode === 'sleep') { writeFileSync(join(out, 'pids.json'), JSON.stringify([process.pid])); forever(); }
else if (mode === 'tree') {
  // A grandchild standing in for Chromium/ffmpeg: a timeout must not leave it behind.
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  writeFileSync(join(out, 'pids.json'), JSON.stringify([process.pid, grandchild.pid]));
  forever();
}
