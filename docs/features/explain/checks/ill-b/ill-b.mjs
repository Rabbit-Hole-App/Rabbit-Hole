// ILL-B harness (experiment, outside the product repo; copy to scripts/explain-bench/ill-b/ only when the owner says so).
// usage: node ill-b.mjs --dry-run                       (default; no network: fetch is replaced by a function that throws)
//        node ill-b.mjs --real --phase0 --owner-ok-usd 15  (one real call per model; NOT RUN until the owner's OK)
// Prompts are built with the PRODUCT's own functions, read from a read-only checkout (no product file is edited).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, real: { type: 'boolean' }, phase0: { type: 'boolean' }, 'owner-ok-usd': { type: 'string' }, product: { type: 'string', default: 'C:/s/r162-int/packages/control-plane/src/' }, out: { type: 'string', default: 'C:/s/ill-b/run' }, 'no-f2': { type: 'boolean' } } });
const REAL = Boolean(a.real);
if (REAL && !(Number(a['owner-ok-usd']) > 0)) { console.error('STOP: --real needs --owner-ok-usd <cap> (the owner has not given an OK in this script run)'); process.exit(2); }
if (!REAL) globalThis.fetch = () => { throw new Error('DRY RUN: a network call was attempted'); }; // proof that the dry run makes none

const P = f => import(pathToFileURL(a.product + f).href);
const { RECRAFT_CONTROLS } = await P('image-providers.js');
const { figurePrompt, FIGURE_STYLE } = await P('explanation-figures.js');
const { withNoTextSuffix, AUTHOR_PICTURE_LIMITS, NO_TEXT_SUFFIX } = await P('learn-primitives.js');
const { mtokRates, priceUsage } = await P('pricing-registry.js');

// Models and the expected price in API units (Recraft pricing page: V4.1 Flash 7, V4.1 35, V4.1 Vector 80; $0.001 per unit). F2 = Flash V2 (docs: replaces Flash, raster only, $0.007).
const MODELS = [
  { arm: 'F', id: 'recraftv4_1_flash', units: 7 },
  { arm: 'S', id: 'recraftv4_1', units: 35 },
  { arm: 'V', id: 'recraftv4_1_vector', units: 80 },
  ...(a['no-f2'] ? [] : [{ arm: 'F2', id: 'recraftv4_1_flash_v2', units: 7 }]),
];
const subjects = JSON.parse(fs.readFileSync(new URL('./subjects.json', import.meta.url), 'utf8')).subjects;

// Prompt forms (spec section 2). N = today's pipeline exactly; L = labels allowed, no suffix, at most four labels, the whole subject <= 400 characters.
const labelSentence = labels => ` Label the parts with exactly these words and no others: ${labels.map(l => `"${l}"`).join(', ')}.`;
const forms = [];
for (const s of subjects) {
  forms.push({ subject: s.id, form: 'N', subjectText: s.subject, prompt: figurePrompt(withNoTextSuffix(s.subject)) });
  const wantsL = s.group !== 'physical' || ['P01', 'P02', 'P03', 'P04', 'P05'].includes(s.id);
  if (wantsL) { const t = s.subject + labelSentence(s.labels); forms.push({ subject: s.id, form: 'L', subjectText: t, prompt: `${FIGURE_STYLE}\n\nSubject: ${t}` }); }
}
// Assertions (spec section 3 item 2): N subject <= 200 characters (the author limit, the suffix is added after it), L whole subject <= 400, L at most four labels.
const problems = [];
for (const f of forms) {
  const s = subjects.find(x => x.id === f.subject);
  if (f.form === 'N' && s.subject.length > AUTHOR_PICTURE_LIMITS.prompt) problems.push(`${f.subject} N: subject ${s.subject.length} > ${AUTHOR_PICTURE_LIMITS.prompt}`);
  if (f.form === 'L' && (f.subjectText.length > 400 || s.labels.length > 4)) problems.push(`${f.subject} L: ${f.subjectText.length} chars / ${s.labels.length} labels`);
}
if (forms.length !== 55) problems.push(`expected 55 prompt forms, built ${forms.length}`);

const hash31 = text => crypto.createHash('sha256').update(text).digest().readUInt32BE(0) & 0x7fffffff; // random_seed from the image id, recorded in results
const calls = [];
for (const m of MODELS) for (const f of forms) { const id = `${m.arm}-${f.subject}-${f.form}-d1`; calls.push({ id, arm: m.arm, model: m.id, subject: f.subject, form: f.form, draw: 1, units: m.units, seed: hash31(id), prompt: f.prompt, body: { prompt: f.prompt, model: m.id, size: '1024x1024', n: 1, response_format: 'url', controls: RECRAFT_CONTROLS, random_seed: hash31(id) } }); }

// Resume: a finished image id is never requested again (spec item 7); a failed DOWNLOAD retries the download only, never the paid request (item 6).
fs.mkdirSync(a.out, { recursive: true });
const resultsFile = `${a.out}/results.jsonl`;
const rows = fs.existsSync(resultsFile) ? fs.readFileSync(resultsFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const requested = new Set(rows.map(r => r.id)); // any id that was ever sent (answered, failed or timed out: a timeout may still be billed) is never POSTed again automatically
const todo = calls.filter(c => !requested.has(c.id));

const settledUsd = rows.reduce((s, r) => s + (Number.isFinite(r.credits) ? r.credits : 0), 0) / 1000;
const tokens = { image: 1400, text: 700, out: 300 }; // judge input per image (1024 px image about 1,400 tokens, checklist text 700), JSON out 300: an estimate, priced from the repo's registry
const son = mtokRates('anthropic', 'claude-sonnet-5-5'); // [in, out, cacheRead] USD/MTok
const judgeSonnet = ((tokens.image + tokens.text) * son[0] + tokens.out * son[1]) / 1e6;
const gem = priceUsage({ provider: 'google', model: 'gemini-3.5-flash-lite', quantities: { input: tokens.image + tokens.text, output: tokens.out } }).micros / 1e6;
const usd = u => (u / 1000);

const perModel = Object.fromEntries(MODELS.map(m => [m.arm, calls.filter(c => c.arm === m.arm).length]));
const phase1 = MODELS.reduce((s, m) => s + perModel[m.arm] * usd(m.units), 0);
const phase1NoF2 = MODELS.filter(m => m.arm !== 'F2').reduce((s, m) => s + perModel[m.arm] * usd(m.units), 0);
const phase0Real = MODELS.reduce((s, m) => s + usd(m.units), 0);
const speedExtra = 20 * usd(7); // ten F calls with response_format url and ten with multipart (spec section 6)
const nImages = calls.length;
const judges = nImages * (judgeSonnet + gem);
const phase2 = 5; // the spec's ceiling
const total = phase0Real + phase1 + speedExtra + judges + phase2;
const CAP = 15;

const lines = [];
const out = s => { lines.push(s); console.log(s); };
out(`ILL-B ${REAL ? 'REAL' : 'DRY RUN'} (no network call in a dry run: fetch is replaced and would throw). Product code read from ${a.product} (read-only).`);
out(`prompt forms ${forms.length} (N ${forms.filter(f => f.form === 'N').length}, L ${forms.filter(f => f.form === 'L').length}); arms ${MODELS.map(m => `${m.arm}=${m.id} (${m.units} units)`).join(', ')}`);
out(`planned calls ${nImages} (${Object.entries(perModel).map(([k, v]) => `${k} ${v}`).join(', ')}); finished before this run ${requested.size}; still to do ${todo.length}`);
const nLen = forms.filter(f => f.form === 'N').map(f => subjects.find(s => s.id === f.subject).subject.length), lLen = forms.filter(f => f.form === 'L').map(f => f.subjectText.length);
out(`N subject length: max ${Math.max(...nLen)} (limit ${AUTHOR_PICTURE_LIMITS.prompt}), over limit ${nLen.filter(n => n > AUTHOR_PICTURE_LIMITS.prompt).length}; L whole subject: max ${Math.max(...lLen)} (limit 400), over ${lLen.filter(n => n > 400).length}; full prompt incl. FIGURE_STYLE: N max ${Math.max(...forms.filter(f => f.form === 'N').map(f => f.prompt.length))}, L max ${Math.max(...forms.filter(f => f.form === 'L').map(f => f.prompt.length))}`);
out(problems.length ? `ASSERTIONS FAILED:\n  ${problems.join('\n  ')}` : 'assertions: 55 forms; every N subject <= 200; every L whole subject <= 400 and <= 4 labels: OK');
out(`request body (one call): ${JSON.stringify({ ...calls[0].body, prompt: '<prompt>', controls: '<RECRAFT_CONTROLS: background #FFFCF0 + 8 colours>' })}; random_seed = sha256(image id) & 0x7fffffff, recorded per row`);
out(`cost estimate (USD): Phase 0 real (one call per model, ${MODELS.length} images) ${phase0Real.toFixed(3)}; Phase 1 ${nImages} images ${phase1.toFixed(2)} (${MODELS.map(m => `${m.arm} ${(perModel[m.arm] * usd(m.units)).toFixed(2)}`).join(' + ')}${a['no-f2'] ? '' : `; without F2 ${phase1NoF2.toFixed(2)}`}); speed extras (10 url + 10 multipart, F) ${speedExtra.toFixed(2)}; judges ${judges.toFixed(2)} (Sonnet 5.5 ${judgeSonnet.toFixed(4)} + Gemini 3.5 Flash Lite ${gem.toFixed(4)} per image, ${nImages} images; rates from the repo registry, tokens are an estimate); Phase 2 ceiling ${phase2.toFixed(2)}`);
out(`TOTAL ${total.toFixed(2)} against the cap US$${CAP} (headroom ${(CAP - total).toFixed(2)}); settled so far ${settledUsd.toFixed(3)}`);
fs.writeFileSync(`${a.out}/plan.tsv`, ['id\tmodel\tform\tprompt_chars\tseed\tunits', ...calls.map(c => `${c.id}\t${c.model}\t${c.form}\t${c.prompt.length}\t${c.seed}\t${c.units}`)].join('\n') + '\n');
fs.writeFileSync(`${a.out}/dry-run.txt`, lines.join('\n') + '\n');

if (!REAL) {
  // fake transport: proves the loop, resume and download-retry logic without any network.
  const fake = { post: async c => ({ status: 200, body: { data: [{ url: 'https://example.invalid/x' }], credits: c.units } }), download: async () => new Uint8Array([1, 2, 3]) };
  let posts = 0; for (const c of calls.slice(0, 3)) { await fake.post(c); posts++; }
  console.log(`fake transport: ${posts} simulated requests, 0 network calls; first three ids: ${calls.slice(0, 3).map(c => c.id).join(', ')}`);
  process.exit(problems.length ? 1 : 0);
}
// REAL path (Phase 0: one call per model). Not run in this lane.
if (!a.phase0) { console.error('STOP: only --phase0 is built (the owner approves later phases separately)'); process.exit(2); }
const key = process.env.RECRAFT_API_KEY; if (!key) { console.error('STOP: RECRAFT_API_KEY is not in the environment (the runner loads it by name from small-deploy/.env)'); process.exit(2); }
const first = MODELS.map(m => calls.find(c => c.arm === m.arm && c.subject === 'P01' && c.form === 'N')).filter(c => c && !requested.has(c.id));
for (const c of first) {
  const t0 = Date.now(); let res, body;
  try { res = await fetch('https://external.api.recraft.ai/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(c.body), signal: AbortSignal.timeout(120000) }); body = await res.json().catch(() => null); } catch (e) { fs.appendFileSync(resultsFile, JSON.stringify({ id: c.id, error: String(e.message).slice(0, 120), httpStatus: null }) + '\n'); continue; }
  const row = { id: c.id, subject: c.subject, model: c.model, form: c.form, phase: 0, draw: 1, prompt: c.prompt, seed: c.seed, httpStatus: res.status, requestSeconds: (Date.now() - t0) / 1000, credits: body?.credits ?? null, billed: res.status === 200 };
  const url = body?.data?.[0]?.url; let bytes = null;
  for (let attempt = 0; url && attempt < 3 && !bytes; attempt++) { try { const d = await fetch(url); if (d.ok) bytes = new Uint8Array(await d.arrayBuffer()); } catch { /* download retry only; the paid request is never repeated */ } }
  if (bytes) { const ext = bytes[0] === 0x3c ? 'svg' : bytes[0] === 0x89 ? 'png' : bytes[0] === 0xff ? 'jpg' : 'webp'; fs.mkdirSync(`${a.out}/originals`, { recursive: true }); fs.writeFileSync(`${a.out}/originals/${c.id}.${ext}`, bytes); row.bytes = bytes.length; row.type = ext; } else row.error = 'download failed (the picture is billed: retry the download later, never the request)';
  fs.appendFileSync(resultsFile, JSON.stringify(row) + '\n');
  console.log(`${c.id}: HTTP ${row.httpStatus}, ${row.requestSeconds}s, credits ${row.credits} (expected ${c.units}), ${row.type ?? 'no file'} ${row.bytes ?? ''}`);
}
