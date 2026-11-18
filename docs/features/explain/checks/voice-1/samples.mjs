// VOICE-1 samples: the SAME script through the real route code of all four spoken paths, locally (in-memory D1 and R2, SMALL_ENV=test so no spend ledger, nothing on production).
// ONE paid ElevenLabs call per path (four in all, about 330 characters each, about $0.013 each at the registry estimate). NOT RUN by the builder: the lead runs it.
// Key by NAME from small-deploy/.env, held in memory, never printed or written. Usage: node samples.mjs
// Writes voice-1-card.mp3, voice-1-tutor.mp3, voice-1-read-aloud.mp3, voice-1-whiteboard.mp3 and summary.json next to this file.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const SRC = 'file:///C:/s/voice-1/packages/control-plane/src/', TEST = 'file:///C:/s/voice-1/packages/control-plane/test/';
const { explanationAudioRoute, VOICE_PATH } = await import(SRC + 'explanation-audio.js');
const { voiceSpeech } = await import(SRC + 'learn-voice-tts.js');
const { narrateBeat } = await import(SRC + 'whiteboard-tts.js');
const { speakNarration, narrationMicros, NARRATION_VOICE } = await import(SRC + 'narration-voice.js');
const { paidRefusal } = await import(SRC + 'learn-paid.js');
const { isPaidSpendReply } = await import(SRC + 'learn-paid-transport.js');
const { memoryBucket } = await import(TEST + 'live-storage-spy.js');
const HERE = 'C:/s/sprint2-evidence/voice-1/', ENVFILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const envText = fs.readFileSync(ENVFILE, 'utf8');
const key = name => { const line = envText.split('\n').find(l => l.startsWith(`${name}=`)); if (!line) throw new Error(`missing ${name}`); return line.slice(name.length + 1).replace(/\r$/, '').trim().replace(/^["']|["']$/g, ''); };
const KEY = key('ELEVENLABS_API_KEY');
const redact = s => String(s).split(KEY).join('[KEY]');
const script = fs.readFileSync(HERE + 'sample-script.txt', 'utf8').trim();
const sqlite = new DatabaseSync(':memory:');
for (const f of ['0023-file-imports.sql', '0005-shared-canvas-v1.sql']) sqlite.exec(fs.readFileSync('C:/s/voice-1/packages/control-plane/learn-migrations/' + f, 'utf8'));
const LEARN_DB = { prepare: t => { let args = []; const st = sqlite.prepare(t); return { bind(...v) { args = v; return this; }, first: async () => st.get(...args) || null, run: async () => ({ meta: { changes: st.run(...args).changes } }) }; } };
const env = { SMALL_ENV: 'test', ELEVENLABS_API_KEY: KEY, LEARN_DB, LEARN_MEDIA: memoryBucket() };
const results = [];
const run = async (path, fn) => {
  const started = Date.now();
  try { const out = await fn(); const ms = Date.now() - started; fs.writeFileSync(`${HERE}voice-1-${path}.mp3`, out.bytes); results.push({ path, ok: true, ms, bytes: out.bytes.length, seconds_by_bitrate: Math.round((out.bytes.length * 8) / NARRATION_VOICE.bitrate), ...out.extra }); }
  catch (error) { results.push({ path, ok: false, ms: Date.now() - started, error: redact(error?.message || error) }); }
};
// 1. card audio: the shipped voice route, the owner's first Play (script -> file source in the in-memory R2).
await run('card', async () => {
  const deps = { authorize: async () => ({ org: 'local', user_id: 'local', email: 'local@example.test' }), store: async () => ({ org: 'local', email: 'local@example.test', app: 'canvas-live', boardId: null }) };
  const answer = await explanationAudioRoute(VOICE_PATH, new Request('https://x.test' + VOICE_PATH, { method: 'POST', body: JSON.stringify({ app: 'canvas-live', id: 'voice-1-sample', script, confirmed: true }) }), env, deps);
  const { narration } = await answer.json();
  if (narration?.status !== 'ready') throw new Error(`card voice ${narration?.status} ${narration?.code}`);
  const row = sqlite.prepare('SELECT r2_key FROM file_sources').get();
  return { bytes: new Uint8Array(await (await env.LEARN_MEDIA.get(row.r2_key)).arrayBuffer()), extra: { route_seconds: narration.seconds, voiceId: narration.voiceId } };
});
// 2. Voice Tutor: POST /api/learn/voice/tts handler (1,200 characters at most, 20 s abort).
await run('tutor', async () => {
  const answer = await voiceSpeech(env, { text: script, trace_id: 'voice-1-sample' });
  if (answer.status !== 200) throw new Error(`tutor ${answer.status}`);
  return { bytes: new Uint8Array(await answer.arrayBuffer()), extra: { content_type: answer.headers.get('content-type') } };
});
// 3. Read it aloud: the dev worker's inline /api/learn/tts branch, executed as written (the whole Worker imports build-only assets; the repo's tests do the same).
await run('read-aloud', async () => {
  const worker = fs.readFileSync('C:/s/voice-1/packages/web/dev-worker.js', 'utf8').replace(/\r\n/g, '\n');
  const start = worker.indexOf("    if (path === '/api/learn/tts' && req.method === 'POST')");
  if (start < 0) throw new Error('inline /api/learn/tts branch not found');
  const code = worker.slice(start, worker.indexOf('    // The learner can speak', start));
  const branch = new (Object.getPrototypeOf(async function () {}).constructor)('req', 'env', 'path', 'authorizedBoardApp', 'paidRefusal', 'speakNarration', 'isPaidSpendReply', 'fetch', code);
  const answer = await branch(new Request('https://x.test/api/learn/tts', { method: 'POST', body: JSON.stringify({ app: 'canvas-live', text: script, confirmed: true }) }), env, '/api/learn/tts', async () => ({ email: 'local@example.test' }), paidRefusal, speakNarration, isPaidSpendReply, globalThis.fetch);
  if (answer.status !== 200) throw new Error(`read aloud ${answer.status}`);
  return { bytes: new Uint8Array(await answer.arrayBuffer()), extra: { content_type: answer.headers.get('content-type') } };
});
// 4. /whiteboard narration: one beat (20 s abort, one retry), its duration measured from the mp3 frames.
await run('whiteboard', async () => {
  const beat = await narrateBeat(env, script);
  return { bytes: beat.bytes, extra: { attempts: beat.attempts, seconds_measured: Number(beat.seconds.toFixed(2)) } };
});
const summary = { script_chars: script.length, script_words: script.split(/\s+/).length, voice: { ...NARRATION_VOICE }, estimate_usd_per_path: narrationMicros(script.length) / 1e6, results };
fs.writeFileSync(HERE + 'summary.json', redact(JSON.stringify(summary, null, 1)) + '\n');
console.log(redact(JSON.stringify(summary, null, 1)));
process.exit(results.every(r => r.ok) ? 0 : 2);
