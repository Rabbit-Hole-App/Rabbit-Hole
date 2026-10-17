// The two owner demos for durable file jobs on a dev clone, in a real browser (Playwright Chromium, never the user's
// Chrome), against the dev converter. Owner decision A, 2026-10-16.
//
//   DEV_TEST_BYPASS=<rabbit-hole-cp-dev test secret> node file-jobs-dev-demo.mjs 1 --base <clone origin> --file deck.pptx
//     Upload and submit from the page, close the browser context, wait, open a NEW context and show the result.
//   DEV_TEST_BYPASS=... node file-jobs-dev-demo.mjs 2 --base <clone origin> --file deck-40.pptx --machine <fly machine id>
//     Submit, SIGKILL-stop the converter machine once the job is Converting, start it again after the lease expires,
//     and show recovery: one card, one job, distinct derivatives whose bytes hash to their D1 sha256.
//
// Options: --cp <dev control plane origin> (default https://rabbit-hole-cp-dev.tryrabbithole.workers.dev), --fly-app
// (default rabbit-hole-convert-dev), --out <evidence json>, --shots <dir>. Prints no secret and no session.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { chromium } from 'playwright';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const demo = process.argv[2], BASE = new URL(arg('base')).origin, CP = new URL(arg('cp', 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev')).origin;
const HEALTH = arg('converter-health', 'https://rabbit-hole-convert-dev.fly.dev/health'), FILE = arg('file'), APP = arg('fly-app', 'rabbit-hole-convert-dev'), MACHINE = arg('machine'), OUT = arg('out'), SHOTS = arg('shots');
if (!['1', '2'].includes(demo) || !FILE || !process.env.DEV_TEST_BYPASS || (demo === '2' && !/^[a-f0-9]{14}$/.test(MACHINE || ''))) {
  console.error('usage: DEV_TEST_BYPASS=... node file-jobs-dev-demo.mjs 1|2 --base <clone> --file <pptx> [--machine <id>]'); process.exit(2);
}
const t0 = Date.now(), at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const pt = () => new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: false });
const timeline = [], say = line => { timeline.push({ t: at(), pt: pt(), line }); console.log(`${pt()} PT  +${at()}  ${line}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = Date.now().toString(36).slice(-6), email = `fijobs-demo-${run}@example.com`;

const minted = await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret: process.env.DEV_TEST_BYPASS, handle: `fijobs_${run}` }) });
if (!minted.ok) throw new Error(`test session refused: ${minted.status}`);
const session = (await minted.json()).session;
const browser = await chromium.launch();
const openContext = async () => {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addCookies([{ name: 'small_session', value: session, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  await page.goto(`${BASE}/api/apps`);
  return { context, page };
};
// Everything the browser does goes through the page's own fetch, with the page's cookie.
const inPage = (page, fn, args) => page.evaluate(fn, args);

const health = async () => { try { const h = await (await fetch(HEALTH, { signal: AbortSignal.timeout(20_000) })).json(); return { version: h.version, converters: h.converters }; } catch (error) { return { error: error.message }; } };
const converterBefore = await health();
say(`converter ${converterBefore.version || converterBefore.error}`);
const bytes = readFileSync(FILE), name = basename(FILE);
let { context, page } = await openContext();
say(`signed in as a test user on ${BASE}`);
const made = await inPage(page, async ({ name, b64 }) => {
  const j = async (url, init) => { const r = await fetch(url, init); const body = await r.json().catch(() => null); if (!r.ok) throw new Error(`${init?.method || 'GET'} ${url}: ${r.status} ${body?.error || ''}`); return body; };
  const send = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const file = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const hex = buf => [...new Uint8Array(buf)].map(n => n.toString(16).padStart(2, '0')).join('');
  const sha = hex(await crypto.subtle.digest('SHA-256', file));
  const canvas = await j('/api/canvases', send('POST', { title: `File jobs demo ${new Date().toISOString().slice(11, 19)}` }));
  const board = `/api/learn/boards/${canvas.name}/main`;
  const empty = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
  const save = async state => j(board, send('PUT', { state, version: (await j(board)).version }));
  await save(empty);
  const type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const declared = await j('/api/learn/files', send('POST', { app: canvas.name, board: 'main', name, type, size: file.byteLength, sha256: sha, family: 'presentation' }));
  if (declared.upload) await j(declared.upload.url || `/api/learn/files/${declared.source.id}`, { method: 'PUT', headers: { 'content-type': type }, body: file });
  const card = 'deck-card-1', key = `card:${card}:slides:${sha.slice(0, 16)}`;
  const submitted = await j(`/api/learn/files/${declared.source.id}/jobs`, send('POST', { converter: 'slides', options: {}, card, app: canvas.name, board: 'main', idempotency_key: key }));
  await save({ ...empty, blocks: [{ id: card, type: 'file', kind: 'presentation', dx: 0, dy: 0, w: 480, h: 320, label: name,
    fileRef: { v: 1, source: { id: declared.source.id, rev: sha }, family: 'presentation', meta: { name, type, size: file.byteLength }, job: submitted.job.id, status: { preview: 'pending', context: 'none' } } }] });
  return { canvas: canvas.name, source: declared.source.id, rev: sha, job: submitted.job, key, card };
}, { name, b64: bytes.toString('base64') });
say(`uploaded ${name} (${bytes.byteLength} bytes) as ${made.source}; job ${made.job.id} ${made.job.state}; card saved on ${made.canvas}`);

// Read status from the page: GET only, never a submit.
const status = async p => inPage(p, async id => (await (await fetch(`/api/learn/files/jobs/${id}`)).json()).job, made.job.id);
const fly = (...args) => execFileSync('fly', [...args, '-a', APP], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const evidence = { demo, base: BASE, canvas: made.canvas, source: made.source, rev: made.rev, job: made.job.id, file: name, bytes: bytes.byteLength };

if (demo === '1') {
  await context.close();
  say('browser context closed: nothing in any browser polls or holds the job now');
  await sleep(Number(arg('away', '45')) * 1000);
  ({ context, page } = await openContext());
  say('a new browser context opens the canvas again');
} else {
  let job;
  for (;;) { job = await status(page); if (job.state === 'converting' || ['ready', 'ready_with_limitations', 'failed'].includes(job.state)) break; await sleep(250); }
  if (job.state !== 'converting') throw new Error(`the job finished (${job.state}) before it could be interrupted; use a slower fixture`);
  fly('machine', 'stop', MACHINE, '--signal', 'SIGKILL');
  say(`converter machine ${MACHINE} SIGKILL-stopped while the job was ${job.state} (attempt ${job.attempt})`);
  evidence.killedAt = { pt: pt(), t: at(), stage: job.stage, attempt: job.attempt };
  for (;;) { job = await status(page); if (job.attempt > evidence.killedAt.attempt || ['ready', 'ready_with_limitations', 'failed', 'cancelled'].includes(job.state)) break; await sleep(2000); }
  say(`lease expired: job is ${job.state}, attempt ${job.attempt}`);
  fly('machine', 'start', MACHINE);
  say(`converter machine ${MACHINE} started again`);
}

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
await page.goto(`${BASE}/apps/${made.canvas}?tab=learn`);
let job;
for (;;) { job = await status(page); if (['ready', 'ready_with_limitations', 'failed', 'cancelled'].includes(job.state)) break; await sleep(2000); }
say(`job ${job.state} on attempt ${job.attempt}`);
const result = await inPage(page, async ({ m }) => {
  const hex = buf => [...new Uint8Array(buf)].map(n => n.toString(16).padStart(2, '0')).join('');
  const board = await (await fetch(`/api/learn/boards/${m.canvas}/main`)).json();
  const cards = (board.state?.blocks || []).filter(b => b.fileRef?.source?.id === m.source);
  const again = await (await fetch(`/api/learn/files/${m.source}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ converter: 'slides', options: {}, card: m.card, app: m.canvas, board: 'main', idempotency_key: m.key }) })).json();
  const options = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('{}')));
  const listed = await (await fetch(`/api/learn/files/sources/${m.source}/derivatives?sha=${m.rev}&converter=slides&options=${options}&app=${m.canvas}`)).json();
  const files = [];
  for (const d of listed.derivatives || []) {
    const r = await fetch(`/api/learn/files/${m.source}/d/${d.id}`);
    const body = new Uint8Array(await r.arrayBuffer());
    files.push({ id: d.id, name: d.name, kind: d.kind, converterVersion: d.converter_version, type: r.headers.get('content-type'), bytes: body.byteLength, d1Bytes: d.bytes, sha256: hex(await crypto.subtle.digest('SHA-256', body)), d1Sha256: r.headers.get('x-content-sha256'), magic: String.fromCharCode(...body.slice(0, 4)) });
  }
  return { cards: cards.length, resubmit: { job: again.job?.id, created: again.created }, files };
}, { m: made });
if (SHOTS) await page.screenshot({ path: `${SHOTS}/demo${demo}-canvas.png` });
await browser.close();

const names = result.files.map(f => f.name);
const checks = {
  settled: ['ready', 'ready_with_limitations'].includes(job.state),
  oneCard: result.cards === 1,
  sameJobOnResubmit: result.resubmit.job === made.job.id && result.resubmit.created === false,
  distinctDerivatives: names.length > 0 && new Set(names).size === names.length && names.length === job.derivatives.length,
  bytesMatchD1: result.files.every(f => f.sha256 === f.d1Sha256 && f.bytes === f.d1Bytes),
  validHeaders: result.files.filter(f => f.type === 'application/pdf').every(f => f.magic === '%PDF') && result.files.filter(f => f.type === 'image/png').every(f => f.magic === '\x89PNG'),
  ...(demo === '2' ? { recoveredOnLaterAttempt: job.attempt > evidence.killedAt.attempt } : {}),
};
Object.assign(evidence, { converter: { before: converterBefore, after: await health() }, final: { state: job.state, attempt: job.attempt, limitations: job.limitations, error: job.error, created_at: job.created_at, finished_at: job.finished_at, conversionSeconds: job.finished_at && job.created_at ? (job.finished_at - job.created_at) / 1000 : null }, result, checks, timeline, pass: Object.values(checks).every(Boolean) });
for (const [k, v] of Object.entries(checks)) say(`${v ? 'PASS' : 'FAIL'}  ${k}`);
say(`${result.files.length} derivatives: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', ...' : ''}`);
if (OUT) writeFileSync(OUT, JSON.stringify(evidence, null, 2));
say(evidence.pass ? `demo ${demo} PASS` : `demo ${demo} FAIL`);
process.exit(evidence.pass ? 0 : 1);
