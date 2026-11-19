// ILL-B Phase 1j: the two automatic judges (spec section 5): (1) Gemini 3.5 Flash Lite (the realistic production checker), (2) Claude Sonnet 5.5 (the stronger one).
// Same checklist, same JSON, image + subject + must items, NO model name in the prompt. Rows: scores/judge-gemini.jsonl and scores/judge-sonnet.jsonl, keyed by image id.
// usage: node judges.mjs --dry-run                       (fake transports, NO network call)
//        node judges.mjs --real --owner-ok-usd 15 [--judge gemini|sonnet|both] [--limit N]   (keys ANTHROPIC_API_KEY, GEMINI_API_KEY by name from ILLB_ENV_FILE)
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { CAP, MODELS, OUT as OUT0, appendJsonl, buildPlan, envKey, readJsonl, sharp, settled, subjects, usd } from './lib.mjs';

const { values: a } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, real: { type: 'boolean' }, 'owner-ok-usd': { type: 'string' }, judge: { type: 'string', default: 'both' }, limit: { type: 'string' }, delay: { type: 'string', default: '200' } } });
const REAL = Boolean(a.real);
if (REAL && !(Number(a['owner-ok-usd']) > 0)) { console.error('STOP: --real needs --owner-ok-usd <cap>'); process.exit(2); }
if (REAL && Number(a['owner-ok-usd']) > CAP) { console.error(`STOP: the hard cap is US$${CAP}`); process.exit(2); }
if (!REAL) globalThis.fetch = () => { throw new Error('DRY RUN: a network call was attempted'); };
const OUT = OUT0; fs.mkdirSync(`${OUT}/scores`, { recursive: true });
const { mtokRates, priceUsage } = await buildPlan();
const JUDGES = [{ name: 'gemini', provider: 'google', model: 'gemini-3.5-flash-lite', keyName: 'GEMINI_API_KEY' }, { name: 'sonnet', provider: 'anthropic', model: 'claude-sonnet-5-5', keyName: 'ANTHROPIC_API_KEY' }].filter(j => a.judge === 'both' || a.judge === j.name);

const images = readJsonl(`${OUT}/results.jsonl`).filter(r => r.type && r.type !== 'bin' && !r.mode).map(r => ({ ...r, file: r.file ?? `originals/${r.id}.${r.type}` })); // the 55 x arms images, not the speed extras
const tokens = { image: 1400, text: 700, out: 300 }; // the estimate used by ill-b.mjs: priced from the repo registry
const son = mtokRates('anthropic', 'claude-sonnet-5-5');
const estPer = { sonnet: ((tokens.image + tokens.text) * son[0] + tokens.out * son[1]) / 1e6, gemini: priceUsage({ provider: 'google', model: 'gemini-3.5-flash-lite', quantities: { input: tokens.image + tokens.text, output: tokens.out } }).micros / 1e6 };
const seed = readJsonl(`${OUT}/seed-check/results.jsonl`), imgRows = readJsonl(`${OUT}/results.jsonl`);
const imageSpent = settled(imgRows, r => r.units ?? MODELS.find(m => m.id === r.model)?.units ?? 7) + settled(seed, () => 7);
const judgeFile = j => `${OUT}/scores/judge-${j.name}.jsonl`;

const checklist = (img, s) => {
  const items = s.must.split(';').map(x => x.trim()).filter(Boolean);
  const textRule = img.form === 'N' ? 'There must be NO text at all in the picture (no letters, numbers, labels, titles).' : `The picture must show EXACTLY these labels, each spelled exactly and placed on the right part, and no other words: ${s.labels.map(l => `"${l}"`).join(', ')}.`;
  return { items, text: `Subject drawn: ${s.subject}\n\nChecklist (answer yes or no for each, in order):\n${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nText rule: ${textRule}\n\nReply with ONLY this JSON: {"must":[true|false per checklist item in order],"text":"${img.form === 'N' ? 'none|wrong' : 'correct|wrong'}","pass":true|false,"note":"at most 20 words"}. "pass" is true only when every checklist item is yes and the text rule holds.` };
};
const SYSTEM = 'You are a strict, literal checker of a picture against a checklist. Look at the picture and answer only the JSON asked for.';
const jpeg = async f => (await sharp()(f, f.endsWith('.svg') ? { density: 96 } : {}).resize(1024, 1024, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()).toString('base64');

const real = {
  gemini: key => async (text, b64) => { const t0 = Date.now(); const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 400, temperature: 0 } }), signal: AbortSignal.timeout(90000) }); const j = await r.json().catch(() => null);
    return { status: r.status, text: j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '', input: j?.usageMetadata?.promptTokenCount ?? 0, output: (j?.usageMetadata?.candidatesTokenCount ?? 0) + (j?.usageMetadata?.thoughtsTokenCount ?? 0), seconds: (Date.now() - t0) / 1000 }; },
  sonnet: key => async (text, b64) => { const t0 = Date.now(); const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text }] }] }), signal: AbortSignal.timeout(90000) }); const j = await r.json().catch(() => null);
    return { status: r.status, text: j?.content?.map(c => c.text ?? '').join('') ?? '', input: j?.usage?.input_tokens ?? 0, output: j?.usage?.output_tokens ?? 0, seconds: (Date.now() - t0) / 1000 }; },
};
const fake = name => async (text) => ({ status: 200, text: JSON.stringify({ must: text.split('\n').filter(l => /^\d+\. /.test(l)).map(() => true), text: text.includes('NO text at all') ? 'none' : 'correct', pass: true, note: `fake ${name}` }), input: 2100, output: 40, seconds: 0 });
const price = (j, u) => (j.provider === 'anthropic' ? (u.input * son[0] + u.output * son[1]) / 1e6 : priceUsage({ provider: j.provider, model: j.model, quantities: { input: u.input, output: u.output } }).micros / 1e6);

const nImages = REAL ? images.length : Math.max(images.length, 0);
const planImages = 220; const estAll = JUDGES.reduce((s, j) => s + planImages * estPer[j.name], 0);
console.log(`ILL-B judges ${REAL ? 'REAL' : 'DRY RUN (fake transports, NO network call)'}: ${JUDGES.map(j => j.name + ' = ' + j.model).join(', ')}; images available now ${images.length} of the plan's ${planImages}`);
console.log(`estimate per image: ${JUDGES.map(j => `${j.name} US$${estPer[j.name].toFixed(5)}`).join(', ')}; full plan (${planImages} images, ${JUDGES.length} judge(s)) US$${estAll.toFixed(2)}; STOP LINE (estimate + 20 %) US$${(estAll * 1.2).toFixed(2)}; image spend so far US$${imageSpent.toFixed(3)}; cap US$${CAP}: stop if spent + judge spend would pass the cap`);
let stop = null, judgeSpent = JUDGES.reduce((s, j) => s + readJsonl(judgeFile(j)).reduce((x, r) => x + (r.costUsd ?? 0), 0), 0), calls = 0;
for (const j of JUDGES) {
  const transport = REAL ? real[j.name](envKey(j.keyName)) : fake(j.name);
  const rows = readJsonl(REAL ? judgeFile(j) : '/dev/null');
  const done = new Set(rows.filter(r => r.httpStatus === 200).map(r => r.id));
  let todo = images.filter(r => !done.has(r.id)); if (a.limit) todo = todo.slice(0, Number(a.limit));
  let judged = 0, dryRows = [];
  for (const img of todo) {
    if (judgeSpent > estAll * 1.2 || imageSpent + judgeSpent + estPer[j.name] > CAP) { stop = `judge stop line / cap reached at US$${judgeSpent.toFixed(3)}`; break; }
    const s = subjects.find(x => x.id === img.subject), cl = checklist(img, s);
    const b64 = await jpeg(`${OUT}/${img.file}`);
    const res = await transport(`${cl.text}`, b64).catch(e => ({ status: 0, text: "", input: 0, output: 0, seconds: 0, netError: String(e.cause?.code ?? e.message) })); calls++;
    const row = { id: img.id, judge: j.name, model: j.model, httpStatus: res.status, seconds: res.seconds, tokens: { input: res.input, output: res.output }, costUsd: price(j, { input: res.input, output: res.output }) };
    try { const p = JSON.parse(String(res.text).slice(Math.max(0, String(res.text).lastIndexOf('{"must"'))).replace(/^```json\s*|```\s*$/g, '').trim()); row.must = p.must; row.text = p.text; row.pass = Boolean(p.pass); row.note = String(p.note ?? '').slice(0, 160); if (!Array.isArray(p.must) || p.must.length !== cl.items.length) row.error = 'must_length'; } catch { row.error = 'bad_json'; row.raw = String(res.text).slice(0, 700); }
    if (REAL) appendJsonl(judgeFile(j), row); else dryRows.push(row);
    judgeSpent += row.costUsd; judged++;
    if (REAL) await new Promise(r => setTimeout(r, Number(a.delay)));
  }
  console.log(`${j.name}: ${judged} images judged this run${REAL ? '' : ' (fake)'}; judge spend so far US$${judgeSpent.toFixed(4)}`);
  if (!REAL && dryRows.length) console.log(`  sample row: ${JSON.stringify(dryRows[0])}`);
}
console.log(stop ? `STOPPED: ${stop}` : 'done');
