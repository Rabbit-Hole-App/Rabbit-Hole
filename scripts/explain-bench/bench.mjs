// /explain card benchmark (owner 2026-11-08): one command that generates cards on a running local stack, scores them, compares with the previous run and
// the release baseline, and exits non-zero when a pass criterion on record fails. See README.md.
// Usage: node scripts/explain-bench/bench.mjs --base http://127.0.0.1:8888 --vars <stack .dev.vars> [--sets regression,baseline,aiml,sequence,content] [--runs N]
//          [--cap 2.00] [--label "after phase02"] [--log <stack app.log>] [--persist <stack persist dir>] [--tree <stack worktree>] [--judge] [--judges N]
//          [--judge-cap 1.00] [--carry-from <a judged run dir>] [--judge-only factual,faithful,picture] [--out <results root>] [--against <run dir>] [--baseline <run id>] [--tag-baseline] [--richness-change] [--only id,id] [--gap 1500] [--dry-run]
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { SETS_DIR, SET_NAMES, availableSets, loadSet } from './score.mjs';
import { DEFAULT_OUT, run as report, runDirName } from './report.mjs';
import { preflight } from './preflight.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORST_CARD = 0.05; // --cap covers the whole invocation: the judge gets min(--judge-cap, what generation left)
 // a card is sent only while this much of the cap is left: 2 author calls (~US$0.006) + 3 pictures at the US$0.01 maximum, rounded up
const EST = { authorCall: 0.008, picture: 0.007 }; // the 2026-11-08 study's estimate where the stack ledger records nothing: measured p50 US$0.005 a call, rounded up
const JUDGE_EST = { card: 0.008, diagram: 0.006 }; // Sonnet 5.5 at low effort: ~1.5k tokens in, ~500 out per card (estimate, not measured)
const PROBE = 'how does the water cycle work?'; // the fixed question the prompt hash is built for
const SETTINGS = ['SMALL_ENV', 'EXPLANATION_MODEL_PROFILE', 'EXPLANATION_FALLBACK', 'EXPLANATION_STREAM', 'EXPLANATION_INTERACTIONS', 'EXPLANATION_PLANNER']; // the only non-secret vars read
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
const named = (text, k) => (text.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim();
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Provenance per run (owner trust requirement 1): stack commit, prompt hash of the FINAL assembled author request, schema hashes, model profile, set versions.
async function provenance(tree, settings, sets) {
  const p = { stackTree: tree, stackCommit: null, stackDirtyFiles: null, benchCommit: null, settings };
  try { p.benchCommit = git(HERE, 'rev-parse', 'HEAD'); } catch { p.benchCommit = 'unknown'; }
  try { p.stackCommit = git(tree, 'rev-parse', 'HEAD'); p.stackDirtyFiles = git(tree, 'status', '--porcelain', '--untracked-files=no').split('\n').filter(Boolean).length; } catch { p.stackCommit = 'unknown (not a git tree)'; }
  try {
    const u = f => pathToFileURL(join(tree, 'packages/control-plane/src', f)).href;
    const [{ prepareArtifactAuthorRequest }, { stepRequest }, { resolveExplanationProfile, EXPLANATION_REGISTRY, chainSteps }] = await Promise.all(['learn-artifact.js', 'explanation-fast-chain.js', 'explanation-models.js'].map(f => import(u(f))));
    const profile = resolveExplanationProfile(settings.EXPLANATION_MODEL_PROFILE || EXPLANATION_REGISTRY.defaultProfile), author = profile.roles.author;
    const prepared = prepareArtifactAuthorRequest(Object.fromEntries(Object.entries(settings).filter(([, v]) => v)), { command: 'explanation', args: PROBE, selection: null, context: null }, { profile });
    if (prepared.result) throw new Error(prepared.message || prepared.result);
    p.model = { profile: profile.id, profileVersion: profile.version, adapter: author.adapter, provider: author.provider, model: author.model, effort: author.settings?.reasoning_effort ?? null };
    if (author.adapter === 'fast-chain') {
      const req = stepRequest(chainSteps(author)[0], author.settings.reasoning_effort, prepared.body);
      Object.assign(p.model, { temperature: req.temperature, seed: req.seed ?? null, maxTokens: req.max_tokens });
      p.promptHash = sha(req.messages[0].content + JSON.stringify(req.response_format)); p.schemaHash = sha(JSON.stringify(req.response_format));
      p.promptHashOf = `sha256/16 of the system message stepRequest sends (prepareArtifactAuthorRequest + stepRequest, probe "${PROBE}") + its response_format; schemaHash = the response_format alone`;
    } else {
      Object.assign(p.model, { temperature: null, seed: null, maxTokens: prepared.body.max_tokens });
      p.promptHash = sha(prepared.body.system + JSON.stringify(prepared.body.tools)); p.schemaHash = sha(JSON.stringify(prepared.body.tools));
      p.promptHashOf = `sha256/16 of the plan request's system text + tools (probe "${PROBE}"); schemaHash = the tools alone`;
    }
  } catch (e) { p.promptHash = `unknown: ${String(e.message).slice(0, 160)}`; }
  // The planner's input size (the JEV planner posts its seven questions with every card; plan.inputTokens is not in the log line): an estimate from characters, for the cost line.
  try { const { QUESTIONS, PLANNER_MODEL } = await import(pathToFileURL(join(tree, 'packages/control-plane/src/explanation-planner.js')).href); p.plannerInputTokensEstimate = Math.ceil(JSON.stringify({ model: PLANNER_MODEL, state: { question: 'x'.repeat(60), depth: 'standard', context: null }, questions: QUESTIONS }).length / 3.5); } catch { p.plannerInputTokensEstimate = null; }
  try { p.diagramSchemaHash = sha(readFileSync(join(tree, 'packages/web/src/tutor-diagrams/spec.js'))); } catch { p.diagramSchemaHash = 'unknown'; }
  p.sets = Object.fromEntries(sets.map(n => [n, { ...loadSet(n).version, sha: sha(readFileSync(join(SETS_DIR, `${n}.json`))) }]));
  return p;
}

// Provider tokens per card from the stack's local usage ledger (read only; as the 2026-11-08 study's tokens.mjs): one usage action per card, in send order.
async function tokensFromPersist(persist, email, rawDir) {
  const { DatabaseSync } = await import('node:sqlite');
  const d1 = join(persist, 'local/v3/d1/miniflare-D1DatabaseObject');
  const open = t => readdirSync(d1).filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite').map(f => new DatabaseSync(join(d1, f), { readOnly: true })).find(db => db.prepare("select 1 from sqlite_master where type='table' and name=?").get(t));
  const users = open('users'), usage = open('usage_attempts'), uid = users?.prepare('select id from users where lower(email)=?').get(email.toLowerCase())?.id;
  if (!uid) return 'token counts skipped: no such user in the stack database';
  const actions = usage.prepare("select action_id from usage_actions where user_id=? and feature='artifact' order by started_at, rowid").all(uid);
  const dirs = readdirSync(rawDir), rows = dirs.flatMap(d => readFileSync(join(rawDir, d, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => ({ dir: d, ...JSON.parse(l) }))).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (actions.length !== rows.length) return `token counts skipped: ${actions.length} usage actions for ${rows.length} cards (a failed send recorded no action), so they cannot be matched`;
  const per = {};
  rows.forEach((r, i) => {
    const at = usage.prepare('select provider, input_tokens, output_tokens, cost_micros from usage_attempts where action_id=? order by started_at, rowid').all(actions[i].action_id);
    const author = at.filter(x => x.provider !== 'recraft'), pics = at.filter(x => x.provider === 'recraft'), sum = (xs, k) => xs.reduce((s, x) => s + (x[k] || 0), 0);
    (per[r.dir] ||= []).push({ id: r.id, input: sum(author, 'input_tokens'), output: sum(author, 'output_tokens'), authorUsd: sum(author, 'cost_micros') / 1e6, pictureUsd: sum(pics, 'cost_micros') / 1e6 });
  });
  for (const [d, cards] of Object.entries(per)) writeFileSync(join(rawDir, d, 'tokens.json'), JSON.stringify({ email, cards }, null, 1));
  return `token counts recorded for ${rows.length} cards`;
}

const { values: a } = parseArgs({ options: {
  base: { type: 'string' }, vars: { type: 'string' }, sets: { type: 'string' }, runs: { type: 'string' }, cap: { type: 'string', default: '2.00' }, label: { type: 'string', default: 'run' },
  log: { type: 'string' }, persist: { type: 'string' }, tree: { type: 'string' }, out: { type: 'string' }, against: { type: 'string' }, baseline: { type: 'string' }, 'tag-baseline': { type: 'boolean' },
  judge: { type: 'boolean' }, judges: { type: 'string', default: '1' }, 'judge-cap': { type: 'string', default: '1.00' }, 'judge-only': { type: 'string' }, 'richness-change': { type: 'boolean' },
  note: { type: 'string' }, 'carry-from': { type: 'string' }, depth: { type: 'string' }, depths: { type: 'string' }, 'dry-run': { type: 'boolean' }, gap: { type: 'string', default: '1500' }, only: { type: 'string' }, 'skip-preflight': { type: 'boolean' } } });
const fail = msg => { console.error(`✗ ${msg}`); process.exit(2); };
const sets = (a.sets || SET_NAMES.join(',')).split(',').map(s => s.trim()).filter(Boolean);
for (const s of sets) if (!availableSets().includes(s)) fail(`unknown set ${s}; sets: ${availableSets().join(', ')}`);
const cap = Number(a.cap), judgeCap = Number(a['judge-cap']), judges = Number(a.judges), only = (a.only || '').split(',').filter(Boolean);
if (!(cap > 0) || !(judgeCap >= 0) || !(judges >= 1)) fail('--cap must be > 0, --judge-cap >= 0, --judges >= 1');
// Depth (--depth one, --depths several, else the set's defaultDepths, else none sent): sent as `depth` beside `board`; the server's DEPTHS are overview|standard|deep.
const DEPTHS = ['overview', 'standard', 'deep'], depthArg = a.depths ? a.depths.split(',').map(s => s.trim()).filter(Boolean) : a.depth ? [a.depth] : null;
if (depthArg && depthArg.some(x => !DEPTHS.includes(x))) fail(`--depth/--depths take ${DEPTHS.join(', ')}`);
const plan = sets.map(n => { const d = loadSet(n), prompts = d.prompts.filter(p => !only.length || only.includes(p.id));
  return { name: n, prompts, runs: a.runs ? Number(a.runs) : d.defaultRuns || 1, depths: depthArg || d.defaultDepths || [null], est: d.estUsdPerCard }; });
const per = p => p.prompts.length * p.runs * p.depths.length;
const cards = plan.reduce((s, p) => s + per(p), 0), est = plan.reduce((s, p) => s + per(p) * p.est, 0);
const judgeEst = a.judge ? judges * plan.reduce((s, p) => s + per(p) * (JUDGE_EST.card + (p.prompts.some(x => x.sketch || x.depths) ? JUDGE_EST.diagram : 0)), 0) : 0;
console.log(`✓ sets: ${plan.map(p => `${p.name} ${p.prompts.length}x${p.runs}${p.depths[0] ? ` at ${p.depths.join('/')}` : ''}`).join(', ')} = ${cards} cards`);
console.log(`✓ estimate: US$${est.toFixed(2)} generation (per-card spend measured on the 2026-11-08 5d run), cap US$${cap.toFixed(2)} (hard)${est > cap ? `: the cap stops the run after about ${Math.floor(cap / (est / cards))} cards` : ''}`);
console.log(a.judge ? `✓ judge: claude-sonnet-5-5 x${judges}, estimate US$${judgeEst.toFixed(2)}, judge cap US$${judgeCap.toFixed(2)}` : '✓ judge: off (no --judge): no factual or faithfulness scores');
if (!a.vars && !a['dry-run']) fail('--vars <the stack\'s .dev.vars> is required (its TEST_BYPASS_SECRET mints the test session)');
const varsText = a.vars ? readFileSync(a.vars, 'utf8') : '', settings = Object.fromEntries(SETTINGS.map(k => [k, named(varsText, k) || null]));
let tree = a.tree ? resolve(a.tree) : null;
if (!tree && a.vars) try { tree = git(dirname(resolve(a.vars)), 'rev-parse', '--show-toplevel'); } catch { /* not in a git tree */ }
const prov = tree ? await provenance(tree, settings, sets) : null;
console.log(prov ? `✓ provenance: stack ${prov.stackCommit}${prov.stackDirtyFiles ? ` (+${prov.stackDirtyFiles} modified files)` : ''}, profile ${prov.model ? `${prov.model.profile} ${prov.model.provider}/${prov.model.model} effort=${prov.model.effort} temperature=${prov.model.temperature} seed=${prov.model.seed}` : '?'}, prompt ${prov.promptHash}, schema ${prov.schemaHash}` : '✓ provenance: not recorded (no --vars or --tree)');
console.log(a.log ? `✓ app log: ${a.log} (repair causes, corrections, raw specs, stripped keys)` : '✓ app log: none (no --log): repair causes, raw pre-correction specs and stripped keys are not recorded');
if (a['dry-run']) { console.log('RESULT dry-run: nothing sent'); process.exit(0); }
if (!a.base) fail('--base <stack URL> is required');

const BASE = a.base.replace(/\/$/, ''), secret = named(varsText, 'TEST_BYPASS_SECRET'); // the one secret read, never printed
if (!secret) fail('no TEST_BYPASS_SECRET in --vars');
// Pre-flight (owner 2026-11-09): one probe per provider; an outage makes the run INVALID (exit 4), never a FAILED run. --skip-preflight is for offline checks only.
if (!a['dry-run'] && !process.argv.includes('--skip-preflight')) { const pf = await preflight({ varsFile: a.vars }); for (const x of pf.results) console.log(`${x.ok ? '✓' : '✗'} preflight ${x.name}: ${x.detail}`); if (!pf.ok) { console.error('✗ PREFLIGHT INVALID: a provider is down, the run is not started (invalid, not failed)'); process.exit(4); } }
let refused = 0, invalid = false;
const out = resolve(a.out || DEFAULT_OUT), runId = runDirName(a.label), runDir = join(out, runId), rawDir = join(runDir, 'raw');
mkdirSync(rawDir, { recursive: true });
const email = `explain-bench-${Date.now().toString(36)}@example.com`;
const minted = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret }) })).json().catch(() => null);
if (!minted?.session) fail(`no test session from ${BASE}/test/session`);
const headers = { cookie: `small_session=${minted.session}`, 'content-type': 'application/json' };
const api = async (path, init = {}) => { const r = await fetch(BASE + path, { ...init, headers }); return { status: r.status, body: await r.json().catch(() => null) }; };
const logSize = () => (a.log && existsSync(a.log) ? statSync(a.log).size : 0);
const logSince = from => { const to = logSize(); if (to <= from) return ''; const b = Buffer.alloc(to - from), fd = openSync(a.log, 'r'); readSync(fd, b, 0, b.length, from); closeSync(fd); return b.toString('utf8'); };
const events = (text, name) => [...text.matchAll(new RegExp(`\\{"event":"${name}"[^\\n]*\\}`, 'g'))].map(m => { try { return JSON.parse(m[0]); } catch { return null; } }).filter(Boolean);

let spent = 0, sent = 0, stopped = false;
outer: for (let r = 1; r <= Math.max(...plan.map(p => p.runs)); r++) for (const p of plan.filter(x => x.runs >= r)) {
  for (const dep of p.depths) {
  const dir = join(rawDir, `${p.name}-r${r}${dep ? `-${dep}` : ''}`); mkdirSync(join(dir, 'cards'), { recursive: true });
  for (const q of p.prompts) {
    if (spent + WORST_CARD > cap) { stopped = true; console.log(`STOP cap: spent US$${spent.toFixed(4)} of US$${cap.toFixed(2)}`); break outer; }
    try { // a stack that goes away mid-run stops the run; the cards so far are still scored and reported
    const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `explain-bench ${p.name} r${r} ${q.id}`.slice(0, 44) }) })).body?.name;
    const logFrom = logSize(), before = (await api('/api/learn/usage')).body, startedAt = new Date().toISOString(), t0 = performance.now();
    const res = canvas ? await fetch(`${BASE}/api/learn/artifact`, { method: 'POST', headers, body: JSON.stringify({ app: canvas, command: 'explanation', args: q.prompt, board: 'main', ...(dep ? { depth: dep } : {}) }) }) : null;
    const response = res ? await res.json().catch(() => null) : null, totalMs = Math.round(performance.now() - t0);
    await sleep(500);
    const after = (await api('/api/learn/usage')).body, text = logSince(logFrom);
    const ledgerUsd = after?.usedCredits != null && before?.usedCredits != null ? +((after.usedCredits - before.usedCredits) * 0.01).toFixed(6) : null; // 1 credit = US$0.01
    const block = response?.result === 'artifact' ? response.block : null, pictures = (String(block?.body || '').match(/```\s*rh-illustration/gi) || []).length;
    const authorCalls = (response?.attempts?.length || 1) + (response?.repaired ? 1 : 0), estUsd = +(authorCalls * EST.authorCall + pictures * EST.picture).toFixed(4);
    const costUsd = ledgerUsd > 0 ? ledgerUsd : estUsd; spent += costUsd; sent++;
    const stripped = events(text, 'explanation_unknown_key_stripped'), raw = events(text, 'explanation_author_raw').map(({ event, ...rest }) => rest);
    const row = { id: q.id, set: p.name, run: r, depth: dep, prompt: q.prompt, canvas, startedAt, http: res?.status ?? null, totalMs, delivered: !!block,
      failure: block ? null : String(canvas ? response?.code || response?.error || response?.result || `http_${res.status}` : 'no canvas').slice(0, 300),
      authoredBy: block?.authoredBy || null, profile: response?.profile || null, repaired: !!response?.repaired, attempts: response?.attempts || null, authorCalls, pictures,
      ledgerUsd, estUsd, costUsd, costSource: ledgerUsd > 0 ? 'ledger' : 'estimate',
      steer: a.log ? events(text, 'explanation_plan_kind_from_reference').map(({ event, ...rest }) => rest) : null, // a reference's exact-prompt / score >= 12 match set the plan kind; null = no --log
      repairCauses: events(text, 'learn_artifact_invalid').map(e => ({ attempt: e.attempt, error: String(e.error).slice(0, 240) })), corrected: events(text, 'explanation_diagram_corrected').map(e => e.kind),
      diagramCorrections: block?.diagramCorrections || null, visualFallback: block?.visualFallback || null, proseLists: block?.proseLists ?? null,
      unknownKeysStripped: a.log ? { events: stripped.length, keys: stripped.reduce((s, e) => s + (Array.isArray(e.keys) ? e.keys.length : e.count ?? 1), 0) } : null,
      // explanation-figures.js logs explain_figure per attempt; a picture with no "ready" outcome was dropped and its fence removed. null = no --log.
      picturesDropped: a.log ? (f => [...new Set(f.map(e => e.id))].filter(id => !f.some(e => e.id === id && e.outcome === 'ready')))(events(text, 'explain_figure')) : null,
      raw: raw.length ? raw : null, // null = raw: not logged (the server writes no explanation_author_raw line yet, or no --log)
      modelCalls: events(text, 'learn_model').map(e => ({ served: e.served, status: e.status, outcome: e.outcome, error: e.error, ms: e.durationMs })) };
    writeFileSync(join(dir, 'cards', `${q.id}.json`), JSON.stringify({ row, response }, null, 1));
    appendFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n');
    console.log(`${p.name.padEnd(10)} r${r}${dep ? ` ${dep.padEnd(8)}` : ''} ${q.id.padEnd(20)} http=${row.http} ${String(totalMs).padStart(6)}ms ${block ? 'CARD' : `FAIL ${row.failure.slice(0, 80)}`}${row.repaired ? ' REPAIRED' : ''} ${row.costSource} US$${costUsd} spent=US$${spent.toFixed(4)}`);
    // Stack-side refusals (the platform day cap, a provider tripwire) are not the pipeline: five in a row make the run INVALID (owner 2026-11-09).
    refused = row.http === 429 ? refused + 1 : 0;
    if (refused >= 5) { stopped = true; invalid = true; console.log(`STOP INVALID: ${refused} cards in a row were refused with http 429 (${row.failure}); the stack, not the pipeline, said no (platform day cap or provider limit)`); break outer; }
    await sleep(Number(a.gap));
    } catch (e) { stopped = true; console.log(`STOP stack unreachable (${e.cause?.code || e.message}) after ${sent} cards, spent US$${spent.toFixed(4)}`); break outer; }
  }
  }
}
if (a.persist) console.log(await tokensFromPersist(resolve(a.persist), email, rawDir).catch(e => `token counts skipped: ${e.message}`));
writeFileSync(join(runDir, 'provenance.json'), JSON.stringify({ ...prov, ...(a.note ? { note: a.note } : {}), invocation: { base: BASE, sets: plan.map(p => ({ set: p.name, prompts: p.prompts.length, runs: p.runs, depths: p.depths })), cap, spentUsd: +spent.toFixed(4), cards: sent, stoppedByCap: stopped, user: email } }, null, 1));
const r = await report({ raw: rawDir, runId, out, label: a.label, against: a.against, baseline: a.baseline, tagBaseline: a['tag-baseline'], judge: a.judge, carryFrom: a['carry-from'], judgeOnly: (a['judge-only'] || '').split(',').filter(Boolean), judges, judgeCap: Math.min(judgeCap, Math.max(0, +(cap - spent).toFixed(4))), richnessChange: a['richness-change'] });
for (const c of r.results.criteria) console.log(`${c.ok ? '✓' : '✗'} ${c.set}: ${c.rule}: ${c.detail}`);
if (r.results.judge) console.log(`judge: ${r.results.judge.calls} calls, ${r.results.judge.cached} cached, US$${r.results.judge.spent} of US$${judgeCap.toFixed(2)}`);
if (invalid) { console.log(`RESULT INVALID cards=${sent} spent=US$${spent.toFixed(4)} report=${join(r.runDir, 'report.md')}`); process.exit(4); }
console.log(`RESULT ${r.code ? 'FAIL' : 'PASS'} cards=${sent} spent=US$${spent.toFixed(4)}${stopped ? ' STOPPED-BY-CAP' : ''} report=${join(r.runDir, 'report.md')}`);
process.exit(r.code || (stopped ? 1 : 0));
