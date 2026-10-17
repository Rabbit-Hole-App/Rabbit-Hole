// Proof driver for the deployed dev converter, run from a workstation through `fly proxy` to the
// harness machine (proof/harness.mjs) in the same Fly app. Each scenario prints one JSON line;
// outputs are downloaded and validated here (PDF pages, PNG size, GLB with the canvas viewer's
// inspectGlb, MP4/AAC boxes, sha256 against the manifest). Scenarios:
//   paths      one fixture per converter path (+ DOCX, an inch STEP), validated
//   busy       three slow jobs at once on two slots -> the third gets 429
//   cancel     cancel mid-conversion -> cancelled, nothing committed, workspace gone
//   crash      SIGKILL the conversion child mid-job (flyctl ssh) -> converter_crashed (retryable) -> attempt 2 commits
//   machine    SIGKILL-stop the converter machine mid-job, start it -> no commit for attempt 1, no workspace left, attempt 2 commits
//   idle       wait for the idle self-stop, then time a cold start
//
//   HARNESS_URL=http://127.0.0.1:19090 HARNESS_TOKEN_FILE=C:/s/convert-secrets/harness-admin-token node proof/run-proofs.mjs paths busy ...
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inspectGlb } from '../../web/src/three-d-asset.js';

const H = process.env.HARNESS_URL || 'http://127.0.0.1:19090';
const ADMIN = readFileSync(process.env.HARNESS_TOKEN_FILE || 'C:/s/convert-secrets/harness-admin-token', 'utf8').trim();
const APP = 'rabbit-hole-convert-dev';
// 10 minutes of 48 kHz mono PCM (57.6 MB): a ~20-30 s conversion to interrupt.
const LONG_WAV = 'synth:wav:600:48000:1';
const RUN = process.env.RUN_ID || Date.now().toString(36);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => createHash('sha256').update(b).digest('hex');
const admin = (path, body) => fetch(H + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const aj = async (path, body) => (await admin(path, body)).json();
const print = (scenario, o) => console.log(JSON.stringify({ scenario, ...o }));
const fly = args => spawnSync('flyctl', args, { encoding: 'utf8', env: process.env });
const machineId = () => JSON.parse(fly(['machine', 'list', '-a', APP, '--json']).stdout).find(m => m.config?.metadata?.fly_process_group === 'app')?.id;
const status = (id, n) => aj('/admin/converter/raw', { method: 'GET', path: `/jobs/${id}/${n}`, token: 'service' });

async function until(id, done, ms = 240000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) { const j = await aj(`/admin/jobs/${id}`); if (done(j)) return j; }
  throw new Error(`${id} did not settle`);
}
const settled = j => j.committed || j.state === 'failed';
async function create(id, converter, fixture, options = {}) { return aj('/admin/jobs', { job_id: id, converter, fixture, options }); }
async function dispatch(id, attempt) { return aj(`/admin/jobs/${id}/dispatch`, attempt ? { attempt } : {}); }

function validate(name, body, meta) {
  if (name.endsWith('.pdf')) {
    if (body.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${name} is not a PDF`);
    const pages = (body.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    return { pdf_pages_seen: pages };
  }
  if (name.endsWith('.png')) {
    if (body.readUInt32BE(0) !== 0x89504e47) throw new Error(`${name} is not a PNG`);
    return { png: [body.readUInt32BE(16), body.readUInt32BE(20)] };
  }
  if (name.endsWith('.glb')) {
    const json = inspectGlb(body.buffer.slice(body.byteOffset, body.byteOffset + body.length));
    return { glb_nodes: json.nodes.length, glb_meshes: json.meshes.length, glb_materials: json.materials.length, source_unit: json.asset.extras?.source_unit };
  }
  if (name.endsWith('.m4a')) {
    if (body.subarray(4, 8).toString() !== 'ftyp' || body.indexOf('mp4a') < 0 || body.indexOf('moov') > body.indexOf('mdat')) throw new Error(`${name} is not faststart AAC-in-MP4`);
    return { mp4: 'ftyp+moov before mdat+mp4a', ...meta };
  }
  if (name.endsWith('.json')) return { json_keys: Object.keys(JSON.parse(body.toString('utf8'))) };
  return {};
}

async function oneJob(scenario, id, converter, fixture, options, check) {
  await create(id, converter, fixture, options);
  const t0 = Date.now();
  const d = await dispatch(id);
  const j = await until(id, settled);
  const wall_ms = Date.now() - t0;
  if (!j.committed) return print(scenario, { id, converter, fixture, ok: false, dispatch: d, state: j.state, error: j.error });
  const st = await status(id, 1);
  const outputs = [];
  for (const o of j.committed.outputs) {
    const body = Buffer.from(await (await admin(`/admin/jobs/${id}/out/${o.name}`)).arrayBuffer());
    if (sha(body) !== o.sha256) throw new Error(`${id} ${o.name} sha256 differs from the manifest`);
    outputs.push({ name: o.name, bytes: o.bytes, ...validate(o.name, body, o.meta), meta: o.meta });
    if (check && o.name === 'text.json') check(JSON.parse(body.toString('utf8')));
  }
  print(scenario, { id, converter, fixture, ok: true, dispatch_status: d.status, dispatch_ms: d.ms, wall_ms, metrics: j.committed.metrics, limitations: j.committed.limitations, coverage: j.committed.coverage,
    converter_version: j.committed.converter_version, memory_peak_bytes: st.body?.resources?.memory_peak, memory_limit_bytes: st.body?.resources?.memory_bytes, cpu_quota: st.body?.resources?.cpu_quota,
    cleanup_ok: st.body?.resources?.cleanup?.ok, sandbox: st.body?.sandbox && { uid: st.body.sandbox.uid, network: st.body.sandbox.network, env_keys: st.body.sandbox.env_keys }, stages: [...new Set(j.events.filter(e => e.type === 'progress').map(e => e.stage))], outputs });
}

const scenarios = {
  async paths() {
    await oneJob('paths', `doc-${RUN}`, 'office-pdf', 'sample.doc', {}, t => { if (t.v !== 1 || t.complete !== true || !t.units.some(u => u.loc.page === 1 && /field notes/.test(u.text)) || !t.units.some(u => u.loc.page === 2 && /Second page/.test(u.text))) throw new Error('DOC text units wrong'); });
    await oneJob('paths', `docx-${RUN}`, 'office-pdf', 'sample.docx', {});
    await oneJob('paths', `pptx-${RUN}`, 'slides', 'sample.pptx', {}, t => { const notes = t.units.find(u => u.loc.slide === 2 && u.loc.notes); const hidden = t.units.find(u => u.loc.slide === 3 && !u.loc.notes); if (t.v !== 1 || t.complete !== true || notes?.text !== 'Speaker notes for slide two' || !/^\[Hidden slide\]/.test(hidden?.text || '')) throw new Error('PPTX text units wrong'); });
    await oneJob('paths', `wav-${RUN}`, 'audio-playback', 'synth:wav:5:44100:2', {});
    await oneJob('paths', `step-${RUN}`, 'step-glb', 'as1-oc-214.stp', {});
    await oneJob('paths', `stepin-${RUN}`, 'step-glb', 'cube-in.step', {});
  },
  async busy() {
    const ids = [0, 1, 2].map(i => `busy${i}-${RUN}`);
    for (const id of ids) await create(id, 'slides', 'deck-40.pptx');
    const answers = await Promise.all(ids.map(id => dispatch(id)));
    print('busy', { statuses: answers.map(a => a.status), third: answers.find(a => a.status === 429)?.body });
    const done = await Promise.all(ids.filter((_, i) => answers[i].status === 202).map(id => until(id, settled)));
    print('busy', { finished: done.map(j => ({ id: j.job_id, committed: !!j.committed, wall_ms: j.committed?.metrics && (j.committed.metrics.fetch_ms + j.committed.metrics.convert_ms + j.committed.metrics.upload_ms), memory_peak_bytes: j.committed?.metrics?.memory_peak_bytes })) });
  },
  async cancel() {
    const id = `cancel-${RUN}`;
    await create(id, 'slides', 'deck-40.pptx');
    await dispatch(id);
    await until(id, j => j.stage === 'converting');
    await sleep(1500);
    const c = await aj(`/admin/jobs/${id}/cancel`, {});
    const j = await until(id, settled);
    const h = (await aj('/admin/converter/health')).health;
    print('cancel', { cancel: c, state: j.state, error: j.error, committed: j.committed, staged: j.staged, workspace_entries: h.workspace_entries, active: h.active });
  },
  async crash() {
    const id = `crash-${RUN}`;
    await create(id, 'audio-playback', LONG_WAV);
    // A waiter on the converter machine (root over fly ssh) SIGKILLs the conversion child 2 s after it starts.
    const waiter = spawn('flyctl', ['ssh', 'console', '-a', APP, '--machine', machineId(), '-C',
      "sh -c 'until pgrep -f /app/child.mjs >/dev/null; do sleep 0.1; done; sleep 2; pkill -KILL -f /app/child.mjs; echo killed'"], { env: process.env });
    let waiterOut = ''; waiter.stdout.on('data', d => { waiterOut += d; }); waiter.stderr.on('data', d => { waiterOut += d; });
    await sleep(6000); // the ssh session is up before the dispatch
    await dispatch(id);
    const j1 = await until(id, settled);
    await new Promise(r => (waiter.exitCode !== null ? r() : waiter.on('exit', r)));
    print('crash', { waiter: waiterOut.trim().split(/\r?\n/).slice(-1)[0], attempt1: { state: j1.state, error: j1.error, committed: j1.committed, staged: j1.staged[1] || [] } });
    if (j1.committed) return;
    // The runner retries a retryable failure as a new attempt.
    const d2 = await dispatch(id);
    const j2 = await until(id, j => j.committed || (j.state === 'failed' && j.attempt === 2));
    const h = (await aj('/admin/converter/health')).health;
    print('crash', { attempt2_dispatch: d2.status, committed_attempt: j2.committed?.attempt, outputs: j2.committed?.outputs.map(o => [o.name, o.bytes]), staged_attempts: Object.keys(j2.staged), workspace_entries: h.workspace_entries });
  },
  async machine() {
    const id = `machine-${RUN}`;
    const m = machineId();
    await create(id, 'audio-playback', LONG_WAV);
    await dispatch(id);
    await until(id, j => j.stage === 'converting');
    await sleep(1500);
    const t0 = Date.now();
    const stop = fly(['machine', 'stop', m, '-a', APP, '--signal', 'SIGKILL', '--timeout', '1']);
    const lastBeat = () => aj(`/admin/jobs/${id}`).then(j => j.events.filter(e => e.type === 'progress').at(-1)?.t);
    const before = await lastBeat();
    await sleep(45000); // longer than two heartbeats: none arrive from a dead machine
    const j1 = await aj(`/admin/jobs/${id}`);
    print('machine', { machine: m, stop_exit: stop.status, stop_out: (stop.stdout + stop.stderr).trim().slice(-200), last_progress_before: before, last_progress_after_45s: await lastBeat(), attempt1: { state: j1.state, committed: j1.committed, staged: j1.staged[1] || [], fail_events: j1.events.filter(e => e.type === 'fail') } });
    // The runner's lease has expired: attempt 2. The dispatch goes through the Fly proxy, which starts the stopped machine.
    const t1 = Date.now();
    const d2 = await dispatch(id);
    const j2 = await until(id, j => j.committed || (j.state === 'failed' && j.attempt === 2));
    const h = (await aj('/admin/converter/health')).health;
    print('machine', { killed_for_ms: t1 - t0, attempt2_dispatch: d2.status, attempt2_dispatch_ms: d2.ms, committed_attempt: j2.committed?.attempt, outputs: j2.committed?.outputs.length, workspace_entries_after_restart: h.workspace_entries, events: j2.events.slice(-12) });
  },
  async idle() {
    const h0 = (await aj('/admin/converter/health')).health;
    const t0 = Date.now();
    let state;
    for (;;) {
      state = JSON.parse(fly(['machine', 'list', '-a', APP, '--json']).stdout).find(x => x.config?.metadata?.fly_process_group === 'app')?.state;
      if (state === 'stopped' || Date.now() - t0 > (h0.idle_stop_seconds + 120) * 1000) break;
      await sleep(10000);
    }
    const stopped_after_ms = Date.now() - t0;
    const cold = await aj('/admin/converter/health');
    const warm = await aj('/admin/converter/health');
    print('idle', { idle_stop_seconds: h0.idle_stop_seconds, state, stopped_after_ms, cold_start_health_ms: cold.ms, cold_status: cold.status, warm_health_ms: warm.ms });
  },
};

for (const name of process.argv.slice(2)) {
  try { await scenarios[name](); } catch (error) { print(name, { ok: false, error: error.message }); }
}
