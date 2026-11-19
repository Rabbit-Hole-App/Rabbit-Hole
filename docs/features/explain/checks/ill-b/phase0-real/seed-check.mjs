// ILL-B Phase 0 seed check (owner/Reviewer approved 2026-11-19): three calls with the SAME prompt (P01, form N), size and random_seed:
//   recraftv4_1_flash, recraftv4_1_flash_v2, recraftv4_1_flash_v2 again. Settled about US$0.021.
// The key is read by NAME from the .env file named in ILLB_ENV_FILE and never printed.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const ENV_FILE = (process.env.ILLB_ENV_FILE || (console.error("STOP: set ILLB_ENV_FILE to the .env file that holds RECRAFT_API_KEY"), process.exit(2)));
const m = fs.readFileSync(ENV_FILE, 'utf8').match(/^\s*(?:export\s+)?RECRAFT_API_KEY\s*=\s*(.*?)\s*$/m);
if (!m) { console.error('STOP: RECRAFT_API_KEY not in the env file (name checked)'); process.exit(2); }
const key = m[1].replace(/^(['"])(.*)\1$/, '$2');
const PRODUCT = process.env.ILLB_PRODUCT ?? 'C:/s/r162-int/packages/control-plane/src/';
const P = f => import(pathToFileURL(PRODUCT + f).href);
const { RECRAFT_CONTROLS } = await P('image-providers.js');
const { figurePrompt } = await P('explanation-figures.js');
const { withNoTextSuffix } = await P('learn-primitives.js');
const subjects = JSON.parse(fs.readFileSync(new URL('./subjects.json', import.meta.url), 'utf8')).subjects;
const prompt = figurePrompt(withNoTextSuffix(subjects.find(s => s.id === 'P01').subject));
const SEED = 1299344522; // the seed Phase 0 gave F-P01-N-d1: the same seed, prompt and size on every call
const OUT = 'C:/s/ill-b/run/seed-check/'; fs.mkdirSync(OUT, { recursive: true });
const calls = [{ id: 'seed-F', model: 'recraftv4_1_flash' }, { id: 'seed-F2-a', model: 'recraftv4_1_flash_v2' }, { id: 'seed-F2-b', model: 'recraftv4_1_flash_v2' }];
const rows = [];
for (const c of calls) {
  const t0 = Date.now();
  const res = await fetch('https://external.api.recraft.ai/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, model: c.model, size: '1024x1024', n: 1, response_format: 'url', controls: RECRAFT_CONTROLS, random_seed: SEED }), signal: AbortSignal.timeout(120000) });
  const body = await res.json().catch(() => null);
  const row = { id: c.id, model: c.model, seed: SEED, httpStatus: res.status, requestSeconds: (Date.now() - t0) / 1000, credits: body?.credits ?? null };
  const url = body?.data?.[0]?.url; let bytes = null;
  for (let a = 0; url && a < 3 && !bytes; a++) { try { const d = await fetch(url); if (d.ok) bytes = new Uint8Array(await d.arrayBuffer()); } catch { /* download retry only */ } }
  if (bytes) { const ext = bytes[0] === 0x89 ? 'png' : bytes[0] === 0xff ? 'jpg' : 'webp'; fs.writeFileSync(`${OUT}${c.id}.${ext}`, bytes); row.file = `${c.id}.${ext}`; row.bytes = bytes.length; row.sha256 = crypto.createHash('sha256').update(bytes).digest('hex'); }
  rows.push(row); fs.appendFileSync(`${OUT}results.jsonl`, JSON.stringify(row) + '\n');
  console.log(`${c.id} ${c.model}: HTTP ${row.httpStatus}, ${row.requestSeconds}s, credits ${row.credits}, ${row.file ?? 'no file'} ${row.bytes ?? ''}`);
}
const [f, a, b] = rows;
const same = (x, y) => x?.sha256 && y?.sha256 && x.sha256 === y.sha256;
const verdict = same(f, a) && same(a, b) ? 'F and F2 IDENTICAL and the two F2 calls identical: the old id is an ALIAS of Flash V2 (drop F2 from Phase 1; ILL-3 closes)'
  : !same(a, b) ? 'the two F2 calls DIFFER: seeds are not repeatable; both stay in Phase 1'
  : 'F and F2 DIFFER and the two F2 calls are identical: TWO MODELS; both stay in Phase 1 and ILL-3 becomes "the product id must move"';
console.log('RESULT: ' + verdict);
fs.writeFileSync(`${OUT}result.txt`, verdict + '\n' + JSON.stringify(rows, null, 1) + '\n');
