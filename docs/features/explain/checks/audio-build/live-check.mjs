// ONE real script call (Gemini Flash Lite) and ONE real voice call (ElevenLabs Flash v2.5) through the shipped routes, locally: no D1, no R2 and no production. Keys are read by NAME from
// small-deploy/.env, held in memory, never printed or written. Spend is not enforced here (SMALL_ENV=test); the cost is computed from the registry rows.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { explanationAudioRoute, SCRIPT_PATH, VOICE_PATH } from '../../audio-build/packages/control-plane/src/explanation-audio.js';
import { priceUsage } from '../../audio-build/packages/control-plane/src/pricing-registry.js';
import { splitCard, cardNumbers, spokenNumbers, wordCount } from '../../audio-build/packages/control-plane/src/explanation-audio-script.js';
import { memoryBucket } from '../../audio-build/packages/control-plane/test/live-storage-spy.js';
const ENV = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', OUT = 'C:/s/sprint2-evidence/audio-build/';
const text = fs.readFileSync(ENV, 'utf8');
const key = name => { const line = text.split('\n').find(l => l.startsWith(`${name}=`)); if (!line) throw new Error(`missing ${name}`); return line.slice(name.length + 1).replace(/\r$/, '').trim().replace(/^["']|["']$/g, ''); };
const KEYS = ['GEMINI_API_KEY', 'FIREWORKS_API_KEY', 'ELEVENLABS_API_KEY'].map(key);
const redact = s => KEYS.reduce((a, k) => (k ? a.split(k).join('[KEY]') : a), String(s));
const sqlite = new DatabaseSync(':memory:');
for (const f of ['0023-file-imports.sql', '0005-shared-canvas-v1.sql']) sqlite.exec(fs.readFileSync('C:/s/audio-build/packages/control-plane/learn-migrations/' + f, 'utf8'));
const LEARN_DB = { prepare: t => { let args = []; const st = sqlite.prepare(t); return { bind(...v) { args = v; return this; }, first: async () => st.get(...args) || null, run: async () => ({ meta: { changes: st.run(...args).changes } }) }; } };
const env = { SMALL_ENV: 'test', GEMINI_API_KEY: key('GEMINI_API_KEY'), FIREWORKS_API_KEY: key('FIREWORKS_API_KEY'), ELEVENLABS_API_KEY: key('ELEVENLABS_API_KEY'), LEARN_DB, LEARN_MEDIA: memoryBucket() };
const deps = { authorize: async () => ({ org: 'local', user_id: 'local', email: 'local@example.test' }), store: async () => ({ org: 'local', email: 'local@example.test', app: 'canvas-live', boardId: null }) };
const lines = []; const log = console.log; console.log = l => { try { lines.push(JSON.parse(l)); } catch { log(redact(l)); } };
const card = JSON.parse(fs.readFileSync('C:/s/spec/benchmarks/explain-bench/2026-11-14T125715-145-smoke-rerun-71415b6b8/raw/smoke-r1/cards/ml-trees-bootstrap-coverage.json', 'utf8'));
const block = card.response.block, question = card.row.prompt;
const call = (path, body) => explanationAudioRoute(path, new Request(`https://x.test${path}`, { method: 'POST', body: JSON.stringify(body) }), env, deps);

let t0 = Date.now();
const sres = await call(SCRIPT_PATH, { app: 'canvas-live', id: 'live-1', title: block.title, body: block.body, depth: block.depth, question });
const s = await sres.json(); const scriptMs = Date.now() - t0;
console.log = log;
fs.writeFileSync(OUT + 'live-script.json', JSON.stringify(s, null, 1));
const parts = splitCard(block.body), allowed = cardNumbers(parts.prose, parts.visualText, block.title, question);
const outside = s.script ? spokenNumbers(s.script).filter(n => !allowed.has(n)) : null;
const outsideT = s.transcript ? spokenNumbers(s.transcript).filter(n => !allowed.has(n)) : null;
const symbols = s.script ? /[=+*/^<>[\]%\u00d7\u00f7\$~]/.test(s.script) : null;
console.log(redact(JSON.stringify({ step: 'script', http: sres.status, ms: scriptMs, provider: s.scriptBy, words: s.script ? wordCount(s.script) : 0, transcriptWords: s.transcript ? wordCount(s.transcript) : 0, seconds_estimate: s.seconds_estimate, chars: s.script?.length, numbersOutsideCardInScript: outside, numbersOutsideCardInTranscript: outsideT, symbolsInScript: symbols, serverLog: lines.map(l => ({ outcome: l.outcome, removed: l.removed, provider: l.provider })) })));
if (!s.script) process.exit(2);

t0 = Date.now();
const vres = await call(VOICE_PATH, { app: 'canvas-live', id: 'live-1', script: s.script, confirmed: true });
const v = (await vres.json()).narration; const voiceMs = Date.now() - t0;
if (v.status === 'ready') { const row = sqlite.prepare('SELECT r2_key, bytes FROM file_sources').get(); const obj = await env.LEARN_MEDIA.get(row.r2_key); fs.writeFileSync(OUT + 'live-voice.mp3', new Uint8Array(await obj.arrayBuffer())); }
const scriptPrice = null, voicePrice = priceUsage({ provider: 'elevenlabs', model: 'eleven_flash_v2_5', quantities: { input_chars: s.script.length } });
console.log(redact(JSON.stringify({ step: 'voice', http: vres.status, ms: voiceMs, status: v.status, code: v.code, seconds: v.seconds, bytes: v.fileRef?.meta?.size, voiceCostUsdEstimate: voicePrice.micros / 1e6 })));
fs.writeFileSync(OUT + 'live-narration.json', JSON.stringify({ ...v, script: s.script, transcript: s.transcript }, null, 1));
