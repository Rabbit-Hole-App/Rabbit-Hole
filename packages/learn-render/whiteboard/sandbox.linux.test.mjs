// The whiteboard job in the real sandbox (roadmap v1 W1.4), inside the renderer image only, run as root like service.linux.test.mjs:
//   fly ssh console -a <renderer app> -C "sh -c 'cd /app/packages/learn-render && node --test whiteboard/sandbox.linux.test.mjs'"
// Elsewhere it skips. A whiteboard job through the production service (motion-svc, the sudo launcher, motion-render): the child's own
// sandbox report (child.mjs's breach checks) is clean, and its write probe finds the job directory the only writable path outside its private
// scratch. The job's MP3 is deliberately not audio, so the child stops at the audio check, after both proofs, without starting Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEALED } from './render.mjs';
import { requestFor, sampleManifest } from './test-requests.mjs';

const SERVER = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'motion', 'service', 'server.mjs');
const skip = !(process.platform === 'linux' && existsSync('/usr/local/sbin/motion-sandbox')) ? 'needs the Linux render image (motion-sandbox installed)'
  : process.getuid() !== 0 ? 'run as root: the test starts the service as motion-svc' : false;
const TOKEN = randomBytes(24).toString('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('a whiteboard job: no sandbox breach, and the job directory is the only writable path', { skip, timeout: 180000 }, async t => {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', NODE_ENV: 'production', MOTION_SANDBOX: 'linux', PORT: String(port), MOTION_RENDERER_TOKEN: TOKEN };
  const proc = spawn('setpriv', ['--reuid=motion-svc', '--regid=motion', '--clear-groups', '--', process.execPath, SERVER], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  t.after(() => proc.kill('SIGTERM'));
  const base = `http://127.0.0.1:${port}`, headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
  for (let i = 0; i < 100 && !(await fetch(`${base}/health`).then(r => r.ok, () => false)); i++) await sleep(100);
  const res = await fetch(`${base}/whiteboard/render`, { method: 'POST', headers, body: JSON.stringify(requestFor(sampleManifest())) });
  assert.equal(res.status, 202);
  const { render_id } = await res.json();
  let r;
  do { await sleep(1000); r = await (await fetch(`${base}/whiteboard/${render_id}`, { headers })).json(); } while (r.status === 'rendering');
  assert.equal(r.error, 'audio_mismatch', `${r.error}: ${r.detail}`);
  const { sandbox } = r;
  assert.equal(sandbox.mode, 'linux');
  assert.deepEqual(sandbox.breach, []);
  assert.match(sandbox.network, /^denied/);
  for (const p of SEALED) assert.match(sandbox.writable[p], /^(EROFS|EACCES|EPERM)$/, p);
  assert.equal(sandbox.writable['/tmp/job/out'], 'WRITABLE');
  assert.equal((await (await fetch(`${base}/health`)).json()).ok, true);
});
