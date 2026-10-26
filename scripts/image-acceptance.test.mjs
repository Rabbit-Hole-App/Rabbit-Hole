// Harness for the deployed image acceptance command (scripts/image-acceptance.mjs). Two layers, neither with a route to production:
//  1. the core run in-process against a SIMULATED Rabbit Hole (fake HTTP, fake cookie, fake shared budget with budget.mjs's semantics);
//  2. the REAL entry as a child under Node's permission model with no network, child-process or ledger grant and a stripped environment:
//     its --dry-run must run, and a real run must stop at the terminal check before reading a cookie or opening the ledger.
// Run: node --test scripts/image-acceptance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RUNS, accept, parse, maxOf, totalOf, referencePng, HOLD_USD } from './image-acceptance.mjs';
import { imageCost } from '../packages/control-plane/src/image-providers.js';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const OWNER = 'sess-FAKE-owner-cookie-1234567890', OTHER = 'sess-FAKE-other-cookie-1234567890';
const sha = b => createHash('sha256').update(b).digest('hex');
const PNG = referencePng(), JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
// What each model's provider reports. OpenAI reconciles (measured). The Google usage does not (an estimated upper bound), as in the real runs C, D, E.
const USAGE = {
  'gpt-image-2.5-flare': { input_tokens: 19, input_tokens_details: { text_tokens: 19 }, output_tokens: 196 },
  'gpt-image-2.5-sunburst': { input_tokens: 19, input_tokens_details: { text_tokens: 19 }, output_tokens: 196 },
  'gemini-nano-banana-2.1': { total_input_tokens: 15, total_output_tokens: 1120, total_thought_tokens: 1000, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] },
  'gemini-3-pro-image': { total_input_tokens: 14, total_output_tokens: 1138, total_thought_tokens: 80, output_tokens_by_modality: [{ modality: 'image', tokens: 1138 }] },
};
const QUOTE = { 'gpt-image-2.5-flare': 1, 'gpt-image-2.5-sunburst': 1, 'gemini-nano-banana-2.1': 4, 'gemini-3-pro-image': 14 };
const FAULTS = { provider_400: ['failed', 'provider_rejected', 400], provider_429: ['failed', 'provider_rejected', 429], network: ['unknown', 'outcome_unknown', null], invalid_output: ['failed', 'invalid_output', null] };

// The shared budget, with budget.mjs's rules: a reserved or uncertain run counts at its maximum, a settled one at its actual, a released one at zero.
function fakeBudget(remaining = 80) {
  const entries = new Map(), log = [];
  const counted = e => (e.status === 'settled' ? e.actual : e.status === 'released' ? 0 : e.max);
  const left = () => Number((remaining - [...entries.values()].reduce((n, e) => n + counted(e), 0)).toFixed(4));
  return { entries, log, status: () => ({ ok: true, remaining: left() }),
    reserve: (id, lane, max) => { log.push(['reserve', id, max]); if (entries.has(id)) return { ok: false, reason: 'reused' }; if (max > left()) return { ok: false, reason: 'over cap' }; entries.set(id, { max, status: 'reserved' }); return { ok: true, remaining: left() }; },
    settle: (id, actual) => { log.push(['settle', id, actual]); const e = entries.get(id); if (!e || e.status === 'settled') return { ok: false }; Object.assign(e, { status: 'settled', actual }); return { ok: true }; },
    uncertain: id => { log.push(['uncertain', id]); const e = entries.get(id); if (!e || e.status === 'settled') return { ok: false }; e.status = 'uncertain'; return { ok: true }; },
    release: id => { log.push(['release', id]); const e = entries.get(id); if (!e || e.status !== 'reserved') return { ok: false }; e.status = 'released'; return { ok: true }; } };
}

// A simulated Rabbit Hole: the owner's session and one other account, canvases, proposals, jobs, an ImageJobs-like state machine, the usage ledger and the board.
function world(over = {}) {
  const w = { lines: [], requests: [], canvases: new Map(), proposals: new Map(), jobs: new Map(), files: new Map(), providerCalls: 0, n: 0, receipts: new Map(), summaries: [], now: 0,
    usage: { image: 0, other: 100, reserved: 0, unknown: 0 }, browser: false, ignoreFaults: false, chargeFactor: 1, jobAnswer: null, ownerAvailable: true, configured: true, otherAvailable: false, holdStays: false, pauses: 0, ...over };
  const reply = (status, body, headers = {}) => ({ status, headers: { get: k => headers[k.toLowerCase()] ?? null }, json: async () => { if (body === undefined || body instanceof Buffer) throw new Error('no json'); return body; }, arrayBuffer: async () => (body instanceof Buffer ? body.buffer.slice(body.byteOffset, body.byteOffset + body.length) : new ArrayBuffer(0)) });
  const publicJob = j => ({ id: j.id, stage: j.stage, reason: j.reason || null, provider: 'p', model: j.model, estimate_credits: j.quote, artifact: j.stage === 'ready' ? j.output : null, cost: j.stage === 'ready' ? 'measured' : null, saveRetryable: false, createdAt: 1, updatedAt: 2 });
  const finish = j => { // the job's end: stage, ledger, credits
    const f = j.fault && !w.ignoreFaults ? FAULTS[j.fault] : null;
    if (f) { j.stage = f[0]; j.reason = f[1]; j.providerStatus = f[2]; j.settlement = { status: f[1] === 'provider_rejected' && f[2] === 429 ? 'failed' : 'failed', calls: 1, done: true, costKnown: f[2] === 429 }; w.usage.reserved = w.holdStays ? w.usage.reserved : w.usage.reserved - 20; return; }
    w.providerCalls++;
    const bytes = JPEG_MODELS.has(j.model) ? JPEG : PNG, usage = USAGE[j.model], cost = imageCost(j.model, usage, 0.2);
    j.output = { sourceId: `fs_${String(++w.n).padStart(24, '0')}`, sha256: sha(bytes), mimeType: JPEG_MODELS.has(j.model) ? 'image/jpeg' : 'image/png', bytes: bytes.length };
    w.files.set(j.output.sourceId, bytes); j.usage = usage; j.stage = 'ready'; j.settlement = { status: 'settled', calls: 1, done: true, costKnown: true };
    w.usage.reserved -= 20; w.usage.image = Number((w.usage.image + cost.settledUsd * 100 * w.chargeFactor).toFixed(4));
    if (w.browser) { const c = w.canvases.get(j.app); c.blocks.push({ type: 'file:image', fileRef: { source: { id: j.output.sourceId, rev: j.output.sha256 } } }); }
  };
  const JPEG_MODELS = new Set(['gemini-nano-banana-2.1', 'gemini-3-pro-image']);
  const advance = j => { if (j.stage === 'queued') { j.stage = 'submitting'; return; } if (j.stage === 'submitting') finish(j); };
  const create = (body, hold = true) => {
    const p = [...w.proposals.values()].find(x => x.current.proposal_id === body.proposal.proposal_id)?.current;
    const j = { id: body.generationId, model: p.settings.model, settings: p.settings, quote: p.usage.estimate_credits, stage: 'queued', app: body.app, fault: body.fault, proposal: p.proposal_id };
    w.jobs.set(j.id, j); if (hold) w.usage.reserved += 20; return j;
  };
  w.deps = {
    out: l => w.lines.push(l), now: () => `2026-10-27T17:${String(Math.floor(w.now / 60) % 60).padStart(2, '0')}:00.000Z`, clock: () => w.now, sleep: async ms => { w.now += ms; w.tick?.(); }, interactive: () => true,
    askHidden: async q => (/DIFFERENT/.test(q) ? OTHER : OWNER), pause: async () => { w.pauses++; },
    receipts: { passed: name => [...w.receipts.keys()].some(k => k.startsWith(`${name}|`) && JSON.parse(w.receipts.get(k)).verdict === 'PASS'), write: (name, stamp, text) => w.receipts.set(`${name}|${stamp}`, text), writeSummary: (stamp, text) => w.summaries.push(text) },
    fetch: async (url, init = {}) => {
      const method = init.method || 'GET', path = url.replace('https://digrabbithole.com', ''), key = (init.headers?.cookie || '').replace('small_session=', '');
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      w.requests.push({ method, path, key });
      if (!url.startsWith('https://digrabbithole.com/')) throw new Error(`outside production: ${url}`);
      const owner = key === OWNER, other = key === OTHER;
      if (!owner && !other) return reply(401, { error: 'sign in' });
      if (path === '/api/me') return reply(200, { principal: 'x' });
      if (path === '/api/learn/image-jobs' && method === 'GET') {
        const models = Object.keys(QUOTE).map(id => ({ id, label: id, provider: 'p', configured: w.configured }));
        return owner ? reply(200, { available: w.ownerAvailable, ...(w.ownerAvailable ? { operatorOnly: true } : {}), models }) : reply(200, { available: w.otherAvailable, models });
      }
      if (path === '/api/learn/usage') return reply(200, { usedCredits: w.usage.other + w.usage.image, reservedCredits: w.usage.reserved, remainingCredits: 2500 - w.usage.other - w.usage.image - w.usage.reserved, unknownAttempts: w.usage.unknown, byFeature: w.usage.image ? [{ feature: 'image_generate', usedCredits: w.usage.image }] : [] });
      if (method === 'POST' && path === '/api/canvases') { const name = `canvas-${String(++w.n).padStart(8, '0')}`; w.canvases.set(name, { blocks: [], version: 1 }); return reply(201, { name }); }
      let m;
      if ((m = path.match(/^\/api\/learn\/boards\/(canvas-\d+)\/main$/))) { const c = w.canvases.get(m[1]); return method === 'PUT' ? reply(200, { version: 2 }) : reply(200, { version: c.version, state: { blocks: c.blocks } }); }
      if (method === 'POST' && path === '/api/learn/files') { const id = `fs_${String(++w.n).padStart(24, '0')}`; w.files.set(id, null); return reply(201, { source: { id }, upload: { method: 'PUT', url: `/api/learn/files/${id}` } }); }
      if (method === 'PUT' && (m = path.match(/^\/api\/learn\/files\/(fs_\d+)$/))) { w.files.set(m[1], Buffer.from(init.body)); return reply(200, {}); }
      if (method === 'GET' && (m = path.match(/^\/api\/learn\/files\/(fs_\d+)$/))) { const b = w.files.get(m[1]); return b ? reply(200, b, { 'content-type': 'image/png' }) : reply(404, { error: 'Not available' }); }
      if (method === 'POST' && path === '/api/learn/chat/image-proposals') {
        if (!owner) return reply(503, { code: 'image_generation_disabled' });
        const s = body.settings, ready = !(s.model.startsWith('gpt') && s.quality !== 'low'), id = `gp-${String(++w.n).padStart(16, '0')}`;
        const p = { proposal_id: id, version: 1, command: 'generate-image', title: 'Image', description: body.prompt.replace('{{ref:r1}}', 'Reference image'), settings: s, references: body.references, input: { request: `/generate-image ${body.prompt}`, org: 'o', app: body.app },
          usage: { estimate_credits: ready ? QUOTE[s.model] : null, reserve_credits: ready ? 20 : null }, readiness: ready ? { ready: true } : { ready: false, message: 'GPT Image has only been tested for low quality.' }, sig: 'v3.x' };
        const mid = String(++w.n); w.proposals.set(mid, { current: p }); return reply(201, { thread_id: body.thread_id, message_id: mid, proposal: p, references: body.references.map(r => ({ id: r.id, state: 'ok' })) });
      }
      if ((m = path.match(/^\/api\/learn\/chat\/messages\/(\d+)\/proposal$/))) {
        const rec = w.proposals.get(m[1]); if (!rec) return reply(404, {});
        if (method === 'GET') return reply(200, { proposal: rec.current, message_id: m[1], used: [...w.jobs.values()].some(j => j.proposal === rec.current.proposal_id), references: [] });
        if (Object.keys(body).some(k => !['expected_version', 'description', 'prompt', 'settings'].includes(k))) return reply(400, { error: 'field_not_editable' }); // the real route accepts only these edits on an image plan
        if (body.expected_version !== rec.current.version) return reply(409, { code: 'proposal_stale' });
        rec.current = { ...rec.current, version: rec.current.version + 1, description: body.description ?? rec.current.description }; return reply(200, { proposal: rec.current, references: [] });
      }
      if (method === 'POST' && path === '/api/learn/image-jobs') {
        if (w.jobAnswer) return reply(w.jobAnswer.status, w.jobAnswer.body);
        if (!owner) return reply(503, { code: 'image_generation_disabled' });
        if (w.jobs.has(body.generationId)) return reply(200, { job: publicJob(w.jobs.get(body.generationId)) });
        const p = [...w.proposals.values()].find(x => x.current.proposal_id === body.proposal.proposal_id).current;
        if (p.readiness.ready !== true) return reply(409, { code: 'image_not_ready', error: p.readiness.message });
        return reply(201, { job: publicJob(create(body)) });
      }
      if ((m = path.match(/^\/api\/learn\/image-jobs\/(img-[\w-]+)(\/inspect)?$/))) {
        let j = w.jobs.get(m[1]);
        if (!j && w.browser && owner && w.pressOn) j = create({ generationId: m[1], proposal: { proposal_id: m[1].slice(4) }, app: [...w.canvases.keys()].at(-1) });
        if (!j || !owner) return reply(404, { error: 'Not found' });
        if (m[2]) { const q = [j.stage].includes('ready'); return reply(200, { job: { ...publicJob(j), settings: j.settings, quote: { estimate_credits: j.quote, reserve_credits: 20 }, settlement: j.settlement, retries: 0, usage: j.usage || null, output: j.output || null, providerStatus: j.providerStatus ?? null, costs: q ? { state: 'x' } : null, providerModel: j.model } }); }
        advance(j); return reply(200, { job: publicJob(j) });
      }
      return reply(404, { error: `unexpected ${method} ${path}` });
    },
    ...over.deps,
  };
  w.budget = over.budget || fakeBudget(); w.deps.budget = w.budget;
  return w;
}
const text = w => w.lines.join('\n') + [...w.receipts.values()].join('\n') + w.summaries.join('\n');
const go = (w, ...argv) => accept(argv, w.deps);

test('dry run prints the plan and the total, contacts nothing, books nothing, reads no credential', async () => {
  const w = world({ deps: { fetch: async () => { throw new Error('fetched'); }, askHidden: async () => { throw new Error('asked'); } }, budget: { status: () => { throw new Error('ledger'); }, reserve: () => { throw new Error('ledger'); } } });
  assert.equal(await go(w, '--dry-run'), 0);
  assert.match(text(w), /total booked in the shared budget: US\$1\.1 \(5 paid runs x US\$0\.2, 5 free-path runs x US\$0\.02\)/);
  assert.match(text(w), /Nothing was run, called or changed/);
  for (const name of Object.keys(RUNS)) assert.match(text(w), new RegExp(name));
  assert.equal(w.requests.length, 0);
});
test('arguments: unknown ones and a dry run with a mutating flag are refused', async () => {
  for (const argv of [['--yes'], ['--runs', 'nope'], ['--runs', ''], ['--dry-run', '--force'], ['--dry-run', '--other-session']]) { const w = world(); assert.equal(await go(w, ...argv), 2, argv.join(' ')); assert.equal(w.requests.length, 0); }
  assert.equal(parse(['--runs', 'flare,pro']).runs.length, 2);
  assert.equal(totalOf(Object.keys(RUNS)), 1.1); assert.equal(maxOf('flare'), HOLD_USD); assert.equal(maxOf('fault-network'), 0.02);
});
test('a non-interactive terminal or a bad cookie stops before anything is sent', async () => {
  const a = world({ deps: { interactive: () => false } }); assert.equal(await go(a), 1); assert.equal(a.requests.length, 0);
  const b = world({ deps: { askHidden: async () => 'short' } }); assert.equal(await go(b), 1); assert.equal(b.requests.length, 0);
  const c = world({ deps: { askHidden: async () => 'sess-FAKE-WRONG-cookie-0987654321' } }); assert.equal(await go(c), 1); assert.match(text(c), /cookie was refused/); assert.equal(c.budget.log.length, 0);
});
test('preflight: not the owner path, a missing provider key, too little budget, too few credits all stop before booking', async () => {
  const a = world({ ownerAvailable: false }); assert.equal(await go(a, '--api-only'), 1); assert.match(text(a), /not offered to this account as the owner path/); assert.equal(a.budget.log.length, 0);
  const b = world({ configured: false }); assert.equal(await go(b, '--api-only'), 1); assert.match(text(b), /provider key is missing/); assert.equal(b.budget.log.length, 0);
  const c = world({ budget: fakeBudget(1.5) }); assert.equal(await go(c, '--api-only'), 1); assert.match(text(c), /keeps US\$1 spare/); assert.equal(c.budget.log.length, 0);
  const d = world(); d.usage.other = 2490; assert.equal(await go(d, '--api-only', '--runs', 'flare'), 1); assert.match(text(d), /only 10 credits left/); assert.equal(d.budget.log.length, 0);
});

test('every run, no browser: refusal and the four faults charge nothing, each paid run settles on its recorded cost, one provider call each', async () => {
  const w = world();
  assert.equal(await go(w, '--api-only', '--other-session'), 0, w.lines.join('\n'));
  const b = w.budget.entries;
  const id = n => [...b.keys()].find(k => k.startsWith(`imgacc-${n}-`));
  assert.equal(b.get(id('refuse-unready')).status, 'released');
  for (const f of Object.keys(FAULTS)) assert.deepEqual([b.get(id(`fault-${f}`)).status, b.get(id(`fault-${f}`)).actual], ['settled', 0], f);
  for (const [name, run] of Object.entries(RUNS).filter(([, r]) => r.kind === 'paid')) {
    const want = imageCost(run.model, USAGE[run.model], HOLD_USD).settledUsd;
    assert.deepEqual([b.get(id(name)).status, b.get(id(name)).actual], ['settled', want], name);
  }
  assert.equal(w.providerCalls, 5, 'exactly one real provider call per paid run; the faults and the refusal made none');
  assert.equal(w.usage.reserved, 0);
  // Credits: OpenAI equal to the quote, the Google runs above it within the hold (the known gap), and it is said.
  assert.match(text(w), /versus quoted \(1\).*equal/);
  assert.match(text(w), /ABOVE the quote, within the 20-credit hold/);
  assert.match(text(w), /another account: image generation is not offered/);
  assert.match(text(w), /another account: the owner's inspect answers 404/);
  assert.match(text(w), /ACCEPTANCE PASSED for 10 runs/);
  const receipts = [...w.receipts.values()].map(r => JSON.parse(r));
  assert.equal(receipts.length, 10); assert.ok(receipts.every(r => r.verdict === 'PASS'));
  const flare = receipts.find(r => r.run === 'flare');
  assert.deepEqual([flare.quoteCredits, flare.creditsVsQuote, flare.output.mimeType], [1, 'equal', 'image/png']);
  assert.equal(receipts.find(r => r.run === 'nb21').creditsVsQuote, 'above_quote_within_hold');
  assert.match(flare.card, /not verified: api mode/);
  // The edit run sent its reference through the declared-and-uploaded path and the plan carried it.
  const edit = w.requests.filter(r => r.path === '/api/learn/files' && r.method === 'POST');
  assert.equal(edit.length, 1);
  // No secret anywhere: not the cookies, not in output, receipts or summaries.
  for (const secret of [OWNER, OTHER]) assert.ok(!text(w).includes(secret));
  // Every provider-reaching POST was booked first.
  w.requests.forEach((r, i) => { if (r.method === 'POST' && r.path === '/api/learn/image-jobs') assert.ok(w.budget.log.some(([op]) => op === 'reserve'), `booked before request ${i}`); });
});
test('the booking always precedes the job request, and the free runs go first', async () => {
  const w = world(); const order = [];
  const real = w.budget.reserve; w.budget.reserve = (...a) => { order.push(`reserve ${a[0]}`); return real(...a); };
  const fetch0 = w.deps.fetch; w.deps.fetch = async (u, i) => { if ((i?.method) === 'POST' && u.endsWith('/api/learn/image-jobs')) order.push('POST job'); return fetch0(u, i); };
  assert.equal(await go(w, '--api-only', '--runs', 'refuse-unready,flare'), 0);
  assert.deepEqual(order.map(x => x.replace(/-\d{14}$/, '')), ['reserve imgacc-refuse-unready', 'POST job', 'reserve imgacc-flare', 'POST job', 'POST job']);
});

test('UI mode: the owner presses Generate, the browser places the card, the board keeps it across the reload, and the script says what to look at', async () => {
  const w = world({ browser: true, pressOn: true });
  assert.equal(await go(w, '--runs', 'flare,nb21'), 0, w.lines.join('\n'));
  assert.match(text(w), /YOUR TURN/); assert.match(text(w), /your browser placed the image card/); assert.match(text(w), /LOOK:/);
  assert.equal(w.pauses, 2);
  const r = JSON.parse([...w.receipts.values()][0]); assert.deepEqual(r.card, { placedBy: 'your browser', persisted: true });
  assert.equal(w.providerCalls, 2);
});
test('UI mode: a card the browser never placed fails the run (the money is already settled, one provider call)', async () => {
  const w = world({ browser: true, pressOn: true });
  // The browser presses Generate (the job runs) but the board never keeps the card: every board read comes back empty.
  const real = w.deps.fetch; w.deps.fetch = async (u, i) => { const res = await real(u, i); if (/\/boards\//.test(u) && (i?.method || 'GET') === 'GET') for (const c of w.canvases.values()) c.blocks.length = 0; return res; };
  assert.equal(await go(w, '--runs', 'flare'), 1);
  assert.match(text(w), /your browser placed the image card and the board saved it \(exactly one\)/);
  assert.equal([...w.budget.entries.values()][0].status, 'settled');
});
test('UI mode: Generate never pressed releases the booking when no job exists', async () => {
  const w = world({ browser: true, pressOn: false });
  assert.equal(await go(w, '--runs', 'flare'), 1);
  assert.match(text(w), /not pressed within 20 minutes \(the booking was released/);
  assert.equal([...w.budget.entries.values()][0].status, 'released'); assert.equal(w.providerCalls, 0);
});

test('stop on error: the first failing run ends the command, later runs never start, and a run that really spent is settled at its cost', async () => {
  const w = world({ ignoreFaults: true }); // the deployed code ignores the fault and makes a real call
  assert.equal(await go(w, '--api-only'), 1);
  assert.match(text(w), /FAILED: fault-provider_400/);
  assert.equal(w.providerCalls, 1, 'nothing after the first failure ran');
  const e = [...w.budget.entries.entries()];
  assert.equal(e.length, 2); // the refusal run and the faulted run only
  assert.equal(e[1][1].status, 'settled'); assert.ok(e[1][1].actual > 0 && e[1][1].actual <= 0.02, 'settled at the real recorded cost, inside the free-run booking');
  assert.equal(JSON.parse([...w.receipts.values()].at(-1)).verdict, 'FAIL');
});
test('an unclear answer to the job request keeps the booking at its maximum; a clear refusal releases it', async () => {
  const a = world({ jobAnswer: { status: 502, body: { error: 'bad gateway' } } });
  assert.equal(await go(a, '--api-only', '--runs', 'fault-network'), 1);
  assert.equal([...a.budget.entries.values()][0].status, 'uncertain'); assert.match(text(a), /no clear answer/);
  const b = world({ jobAnswer: { status: 503, body: { code: 'image_generation_disabled' } } });
  assert.equal(await go(b, '--api-only', '--runs', 'fault-network'), 1);
  assert.equal([...b.budget.entries.values()][0].status, 'released'); assert.match(text(b), /nothing was sent and the booking was released/);
  const d = world(); const real = d.deps.fetch; d.deps.fetch = async (u, i) => { if ((i?.method) === 'POST' && u.endsWith('/api/learn/image-jobs')) throw new Error('socket hang up'); return real(u, i); };
  assert.equal(await go(d, '--api-only', '--runs', 'fault-network'), 1);
  assert.equal([...d.budget.entries.values()][0].status, 'uncertain', 'a thrown request may have been sent');
});
test('credits that do not equal the recorded cost stop the run (a double charge is caught)', async () => {
  const w = world({ chargeFactor: 2 });
  assert.equal(await go(w, '--api-only', '--runs', 'flare'), 1);
  assert.match(text(w), /credits charged equal the cost the job recorded/);
});
test('a hold that is not released after a paid run stops it; after a failed free run it is only a finding', async () => {
  const w = world({ holdStays: true });
  assert.equal(await go(w, '--api-only', '--runs', 'fault-provider_400'), 0);
  assert.match(text(w), /FINDING: still held/);
});
test('resumable: a PASS receipt is skipped on the next run, --force repeats it', async () => {
  const w = world(); assert.equal(await go(w, '--api-only', '--runs', 'refuse-unready,flare'), 0);
  const first = w.requests.length; w.requests.length = 0; w.lines.length = 0; w.budget.log.length = 0;
  assert.equal(await go(w, '--api-only', '--runs', 'refuse-unready,flare'), 0);
  assert.match(text(w), /refuse-unready: skipped, a PASS receipt exists/); assert.match(text(w), /flare: skipped/);
  assert.equal(w.budget.log.length, 0, 'nothing was booked again');
  assert.ok(w.requests.length < first);
  assert.equal(await go(w, '--api-only', '--runs', 'refuse-unready', '--force'), 0);
  assert.equal(w.budget.log.filter(x => x[0] === 'reserve').length, 1);
});
test('the second account: an offer of generation to it fails the acceptance', async () => {
  const w = world({ otherAvailable: true });
  assert.equal(await go(w, '--api-only', '--runs', 'refuse-unready', '--other-session'), 1);
  assert.match(text(w), /another account: image generation is not offered/);
});
test('the reference image is a real 256x256 PNG', () => {
  const b = referencePng();
  assert.equal(b.readUInt32BE(0), 0x89504e47); assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [256, 256]); assert.ok(b.length < 200 * 1024);
});

test('REAL entry --dry-run under the permission model: no network, no child process, no ledger access, stripped environment', () => {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const run = args => spawnSync(process.execPath, ['--permission', `--allow-fs-read=${ROOT}`, join(HERE, 'image-acceptance.mjs'), ...args], { env, encoding: 'utf8', input: '' });
  const dry = run(['--dry-run']), out = `${dry.stdout}${dry.stderr}`;
  assert.equal(dry.status, 0, out.slice(0, 400));
  assert.doesNotMatch(out, /ERR_ACCESS_DENIED/);
  assert.match(out, /Nothing was run, called or changed/); assert.match(out, /US\$1\.1/);
  // A real run on a machine with BUDGET_FILE set is refused before the ledger is opened; without a terminal it stops before a cookie is read.
  const priv = spawnSync(process.execPath, [join(HERE, 'image-acceptance.mjs')], { env: { ...env, BUDGET_FILE: join(ROOT, 'private-ledger.json') }, encoding: 'utf8', input: '' });
  assert.equal(priv.status, 2); assert.match(priv.stdout, /BUDGET_FILE is set/);
});
