// ILL-B Phase 1 image loop (experiment, outside the product repo). Spec section 2 (Phase 1) and 6 (speed, price check, extras).
// usage: node phase1.mjs --dry-run                        (default: fake transport, NO network call, writes to a temp dir)
//        node phase1.mjs --real --owner-ok-usd 15 [--delay 300] [--limit N] [--no-extras]   (key RECRAFT_API_KEY by name from ILLB_ENV_FILE)
// Rules: any image id ever sent is never POSTed again automatically (a timeout may be billed); a failed DOWNLOAD retries the download only;
// one call at a time; stop at the phase estimate + 20 %, after 5 consecutive HTTP errors, on a price mismatch, or when the cumulative spend plus what is left (and the judge reserve) would pass the cap.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { CAP, MODELS, OUT as OUT0, appendJsonl, buildPlan, envKey, extOf, readJsonl, settled, usd } from './lib.mjs';

const { values: a } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, real: { type: 'boolean' }, 'owner-ok-usd': { type: 'string' }, delay: { type: 'string', default: '300' }, limit: { type: 'string' }, 'no-extras': { type: 'boolean' } } });
const REAL = Boolean(a.real);
if (REAL && !(Number(a['owner-ok-usd']) > 0)) { console.error('STOP: --real needs --owner-ok-usd <cap>'); process.exit(2); }
if (REAL && Number(a['owner-ok-usd']) > CAP) { console.error(`STOP: the hard cap is US$${CAP}`); process.exit(2); }
const OUT = REAL ? OUT0 : fs.mkdtempSync(path.join(os.tmpdir(), 'illb-dry-'));
if (!REAL) { globalThis.fetch = () => { throw new Error('DRY RUN: a network call was attempted'); }; if (fs.existsSync(`${OUT0}/results.jsonl`)) fs.copyFileSync(`${OUT0}/results.jsonl`, `${OUT}/results.jsonl`); }
fs.mkdirSync(`${OUT}/originals`, { recursive: true });
const resultsFile = `${OUT}/results.jsonl`;

const { calls, extras, problems } = await buildPlan();
if (problems.length) { console.error('ASSERTIONS FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
const unitsOf = r => r.units ?? MODELS.find(m => m.id === r.model)?.units ?? 7;
const seedRows = readJsonl(`${OUT0}/seed-check/results.jsonl`), judgeUsd = readJsonl(`${OUT0}/scores/judge-sonnet.jsonl`).concat(readJsonl(`${OUT0}/scores/judge-gemini.jsonl`)).reduce((s, r) => s + (r.costUsd ?? 0), 0); // seed check credits and judge costs count toward the cumulative spend
const rows = readJsonl(resultsFile);
const requested = new Set(rows.map(r => r.id));
// order: by prompt form, then arm, so a stop leaves balanced coverage; the speed extras last
const order = [...new Set(calls.map(c => `${c.subject}-${c.form}`))].flatMap(k => MODELS.map(m => calls.find(c => c.arm === m.arm && `${c.subject}-${c.form}` === k)));
let todo = [...order, ...(a['no-extras'] ? [] : extras)].filter(c => !requested.has(c.id));
if (a.limit) todo = todo.slice(0, Number(a.limit));
const estimateLeft = todo.reduce((s, c) => s + usd(c.units), 0);
const stopLine = estimateLeft * 1.2;
const judgeReserve = 1.89 * 1.2; // the two judges' estimate + 20 %: kept free under the cap
const spentBefore = settled(rows, unitsOf) + settled(seedRows, unitsOf) + judgeUsd;
const log = s => console.log(s);
log(`ILL-B Phase 1 ${REAL ? 'REAL' : 'DRY RUN (fake transport, temp dir, NO network call)'}`);
log(`plan: ${calls.length} images (${MODELS.map(m => `${m.arm} ${calls.filter(c => c.arm === m.arm).length}`).join(', ')}) + ${extras.length} speed extras (10 url + 10 multipart, F); already sent (never re-POSTed): ${requested.size}; to do now: ${todo.length} (${todo.filter(c => !c.mode).length} images, ${todo.filter(c => c.mode).length} extras)`);
log(`estimate for this run US$${estimateLeft.toFixed(3)}; STOP LINE (estimate + 20 %) US$${stopLine.toFixed(3)} settled in this run; cumulative spend so far US$${spentBefore.toFixed(3)}; cap US$${CAP}; judge reserve US$${judgeReserve.toFixed(2)} kept free: stop if spent + left + reserve > cap`);
log(`stops: 5 consecutive HTTP errors; credits != price; any attempt at a call already sent. concurrency 1, delay ${a.delay} ms; the owner's OK flag: ${a['owner-ok-usd'] ?? '(not needed in a dry run)'}`);

// ---- transports ----
const parseMultipart = (buf, contentType) => {
  const m = /boundary="?([^";]+)"?/i.exec(contentType ?? ''); if (!m) throw new Error('multipart: no boundary');
  const text = Buffer.from(buf), delim = Buffer.from('--' + m[1]); const out = { image: null, imageType: null, json: null };
  let pos = text.indexOf(delim);
  while (pos >= 0) {
    const next = text.indexOf(delim, pos + delim.length); if (next < 0) break;
    const part = text.subarray(pos + delim.length, next), split = part.indexOf('\r\n\r\n'); if (split < 0) { pos = next; continue; }
    const head = part.subarray(0, split).toString('latin1'), data = part.subarray(split + 4, part.length - 2); // strip the CRLF before the next delimiter
    const ct = /content-type:\s*([^\r\n;]+)/i.exec(head)?.[1]?.trim().toLowerCase() ?? '';
    if (ct.startsWith('image/')) { out.image = new Uint8Array(data); out.imageType = ct; } else if (ct.includes('json')) { try { out.json = JSON.parse(data.toString('utf8')); } catch { /* ignore */ } }
    pos = next;
  }
  return out;
};
const realTransport = key => ({
  async post(c) { const res = await fetch('https://external.api.recraft.ai/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(c.body), signal: AbortSignal.timeout(120000) });
    if (c.mode === 'multipart') { const buf = new Uint8Array(await res.arrayBuffer()); if (res.status !== 200) return { status: res.status, json: null }; const p = parseMultipart(buf, res.headers.get('content-type')); return { status: 200, json: p.json, bytes: p.image, raw: buf }; }
    return { status: res.status, json: await res.json().catch(() => null) }; },
  async download(url) { const d = await fetch(url); if (!d.ok) throw new Error('download ' + d.status); return new Uint8Array(await d.arrayBuffer()); },
});
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const fakeTransport = { // proves the loop, resume, download retry, multipart parsing and the stops without any network call
  failDownloadOnce: new Set(['F-P01-L-d1']), seen: new Set(),
  async post(c) { if (c.mode === 'multipart') { const b = '----fake'; const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ credits: 7 })}\r\n--${b}\r\nContent-Type: image/webp\r\n\r\n`), Buffer.from([0x52, 0x49, 0x46, 0x46, 9, 9]), Buffer.from(`\r\n--${b}--\r\n`)]); const p = parseMultipart(body, `multipart/form-data; boundary=${b}`); return { status: 200, json: p.json, bytes: p.image }; }
    return { status: 200, json: { data: [{ url: 'fake://' + c.id }], credits: c.units } }; },
  async download(url) { const id = url.slice(7); if (this.failDownloadOnce.has(id) && !this.seen.has(id)) { this.seen.add(id); throw new Error('download 503'); } return png(); },
};
const transport = REAL ? realTransport(envKey('RECRAFT_API_KEY')) : fakeTransport;
const sleep = ms => (REAL ? new Promise(r => setTimeout(r, ms)) : null);

// ---- loop ----
let runSpent = 0, consecutiveErrors = 0, done = 0, stop = null; const firstOfModel = new Set(rows.filter(r => r.first).map(r => r.model));
for (const [i, c] of todo.entries()) {
  const left = todo.slice(i).reduce((s, x) => s + usd(x.units), 0);
  if (runSpent + usd(c.units) > stopLine) { stop = `stop line US$${stopLine.toFixed(3)} (estimate + 20 %) reached`; break; }
  if (spentBefore + runSpent + left + judgeReserve > CAP + 1e-9) { stop = `cap: spent ${(spentBefore + runSpent).toFixed(3)} + left ${left.toFixed(3)} + judge reserve ${judgeReserve.toFixed(2)} would pass US$${CAP}`; break; }
  const t0 = Date.now(); const row = { id: c.id, subject: c.subject, model: c.model, form: c.form, phase: 1, draw: c.draw, ...(c.mode ? { mode: c.mode } : {}), prompt: c.prompt, seed: c.seed, first: !firstOfModel.has(c.model) };
  firstOfModel.add(c.model);
  let res; try { res = await transport.post(c); } catch (e) { res = { status: null, error: String(e.message ?? e).slice(0, 120) }; }
  row.httpStatus = res.status; row.requestSeconds = (Date.now() - t0) / 1000; row.credits = res.json?.credits ?? null; row.billed = res.status === 200;
  if (res.error) row.error = res.error;
  let bytes = res.bytes ?? null; const url = res.json?.data?.[0]?.url, t1 = Date.now();
  for (let k = 0; !bytes && url && k < 3; k++) { try { bytes = await transport.download(url); } catch { /* retry the DOWNLOAD only: the paid request is never repeated */ } }
  row.downloadSeconds = url ? (Date.now() - t1) / 1000 : 0; row.totalSeconds = row.requestSeconds + row.downloadSeconds;
  if (bytes) { row.type = extOf(bytes); row.bytes = bytes.length; row.file = `originals/${c.id}.${row.type}`; fs.writeFileSync(`${OUT}/${row.file}`, bytes); }
  else if (res.raw) { row.file = `originals/${c.id}.bin`; row.error = 'multipart_parse'; fs.writeFileSync(`${OUT}/${row.file}`, res.raw); }
  else if (res.status === 200) row.error = 'download_failed'; // the image id stays 'sent': the lead downloads it by hand from the url if it matters
  appendJsonl(resultsFile, row); done++;
  const spent = Number.isFinite(row.credits) ? usd(row.credits) : (res.status && res.status !== 200 ? 0 : usd(c.units)); runSpent += spent;
  consecutiveErrors = res.status === 200 ? 0 : consecutiveErrors + 1;
  if (REAL) log(`${c.id}: HTTP ${row.httpStatus}, ${row.requestSeconds}s, credits ${row.credits}${row.error ? ', ' + row.error : ''}; run spent US$${runSpent.toFixed(3)}`);
  if (Number.isFinite(row.credits) && row.credits !== c.units) { stop = `PRICE MISMATCH on ${c.id}: credits ${row.credits}, expected ${c.units}`; break; }
  if (consecutiveErrors >= 5) { stop = '5 consecutive HTTP errors'; break; }
  await sleep(Number(a.delay));
}
const all = readJsonl(resultsFile);
log(`${REAL ? 'REAL' : 'DRY RUN'} finished: ${done} calls made${stop ? `; STOPPED: ${stop}` : ''}; run spend US$${runSpent.toFixed(3)}; rows ${all.length}`);
if (!REAL) {
  const ok = all.filter(r => r.file).length, mp = all.filter(r => r.mode === 'multipart' && r.type).length;
  log(`dry-run checks: files written ${ok}; multipart extras parsed ${mp} of 10; the download-failure id F-P01-L-d1 retried the download and was POSTed once: ${all.filter(r => r.id === 'F-P01-L-d1').length === 1 && all.find(r => r.id === 'F-P01-L-d1').file ? 'yes' : 'NO'}`);
  const again = todo.filter(c => !new Set(all.map(r => r.id)).has(c.id)).length; log(`resume check: after this run ${again} planned calls remain to send; a second run would POST none of the ${all.length} ids already sent`);
  fs.rmSync(OUT, { recursive: true, force: true });
}
