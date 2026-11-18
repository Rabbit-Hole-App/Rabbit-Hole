// Length distribution of the shipped card-audio script path. READ-ONLY on the repo: imports writeScript + the number check from the worktree.
// Keys by NAME from small-deploy/.env, held in memory, never printed. No voice call. Usage: node run-length.mjs <arm gemini|fireworks> <runs> [cardIndexes comma]
import fs from 'node:fs';
import { writeScript } from '../../../audio-build/packages/control-plane/src/explanation-audio.js';
import { splitCard, cardNumbers, spokenNumbers, sentencesOf, wordCount, secondsEstimate, stripUnsafe } from '../../../audio-build/packages/control-plane/src/explanation-audio-script.js';
import { validDepth, DEFAULT_DEPTH } from '../../../audio-build/packages/control-plane/src/chat-depth.js';
const ENV = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', OUT = 'C:/s/sprint2-evidence/audio-build/length/';
const text = fs.readFileSync(ENV, 'utf8');
const key = name => { const line = text.split('\n').find(l => l.startsWith(`${name}=`)); if (!line) throw new Error(`missing ${name}`); return line.slice(name.length + 1).replace(/\r$/, '').trim().replace(/^["']|["']$/g, ''); };
const [, , arm, runsArg = '3', only] = process.argv;
const GEM = key('GEMINI_API_KEY'), FW = key('FIREWORKS_API_KEY');
const redact = s => [GEM, FW].reduce((a, k) => (k ? a.split(k).join('[KEY]') : a), String(s));
// Gemini-first arm: both keys (production order). Fireworks-first arm: only the Fireworks key, so the chain's fallback step is the only one left.
const env = { SMALL_ENV: 'test', FIREWORKS_API_KEY: FW, ...(arm === 'gemini' ? { GEMINI_API_KEY: GEM } : {}) };
const cards = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/aud-2/cards.json', 'utf8'));
const realFetch = globalThis.fetch; let seen = null;
globalThis.fetch = async (url, init) => { const r = await realFetch(url, init); if (String(url).includes('chat/completions')) { const c = r.clone(); const j = await c.json().catch(() => null); seen = { url: String(url).includes('fireworks') ? 'fireworks' : 'google', raw: j?.choices?.[0]?.message?.content ?? null, usage: j?.usage ?? null, finish: j?.choices?.[0]?.finish_reason ?? null }; } return r; };
const log = console.log; console.log = () => {}; // the route logs only; writeScript itself logs nothing, but spendTransport may
const classify = (script, transcript, allowed) => {
  const spoken = sentencesOf(script.replace(/\s+/g, ' ').trim()), written = sentencesOf(transcript.replace(/\s+/g, ' ').trim());
  const aligned = written.length === spoken.length, out = [];
  spoken.forEach((s, i) => {
    const sym = /[=+*/^<>[\]%\u00d7\u00f7\$~\u00b2\u00b3\u00b9\u2070-\u209f]/.test(s);
    const nums = spokenNumbers(s).filter(n => !allowed.has(n));
    const tNums = aligned ? spokenNumbers(written[i]).filter(n => !allowed.has(n)) : [];
    if (!sym && !nums.length && !tNums.length) return;
    const reason = sym ? 'symbol' : nums.length ? (/\d/.test(s) ? 'outside_number_digits' : 'outside_number_spelled') : 'transcript_only_number';
    const all = [...new Set([...nums, ...tNums])];
    out.push({ reason, numbers: all, words: wordCount(s), saveableByOneToTen: !sym && all.length > 0 && all.every(n => Number.isInteger(n) && n >= 1 && n <= 10) && !/\d/.test(s) });
  });
  return { stripped: out, aligned, sentences: spoken.length };
};
const idx = only ? only.split(',').map(Number) : cards.map((_, i) => i);
for (const i of idx) {
  const c = cards[i], fileJson = JSON.parse(fs.readFileSync('C:/s/spec/benchmarks/explain-bench/' + c.source + c.id + '.json', 'utf8')), block = fileJson.response.block, question = fileJson.row.prompt;
  const parts = splitCard(block.body);
  const input = { depth: validDepth(block.depth) || DEFAULT_DEPTH, question, title: block.title, prose: parts.prose, labels: parts.labels, allowed: cardNumbers(parts.prose, parts.visualText, block.title, question) };
  for (let r = 1; r <= Number(runsArg); r++) {
    seen = null; const t0 = Date.now(); let res, err = null;
    try { res = await writeScript(env, input, 'local', { userId: 'local' }); } catch (e) { err = String(e?.message || e).slice(0, 200); }
    const rec = { arm, card: c.id, cardIndex: i, depth: input.depth, run: r, ms: Date.now() - t0, providerUsed: seen?.url ?? null, httpOk: !!seen, finish: seen?.finish ?? null, usage: seen?.usage ?? null, err, outcome: res?.script ? 'ok' : res?.outcome ?? null };
    let parsed = null; try { parsed = JSON.parse(seen?.raw); } catch { /* unparsed */ }
    rec.parsed = typeof parsed?.script === 'string' && !!parsed.script.trim();
    if (rec.parsed) {
      const tr = typeof parsed.transcript === 'string' ? parsed.transcript : '';
      rec.rawWords = wordCount(parsed.script); rec.rawSentences = sentencesOf(parsed.script).length;
      const cls = classify(parsed.script, tr, input.allowed); rec.strippedDetail = cls.stripped; rec.aligned = cls.aligned;
      const kept = stripUnsafe(parsed.script, tr, input.allowed); rec.afterWords = wordCount(kept.script); rec.removedCodeCount = res?.removed ?? kept.removed; rec.strippedSentences = cls.stripped.length;
      rec.secondsEstimate = secondsEstimate(kept.script); rec.rawSeconds = secondsEstimate(parsed.script); rec.tooShort = rec.afterWords < 40;
      rec.targetWordsBounds = null;
    }
    fs.appendFileSync(OUT + 'results.jsonl', redact(JSON.stringify(rec)) + '\n');
    fs.appendFileSync(OUT + 'raw.jsonl', redact(JSON.stringify({ arm, card: c.id, depth: input.depth, run: r, raw: seen?.raw ?? null })) + '\n');
    log(redact(`${arm} ${c.id} ${input.depth} r${r} ${rec.outcome} raw=${rec.rawWords} after=${rec.afterWords} strip=${rec.strippedSentences} ${rec.ms}ms ${rec.providerUsed} ${rec.err || ''}`));
  }
}
