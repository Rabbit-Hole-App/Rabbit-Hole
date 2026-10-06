// LP1 Task 17 (owner, 2026-10-05): the small real-model journey corpus runner, modelled on e2e/tutor-corpus-run.mjs. Runs
// e2e/journey-corpus.mjs - four subjects (domains), each through the whole chain, a fifth fast-start case (no diagnostic,
// no adapt stages; final review A-I1) last, and three resolver probes - through the
// real planners (planDiagnostic, planPath, adaptPath, planSection, resolveWithModel) and one journey Tutor turn (runTurn
// over journeyDomain, its plan from planTurn, enforced by the Tutor validator), building every input as the journey route
// (control-plane/src/learn-journey.js) does; then, free, the journey Rabbit Hole record (diveRecord + journeyDiveContext)
// from the drafted path and registry. Each check is recorded per stage as pass or fail with its exact reason; nothing is
// averaged. The diagnostic answers and the evidence adaptation's misconception are scripted (probeEvents, stage
// adapt_evidence); no evaluator runs (the Tutor turn's /evaluate post answers skipped), so every call is a planner call.
// No retry anywhere: a failed stage is recorded with its reason and the chain goes on with what it has, or records the
// stages that depend on it as skipped with the reason. The planners' own escalations (adaptPath to journey_path, the
// Tutor's fast tier to Opus) and the resolver's fallback to clarification_needed are recorded as repair use.
// Default (stub): free. fixtureModel answers every planner call and a scripted plan the Tutor's, so the script, the checks
// and the budget logic run without a key. The fixtures are logistic-regression-shaped and never revise a path or return
// path_edit, so some checks fail in stub mode by construction; they are listed in the summary, never hidden.
// --live: PAID. Refused unless JOURNEY_CORPUS_PAID=GO (the controller sets it; owner approval, 2026-10-05) and --budget
// USD within the owner's hard ceiling of 1.90. The key and workspace id are the ANTHROPIC_API_KEY= and ANTHROPIC_WORKSPACE_ID= lines of the main checkout .env;
// the models are LEARN_TASKS', never substituted. Before each call the budget guard prices its worst case and refuses a
// call that does not fit; rows are appended per call, so a stop keeps every observation, and spent sums every live JSONL
// in --out. Any HTTP 4xx (insufficient credit included) aborts the run at once, recorded as aborted with the API's message.
// --resume continues the newest JSONL of this mode in --out; a subject cut midway is run again from its start.
// --seed <jsonl> --plan <subject>:<from>-<to>[,...] (owner, 2026-10-05): run only the unresolved cases; see PLAN below.
// --transport subscription (owner GO SUBSCRIPTION): that targeted plan through the local Claude subscription bridge; see TRANSPORT.
// Output: <out>/journey-corpus-<mode>-<stamp>.jsonl (call, step and subject_done rows) and <out>/summary.json.
// Usage: node e2e/journey-corpus-run.mjs [--out dir] [--budget USD] [--resume] [--seed jsonl --plan subject:from-to,...]
//        JOURNEY_CORPUS_PAID=GO node e2e/journey-corpus-run.mjs --live --budget 1.9 --out <dir>
//        JOURNEY_CORPUS_SUBSCRIPTION=GO SMALL_SUBSCRIPTION_TOKEN=... node e2e/journey-corpus-run.mjs --transport subscription --seed <jsonl> --plan ... --out <dir>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { anthropic } from '../../control-plane/src/ask.js';
import { LEARN_TASKS } from '../../control-plane/src/learn-models.js';
import { JOURNEY_TOOLS, pathOutput } from '../../control-plane/src/agents/learn-journey.js';
import { PLANNER_SYSTEM, TUTOR_TOOL, plannerSystem } from '../../control-plane/src/agents/learn-tutor.js';
import { PlannerInvalid, adaptPath, planDiagnostic, planPath, planSection, resolveWithModel } from '../../control-plane/src/learn-journey-planners.js';
import { fixtureModel } from '../../control-plane/src/learn-journey-fixtures.js';
import { PLANNER_DEFAULTS, planTurn } from '../../control-plane/src/learn-tutor-routes.js';
import { journeyIntent } from '../../control-plane/src/learner-intent-journey.js';
import { INTAKE_SLOTS, applyIntakeAnswer, slotsFromIntent, trayFor } from '../src/learn-journey.js';
import { appendEvents, deriveClaimStates, emptyStore } from '../src/learn-tutor-evidence.js';
import { journeyDomain } from '../src/learn-journey-domain.js';
import { CLAIMS as NANOGPT_CLAIMS, SLICE_CARDS } from '../src/learn-tutor-claims.js';
import { runTurn } from '../src/learn-tutor.js';
import { diveRecord } from '../src/dive.js';
import { resolveTarget } from '../src/learn-target.js';
import { EDITS, RESOLVER_PROBES, RESOLVER_TOPIC, SUBJECTS, tutorQuestion } from './journey-corpus.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const CEILING = 1.9; // the owner's hard total ceiling, USD (2026-10-05)
// --subjects id,id: run only these SUBJECTS (owner rerun GO, 2026-10-05: the four domains, not the fast-start case).
// Leakage is still checked against every subject's terms.
const ONLY = flag('subjects', null)?.split(',').map(id => id.trim()).filter(Boolean) || null;
// --seed <jsonl> --plan <subject>:<from>-<to>[,...] (owner, 2026-10-05): only the unresolved live cases. Per planned subject,
// the stages before <from> are seeded from that subject's last successful step output in the seed log (the ones a later
// stage reads: the diagnostic, the path, and the section plan when the dive runs), exactly as the chained run passed them
// on, and recorded as seeded, never as passes; stages after <to> do not run; unplanned subjects and the resolver probes do
// not run. A needed seed that is missing or failed refuses the whole run before any call. Without --plan nothing changes.
const STAGES = ['diagnostic', 'path', 'section', 'adapt_edit', 'adapt_evidence', 'tutor', 'dive'];
const SEED_FILE = flag('seed', null), PLAN_ARG = flag('plan', null);
if (!SEED_FILE !== !PLAN_ARG) throw Error('--seed and --plan go together');
if (PLAN_ARG && (ONLY || args.includes('--resume'))) throw Error('--plan names its own subjects and runs once: no --subjects, no --resume');
const PLAN = PLAN_ARG && Object.fromEntries(PLAN_ARG.split(',').map(item => {
  const m = item.trim().match(/^([a-z0-9-]+):([a-z_]+)-([a-z_]+)$/), order = name => STAGES.indexOf(name);
  if (!m || !SUBJECTS.some(subject => subject.id === m[1]) || order(m[2]) < 0 || order(m[3]) < order(m[2])) throw Error(`--plan ${item}: expected <subject>:<from>-<to>, a known subject and two stages in order (${STAGES.join(', ')})`);
  return [m[1], { from: m[2], to: m[3] }];
}));
const RUN_SUBJECTS = PLAN ? SUBJECTS.filter(subject => PLAN[subject.id]) : ONLY ? SUBJECTS.filter(subject => ONLY.includes(subject.id)) : SUBJECTS;
if (ONLY && RUN_SUBJECTS.length !== ONLY.length) throw Error(`--subjects names an unknown subject: ${ONLY.filter(id => !SUBJECTS.some(subject => subject.id === id)).join(', ')}`);
// --transport subscription (owner GO SUBSCRIPTION, 2026-10-05): the targeted plan through the owner's Claude subscription
// via the local bridge (scripts/learn-subscription-bridge.mjs, started by the controller), never the API. Refused unless
// JOURNEY_CORPUS_SUBSCRIPTION=GO, and only with --plan and --seed; no .env is read and no Anthropic key is needed. env is
// { SUBSCRIPTION_ONLY: 'true' } alone, so the planners send a plain-string system with no cache_control
// (learn-journey-planners.js callRole) and planTurn neither streams, caches nor asks for fast speed (learn-tutor-routes.js
// planOnce). Calls cost $0 (the guard stays and never trips); any non-200 or unverified bridge reply aborts.
const TRANSPORT = flag('transport', 'api'), SUB = TRANSPORT === 'subscription';
if (!['api', 'subscription'].includes(TRANSPORT)) throw Error('--transport is api or subscription');
const SUBSCRIPTION_NOTE = 'Claude subscription bridge: tool use is emulated in the system prompt; effort, max_tokens and caching are not applied; the exact model version is not reported. Not production-exact API evidence.';
if (SUB && process.env.JOURNEY_CORPUS_SUBSCRIPTION !== 'GO') throw Error('--transport subscription makes real model calls on the owner subscription: refused unless JOURNEY_CORPUS_SUBSCRIPTION=GO');
if (SUB && (!PLAN_ARG || args.includes('--live'))) throw Error('--transport subscription runs a targeted --plan with --seed, and never with --live (the API)');
if (SUB && !process.env.SMALL_SUBSCRIPTION_TOKEN) throw Error('--transport subscription needs SMALL_SUBSCRIPTION_TOKEN (the bridge token) in the environment');
const LIVE = args.includes('--live'), RESUME = args.includes('--resume'), MODE = LIVE ? 'live' : SUB ? 'subscription' : 'stub';
const OUT = flag('out', join(tmpdir(), 'journey-corpus')), BUDGET = Number(flag('budget', LIVE ? 'NaN' : String(CEILING)));
if (LIVE && process.env.JOURNEY_CORPUS_PAID !== 'GO') throw Error('--live makes paid model calls: refused unless JOURNEY_CORPUS_PAID=GO (owner approval)');
if (!(BUDGET > 0 && BUDGET <= CEILING)) throw Error(`--budget USD is required with --live and at most ${CEILING} (the owner's hard ceiling)`);

// USD per MTok, as e2e/tutor-corpus-run.mjs (claude-api skill, cached 2026-09-25): input, output, cache read. A 5-minute
// cache write is 1.25x input. A call is priced at its requested model (the wrapper refuses any other than LEARN_TASKS').
const PRICES = { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-haiku-4-5-20251001': [1, 5, 0.1] };
const CACHE_WRITE_X = 1.25;
const usd = t => { const p = PRICES[t.model]; if (!p) return 0; return ((t.in || 0) * p[0] + (t.out || 0) * p[1] + (t.cw || 0) * p[0] * CACHE_WRITE_X + (t.cr || 0) * p[2]) / 1e6; };

// The budget guard: a call's worst case is every request character / 2 as an input token (a hard bound: English and JSON
// run near 3-4 characters a token) at the cache-write rate (the dearest input rate: the system block is cached) plus
// max_tokens at the output rate. It is refused when spent + worst case > budget (never above the ceiling), and so is a
// model with no price. The stop is sticky: a caller that swallows it (planTurn's fast tier) gets it again on its next call.
class BudgetStop extends Error {}
class Refused extends Error {}
const worstCase = (body, model) => {
  if (!PRICES[model]) throw new BudgetStop(`no price for ${model}`);
  return usd({ model, cw: Math.ceil(JSON.stringify(body).length / 2), out: body.max_tokens });
};
const guard = (spent, worst, budget) => { if (spent + worst > Math.min(budget, CEILING)) throw new BudgetStop(`worst case $${worst.toFixed(4)} with $${spent.toFixed(4)} spent exceeds the $${Math.min(budget, CEILING)} budget`); };
// Start-up self-check: the guard refuses a call whose worst case exceeds what remains, admits one that fits, and holds
// the ceiling whatever budget it is handed.
{
  const body = { max_tokens: LEARN_TASKS.journey_path.maxTokens, messages: [{ role: 'user', content: 'x'.repeat(3000) }] };
  const worst = worstCase(body, LEARN_TASKS.journey_path.model);
  assert.ok(worst > 0.24, 'the worst case prices max_tokens as output (12000 Opus tokens are $0.24)');
  assert.throws(() => guard(1, worst, 1 + worst / 2), BudgetStop);
  assert.doesNotThrow(() => guard(0, worst, worst));
  assert.throws(() => guard(CEILING - worst / 2, worst, 100), BudgetStop);
  assert.throws(() => worstCase(body, 'claude-unpriced'), BudgetStop);
}

mkdirSync(OUT, { recursive: true });
const read = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
// The --plan seeds, checked before anything runs: subject -> stage -> the seed log's validated output.
const SEEDS = PLAN ? (() => {
  const last = new Map(read(SEED_FILE).filter(row => row.kind === 'step').map(row => [`${row.subject}/${row.step}`, row]));
  const seeds = {}, missing = [], before = (name, from) => STAGES.indexOf(name) < STAGES.indexOf(from);
  for (const [id, { from, to }] of Object.entries(PLAN)) {
    const subject = SUBJECTS.find(s => s.id === id);
    const needed = [subject.diagnostic && before('diagnostic', from) && 'diagnostic', before('path', from) && 'path', before('section', from) && to === 'dive' && 'section'].filter(Boolean);
    seeds[id] = {};
    for (const name of needed) {
      const row = last.get(`${id}/${name}`);
      if (row?.checks?.valid?.pass === true && row.output != null) seeds[id][name] = row.output;
      else missing.push(`${id}/${name} (${!row ? 'not in the seed log' : row.skipped ? `skipped: ${row.skipped}` : row.seeded ? 'seeded there too, no output' : `failed: ${row.checks?.valid?.reason ?? 'no output'}`})`);
    }
  }
  if (missing.length) throw Error(`--seed ${SEED_FILE} has no successful output for ${missing.join('; ')}. Nothing was run.`);
  return seeds;
})() : null;
const spent = () => (LIVE ? readdirSync(OUT).filter(name => /^journey-corpus-live-.*\.jsonl$/.test(name)).reduce((n, name) => n + read(join(OUT, name)).reduce((m, row) => m + (row.cost_usd || 0), 0), 0) : 0);
const mine = readdirSync(OUT).filter(name => name.startsWith(`journey-corpus-${MODE}-`) && name.endsWith('.jsonl')).sort();
const FILE = RESUME && mine.length ? join(OUT, mine.at(-1)) : join(OUT, `journey-corpus-${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
const rows = existsSync(FILE) ? read(FILE) : [];
const done = new Set(rows.filter(row => row.kind === 'subject_done').map(row => row.subject));
const record = row => { const full = { mode: MODE, ...row }; rows.push(full); appendFileSync(FILE, `${JSON.stringify(full)}\n`); return full; };

// Live only: the ANTHROPIC_API_KEY= and ANTHROPIC_WORKSPACE_ID= lines of the main checkout's .env (the parent of git's
// common dir), never printed, logged or written; no other line is kept. The key is not scoped to a workspace, so
// anthropic() (ask.js) needs the workspace id header, as the deployed worker sends it. env is those two values and
// nothing else (no JOURNEY_MODEL_STUB, no SMALL_ENV).
function liveEnv() {
  const common = resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());
  const lines = readFileSync(join(dirname(common), '.env'), 'utf8').split(/\r?\n/);
  const value = name => lines.find(l => l.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  const key = value('ANTHROPIC_API_KEY'), workspace = value('ANTHROPIC_WORKSPACE_ID');
  if (!key) throw Error('the main checkout .env has no ANTHROPIC_API_KEY= line');
  if (!workspace) throw Error('the main checkout .env has no ANTHROPIC_WORKSPACE_ID= line');
  return { ANTHROPIC_API_KEY: key, ANTHROPIC_WORKSPACE_ID: workspace };
}
const ENV = SUB ? { SUBSCRIPTION_ONLY: 'true' } : LIVE ? liveEnv() : {};

// journeyDiveContext lives in LearnJourney.jsx: bundled with esbuild, as learn-journey-ui.test.mjs does (local, free).
const journeyDiveContext = await (async () => {
  const dir = mkdtempSync(join(tmpdir(), 'journey-corpus-')), outfile = join(dir, 'dive.cjs');
  await esbuild.build({ stdin: { contents: "export { journeyDiveContext } from './LearnJourney.jsx';", resolveDir: fileURLToPath(new URL('../src/', import.meta.url)), loader: 'jsx' },
    bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent' });
  try { return createRequire(import.meta.url)(outfile).journeyDiveContext; } finally { rmSync(dir, { recursive: true, force: true }); }
})();

// Stub mode's Tutor plan (fixtureModel has no tutor_response): one sentence and one question on the route's claim.
const STUB_PLAN = { strategy: 'feynman', actions: [{ type: 'respond_text', text: 'Here is that idea again, on the first worked example of this section.' }, { type: 'ask_question', text: 'What would you predict on a case you have not seen?' }] };
const inner = SUB ? bridge : LIVE ? anthropic : (env, body) => (body.tools[0].name === TUTOR_TOOL.name
  ? Response.json({ model: 'fixture', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: TUTOR_TOOL.name, input: STUB_PLAN }] }) : fixtureModel(env, body));
// The subscription bridge's POST /messages, as subscription-transport.js sends it, but over the local http bridge (anthropic()
// insists on https there). Its fetch Response is what the planners read, as they read anthropic()'s. The token goes only
// in this header: never logged or written. The port defaults to the bridge's own (8789).
function bridge(env, body, model) {
  return fetch(`http://127.0.0.1:${process.env.SMALL_SUBSCRIPTION_PORT || 8789}/messages`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(300000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMALL_SUBSCRIPTION_TOKEN}` }, body: JSON.stringify({ ...body, model, stream: false }) });
}
// The bridge answers a family alias, never a version: claude-opus-5-5 must come back opus, claude-sonnet-5-5 sonnet.
const familyOf = model => (/opus/.test(model) ? 'opus' : /sonnet/.test(model) ? 'sonnet' : /haiku/.test(model) ? 'haiku' : null);
// An error body's message: the API's { error: { message } } or the bridge's { error: '...' }.
const errorMessage = text => { try { const e = JSON.parse(text)?.error; return (typeof e === 'string' ? e : e?.message) ?? text; } catch { return text; } };

// The callModel every planner gets: the model check, the budget guard, then the call; one row per call with the requested
// and served model, stop_reason, latency, usage (input, output, cache write, cache read) and USD. A call that throws
// mid-response or whose 200 body does not parse may still be billed: its row costs the worst case, then the error goes
// on. calls: this stage's calls, with the tool input as the model wrote it and the system prompt it was sent.
let at = null, ABORTED = null, STOPPED = null;
const calls = [];
async function callModel(env, body, model, org) {
  if (ABORTED) throw new Refused(ABORTED);
  if (STOPPED) throw new BudgetStop(STOPPED);
  const tool = body.tools?.[0]?.name, role = tool === TUTOR_TOOL.name ? 'tutor' : tool;
  const models = role === 'tutor' ? [LEARN_TASKS.tutor.model, PLANNER_DEFAULTS.fast_model] : [LEARN_TASKS[role]?.model];
  if (!models.includes(model)) throw new Refused(ABORTED = `${role} asked for ${model}, not its LEARN_TASKS model`);
  let worst;
  try { worst = worstCase(body, model); guard(spent(), worst, BUDGET); } catch (error) { STOPPED = error.message; throw error; }
  const started = Date.now(), system = typeof body.system === 'string' ? body.system : body.system?.[0]?.text;
  const row = { kind: 'call', ...at, role, requested_model: model, max_tokens: body.max_tokens, input_chars: JSON.stringify(body).length, worst_usd: +worst.toFixed(6) };
  let response, result = null;
  try {
    response = await inner(env, body, model, org);
    if (response.ok) result = await response.clone().json();
  } catch (error) {
    calls.push({ role, model, raw: null, system });
    if (SUB) { // an unreachable bridge or an unparseable reply: nothing billed, the run stops
      record({ ...row, served_model: null, billing: null, status: response?.status ?? null, stop_reason: null, ms: Date.now() - started, in: null, out: null, cw: null, cr: null, cost_usd: 0 });
      throw new Refused(ABORTED = cut300(`${role}: subscription bridge unavailable: ${error.name}: ${error.message}`));
    }
    record({ ...row, served_model: null, status: response?.status ?? null, stop_reason: null, ms: Date.now() - started, in: 0, out: 0, cw: 0, cr: 0, cost_usd: row.worst_usd, billed_unknown: cut300(`${error.name}: ${error.message}`) });
    throw error;
  }
  if (SUB) {
    // No usage from the bridge: tokens null, cost $0. Any non-200 (401 unauthorized, 503 unavailable or invalid response,
    // 429 busy) or a 200 that is not a verified subscription reply aborts the run with its message; nothing is retried.
    const served = result?.model ?? null, family = familyOf(model);
    calls.push({ role, model, raw: result?.content?.find(block => block?.type === 'tool_use' && block.name === tool)?.input ?? null, system });
    record({ ...row, served_model: served, billing: result?.billing ?? null, status: response.status, stop_reason: result?.stop_reason ?? null, ms: Date.now() - started,
      in: null, out: null, cw: null, cr: null, cost_usd: 0, ...(response.ok && served !== family ? { served_mismatch: `${model} asked, ${served} served (expected ${family})` } : {}) });
    if (!response.ok) throw new Refused(ABORTED = cut300(`${role}: subscription bridge HTTP ${response.status}: ${errorMessage(await response.clone().text().catch(() => ''))}`));
    if (result?.billing !== 'claude-subscription' || !Array.isArray(result?.content)) throw new Refused(ABORTED = `${role}: unverified subscription reply (billing ${result?.billing ?? 'missing'})`);
    return response;
  }
  const u = result?.usage || {}, tokens = { in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, cw: u.cache_creation_input_tokens ?? 0, cr: u.cache_read_input_tokens ?? 0 };
  calls.push({ role, model, raw: result?.content?.find(block => block?.type === 'tool_use' && block.name === tool)?.input ?? null, system });
  record({ ...row, served_model: result?.model ?? null, status: response.status, stop_reason: result?.stop_reason ?? null, ms: Date.now() - started, ...tokens, cost_usd: +usd({ model, ...tokens }).toFixed(6) });
  // Any 4xx aborts (owner, 2026-10-05: insufficient credit included; nothing is retried), with the API's own message.
  if (response.status >= 400 && response.status < 500) {
    const text = await response.clone().text().catch(() => '');
    throw new Refused(ABORTED = cut300(`${role}: model HTTP ${response.status}: ${errorMessage(text)}`));
  }
  return response;
}

// ---------- Checks ----------
const check = (pass, reason) => ({ pass: !!pass, reason });
const cut300 = text => String(text).slice(0, 300);
const why = e => cut300(e instanceof PlannerInvalid ? `PlannerInvalid (${e.role}): ${e.errors.join('; ')}` : `${e.name}: ${e.message}`);
// No mastery, fixed learner level or permanent ability label anywhere the learner reads. LEVEL_WORDS is
// agents/learn-journey.js's (not exported). Percentages: any in change.reason and learner_note (the evidence wording); in
// the Tutor's words only near "you" or "your" (about the learner), so teaching content ("98% of the population") passes;
// none in adaptation_reason or section content, where "halves the range, 50%" is teaching.
// ponytail: a short list of label patterns; extend it when a real plan slips a label past it.
const LEVEL_WORDS = /\bmaster(?:ed|y)\b|\b(?:beginner|intermediate|advanced|expert)[ -](?:level|learner)\b/i;
const LABELS = [LEVEL_WORDS, /\bmaster(ed|y)\b/i, /\b(?:novice|beginner|intermediate|advanced|expert) (?:student|learner|level)\b/i,
  /\byou(?:'re| are) (?:a |an )?(?:beginner|novice|intermediate|expert|natural)\b/i, /\byou(?:'re| are) (?:just )?(?:good|bad|great|terrible|hopeless) at\b/i,
  /\b(?:not an? (?:math|maths|science|coding|programming|history) person|naturally gifted|gifted learner|slow learner|fast learner|quick learner)\b/i];
const YOU = String.raw`\byou(?:r|rs|rself|'re|'ve|'ll)?\b`;
const ANY_PERCENT = t => /\d+\s*%/.test(t), NO_PERCENT = () => false;
// "you" and the percentage in one clause: "you got 80%", "75% of your answers"; not "1% of light; can you guess why?".
const LEARNER_PERCENT = t => new RegExp(`${YOU}[^.!?;:,]{0,40}?\\d+\\s*%|\\d+\\s*%[^.!?;:,]{0,40}?${YOU}`, 'i').test(t);
// items: [text, percentage rule] pairs.
const wording = items => {
  const bad = items.filter(([t, percent]) => typeof t === 'string' && (LABELS.some(re => re.test(t)) || percent(t))).map(([t]) => t);
  return check(!bad.length, bad.length ? `mastery, level or ability label, or a percentage the rule forbids: ${bad.map(t => t.slice(0, 160)).join(' | ')}` : `${items.filter(([t]) => t).length} texts clean`);
};
const pathWording = raw => wording([[raw?.path?.change?.reason, ANY_PERCENT], [raw?.path?.change?.learner_note, ANY_PERCENT], ...(raw?.path?.sections || []).map(s => [s?.adaptation_reason, NO_PERCENT])]);
// No topic leakage across domains: no tool input the model wrote in a subject's stage holds another subject's terms.
const leakage = subject => {
  const text = calls.map(call => JSON.stringify(call.raw)).join(' ');
  const hits = SUBJECTS.filter(other => other.id !== subject.id).map(other => [other.id, text.match(other.terms)]).filter(([, hit]) => hit);
  return check(!hits.length, hits.length ? `output contains ${hits.map(([id, hit]) => `"${hit[0]}" (a ${id} term)`).join(', ')}` : 'no other subject\'s terms');
};
const DRAFT_STATUSES = ['upcoming', 'optional', 'skipped'];
const SECTION_FIELDS = Object.keys(JOURNEY_TOOLS.journey_path.input_schema.properties.path.properties.sections.items.properties);
const STEP_ROLES = JOURNEY_TOOLS.journey_section.input_schema.properties.teaching_sequence.items.properties.role.enum;
// Future sections remain plans: no section key outside the schema (cards, blocks, steps, content...), as the model wrote it.
const plansOnly = raw => {
  const extra = [...new Set((raw?.path?.sections || []).flatMap(s => Object.keys(s || {}).filter(k => !SECTION_FIELDS.includes(k))))];
  return check(!extra.length, extra.length ? `section keys outside the schema: ${extra.join(', ')}` : 'sections hold plans only');
};
// Only the current section is generated or materialized: every other section not completed is not_generated, no heading
// (an empty string is no heading).
const onlyCurrent = path => {
  const bad = path.sections.filter(s => s.status !== 'current' && s.status !== 'completed' && (s.generation_state !== 'not_generated' || !!s.heading_block_id));
  return check(!bad.length, bad.length ? `generated or materialized outside the current section: ${bad.map(s => `${s.id} ${s.status}/${s.generation_state}${s.heading_block_id ? ' with a heading' : ''}`).join(', ')}` : 'only the current section carries generation state');
};
const sorted = v => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
// Completed content unchanged, key order aside (learn-journey.js same() is not exported: a sorted-key stringify).
const unchanged = (was, now) => {
  const bytes = JSON.stringify(was) === JSON.stringify(now), same = !!now && sorted(was) === sorted(now);
  return check(same, bytes ? `${was.id} byte-identical` : same ? `completed ${was.id}: same content, other key order` : !now ? `completed ${was.id} is gone` : `completed ${was.id} changed: ${JSON.stringify(now).slice(0, 200)}`);
};
const live = sections => sections.filter(s => s.status !== 'skipped' && s.status !== 'optional');
const minutes = sections => live(sections).reduce((n, s) => n + (s.estimated_minutes || 0), 0);
const PRACTICE = /practi[cs]e|exercise|drill|hands-on/i;
function respected(edit, prev, path, target) {
  if (edit === 'skip') {
    const now = path.sections.find(s => s.id === target.id);
    return check(!now || now.status === 'skipped' || now.status === 'optional', `"${target.title}" ${now ? `is ${now.status}` : 'is gone'}`);
  }
  if (edit === 'practice') {
    const was = new Map(prev.sections.map(s => [s.id, JSON.stringify(s)])), added = new Set(path.change.sections_changed.filter(c => c.op === 'added').map(c => c.id));
    const found = path.sections.filter(s => was.get(s.id) !== JSON.stringify(s) && (PRACTICE.test(`${s.title} ${s.purpose} ${s.adaptation_reason || ''}`) || added.has(s.id)));
    return check(found.length, found.length ? found.map(s => `${s.id} "${s.title}" (${PRACTICE.test(`${s.title} ${s.purpose} ${s.adaptation_reason || ''}`) ? 'about practice' : 'op added'})`).join(', ') : 'no new or changed section is about practice or listed as added');
  }
  return check(live(path.sections).length < live(prev.sections).length || minutes(path.sections) < minutes(prev.sections),
    `${live(prev.sections).length} -> ${live(path.sections).length} sections not skipped or optional, ${minutes(prev.sections)} -> ${minutes(path.sections)} minutes`);
}
// adaptPath's escalation as repair use: which planner answered and why; on a validator rejection, the rejected journey_adapt
// reply's errors verbatim (re-validated here, free), which adaptPath does not return.
function adaptRepair(out, input) {
  if (!out.escalated) return null;
  const first = calls.find(call => call.role === 'journey_adapt');
  const errors = out.escalated !== 'validator' ? null : !first?.raw ? ['the reply has no tool call']
    : pathOutput(first.raw, { prev: input.prev, registry: input.registry, source: input.evidence ? 'evidence' : 'learner_edit', evidence_refs: input.evidence?.refs ?? [] }).errors || [];
  return { used: 'journey_path', model: LEARN_TASKS.journey_path.model, why: out.escalated, ...(errors ? { rejected: cut300(errors.join('; ')), rejected_errors: errors } : {}) };
}
// Owner, 2026-10-05, the two gaps the live run found, asserted on the reply as written (they run when the validator
// rejected it too). key_ids_registered: every key.misconceptions value of every check is a misconception id of that
// check's claims; a wrong option with none stays out of the key (counted as omitted).
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const list = v => (Array.isArray(v) ? v : []);
function keyIds(raw, registry) {
  let mapped = 0, omitted = 0;
  const bad = [];
  for (const c of list(raw?.checks).filter(c => c?.key != null)) {
    const known = list(c.claims).flatMap(id => list(registry.claims[id]?.misconceptions).map(m => m?.id)), wrong = isObj(c.key.misconceptions) ? c.key.misconceptions : {};
    for (const [option, id] of Object.entries(wrong)) if (known.includes(id)) mapped++; else bad.push(`${c.id}: option ${option} -> ${id} is not a misconception id of ${list(c.claims).join(', ')}`);
    omitted += list(c.options).filter(o => o?.id !== c.key.correct && !Object.hasOwn(wrong, o?.id)).length;
  }
  return { key_ids_registered: check(!bad.length, bad.length ? cut300(bad.join('; ')) : `${mapped} wrong options mapped to a registered misconception, ${omitted} omitted`) };
}
// prerequisites_are_concepts: every section's prerequisites and target_concepts are concept ids of the registry or the
// reply's concepts_added, and none is a section id.
function conceptRefs(raw, registry) {
  const sections = list(raw?.path?.sections), concepts = { ...registry.concepts, ...(isObj(raw?.concepts_added?.concepts) ? raw.concepts_added.concepts : {}) };
  const ids = new Set(sections.map(s => s?.id));
  const bad = sections.flatMap(s => ['prerequisites', 'target_concepts'].flatMap(k => list(s?.[k]).filter(c => ids.has(c) || !Object.hasOwn(concepts, c))
    .map(c => `${s.id} ${k}: ${c} (${ids.has(c) ? 'a section id' : 'not a concept id'})`)));
  return { prerequisites_are_concepts: check(sections.length && !bad.length, !sections.length ? 'the reply has no sections' : bad.length ? cut300(bad.join('; ')) : `${sections.length} sections: every prerequisite and target is a concept id`) };
}
const adaptValid = (out, repair) => check(out.escalated !== 'validator', !out.escalated ? 'journey_adapt answered' : out.escalated === 'validator' ? `journey_adapt rejected: ${repair.rejected}` : `journey_adapt said ${out.escalated}; journey_path answered`);

// One stage: run it, judge it (only when it returned), record it with its latency and repair use. A budget stop or a
// refusal ends the run; any other error (PlannerInvalid, a model 5xx) is the stage's failed `valid` check, verbatim, with
// PlannerInvalid's errors in full beside it. A throw inside a check, the repair or the output function is a failed check
// with its message. A stage that fails, or that a repair answered, keeps every call's raw tool input.
// rawChecks(raw): assertions on the last call's tool input as the model wrote it, run whether or not it validated.
async function step(subject, name, run, { checks: judge = () => ({}), rawChecks = null, repair: repairOf = () => null, output = out => out, note = null } = {}) {
  at = { subject: subject.id, step: name };
  calls.length = 0;
  const started = Date.now();
  let out = null, error = null;
  try { out = await run(); } catch (e) { if (e instanceof BudgetStop || e instanceof Refused || STOPPED || ABORTED) throw e; error = e; }
  const ms = Date.now() - started;
  const checks = error ? { valid: check(false, why(error)) } : { valid: check(true, 'passes its validator') };
  const guarded = (label, fn, fallback) => { try { return fn(); } catch (e) { checks[label] = check(false, cut300(`${label} threw ${e.name}: ${e.message}`)); return fallback; } };
  if (!error) Object.assign(checks, guarded('checks', () => judge(out), {}));
  if (rawChecks && calls.length) Object.assign(checks, guarded('raw_checks', () => rawChecks(calls.at(-1).raw), {}));
  const repair = error ? null : guarded('repair', () => repairOf(out), null);
  if (subject.terms && calls.length) { const leak = guarded('no_topic_leakage', () => leakage(subject), null); if (leak) checks.no_topic_leakage = leak; }
  const shown = error ? null : guarded('output', () => output(out), null), pass = Object.values(checks).every(c => c.pass);
  record({ kind: 'step', ...at, ms, calls: calls.length, models: calls.map(call => call.model), checks, pass, repair,
    ...(error instanceof PlannerInvalid ? { errors: error.errors } : {}), ...(note ? { note } : {}),
    ...(error || repair || !pass ? { raw: calls.map(call => ({ role: call.role, model: call.model, input: call.raw })) } : {}), output: shown });
  return error ? null : out;
}
const skip = (subject, names, reason) => names.forEach(name => record({ kind: 'step', subject: subject.id, step: name, skipped: reason, checks: {}, pass: null }));

// Planner states, as the route's claimStates: the locked derivation plus settled counts, never a score.
const negative = e => e.result === 'fail' || e.result === 'misconception';
const claimStates = (events, registry) => {
  const derived = deriveClaimStates(events, registry.claims);
  return Object.fromEntries(Object.keys(derived).map(id => {
    const settled = events.filter(e => e.claim === id && e.settled);
    return [id, { state: derived[id].state, settled_passes: settled.filter(e => e.result === 'pass').length, settled_negatives: settled.filter(negative).length }];
  }));
};
const event = (registry, claim, result, extra) => ({ concept: registry.claims[claim].concept, claim, result, kind: null, settled: true, ...extra });
// The scripted diagnostic answers, graded as the evaluate route grades a probe (learn-tutor-routes.js probeEvaluation):
// the first probe right on each of its claims; the second wrong with a named misconception on its first claim that has
// one (a plain fail when none does). One misconception event leaves the claim uncertain: one fail is never a misconception.
function probeEvents(registry, [right, wrong]) {
  const tag = { evaluator: 'deterministic', source: 'journey_probe' };
  const claim = wrong.claims.find(id => registry.claims[id].misconceptions.length) ?? wrong.claims[0], named = registry.claims[claim].misconceptions[0]?.id;
  return [
    ...right.claims.map(id => event(registry, id, 'pass', { ...tag, kind: right.transfer ? 'demonstrated_in_transfer' : 'demonstrated_here', ref: { probe_id: right.id } })),
    event(registry, claim, named ? 'misconception' : 'fail', { ...tag, ...(named ? { misconception_id: named } : {}), ref: { probe_id: wrong.id } }),
  ];
}
const claimsOf = (registry, section) => [...section.expected_evidence.map(e => e.claim), ...Object.keys(registry.claims).filter(id => section.target_concepts.includes(registry.claims[id].concept))];
const NANOGPT_IDS = [...Object.keys(NANOGPT_CLAIMS), ...SLICE_CARDS];
const JOURNEY_PROMPT = plannerSystem(false, 'journey');

async function runSubject(subject) {
  const intent = journeyIntent(subject.text), topic = intent.topic, quick = intent.kind === 'quick_overview', journeyId = `corpus-${subject.id}`;
  let intake = slotsFromIntent(intent);
  for (const { slot } of INTAKE_SLOTS) if (intake.slots[slot] === undefined && subject.intake[slot]) intake = applyIntakeAnswer(intake, slot, { option_id: subject.intake[slot] });
  for (const [slot, value] of Object.entries(subject.slots)) intake = { ...intake, slots: { ...intake.slots, [slot]: value }, source: { ...intake.source, [slot]: 'stated' } };
  let registry = { concepts: {}, claims: {} }, store = emptyStore(), note = null;
  // --plan: a stage before the window is seeded (or, when no later stage reads it, recorded as not run); a stage after it
  // does not run. Without --plan every stage runs.
  const span = PLAN?.[subject.id], order = name => STAGES.indexOf(name);
  const beyond = name => !!span && order(name) > order(span.to), early = name => !!span && order(name) < order(span.from);
  const stage = async (name, run, options) => {
    if (beyond(name)) return null;
    if (!early(name)) return step(subject, name, run, options);
    const seeded = Object.hasOwn(SEEDS[subject.id], name);
    record({ kind: 'step', subject: subject.id, step: name, checks: {}, pass: null, ...(seeded ? { seeded: SEED_FILE } : { skipped: 'before the --plan window; no later stage reads it' }) });
    return seeded ? SEEDS[subject.id][name] : null;
  };
  const skipHere = (names, reason) => skip(subject, names.filter(name => !beyond(name)), reason);

  // (a) Diagnostic; its scripted answers become the journey's evidence. Failed, the path goes on as after a skipped one.
  if (subject.diagnostic) {
    const diagnostic = await stage('diagnostic', () => planDiagnostic(ENV, { topic, intake, grounding: { kind: 'topic' } }, { callModel }));
    if (diagnostic) {
      registry = diagnostic.registry;
      ({ store } = appendEvents(store, probeEvents(registry, diagnostic.probes)));
    } else note = 'the diagnostic failed: drafted as after a skipped diagnostic (empty registry, no evidence)';
  } else skipHere(['diagnostic'], 'a fast start has none: the path draft starts from an empty registry');

  // (b) Path: the first draft, its concepts_added merged into the registry (new ids only) as the route's drafted() does.
  const drafted = await stage('path', () => planPath(ENV, { topic, intake, states: claimStates(store.events, registry), constraints: [], pending_edits: [], registry,
    diagnostic_evidence_refs: store.events.map(e => e.seq), ...(quick ? { max_sections: 3 } : {}) }, { callModel }), { note, rawChecks: raw => conceptRefs(raw, registry), checks: out => {
    const { sections } = out.path, raw = calls.at(-1)?.raw;
    return {
      section_count: quick ? check(sections.length <= 3, `${sections.length} sections (quick overview: at most 3)`) : check(sections.length >= 4 && sections.length <= 10, `${sections.length} sections (default depth: 4-10)`),
      // pathOutput's first-draft rule: upcoming, optional or skipped (no current, completed or needs_review), not generated.
      all_upcoming: check(sections.every(s => DRAFT_STATUSES.includes(s.status) && s.generation_state === 'not_generated'),
        `statuses seen: ${Object.entries(sections.reduce((n, s) => ({ ...n, [`${s.status}/${s.generation_state}`]: (n[`${s.status}/${s.generation_state}`] || 0) + 1 }), {})).map(([k, v]) => `${k} x${v}`).join(', ')}`),
      only_current_generated: onlyCurrent(out.path), plans_only: plansOnly(raw), wording: pathWording(raw),
    };
  } });
  if (!drafted) return skipHere(['section', 'adapt_edit', 'adapt_evidence', 'tutor', 'dive'], 'the path failed');
  registry = { concepts: { ...drafted.concepts_added.concepts, ...registry.concepts }, claims: { ...drafted.concepts_added.claims, ...registry.claims } };
  const states = () => claimStates(store.events, registry);
  const [s1, s2] = drafted.path.sections;

  // (c) Section 1's plan, on the accepted version (section 1 current), as the route's accept + plan_section.
  const accepted = { ...drafted.path, version: 2, current_section_id: s1.id, sections: drafted.path.sections.map((s, i) => (i ? s : { ...s, status: 'current' })),
    change: { source: 'learner_edit', reason: 'accepted', evidence_refs: [], sections_changed: [] } };
  const plan = await stage('section', () => planSection(ENV, { path: accepted, section: accepted.sections[0], registry, states: states() }, { callModel }), { rawChecks: raw => keyIds(raw, registry), checks: out => {
    const own = new Set([...s1.target_concepts, ...s1.prerequisites]);
    const used = [...out.teaching_sequence.flatMap(s => s.claims), ...out.checks.flatMap(c => c.claims), ...out.completion_evidence.map(e => e.claim)];
    const outside = [...new Set([...out.target_concepts, ...used.map(id => registry.claims[id].concept)].filter(c => !own.has(c)))];
    return {
      only_section_1: check(out.section_id === s1.id && !outside.length, outside.length ? `concepts outside section 1: ${outside.join(', ')}` : `${out.section_id}: ${out.teaching_sequence.length} steps, ${out.checks.length} checks`),
      step_roles: check(out.teaching_sequence.every(s => STEP_ROLES.includes(s.role)), out.teaching_sequence.map(s => s.role).join(', ')),
      wording: wording([out.learning_objective, ...out.teaching_sequence.flatMap(s => [s.make.text, s.make.request])].map(t => [t, NO_PERCENT])),
    };
  } });

  // (d), (e): both adapt the same input, section 1 completed and section 2 current. The fast start runs neither (spend).
  const adapting = subject.adapt !== false;
  if (!adapting) skipHere(['adapt_evidence'], 'the fast-start case runs no adapt stage (spend)');
  const prev = adapting && s2 && { ...accepted, current_section_id: s2.id, change: { source: 'learner_edit', reason: 'section 1 completed', evidence_refs: [], sections_changed: [] },
    sections: drafted.path.sections.map((s, i) => (i === 0 ? { ...s, status: 'completed', generation_state: 'generated', heading_block_id: 'corpus-s1-heading' } : i === 1 ? { ...s, status: 'current' } : s)) };
  if (adapting && !prev) skipHere([...(subject.edit ? ['adapt_edit'] : []), 'adapt_evidence'], 'the drafted path has no section 2');
  const later = prev ? prev.sections.slice(2) : [], target = later[1] ?? later[0];
  if (prev && subject.edit && !target) skipHere(['adapt_edit'], 'the drafted path has no section after the current one to edit');
  else if (prev && subject.edit) {
    const input = { prev, edit: EDITS[subject.edit](target.title), registry, states: states() };
    await stage('adapt_edit', () => adaptPath(ENV, input, { callModel }), { repair: out => adaptRepair(out, input), rawChecks: raw => conceptRefs(raw, input.registry), checks: out => ({
      adapt_valid: adaptValid(out, adaptRepair(out, input)),
      completed_unchanged: unchanged(prev.sections[0], out.path.sections.find(s => s.id === prev.sections[0].id)),
      edit_respected: respected(subject.edit, prev, out.path, target),
      only_current_generated: onlyCurrent(out.path), plans_only: plansOnly(calls.at(-1)?.raw), wording: pathWording(calls.at(-1)?.raw),
    }) });
  }
  // (e) A settled misconception (two settled events naming it) on a section-2 claim.
  const claim = prev && claimsOf(registry, s2).find(id => registry.claims[id].misconceptions.length);
  if (prev && !claim) skipHere(['adapt_evidence'], 'section 2 has no claim with a named misconception');
  else if (prev) {
    const named = registry.claims[claim].misconceptions[0].id, tag = { evaluator: 'jev', source: 'free_text', misconception_id: named };
    const appended = appendEvents(store, [event(registry, claim, 'misconception', tag), event(registry, claim, 'misconception', tag)]);
    const input = { prev, evidence: { claims: [claim], refs: appended.events.map(e => e.seq) }, registry, states: claimStates(appended.store.events, registry) };
    await stage('adapt_evidence', () => adaptPath(ENV, input, { callModel }), { repair: out => adaptRepair(out, input), rawChecks: raw => conceptRefs(raw, input.registry), checks: out => {
      // Evidence changes future planning only: completed and current history byte-identical, the change list on later sections.
      const cut = prev.sections.findIndex(s => s.id === prev.current_section_id) + 1, history = prev.sections.slice(0, cut);
      const rewritten = history.filter((s, i) => JSON.stringify(s) !== JSON.stringify(out.path.sections[i])).map(s => s.id);
      const touched = out.path.change.sections_changed.filter(c => history.some(s => s.id === c.id)).map(c => `${c.id} ${c.op}`);
      return {
        adapt_valid: adaptValid(out, adaptRepair(out, input)),
        completed_unchanged: unchanged(prev.sections[0], out.path.sections.find(s => s.id === prev.sections[0].id)),
        future_only: check(!rewritten.length && !touched.length, rewritten.length || touched.length
          ? [rewritten.length ? `history rewritten: ${rewritten.join(', ')}` : '', touched.length ? `change list touches history: ${touched.join(', ')}` : ''].filter(Boolean).join('; ')
          : out.path.change.sections_changed.map(c => `${c.id} ${c.op}`).join(', ') || 'no section changed'),
        only_current_generated: onlyCurrent(out.path), plans_only: plansOnly(calls.at(-1)?.raw), wording: pathWording(calls.at(-1)?.raw),
      };
    } });
  }

  // (f) One journey Tutor turn in section 1: a question about its first claim, the store holding the journey's evidence.
  const journey = { id: journeyId, state: 'active', active_section_id: s1.id, registry, request: { topic }, intake };
  let context = null;
  await stage('tutor', () => {
    // ponytail: no evaluator in the corpus (the brief's chain is planners only); /evaluate answers skipped, no evidence.
    const post = async (path, body) => { if (path !== '/api/learn/tutor/plan') return { status: 'skipped', evaluator: null, events: [] }; context = body.context; return planTurn(ENV, body.context, { callModel }); };
    return runTurn({ raw: tutorQuestion(registry.claims[claimsOf(registry, s1)[0]].statement), canvas: { app: 'canvas-corpus', board: 'main' }, access: { app: 'canvas-corpus' }, block: null,
      store: { ...emptyStore(), events: store.events, seq: store.seq }, post, domain: journeyDomain({ journey, path: accepted, blocks: [] }) });
  }, {
    output: out => ({ routed: out.routed.row, tier: out.response.telemetry?.tier ?? null, actions: out.actions, log: out.log }),
    repair: out => (out.response.telemetry?.escalated ? { used: LEARN_TASKS.tutor.model, why: out.response.telemetry.escalated, tier_reason: out.response.telemetry.tier_reason } : null),
    checks: out => {
      const tutorCalls = calls.filter(call => call.role === 'tutor'), raw = tutorCalls.at(-1)?.raw, proposed = Array.isArray(raw?.actions) ? raw.actions : [];
      const rejected = out.decisions.filter(d => !d.accepted), asked = proposed.filter(a => a?.type === 'ask_question').length;
      const prompts = tutorCalls.map(call => (call.system === JOURNEY_PROMPT ? 'journey prompt' : call.system === PLANNER_SYSTEM ? 'PLANNER_SYSTEM (nanoGPT)' : 'an unknown prompt'));
      const nanogpt = NANOGPT_IDS.filter(id => JSON.stringify(context).includes(id) || tutorCalls.some(call => JSON.stringify(call.raw).includes(id)));
      return {
        tutor_valid: check(!rejected.length && out.actions.some(a => a.type !== 'no_action'), rejected.length ? rejected.map(d => `${d.type}@${d.stage}: ${d.reason}`).join('; ') : `${out.routed.row}: ${out.actions.map(a => a.type).join(', ')}`),
        one_question: check(asked <= 1, `${asked} ask_question proposed`),
        wording: wording(proposed.filter(a => a?.type === 'respond_text' || a?.type === 'ask_question').map(a => [a.text, LEARNER_PERCENT])),
        journey_domain: check(prompts.length && prompts.every(p => p === 'journey prompt') && !!context?.journey_context, `${prompts.join(', ') || 'no planner call'}; journey_context ${context?.journey_context ? 'present' : 'missing'}`),
        no_nanogpt_ids: check(!nanogpt.length, nanogpt.length ? `nanoGPT ids in the context or reply: ${nanogpt.join(', ')}` : 'none'),
      };
    },
  });

  // The journey Rabbit Hole (free, no model call): a hole opened from section 1's first step block that has claims (the
  // section plan's; with no plan, a plain block, which takes the current section's expected evidence) keeps its journey
  // context, and the record's origin identity is the same as without a journey.
  const first = plan?.teaching_sequence.find(s => s.claims.length);
  const block = first ? { id: `corpus-${first.step_id}`, type: 'explanation', title: first.step_id, journey: { journey_id: journeyId, section_id: s1.id, step_id: first.step_id, claims: first.claims } }
    : { id: 'corpus-note', type: 'note', title: s1.title };
  await stage('dive', () => {
    const ctx = journeyDiveContext(journey, accepted, block), base = { name: 'canvas-corpus-dive', title: s1.title, via: 'learner_slash', parent: { app: 'canvas-corpus', board: 'main' }, target: resolveTarget(block), block };
    return { context: ctx, record: diveRecord({ ...base, journey: ctx }), plain: diveRecord(base) };
  }, { note: first ? 'from a stamped section-1 step block' : 'no section plan: from an unstamped block', checks: ({ context: ctx, record, plain }) => {
    const bad = !ctx ? ['no journey context'] : [
      ctx.journey_id !== journeyId && `journey_id ${ctx.journey_id}`, ctx.section_id !== s1.id && `section_id ${ctx.section_id} is not section 1 (${s1.id})`,
      !ctx.concept_ids.length && 'no concept_ids', ...ctx.concept_ids.filter(id => !registry.concepts[id]).map(id => `unknown concept ${id}`),
      !ctx.claim_ids.length && 'no claim_ids', ...ctx.claim_ids.filter(id => !registry.claims[id]).map(id => `unknown claim ${id}`),
      JSON.stringify(record.journey) !== JSON.stringify(ctx) && 'the record does not carry it',
    ].filter(Boolean);
    const { journey: _, ...rest } = record, same = JSON.stringify(rest) === JSON.stringify(plain);
    const anchored = record.origin.origin_block_id === block.id && record.return_point.block_id === block.id;
    return {
      dive_context: check(!bad.length, bad.length ? bad.join('; ') : `${ctx.section_id}: concepts ${ctx.concept_ids.join(', ')}; claims ${ctx.claim_ids.join(', ')}`),
      dive_identity: check(same && anchored, !anchored ? `origin_block_id ${record.origin.origin_block_id} / return_point.block_id ${record.return_point.block_id}, not ${block.id}`
        : same ? `origin and return point on ${block.id}, as without a journey` : `origin differs: ${JSON.stringify(rest.origin)} vs ${JSON.stringify(plain.origin)}`.slice(0, 300)),
    };
  } });
}

// Resolver rule 5: each probe's tray as trayFor computes it for that journey state. A reply resolverOutput replaced
// (no tool call, an unknown kind or option) is the resolver's fallback, recorded as repair use.
async function runResolver() {
  for (const probe of RESOLVER_PROBES) {
    const tray = trayFor({ state: probe.tray.state, request: { topic: RESOLVER_TOPIC }, intake: { slots: probe.tray.slots || {}, source: {} }, path_version: 1 }, null);
    await step({ id: 'resolver' }, probe.id, () => resolveWithModel(ENV, { text: probe.text, tray }, { callModel }), {
      repair: out => { const raw = calls[0]?.raw; return raw?.kind === out.kind && (raw.option_id ?? null) === (out.option_id ?? null) ? null : { used: 'resolverOutput', why: raw ? `the model said ${raw.kind}${raw.option_id ? ` (${raw.option_id})` : ''}` : 'no tool call' }; },
      checks: out => ({ resolver_kind: check(out.kind === probe.expect, `${out.kind}${out.option_id ? ` (${out.option_id})` : ''}, expected ${probe.expect}`) }),
    });
  }
}

// One pass; summary.json is written whatever happens (a crash is recorded in it, then the error goes on).
let stoppedAt = null, crashed = null;
try {
  for (const item of [...(PLAN ? [] : [{ id: 'resolver', run: runResolver }]), ...RUN_SUBJECTS.map(subject => ({ id: subject.id, run: () => runSubject(subject) }))]) {
    if (done.has(item.id)) continue;
    try { await item.run(); } catch (error) {
      if (error instanceof BudgetStop) { stoppedAt = { ...at, reason: error.message }; break; }
      if (error instanceof Refused) break;
      throw error;
    }
    record({ kind: 'subject_done', subject: item.id });
    if (LIVE) console.error(`${item.id}: done, all live runs $${spent().toFixed(3)}`);
  }
} catch (error) {
  crashed = { ...at, error: cut300(`${error.name}: ${error.message}`) };
  throw error;
} finally {
  let summary;
  try { summary = summarize(); } catch (error) {
    summary = { mode: MODE, file: FILE, stopped_at_budget: stoppedAt, aborted: ABORTED, crashed, summary_error: cut300(`${error.name}: ${error.message}`), all_live_runs_usd: spent() };
  }
  writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  const worst = summary.cost?.worst_case_usd;
  if (worst) console.error(`projected worst case${PLAN ? ` for --plan ${PLAN_ARG}` : ''}: $${worst.calls_made} for the calls made, $${worst.plus_untaken_escalations} with every escalation they could take`);
}

// The summary: the last row per subject/stage (a resumed subject ran again), every call row for the cost.
function summarize() {
  const steps = [...new Map(rows.filter(row => row.kind === 'step').map(row => [`${row.subject}/${row.step}`, row])).values()];
  const callRows = rows.filter(row => row.kind === 'call');
  const tally = key => callRows.reduce((acc, row) => {
    const t = acc[key(row)] ||= { calls: 0, ms: 0, in: 0, out: 0, cw: 0, cr: 0, usd: 0, worst_usd: 0 };
    t.calls++;
    for (const k of ['ms', 'in', 'out', 'cw', 'cr']) t[k] += row[k];
    t.usd = +(t.usd + row.cost_usd).toFixed(6);
    t.worst_usd = +(t.worst_usd + row.worst_usd).toFixed(6);
    return acc;
  }, {});
  // The escalations this run did not take, priced at their worst case on the same input size: a journey_adapt reply that
  // stood (journey_path could have re-planned it) and a fast-tier Tutor plan that stood (Opus could have re-planned it).
  const byStep = Object.values(callRows.reduce((acc, row) => { (acc[`${row.subject}/${row.step}`] ||= []).push(row); return acc; }, {}));
  const untaken = byStep.reduce((n, list) => {
    const [row] = list, escalate = { journey_adapt: 'journey_path', tutor: 'tutor' }[row.role];
    if (list.length !== 1 || !escalate || (row.role === 'tutor' && row.requested_model === LEARN_TASKS.tutor.model)) return n;
    return n + usd({ model: LEARN_TASKS[escalate].model, cw: Math.ceil(row.input_chars / 2), out: LEARN_TASKS[escalate].maxTokens });
  }, 0);
  const worstTaken = callRows.reduce((n, row) => n + row.worst_usd, 0);
  return {
    mode: MODE, file: FILE, budget: BUDGET, ceiling: CEILING, transport: TRANSPORT, ...(SUB ? { note: SUBSCRIPTION_NOTE } : {}), subjects_run: RUN_SUBJECTS.map(subject => subject.id), ...(PLAN ? { plan: PLAN_ARG, seed: SEED_FILE } : {}), stopped_at_budget: stoppedAt, aborted: ABORTED, crashed,
    subjects_done: rows.filter(row => row.kind === 'subject_done').map(row => row.subject),
    stages: steps.length, stages_passed: steps.filter(row => row.pass).length,
    failed_assertions: steps.filter(row => row.pass === false).flatMap(row => Object.entries(row.checks).filter(([, c]) => !c.pass).map(([assertion, c]) => ({ domain: row.subject, stage: row.step, assertion, reason: c.reason }))),
    skipped: steps.filter(row => row.skipped).map(row => ({ domain: row.subject, stage: row.step, skipped: row.skipped })),
    seeded: steps.filter(row => row.seeded).map(row => `${row.subject}/${row.step}`),
    repairs: steps.filter(row => row.repair).map(row => ({ domain: row.subject, stage: row.step, ...row.repair })),
    latency_ms: Object.fromEntries(steps.filter(row => row.ms != null).map(row => [`${row.subject}/${row.step}`, row.ms])),
    checks: Object.fromEntries(steps.map(row => [`${row.subject}/${row.step}`, row.seeded ? `seeded: ${row.seeded}` : row.skipped ? `skipped: ${row.skipped}` : Object.fromEntries(Object.entries(row.checks).map(([name, c]) => [name, c.pass ? 'pass' : `FAIL: ${c.reason}`]))])),
    cost: {
      per_stage: tally(row => row.step), per_domain: tally(row => row.subject), per_role: tally(row => (row.role === 'tutor' ? `tutor ${row.requested_model}` : row.role)),
      total_usd: +callRows.reduce((n, row) => n + row.cost_usd, 0).toFixed(6), all_live_runs_usd: +spent().toFixed(6),
      worst_case_usd: { calls_made: +worstTaken.toFixed(4), plus_untaken_escalations: +(worstTaken + untaken).toFixed(4),
        note: 'input characters / 2 at the cache-write rate plus max_tokens at the output rate; stub inputs are fixture-sized' },
    },
    served_model_mismatches: callRows.filter(row => row.served_mismatch || (LIVE && row.served_model && row.served_model !== row.requested_model)).map(row => `${row.subject}/${row.step} ${row.served_mismatch || `${row.requested_model} -> ${row.served_model}`}`),
    billed_unknown: callRows.filter(row => row.billed_unknown).map(row => `${row.subject}/${row.step} ${row.role}: ${row.billed_unknown}`),
  };
}
