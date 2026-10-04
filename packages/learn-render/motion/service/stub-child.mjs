// Test double for child.mjs (service.test.mjs only): the same job-directory protocol with no
// rendering, so the service's HTTP, limits, cleanup and environment rules test in seconds.
//   node stub-child.mjs <jobDir> ready | sleep | tree | big | crash | failed
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, mode] = process.argv.slice(2);
const out = join(dir, 'out');
mkdirSync(out, { recursive: true });
const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
const sandbox = { mode: process.env.MOTION_SANDBOX, env_keys: Object.keys(process.env).sort() };
const result = r => writeFileSync(join(out, 'result.json'), JSON.stringify({ render_id: job.render_id, sandbox, ...r }));
const ready = (finalBytes = 64) => {
  for (const [name, n] of [['final.mp4', finalBytes], ['preview.mp4', 32], ['contact-sheet.png', 16], ['poster.png', 16]]) writeFileSync(join(out, name), Buffer.alloc(n, name[0]));
  result({ status: 'ready', duration_seconds: 15, fps: 30, width: 1920, height: 1080, frame_count: 450, output_bytes: finalBytes, determinism: { identical: true }, not_a_result_field: 'dropped' });
};
const forever = () => setInterval(() => {}, 1000);

if (mode === 'ready') ready();
else if (mode === 'big') ready(2000);
else if (mode === 'failed') result({ status: 'failed', error: 'nondeterministic', detail: 'frames differ' });
else if (mode === 'crash') process.exit(3);
else if (mode === 'sleep') { writeFileSync(join(out, 'pids.json'), JSON.stringify([process.pid])); forever(); }
else if (mode === 'tree') {
  // A grandchild standing in for Chromium/ffmpeg: a timeout must not leave it behind.
  const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  writeFileSync(join(out, 'pids.json'), JSON.stringify([process.pid, grandchild.pid]));
  forever();
}
