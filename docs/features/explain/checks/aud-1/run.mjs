// AUD-1 TTS benchmark. Usage: node run.mjs <arm>   arms: fish-s1 | fish-s21 | eleven | gemini
// Appends one JSON row per call to rows.jsonl. Keys are read by name and never printed or written.
import fs from 'node:fs';
import { key, redact } from './lib.mjs';
import { mp3Duration } from 'file:///C:/s/s2-prev/packages/control-plane/src/whiteboard-mp3.js';

const DIR = 'C:/s/sprint2-evidence/aud-1';
const CAP = 1.0, TEXT = fs.readFileSync(`${DIR}/script.txt`, 'utf8').trim();
const BYTES = Buffer.byteLength(TEXT), CHARS = TEXT.length, WORDS = TEXT.split(/\s+/).length;
const NARRATOR = '802e3bc2b27e49c2995d23ef70e6ac89';
const arm = process.argv[2];
const KEYS = { fish: key('FISH_AUDIO_API_KEY'), el: key('ELEVENLABS_API_KEY'), gm: key('GEMINI_API_KEY') };
const ALL = Object.values(KEYS);
const ROWS = `${DIR}/rows.jsonl`;
const rows = fs.existsSync(ROWS) ? fs.readFileSync(ROWS, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
let spent = rows.reduce((a, r) => a + (r.usd || 0), 0);

// Time a request: first body chunk -> ttfb, end -> total. Returns the whole body as a Buffer.
async function timed(url, init) {
  const t0 = performance.now();
  let res, ttfb = null; const chunks = [];
  try {
    res = await fetch(url, init);
    for await (const c of res.body) { if (ttfb === null) ttfb = performance.now() - t0; chunks.push(c); }
    return { status: res.status, ctype: res.headers.get('content-type'), ttfb, total: performance.now() - t0, body: Buffer.concat(chunks) };
  } catch (e) {
    return { status: res ? res.status : 0, ttfb, total: performance.now() - t0, body: Buffer.concat(chunks), err: redact(e.message, ALL) };
  }
}

function mp3Secs(buf, kbps) {
  try { return { s: mp3Duration(buf).seconds, how: 'mp3 frames (whiteboard-mp3.js)' }; }
  catch { return { s: buf.length * 8 / (kbps * 1000), how: `CBR bytes*8/${kbps}kbps (frame parse failed)` }; }
}
function wavSecs(buf) { // find 'data' chunk
  let i = 12;
  while (i + 8 <= buf.length) { const id = buf.toString('ascii', i, i + 4), n = buf.readUInt32LE(i + 4); if (id === 'data') return { s: Math.min(n, buf.length - i - 8) / 48000, how: 'WAV data bytes/48000' }; i += 8 + n; }
  return { s: (buf.length - 44) / 48000, how: 'WAV (bytes-44)/48000 fallback' };
}

async function record(base, r, ext, bill) {
  const ok = r.status === 200 && r.body.length > 1000;
  const row = { ...base, http_status: r.status, content_type: r.ctype || null, ttfb_ms: r.ttfb == null ? null : Math.round(r.ttfb), total_ms: Math.round(r.total), bytes: r.body.length, chars: CHARS, words: WORDS, utf8_bytes: BYTES, timeout_20s_would_cut: r.total > 20000 };
  if (r.err) row.error = r.err;
  if (ok) {
    const d = ext === 'mp3' ? mp3Secs(r.body, base.bitrate_kbps) : wavSecs(r.body);
    row.audio_seconds = +d.s.toFixed(2); row.duration_method = d.how;
    row.chars_per_sec = +(CHARS / d.s).toFixed(2); row.wpm = +(WORDS / d.s * 60).toFixed(1);
    Object.assign(row, bill(d.s, r));
    fs.writeFileSync(`${DIR}/samples/${base.arm}-run${base.run}.${ext}`, r.body);
  } else {
    row.usd = 0; row.error = row.error || redact(r.body.toString('utf8').slice(0, 600), ALL);
  }
  spent += row.usd || 0; row.running_total_usd = +spent.toFixed(5);
  fs.appendFileSync(ROWS, JSON.stringify(row) + '\n');
  console.log(JSON.stringify({ arm: row.arm, run: row.run, status: row.http_status, ttfb: row.ttfb_ms, total: row.total_ms, bytes: row.bytes, secs: row.audio_seconds, usd: row.usd, running: row.running_total_usd, err: row.error && row.error.slice(0, 200) }));
  return ok;
}

function guard(est) { if (spent + est > CAP) { console.log('STOP: cap'); process.exit(2); } }

const fishBilling = () => ({ billed_units: `${BYTES} UTF-8 bytes`, usd: +(BYTES * 15 / 1e6).toFixed(5) });
async function fish(armName, model, withRef, run, tag) {
  guard(0.03);
  const body = { text: TEXT, format: 'mp3', mp3_bitrate: 64, latency: 'balanced', normalize: true, temperature: 0.5, top_p: 0.6, prosody: { speed: 0.92 } };
  if (withRef) body.reference_id = NARRATOR;
  const r = await timed('https://api.fish.audio/v1/tts', { method: 'POST', headers: { Authorization: `Bearer ${KEYS.fish}`, 'Content-Type': 'application/json', model }, body: JSON.stringify(body) });
  const ok = await record({ arm: armName, run, model, reference_id_sent: withRef, bitrate_kbps: 64, note: tag }, r, 'mp3', fishBilling);
  return { ok, status: r.status };
}

if (arm === 'fish-s1') {
  let fails = 0;
  for (let n = 1; n <= 3; n++) { const r = await fish('fish-s1', 's1', true, n); if (!r.ok && ++fails >= 2) break; }
} else if (arm === 'fish-s21') {
  const first = await fish('fish-s21', 's2.1-pro', true, 1, 'with reference_id');
  if (first.ok) { for (let n = 2; n <= 3; n++) await fish('fish-s21', 's2.1-pro', true, n, 'with reference_id'); }
  else if (first.status >= 400 && first.status < 500) { // reference_id refused: 3 runs without it (runs 2..4, the refused call stays as run 1)
    for (let n = 2; n <= 4; n++) await fish('fish-s21-noref', 's2.1-pro', false, n - 1, 'WITHOUT reference_id (fallback)');
  } else console.log('s2.1-pro failed non-4xx; stopping arm');
} else if (arm === 'eleven') {
  const voice = JSON.parse(fs.readFileSync(`${DIR}/el-voices.json`, 'utf8')).find(v => v.name.startsWith('Matilda'));
  fs.writeFileSync(`${DIR}/el-voice.json`, JSON.stringify({ id: voice.id, name: voice.name }));
  let fails = 0;
  for (let n = 1; n <= 3; n++) {
    guard(0.06);
    const r = await timed(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/stream?output_format=mp3_44100_64`, { method: 'POST', headers: { 'xi-api-key': KEYS.el, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: TEXT, model_id: 'eleven_flash_v2_5' }) });
    const ok = await record({ arm: 'eleven-flash-v2_5', run: n, model: 'eleven_flash_v2_5', voice_id: voice.id, voice_name: voice.name, bitrate_kbps: 64 }, r, 'mp3', () => ({ billed_units: `${CHARS} chars`, usd: +(CHARS * 0.04 / 1000).toFixed(5) }));
    if (!ok && ++fails >= 2) break;
  }
} else if (arm === 'gemini') {
  let fails = 0;
  for (let n = 1; n <= 3; n++) {
    guard(0.04);
    const body = { model: 'gemini-3.8-flash-tts', input: [{ type: 'user_input', content: [{ type: 'text', text: TEXT }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: 'Kore' }] } };
    const r = await timed('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': KEYS.gm, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let wav = null, usage = null;
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body.toString('utf8')); usage = j.usage || j.usageMetadata || null;
        const a = (j.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(c => c.type === 'audio').pop();
        wav = Buffer.from(a.data, 'base64');
      } catch (e) { r.err = 'parse: ' + e.message; }
    }
    const raw = r.body.length;
    const rr = wav ? { ...r, body: wav } : r;
    const ok = await record({ arm: 'gemini-3.8-flash-tts', run: n, model: 'gemini-3.8-flash-tts', voice: 'Kore', api: 'interactions (unary, non-streaming: ttfb = first byte of the JSON response)', json_bytes: raw, usage }, rr, 'wav',
      (secs) => ({ billed_units: `${Math.round(secs * 25)} audio tokens (25/s)`, usd: +(secs * 25 * 9 / 1e6).toFixed(5) }));
    if (!ok && ++fails >= 2) break;
  }
} else { console.log('unknown arm'); process.exit(1); }
console.log('spent so far USD', spent.toFixed(5));
