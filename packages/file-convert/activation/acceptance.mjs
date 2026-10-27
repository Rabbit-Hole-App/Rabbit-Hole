// OWNER COMMAND (production): the real-conversion acceptance of the file converter on https://digrabbithole.com.
//   node packages/file-convert/activation/acceptance.mjs --dry-run              offline: the criteria table and the fixtures' hashes; reads no credential, contacts nothing
//   node packages/file-convert/activation/acceptance.mjs --full --out receipt.json     everything below (needs a second account's cookie and the Fly org token)
//   node packages/file-convert/activation/acceptance.mjs [--paths docx,pptx,...] [--no-cancel] [--other-session] [--retry-drill] [--out receipt.json]
// It signs in as YOU with your browser's `small_session` cookie for digrabbithole.com (DevTools > Application > Cookies), pasted at a hidden prompt: the value is
// kept in memory, sent only to https://digrabbithole.com, and never printed, logged or written. It stops at the first failure and names it; re-run with --paths for the rest.
// It creates one canvas titled "File converter acceptance <time>" in your account (delete it afterwards) and the stored sources and results of the fixtures.
// Every request uses the options the product's own code uses (a unit test pins them to web/src/file-job.js, media-playback.js and model-cad.js), so the
// derivatives it finds are the ones a card would show. The last line says COMPLETE only when every criterion in the table passed; anything else is PARTIAL
// and names what did not run. A converter that is not live on the origin cannot pass: the script never reports a criterion it did not check.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONVERT_URL, FLY_APP, FLY_NAME, ORIGIN, readByName } from './prod-convert-core.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'proof', 'fixtures');
const sha256 = b => createHash('sha256').update(b).digest('hex');
const canonical = o => JSON.stringify(o, Object.keys(o).sort());
const OOXML = 'application/vnd.openxmlformats-officedocument';
export const UI = { doc: { poster: true }, pptx: { width: 1280 }, audio: { bitrate_kbps: 128 }, step: {} }; // pinned to the web modules by acceptance.test.mjs

const audio = (id, file, type, source, extra = {}) => ({ file, name: `acceptance-${id}.${file.split('.').pop()}`, type, family: 'audio', converter: 'audio-playback', options: UI.audio, outputs: ['playback.m4a', 'probe.json'],
  criterion: `playback.m4a is AAC in MP4 with moov before mdat; probe.json names the source codec ${source}; playback length within 10% (or 0.15 s) of the source's`, source, ...extra });
// id -> fixture, what is uploaded, the converter and options the product submits, the outputs a ready job holds, and the pass criterion (checked in `content`).
export const PATHS = {
  docx: { file: 'sample.docx', name: 'acceptance.docx', type: `${OOXML}.wordprocessingml.document`, family: 'word', converter: 'office-pdf', options: UI.doc, outputs: ['preview.pdf', 'text.json', 'poster.png'],
    criterion: 'preview.pdf is a PDF; text.json has page 1 and page 2 and the fixture\'s heading and "Second page text"; poster.png is 800 px wide' },
  pptx: { file: 'sample.pptx', name: 'acceptance.pptx', type: `${OOXML}.presentationml.presentation`, family: 'presentation', converter: 'slides', options: UI.pptx, outputs: ['preview.pdf', 'slide-001.png', 'slide-002.png', 'slide-003.png', 'text.json'],
    criterion: '3 slide images of 1280x720; text.json has the deck title, slide 2\'s speaker notes and slide 3 marked [Hidden slide]' },
  wav: audio('wav', 'tone-pcm.wav', 'audio/wav', 'pcm_s16le', { synth: true }),
  adpcm: audio('adpcm', 'tone-adpcm.wav', 'audio/wav', 'adpcm_ima_wav'),
  mp3: audio('mp3', 'tone.mp3', 'audio/mpeg', 'mp3'),
  ogg: audio('ogg', 'tone-vorbis.ogg', 'audio/ogg', 'vorbis'),
  opus: audio('opus', 'tone-opus.ogg', 'audio/ogg', 'opus'),
  m4a: audio('m4a', 'tone-aac.m4a', 'audio/mp4', 'aac'),
  alac: audio('alac', 'tone-alac.m4a', 'audio/mp4', 'alac'),
  flac: audio('flac', 'tone.flac', 'audio/flac', 'flac'),
  step: { file: 'as1-oc-214.stp', name: 'acceptance-assembly.step', type: 'model/step', family: 'cad', converter: 'step-glb', options: UI.step, outputs: ['model.glb', 'structure.json'], parts: 18, unit: 'millimetre',
    criterion: 'model.glb is a valid GLB 2.0 whose length matches; structure.json lists 18 parts in millimetres' },
  stp: { file: 'cube-in.step', name: 'acceptance-part.stp', type: 'model/step', family: 'cad', converter: 'step-glb', options: UI.step, outputs: ['model.glb', 'structure.json'], parts: 1, unit: 'inch',
    criterion: 'model.glb is a valid GLB 2.0 whose length matches; structure.json lists 1 part and its declared unit, inch' },
};
// A deterministic 3 s PCM WAV.
function wavBytes() {
  const rate = 44100, n = rate * 3, data = Buffer.alloc(n * 4), h = Buffer.alloc(44);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (440 + 220 * c) * i / rate) * 12000), (i * 2 + c) * 2);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const source = p => (p.synth ? wavBytes() : readFileSync(join(FIXTURES, p.file)));
export const SCENARIOS = {
  usage: 'a conversion changes no credit figure: usedCredits, reservedCredits and unknownAttempts equal before and after all of the above',
  duplicate: 'dropping the same file again and submitting the same key returns the same source and job (200, not a second job); a second card on the same file adds no derivative',
  reload: 'after saving a board with a card for the file (the app own PUT route), a fresh read of that board finds the card, the finished job, and the same derivatives and bytes listed and downloaded THROUGH the board (&app=<canvas>&board=main)',
  failure: 'a damaged presentation ends failed (or is refused at upload) with a plain reason, no derivative and no credit change',
  cancel: 'cancelling a 40-slide job ends cancelled (a job that finished first is reported and not counted)',
  other: 'a second account gets 404 for the job and every derivative',
  retry: 'SIGKILL of the converter machine while a job converts: the runner settles the job ready on attempt 2 or later with the same outputs',
};
export const REQUIRED = [...Object.keys(PATHS), ...Object.keys(SCENARIOS)];
const MAGIC = { 'application/pdf': b => b.subarray(0, 4).toString('latin1') === '%PDF', 'image/png': b => b.readUInt32BE(0) === 0x89504e47, 'audio/mp4': b => b.subarray(4, 8).toString('latin1') === 'ftyp', 'model/gltf-binary': b => b.subarray(0, 4).toString('latin1') === 'glTF', 'application/json': b => !!JSON.parse(b.toString('utf8')) };
const TERMINAL = ['ready', 'ready_with_limitations', 'failed', 'cancelled'];
const OK = ['ready', 'ready_with_limitations'];

export function parse(argv) {
  const o = { dry: false, paths: null, cancel: true, other: false, retry: false, full: false, out: null, trash: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--no-cancel') o.cancel = false;
    else if (a === '--other-session') o.other = true;
    else if (a === '--retry-drill') o.retry = true;
    else if (a === '--full') o.full = true;
    else if (a === '--out') o.out = argv[++i] ?? null;
    else if (a === '--trash') { o.trash = String(argv[++i] ?? '').split(',').filter(Boolean); if (!o.trash.length || o.trash.some(n => !/^canvas-[a-f0-9]{8}$/.test(n))) return null; }
    else if (a === '--paths') { o.paths = String(argv[++i] ?? '').split(',').filter(Boolean); if (!o.paths.length || o.paths.some(p => !PATHS[p])) return null; } else return null;
  }
  if (o.trash) return o.dry || o.paths || o.full || o.other || o.retry || o.out ? null : o;
  if (o.full) { if (o.paths || !o.cancel) return null; o.other = o.retry = true; }
  o.all = !o.paths;
  o.paths ||= Object.keys(PATHS);
  return o.dry && (o.other || o.retry) ? null : o;
}

// ---- the criteria that read content
const png = b => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
function glb(b) {
  if (b.length < 20 || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) return null;
  if (b.subarray(16, 20).toString('latin1') !== 'JSON') return null;
  try { return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')); } catch { return null; }
}
export function content(k, f) {
  const j = n => JSON.parse(f[n].body.toString('utf8'));
  if (k === 'docx') {
    const t = j('text.json'), by = n => t.units.find(u => u.loc?.page === n)?.text || '';
    if (!/field notes/.test(by(1)) || !/Second page text/.test(by(2))) return 'text.json does not hold the fixture\'s page 1 heading and page 2 text';
    if (png(f['poster.png'].body).w !== 800) return `poster.png is ${png(f['poster.png'].body).w} px wide, expected 800`;
  } else if (k === 'pptx') {
    const t = j('text.json').units, all = t.map(u => u.text).join('\n');
    if (!/Converter fixture deck/.test(all) || !t.some(u => u.loc?.slide === 2 && u.loc.notes && /Speaker notes for slide two/.test(u.text)) || !t.some(u => u.loc?.slide === 3 && /^\[Hidden slide\]/.test(u.text))) return 'text.json lacks the deck title, slide 2\'s notes or the hidden-slide mark on slide 3';
    for (const n of ['slide-001.png', 'slide-002.png', 'slide-003.png']) { const s = png(f[n].body); if (s.w !== 1280 || s.h !== 720) return `${n} is ${s.w}x${s.h}, expected 1280x720`; }
  } else if (PATHS[k].converter === 'audio-playback') {
    const d = j('probe.json'), m = f['playback.m4a'].body, want = PATHS[k].source;
    if (!String(d.source?.codec).startsWith(want.replace(/_ima_wav$/, ''))) return `probe.json says the source codec is ${d.source?.codec}, expected ${want}`;
    if (d.playback?.codec !== 'aac') return `the playback copy is ${d.playback?.codec}, expected aac`;
    const a = d.source.duration_seconds, b = d.playback.duration_seconds;
    if (!(a > 0.5) || Math.abs(a - b) > Math.max(0.15, a * 0.1)) return `source ${a} s, playback ${b} s: not within 10%`;
    const moov = m.indexOf('moov'), mdat = m.indexOf('mdat');
    if (moov < 0 || mdat < 0 || moov > mdat) return 'playback.m4a does not start with its index (moov before mdat): it would not play before it has downloaded';
  } else if (PATHS[k].converter === 'step-glb') {
    const g = glb(f['model.glb'].body), s = j('structure.json');
    if (!g || g.asset?.version !== '2.0' || !(g.nodes?.length >= PATHS[k].parts)) return 'model.glb is not a valid glTF 2.0 binary with the expected nodes';
    if (s.parts !== PATHS[k].parts || s.source_unit !== PATHS[k].unit) return `structure.json says ${s.parts} parts in ${s.source_unit}, expected ${PATHS[k].parts} in ${PATHS[k].unit}`;
  }
  return null;
}

export async function accept(argv, deps) {
  const say = deps.out, o = parse(argv);
  if (!o) { say(`usage: node acceptance.mjs [--dry-run | --full | [--paths ${Object.keys(PATHS).join(',')}] [--no-cancel] [--other-session] [--retry-drill]] [--out file] | --trash canvas-xxxxxxxx[,canvas-yyyyyyyy]`); return 2; }
  if (o.trash) {
    // Cleanup: move the acceptance canvases to Trash through the app's own route (POST /api/apps/<canvas>/trash); Trash keeps them until you empty it.
    if (!deps.interactive()) { say('stopped: needs an interactive terminal for the hidden cookie prompt. Nothing was done.'); return 1; }
    const v = (await deps.askHidden(`Paste the small_session cookie value for ${ORIGIN} (nothing is echoed): `)).trim();
    if (!/^[!-~]{16,4096}$/.test(v)) { say('that does not look like a cookie value.'); return 1; }
    for (const name of o.trash) {
      const r = await deps.fetch(`${ORIGIN}/api/apps/${name}/trash`, { method: 'POST', body: '{}', headers: { cookie: `small_session=${v}`, origin: ORIGIN, 'content-type': 'application/json' } });
      say(`${name}: ${r.ok ? 'moved to Trash' : `NOT moved (HTTP ${r.status})`}`);
      if (!r.ok) return 1;
    }
    return 0;
  }
  const wanted = [...o.paths, ...(o.all ? ['usage', 'duplicate', 'reload', 'failure'] : []), ...(o.cancel && o.all ? ['cancel'] : []), ...(o.other ? ['other'] : []), ...(o.retry ? ['retry'] : [])];
  say(`acceptance on ${ORIGIN} against the converter ${CONVERT_URL}`);
  say('criteria (a path passes only when the job is ready, its derivatives are exactly the listed outputs, each downloads with the sha256 the server recorded and the right magic bytes, and:)');
  for (const k of o.paths) { const b = source(PATHS[k]); say(`  ${k}: ${PATHS[k].name} (${b.length} bytes, sha256 ${sha256(b).slice(0, 16)}) -> ${PATHS[k].converter} ${canonical(PATHS[k].options)}: ${PATHS[k].criterion}`); }
  for (const k of Object.keys(SCENARIOS)) say(`  ${k}: ${SCENARIOS[k]}${wanted.includes(k) ? '' : '   [not selected in this run]'}`);
  if (o.dry) { say('dry run: read no credential, contacted nothing, created nothing. Nothing was run, called or changed.'); return 0; }
  if (!deps.interactive()) { say('stopped: this command asks for your session cookie at a hidden prompt and needs an interactive terminal. Nothing was done.'); return 1; }

  const receipt = { origin: ORIGIN, started: deps.now(), results: {}, paths: {} };
  const pass = (k, note = '') => { receipt.results[k] = 'PASS'; say(`${k}: PASS${note ? ` ${note}` : ''}`); };
  const finish = () => {
    const missing = REQUIRED.filter(k => receipt.results[k] !== 'PASS');
    receipt.finished = deps.now(); receipt.complete = !missing.length && !receipt.failed;
    if (o.out) deps.write(o.out, JSON.stringify(receipt, null, 2));
    return missing;
  };
  const fail = why => { say(`FAILED: ${why}`); receipt.failed = why; finish(); return 1; };
  const session = async label => {
    const v = (await deps.askHidden(`Paste the small_session cookie value for ${label} (nothing is echoed): `)).trim();
    return /^[\x21-\x7e]{16,4096}$/.test(v) ? v : null;
  };
  // Every request to the production origin carries the cookie; nothing else ever does.
  const call = (cookie, path, init = {}) => deps.fetch(`${ORIGIN}${path}`, { ...init, headers: { cookie: `small_session=${cookie}`, origin: ORIGIN, ...(init.headers || {}) } });
  const json = async (cookie, path, init) => { const r = await call(cookie, path, init); const body = await r.json().catch(() => null); if (!r.ok) throw new Error(`${init?.method || 'GET'} ${path.split('?')[0]}: ${r.status} ${body?.error || ''}`.trim()); return { ...body, _status: r.status }; };
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
  const credits = async () => { const r = await call(cookie, '/api/learn/usage'); const u = await r.json().catch(() => null); return r.ok && u && !u.unavailable ? JSON.stringify([u.usedCredits, u.reservedCredits, u.unknownAttempts]) : null; };
  const creditsBefore = await credits();

  try {
    const stamp = deps.now().slice(0, 19);
    const canvas = await json(cookie, '/api/canvases', send('POST', { title: `File converter acceptance ${stamp}` }));
    const board = `/api/learn/boards/${canvas.name}/main`, empty = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
    const save = async state => json(cookie, board, send('PUT', { state, version: (await json(cookie, board)).version }));
    await save(empty);
    say(`canvas ${canvas.name} created (delete it when you are done)`);
    receipt.canvas = canvas.name;

    const declare = (p, bytes) => json(cookie, '/api/learn/files', send('POST', { app: canvas.name, board: 'main', name: p.name, type: p.type, size: bytes.length, sha256: sha256(bytes), family: p.family }));
    const submit = async (p, bytes, card, key = `acceptance:${card}:${sha256(bytes).slice(0, 16)}:${stamp}`) => {
      const declared = await declare(p, bytes);
      if (declared.upload) await json(cookie, declared.upload.url || `/api/learn/files/${declared.source.id}`, { method: 'PUT', headers: { 'content-type': p.type }, body: bytes });
      const r = await json(cookie, `/api/learn/files/${declared.source.id}/jobs`, send('POST', { converter: p.converter, options: p.options, card, app: canvas.name, board: 'main', idempotency_key: key }));
      return { id: declared.source.id, rev: sha256(bytes), job: r.job, created: r.created, status: r._status, key, card };
    };
    const settle = async job => {
      for (let i = 0; i < 120; i++) {
        const j = (await json(cookie, `/api/learn/files/jobs/${job.id}`)).job;
        if (TERMINAL.includes(j.state)) return j;
        await deps.sleep(3000);
      }
      throw new Error(`job ${job.id} did not finish within 6 minutes`);
    };
    // Two ways to read your own file, and they are different checks. Owner path (no query): authorizeFileSource lets the source's owner read it with no board involved;
    // every conversion criterion uses it. Board path (&app=&board=): the board must exist AND hold a file_source_refs row for the source, which a board SAVE writes
    // when a card names the source: listing through a board that was never saved with the card answers 404 "Not available" (the first production run's failure).
    const BOARD = `app=${canvas.name}&board=main`;
    const listing = async (s, p, through = false) => ((await json(cookie, `/api/learn/files/sources/${s.id}/derivatives?sha=${s.rev}&converter=${p.converter}&options=${sha256(canonical(p.options))}${through ? `&${BOARD}` : ''}`)).derivatives || []);
    // The finished job's derivatives, each downloaded and checked; returns the files by name, or a reason.
    const collect = async (k, s, through = false) => {
      const p = PATHS[k], listed = await listing(s, p, through), got = listed.map(d => d.name).sort(), want = [...p.outputs].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) return { why: `derivatives are ${got.join(', ')}; expected ${want.join(', ')}.` };
      const files = {};
      for (const d of listed) {
        const r = await call(cookie, `/api/learn/files/${s.id}/d/${d.id}${through ? `?${BOARD}` : ''}`), body = Buffer.from(await r.arrayBuffer()), type = (r.headers.get('content-type') || '').split(';')[0];
        if (r.status !== 200) return { why: `${d.name} answered HTTP ${r.status}.` };
        if (sha256(body) !== r.headers.get('x-content-sha256')) return { why: `${d.name} bytes do not hash to the sha256 the server recorded.` };
        if (body.length !== d.bytes) return { why: `${d.name} is ${body.length} bytes; the listing says ${d.bytes}.` };
        let ok = false;
        try { ok = !!MAGIC[type]?.(body); } catch { /* not valid */ }
        if (!ok) return { why: `${d.name} (${type}) does not look like that type.` };
        files[d.name] = { type, bytes: body.length, sha256: sha256(body), body };
      }
      return { files, listed, why: content(k, files) };
    };
    const results = {};

    for (const k of o.paths) {
      const p = PATHS[k], bytes = source(p), t0 = Date.now();
      const s = await submit(p, bytes, `acceptance-${k}`);
      say(`${k}: uploaded ${bytes.length} bytes as ${s.id}; job ${s.job.id} ${s.job.state}`);
      const job = await settle(s.job);
      if (!OK.includes(job.state)) return fail(`${k}: the job ended ${job.state} (${job.error || 'no reason given'}) on attempt ${job.attempt}. The cause is in the converter logs: flyctl logs -a ${FLY_APP}.`);
      const c = await collect(k, s);
      if (c.why) return fail(`${k}: ${c.why}`);
      results[k] = { s, job, c };
      receipt.paths[k] = { job: s.job.id, state: job.state, attempt: job.attempt, limitations: job.limitations || [], seconds: Math.round((Date.now() - t0) / 1000), files: Object.fromEntries(Object.entries(c.files).map(([n, f]) => [n, { type: f.type, bytes: f.bytes, sha256: f.sha256.slice(0, 16) }])) };
      pass(k, `${job.state}, attempt ${job.attempt}, ${c.listed.length} derivatives verified (${Object.keys(c.files).join(', ')})`);
    }

    if (o.all) {
      // duplicate drop and duplicate submission, on the document that was just converted
      const k = results.docx ? 'docx' : o.paths[0], p = PATHS[k], bytes = source(p), first = results[k];
      const again = await submit(p, bytes, first.s.card, first.s.key);
      if (again.id !== first.s.id || again.job.id !== first.s.job.id || again.created !== false || again.status !== 200) return fail(`duplicate: the same file and key gave source ${again.id === first.s.id ? 'same' : 'DIFFERENT'}, job ${again.job.id === first.s.job.id ? 'same' : 'DIFFERENT'}, created=${again.created}, HTTP ${again.status}; expected the same source and job, 200.`);
      const second = await submit(p, bytes, `acceptance-${k}-second-card`);
      await settle(second.job);
      const ids = (await listing(first.s, p)).map(d => d.id).sort();
      if (second.id !== first.s.id || JSON.stringify(ids) !== JSON.stringify(first.c.listed.map(d => d.id).sort())) return fail(`duplicate: a second card on the same file changed the stored source or the derivative set (${ids.length} vs ${first.c.listed.length}).`);
      pass('duplicate', `same source and job on a repeated drop and key; a second card added no derivative (${ids.length})`);

      // reload recovery: only what the saved board holds
      const block = { id: 'acceptance-card', type: 'file', kind: 'document', dx: 0, dy: 0, w: 480, h: 320, label: p.name, fileRef: { v: 1, source: { id: first.s.id, rev: first.s.rev }, family: p.family, meta: { name: p.name, type: p.type, size: bytes.length }, job: first.s.job.id, status: { preview: 'pending', context: 'none' } } };
      await save({ ...empty, blocks: [block] });
      const saved = (await json(cookie, board)).state?.blocks?.find(b => b.id === 'acceptance-card')?.fileRef;
      if (!saved?.job || !saved.source?.id) return fail('reload: the saved board did not return the card\'s file reference.');
      const job = (await json(cookie, `/api/learn/files/jobs/${saved.job}`)).job;
      let back;
      try { back = await collect(k, { id: saved.source.id, rev: saved.source.rev }, true); } catch (e) {
        return fail(`reload: reading through the saved board failed (${e.message}). A 404 here means the board has no row or does not reference the file; the card was saved with the app's own PUT, so this is a server fault to report.`);
      }
      const same = Object.keys(first.c.files).every(n => back.files?.[n]?.sha256 === first.c.files[n].sha256);
      if (!OK.includes(job.state) || back.why || !same) return fail(`reload: from the saved board the job is ${job.state} and the derivatives ${back.why || (same ? 'match' : 'differ from the first read')}.`);
      pass('reload', 'a fresh read of the saved board finds the finished job and byte-identical derivatives');

      // a failure that charges and holds nothing
      const damaged = source(PATHS.pptx).subarray(0, 3000);
      let refused = null, bad = null;
      try { bad = await submit({ ...PATHS.pptx, name: 'acceptance-damaged.pptx' }, damaged, 'acceptance-damaged'); } catch (e) { refused = String(e.message); }
      if (refused) say(`failure: refused before conversion: ${refused}`);
      else {
        const job = await settle(bad.job);
        if (job.state !== 'failed' || !job.error || /\$|usd|micro/i.test(job.error)) return fail(`failure: the damaged presentation ended ${job.state} with "${job.error || 'no reason'}"; expected failed with a plain reason.`);
        if ((await listing(bad, PATHS.pptx)).length) return fail('failure: a failed job left a derivative.');
        say(`failure: ended failed on attempt ${job.attempt}: "${job.error}"`);
      }
      if (creditsBefore == null) say('usage: the credits summary was not available, so the no-charge criterion was NOT checked');
      else if ((await credits()) !== creditsBefore) return fail('usage: usedCredits, reservedCredits or unknownAttempts changed during the acceptance (if you used AI features at the same time, repeat without).');
      else pass('usage', 'credits used, reserved and unknown attempts are unchanged across every conversion, the failure included');
      pass('failure', refused ? 'refused at upload with a plain error' : 'failed with a plain reason, no derivative');
    }

    if (o.cancel && o.all) {
      const p = { ...PATHS.pptx, file: 'deck-40.pptx', name: 'acceptance-cancel.pptx' };
      const s = await submit(p, source(p), 'acceptance-cancel');
      await json(cookie, `/api/learn/files/jobs/${s.job.id}/cancel`, { method: 'POST' });
      const job = await settle(s.job);
      receipt.cancel = job.state;
      if (job.state !== 'cancelled' && !OK.includes(job.state)) return fail(`cancel: the job ended ${job.state}, expected cancelled.`);
      if (job.state === 'cancelled') pass('cancel', 'the 40-slide job ended cancelled');
      else say('cancel: the job finished before the cancel reached it, so this run did not exercise cancellation; repeat to get that evidence (not counted)');
    }

    if (o.other) {
      const other = await session('a DIFFERENT account on digrabbithole.com');
      if (!other) return fail('the second cookie does not look like a cookie value.');
      const k = o.paths.find(x => results[x]) || o.paths[0], r0 = results[k];
      const bad = [];
      const r = await call(other, `/api/learn/files/jobs/${r0.s.job.id}`);
      if (r.status !== 404) bad.push(`job HTTP ${r.status}`);
      for (const d of r0.c.listed) { const x = await call(other, `/api/learn/files/${r0.s.id}/d/${d.id}`); if (x.status !== 404) bad.push(`${d.name} HTTP ${x.status}`); }
      if (bad.length) return fail(`another account was not refused: ${bad.join(', ')}; expected 404 for the job and every derivative.`);
      pass('other', `the job and ${r0.c.listed.length} derivatives of ${k} answer 404`);
    }

    if (o.retry) {
      if ((await deps.ask('Type KILL CONVERTER MACHINE to SIGKILL the production converter machine while a job converts: ')) !== 'KILL CONVERTER MACHINE') return fail('confirmation not given for the kill drill.');
      const machines = deps.fly(['machines', 'list', '-a', FLY_APP, '--json']);
      const id = machines.status === 0 ? JSON.parse(machines.stdout || '[]')[0]?.id : null;
      if (!id) return fail('retry: could not find the converter machine (is FLY_ORG_TOKEN set in the credentials file?).');
      const p = { ...PATHS.pptx, file: 'deck-40.pptx', name: 'acceptance-retry.pptx' }, s = await submit(p, source(p), 'acceptance-retry');
      let j = s.job;
      for (let i = 0; i < 400 && j.state !== 'converting' && !TERMINAL.includes(j.state); i++) { await deps.sleep(250); j = (await json(cookie, `/api/learn/files/jobs/${s.job.id}`)).job; }
      if (j.state !== 'converting') return fail(`retry: the job was ${j.state} before it could be interrupted; the drill is inconclusive, repeat it.`);
      const stopped = deps.fly(['machine', 'stop', id, '--signal', 'SIGKILL', '-a', FLY_APP]);
      if (stopped.status !== 0) return fail('retry: could not stop the machine.');
      say(`retry: machine ${id} SIGKILL-stopped while the job was converting (attempt ${j.attempt}); waiting for the lease to expire and the runner to retry`);
      const done = await settle(s.job);
      if (!OK.includes(done.state) || !(done.attempt >= 2)) return fail(`retry: the job ended ${done.state} on attempt ${done.attempt}; expected ready on attempt 2 or later.`);
      const names = (await listing(s, p)).map(d => d.name).sort();
      if (JSON.stringify(names) !== JSON.stringify([...p.outputs].sort())) return fail(`retry: after recovery the derivatives are ${names.join(', ')}.`);
      pass('retry', `ready on attempt ${done.attempt} after the kill, ${names.length} derivatives, one card, one job`);
    }
  } catch (error) { return fail(String(error.message || error)); }

  const missing = finish();
  say(missing.length ? `PARTIAL: everything that ran passed. NOT run or NOT checked in this run: ${missing.join(', ')}. Not COMPLETE.` : `COMPLETE: ${REQUIRED.length} criteria passed on ${ORIGIN} (receipt${o.out ? ` ${o.out}` : ' not written: use --out'}).`);
  say('Not covered by any run: PPT, ODT, ODP, RTF, DOC, AIFF and WebM (no upload family), AC-3 audio (no decoder in the image), files near the size limits, and many users at once.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const CREDENTIALS = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
  const { spawnSync } = await import('node:child_process');
  const deps = {
    out: line => console.log(line), now: () => new Date().toISOString(), write: (f, t) => writeFileSync(f, t),
    interactive: () => !!(process.stdin.isTTY && process.stdout.isTTY),
    ask: q => new Promise(res => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a.trim()); }); }),
    askHidden: q => new Promise(res => { process.stdout.write(q); const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true }); rl._writeToOutput = () => {}; rl.question('', a => { rl.close(); process.stdout.write('\n'); res(a); }); }),
    fetch: (url, init) => { if (!(url.startsWith(`${ORIGIN}/`) || url.startsWith(`${CONVERT_URL}/`))) throw new Error('refused: not a production URL'); return fetch(url, { ...init, signal: AbortSignal.timeout(60_000), redirect: 'manual' }); },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    // Only the kill drill uses Fly: the org token is read by name from the credentials file and handed to flyctl alone.
    fly: args => { const token = readByName(readFileSync(CREDENTIALS, 'utf8'), FLY_NAME); if (!token) return { status: 1, stdout: '' }; const r = spawnSync('flyctl', args, { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE, FLY_API_TOKEN: token } }); return { status: r.status, stdout: r.stdout || '' }; },
  };
  process.exit(await accept(process.argv.slice(2), deps));
}
