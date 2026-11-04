// AN-20 offline harness (plan section 8; owner decisions 14 and 22): N author-only samples of the /animation author role for a PINNED plan, validated by the
// product's own validateStage, written to a folder, printed as a table. It never drives a browser (CLAUDE.md); captures come from the dev preview's review page.
//   node scripts/animation/author-sample.mjs [run] <plan.json>... [-n 3] [--out DIR] [--label NAME] [--concurrency 1..5] [--sessions FILE] [--max-credits N]
//        [--candidate-sha SHA] [--freeze-prompts HASH] [--freeze-golden HASH]  (--fake-transport DRAFT.json | --dry-run | --send)
//   node scripts/animation/author-sample.mjs verify-candidate --mvp3-sha SHA --prompts HASH --golden HASH --worktree PATH
// --fake-transport DRAFT.json  offline: the stored draft is the model's reply (synthetic usage). Nothing is read from the credentials file, nothing is sent.
// --dry-run                    preflight only: builds each request, prints identities, sizes and the cost bound. Nothing is sent.
// --send                       PAID. Needs --candidate-sha, --freeze-prompts, --freeze-golden and --max-credits. The key is read BY NAME from the credentials file at the first
//                              call, held in memory, never printed. Direct call to the Messages API with the request the product's callAnimationRole builds: this is NOT the
//                              product ledger (no route runs the author alone from a pinned plan), so it does not touch any user's allowance; credits are computed from usage.
// Owner decision 22: every table and every run folder records THREE identities: the candidate SHA, the PROMPT-FILES hash and the GOLDEN artifact hash. --freeze-prompts and
// --freeze-golden REFUSE the run (exit 2, nothing spent) when the computed hash differs. The harness never changes under a measurement.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as authoring from '../../packages/control-plane/src/animation-author.js';
import { animationModel, animationRequest, callAnimationRole } from '../../packages/control-plane/src/animation-policy.js';
import { costUsd } from '../../packages/control-plane/src/learn-models.js';
import { requestSpendBound } from '../../packages/control-plane/src/learn-spend.js';
import { ANIMATION_CLIENT_FEATURES } from '../../packages/web/src/animation3d/capabilities.js';
import { canonicalJson } from '../../packages/web/src/explain-program/contract.js';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
// Owner decision 22 (2): the files whose text reaches the author, hashed in this order. The prompts (agents/), the capability text sent beside them (animation-brief.js), the
// archetype rules (lane f; absent until it lands, recorded as absent), animation-author.js (the author's user content: the archetype rules and the frozen exemplar enter there, and
// the validators and plan assertions that judge a sample live beside it) and the contract and capability constants the prompt quotes (ANIMATION_PROGRAM_CONTRACT, the draft schema, limits).
export const PROMPT_FILES = Object.freeze([
  'packages/control-plane/src/agents/animation-author.js',
  'packages/control-plane/src/agents/animation-brief.js',
  'packages/control-plane/src/agents/animation-archetypes.js',
  'packages/control-plane/src/animation-brief.js',
  'packages/control-plane/src/animation-author.js',
  'packages/web/src/animation3d/contract.js',
  'packages/web/src/animation3d/capabilities.js',
]);
// Owner decision 22 (3): the golden SGD artifact as imported by the web tests.
export const GOLDEN_FILE = 'packages/web/src/animation3d/testdata/sgd-golden.json';
// Owner decision 22 (1): the MVP3 candidate's contract and renderer source. The working tree must equal the candidate on these paths (prompt-only changes ride on top of it).
export const CANDIDATE_FILES = Object.freeze([
  'packages/web/src/animation3d/contract.js', 'packages/web/src/animation3d/capabilities.js', 'packages/web/src/animation3d/scene.js', 'packages/web/src/animation3d/framing.js',
  'packages/web/src/animation3d/renderer.js', 'packages/web/src/animation3d/session.js', 'packages/web/src/animation3d/review.js', 'packages/web/src/animation3d/runtime.js',
  'packages/web/src/animation3d/state.js', 'packages/control-plane/src/animation-render.js', 'packages/control-plane/src/animation-review.js',
]);
export const CREDENTIALS_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
export const DEFAULT_OUT_ROOT = 'C:/s/spec/animation/author-samples';
export const MAX_CONCURRENCY = 5;
export const CALLS_PER_RUN = 2; // the author may be asked once more when its reply has no artifact (FX-AN-056): a run is admitted against the bound of both calls
const CALL_MS = 300000; // the plan's author deadline (AN-17): measured calls run 87 to 126 s

const sha256 = data => createHash('sha256').update(data).digest('hex');
const lf = buffer => Buffer.from(buffer.toString('utf8').replace(/\r\n/g, '\n')); // a Windows checkout and a Linux one hash alike
const fileHash = (root, file) => (existsSync(join(root, file)) ? sha256(lf(readFileSync(join(root, file)))) : 'absent');

// ---- identities ---------------------------------------------------------------------------------------------------------------------------------------------------
export function hashFiles(root, files) {
  const per = files.map(file => [file, fileHash(root, file)]);
  return { hash: sha256(per.map(([file, h]) => `${file}\n${h}\n`).join('')), files: per };
}
const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const SHA = /^[0-9a-f]{7,40}$/;
export function identities(root = ROOT) {
  const prompts = hashFiles(root, PROMPT_FILES), head = git(root, ['rev-parse', 'HEAD']);
  return { head: head.status === 0 ? head.stdout.trim() : 'unknown', prompts: prompts.hash, promptFiles: prompts.files, golden: fileHash(root, GOLDEN_FILE) };
}
// The candidate SHA is an ancestor of (or equal to) the tree's HEAD, and the tree's contract and renderer source (committed or not) equals the candidate's.
export function checkCandidate(root, sha) {
  if (!SHA.test(sha ?? '')) return { ok: false, detail: `${sha} is not a commit SHA` };
  const ancestor = git(root, ['merge-base', '--is-ancestor', sha, 'HEAD']);
  if (ancestor.status === 1) return { ok: false, detail: `${sha.slice(0, 9)} is not an ancestor of HEAD` };
  if (ancestor.status !== 0) return { ok: false, detail: `git could not compare ${sha.slice(0, 9)} with HEAD: ${(ancestor.stderr || '').trim().slice(0, 160)}` };
  const diff = git(root, ['diff', '--name-only', sha, '--', ...CANDIDATE_FILES]);
  if (diff.status !== 0) return { ok: false, detail: `git diff failed: ${(diff.stderr || '').trim().slice(0, 160)}` };
  const changed = diff.stdout.split('\n').filter(Boolean);
  return changed.length ? { ok: false, detail: `contract or renderer source differs from ${sha.slice(0, 9)}: ${changed.join(', ')}` } : { ok: true, detail: `${sha.slice(0, 9)} is an ancestor of HEAD and the contract and renderer source equals it` };
}
// Owner decision 22: Parallel runs this before Gate 2. Read-only. -> { ok, lines }
export function verifyCandidate({ mvp3Sha, prompts, golden, worktree }) {
  const root = resolve(worktree), ids = identities(root), lines = [];
  const ancestor = SHA.test(mvp3Sha ?? '') ? git(root, ['merge-base', '--is-ancestor', mvp3Sha, 'HEAD']) : { status: 2, stderr: 'not a commit SHA' };
  const verdict = (name, ok, detail) => { lines.push(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`); return ok; };
  const results = [
    verdict('mvp3-ancestor', ancestor.status === 0, ancestor.status === 0 ? `${mvp3Sha.slice(0, 9)} is an ancestor of HEAD ${ids.head.slice(0, 9)}` : ancestor.status === 1 ? `${mvp3Sha.slice(0, 9)} is NOT an ancestor of HEAD ${ids.head.slice(0, 9)}` : `cannot compare: ${String(ancestor.stderr).trim().slice(0, 160)}`),
    verdict('prompt-files', ids.prompts === prompts, ids.prompts === prompts ? ids.prompts : `expected ${prompts}, computed ${ids.prompts}`),
    verdict('golden-artifact', ids.golden === golden, ids.golden === golden ? ids.golden : `expected ${golden}, computed ${ids.golden}`),
  ];
  lines.push(`RESULT ${results.every(Boolean) ? 'PASS' : 'FAIL'} (worktree ${root})`);
  return { ok: results.every(Boolean), lines, ids };
}
// -> [] when the run may start, else one sentence per refusal.
export function refusals({ root, ids, send, candidateSha, freezePrompts, freezeGolden, maxCredits }) {
  const out = [];
  if (send) for (const [flag, value] of [['--candidate-sha', candidateSha], ['--freeze-prompts', freezePrompts], ['--freeze-golden', freezeGolden], ['--max-credits', maxCredits]]) if (!value) out.push(`--send needs ${flag}`);
  if (candidateSha) { const c = checkCandidate(root, candidateSha); if (!c.ok) out.push(`candidate: ${c.detail}`); }
  if (freezePrompts && freezePrompts !== ids.prompts) out.push(`prompt files differ from the freeze: expected ${freezePrompts}, computed ${ids.prompts}`);
  if (freezeGolden && freezeGolden !== ids.golden) out.push(`golden artifact differs from the freeze: expected ${freezeGolden}, computed ${ids.golden}`);
  return out;
}

// ---- pinned plans -------------------------------------------------------------------------------------------------------------------------------------------------
export function loadPlan(file) {
  const pin = JSON.parse(readFileSync(file, 'utf8'));
  if (pin.schema !== 'animation-pinned-plan/1' || !pin.name || typeof pin.request !== 'string' || !pin.plan?.experience) throw new Error(`${file}: not a pinned plan (animation-pinned-plan/1 with name, request and plan)`);
  return pin;
}
export const planHashOf = plan => sha256(canonicalJson(plan));
const jobOf = pin => ({ prompt: pin.request, plan: pin.plan, features: [...ANIMATION_CLIENT_FEATURES], evidence: [], context: null });
const OFFLINE_ENV = {}; // no key here: the transport reads it by name when (and only when) it sends

// The request the product would send for this plan and what it can cost at most: authorStage with a call that stops at the request.
export async function requestOf(pin) {
  let spec = null;
  const stop = new Error('request captured');
  await authoring.authorStage(jobOf(pin), { call: async (_role, s) => { spec = s; throw stop; } }).catch(error => { if (error !== stop) throw error; });
  const body = animationRequest(OFFLINE_ENV, 'author', spec), model = animationModel('author');
  const bound = requestSpendBound(body, model, 'anthropic');
  return { spec, body, model, hash: sha256(canonicalJson({ system: spec.system, tool: spec.tool, content: spec.content })), reserveCredits: +(bound * 100).toFixed(4) };
}
export const creditsOf = (model, usage) => (usage ? +((costUsd({ model, ...usage }) ?? 0) * 100).toFixed(4) : 0);

// ---- transports: (env, body, model) -> Response, the shape callAnimationRole takes ----------------------------------------------------------------------------------
// fake: the stored draft is the reply. usage is synthetic (a quarter of the bytes in, a quarter out) so the cost path is exercised offline.
// sequence: the tool input of the first call of a run, then of the second (the last repeats): how a test makes a reply without an artifact.
export function fakeTransport(draft, { usage, delayMs = 0, seen = [], sequence = null } = {}) {
  const fixed = draft?.kind ? draft : { kind: 'artifact', artifact: draft }, counts = new Map();
  return {
    name: 'fake',
    callModel: ({ run, signal }) => async (_env, body, model) => {
      seen.push({ run: run.id, session: run.session?.label ?? null, signal });
      const n = counts.get(run.id) ?? 0; counts.set(run.id, n + 1);
      const input = sequence ? sequence[Math.min(n, sequence.length - 1)] : fixed;
      if (delayMs) await new Promise((done, fail) => { const t = setTimeout(done, delayMs); signal?.addEventListener('abort', () => { clearTimeout(t); fail(Object.assign(new Error('cancelled'), { name: 'AbortError' })); }, { once: true }); });
      const reply = { id: 'fake', type: 'message', role: 'assistant', model, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'fake', name: body.tools[0].name, input }],
        usage: usage ?? { input_tokens: Math.ceil(JSON.stringify(body).length / 4), output_tokens: Math.ceil(JSON.stringify(input).length / 4) } };
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  };
}
// devKey: the key is read BY NAME at the first call, held in a closure, never printed, never put in an env object or an error.
export function devKeyTransport({ credentialsFile = CREDENTIALS_FILE } = {}) {
  let creds = null;
  const read = () => {
    if (creds) return creds;
    const text = readFileSync(credentialsFile, 'utf8'), pick = name => (text.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
    creds = { key: pick('ANTHROPIC_API_KEY'), workspace: pick('ANTHROPIC_WORKSPACE_ID') };
    if (!creds.key) throw new Error('no ANTHROPIC_API_KEY in the credentials file');
    return creds;
  };
  return {
    name: 'dev-key',
    check: () => { read(); },
    callModel: ({ signal }) => async (_env, body, model) => {
      const { key, workspace } = read();
      const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', ...(workspace ? { 'anthropic-workspace-id': workspace } : {}) };
      const { betas = [], ...payload } = body;
      return fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify({ ...payload, model }), signal: AbortSignal.any([AbortSignal.timeout(CALL_MS), ...(signal ? [signal] : [])]) });
    },
  };
}

// ---- one run ------------------------------------------------------------------------------------------------------------------------------------------------------
// What the author's tool input looked like, kept for every call (FX-AN-056: five Gate 1 replies were refused as "no artifact" and nothing recorded their shape): its kind and keys,
// the type of its artifact field, and the first 3,000 characters of the raw input and the reply's block list. The reply of a call that failed carries the same in error.reply.
export const INPUT_HEAD = 3000;
const typeOf = value => (value === undefined ? 'undefined' : value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);
export function inputInfo({ input, reply } = {}, again = false) {
  const text = input !== undefined ? JSON.stringify(input) : reply?.partialTool ?? null, object = input && typeof input === 'object' && !Array.isArray(input);
  return { again, kind: object ? input.kind ?? null : null, keys: object ? Object.keys(input) : null, artifactType: object ? typeOf(input.artifact) : typeOf(input), chars: text?.length ?? null,
    head: text === null ? null : text.slice(0, INPUT_HEAD), stopReason: reply?.stopReason ?? null, blocks: reply?.blocks ?? null };
}
// Usage of every call of a run, added field by field (numbers sum; the first non-number stays): a run that asked again was billed for both.
const addUsage = (a, b) => {
  if (!a) return b; if (!b) return a;
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) out[key] = typeof value === 'number' && typeof a[key] === 'number' ? a[key] + value : value && typeof value === 'object' && a[key] && typeof a[key] === 'object' ? addUsage(a[key], value) : a[key] ?? value;
  return out;
};
const bytesOf = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
export async function sampleOnce(run, { transport, signal, ids }) {
  const started = Date.now(), pin = run.pin, job = jobOf(pin), record = { id: run.id, plan: pin.name, session: run.session?.label ?? null, ...ids, requestHash: null, status: 'error', stopReason: null, served: null, usage: null, credits: 0, bytes: null, validator: null, assertions: null, problems: [], category: null, error: null };
  let draft = null;
  const infos = [];
  const call = async (role, spec) => {
    record.requestHash ??= sha256(canonicalJson({ system: spec.system, tool: spec.tool, content: spec.content }));
    try {
      const r = await callAnimationRole(OFFLINE_ENV, role, spec, { callModel: transport.callModel({ run, signal }) });
      infos.push(inputInfo(r, spec.again === true));
      record.usage = addUsage(record.usage, r.usage); record.stopReason = r.stopReason; record.served = r.served;
      return r;
    } catch (error) {
      if (error.billed) { infos.push(inputInfo({ reply: error.reply }, spec.again === true)); record.usage = addUsage(record.usage, error.billed.usage); record.stopReason = error.billed.stopReason ?? record.stopReason; }
      throw error;
    }
  };
  try {
    const authored = await authoring.authorStage(job, { call });
    if (authored.gap) { record.status = 'gap'; record.problems = [authored.gap.reason]; } else { draft = authored.draft; record.status = 'drafted'; }
  } catch (error) {
    record.status = error.name === 'AbortError' || signal?.aborted ? 'cancelled' : 'error';
    record.error = `${error.code ?? error.name}: ${String(error.message).slice(0, 300)}`;
  }
  record.calls = infos.length; record.askedAgain = infos.length > 1; record.kind = infos.at(-1)?.kind ?? null; record.inputKeys = infos.at(-1)?.keys ?? null;
  record.credits = creditsOf(animationModel('author'), record.usage);
  let validation = null;
  if (draft) {
    record.bytes = bytesOf(draft);
    validation = await authoring.validateStage({ ...job, draft, planHash: planHashOf(pin.plan), resultId: `ar_${run.id.replace(/\W/g, '').padEnd(32, '0').slice(0, 32)}`, approval: { at: 0 }, calls: [{ role: 'author', status: 'settled', served: record.served }] }, { env: OFFLINE_ENV });
    record.problems = validation.problems ?? []; record.category = validation.category ?? null;
    // Plan assertions are held by planProblems (animation-author.js assertionProblems), so their lines are among the validator's problems: split them out so the table shows both.
    const failedAssertions = record.problems.filter(p => /^assertions\.\d+:/.test(p));
    record.validator = record.problems.length === failedAssertions.length;
    record.assertions = pin.plan.assertions?.length ? !failedAssertions.length : null;
    record.status = record.problems.length ? 'invalid' : 'valid';
  }
  record.seconds = +((Date.now() - started) / 1000).toFixed(1);
  return { record, draft, input: { calls: infos } };
}

// ---- the batch: round-robin sessions, a concurrency of 1 to 5 and a cumulative cap on credits ------------------------------------------------------------------------
export function planRuns(pins, count, sessions = []) {
  const runs = [];
  for (const pin of pins) for (let i = 1; i <= count; i++) runs.push({ id: `${pin.name}-r${String(i).padStart(2, '0')}`, pin, index: runs.length });
  runs.forEach(run => { run.session = sessions.length ? sessions[run.index % sessions.length] : null; });
  return runs;
}
// A run is admitted only when the credits settled so far, plus the cost bound of every run in flight and of this one, stay within the cap. If settled credits ever exceed the
// cap (a call cost more than its bound), every call in flight is cancelled and nothing else starts. -> { results: [{ record, draft }], stopped }
export async function runBatch({ runs, concurrency = 1, maxCredits = Infinity, reserveOf, runOne }) {
  if (!(concurrency >= 1 && concurrency <= MAX_CONCURRENCY)) throw new Error(`--concurrency is 1 to ${MAX_CONCURRENCY}`);
  const queue = runs.slice(), done = new Map(), abort = new AbortController(), waiters = [], flight = new Map();
  let settled = 0, stopped = null;
  const wake = () => waiters.splice(0).forEach(resolve => resolve());
  const worker = async () => {
    for (;;) {
      if (stopped || !queue.length) return;
      const run = queue[0], need = reserveOf(run), held = [...flight.values()].reduce((sum, v) => sum + v, 0);
      if (settled + held + need > maxCredits) {
        if (!flight.size) { stopped = `cap reached: ${settled.toFixed(2)} of ${maxCredits} credits settled and the next call can cost up to ${need.toFixed(2)}`; wake(); return; }
        await new Promise(resolve => waiters.push(resolve)); continue;
      }
      queue.shift(); flight.set(run.id, need);
      try { const out = await runOne(run, abort.signal); settled += out.record.credits; done.set(run.id, out); }
      finally { flight.delete(run.id); wake(); }
      if (settled > maxCredits && !stopped) { stopped = `cap overrun: ${settled.toFixed(2)} credits settled against a cap of ${maxCredits}; calls in flight were cancelled`; abort.abort(); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, runs.length) }, worker));
  const results = runs.map(run => done.get(run.id) ?? { record: { id: run.id, plan: run.pin.name, session: run.session?.label ?? null, status: 'not run', credits: 0, problems: [], error: stopped }, draft: null });
  return { results, stopped, settled };
}

// ---- output -------------------------------------------------------------------------------------------------------------------------------------------------------
const cell = (value, width) => String(value ?? '-').padEnd(width);
export function formatTable(summary) {
  const { ids, transport, concurrency, maxCredits, results, stopped, settled } = summary, rows = results.map(r => r.record);
  const head = ['run', 'session', 'bytes', 'tokens in/out', 'validator', 'assertions', 'credits', 'seconds', 'status'];
  const body = rows.map(r => [r.id, r.session, r.bytes, r.usage ? `${r.usage.input_tokens ?? 0}/${r.usage.output_tokens ?? 0}` : null, r.validator == null ? '-' : r.validator ? 'PASS' : 'FAIL', r.assertions == null ? 'n/a' : r.assertions ? 'PASS' : 'FAIL', r.credits.toFixed(2), r.seconds, r.error ? `${r.status}: ${r.error.slice(0, 60)}` : r.status + (r.askedAgain ? ' (asked again)' : '')]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map(row => String(row[i] ?? '-').length)));
  return [
    `candidate ${ids.candidate}   prompt-files ${ids.prompts}   golden ${ids.golden}`,
    `transport ${transport}   concurrency ${concurrency}   cap ${Number.isFinite(maxCredits) ? maxCredits : 'none'} credits   plans ${[...new Set(rows.map(r => r.plan))].join(', ')}`,
    head.map((h, i) => cell(h, widths[i])).join('  '),
    ...body.map(row => row.map((v, i) => cell(v, widths[i])).join('  ')),
    `settled ${settled.toFixed(2)} credits (computed from provider usage at registry rates, US$${(settled / 100).toFixed(2)}); valid ${rows.filter(r => r.status === 'valid').length} of ${rows.length}${stopped ? `   STOPPED: ${stopped}` : ''}`,
  ].join('\n');
}
export function writeOutputs(out, summary) {
  mkdirSync(out, { recursive: true });
  for (const { record, draft, input } of summary.results) {
    const dir = join(out, record.id); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ ...record, transport: summary.transport }, null, 2));
    if (draft) writeFileSync(join(dir, 'draft.json'), JSON.stringify(draft, null, 2));
    if (input?.calls.length) writeFileSync(join(dir, 'input.json'), JSON.stringify(input, null, 2)); // every run that reached the model: its raw tool input, bounded
    writeFileSync(join(dir, 'problems.json'), JSON.stringify(record.problems, null, 2));
    writeFileSync(join(dir, 'usage.json'), JSON.stringify({ usage: record.usage, credits: record.credits, stopReason: record.stopReason, served: record.served }, null, 2));
  }
  const table = formatTable(summary);
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ ids: summary.ids, promptFiles: summary.promptFiles, transport: summary.transport, concurrency: summary.concurrency, maxCredits: Number.isFinite(summary.maxCredits) ? summary.maxCredits : null, stopped: summary.stopped, settled: summary.settled, runs: summary.results.map(r => r.record) }, null, 2));
  writeFileSync(join(out, 'table.txt'), `${table}\n`);
  return table;
}

// ---- command line -------------------------------------------------------------------------------------------------------------------------------------------------
const VALUE_FLAGS = new Set(['-n', '--count', '--out', '--label', '--concurrency', '--sessions', '--max-credits', '--candidate-sha', '--freeze-prompts', '--freeze-golden', '--fake-transport', '--credentials-file', '--mvp3-sha', '--prompts', '--golden', '--worktree']);
export function parseArgs(argv) {
  const flags = {}, positional = [];
  for (let i = 0; i < argv.length; i++) { if (VALUE_FLAGS.has(argv[i])) { if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`); flags[argv[i]] = argv[++i]; } else if (argv[i].startsWith('-')) flags[argv[i]] = true; else positional.push(argv[i]); }
  return { flags, positional };
}
export function loadSessions(file) {
  const text = readFileSync(file, 'utf8').trim(), list = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  if (!list.length) throw new Error(`${file} lists no sessions`);
  return list.map(path => ({ label: basename(String(path)).replace(/\.[^.]+$/, ''), path: String(path) })); // the cookie itself is never read here
}
// callAnimationRole logs one learn_model line per call to the console; the table is what this command prints.
export async function main(argv, io = {}) {
  const log = console.log;
  console.log = (...args) => { if (!(typeof args[0] === 'string' && args[0].startsWith('{"event":"learn_model"'))) log(...args); };
  try { return await mainInner(argv, io); } finally { console.log = log; }
}
async function mainInner(argv, { out = console.log, err = console.error, root = ROOT } = {}) {
  const { flags, positional } = parseArgs(argv);
  if (positional[0] === 'verify-candidate') {
    for (const f of ['--mvp3-sha', '--prompts', '--golden', '--worktree']) if (!flags[f]) { err(`verify-candidate needs ${f}`); return 1; }
    const result = verifyCandidate({ mvp3Sha: flags['--mvp3-sha'], prompts: flags['--prompts'], golden: flags['--golden'], worktree: flags['--worktree'] });
    result.lines.forEach(line => out(line)); return result.ok ? 0 : 1;
  }
  const files = positional[0] === 'run' ? positional.slice(1) : positional;
  if (!files.length) { err('usage: author-sample.mjs [run] <plan.json>... [-n N] (--fake-transport DRAFT | --dry-run | --send) | verify-candidate ...'); return 1; }
  const count = Number(flags['-n'] ?? flags['--count'] ?? 1), concurrency = Number(flags['--concurrency'] ?? 1), maxCredits = flags['--max-credits'] === undefined ? Infinity : Number(flags['--max-credits']);
  if (!Number.isInteger(count) || count < 1) { err('-n is a whole number of 1 or more'); return 1; }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) { err(`--concurrency is 1 to ${MAX_CONCURRENCY}`); return 1; }
  if (Number.isNaN(maxCredits) || maxCredits <= 0) { err('--max-credits is a positive number'); return 1; }
  const modes = ['--fake-transport', '--dry-run', '--send'].filter(f => flags[f]);
  if (modes.length !== 1) { err('choose exactly one of --fake-transport DRAFT.json, --dry-run, --send'); return 1; }
  const ids = identities(root), send = !!flags['--send'];
  const refused = refusals({ root, ids, send, candidateSha: flags['--candidate-sha'], freezePrompts: flags['--freeze-prompts'], freezeGolden: flags['--freeze-golden'], maxCredits: flags['--max-credits'] });
  out(`prompt-files ${ids.prompts}\n${ids.promptFiles.map(([file, h]) => `  ${h === 'absent' ? 'absent  ' : h.slice(0, 8) + '  '}${file}`).join('\n')}\ngolden       ${ids.golden}   (${GOLDEN_FILE})\ncandidate    ${flags['--candidate-sha'] ?? ids.head} (tree HEAD ${ids.head.slice(0, 9)})`);
  if (refused.length) { refused.forEach(r => err(`REFUSED: ${r}`)); err('Nothing was spent.'); return 2; }
  let pins, sessions;
  try { pins = files.map(loadPlan); sessions = flags['--sessions'] ? loadSessions(flags['--sessions']) : []; } catch (error) { err(`REFUSED: ${error.message}`); return 2; }
  const runs = planRuns(pins, count, sessions), requests = new Map();
  for (const pin of pins) requests.set(pin.name, await requestOf(pin));
  const reserveOf = run => requests.get(run.pin.name).reserveCredits * CALLS_PER_RUN;
  out(`runs ${runs.length} (${pins.map(p => `${p.name} x${count}`).join(', ')}); request bound per call: ${pins.map(p => `${p.name} ${requests.get(p.name).reserveCredits} credits`).join(', ')} (a run is admitted against ${CALLS_PER_RUN} calls); sessions ${sessions.length || 'none'}`);
  if (flags['--dry-run']) { out('DRY RUN: nothing sent'); return 0; }
  let transport;
  if (flags['--fake-transport']) transport = fakeTransport(JSON.parse(readFileSync(flags['--fake-transport'], 'utf8')));
  else { transport = devKeyTransport({ credentialsFile: flags['--credentials-file'] ?? CREDENTIALS_FILE }); try { transport.check(); } catch (error) { err(`REFUSED: ${error.message}; nothing was spent.`); return 2; } }
  const dir = flags['--out'] ?? join(DEFAULT_OUT_ROOT, `${new Date().toISOString().replace(/[:.]/g, '-')}-${flags['--label'] ?? 'batch'}`);
  const runIds = { candidate: flags['--candidate-sha'] ?? ids.head, prompts: ids.prompts, golden: ids.golden };
  const { results, stopped, settled } = await runBatch({ runs, concurrency, maxCredits, reserveOf, runOne: (run, signal) => sampleOnce(run, { transport, signal, ids: runIds }) });
  const table = writeOutputs(dir, { ids: runIds, promptFiles: ids.promptFiles, transport: transport.name, concurrency, maxCredits, results, stopped, settled });
  out(`\n${table}\n\noutput ${dir}`);
  const allValid = results.every(r => r.record.status === 'valid');
  out(`RESULT ${stopped ? 'STOPPED' : allValid ? 'ALL VALID' : 'SOME INVALID'}`);
  return stopped ? 3 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then(code => process.exit(code), error => { console.error(error.message); process.exit(1); });
