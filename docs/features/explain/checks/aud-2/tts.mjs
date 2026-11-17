import fs from 'node:fs';
import { key, redact } from '../aud-1/lib.mjs';
import { mp3Duration } from '../../s2-prev/packages/control-plane/src/whiteboard-mp3.js';
const D = 'C:/s/sprint2-evidence/aud-2/';
const K = key('ELEVENLABS_API_KEY');
const scripts = JSON.parse(fs.readFileSync(D + 'scripts.json', 'utf8'));
const clean = t => t.replace(/\u2011/g, '-').replace(/\s+/g, ' ').trim(); // only the non-breaking hyphen is normalised
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const VOICES = { Jessica: 'cgSgspJ2msm6clMCkdW9', Laura: 'FGY2WhTYpPnrIDTdsKH5', Matilda: 'XrExE9yKIg1WjnnlVkGX' };
// eleven_flash_v2_5 reports can_use_style=false and can_use_speaker_boost=false (GET /v1/models), so only these fields are sent.
const settings = speed => ({ stability: 0.4, similarity_boost: 0.75, speed });
async function tts(voiceId, text, file, speed) {
  const vs = settings(speed), t0 = Date.now();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`, { method: 'POST', headers: { 'xi-api-key': K, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: vs }), signal: AbortSignal.timeout(120000) });
  if (!r.ok) return { http: r.status, voice_settings: vs, error: redact((await r.text()).slice(0, 300), [K]) };
  const chunks = []; let ttfb = null;
  for await (const c of r.body) { if (ttfb == null) ttfb = Date.now() - t0; chunks.push(c); }
  const buf = Buffer.concat(chunks); fs.writeFileSync(file, buf);
  let seconds, how = 'mp3 frames'; try { seconds = mp3Duration(buf).seconds; } catch { seconds = buf.length * 8 / 64000; how = 'bytes*8/64kbps'; }
  const words = text.split(' ').length;
  return { http: r.status, voice_settings: vs, ttfbMs: ttfb, totalMs: Date.now() - t0, bytes: buf.length, audioSeconds: +seconds.toFixed(2), durationBy: how, chars: text.length, words, wpm: +(words / seconds * 60).toFixed(1), usd: +(text.length * 0.04 / 1000).toFixed(5) };
}
const rec = process.argv[2]; // recommended voice name; empty = samples only
const out = { samples: [], full: [] };
const sample = clean(scripts[0].script).split(' ').slice(0, 90).join(' ');
fs.writeFileSync(D + 'samples/sample-text.txt', sample);
if (!rec) {
  for (const [name, id] of Object.entries(VOICES)) { const r = await tts(id, sample, D + `samples/voice-${name}-speed1.1.mp3`, 1.1); out.samples.push({ voice: name, id, ...r }); console.log('sample', name, JSON.stringify(r)); }
  fs.writeFileSync(D + 'tts-results.json', JSON.stringify(out, null, 1));
} else {
  out.samples = JSON.parse(fs.readFileSync(D + 'tts-results.json', 'utf8')).samples;
  const r1 = await tts(VOICES[rec], sample, D + `samples/voice-${rec}-speed1.0.mp3`, 1.0); out.samples.push({ voice: rec, id: VOICES[rec], ...r1 }); console.log('sample', rec, '1.0', JSON.stringify(r1));
  for (const n of [4, 5, 10]) for (const speed of [1.1, 1.0]) {
    const s = scripts[n - 1], file = `samples/card-${n}-${slug(s.id)}${speed === 1.0 ? '-speed1.0' : ''}.mp3`;
    const r = await tts(VOICES[rec], clean(s.script), D + file, speed); out.full.push({ n, id: s.id, depthLabel: s.depthLabel, scriptWords: s.words, voice: rec, file, ...r }); console.log('full', n, speed, JSON.stringify(r));
  }
  fs.writeFileSync(D + 'tts-results.json', JSON.stringify(out, null, 1));
}
