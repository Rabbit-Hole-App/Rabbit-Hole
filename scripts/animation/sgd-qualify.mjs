// AN-21 Gate 2: ten full-pipeline SGD requests on the candidate's dev preview, one job each, up to five at a time across several dev test sessions.
// Read docs/features/animation/gate2-qualification.md first. PAID: every job calls the planner, the author, the reviewer and the repairer on the
// dev clone's model key. Parallel announces the batch size and cost before it runs.
//
//   node scripts/animation/sgd-qualify.mjs --dry-run                      the whole script against a fake server: no network, nothing spent
//   node scripts/animation/sgd-qualify.mjs --check <flags>                configuration and candidate identity, read-only, no job is created
//   node scripts/animation/sgd-qualify.mjs <flags>                        the paid run
// flags: --base <preview origin> --candidate-worktree <dir> --mvp3-sha <sha> --prompts-hash <hex> --golden-hash <hex> --cap <credits> --prior <credits>
//        [--sessions-file F] [--concurrency 1..5] [--out DIR] [--stop-file F] [--typical author=32,review=15,repair=24] [--run-all] ...
// env:   PREVIEW_VERSION and PREVIEW_SHA (the integrator gives them); PRIOR_CREDITS may stand in for --prior.
//
// Rules the script keeps: one job per phrasing and no retry beyond the product's own automatic one (no retry, refine or new-attempt route is ever
// called); every job on a fresh canvas; a spend guard over ALL running jobs (cumulative cap argument); a per-session allowance check before each
// job; a stop file or Ctrl+C cancels every running job through the product's cancel route. Exit: 0 PASS, 1 FAIL, 2 usage or configuration,
// 3 halted or incomplete, 4 REFUSED before any spend (identity or preview-pin gate), 130 second Ctrl+C.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { CREDENTIALS, PACING, RUN_OUT, insideRepo, makeCall, markUsed, prefixOf, readKey, readSessions, readUsage, readUsed, usable } from './dev-test-session.mjs';
import { MUST_RERUN, inputProblem, realDeps, runGate } from './sgd-qualify-gate.mjs';
import { DRY_RUN, FAKE_GOLDEN, createFake, fakeReviewer } from './sgd-qualify-fake.mjs';
import { REVIEW_CREDITS_EXPECTED, appendSpend, loadProduct, manifestInfo, passedBefore, providerReview, readGolden, readManifest, runControls, spendLine, writeControls } from './gate2-controls.mjs';

// Plan section 8, "Gate 2 phrasings", exactly. The tenth is the wrong-subject control.
export const PHRASINGS = Object.freeze([
  'stochastic gradient descent',
  'SGD on a bowl-shaped loss',
  'gradient descent with two learning rates',
  'show me why a high learning rate diverges',
  'a ball rolling down a loss surface, step by step',
  'minimize a quadratic loss with gradient steps',
  'compare learning rate 0.1 and 1.5 on the same surface',
  'gradient descent that overshoots the minimum',
  'SGD with a kept path to compare runs',
  'the 2 sigma problem of optimizers',
]);
export const CONTROL = 10;
export const DEFAULT_OUT = RUN_OUT;
const ROOT = '/api/learn/animation/jobs';
const EMPTY_BOARD = { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [] };

// ---- the spend guard (guard5/guard6 in spirit: actuals, not reservations; the platform's own gates are untouched, the tool only cancels) ----
// Typical settled cost of a call on SGD jobs (guard5, measured over the first paid sequences): a settled call above 1.2 x its typical stops that job, and
// 1.2 x is also the EXPECTED cost of a call still running for the cap rule. Briefs have no stop of their own, only the cap. Override with --typical.
export const TYPICAL = Object.freeze({ author: 32, review: 15, repair: 24 });
export const BRIEF_EXPECTED = 8.1, HEADROOM_FINAL_REVIEW = 30;
export const expectedOf = (typical = TYPICAL) => ({ brief: BRIEF_EXPECTED, author: typical.author * 1.2, review: typical.review * 1.2, repair: typical.repair * 1.2 });
// A call whose cost the provider never confirmed (status unknown) is never counted as zero: it is counted at its role's typical cost.
const costOf = c => (c.status === 'unknown' && !c.costMicros ? (TYPICAL[c.role] ?? BRIEF_EXPECTED) * 1e4 : c.costMicros || 0);
const settledOf = calls => calls.filter(c => c.status !== 'running').reduce((t, c) => t + costOf(c), 0) / 1e4;
// jobs: [{ key, calls, repairs, extraRole? }] -> { line, stopAll, stopJobs }. stopAll: the cumulative cap would be passed (cancel every running job).
// stopJobs: key -> reason, one job's call settled above 1.2 x its typical (cancel that job).
export function decide({ jobs, prior, finished = 0, cap, typical = TYPICAL, expected = expectedOf(typical) }) {
  let settled = finished, next = 0;
  const stopJobs = new Map(), roles = new Map();
  for (const j of jobs) {
    const done = j.calls.filter(c => c.status !== 'running'), r = j.extraRole ? [j.extraRole] : j.calls.filter(c => c.status === 'running').map(c => c.role);
    settled += settledOf(j.calls); roles.set(j.key, r);
    next += Math.max(0, ...r.map(role => expected[role] ?? 40));
    const over = done.find(c => typical[c.role] && (c.costMicros || 0) / 1e4 > typical[c.role] * 1.2);
    if (over) stopJobs.set(j.key, `${/^[aeiou]/.test(over.role) ? 'an' : 'a'} ${over.role} call settled at ${((over.costMicros || 0) / 1e4).toFixed(2)}, over 120% of its typical ${typical[over.role]}`);
  }
  const total = prior + settled, headroom = cap - total;
  const line = `prior ${prior} + settled ${settled.toFixed(2)} + expected cost of the running calls ${next.toFixed(2)} = ${(total + next).toFixed(2)} of ${cap} (headroom ${headroom.toFixed(2)})`;
  let stopAll = null;
  if (total + next > cap) stopAll = `prior + settled + the expected cost of the running calls is ${(total + next).toFixed(2)}, over the cap ${cap}`;
  else if (jobs.some(j => roles.get(j.key).includes('review') && (j.repairs || 0) > 0) && headroom < HEADROOM_FINAL_REVIEW) stopAll = `a final review after a repair needs ${HEADROOM_FINAL_REVIEW} credits of headroom, ${headroom.toFixed(2)} left`;
  return { line, stopAll, stopJobs };
}

// ---- the pass rule ----
// "Silently became SGD": any of these in the planned or accepted scene's own words. A deterministic text check, so a false positive (a plan that says
// "gradient" for a colour) fails the control and the exported plan shows why; it never passes a plan that is about gradient descent.
export const SGD_MARKERS = Object.freeze([['sgd', /\bsgd\b/i], ['gradient', /gradient/i], ['loss surface', /loss[\s_-]*(surface|landscape)/i], ['loss function', /loss[\s_-]*(function|curve)/i],
  ['learning rate', /learning[\s_-]*rate/i], ['descent', /\bdescent\b/i], ['loss_surface archetype', /loss_surface/i]]);
export const sgdMarkers = (...values) => { const text = values.map(v => (typeof v === 'string' ? v : JSON.stringify(v ?? ''))).join('\n'); return SGD_MARKERS.filter(([, re]) => re.test(text)).map(([name]) => name); };
const REJECTING = new Set(['rounds', 'no_progress', 'unsupported_repair']);
export function classify(job) {
  const why = String(job?.failure?.message ?? job?.stopReason ?? '').replace(/\s+/g, ' ').slice(0, 160);
  if (job.stage === 'ready') return { outcome: 'accepted', note: '' };
  if (job.stage === 'cancelled') return { outcome: 'stopped', note: 'cancelled' };
  if (job.stopReason === 'capability_gap') return { outcome: 'gap', note: why };
  if (job.stopReason === 'needs_clarification') return { outcome: 'clarify', note: why };
  return { outcome: REJECTING.has(job.stopReason) ? 'rejected' : 'failed', note: `${job.stopReason}: ${why}` };
}
// stopped = the operator, the cap or the preview stopped it; exhausted = the test user could not start it (HTTP 429: the escrow's free-failure cap or its
// allowance). Neither is a result, neither is a lost job, and a rerun of this candidate (with fresh users) runs the phrasing again.
export const isFinal = row => !['stopped', 'exhausted'].includes(row.outcome);
export const latestPerJob = rows => [...new Map(rows.map(r => [r.n, r])).values()].sort((a, b) => a.n - b.n);
// -> { verdict: 'PASS' | 'FAIL' | 'INCOMPLETE', why, accepted, lost }. Pass: 8 of the first 9 accepted AND the tenth did not silently become SGD.
export function verdictOf(rows) {
  const final = latestPerJob(rows).filter(isFinal), first9 = final.filter(r => r.n <= 9), control = final.find(r => r.n === CONTROL);
  const accepted = first9.filter(r => r.outcome === 'accepted').length, lost = first9.length - accepted;
  if (lost >= 2) return { verdict: 'FAIL', why: `${accepted} of the first ${first9.length} accepted, ${lost} not: 8 of the first 9 can no longer be reached`, accepted, lost };
  if (first9.length < 9) return { verdict: 'INCOMPLETE', why: `${9 - first9.length} of the first 9 have no result yet (${accepted} accepted so far)`, accepted, lost };
  if (control?.silentSgd) return { verdict: 'FAIL', why: `the control became SGD (${control.markers.join(', ')}) instead of a plan about its own subject or a reported gap`, accepted, lost };
  if (!control) return { verdict: 'INCOMPLETE', why: `${accepted} of the first 9 accepted; the control has no result yet`, accepted, lost };
  return { verdict: 'PASS', why: `${accepted} of the first 9 accepted; the control ${control.outcome === 'gap' ? 'reported a gap' : control.outcome === 'clarify' ? 'asked a question' : 'planned its own subject'}, not SGD`, accepted, lost };
}

// ---- output ----
const cell = v => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
export const ptClock = (date = new Date()) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
export function resultTable(rows) {
  const head = '| # | Phrasing | Job id | Outcome | Repairs | Settled credits | Charged credits | Artifact hash | Session |\n|---|---|---|---|---|---|---|---|---|';
  return [head, ...latestPerJob(rows).map(r => `| ${r.n} | ${cell(r.phrasing)} | ${cell(r.jobId ?? '-')} | ${cell(r.outcome)}${r.note && r.outcome !== 'accepted' ? ` (${cell(r.note).slice(0, 70)})` : ''} | ${r.repairs} | ${r.credits.toFixed(2)} | ${r.charged} | ${r.artifactHash ? r.artifactHash.slice(0, 16) : '-'} | ${cell(r.session)} |`)].join('\n');
}
const SPEND_HEAD = '| # | Time (PT) | Candidate SHA | Preview version | Phrasing | Job id | Outcome | Repairs | Settled credits | Charged credits | Artifact hash | Run total credits |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
export const spendRow = (r, total) => `| ${r.n} | ${r.time} | ${r.sha} | ${r.version} | ${cell(r.phrasing)} | ${cell(r.jobId ?? '-')} | ${cell(r.outcome)} | ${r.repairs} | ${r.credits.toFixed(2)} | ${r.charged} | ${r.artifactHash ? r.artifactHash.slice(0, 16) : '-'} | ${total.toFixed(2)} |\n`;

// The compact result for another program: the candidate, the three identities Gate 1 recorded and the gate verified, the verdict and one row per job.
export function machineResult({ candidateSha, version, identities, result, cap, prior, at }) {
  const rows = latestPerJob(result.rows), control = rows.find(r => r.n === CONTROL), v = result.verdict;
  return { schema: 'sgd-gate2-result/1', candidateSha, previewVersion: version, identities, verdict: v.verdict, why: v.why, accepted: v.accepted, lost: v.lost,
    control: control ? { outcome: control.outcome, silentSgd: control.silentSgd, markers: control.markers } : null, halt: result.halt, notRun: result.notRun,
    rows: rows.map(r => ({ n: r.n, phrasing: r.phrasing, jobId: r.jobId, outcome: r.outcome, repairs: r.repairs, settledCredits: Number(r.credits.toFixed(2)), chargedCredits: r.charged, artifactHash: r.artifactHash, session: r.session, note: r.note })),
    settledCredits: Number(result.finished.toFixed(2)), cap, prior, finishedAt: at.toISOString() };
}

class Stopped extends Error { constructor(outcome, note) { super(note); this.outcome = outcome; this.note = note; } }

// ---- the run ----
// cfg: { phrasings, sessions: [{ email, call }], concurrency, cap, prior, typical, expected, features, sha, version, out, pollMs, planTimeoutMs, jobTimeoutMs,
//        settleWaitMs, jobWorstCase, runAll, choice, rows }.   deps: { sleep, now, log, shouldStop }
export async function runQualify(cfg, deps) {
  const { sleep, now, log } = deps, expected = cfg.expected ?? expectedOf(cfg.typical), rows = [...(cfg.rows ?? [])];
  const live = new Map(), inflight = new Map(cfg.sessions.map(s => [s.email, 0])), skipped = new Map(), startUsed = new Map();
  const ctx = { halt: null, finished: rows.reduce((t, r) => t + r.credits, 0) + (cfg.extraSpent ?? 0), noMore: null };
  mkdirSync(cfg.out, { recursive: true });
  if (!existsSync(join(cfg.out, 'spend-rows.md'))) writeFileSync(join(cfg.out, 'spend-rows.md'), SPEND_HEAD);
  const say = (n, text) => log(`[job ${n}] ${text}`);
  const halt = (kind, reason) => { if (ctx.halt) return; ctx.halt = { kind, reason }; log(`HALT (${kind}): ${reason}; cancelling ${live.size} running job(s) through the product's cancel route`); for (const L of live.values()) cancel(L); };
  const cancel = L => { if (L.jobId && !L.cancelP) L.cancelP = L.call('POST', `${ROOT}/${L.jobId}/cancel`, { boardId: L.boardId }).catch(() => null); return L.cancelP ?? Promise.resolve(); };
  const guard = extra => decide({ jobs: [...live.values()].map(L => ({ key: L.key, calls: L.calls, repairs: L.job?.repairs ?? 0, extraRole: extra?.L === L ? extra.role : undefined })), prior: cfg.prior, finished: ctx.finished, cap: cfg.cap, typical: cfg.typical, expected });

  // One read of the job with its diagnostics; the guard runs on every read, over every running job.
  async function read(L) {
    const r = await L.call('GET', `${ROOT}/${L.jobId}?board=${L.boardId}&detail=1`);
    if (r.status !== 200 || !r.data?.job) throw new Error(`job read HTTP ${r.status}`);
    L.d = r.data; L.job = r.data.job; L.calls = r.data.diagnostics?.calls ?? L.calls;
    return r.data;
  }
  async function poll(L, until, timeoutMs) {
    const end = now() + timeoutMs;
    for (;;) {
      const stop = deps.shouldStop?.(); if (stop) halt(stop.kind, stop.reason);
      if (ctx.halt) throw new Stopped('stopped', `${ctx.halt.kind}: ${ctx.halt.reason}`);
      const d = await read(L);
      if (!d.diagnostics) { halt('config', 'the preview served no diagnostics (ANIMATION_DIAGNOSTICS is off), so the spend guard cannot read the calls'); continue; }
      if (until(d.job)) return d.job;
      const g = guard();
      if (g.stopAll) { halt('cap', g.stopAll); continue; }
      if (g.stopJobs.has(L.key)) throw new Stopped('cost-stop', g.stopJobs.get(L.key));
      if (now() >= end) throw new Stopped('timeout', `no end after ${Math.round(timeoutMs / 60000)} minutes`);
      await sleep(cfg.pollMs);
    }
  }
  const messages = async L => (await L.call('GET', `/api/ask/threads/${L.job.threadId ?? (await L.call('GET', `/api/learn/chat/active?app=${L.app}`)).data?.threadId}`)).data?.messages ?? [];
  const proposalsOf = (msgs, jobId) => msgs.map(m => ({ id: m.messageId ?? m.id, p: m.meta?.proposal ?? m.proposal })).filter(x => x.p?.input?.job === jobId);

  async function exportJob(L, row, artifact) {
    if (!L.jobId) return;
    const dir = join(cfg.out, L.jobId); mkdirSync(dir, { recursive: true });
    const put = (name, value) => writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 1));
    const diag = L.d?.diagnostics ?? {}, src = draft => draft?.program?.source ?? (typeof draft?.program === 'string' ? draft.program : null);
    put('diagnostics-detail1.json', L.d ?? {}); put('job.json', L.job ?? {}); put('plan.json', L.job?.plan ?? null); put('reviews.json', diag.reviews ?? []);
    if (src(diag.draft)) put('program-last-draft.js', src(diag.draft));
    (diag.candidates ?? []).forEach((c, i) => { if (src(c.previousDraft)) put(`program-before-repair-${c.repairs ?? i}.js`, src(c.previousDraft)); });
    try { put('chat-messages.json', (await messages(L)).filter(m => JSON.stringify(m).includes(L.jobId))); } catch { /* the Chat read is evidence, not a result */ }
    if (artifact) { const text = JSON.stringify(artifact); put('artifact.json', text); row.fileSha256 = createHash('sha256').update(text).digest('hex'); }
    put('summary.json', row);
  }
  // A cancelled job's call already sent finishes and settles (the product says so): read until none is running, so its cost is in the row.
  async function settleAfterCancel(L) {
    await cancel(L); const end = now() + cfg.settleWaitMs;
    while (L.jobId) { try { await read(L); } catch { return; } if (!L.calls.some(c => c.status === 'running') || now() >= end) return; await sleep(cfg.pollMs); }
  }

  async function runOne(n, session) {
    const L = { key: `job-${n}`, n, call: session.call, calls: [], job: null, d: null, jobId: null, boardId: null, app: null, cancelP: null };
    const row = { n, phrasing: cfg.phrasings[n - 1], session: session.email, sha: cfg.sha, version: cfg.version, jobId: null, outcome: null, repairs: 0, credits: 0, charged: 0, artifactHash: null, note: '', markers: [], silentSgd: null };
    live.set(L.key, L);
    let artifact = null;
    try {
      const canvas = await L.call('POST', '/api/canvases', { title: `Gate 2 job ${n} ${cfg.sha.slice(0, 7)}` });
      L.app = canvas.data?.name; if (!L.app) throw new Error(`canvas create HTTP ${canvas.status}`);
      const board = await L.call('PUT', `/api/learn/boards/${L.app}/main`, { state: EMPTY_BOARD });
      L.boardId = board.data?.board_id; if (!L.boardId) throw new Error(`board save HTTP ${board.status}`);
      const made = await L.call('POST', ROOT, { boardId: L.boardId, requestId: `an-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, cardId: crypto.randomUUID(), prompt: row.phrasing, source: 'explicit', features: cfg.features });
      L.jobId = made.data?.job?.id; row.jobId = L.jobId;
      if (made.status === 429) throw new Stopped('exhausted', `not run: test user exhausted (create HTTP 429: ${String(made.data?.error ?? '').slice(0, 120)})`);
      if (!L.jobId) throw new Error(`create HTTP ${made.status} ${made.data?.error ?? ''}`);
      say(n, `created ${L.jobId} on ${L.app} as ${session.email}: ${row.phrasing}`);
      let job = await poll(L, j => j.terminal || j.stage === 'awaiting_approval', cfg.planTimeoutMs);
      if (!job.terminal) {
        if (n === CONTROL) {
          row.markers = sgdMarkers(job.plan);
          if (row.markers.length) { row.silentSgd = true; await settleAfterCancel(L); row.outcome = 'plan-sgd'; row.note = `the plan has SGD markers: ${row.markers.join(', ')}; not approved`; throw new Stopped('plan-sgd', row.note); }
        }
        let before = 0;
        if (job.choiceOpen) {
          const msgs = await messages(L), choice = msgs.map(m => m.meta?.animationChoice).filter(c => c?.jobId === L.jobId).at(-1);
          before = proposalsOf(msgs, L.jobId).reduce((v, x) => Math.max(v, x.p.version), 0);
          const pick = choice?.alternatives?.some(a => a.id === cfg.choice) ? cfg.choice : choice?.alternatives?.[0]?.id;
          const chose = pick && await L.call('POST', `${ROOT}/${L.jobId}/choose`, { boardId: L.boardId, key: choice.key, choice: pick });
          if (!chose || ![200, 202].includes(chose.status)) throw new Error(`choose ${pick ?? 'nothing offered'} HTTP ${chose?.status}`);
          row.note = `size choice: ${pick}`; say(n, `size choice taken: ${pick}`);
          job = await poll(L, j => j.terminal || (j.stage === 'awaiting_approval' && !j.choiceOpen), cfg.planTimeoutMs);
        }
        if (!job.terminal) {
          let found = null;
          for (let i = 0; i < 60 && !found; i += 1) {
            found = proposalsOf(await messages(L), L.jobId).filter(x => x.p.version > before).at(-1);
            if (!found) await sleep(cfg.pollMs);
          }
          if (!found) throw new Error('no plan proposal arrived in Chat');
          const proposal = (await L.call('GET', `/api/learn/chat/messages/${found.id}/proposal`)).data?.proposal ?? found.p;
          const g = guard({ L, role: 'author' });
          if (g.stopAll) { halt('cap', g.stopAll); throw new Stopped('stopped', `cap: ${g.stopAll}`); }
          say(n, `approving; ${g.line}`);
          const approved = await L.call('POST', `${ROOT}/${L.jobId}/approve`, { boardId: L.boardId, proposal });
          if (approved.status === 429) throw new Stopped('exhausted', `not run: test user exhausted (approve HTTP 429: ${String(approved.data?.error ?? '').slice(0, 120)})`);
          if (![200, 202].includes(approved.status)) throw new Error(`approve HTTP ${approved.status} ${approved.data?.error ?? ''}`);
          job = await poll(L, j => j.terminal, cfg.jobTimeoutMs);
        }
      }
      Object.assign(row, classify(job));
      if (job.stage === 'ready' && job.result?.resultId) {
        const got = await L.call('GET', `${ROOT}/results/${encodeURIComponent(job.result.resultId)}?board=${encodeURIComponent(L.boardId)}&features=${encodeURIComponent(cfg.features.join(','))}`);
        artifact = got.data?.artifact ?? null; row.artifactHash = job.result.artifactHash ?? L.d?.diagnostics?.artifactHash ?? null;
        if (!artifact) row.note = `accepted, but the result read gave HTTP ${got.status}`;
      }
    } catch (error) {
      if (!(error instanceof Stopped)) { row.outcome = 'failed'; row.note = `script error: ${error.message}`.slice(0, 200); await settleAfterCancel(L); }
      else if (row.outcome !== 'plan-sgd') {
        Object.assign(row, { outcome: error.outcome, note: error.note }); await settleAfterCancel(L);
        if (error.outcome === 'exhausted') { // stop starting jobs; the ones already running finish. Never a lost job: fresh users start over.
          ctx.noMore ??= `test user ${session.email} is exhausted (${error.note}); no new job is started. Mint fresh users (node scripts/animation/dev-test-session.mjs --mint --fresh --count 5) and rerun with the new --sessions-file`;
          log(ctx.noMore);
        }
      }
    }
    if (n === CONTROL && row.silentSgd === null) { // a reported gap or a question is not SGD; anything planned or accepted is read for markers
      row.markers = ['gap', 'clarify'].includes(row.outcome) ? [] : sgdMarkers(L.job?.plan, artifact?.title, artifact?.description, artifact?.archetype);
      row.silentSgd = row.markers.length > 0;
    }
    row.repairs = L.job?.repairs ?? 0; row.credits = settledOf(L.calls);
    if (L.calls.some(c => c.status === 'unknown')) row.note = `${row.note} (${L.calls.filter(c => c.status === 'unknown').length} call(s) of unknown cost counted at typical)`.trim(); row.charged = L.job?.usage?.credits ?? 0;
    row.time = ptClock(new Date(now())); if (!row.outcome) row.outcome = 'failed';
    await exportJob(L, row, artifact).catch(error => say(n, `export failed: ${error.message}`));
    live.delete(L.key); inflight.set(session.email, inflight.get(session.email) - 1); ctx.finished += row.credits; rows.push(row);
    appendFileSync(join(cfg.out, 'spend-rows.md'), spendRow(row, cfg.prior + ctx.finished));
    cfg.onRow?.(row, rows);
    say(n, `${row.outcome}${row.note ? ` (${row.note.slice(0, 100)})` : ''}; repairs ${row.repairs}; settled ${row.credits.toFixed(2)} credits, charged ${row.charged}; run total ${ctx.finished.toFixed(2)} of cap ${cfg.cap} (prior ${cfg.prior})`);
  }

  // The first session, round-robin from the job's own number, with allowance for one more job's worst case (counting the jobs already running on it).
  async function pickSession(n) {
    const S = cfg.sessions.length;
    for (let k = 0; k < S; k += 1) {
      const s = cfg.sessions[(n - 1 + k) % S];
      inflight.set(s.email, inflight.get(s.email) + 1); // reserved before the read, so a parallel worker sees it
      const read = await readUsage(s.call).catch(error => ({ status: 0, usage: { unavailable: error.message } }));
      const others = inflight.get(s.email) - 1;
      if (usable(read) && read.usage.remainingCredits - others * cfg.jobWorstCase >= cfg.jobWorstCase) { if (!startUsed.has(s.email)) startUsed.set(s.email, read.usage.usedCredits); return s; }
      inflight.set(s.email, others);
      const why = usable(read) ? `${read.usage.remainingCredits} credits left with ${others} job(s) running on it, one more job may need ${cfg.jobWorstCase}` : `its allowance cannot be read (HTTP ${read.status})`;
      if (skipped.get(s.email) !== why) log(`SKIP session ${s.email}: ${why}`);
      skipped.set(s.email, why);
    }
    return null;
  }

  const queue = cfg.phrasings.map((_, i) => i + 1).filter(n => !latestPerJob(rows).some(r => r.n === n && isFinal(r)));
  const jobExpected = expected.brief + expected.author + expected.review;
  async function worker() {
    for (;;) {
      const stop = deps.shouldStop?.(); if (stop) halt(stop.kind, stop.reason);
      if (ctx.halt || ctx.noMore || !queue.length) return;
      if (!cfg.runAll && verdictOf(rows).verdict === 'FAIL') { ctx.noMore ??= 'the verdict is already FAIL; no further job is started'; log(ctx.noMore); return; }
      const n = queue.shift();
      let session; // a session short only because of the jobs running on it is asked again when one ends; none short at all ends the run
      for (;;) { session = await pickSession(n); if (session || ctx.halt || ![...inflight.values()].some(v => v > 0)) break; await sleep(cfg.pollMs); }
      if (!session) { if (!ctx.halt) { ctx.noMore ??= `no session has allowance for job ${n}; the remaining jobs are not started`; log(ctx.noMore); } return; }
      // Budget: every running job may still cost what a typical job costs beyond what it settled, plus this one in full. No await between this check and live.set.
      for (;;) {
        const settled = [...live.values()].reduce((t, L) => t + settledOf(L.calls), 0), need = [...live.values()].reduce((t, L) => t + Math.max(0, jobExpected - settledOf(L.calls)), 0) + jobExpected;
        if (cfg.cap - (cfg.prior + ctx.finished + settled) >= need) break;
        if (!live.size) { ctx.noMore ??= `the cap ${cfg.cap} leaves no room for another typical job (${jobExpected.toFixed(1)} credits); job ${n} and later are not started`; log(ctx.noMore); inflight.set(session.email, inflight.get(session.email) - 1); return; }
        await sleep(cfg.pollMs);
        if (ctx.halt) { inflight.set(session.email, inflight.get(session.email) - 1); return; }
      }
      if (ctx.halt) { inflight.set(session.email, inflight.get(session.email) - 1); return; }
      await runOne(n, session);
    }
  }
  await Promise.all(Array.from({ length: cfg.concurrency }, worker));
  const notRun = cfg.phrasings.map((_, i) => i + 1).filter(n => !latestPerJob(rows).some(r => r.n === n && isFinal(r)));
  return { rows, verdict: verdictOf(rows), halt: ctx.halt, noMore: ctx.noMore, skipped: Object.fromEntries(skipped), notRun, finished: ctx.finished, startUsed: Object.fromEntries(startUsed) };
}

// ---- command line ----
export const parseTypical = text => {
  const out = { ...TYPICAL };
  for (const part of String(text ?? '').split(',').filter(Boolean)) {
    const [role, value] = part.split('=');
    if (!(role in TYPICAL) || !(Number(value) > 0)) throw new Error(`--typical wants author=N,review=N,repair=N (positive numbers), got ${part}`);
    out[role] = Number(value);
  }
  return out;
};
export function parse(argv, env = process.env) {
  const { values: v } = parseArgs({ args: argv, strict: true, options: {
    'dry-run': { type: 'boolean' }, check: { type: 'boolean' }, 'run-all': { type: 'boolean' }, controls: { type: 'boolean' }, calibrate: { type: 'string' }, golden: { type: 'string' },
    base: { type: 'string' }, 'sessions-file': { type: 'string' }, concurrency: { type: 'string', default: '1' }, cap: { type: 'string' }, prior: { type: 'string' },
    'candidate-worktree': { type: 'string' }, 'mvp3-sha': { type: 'string' }, 'prompts-hash': { type: 'string' }, 'golden-hash': { type: 'string' }, worker: { type: 'string' },
    out: { type: 'string' }, 'stop-file': { type: 'string' }, typical: { type: 'string' }, choice: { type: 'string' }, credentials: { type: 'string', default: CREDENTIALS },
    'verify-script': { type: 'string' }, 'poll-ms': { type: 'string', default: '4000' }, 'plan-timeout-min': { type: 'string', default: '6' }, 'job-timeout-min': { type: 'string', default: '20' },
    'settle-wait-min': { type: 'string', default: '3' }, 'job-worst-case': { type: 'string', default: '140' } } });
  const num = (name, raw, min) => { const x = Number(raw); if (!Number.isFinite(x) || x < min) throw new Error(`--${name} must be a number of at least ${min}, got ${raw}`); return x; };
  const o = { ...v, concurrency: num('concurrency', v.concurrency, 1), pollMs: num('poll-ms', v['poll-ms'], 0), planTimeoutMs: num('plan-timeout-min', v['plan-timeout-min'], 0.1) * 60000,
    jobTimeoutMs: num('job-timeout-min', v['job-timeout-min'], 0.1) * 60000, settleWaitMs: num('settle-wait-min', v['settle-wait-min'], 0) * 60000, jobWorstCase: num('job-worst-case', v['job-worst-case'], 1), typical: parseTypical(v.typical) };
  if (!Number.isInteger(o.concurrency) || o.concurrency > 5) throw new Error('--concurrency must be a whole number from 1 to 5');
  if (v['dry-run']) return { ...o, cap: Number(v.cap ?? 2000), prior: Number(v.prior ?? env.PRIOR_CREDITS ?? 0) };
  if (v.cap == null || (v.prior ?? env.PRIOR_CREDITS) == null) throw new Error('--cap and --prior (or PRIOR_CREDITS) are required: the cumulative cap and the credits already spent against it; neither has a default');
  o.cap = num('cap', v.cap, 1); o.prior = num('prior', v.prior ?? env.PRIOR_CREDITS, 0);
  if (o.prior >= o.cap) throw new Error(`--prior ${o.prior} leaves no room under --cap ${o.cap}`);
  if (!/^https:\/\/[^/\s]+$/.test(v.base || '')) throw new Error('--base <https://preview origin, no path> is required');
  if (!v['sessions-file']) throw new Error('--sessions-file is required: the file printed by `dev-test-session.mjs --mint --fresh --count 5` (fresh test users for this one run)');
  return o;
}

export async function main(argv, { env = process.env, out = console.log, deps: injected = {} } = {}) {
  let o;
  try { o = parse(argv, env); } catch (error) { out(`USAGE: ${error.message}`); return 2; }
  const dry = !!o['dry-run'];
  if (dry) out('DRY RUN: a fake server stands in for the preview; no network, no credential, nothing is spent');
  const outDir = resolve(o.out ?? (dry ? mkdtempSync(join(tmpdir(), 'sgd-qualify-dry-')) : DEFAULT_OUT)), stopFile = resolve(o['stop-file'] ?? join(outDir, 'STOP'));
  if (insideRepo(outDir)) { out(`USAGE: --out ${outDir} is inside the repository; exports and session-linked evidence stay outside it`); return 2; }

  // 1. identity and preview-pin gate (decision 22): any difference means Gate 1 does not describe this candidate.
  const pin = dry ? { PREVIEW_VERSION: '00000000-0000-4000-8000-000000000000', PREVIEW_SHA: 'd'.repeat(40) } : env;
  const gateOpts = { env: pin, mvp3Sha: dry ? 'e'.repeat(40) : o['mvp3-sha'], promptsHash: dry ? 'f1'.repeat(16) : o['prompts-hash'], goldenHash: dry ? 'f2'.repeat(16) : o['golden-hash'], worktree: dry ? 'dry-run' : o['candidate-worktree'] };
  const worker = o.worker ?? (dry ? 'rabbit-hole-web-dev-dry-run' : new URL(o.base).host.split('.')[0]);
  const gateDeps = injected.gate ?? (dry ? { git: args => ({ status: 0, stdout: args[0] === 'rev-parse' && args[1] === 'HEAD' ? `${pin.PREVIEW_SHA}\n` : '' }),
    candidateHashes: async () => ({ head: pin.PREVIEW_SHA, promptsHash: gateOpts.promptsHash, goldenHash: gateOpts.goldenHash }),
    wrangler: args => (args[0] === 'deployments' ? `Created: x\nVersion(s):  (100%) ${pin.PREVIEW_VERSION}\n  Tag: ${pin.PREVIEW_SHA.slice(0, 9)}\n` : 'Tag: dddddddd\nenv.ANIMATION_ENABLED ("true")\nenv.ANIMATION_DIAGNOSTICS ("true")\nenv.USAGE_PLATFORM_DAY_USD ("40")\n') }
    : realDeps({ worktree: gateOpts.worktree, worker, credentials: o.credentials, readKey, spawn: injected.spawn }));
  const gate = await runGate(gateOpts, gateDeps);
  for (const line of gate.lines) out(line);
  if (!gate.ok) {
    for (const text of [...gate.mismatches, ...gate.problems]) out(`REFUSED: ${text}`);
    if (gate.mismatches.length) out(MUST_RERUN);
    out('nothing was spent'); return gate.refusal === 'input' ? 2 : 4;
  }
  if (o['verify-script']) {
    const v = (injected.spawn ?? spawnSync)(process.execPath, [o['verify-script'], pin.PREVIEW_VERSION, pin.PREVIEW_SHA], { encoding: 'utf8', timeout: 400000 });
    out(String(v.stdout || '').split('\n').filter(l => /^(PASS|FAIL|PREVIEW)/.test(l)).join('\n'));
    if (v.status !== 0) { out('REFUSED: the preview verifier failed; nothing was spent'); return 4; }
  }

  // 2. configuration: sessions, the candidate's own client features, the stop file
  let sessions, features;
  if (dry) {
    const fake = injected.fake ?? createFake({ scenarioFor: DRY_RUN });
    sessions = ['gate2-1', 'gate2-2', 'gate2-3', 'gate2-4', 'gate2-5'].map(name => ({ email: `${name}@example.com`, call: fake.callFor(`${name}@example.com`) }));
    features = ['curve_radius', 'action_motion'];
  } else {
    try {
      sessions = readSessions(o['sessions-file']).map(s => ({ email: s.email, call: makeCall({ base: o.base, session: s.value, fetchImpl: injected.fetchImpl }) }));
      features = [...(await import(pathToFileURL(join(o['candidate-worktree'], 'packages', 'web', 'src', 'animation3d', 'capabilities.js')).href)).ANIMATION_CLIENT_FEATURES];
    } catch (error) { out(`USAGE: ${error.message}`); return 2; }
  }
  if (existsSync(stopFile)) { out(`USAGE: the stop file ${stopFile} exists; remove it first`); return 2; }
  // Fresh test users per run: a prefix that has run before is never reused (the escrow lets a learner fail 5 generations free per day; a reused user hits HTTP 429).
  const prefix = dry ? null : prefixOf(sessions.map(s => s.email));
  if (!dry && !o.controls) { // the controls alone (seed, render, a direct review) spend none of the test users' free failures
    if (!prefix) { out('USAGE: the sessions must share one prefix (<prefix>-1..N@example.com, from one `dev-test-session.mjs --mint --fresh` run)'); return 2; }
    let ran;
    try { ran = readUsed(outDir).prefixes[prefix]?.ranAt; } catch (error) { out(`USAGE: ${join(outDir, 'used-prefixes.json')} cannot be read (${error.message}); a used prefix could be reused`); return 2; }
    if (ran) { out(`REFUSED: the test users ${prefix}-1..N already ran Gate 2 at ${ran}; mint fresh ones (node scripts/animation/dev-test-session.mjs --mint --fresh --count 5) and pass the new --sessions-file`); return 2; }
  }
  const statePath = join(outDir, `state-${pin.PREVIEW_SHA.slice(0, 7)}-${pin.PREVIEW_VERSION.slice(0, 8)}.json`);
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { sha: pin.PREVIEW_SHA, version: pin.PREVIEW_VERSION, rows: [] };
  out(`candidate ${pin.PREVIEW_SHA.slice(0, 9)} preview ${pin.PREVIEW_VERSION}; ${sessions.length} session(s) ${sessions.map(s => s.email).join(', ')}; concurrency ${o.concurrency}; cap ${o.cap}, prior ${o.prior}; features ${features.join(',')}`);
  out(`output ${outDir}; stop file ${stopFile}; ${state.rows.length ? `resuming: ${state.rows.length} earlier row(s), ${verdictOf(state.rows).why}` : 'a fresh run for this candidate'}`);
  // Controls (owner standing rules): job 0, the golden, and with --calibrate the retained drafts that must fail. Free configuration checks here, the review below.
  let golden, calibration;
  try {
    golden = dry ? { ...readGolden(null, FAKE_GOLDEN) } : readGolden(o.golden ?? join(gateOpts.worktree, 'packages', 'web', 'src', 'animation3d', 'testdata', 'sgd-golden.json'));
    calibration = o.calibrate ? readManifest(o.calibrate) : [];
  } catch (error) { out(`USAGE: controls: ${error.message}`); return 2; }
  const manifest = o.calibrate ? manifestInfo(o.calibrate) : null, controlsCredits = (1 + calibration.length) * REVIEW_CREDITS_EXPECTED;
  out(`controls: job 0 is the golden SGD artifact${calibration.length ? `, with ${calibration.length} calibration draft(s) from ${manifest.path}` : ''}; about ${controlsCredits} credits as direct review calls outside the ledger`);
  if (!dry && o.cap - o.prior < controlsCredits) { out(`USAGE: --cap ${o.cap} minus --prior ${o.prior} leaves no room for the controls (about ${controlsCredits} credits)`); return 2; }
  if (o.check) { out('CHECK OK: configuration and candidate identity are valid; no job was created'); return 0; }

  // 3. controls, then the run. A rejected golden is a harness bug: nothing paid is started (exit 5).
  const before = passedBefore(outDir, pin.PREVIEW_SHA, pin.PREVIEW_VERSION, manifest?.hash);
  let controlsSpent = before?.spentCredits ?? 0;
  if (before) out(`controls: already PASS for this candidate (${before.finishedAt}); not reviewed again`);
  else {
    const apiKey = dry ? 'dry-run' : readKey(o.credentials, 'ANTHROPIC_API_KEY');
    if (!apiKey) { out(`USAGE: ANTHROPIC_API_KEY is missing from ${o.credentials} (key name only); the controls call the reviewer`); return 2; }
    const product = injected.product ?? await loadProduct(dry ? fileURLToPath(new URL('../..', import.meta.url)) : gateOpts.worktree);
    mkdirSync(outDir, { recursive: true });
    if (!existsSync(join(outDir, 'spend-rows.md'))) writeFileSync(join(outDir, 'spend-rows.md'), SPEND_HEAD);
    const result = await runControls({ golden, items: calibration, session: sessions[0], product, sha: pin.PREVIEW_SHA, version: pin.PREVIEW_VERSION, concurrency: o.concurrency }, { review: injected.review ?? (dry ? fakeReviewer() : providerReview({ product, apiKey })), log: out });
    controlsSpent = result.spentCredits;
    writeControls(outDir, { sha: pin.PREVIEW_SHA, version: pin.PREVIEW_VERSION, manifest, result, at: new Date() });
    appendSpend(outDir, result.items.map((item, i) => spendLine(item, i, pin.PREVIEW_SHA, pin.PREVIEW_VERSION, o.prior + controlsSpent, ptClock())));
    for (const item of result.items) out(`${item.drift || item.outcome === 'error' ? 'FAIL' : 'PASS'} ${item.name}: ${item.outcome} (expected ${item.expect})${item.drift ? `; DRIFT: ${item.drift}` : ''}${item.note ? `; ${item.note}` : ''}${item.findings.length ? `\n${item.findings.map(f => `    ${f.severity}/${f.category} ${f.message}`).join('\n')}` : ''}`);
    if (result.verdict !== 'PASS') {
      out(`CONTROLS FAILED (${result.goldenAccepted ? 'the golden passed, a calibration item drifted or errored' : 'the golden was rejected or could not be reviewed: a harness bug, not a candidate to qualify'}); no author job was started. Fix the review harness or the calibration set, then run again.`);
      return 5;
    }
    out(`CONTROLS OK: ${result.items.length} item(s) behaved as expected; ${result.spentCredits.toFixed(2)} credits spent on direct review calls`);
  }
  if (o.controls) { out('--controls: stopping here, no author job was started'); return 0; }
  if (!dry) markUsed(outDir, prefix, { ranAt: new Date().toISOString(), sha: pin.PREVIEW_SHA, version: pin.PREVIEW_VERSION });
  let signals = 0;
  const onSigint = () => { signals += 1; if (signals > 1) process.exit(130); out('Ctrl+C: cancelling every running job through the product\'s cancel route (press again to quit at once)'); };
  process.on('SIGINT', onSigint);
  const deps = { sleep: injected.sleep ?? (ms => new Promise(r => setTimeout(r, ms))), now: injected.now ?? (() => Date.now()), log: out,
    shouldStop: () => (signals ? { kind: 'signal', reason: 'Ctrl+C' } : existsSync(stopFile) ? { kind: 'file', reason: `stop file ${stopFile}` } : null) };
  const cfg = { extraSpent: controlsSpent, phrasings: PHRASINGS, sessions, concurrency: o.concurrency, cap: o.cap, prior: o.prior, typical: o.typical, features, sha: pin.PREVIEW_SHA, version: pin.PREVIEW_VERSION, out: outDir,
    pollMs: dry ? 0 : o.pollMs, planTimeoutMs: o.planTimeoutMs, jobTimeoutMs: o.jobTimeoutMs, settleWaitMs: o.settleWaitMs, jobWorstCase: o.jobWorstCase, runAll: !!o['run-all'], choice: o.choice, rows: state.rows,
    onRow: (_row, rows) => writeFileSync(statePath, JSON.stringify({ sha: pin.PREVIEW_SHA, version: pin.PREVIEW_VERSION, rows }, null, 1)) };
  let result;
  try { result = await runQualify(cfg, deps); } finally { process.off('SIGINT', onSigint); }

  // 4. report
  const after = [];
  for (const sess of sessions) {
    if (result.startUsed[sess.email] === undefined) continue;
    const r = await readUsage(sess.call).catch(() => null);
    after.push(r && usable(r) ? `Allowance after the run, ${sess.email}: used ${r.usage.usedCredits} (+${(r.usage.usedCredits - result.startUsed[sess.email]).toFixed(2)} this run), left ${r.usage.remainingCredits}` : `Allowance after the run, ${sess.email}: unreadable`);
  }
  const { verdict, why } = result.verdict, ran = result.rows.slice(state.rows.length), settledNow = ran.reduce((t, r) => t + r.credits, 0), charged = ran.reduce((t, r) => t + r.charged, 0);
  const text = [`# Gate 2 result: candidate ${pin.PREVIEW_SHA}, preview ${pin.PREVIEW_VERSION}`, '', resultTable(result.rows), '', `VERDICT: ${verdict}. ${why}`,
    ...(result.halt ? [`Halted (${result.halt.kind}): ${result.halt.reason}`] : []), ...(result.noMore ? [`Stopped starting jobs: ${result.noMore}`] : []),
    ...Object.entries(result.skipped).map(([email, reason]) => `Session skipped: ${email}: ${reason}`), ...(result.notRun.length ? [`Not run or not final: jobs ${result.notRun.join(', ')}`] : []), '', ...after,
    `Settled by this run: ${settledNow.toFixed(2)} credits (about US$${(settledNow / 100).toFixed(2)} at 100 credits to the dollar); charged to the test users: ${charged}; cumulative ${(o.prior + result.finished).toFixed(2)} of cap ${o.cap}.`, PACING].join('\n');
  const stamp = new Date(deps.now()).toISOString().replace(/\D/g, '').slice(0, 14);
  writeFileSync(join(outDir, `result-${pin.PREVIEW_SHA.slice(0, 7)}-${stamp}.md`), `${text}\n`);
  // The machine-readable result (lane g's combined smoke reads gate2-result.json): one compact line. A reader must check candidateSha and verdict PASS; an absent file is no result.
  const machine = `${JSON.stringify(machineResult({ candidateSha: gate.head ?? pin.PREVIEW_SHA, version: pin.PREVIEW_VERSION, identities: { mvp3Sha: gateOpts.mvp3Sha, promptsHash: gateOpts.promptsHash, goldenHash: gateOpts.goldenHash }, result, cap: o.cap, prior: o.prior, at: new Date(deps.now()) }))}\n`;
  writeFileSync(join(outDir, 'gate2-result.json'), machine);
  writeFileSync(join(outDir, `result-${pin.PREVIEW_SHA.slice(0, 7)}-${stamp}.json`), machine);
  out(`\n${text}\n\nspend rows: ${join(outDir, 'spend-rows.md')}; exports: ${outDir}/<job id>/ (the repo's spend.md edit is done by Parallel from the spend rows)`);
  return verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
