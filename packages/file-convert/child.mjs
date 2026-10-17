// The conversion child: one already-validated attempt, inside the sandbox (convert-sandbox: its
// own user, no network, a private /tmp, the service's files hidden, /app read-only). No secrets,
// no tokens, no URLs: everything comes from <jobDir>/job.json and <jobDir>/in/source, written by
// the service. Writes <jobDir>/out/<outputs> and out/result.json, then exits 0. A non-zero exit
// means the child itself crashed.
//
//   node child.mjs <jobDir>
import { connect } from 'node:net';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { convertAudio } from './converters/audio.mjs';
import { convertDocument, convertSlides } from './converters/office.mjs';
import { ACCEPTS, sniff } from './converters/sniff.mjs';
import { stepToGlb } from './converters/step.mjs';

const dir = resolve(process.argv[2] || '');
const out = join(dir, 'out');
const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
const write = r => writeFileSync(join(out, 'result.json'), JSON.stringify(r));
const linux = process.env.CONVERT_SANDBOX === 'linux';
const OCCT_DIR = linux ? '/app/vendor/occt-import-js/dist' : process.env.CONVERT_OCCT_DIR;
const tools = (() => { try { return JSON.parse(readFileSync(new URL('./build-info.json', import.meta.url), 'utf8')).versions || {}; } catch { return {}; } })();

// What the child can reach. Inside the Linux sandbox a reachable network, root, or a visible
// service tree means the boundary is not there: refuse.
function reach() {
  return new Promise(done => {
    const s = connect({ host: '1.1.1.1', port: 443, timeout: 1500 });
    const end = v => { s.destroy(); done(v); };
    s.on('connect', () => end('reachable'));
    s.on('timeout', () => end('timeout'));
    s.on('error', e => end(e.code || 'error'));
  });
}

async function main() {
  const sandbox = { mode: linux ? 'linux' : 'none', uid: process.getuid?.() ?? null, network: await reach(), env_keys: Object.keys(process.env).sort() };
  if (linux) {
    let tree = [];
    try { tree = readdirSync('/var/convert'); } catch { /* hidden */ }
    const broken = sandbox.uid === 0 ? 'running as root' : sandbox.network === 'reachable' || sandbox.network === 'timeout' ? `network ${sandbox.network}` : tree.length ? 'service tree visible' : null;
    if (broken) return write({ status: 'failed', error: 'sandbox_failure', detail: broken, sandbox });
  }
  const bytes = readFileSync(join(dir, 'in', 'source'));
  const found = sniff(bytes);
  const accepts = ACCEPTS[job.converter];
  if (accepts && (!found || !accepts.includes(found.kind))) {
    return write({ status: 'failed', error: 'unsupported_format', detail: `${job.converter} accepts ${accepts.join(', ')}; the bytes are ${found ? found.kind : 'not a recognised format'}`, sandbox });
  }
  const work = mkdtempSync(join(tmpdir(), 'convert-'));
  const input = join(work, `source.${found?.ext || 'bin'}`);
  copyFileSync(join(dir, 'in', 'source'), input);
  const t0 = performance.now();
  let r;
  if (job.converter === 'office-pdf') r = convertDocument({ input, kind: found.kind, work, out, options: job.options });
  else if (job.converter === 'slides') r = convertSlides({ input, kind: found.kind, work, out, options: job.options });
  else if (job.converter === 'audio-playback') r = convertAudio({ input, out, options: job.options });
  else if (job.converter === 'step-glb') {
    const s = await stepToGlb(bytes, { quality: job.options?.quality || 'normal', occtDir: OCCT_DIR, version: tools['occt-import-js'] });
    writeFileSync(join(out, 'model.glb'), s.glb);
    writeFileSync(join(out, 'structure.json'), JSON.stringify(s.structure));
    const { tree, ...meta } = s.structure;
    r = { outputs: [
      { name: 'model.glb', kind: 'mesh', media_type: 'model/gltf-binary', meta },
      { name: 'structure.json', kind: 'structure', media_type: 'application/json', meta: { parts: meta.parts } },
    ], coverage: { text: 'none', structure: 'listed' }, limitations: s.limitations, metrics: { occt_read_ms: s.structure.read_ms } };
  } else return write({ status: 'failed', error: 'unsupported_format', detail: `unknown converter ${job.converter}`, sandbox });
  write({ status: 'ready', source_kind: found?.kind || null, ...r, metrics: { ...r.metrics, child_ms: Math.round(performance.now() - t0) }, sandbox });
}

main().catch(error => {
  try { mkdirSync(out, { recursive: true }); write({ status: 'failed', error: error.code && /^[a-z_]+$/.test(error.code) ? error.code : 'converter_failure', detail: String(error.message).slice(0, 500) }); }
  catch { process.exit(2); }
});
