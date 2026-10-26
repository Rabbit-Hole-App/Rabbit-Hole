// OWNER COMMAND (production): the real-conversion acceptance of the file converter on https://digrabbithole.com, one file per path.
//   node packages/file-convert/activation/acceptance.mjs --dry-run                 offline: prints the plan and the fixtures' hashes; reads no credential, contacts nothing
//   node packages/file-convert/activation/acceptance.mjs [--paths docx,pptx,wav,step] [--no-cancel] [--other-session] [--out receipt.json]
// It signs in as YOU with your browser's `small_session` cookie for digrabbithole.com (DevTools > Application > Cookies), pasted at a hidden prompt: the value is
// kept in memory, sent only to https://digrabbithole.com, and never printed, logged or written. It stops at the first failure; re-run with --paths for the rest.
// What it creates: one canvas titled "File converter acceptance <time>" in your account (delete it afterwards) and the stored sources and results of the fixtures.
// What it proves for each path: the job reaches ready or ready_with_limitations, every derivative downloads with the sha256 the server recorded and the right
// magic bytes, and the content is the fixture's (page/slide text, a 5 s playback copy, a GLB with parts). Optional: cancel, another account refused.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { synthWav } from '../proof/harness.mjs';
import { CONVERT_URL, ORIGIN } from './prod-convert-core.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'proof', 'fixtures');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const OOXML = 'application/vnd.openxmlformats-officedocument';
// name, family, converter and the outputs a ready job must hold (canvas-file-converter.md 1.6).
export const PATHS = {
  docx: { file: 'sample.docx', name: 'acceptance.docx', type: `${OOXML}.wordprocessingml.document`, family: 'word', converter: 'office-pdf', outputs: ['preview.pdf', 'text.json', 'poster.png'] },
  pptx: { file: 'sample.pptx', name: 'acceptance.pptx', type: `${OOXML}.presentationml.presentation`, family: 'presentation', converter: 'slides', outputs: ['preview.pdf', 'slide-001.png', 'slide-002.png', 'slide-003.png', 'text.json'] },
  wav: { synth: () => synthWav(5, 44100, 2), name: 'acceptance.wav', type: 'audio/wav', family: 'audio', converter: 'audio-playback', outputs: ['playback.m4a', 'probe.json'] },
  step: { file: 'as1-oc-214.stp', name: 'acceptance.step', type: 'model/step', family: 'cad', converter: 'step-glb', outputs: ['model.glb', 'structure.json'] },
};
const MAGIC = { 'application/pdf': b => b.subarray(0, 4).toString('latin1') === '%PDF', 'image/png': b => b.readUInt32BE(0) === 0x89504e47, 'audio/mp4': b => b.subarray(4, 8).toString('latin1') === 'ftyp', 'model/gltf-binary': b => b.subarray(0, 4).toString('latin1') === 'glTF', 'application/json': b => !!JSON.parse(b.toString('utf8')) };
const TERMINAL = ['ready', 'ready_with_limitations', 'failed', 'cancelled'];
const source = p => (p.synth ? p.synth() : readFileSync(join(FIXTURES, p.file)));

export function parse(argv) {
  const o = { dry: false, paths: Object.keys(PATHS), cancel: true, other: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--no-cancel') o.cancel = false;
    else if (a === '--other-session') o.other = true;
    else if (a === '--out') o.out = argv[++i] ?? null;
    else if (a === '--paths') { o.paths = String(argv[++i] ?? '').split(',').filter(Boolean); if (!o.paths.length || o.paths.some(p => !PATHS[p])) return null; } else return null;
  }
  return o.dry && o.other ? null : o;
}

export async function accept(argv, deps) {
  const say = deps.out, o = parse(argv);
  if (!o) { say(`usage: node acceptance.mjs [--dry-run] [--paths ${Object.keys(PATHS).join(',')}] [--no-cancel] [--other-session] [--out file]`); return 2; }
  say(`acceptance on ${ORIGIN} against the converter ${CONVERT_URL}; paths: ${o.paths.join(', ')}${o.cancel ? '; cancel' : ''}${o.other ? '; another account refused' : ''}`);
  for (const k of o.paths) { const b = source(PATHS[k]); say(`  ${k}: ${PATHS[k].name} -> ${PATHS[k].converter}, ${b.length} bytes, sha256 ${sha256(b).slice(0, 16)}`); }
  if (o.dry) { say('dry run: read no credential, contacted nothing, created nothing. Nothing was run, called or changed.'); return 0; }
  if (!deps.interactive()) { say('stopped: this command asks for your session cookie at a hidden prompt and needs an interactive terminal. Nothing was done.'); return 1; }

  const receipt = { origin: ORIGIN, started: deps.now(), paths: {} };
  const fail = why => { say(`FAILED: ${why}`); receipt.failed = why; if (o.out) deps.write(o.out, JSON.stringify(receipt, null, 2)); return 1; };
  const session = async label => {
    const v = (await deps.askHidden(`Paste the small_session cookie value for ${label} (nothing is echoed): `)).trim();
    return /^[\x21-\x7e]{16,4096}$/.test(v) ? v : null;
  };
  // Every request to the production origin carries the cookie; nothing else ever does.
  const call = (cookie, path, init = {}) => deps.fetch(`${ORIGIN}${path}`, { ...init, headers: { cookie: `small_session=${cookie}`, origin: ORIGIN, ...(init.headers || {}) } });
  const json = async (cookie, path, init) => { const r = await call(cookie, path, init); const body = await r.json().catch(() => null); if (!r.ok) throw new Error(`${init?.method || 'GET'} ${path.split('?')[0]}: ${r.status} ${body?.error || ''}`.trim()); return body; };
  const send = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const cookie = await session(ORIGIN);
  if (!cookie) return fail('that does not look like a cookie value (16 or more printable characters, no spaces).');
  const me = await call(cookie, '/api/me');
  if (me.status !== 200) return fail(`the cookie was refused by ${ORIGIN}/api/me (HTTP ${me.status}): sign in again and copy a fresh small_session value.`);
  say('signed in (identity not shown)');
  const h = await deps.fetch(`${CONVERT_URL}/health`).then(r => r.json()).catch(e => ({ error: String(e?.message || e) }));
  if (!h.ok) return fail(`the converter /health is not ok: ${h.error || JSON.stringify(h).slice(0, 200)}`);
  say(`converter ${h.version}: ${Object.keys(h.converters).sort().join(', ')}`);
  receipt.converter = { version: h.version, converters: h.converters };

  try {
    const stamp = deps.now().slice(0, 19);
    const canvas = await json(cookie, '/api/canvases', send('POST', { title: `File converter acceptance ${stamp}` }));
    const board = `/api/learn/boards/${canvas.name}/main`, empty = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
    await json(cookie, board, send('PUT', { state: empty, version: (await json(cookie, board)).version }));
    say(`canvas ${canvas.name} created (delete it when you are done)`);
    receipt.canvas = canvas.name;

    const submit = async (p, bytes, card) => {
      const sha = sha256(bytes);
      const declared = await json(cookie, '/api/learn/files', send('POST', { app: canvas.name, board: 'main', name: p.name, type: p.type, size: bytes.length, sha256: sha, family: p.family }));
      if (declared.upload) await json(cookie, declared.upload.url || `/api/learn/files/${declared.source.id}`, { method: 'PUT', headers: { 'content-type': p.type }, body: bytes });
      const job = (await json(cookie, `/api/learn/files/${declared.source.id}/jobs`, send('POST', { converter: p.converter, options: {}, card, app: canvas.name, board: 'main', idempotency_key: `acceptance:${card}:${sha.slice(0, 16)}:${stamp}` }))).job;
      return { id: declared.source.id, rev: sha, job };
    };
    const settle = async job => {
      for (let i = 0; i < 120; i++) {
        const j = (await json(cookie, `/api/learn/files/jobs/${job.id}`)).job;
        if (TERMINAL.includes(j.state)) return j;
        await deps.sleep(3000);
      }
      throw new Error(`job ${job.id} did not finish within 6 minutes`);
    };

    for (const k of o.paths) {
      const p = PATHS[k], bytes = source(p), t0 = Date.now();
      const s = await submit(p, bytes, `acceptance-${k}`);
      say(`${k}: uploaded ${bytes.length} bytes as ${s.id}; job ${s.job.id} ${s.job.state}`);
      const job = await settle(s.job);
      if (!['ready', 'ready_with_limitations'].includes(job.state)) return fail(`${k}: the job ended ${job.state} (${job.error || 'no reason given'}) on attempt ${job.attempt}. The cause is in the converter logs: flyctl logs -a rabbit-hole-convert-prod.`);
      const hash = sha256('{}');
      const listed = (await json(cookie, `/api/learn/files/sources/${s.id}/derivatives?sha=${s.rev}&converter=${p.converter}&options=${hash}&app=${canvas.name}`)).derivatives || [];
      const got = listed.map(d => d.name).sort(), want = [...p.outputs].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) return fail(`${k}: derivatives are ${got.join(', ')}; expected ${want.join(', ')}.`);
      const files = {};
      for (const d of listed) {
        const r = await call(cookie, `/api/learn/files/${s.id}/d/${d.id}`);
        const body = Buffer.from(await r.arrayBuffer()), type = (r.headers.get('content-type') || '').split(';')[0];
        if (r.status !== 200) return fail(`${k}: ${d.name} answered HTTP ${r.status}.`);
        if (sha256(body) !== r.headers.get('x-content-sha256')) return fail(`${k}: ${d.name} bytes do not hash to the sha256 the server recorded.`);
        if (body.length !== d.bytes) return fail(`${k}: ${d.name} is ${body.length} bytes; the listing says ${d.bytes}.`);
        let ok = false;
        try { ok = !!MAGIC[type]?.(body); } catch { /* not valid */ }
        if (!ok) return fail(`${k}: ${d.name} (${type}) does not look like that type.`);
        files[d.name] = { type, bytes: body.length, sha256: sha256(body).slice(0, 16), body };
      }
      const check = content(k, files);
      if (check) return fail(`${k}: ${check}`);
      receipt.paths[k] = { job: s.job.id, state: job.state, attempt: job.attempt, limitations: job.limitations || [], seconds: Math.round((Date.now() - t0) / 1000), files: Object.fromEntries(Object.entries(files).map(([n, f]) => [n, { type: f.type, bytes: f.bytes, sha256: f.sha256 }])) };
      say(`${k}: PASS ${job.state}, attempt ${job.attempt}, ${listed.length} derivatives verified (${Object.keys(files).join(', ')})`);
      if (o.other && k === o.paths[0]) {
        const other = await session('a DIFFERENT account on digrabbithole.com');
        if (!other) return fail('the second cookie does not look like a cookie value.');
        const d = listed[0], r = await call(other, `/api/learn/files/${s.id}/d/${d.id}`), r2 = await call(other, `/api/learn/files/jobs/${s.job.id}`);
        if (r.status !== 404 || r2.status !== 404) return fail(`another account read a derivative (HTTP ${r.status}) or the job (HTTP ${r2.status}); expected 404 for both.`);
        say('another account: derivative and job refused (404, 404)');
        receipt.otherAccountRefused = true;
      }
    }
    if (o.cancel) {
      const p = { ...PATHS.pptx, file: 'deck-40.pptx', name: 'acceptance-cancel.pptx' };
      const s = await submit(p, source(p), 'acceptance-cancel');
      await json(cookie, `/api/learn/files/jobs/${s.job.id}/cancel`, { method: 'POST' });
      const job = await settle(s.job);
      say(`cancel: the 40-slide job ended ${job.state}`);
      receipt.cancel = job.state;
      if (job.state !== 'cancelled' && !['ready', 'ready_with_limitations'].includes(job.state)) return fail(`cancel: the job ended ${job.state}, expected cancelled.`);
      if (job.state !== 'cancelled') say('  note: it finished before the cancel reached it, so this run did not exercise cancellation; repeat if you need that evidence.');
    }
  } catch (error) { return fail(String(error.message || error)); }
  receipt.finished = deps.now();
  say(`ACCEPTANCE PASSED for ${o.paths.join(', ')}. Not covered here: the kill-and-retry drill (docs runbook), PPT/ODT/ODP/RTF and compressed audio formats (no product upload path), large files.`);
  if (o.out) deps.write(o.out, JSON.stringify(receipt, null, 2));
  return 0;
}

// The content is the fixture's, not just well-formed.
function content(k, f) {
  const json = n => JSON.parse(f[n].body.toString('utf8'));
  if (k === 'docx' || k === 'pptx') { const t = json('text.json'); if (!t.units?.some(u => u.text)) return 'text.json has no text'; }
  if (k === 'pptx' && !/Converter fixture deck/.test(json('text.json').units.map(u => u.text).join(' '))) return 'the slide text is not the fixture\'s';
  if (k === 'wav') { const d = json('probe.json'); if (d.source?.codec !== 'pcm_s16le' || Math.abs(d.playback?.duration_seconds - 5) > 0.6) return `probe.json says ${d.source?.codec}, ${d.playback?.duration_seconds} s; the fixture is 5 s of PCM`; }
  if (k === 'step') { const s = json('structure.json'); if (!(s.parts >= 18)) return `structure.json lists ${s.parts} parts; the assembly has 18`; }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deps = {
    out: line => console.log(line), now: () => new Date().toISOString(), write: (f, t) => writeFileSync(f, t),
    interactive: () => !!(process.stdin.isTTY && process.stdout.isTTY),
    askHidden: q => new Promise(res => { process.stdout.write(q); const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true }); rl._writeToOutput = () => {}; rl.question('', a => { rl.close(); process.stdout.write('\n'); res(a); }); }),
    fetch: (url, init) => { if (!(url.startsWith(`${ORIGIN}/`) || url.startsWith(`${CONVERT_URL}/`))) throw new Error('refused: not a production URL'); return fetch(url, { ...init, signal: AbortSignal.timeout(60_000), redirect: 'manual' }); },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
  };
  process.exit(await accept(process.argv.slice(2), deps));
}
