// OWNER COMMAND (production, paid): the deployed acceptance of Ctrl+K background removal and regional image edit on https://digrabbithole.com
// (docs/features/ctrlk-image-activation.md, ledger 9453f5f0). Run it only after the activation commit is live and the OpenAI key is installed.
//   node scripts/ctrlk-image-acceptance.mjs --dry-run     offline: prints the plan, the per-run maxima and the total. Reads no credential, contacts nothing, books nothing.
//   node scripts/ctrlk-image-acceptance.mjs [--runs a,b] [--force] [--out DIR]
// Signs in as YOU with your browser's small_session cookie for digrabbithole.com, pasted at a hidden prompt (memory only, sent only to the production origin).
// Every run that can reach the provider is booked in the shared budget (C:/s/spec/budget/budget.mjs reserve) BEFORE its request and settled after with the
// credits actually charged; a run whose outcome is unclear stays booked at its maximum. It stops at the first failure; a PASS receipt is skipped on re-run.
// Order: the free refusals first (a broken pipeline stops before any paid call), then API runs (the deployed route, no browser), then the two UI runs where YOU
// press Ctrl+K, preview and Apply. It does not judge how the result looks: you do, at the prompts.
// Proves through the DEPLOYED path: refusals charge nothing; one job for a duplicate submit; a conflicting reuse of the key refused; the job survives a status
// re-read; the stored result (hash, size, PNG signature, 1024x1024, alpha for removal); the original untouched; credits charged versus the reservation with the
// hold released and the cost not left unknown; cancel; and (UI) Apply replaces the card, persists on the board and survives a reload.
import { deflateSync } from 'node:zlib';
import { canvasFamilyOf, fileCardFromSource } from '../packages/web/src/file-to-canvas.js';
import { ORIGIN, COOKIE_RE, Stop, apiFor, runEntry, sha256 } from './ctrlk-acceptance-common.mjs';

export { ORIGIN };
export const RESERVE_CREDITS = 3; // INLINE_IMAGE_EDIT_RESERVED_USD 0.03 on the activation branch: what the quote must show, and the most a run can be charged
export const BOOK_USD = 0.05; // booked per paid run: above the reservation, because the provider's bill is not clipped to it (measured edits cost about 0.01)
export const FREE_USD = 0;
export const RUNS = {
  'free-refusals': { kind: 'free' },
  'bg-api': { kind: 'paid', operation: 'remove_background', label: 'background removal through the route' },
  'region-api': { kind: 'paid', operation: 'edit_image', label: 'regional edit through the route' },
  cancel: { kind: 'paid', operation: 'remove_background', label: 'cancel straight after submit' },
  'bg-ui': { kind: 'paid', operation: 'remove_background', ui: true, label: 'background removal in the browser, Apply' },
  'region-ui': { kind: 'paid', operation: 'edit_image', ui: true, label: 'regional edit in the browser, Apply' },
};
export const maxOf = name => (RUNS[name].kind === 'paid' ? BOOK_USD : FREE_USD);
export const totalOf = names => Number(names.reduce((n, k) => n + maxOf(k), 0).toFixed(4));

// ---- deterministic fixtures: a 1024x1024 subject (a red disc on a gradient) and an RGBA mask with a transparent square ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
export function png(size, channels, pixel) {
  const ihdr = Buffer.alloc(13), stride = size * channels + 1, rows = Buffer.alloc(stride * size);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const o = y * stride + 1 + x * channels, p = pixel(x, y); for (let c = 0; c < channels; c++) rows[o + c] = p[c]; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export const subjectPng = () => png(1024, 3, (x, y) => ((x - 512) ** 2 + (y - 512) ** 2 < 300 ** 2 ? [200, 30, 30] : [x >> 3, 120 + (y >> 4), 200 - (x >> 4)]));
export const maskPng = () => png(1024, 4, (x, y) => (x >= 256 && x < 768 && y >= 256 && y < 768 ? [0, 0, 0, 0] : [0, 0, 0, 255]));
export const ihdrOf = b => (b.length < 26 ? { signature: false } : { signature: b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a, width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] });

export function parse(argv) {
  const o = { dry: false, runs: null, force: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--force') o.force = true;
    else if (a === '--out') o.out = argv[++i] ?? null;
    else if (a === '--runs') { o.runs = String(argv[++i] ?? '').split(',').filter(Boolean); if (!o.runs.length || o.runs.some(r => !RUNS[r])) return null; } else return null;
  }
  o.runs ??= Object.keys(RUNS);
  return o.dry && o.force ? null : o;
}

export async function accept(argv, deps) {
  const say = deps.out, o = parse(argv);
  if (!o) { say(`usage: node scripts/ctrlk-image-acceptance.mjs [--dry-run] [--runs ${Object.keys(RUNS).join(',')}] [--force] [--out DIR]`); return 2; }
  const names = Object.keys(RUNS).filter(r => o.runs.includes(r)), paid = names.filter(k => RUNS[k].kind === 'paid');
  say(`deployed Ctrl+K image acceptance on ${ORIGIN}; runs, in order:`);
  for (const k of names) say(`  ${k.padEnd(14)} ${RUNS[k].kind.padEnd(4)} ${RUNS[k].label || 'refusal paths: nothing may be charged'}${RUNS[k].ui ? ' [you press Ctrl+K and Apply]' : ''}`);
  say(`reservation the quote must show: ${RESERVE_CREDITS} credits (INLINE_IMAGE_EDIT_RESERVED_USD 0.03); a run is never charged above it`);
  say(`total booked in the shared budget: US$${totalOf(names)} (${paid.length} paid runs x US$${BOOK_USD}; real cost about US$0.01 each, so expect about US$${(paid.length * 0.011).toFixed(2)} settled)`);
  say(`each paid run needs ${RESERVE_CREDITS} credits free on your account. Refused if the shared budget cannot cover the total.`);
  if (o.dry) { say('dry run: read no credential, contacted nothing, booked nothing. Nothing was run, called or changed.'); return 0; }
  if (!deps.interactive()) { say('stopped: this command asks for your session cookie at a hidden prompt and needs an interactive terminal. Nothing was done.'); return 1; }

  const stamp = deps.now().replace(/[-:T]/g, '').slice(0, 14), done = { started: deps.now(), origin: ORIGIN, runs: {} }, budget = deps.budget;
  const cookie = (await deps.askHidden(`Paste the small_session cookie value for ${ORIGIN} (nothing is echoed): `)).trim();
  if (!COOKIE_RE.test(cookie)) { say('stopped: that does not look like a cookie value (16 or more printable characters, no spaces).'); return 1; }
  const api = apiFor(deps, cookie);
  const poll = async (fn, ok, ms, every = 2000) => { const end = deps.clock() + ms; for (;;) { const v = await fn(); if (ok(v)) return v; if (deps.clock() > end) return null; await deps.sleep(every); } };
  const usage = async () => { const r = await api('GET', '/api/learn/usage'); if (!r.ok) throw new Stop(`could not read /api/learn/usage (HTTP ${r.status}).`); const f = r.json.byFeature?.find(x => x.feature === 'image_edit'); return { used: f?.usedCredits ?? 0, reserved: r.json.reservedCredits ?? 0, unknown: f?.unknownAttempts ?? 0, remaining: r.json.remainingCredits }; };

  try {
    const me = await api('GET', '/api/me');
    if (me.status !== 200) throw new Stop(`the cookie was refused by ${ORIGIN}/api/me (HTTP ${me.status}): sign in again and copy a fresh small_session value.`);
    say('signed in (identity not shown)');
    const quote = await api('GET', '/api/learn/files/image-edits');
    if (quote.json?.available !== true) throw new Stop(`image editing is not available on ${ORIGIN} (available ${quote.json?.available}, HTTP ${quote.status}): the activation commit or the OpenAI key is not live yet.`);
    if (quote.json.maximumReservedCredits !== RESERVE_CREDITS) throw new Stop(`the quote shows a reservation of ${quote.json.maximumReservedCredits} credits, not the ${RESERVE_CREDITS} this plan books for. Fix the configuration or this plan first.`);
    if (typeof quote.json.model !== 'string' || /usd|\$|dollar/i.test(JSON.stringify(quote.json))) throw new Stop('the availability answer names no model, or shows a dollar figure to a person.');
    say(`available; reservation ${quote.json.maximumReservedCredits} credits; model ${quote.json.model}`);
    const b0 = budget.status();
    if (!(b0.remaining >= totalOf(names) + 1)) throw new Stop(`the shared budget has US$${b0.remaining} left; this plan books US$${totalOf(names)} and keeps US$1 spare. Nothing was booked.`);
    const u0 = await usage();
    if (paid.length && u0.remaining < RESERVE_CREDITS) throw new Stop(`only ${u0.remaining} credits left; a paid run holds up to ${RESERVE_CREDITS}.`);
    say(`shared budget: US$${b0.remaining} left; credits left ${u0.remaining}`);

    // A canvas holding one saved PNG image card, created through the same routes the app uses.
    const setup = async (label, rev) => {
      const created = await api('POST', '/api/canvases', { title: `Ctrl+K image acceptance ${label} ${stamp}` }), canvas = created.json?.name;
      if (!canvas) throw new Stop(`${label}: could not create a canvas (HTTP ${created.status})`);
      const board = `/api/learn/boards/${canvas}/main`, empty = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
      await api('PUT', board, { state: empty, version: (await api('GET', board)).json?.version });
      const upload = async (name, bytes) => {
        const declared = await api('POST', '/api/learn/files', { app: canvas, board: 'main', name, type: 'image/png', size: bytes.length, sha256: sha256(bytes), family: 'image' });
        if (!declared.ok) throw new Stop(`${label}: declaring ${name} answered HTTP ${declared.status}`);
        if (declared.json.upload) { const up = await api('PUT', declared.json.upload.url, new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } }); if (!up.ok) throw new Stop(`${label}: uploading ${name} answered HTTP ${up.status}`); }
        return { id: declared.json.source.id, sha256: sha256(bytes), bytes: bytes.length };
      };
      const subject = subjectPng(), src = await upload('subject.png', subject);
      const fam = canvasFamilyOf({ kind: 'file', sourceId: `file:${src.id}@${src.sha256}`, name: 'subject.png' });
      const card = fam && fileCardFromSource({ id: src.id, rev: rev ?? src.sha256, name: 'subject.png', type: 'image/png', size: src.bytes }, fam, {});
      if (!card) throw new Stop(`${label}: the web code cannot make an image card for the upload`);
      const got = await api('GET', board);
      const put = await api('PUT', board, { state: { ...empty, blocks: [{ id: 'img1', x: 60, y: 60, w: 360, h: 360, ...card }] }, version: got.json?.version });
      const stored = (await api('GET', board)).json?.state?.blocks?.find(b => b?.id === 'img1');
      if (!put.ok || stored?.fileRef?.source?.id !== src.id) throw new Stop(`${label}: the board did not keep the image card (HTTP ${put.status}); open ${ORIGIN}/apps/${canvas} and add subject.png by hand, then re-run this run`);
      return { canvas, board, src, upload };
    };
    const body = (run, s, extra = {}) => ({ operation: run.operation, sourceId: s.src.id, app: s.canvas, board: 'main', cardId: 'img1', idempotencyKey: `acc-${run.key}-${stamp}`, paidConfirmation: true, maxReservedCredits: RESERVE_CREDITS, ...extra });
    const submit = b => api('POST', '/api/learn/files/image-edits', b);
    const jobOf = id => api('GET', `/api/learn/files/image-edits/${id}`).then(r => r.json?.job);
    const TERMINAL = ['ready', 'cancelled', 'refused', 'unknown'];
    const PROMPT = 'Make the selected square solid blue.';

    for (const name of names) {
      const run = { ...RUNS[name], key: name };
      if (!o.force && deps.receipts.passed(name)) { say(`${name}: skipped, a PASS receipt exists (--force repeats it)`); continue; }
      const checks = [], receipt = { run: name, kind: run.kind, started: deps.now(), checks };
      const ok = (what, pass, detail = '') => { checks.push({ what, pass: !!pass, ...(detail ? { detail: String(detail) } : {}) }); say(`  ${pass ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!pass) throw new Stop(`${name}: ${what}${detail ? ` (${detail})` : ''}`); };
      const runId = `ctrlkimg-${name}-${stamp}`;
      let phase = 'none'; // none -> booked (nothing sent) -> sent (the provider may have been reached)
      say(`${name}: ${run.kind}${run.kind === 'paid' ? `, booked max US$${BOOK_USD}` : ''}${run.ui ? ', you drive the browser' : ''}`);
      try {
        const before = await usage();
        if (name === 'free-refusals') {
          const s = await setup('refusals'), stale = await setup('stale revision', 'f'.repeat(64));
          const base = body({ ...run, operation: 'remove_background' }, s);
          const refusals = [
            ['no paid confirmation is refused (400)', await submit({ ...base, paidConfirmation: false }), 400],
            ['an approved maximum below the reservation is refused (409 consent_bound)', await submit({ ...base, maxReservedCredits: RESERVE_CREDITS - 1 }), 409],
            ['a card whose revision is not the stored image is refused (409)', await submit({ ...body({ ...run, key: 'stale', operation: 'remove_background' }, stale) }), 409],
            ['a card id that does not exist is refused (404)', await submit({ ...base, cardId: 'nope' }), 404],
            ['a mask on a removal is refused (400)', await submit({ ...base, maskSourceId: s.src.id }), 400],
          ];
          for (const [what, r, status] of refusals) ok(what, r.status === status, `HTTP ${r.status} ${r.json?.code || ''}`);
          const after = await usage();
          ok('nothing was charged and nothing is held', after.used === before.used && after.reserved === before.reserved && after.unknown === before.unknown, `${before.used}/${before.reserved} -> ${after.used}/${after.reserved}`);
          receipt.verdict = 'PASS';
        } else {
          const s = await setup(name);
          receipt.canvas = s.canvas;
          say(`  canvas ${s.canvas} created (delete it when you are done): ${ORIGIN}/apps/${s.canvas}`);
          const booked = budget.reserve(runId, 'ctrlk-image-acceptance', BOOK_USD);
          if (!booked.ok) throw new Stop(`${name}: the budget refused the booking (${booked.reason}); nothing was sent.`);
          phase = 'booked';
          say(`  booked US$${BOOK_USD} as ${runId}; shared budget left ${booked.remaining}`);
          let job = null, artifactId = null;
          if (run.ui) {
            say('');
            say(`  YOUR TURN. Open ${ORIGIN}/apps/${s.canvas}`);
            say(`   1. Click the image, press Ctrl+K, choose Edit, ${run.operation === 'edit_image' ? 'choose "Edit image region", draw a rectangle on the picture, type "make the rectangle solid blue"' : 'choose "Remove background"'}.`);
            say(`   2. The panel must show "Maximum reserved for this request: ${RESERVE_CREDITS} credits". Approve it. Double-click the approve button on purpose: one job only.`);
            say('   3. While it runs, reload the page: it must offer to resume, then show the preview. Press Apply.');
            say('  Waiting for the Apply (up to 20 minutes) ...');
            phase = 'sent';
            const board = await poll(async () => (await api('GET', s.board)).json?.state?.blocks, bs => bs?.some(b => b?.fileRef?.source?.id && b.fileRef.source.id !== s.src.id), 20 * 60 * 1000, 3000);
            if (!board) { const u = await usage(); if (u.used === before.used && u.reserved === before.reserved) { budget.release(runId); phase = 'none'; throw new Stop(`${name}: Apply was not pressed within 20 minutes and nothing was charged (the booking was released).`); } throw new Stop(`${name}: no Apply within 20 minutes but credits moved; the booking stays at its maximum until checked.`); }
            artifactId = board.find(b => b?.fileRef?.source?.id !== s.src.id && b?.fileRef?.source?.id)?.fileRef.source.id;
            ok('Apply replaced the image on the board (exactly one image card)', board.filter(b => b?.fileRef?.source).length === 1, `${board.length} card(s)`);
          } else {
            if (run.operation === 'edit_image') {
              const maskBytes = maskPng(), mask = await s.upload('mask.png', maskBytes);
              Object.assign(run, { mask });
            }
            const req = body(run, s, run.operation === 'edit_image' ? { maskSourceId: run.mask.id, maskSha256: run.mask.sha256, prompt: PROMPT } : {});
            phase = 'sent'; // from here a request may have left, so any doubt keeps the booking at its maximum
            const first = await submit(req);
            if (first.status !== 201 || !first.json?.job?.id) {
              const definite = first.json !== null && (first.status < 500 || first.status === 503);
              if (definite) { budget.release(runId); phase = 'none'; throw new Stop(`${name}: the job was refused (HTTP ${first.status} ${first.json?.code || first.json?.error || ''}); nothing was sent and the booking was released.`); }
              throw new Stop(`${name}: the job request got no clear answer (HTTP ${first.status}); the booking stays at its maximum until checked.`);
            }
            const id = first.json.job.id;
            if (name === 'cancel') {
              const cancelled = await api('POST', `/api/learn/files/image-edits/${id}/cancel`, {});
              ok('cancel is accepted for the owner', cancelled.ok && cancelled.json?.job?.id === id, `HTTP ${cancelled.status}`);
            } else {
              const second = await submit(req);
              ok('a duplicate submit reaches the same job', second.status === 201 && second.json?.job?.id === id, `HTTP ${second.status}`);
              if (run.operation === 'edit_image') { const clash = await submit({ ...req, prompt: 'A different prompt under the same key.' }); ok('the same key with a different request is refused (409)', clash.status === 409, `HTTP ${clash.status}`); }
              const other = await api('GET', `/api/learn/files/image-edits/ij_${'f'.repeat(32)}`);
              ok('an unknown job answers 404', other.status === 404, `HTTP ${other.status}`);
            }
            job = await poll(() => jobOf(id), j => j && TERMINAL.includes(j.phase), 6 * 60 * 1000, 3000);
            if (!job) { budget.uncertain(runId); throw new Stop(`${name}: the job did not finish in time; its booking stays at the maximum. Check the provider dashboard, then re-run.`); }
            say(`  job ${id}: ${job.phase}${job.reason ? ` (${job.reason})` : ''}, reservation ${job.reservation}`);
            ok('a status re-read (reload recovery) returns the same job and phase', (await jobOf(id))?.phase === job.phase && (await jobOf(id))?.id === id);
            ok('the job view shows no dollar figure', !/usd|dollar|\$/i.test(JSON.stringify(job)));
            if (job.phase === 'ready') artifactId = job.artifactId;
          }

          // The money: what the ledger charged this account.
          const after = await poll(usage, a => a.reserved <= before.reserved + 1e-9, 30 * 1000, 2000) ?? await usage();
          const charged = Number((after.used - before.used).toFixed(4));
          receipt.credits = { before, after, charged };
          if (name === 'cancel') {
            const released = job.phase === 'cancelled' && job.reservation === 'released';
            if (released) { budget.release(runId); phase = 'none'; } else if (charged > 0 && charged < RESERVE_CREDITS - 1e-9) { budget.settle(runId, Number((charged * 0.01).toFixed(4))); phase = 'none'; } else budget.uncertain(runId);
            ok('the cancel left a terminal job (cancelled before dispatch, or it had already run)', ['cancelled', 'ready', 'unknown'].includes(job.phase), `${job.phase}, reservation ${job.reservation}`);
            ok('no credits remain held', Math.abs(after.reserved - before.reserved) < 1e-9, `${before.reserved} -> ${after.reserved}`);
            ok(released ? 'a cancel before dispatch charged nothing' : 'a cancel that lost the race was charged at most the reservation', released ? charged === 0 : charged <= RESERVE_CREDITS + 1e-9, `${charged} credits`);
          } else {
            const clipped = charged >= RESERVE_CREDITS - 1e-9;
            if (charged > 0 && !clipped) { budget.settle(runId, Number((charged * 0.01).toFixed(4))); phase = 'none'; } else budget.uncertain(runId);
            ok('credits were charged, within the approved reservation', charged > 0 && charged <= RESERVE_CREDITS + 1e-9, `${charged} of ${RESERVE_CREDITS} credits`);
            ok('the hold is released (reserved credits are back where they were)', Math.abs(after.reserved - before.reserved) < 1e-9, `${before.reserved} -> ${after.reserved}`);
            ok('the cost is not left unknown (priced from the provider usage)', after.unknown === before.unknown, `unknown attempts ${before.unknown} -> ${after.unknown}`);
            ok(`the charge is the priced usage, not the flat reservation`, charged < RESERVE_CREDITS - 1e-9, `${charged} < ${RESERVE_CREDITS}`);
          }
          if (artifactId) {
            const file = await api('GET', `/api/learn/files/${artifactId}`, undefined, { raw: true });
            const head = file.bytes ? ihdrOf(file.bytes) : {};
            ok('the stored result downloads', file.status === 200 && file.bytes?.length > 0, `HTTP ${file.status}, ${file.bytes?.length} bytes`);
            ok('it has a PNG signature, 1024x1024', head.signature && head.width === 1024 && head.height === 1024, JSON.stringify(head));
            if (run.operation === 'remove_background') ok('it has an alpha channel (RGBA)', head.colorType === 6, `colour type ${head.colorType}`);
            ok('it is within the 10 MiB output bound', file.bytes.length <= 10 * 1024 * 1024, `${file.bytes.length} bytes`);
            receipt.result = { sourceId: artifactId, sha256: sha256(file.bytes), bytes: file.bytes.length, ...head };
            const original = await api('GET', `/api/learn/files/${s.src.id}`, undefined, { raw: true });
            ok('the original image is untouched', original.status === 200 && sha256(original.bytes) === s.src.sha256, `HTTP ${original.status}`);
            if (run.ui) {
              say(`  LOOK: ${ORIGIN}/apps/${s.canvas} must show the edited image on the card (not broken). Reload once more (Ctrl+R).`);
              await deps.pause('  Press Enter here when you have reloaded and the edited image is still there: ');
              const still = (await api('GET', s.board)).json?.state?.blocks?.filter(b => b?.fileRef?.source?.id === artifactId);
              ok('after the reload the board still holds the edited image (exactly one card)', still?.length === 1, `${still?.length ?? 0} card(s)`);
              receipt.card = { placedBy: 'your browser', persisted: true };
            }
          } else if (name !== 'cancel') ok('the job produced a result', false, `phase ${job?.phase}`);
          receipt.verdict = 'PASS';
        }
        receipt.finished = deps.now();
        deps.receipts.write(name, stamp, JSON.stringify(receipt, null, 2));
        done.runs[name] = 'PASS';
        say(`${name}: PASS`);
      } catch (error) {
        if (phase === 'sent') { try { budget.uncertain(runId); } catch { /* already settled or released */ } }
        if (phase === 'booked') { try { budget.release(runId); } catch { /* nothing was sent: released */ } }
        receipt.verdict = 'FAIL'; receipt.failed = String(error.message || error); receipt.finished = deps.now();
        deps.receipts.write(name, stamp, JSON.stringify(receipt, null, 2));
        throw error;
      }
    }
  } catch (error) {
    say(`FAILED: ${error.message || error}`);
    done.failed = String(error.message || error);
    deps.receipts.writeSummary(stamp, JSON.stringify(done, null, 2));
    return 1;
  }
  done.finished = deps.now();
  deps.receipts.writeSummary(stamp, JSON.stringify(done, null, 2));
  say(`ACCEPTANCE PASSED for ${Object.keys(done.runs).length} runs. Not covered: how the result looks beyond your glance; JPEG/WebP/other sources (only PNG up to 5 MiB is supported); masks that are not rectangles; storage failure and restart recovery of the Durable Object; a provider failure on the deployed path (it cannot be induced without a fault switch, so only the refusal paths are proven to charge nothing); concurrent users.`);
  return 0;
}

await runEntry(import.meta.url, 'C:/s/spec/ctrlk-image-accept/receipts', 'ctrlkimg', accept);
