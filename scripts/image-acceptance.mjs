// OWNER COMMAND (production, paid): the deployed owner-only acceptance of /image generation on https://digrabbithole.com (docs/features/image-jobs.md 6d).
//   node scripts/image-acceptance.mjs --dry-run      offline: prints the plan, the per-run maxima and the total. Reads no credential, contacts nothing, books nothing.
//   node scripts/image-acceptance.mjs [--runs a,b] [--api-only] [--other-session] [--force] [--out DIR]
// Signs in as YOU with your browser's small_session cookie for digrabbithole.com, pasted at a hidden prompt (kept in memory, sent only to the
// production origin, never printed or written). Every run that can reach a provider is booked in the shared budget BEFORE its request is sent
// (C:/s/spec/budget/budget.mjs reserve) and settled afterwards with the cost the job recorded; a run whose outcome is unknown stays booked at its maximum.
// It stops at the first failure. Re-running skips runs that already have a PASS receipt in --out (--force repeats them).
// Order: the free refusal paths first (a broken pipeline stops before any paid call), then one paid run per model.
// What a paid run proves through the DEPLOYED path (docs/features/image-jobs.md 6f): the plan's signed quote in credits as three separate numbers (estimate <= the
// most it can cost <= the temporary hold, equal to this checkout's configuration), one job for a double press and none for a different press of the spent plan, the
// operator inspect (owner-only path), the stored image (hash, type, size, signature), credits charged equal to min(the recorded real cost, the signed maximum) and
// never above that maximum, the difference the platform absorbed, the hold released, the same charge after a reload and, in UI mode, that the image card is placed
// by your browser, persisted on the board and still there after a reload. Both edit paths run (Sunburst and Nano Banana 2.1, each with a reference). It does not
// judge how the card looks: you do, at the prompts.
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { imageCost, imageQuote } from '../packages/control-plane/src/image-providers.js';
import { imageCard, imageGenerationId } from '../packages/web/src/generate-image.js';

export const ORIGIN = 'https://digrabbithole.com';
export const BOOK_USD = 0.2; // what a paid run books in the shared budget BEFORE its request (Pro: 0.40): above every hold but Pro's (0.05, 0.10) and far above the real cost seen (0.006 to 0.146). Unchanged discipline: reserve before the run, settle after
export const FREE_MAX_USD = 0.02; // a refusal or injected-fault run sends nothing to a provider; this covers the worst case if the deployed code ignored the fault (one flare call, about 0.0063)
// The Worker configuration this checkout would deploy (packages/web/wrangler.rabbit-hole-prod.jsonc): the per-model hold and maximum charge the deployed plan must carry.
export function loadConfig(file = new URL('../packages/web/wrangler.rabbit-hole-prod.jsonc', import.meta.url)) {
  const vars = JSON.parse(readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '')).vars;
  return { IMAGE_GENERATE_RESERVED_USD: vars.IMAGE_GENERATE_RESERVED_USD, IMAGE_RESERVED_USD_BY_MODEL: vars.IMAGE_RESERVED_USD_BY_MODEL, IMAGE_MAX_CHARGE_USD_BY_MODEL: vars.IMAGE_MAX_CHARGE_USD_BY_MODEL };
}
const quoteOf = (cfg, run, prompt) => imageQuote(cfg, { model: run.model, ...run.settings }, run.references ?? 0, new TextEncoder().encode(prompt).length);
// Image input tokens a provider billed: proof that a reference reached the model (OpenAI usage details; Google usage by modality).
export const imageInputTokens = u => u?.input_tokens_details?.image_tokens ?? (u?.input_tokens_by_modality || []).filter(m => m.modality === 'image').reduce((n, m) => n + m.tokens, 0);
const OPENAI = { quality: 'low', aspect_ratio: '1:1', resolution: '1K' }, GOOGLE = { aspect_ratio: '1:1', resolution: '1K' };
const PROMPT = 'A small red lighthouse on a rock at dusk, flat illustration.';
// The worst-priced enabled combination is Nano Banana Pro 1K with the longest prompt the quote bounds (4,000 bytes): the Pro run sends about 3,900 so its shown price is the
// maximum a learner can be quoted for an enabled row, and its thinking tokens (unpublished, unbounded by the adapter) are the one thing the 0.20 hold cannot prove.
const LONG_PROMPT = `${PROMPT} ${'Keep the sea calm, the rock dark and the sky warm. '.repeat(75)}`.slice(0, 3900).trim();
// kind: paid (a real provider call, booked at BOOK_USD) or free. ui: the owner presses Generate in the browser (the only way the image card is placed).
export const RUNS = {
  'refuse-unready': { kind: 'free', model: 'gpt-image-2.5-flare', settings: { ...OPENAI, quality: 'medium' }, refusal: 'image_not_ready' },
  // A plan whose signed maximum was raised by one credit: the signature no longer matches, so Generate is refused and nothing is created or held.
  'refuse-tampered-max': { kind: 'free', model: 'gpt-image-2.5-flare', settings: OPENAI, refusal: 'proposal_refused', tamper: 'max' },
  'fault-provider_400': { kind: 'free', model: 'gpt-image-2.5-flare', settings: OPENAI, fault: 'provider_400', expect: { stage: 'failed', reason: 'provider_rejected' } },
  'fault-provider_429': { kind: 'free', model: 'gpt-image-2.5-flare', settings: OPENAI, fault: 'provider_429', expect: { stage: 'failed', reason: 'provider_rejected' } },
  'fault-network': { kind: 'free', model: 'gpt-image-2.5-flare', settings: OPENAI, fault: 'network', expect: { stage: 'unknown', reason: 'outcome_unknown' } },
  'fault-invalid_output': { kind: 'free', model: 'gpt-image-2.5-flare', settings: OPENAI, fault: 'invalid_output', expect: { stage: 'failed', reason: 'invalid_output' } },
  flare: { kind: 'paid', model: 'gpt-image-2.5-flare', settings: OPENAI, ui: true, mime: 'image/png' },
  // sunburst: GENERATION (the plan card's own edit is exercised here too). sunburst-edit and nb21-edit: IMAGE EDITING, one reference uploaded through the file API.
  sunburst: { kind: 'paid', model: 'gpt-image-2.5-sunburst', settings: OPENAI, edit: true, mime: 'image/png' },
  'sunburst-edit': { kind: 'paid', model: 'gpt-image-2.5-sunburst', settings: OPENAI, references: 1, mime: 'image/png' },
  nb21: { kind: 'paid', model: 'gemini-nano-banana-2.1', settings: GOOGLE, ui: true, mime: 'image/jpeg' },
  'nb21-edit': { kind: 'paid', model: 'gemini-nano-banana-2.1', settings: GOOGLE, references: 1, mime: 'image/jpeg' },
  pro: { kind: 'paid', model: 'gemini-3-pro-image', settings: GOOGLE, mime: 'image/jpeg', prompt: LONG_PROMPT, max: 0.4 }, // booked at twice the booking: thinking is unpublished, and the platform absorbs what the signed maximum does not charge
};
export const maxOf = name => RUNS[name].max ?? (RUNS[name].kind === 'paid' ? BOOK_USD : FREE_MAX_USD);
export const totalOf = names => Number(names.reduce((n, k) => n + maxOf(k), 0).toFixed(4));

const sha256 = b => createHash('sha256').update(b).digest('hex');
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
// A deterministic 256x256 RGB gradient: the reference image of the edit run (the size run E of the provider validation used).
export function referencePng() {
  const size = 256, ihdr = Buffer.alloc(13), rows = Buffer.alloc((size * 3 + 1) * size);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const o = y * (size * 3 + 1) + 1 + x * 3; rows[o] = x; rows[o + 1] = y; rows[o + 2] = (x + y) >> 1; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const magic = { 'image/png': b => b.readUInt32BE(0) === 0x89504e47, 'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff };

export function parse(argv) {
  const o = { dry: false, runs: null, apiOnly: false, other: false, force: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--api-only') o.apiOnly = true;
    else if (a === '--other-session') o.other = true;
    else if (a === '--force') o.force = true;
    else if (a === '--out') o.out = argv[++i] ?? null;
    else if (a === '--runs') { o.runs = String(argv[++i] ?? '').split(',').filter(Boolean); if (!o.runs.length || o.runs.some(r => !RUNS[r])) return null; } else return null;
  }
  o.runs ??= Object.keys(RUNS);
  return o.dry && (o.other || o.force) ? null : o;
}

class Stop extends Error {}

export async function accept(argv, deps) {
  const say = deps.out, o = parse(argv);
  if (!o) { say(`usage: node scripts/image-acceptance.mjs [--dry-run] [--runs ${Object.keys(RUNS).join(',')}] [--api-only] [--other-session] [--force] [--out DIR]`); return 2; }
  const names = Object.keys(RUNS).filter(r => o.runs.includes(r)); // fixed order: free refusals, then paid
  say(`deployed image acceptance on ${ORIGIN}; runs, in order:`);
  for (const k of names) { const r = RUNS[k]; say(`  ${k.padEnd(22)} ${r.kind.padEnd(4)} ${r.model} ${JSON.stringify(r.settings)}${r.fault ? ` fault=${r.fault}` : ''}${r.references ? ' +1 reference (editing)' : ''}${r.ui && !o.apiOnly ? ' [you press Generate]' : ''}  booked max US$${maxOf(k)}`); }
  const paid = names.filter(k => RUNS[k].kind === 'paid'), cfg = deps.config ? deps.config() : loadConfig();
  const holdOf = k => quoteOf(cfg, RUNS[k], RUNS[k].prompt ?? PROMPT);
  for (const k of paid) { const q = holdOf(k); say(`  quote for ${k}: ${q.state === 'priced' ? `estimate ${q.estimate_credits} credits, most it can cost ${q.max_credits}, held while it runs ${q.reserve_credits}` : q.reason}`); }
  const needCredits = Math.max(0, ...paid.map(k => holdOf(k).reserve_credits ?? 0));
  say(`total booked in the shared budget: US$${totalOf(names)} (${paid.length} paid runs: US$${BOOK_USD} each, Pro US$0.4; ${names.length - paid.length} free-path runs x US$${FREE_MAX_USD}); observed real cost of the six paid runs: about US$0.28 (bounds seen: 0.006, 0.006, 0.010, 0.057, 0.050, 0.146)`);
  say(`the largest hold among these runs is ${needCredits} credits and must be free on your account. Refused if the shared budget cannot cover the total.`);
  if (o.dry) { say('dry run: read no credential, contacted nothing, booked nothing. Nothing was run, called or changed.'); return 0; }
  if (!deps.interactive()) { say('stopped: this command asks for your session cookie at a hidden prompt and needs an interactive terminal. Nothing was done.'); return 1; }

  const stamp = deps.now().replace(/[-:T]/g, '').slice(0, 14);
  const done = { started: deps.now(), origin: ORIGIN, runs: {} };
  const budget = deps.budget;
  const cookie = (await deps.askHidden(`Paste the small_session cookie value for ${ORIGIN} (nothing is echoed): `)).trim();
  if (!/^[\x21-\x7e]{16,4096}$/.test(cookie)) { say('stopped: that does not look like a cookie value (16 or more printable characters, no spaces).'); return 1; }
  const call = async (key, method, path, body, extra = {}) => {
    const res = await deps.fetch(`${ORIGIN}${path}`, { method, headers: { cookie: `small_session=${key}`, origin: ORIGIN, ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : extra.headers || {}) }, body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
    let json = null, bytes = null;
    if (extra.raw) bytes = Buffer.from(await res.arrayBuffer()); else json = await res.json().catch(() => null);
    return { status: res.status, ok: res.status < 400, json, bytes, headers: res.headers };
  };
  const api = (method, path, body, extra) => call(cookie, method, path, body, extra);

  try {
    // ---- preflight: signed in, the owner path, the models configured, the budget, the credits ----
    const me = await api('GET', '/api/me');
    if (me.status !== 200) throw new Stop(`the cookie was refused by ${ORIGIN}/api/me (HTTP ${me.status}): sign in again and copy a fresh small_session value.`);
    say('signed in (identity not shown)');
    const cap = await api('GET', '/api/learn/image-jobs');
    if (!cap.ok || cap.json?.available !== true || cap.json?.operatorOnly !== true) throw new Stop(`image generation is not offered to this account as the owner path (available ${cap.json?.available}, operatorOnly ${cap.json?.operatorOnly}, HTTP ${cap.status}). Sign in as the listed owner account (IMAGE_ACCEPTANCE_EMAILS), or the release is not live yet.`);
    for (const k of names) { const m = cap.json.models?.find(x => x.id === RUNS[k].model); if (!m?.configured) throw new Stop(`the model ${RUNS[k].model} is not configured on the Worker (its provider key is missing). Run the secrets command first.`); }
    say(`owner path: available, operatorOnly; models configured: ${[...new Set(names.map(k => RUNS[k].model))].join(', ')}`);
    const b0 = budget.status();
    if (!(b0.remaining >= totalOf(names) + 1)) throw new Stop(`the shared budget has US$${b0.remaining} left; this plan books US$${totalOf(names)} and keeps US$1 spare. Nothing was booked.`);
    say(`shared budget: US$${b0.remaining} left before booking US$${totalOf(names)}`);
    const usage0 = await api('GET', '/api/learn/usage');
    if (!usage0.ok || typeof usage0.json?.remainingCredits !== 'number') throw new Stop(`could not read /api/learn/usage (HTTP ${usage0.status}).`);
    if (paid.length && usage0.json.remainingCredits < needCredits) throw new Stop(`only ${usage0.json.remainingCredits} credits left; the largest paid run holds ${needCredits}.`);

    const usage = async () => { const r = await api('GET', '/api/learn/usage'); if (!r.ok) throw new Stop(`could not read /api/learn/usage (HTTP ${r.status}).`); const f = r.json.byFeature?.find(x => x.feature === 'image_generate'); return { used: r.json.usedCredits, image: f?.usedCredits ?? 0, reserved: r.json.reservedCredits, unknown: r.json.unknownAttempts, remaining: r.json.remainingCredits }; };
    const poll = async (fn, ok, ms, every = 2000) => { const end = deps.clock() + ms; for (;;) { const v = await fn(); if (ok(v)) return v; if (deps.clock() > end) return null; await deps.sleep(every); } };

    let lastGid = null;
    for (const name of names) {
      const run = RUNS[name];
      if (!o.force && deps.receipts.passed(name)) { say(`${name}: skipped, a PASS receipt exists (--force repeats it)`); continue; }
      const checks = [], receipt = { run: name, kind: run.kind, model: run.model, settings: run.settings, started: deps.now(), checks };
      const ok = (what, pass, detail = '') => { checks.push({ what, pass: !!pass, ...(detail ? { detail: String(detail) } : {}) }); say(`  ${pass ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!pass) throw new Stop(`${name}: ${what}${detail ? ` (${detail})` : ''}`); };
      const runId = `imgacc-${name}-${stamp}`, max = maxOf(name), uiMode = run.ui && !o.apiOnly;
      let phase = 'none', job = null, usd = null; // none -> booked (nothing sent) -> sent (a provider may have been reached)
      say(`${name}: ${run.kind}, booked max US$${max}${uiMode ? ', you press Generate' : ''}`);
      try {
        const canvas = (await api('POST', '/api/canvases', { title: `Image acceptance ${name} ${stamp}` })).json?.name;
        if (!canvas) throw new Stop(`${name}: could not create a canvas`);
        const board = `/api/learn/boards/${canvas}/main`, empty = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
        await api('PUT', board, { state: empty, version: (await api('GET', board)).json?.version });
        receipt.canvas = canvas;
        say(`  canvas ${canvas} created (delete it when you are done): ${ORIGIN}/apps/${canvas}`);

        // The plan: server-signed, with its own quote in credits.
        let references = [], prompt = run.prompt ?? PROMPT;
        if (run.references) {
          const bytes = referencePng(), declared = await api('POST', '/api/learn/files', { app: canvas, board: 'main', name: 'reference.png', type: 'image/png', size: bytes.length, sha256: sha256(bytes), family: 'image' });
          if (!declared.ok) throw new Stop(`${name}: reference declare answered HTTP ${declared.status}`);
          if (declared.json.upload) { const up = await api('PUT', declared.json.upload.url, new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } }); if (!up.ok) throw new Stop(`${name}: reference upload answered HTTP ${up.status}`); }
          references = [{ id: 'r1', label: 'Reference image', kind: 'file', sourceId: declared.json.source.id, revision: sha256(bytes), range: null }];
          // The server resolves a reference through the canvas row, which needs a file_source_refs row: only a board save with a card naming the source writes it (as the app does when an image is dropped).
          const card = { id: 'reference-card', type: 'file', kind: 'image', format: 'png', label: 'reference.png', dx: 0, dy: 0, w: 320, h: 240, fileRef: { v: 1, source: { id: declared.json.source.id, rev: sha256(bytes) }, family: 'image', meta: { name: 'reference.png', type: 'image/png', size: bytes.length, title: 'Reference image' }, view: {}, derivatives: {}, job: null, doc: null, status: { preview: 'pending', context: 'none' } } };
          const saved = await api('PUT', board, { state: { ...empty, blocks: [card] }, version: (await api('GET', board)).json?.version });
          if (!saved.ok) throw new Stop(`${name}: saving the reference card answered HTTP ${saved.status}`);
          prompt = 'Repaint {{ref:r1}} as a winter scene, flat illustration.';
        }
        const thread = `canvaschat-${randomUUID()}`;
        const made = await api('POST', '/api/learn/chat/image-proposals', { app: canvas, thread_id: thread, prompt, settings: { model: run.model, ...run.settings }, references });
        ok('plan created and saved in the chat', made.status === 201 && made.json?.proposal?.command === 'generate-image', `HTTP ${made.status}`);
        let p = made.json.proposal;
        ok('settings are what was asked', Object.entries({ model: run.model, ...run.settings }).every(([k, v]) => p.settings?.[k] === v), JSON.stringify(p.settings));
        const quoted = p.usage?.estimate_credits, maxCredits = p.usage?.max_credits, hold = p.usage?.reserve_credits ?? 0, unpriced = run.refusal === 'image_not_ready';
        if (unpriced) ok('no price is shown for settings with no verified price', quoted === null && maxCredits === null, `estimate ${quoted}, most it can cost ${maxCredits}`);
        else {
          ok('the quote is three separate numbers in credits: estimate <= the most it can cost <= the temporary hold', Number.isInteger(quoted) && quoted >= 1 && Number.isInteger(maxCredits) && maxCredits >= quoted && Number.isInteger(hold) && hold >= maxCredits, `estimate ${quoted}, most it can cost ${maxCredits}, held ${hold}`);
          const want = quoteOf(cfg, run, p.description);
          ok("the maximum and the hold are this checkout's configuration (the deployed Worker matches the candidate)", want.state === 'priced' && maxCredits === want.max_credits && hold === want.reserve_credits, `deployed ${maxCredits}/${hold}, configured ${want.max_credits}/${want.reserve_credits}`);
          ok('the signed quote carries the same maximum', p.quote?.max_credits === maxCredits && p.quote?.estimate_credits === quoted && p.quote?.reserve_credits === hold);
          ok('the plan shows credits only (no dollar amount)', !/usd|dollar|\$|micros/i.test(JSON.stringify({ usage: p.usage, quote: p.quote })));
        }
        ok('references resolve', made.json.references.every(r => r.state === 'ok'), made.json.references.map(r => r.state).join(','));
        const again = await api('GET', `/api/learn/chat/messages/${made.json.message_id}/proposal`);
        ok('the plan survives a reload (read again from the chat)', again.ok && again.json?.proposal?.proposal_id === p.proposal_id && again.json.proposal.version === p.version && again.json.used === false);
        if (unpriced) ok('the card says the settings cannot be generated yet (not ready, with a reason)', p.readiness?.ready === false && !!p.readiness?.message, p.readiness?.message);
        else ok('the plan is ready to generate', p.readiness?.ready === true, p.readiness?.message);
        if (run.edit) {
          const edited = await api('PUT', `/api/learn/chat/messages/${made.json.message_id}/proposal`, { expected_version: p.version, description: `${PROMPT} Soft evening light.` });
          ok('an edit saves as the next version and keeps the quote', edited.ok && edited.json.proposal.version === p.version + 1 && edited.json.proposal.usage?.estimate_credits === quoted, `HTTP ${edited.status} ${edited.json?.error || ''}`);
          const stale = await api('PUT', `/api/learn/chat/messages/${made.json.message_id}/proposal`, { expected_version: p.version, description: 'a stale edit that must not be saved' });
          ok('an edit from the old version is refused (409, nothing saved)', stale.status === 409);
          p = edited.json.proposal;
        }
        const gid = imageGenerationId(p), before = await usage();
        if (run.kind === 'paid') ok('the account has the hold free', before.remaining >= hold, `${before.remaining} credits left, hold ${hold}`);
        receipt.quoteCredits = quoted; receipt.maxCredits = maxCredits; receipt.holdCredits = hold; receipt.generationId = gid; receipt.creditsBefore = before;

        // Book the money, then (and only then) allow the request to be sent.
        const booked = budget.reserve(runId, 'image-acceptance', max);
        if (!booked.ok) throw new Stop(`${name}: the budget refused the booking (${booked.reason}); nothing was sent.`);
        phase = 'booked';
        say(`  booked US$${max} as ${runId}; shared budget left ${booked.remaining}`);

        // The job.
        const submit = body => api('POST', '/api/learn/image-jobs', body);
        if (run.refusal) {
          phase = 'sent';
          const sent = run.tamper === 'max' ? { ...p, quote: { ...p.quote, max_credits: p.quote.max_credits + 1 } } : p;
          const refused = await submit({ generationId: gid, proposal: sent, app: canvas });
          ok(`Generate is refused with ${run.refusal} (409)`, refused.status === 409 && refused.json?.code === run.refusal, `HTTP ${refused.status} ${refused.json?.code}`);
          if (refused.status === 409) { budget.release(runId); phase = 'none'; }
          ok('no job exists for it', (await api('GET', `/api/learn/image-jobs/${gid}`)).status === 404);
        } else if (uiMode) {
          say('');
          say(`  YOUR TURN. Open ${ORIGIN}/apps/${canvas}`);
          say(`   1. In the chat, find "Here is the plan for your image". It should show ${run.model}, about ${quoted} credits, and an enabled Generate.`);
          say('   2. Press Generate, and double-click it on purpose. Exactly one image must be made.');
          say('   3. While "Making your image" shows, reload the page: it must say it is checking, then the image arrives without another press.');
          say('  Waiting for the job (up to 20 minutes) ...');
          phase = 'sent'; // you may press at any moment
          const started = await poll(async () => (await api('GET', `/api/learn/image-jobs/${gid}`)), r => r.status === 200, 20 * 60 * 1000, 3000);
          if (!started) { if ((await api('GET', `/api/learn/image-jobs/${gid}`)).status === 404) { budget.release(runId); phase = 'none'; } throw new Stop(`${name}: Generate was not pressed within 20 minutes (the booking was released: no job exists).`); }
        } else {
          const body = { generationId: gid, proposal: p, app: canvas, ...(run.fault ? { fault: run.fault } : {}) };
          phase = 'sent'; // from here a request may have left, so any doubt keeps the booking at its maximum
          const first = await submit(body);
          const definite = first.json !== null && (first.status < 500 || first.status === 503);
          if (!first.ok) {
            if (definite) { budget.release(runId); phase = 'none'; throw new Stop(`${name}: the job was refused (HTTP ${first.status} ${first.json?.code || ''}); nothing was sent and the booking was released.`); }
            throw new Stop(`${name}: the job request got no clear answer (HTTP ${first.status}); the booking stays at its maximum until the provider dashboard is checked.`);
          }
          const second = await submit(body);
          ok('a second press reaches the same job (no second job)', second.status === 200 && second.json?.job?.id === first.json?.job?.id, `HTTP ${second.status}`);
        }

        if (phase === 'sent') {
          const last = await poll(async () => (await api('GET', `/api/learn/image-jobs/${gid}`)).json?.job, j => j && ['ready', 'failed', 'unknown', 'refused', 'cancelled'].includes(j.stage), run.kind === 'paid' ? 6 * 60 * 1000 : 90 * 1000);
          if (!last) { budget.uncertain(runId); throw new Stop(`${name}: the job did not finish in time; its booking stays at the maximum. Check the provider dashboard, then re-run.`); }
          job = last;
          say(`  job ${gid}: ${job.stage}${job.reason ? ` (${job.reason})` : ''}`);
          // The terminal stage is saved before its ledger step runs, so wait until the settlement says it is done.
          const inspect = await poll(() => api('GET', `/api/learn/image-jobs/${gid}/inspect`), r => !r.ok || !r.json?.job?.settlement || r.json.job.settlement.done === true, 30 * 1000, 1500) ?? await api('GET', `/api/learn/image-jobs/${gid}/inspect`);
          // The requester view read at the terminal stage predates settlement (charged_credits is null until it is done): read it again now.
          job = (await api('GET', `/api/learn/image-jobs/${gid}`)).json?.job ?? job;
          ok('operator inspect answers (owner path)', inspect.ok && inspect.json?.job?.id === gid, `HTTP ${inspect.status}`);
          const ij = inspect.json.job;
          receipt.inspect = { stage: ij.stage, reason: ij.reason, settlement: ij.settlement, retries: ij.retries, output: ij.output && { sha256: ij.output.sha256, bytes: ij.output.bytes, mimeType: ij.output.mimeType }, usage: ij.usage, providerMs: ij.providerMs, providerStatus: ij.providerStatus, costs: ij.costs, quote: ij.quote, providerModel: ij.providerModel };

          // The money: settle the shared budget from what the job recorded.
          if (run.fault) {
            const as = ij.stage === run.expect.stage && ij.reason === run.expect.reason;
            if (as) { budget.settle(runId, 0); phase = 'none'; }
            else if (ij.stage === 'ready' && ij.usage) { usd = imageCost(run.model, ij.usage, 0).settledUsd; if (typeof usd === 'number') budget.settle(runId, usd); else budget.uncertain(runId); phase = 'none'; }
            else budget.uncertain(runId);
            ok(`the injected ${run.fault} ended ${run.expect.stage} / ${run.expect.reason} (no provider reached, nothing billed)`, as, `${ij.stage} / ${ij.reason}`);
          } else if (ij.stage === 'ready') {
            usd = imageCost(run.model, ij.usage, quoteOf(cfg, run, p.description).reserveUsd ?? 0);
            receipt.cost = { state: usd.state, usd: usd.settledUsd };
            if (typeof usd.settledUsd === 'number') { budget.settle(runId, usd.settledUsd); phase = 'none'; } else budget.uncertain(runId);
            ok('the cost is known (measured or an upper bound)', typeof usd.settledUsd === 'number', usd.state);
            const holdUsd = hold / 100, capUsd = maxCredits / 100;
            receipt.overHold = usd.settledUsd > holdUsd + 1e-9 ? `real cost US$${usd.settledUsd}, above the ${hold}-credit hold: an explicit overrun on the platform ledger, never clipped` : null;
            receipt.absorbedUsd = Number(Math.max(0, usd.settledUsd - capUsd).toFixed(6));
            if (receipt.overHold) say(`  FINDING: ${receipt.overHold}`);
            if (receipt.absorbedUsd > 0) say(`  FINDING: real cost US$${usd.settledUsd} is above the signed maximum (${maxCredits} credits): the learner is charged the maximum, the platform absorbs US$${receipt.absorbedUsd}`);
            ok('the real cost is within the booking', usd.settledUsd <= max + 1e-9, `US$${usd.settledUsd} of US$${max}`);
          } else if (ij.settlement?.calls === 0) { budget.release(runId); phase = 'none'; }
          else if (ij.providerStatus === 429) { budget.settle(runId, 0); phase = 'none'; }
          else budget.uncertain(runId);

          if (run.fault) {
            ok('the failed job closed its settlement', ij.settlement?.done === true, JSON.stringify(ij.settlement));
          } else {
            ok('the job is ready', ij.stage === 'ready', `${ij.stage} ${ij.reason || ''}`);
            ok('settlement done, settled, one provider call, no retry', ij.settlement?.done === true && ij.settlement.status === 'settled' && ij.settlement.calls === 1 && (ij.retries || 0) === 0, JSON.stringify({ ...ij.settlement, retries: ij.retries }));
            ok('the inspect quote equals the plan quote (estimate, maximum, hold)', ij.quote?.estimate_credits === quoted && ij.quote?.max_credits === maxCredits && ij.quote?.reserve_credits === hold);
            ok('the requester view carries the same estimate and maximum', job.estimate_credits === quoted && job.max_credits === maxCredits, `${job.estimate_credits}/${job.max_credits}`);
            ok('the same settings ran', ij.settings?.model === run.model && Object.entries(run.settings).every(([k, v]) => ij.settings[k] === v));
            ok('no dollar amount is shown to the requester view', !/usd|dollar|\$|micros/i.test(JSON.stringify(job)), 'status view');
            if (run.references) {
              ok('the reference reached the job', ij.references?.length === run.references, `${ij.references?.length} reference(s)`);
              ok('the provider billed the reference as image input (editing, not generation)', imageInputTokens(ij.usage) > 0, `${imageInputTokens(ij.usage)} image input tokens`);
            }
            // The stored image.
            const file = await api('GET', `/api/learn/files/${job.artifact.sourceId}`, undefined, { raw: true });
            ok('the stored image downloads', file.status === 200 && file.bytes.length === job.artifact.bytes, `HTTP ${file.status}, ${file.bytes?.length} bytes`);
            ok('its hash is the job\'s output hash', sha256(file.bytes) === job.artifact.sha256);
            ok(`it is a real ${run.mime}`, job.artifact.mimeType === run.mime && magic[run.mime](file.bytes), job.artifact.mimeType);
            ok('the web code turns the job into an image card', !!imageCard(job, p), 'imageCard(job, proposal)');
            if (run.references) ok('the saved image is a new image, not the reference', job.artifact.sha256 !== sha256(referencePng()));
            receipt.output = { sourceId: job.artifact.sourceId, sha256: job.artifact.sha256, bytes: job.artifact.bytes, mimeType: job.artifact.mimeType };
          }
          // Credits: charged versus quoted, and the hold released.
          const after = await poll(usage, a => a.reserved <= before.reserved + 1e-9, 30 * 1000, 2000) ?? await usage();
          const charged = Number((after.image - before.image).toFixed(4));
          receipt.creditsAfter = after; receipt.creditsCharged = charged;
          const released = Math.abs(after.reserved - before.reserved) < 1e-9;
          // A failed or unknown job's hold is a finding to report, not a stop: what the deployed ledger does with it is part of what this run learns.
          if (run.kind === 'paid') ok('the hold is released (reserved credits are back where they were)', released, `${before.reserved} -> ${after.reserved}`);
          else { checks.push({ what: 'the hold after a failed job', pass: true, detail: `${before.reserved} -> ${after.reserved}${released ? ' (released)' : ' (FINDING: still held)'}` }); say(`  note the hold after a failed job: ${before.reserved} -> ${after.reserved}${released ? ' (released)' : ' (FINDING: still held)'}`); }
          if (run.kind === 'free') ok('nothing was charged', charged === 0 && Math.abs(after.used - before.used) < 1e-9, `${charged} credits`);
          else {
            const expectUsd = Math.min(usd.settledUsd, maxCredits / 100), rounded = Math.ceil(charged - 1e-9);
            ok('credits charged equal min(the recorded real cost, the signed maximum) (1 credit = US$0.01, no margin)', Math.abs(charged * 0.01 - expectUsd) < 5e-5, `${charged} credits; real cost US$${usd.settledUsd}, maximum ${maxCredits} credits`);
            ok('the learner is never charged above the signed maximum', rounded <= maxCredits, `${rounded} <= ${maxCredits}`);
            ok('the hold covers the maximum and the charge (released, not charged)', maxCredits <= hold && rounded <= hold, `${rounded} <= ${maxCredits} <= ${hold}`);
            ok('the requester view reports exactly the credits charged', job.charged_credits === rounded, `view ${job.charged_credits}, ledger ${rounded}`);
            ok('the operator view says whether the platform absorbed a difference', ij.costs?.absorbed === (receipt.absorbedUsd > 0), JSON.stringify(ij.costs));
            receipt.creditsVsQuote = rounded === quoted ? 'equal' : rounded > quoted && rounded <= maxCredits ? 'above_estimate_within_maximum' : 'MISMATCH';
            ok(`credits charged (${charged}, shown as ${rounded}) versus the estimate (${quoted}) and the most it can cost (${maxCredits})`, receipt.creditsVsQuote !== 'MISMATCH', receipt.creditsVsQuote === 'equal' ? 'equal to the estimate' : receipt.creditsVsQuote === 'above_estimate_within_maximum' ? `ABOVE the estimate, within the disclosed maximum (thinking tokens are billed but not published)` : 'outside the estimate and the maximum');
          }
          if (!run.fault && ij.stage === 'ready') {
            const reread = await api('GET', `/api/learn/image-jobs/${gid}`), proposalAfter = await api('GET', `/api/learn/chat/messages/${made.json.message_id}/proposal`);
            ok('after a reload the job is still ready with the same image, and the plan is marked used', reread.json?.job?.stage === 'ready' && reread.json.job.artifact?.sha256 === job.artifact.sha256 && proposalAfter.json?.used === true);
            ok('after a reload the same estimate, maximum and charge are shown', reread.json.job.estimate_credits === job.estimate_credits && reread.json.job.max_credits === job.max_credits && reread.json.job.charged_credits === job.charged_credits, `${reread.json.job.estimate_credits}/${reread.json.job.max_credits}/${reread.json.job.charged_credits}`);
            const other = await api('POST', '/api/learn/image-jobs', { generationId: `img-${randomUUID()}`, proposal: p, app: canvas });
            ok('a different press of the spent plan is refused (409 proposal_used) and creates no job', other.status === 409 && other.json?.code === 'proposal_used', `HTTP ${other.status} ${other.json?.code}`);
            const again = await api('POST', '/api/learn/image-jobs', { generationId: gid, proposal: p, app: canvas });
            ok('pressing the same Generate again after the reload reaches the same job and charges nothing more', again.json?.job?.id === gid && (await usage()).image === after.image, `HTTP ${again.status}`);
            if (uiMode) {
              const onBoard = async () => { const s = (await api('GET', board)).json?.state; return (s?.blocks || []).filter(b => b?.fileRef?.source?.id === job.artifact.sourceId); };
              const found = await poll(onBoard, c => c.length > 0, 90 * 1000, 3000);
              ok('your browser placed the image card and the board saved it (exactly one)', found?.length === 1, `${found?.length ?? 0} card(s)`);
              say(`  LOOK: the card at ${ORIGIN}/apps/${canvas} must show the image (not a broken picture) and open full size. Reload once more (Ctrl+R).`);
              await deps.pause('  Press Enter here when you have reloaded and the image card is still there: ');
              const stillThere = await onBoard();
              ok('after the second reload the board still holds the card', stillThere.length === 1, `${stillThere.length} card(s)`);
              receipt.card = { placedBy: 'your browser', persisted: true };
            } else receipt.card = 'not verified: api mode (a card is placed only by the browser; run the UI mode for it)';
          }
        }
        receipt.verdict = 'PASS'; receipt.finished = deps.now();
        deps.receipts.write(name, stamp, JSON.stringify(receipt, null, 2));
        done.runs[name] = 'PASS';
        if (run.kind === 'paid') lastGid = receipt.generationId;
        say(`${name}: PASS`);
      } catch (error) {
        // Money first: a run that stopped after a request may have gone out is never left booked as if nothing happened.
        if (phase === 'sent') { try { budget.uncertain(runId); } catch { /* already settled or released */ } }
        if (phase === 'booked') { try { budget.release(runId); } catch { /* nothing was sent: released */ } }
        receipt.verdict = 'FAIL'; receipt.failed = String(error.message || error); receipt.finished = deps.now();
        deps.receipts.write(name, stamp, JSON.stringify(receipt, null, 2));
        throw error;
      }
    }

    if (o.other) {
      const key = (await deps.askHidden('Paste the small_session cookie for a DIFFERENT account (not listed as owner; nothing is echoed): ')).trim();
      if (!/^[\x21-\x7e]{16,4096}$/.test(key)) throw new Stop('the second cookie does not look like a cookie value.');
      const other = (m, p, b) => call(key, m, p, b);
      const c = await other('GET', '/api/learn/image-jobs');
      ok2(say, 'another account: image generation is not offered', c.ok && c.json?.available === false && c.json.operatorOnly === undefined, JSON.stringify({ available: c.json?.available, operatorOnly: c.json?.operatorOnly }));
      const post = await other('POST', '/api/learn/image-jobs', { generationId: `img-${'a'.repeat(16)}`, proposal: { x: 1 }, app: 'canvas-00000000' });
      ok2(say, 'another account: creating a job is refused (503 image_generation_disabled)', post.status === 503 && post.json?.code === 'image_generation_disabled', `HTTP ${post.status}`);
      if (lastGid) { const ins = await other('GET', `/api/learn/image-jobs/${lastGid}/inspect`); ok2(say, "another account: the owner's inspect answers 404", ins.status === 404, `HTTP ${ins.status}`); }
      done.otherAccount = 'refused';
    }
  } catch (error) {
    say(`FAILED: ${error.message || error}`);
    done.failed = String(error.message || error);
    deps.receipts.writeSummary(stamp, JSON.stringify(done, null, 2));
    return 1;
  }
  done.finished = deps.now();
  deps.receipts.writeSummary(stamp, JSON.stringify(done, null, 2));
  say(`ACCEPTANCE PASSED for ${Object.keys(done.runs).length} runs. Not covered: how the image looks beyond your glance, storage failure and restart recovery, 2K/4K and Pro 4K, OpenAI quality above low, Flare editing and OpenAI references larger than the measured small image, concurrent load, public (non-owner) generation (off).`);
  return 0;
}
function ok2(say, what, pass, detail) { say(`  ${pass ? 'ok  ' : 'FAIL'} ${what}: ${detail}`); if (!pass) throw new Stop(`${what} (${detail})`); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } = await import('node:fs');
  const BUDGET = 'C:/s/spec/budget/budget.mjs', DEFAULT_OUT = 'C:/s/spec/image-activate/receipts';
  const args = process.argv.slice(2), outIndex = args.indexOf('--out'), out = outIndex >= 0 ? args[outIndex + 1] : DEFAULT_OUT;
  // The real entry books only in the shared ledger: a private ledger (BUDGET_FILE) is refused, and the budget module is loaded only for a real run.
  let budget = null;
  if (!args.includes('--dry-run')) {
    if (process.env.BUDGET_FILE) { console.log('refused: BUDGET_FILE is set; the acceptance books only in the shared ledger.'); process.exit(2); }
    const b = await import(pathToFileURL(BUDGET).href);
    budget = { status: b.status, reserve: b.reserve, settle: b.settle, uncertain: b.uncertain, release: b.release };
  }
  const deps = {
    out: line => console.log(line), now: () => new Date().toISOString(), clock: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms)), budget,
    interactive: () => !!(process.stdin.isTTY && process.stdout.isTTY),
    askHidden: q => new Promise(res => { process.stdout.write(q); const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true }); rl._writeToOutput = () => {}; rl.question('', a => { rl.close(); process.stdout.write('\n'); res(a); }); }),
    pause: q => new Promise(res => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, () => { rl.close(); res(); }); }),
    fetch: (url, init) => { if (!url.startsWith(`${ORIGIN}/`)) throw new Error('refused: not the production origin'); return fetch(url, { ...init, signal: AbortSignal.timeout(60_000), redirect: 'manual' }); },
    receipts: {
      passed: name => existsSync(out) && readdirSync(out).some(f => f.startsWith(`imgacc-${name}-`) && f.endsWith('.json') && JSON.parse(readFileSync(`${out}/${f}`, 'utf8')).verdict === 'PASS'),
      write: (name, stamp, text) => { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/imgacc-${name}-${stamp}.json`, text); },
      writeSummary: (stamp, text) => { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/imgacc-summary-${stamp}.json`, text); },
    },
  };
  process.exit(await accept(args, deps));
}
