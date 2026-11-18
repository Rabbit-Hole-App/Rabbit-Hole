// Iteration 2 length measurement: the shipped writeScript (floors, one re-ask, number rules) from C:/s/audio-build-2, Gemini first (production order), 12 AUD-2 cards.
// Keys by NAME from small-deploy/.env, held in memory, never printed. No voice call. Usage: node run-length2.mjs <label> <runs> [cardIndexes comma] [out file]
import fs from 'node:fs';
import { writeScript } from '../../../audio-build-2/packages/control-plane/src/explanation-audio.js';
import { splitCard, cardNumbers, cardDataNumbers, wordCount } from '../../../audio-build-2/packages/control-plane/src/explanation-audio-script.js';
import { validDepth, DEFAULT_DEPTH } from '../../../audio-build-2/packages/control-plane/src/chat-depth.js';
const ENV = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', OUT = 'C:/s/sprint2-evidence/audio-build/iter2/';
const text = fs.readFileSync(ENV, 'utf8');
const key = name => { const line = text.split('\n').find(l => l.startsWith(`${name}=`)); if (!line) throw new Error(`missing ${name}`); return line.slice(name.length + 1).replace(/\r$/, '').trim().replace(/^["']|["']$/g, ''); };
const [, , label = 'run', runsArg = '3', only, outName = 'results2.jsonl'] = process.argv;
const GEM = key('GEMINI_API_KEY'), FW = key('FIREWORKS_API_KEY');
const redact = s => [GEM, FW].reduce((a, k) => (k ? a.split(k).join('[KEY]') : a), String(s));
const env = { SMALL_ENV: 'test', FIREWORKS_API_KEY: FW, GEMINI_API_KEY: GEM };
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/aud-2/cards.json', 'utf8'));
const realFetch = globalThis.fetch; let calls = [];
globalThis.fetch = async (url, init) => { const r = await realFetch(url, init); if (String(url).includes('chat/completions')) { const j = await r.clone().json().catch(() => null); calls.push({ provider: String(url).includes('fireworks') ? 'fireworks' : 'google', usage: j?.usage ?? null, raw: j?.choices?.[0]?.message?.content ?? null }); } return r; };
const log = console.log; console.log = () => {};
const idx = only ? only.split(',').map(Number) : cards.map((_, i) => i);
for (const i of idx) {
  const c = cards[i], fileJson = JSON.parse(fs.readFileSync('C:/s/spec/benchmarks/explain-bench/' + c.source + c.id + '.json', 'utf8')), block = fileJson.response.block, question = fileJson.row.prompt;
  const parts = splitCard(block.body);
  const input = { depth: validDepth(block.depth) || DEFAULT_DEPTH, question, title: block.title, prose: parts.prose, labels: parts.labels,
    allowed: cardNumbers(parts.prose, parts.visualText, block.title, question), cardData: cardDataNumbers(parts.prose, parts.visualText, block.title, question) };
  for (let r = 1; r <= Number(runsArg); r++) {
    calls = []; const t0 = Date.now(); let res, err = null;
    try { res = await writeScript(env, input, 'local', { userId: 'local' }); } catch (e) { err = String(e?.message || e).slice(0, 200); }
    const rec = { label, card: c.id, cardIndex: i, depth: input.depth, run: r, ms: Date.now() - t0, calls: calls.length, providers: calls.map(x => x.provider), usage: calls.map(x => x.usage), err,
      outcome: res?.script ? 'ok' : res?.outcome ?? null, check: res?.check ?? null, finalWords: res?.script ? wordCount(res.script) : null, removed: res?.removed ?? null };
    fs.appendFileSync(OUT + outName, redact(JSON.stringify(rec)) + '\n');
    fs.appendFileSync(OUT + 'raw2.jsonl', redact(JSON.stringify({ label, card: c.id, depth: input.depth, run: r, raw: calls.map(x => x.raw) })) + '\n');
    log(redact(`${label} ${c.id} ${input.depth} r${r} ${rec.outcome} calls=${rec.calls} first=${rec.check?.firstRawWords}/${rec.check?.firstStrippedWords} final=${rec.check?.rawWords}/${rec.check?.strippedWords} failed=${JSON.stringify(rec.check?.failed)} ${rec.ms}ms ${rec.err || ''}`));
  }
}
