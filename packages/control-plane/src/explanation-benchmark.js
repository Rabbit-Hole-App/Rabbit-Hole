// EXP-09 / EXP-11-C05, C08, C09 (docs/features/explain.md "Benchmark result files"): the trusted benchmark core for the written /explain card, OFFLINE only.
// What is real: profile resolution through explanation-models.js, the REAL learn-artifact.js generateArtifact (production validator, required-visual check, the one repair)
// driven by an injected provider double, a deterministic evaluator, checkpointed result files and a derived summary / report.
// What is not: no provider is ever contacted. `live` exists only as a refusal. Fixture replies are scripted text, never model output, so a fixture run proves wiring, not quality.
// Pure: every file goes through the injected store (explanation-benchmark-io.js); the clock, the wall clock and the provider are injected too.
import { EXPLANATION_CANDIDATES, EXPLANATION_REGISTRY, EXPLANATION_ROLES, explanationProfileBinding, resolveExplanationProfile } from './explanation-models.js';
import { generateArtifact, prepareArtifactAuthorRequest } from './learn-artifact.js';
import { assembledSystem } from './explanation-fast-chain.js';
import { PRIMITIVES } from './learn-primitives.js';
import { ARTIFACT_REPAIRS } from './learn-models.js';
import { VISUAL_REQUIREMENTS_VERSION, deriveVisualRequirements, requirementText } from './explanation-visuals.js';
import { DEFAULT_DEPTH, depthOf } from './chat-depth.js';
import { sha256Hex } from './learn-grade-jev.js';
import { normalizeProviderResult } from './explanation-benchmark-adapters.js';
import { DETERMINISTIC_EVALUATOR, calibrationSummary, calibrationVerdict, deterministicEvaluator, reportMarkdown, summarize, summaryCsv } from './explanation-benchmark-eval.js';
export { normalizeProviderResult };

export const BENCHMARK_SCHEMA_VERSION = 1;
export const HARNESS_VERSION = 1;
export const EVIDENCE_CLASSES = Object.freeze(['dry', 'fixture', 'live']);
export const RUN_ID_RE = /^\d{8}T\d{6}Z-[0-9a-f]{7,12}-[0-9a-z]{4,12}$/;
export const LIVE_REFUSAL = 'live mode refused: a live run needs a concrete paid cap (--cap-usd) and provider credentials, and this harness version has no live adapter. No provider was contacted and nothing was written.';
export class BenchmarkError extends Error { constructor(code, message) { super(message); this.name = 'BenchmarkError'; this.code = code; } }
// ponytail: live execution is deliberately not built (no verified provider access, no paid cap): this class is the whole of live mode. Tutor-entry and image-attachment cases are also left out of corpus v1.
export class LiveRefusedError extends BenchmarkError { constructor(message = LIVE_REFUSAL) { super('live_refused', message); } }
// Thrown by a test hook (or a real crash) to stop a run mid-flight without finishing it: the run is left 'running' for a later resume.
export class InterruptRun extends Error { constructor(message = 'run interrupted') { super(message); this.name = 'InterruptRun'; } }

const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));
export const hashOf = v => sha256Hex(typeof v === 'string' ? v : stable(v));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '_');

// ---- run identity ------------------------------------------------------------------------------------------------------------------------------------
export function makeRunId({ now = new Date(), codeSha = '0000000', suffix } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const random = suffix ?? Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
  const id = `${stamp}-${String(codeSha).slice(0, 12).toLowerCase()}-${random}`;
  if (!RUN_ID_RE.test(id)) throw new BenchmarkError('bad_run_id', `Run id ${id} does not match <UTC-YYYYMMDDTHHMMSSZ>-<short-code-sha>-<unique-suffix>.`);
  return id;
}
// A dry or fixture run can never stand in for live evidence, and different classes are never compared with each other.
export function assertSameEvidenceClass(manifests) {
  const classes = [...new Set(manifests.map(m => m.type))];
  if (classes.length > 1) throw new BenchmarkError('mixed_evidence', `Refusing to compare ${classes.join(' and ')} runs: dry, fixture and live evidence are never mixed.`);
  return classes[0];
}
export const presentableAsLive = manifest => manifest.type === 'live';

// ---- redaction -----------------------------------------------------------------------------------------------------------------------------------
// Values of secret-looking environment variables, and bearer tokens, never reach a file. Names (credentialRef) are not secrets and stay.
export function redactorFor(env = {}) {
  const secrets = Object.entries(env).filter(([k, v]) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i.test(k) && typeof v === 'string' && v.length >= 8).map(([, v]) => v).sort((a, b) => b.length - a.length);
  let hits = 0;
  const redact = text => {
    let t = String(text);
    for (const s of secrets) if (t.includes(s)) { hits += t.split(s).length - 1; t = t.split(s).join('[redacted]'); }
    return t.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, () => { hits++; return 'Bearer [redacted]'; });
  };
  redact.count = () => hits;
  return redact;
}

// ---- frozen corpus ---------------------------------------------------------------------------------------------------------------------------------------
const eol = text => String(text).replace(/\r\n/g, '\n');
// files: { 'cases/x.json': text, ... } (HASHES.json excluded). Rubrics (expected facts) are hashed apart from everything the author side can see.
export async function hashCorpusFiles(files) {
  const per = {};
  for (const [path, text] of Object.entries(files)) if (path !== 'HASHES.json') per[path] = await sha256Hex(eol(text));
  const group = pred => Object.keys(per).filter(pred).sort().map(p => `${p} ${per[p]}`).join('\n');
  return { algorithm: 'sha256 of LF-normalised file text', files: per, corpusHash: await sha256Hex(group(p => !p.startsWith('rubrics/'))), expectedFactsHash: await sha256Hex(group(p => p.startsWith('rubrics/'))) };
}
export async function loadCorpusFromFiles(files) {
  if (!files['HASHES.json']) throw new BenchmarkError('corpus_unfrozen', 'The corpus has no HASHES.json; freeze it before any run.');
  const frozen = JSON.parse(files['HASHES.json']), now = await hashCorpusFiles(files);
  const changed = [...new Set([...Object.keys(now.files), ...Object.keys(frozen.files || {})])].filter(p => now.files[p] !== frozen.files?.[p]);
  if (changed.length || now.corpusHash !== frozen.corpusHash || now.expectedFactsHash !== frozen.expectedFactsHash) throw new BenchmarkError('corpus_changed', `The frozen corpus changed after it was hashed (${changed.slice(0, 5).join(', ') || 'combined hash'}); re-freezing is a deliberate act and a new corpus version.`);
  const json = path => JSON.parse(files[path]);
  const under = prefix => Object.keys(files).filter(p => p.startsWith(prefix) && p.endsWith('.json')).sort();
  const meta = json('corpus.json');
  return { id: meta.id, version: meta.version, thresholds: json('thresholds.json'), cases: under('cases/').map(json), rubrics: Object.fromEntries(under('rubrics/').map(p => [json(p).caseId, json(p)])),
    fixtures: Object.fromEntries(under('fixtures/').map(p => [json(p).caseId, json(p).replies])), hash: frozen.corpusHash, expectedFactsHash: frozen.expectedFactsHash };
}
// The ONLY fields an author ever sees. Expected answers are rubric-only; this view is what the request builder is given.
export function authorInput(c) {
  const visuals = deriveVisualRequirements(requirementText({ args: c.args }));
  if (visuals.unsupported) throw new BenchmarkError('bad_case', `Case ${c.id}: ${visuals.unsupported}`);
  // shortcut: this repeats how artifactFetch builds its generate() input (the route needs auth and a board); upgrade by extracting that builder if the route changes.
  return { command: c.command, args: c.args, selection: null, context: null, ...(depthOf(c.depth) !== DEFAULT_DEPTH ? { depth: depthOf(c.depth) } : {}), ...(visuals.items.length ? { visualRequirements: visuals } : {}) };
}
const caseOf = (corpus, id) => corpus.cases.find(c => c.id === id);
const baseOf = (corpus, c) => (c.base ? caseOf(corpus, c.base) : c);
const rubricOf = (corpus, c) => corpus.rubrics[baseOf(corpus, c).id];

// ---- profiles, matrix, dry-run plan -------------------------------------------------------------------------------------------------------------
export function registryFromConfig(config) {
  const profiles = { ...EXPLANATION_REGISTRY.profiles };
  for (const [id, def] of Object.entries(config?.profiles ?? {})) {
    if (Object.hasOwn(profiles, id)) throw new BenchmarkError('config_conflict', `The config cannot redefine the registry profile ${id}.`);
    profiles[id] = def;
  }
  return { ...EXPLANATION_REGISTRY, profiles };
}
// A role override takes one role's resolved config from another profile: `{ repair: 'fixture-fast' }`. Everything is re-validated by resolveExplanationProfile.
export function deriveProfile(baseId, overrides, registry) {
  const entries = Object.entries(overrides || {});
  if (!entries.length) return resolveExplanationProfile(baseId, registry);
  const base = resolveExplanationProfile(baseId, registry);
  const roles = {}, tag = [];
  for (const [role, sourceId] of entries) {
    if (!EXPLANATION_ROLES.includes(role)) throw new BenchmarkError('bad_override', `No written /explain role ${String(role).slice(0, 30)}; roles are ${EXPLANATION_ROLES.join(', ')}.`);
    roles[role] = { ...resolveExplanationProfile(sourceId, registry).roles[role] };
    tag.push(`${role}=${sourceId}`);
  }
  const id = `${baseId}+${tag.join('+')}`;
  return resolveExplanationProfile(id, { ...registry, profiles: { ...registry.profiles, [id]: { version: base.version, extends: baseId, roles } } });
}
export async function resolveMatrix({ profileIds, overrides = {}, registry = EXPLANATION_REGISTRY }) {
  const ids = profileIds?.length ? profileIds : [registry.defaultProfile];
  const seen = new Set(), out = [];
  for (const id of ids) {
    const profile = deriveProfile(id, overrides, registry);
    if (seen.has(profile.id)) throw new BenchmarkError('duplicate_profile', `Profile ${profile.id} is listed twice.`);
    seen.add(profile.id);
    out.push({ profile, binding: await explanationProfileBinding(profile) });
  }
  return out;
}
const priceOf = (config, role) => (role.pricingKey ? config?.pricing?.[role.pricingKey] ?? null : null);
const roleLabel = r => `${r.provider}/${r.model}`;
export function stageCeilings(profile, entry = 'direct') {
  const repairs = entry === 'direct' ? ARTIFACT_REPAIRS : 0; // an ordinary accepted Tutor card keeps repairs:0
  const { author, repair } = profile.roles;
  return { authorCalls: 1, repairCalls: repairs, evaluatorModelCalls: 0, maxProviderCallsPerAttempt: 1 + repairs, outputTokenCeilingPerAttempt: author.maxOutputTokens + repairs * repair.maxOutputTokens };
}
export function capabilityGaps(matrix) {
  return {
    candidates: Object.entries(EXPLANATION_CANDIDATES).map(([family, c]) => ({ family, status: c.status, via: c.via, note: c.note, blocked: c.status !== 'supported' })),
    roles: matrix.flatMap(({ profile }) => EXPLANATION_ROLES.map(role => ({ profile: profile.id, role, provider: profile.roles[role].provider, model: profile.roles[role].model, adapter: profile.roles[role].adapter, credentialRef: profile.roles[role].credentialRef, images: 'not exercised: no image-attachment case in corpus v1' }))),
  };
}
export function planRun({ matrix, corpus, trials = 1, config = {} }) {
  const bench = corpus.cases.filter(c => c.kind === 'benchmark'), cal = corpus.cases.filter(c => c.kind === 'calibration');
  const profiles = matrix.map(({ profile, binding }) => {
    const ceilings = stageCeilings(profile), priced = EXPLANATION_ROLES.every(r => priceOf(config, profile.roles[r]));
    const attempts = bench.length * trials;
    const rates = priced ? EXPLANATION_ROLES.map(r => priceOf(config, profile.roles[r])) : [], outPrice = priced ? Math.max(...rates.map(x => x.outputPerMTok)) : null;
    const outBound = priced ? String(Math.round(attempts * ceilings.outputTokenCeilingPerAttempt * outPrice * 100) / 1e8) : null; // operator tool, plain number
    return { id: profile.id, version: profile.version, hash: binding.hash, author: roleLabel(profile.roles.author), repair: roleLabel(profile.roles.repair), ceilings, attempts,
      maxProviderCalls: attempts * ceilings.maxProviderCallsPerAttempt, outputTokenCeiling: attempts * ceilings.outputTokenCeilingPerAttempt,
      costBound: priced ? `partial: output at most ${outBound} operator price units at ${rates.some(x => x.synthetic) ? 'SYNTHETIC ' : ''}prices; input tokens unknown` : 'unknown: the profile has no pricing key, so no price bound exists', costKnown: priced };
  });
  return { attemptCount: bench.length * matrix.length * trials, calibrationCount: cal.length, trials, cases: bench.length, profiles, gaps: capabilityGaps(matrix),
    spend: { providerCallsMax: profiles.reduce((n, p) => n + p.maxProviderCalls, 0), outputTokensMax: profiles.reduce((n, p) => n + p.outputTokenCeiling, 0), unknownCostProfiles: profiles.filter(p => !p.costKnown).map(p => p.id), authorizedCapUsd: null } };
}
export function renderPlanText(plan) {
  const lines = [`Matrix: ${plan.profiles.length} profile(s) x ${plan.cases} case(s) x ${plan.trials} trial(s) = ${plan.attemptCount} attempts, plus ${plan.calibrationCount} calibration attempts (fixture only).`, ''];
  for (const p of plan.profiles) lines.push(`Profile ${p.id} v${p.version} (${p.hash}): author ${p.author}, repair ${p.repair}`, `  call ceilings per attempt: author ${p.ceilings.authorCalls}, repair ${p.ceilings.repairCalls}, evaluator model calls ${p.ceilings.evaluatorModelCalls}; at most ${p.maxProviderCalls} provider calls, ${p.outputTokenCeiling} output tokens`, `  cost bound: ${p.costBound}`);
  lines.push('', 'Capability gaps (candidate families):');
  for (const c of plan.gaps.candidates) lines.push(`  ${c.family}: ${c.status}${c.blocked ? ' (blocked: cannot run in a profile)' : ''} - ${c.note}`);
  lines.push('', `Spend: at most ${plan.spend.providerCallsMax} provider calls and ${plan.spend.outputTokensMax} output tokens; cost unknown for: ${plan.spend.unknownCostProfiles.join(', ') || 'none'}. Authorized paid cap: none. No call is made in dry or fixture mode.`);
  return lines.join('\n');
}

// ---- attempt ordering ------------------------------------------------------------------------------------------------------------------------------
function rng(seed) {
  let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffled = (list, next) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Per trial the cases are shuffled and, within each case, the profiles: matched cases stay adjacent (interleaved) so drift hits every profile alike. Concurrency is 1.
export function orderAttempts({ corpus, matrix, trials, seed }) {
  const next = rng(seed), items = [];
  for (let trial = 1; trial <= trials; trial++) for (const c of shuffled(corpus.cases.filter(x => x.kind === 'benchmark'), next)) for (const m of shuffled(matrix, next)) items.push({ kind: 'benchmark', caseId: c.id, trial, profile: m.profile, binding: m.binding, attemptId: `${slug(m.profile.id)}--${c.id}--t${trial}` });
  for (const c of corpus.cases.filter(x => x.kind === 'calibration')) items.push({ kind: 'calibration', caseId: c.id, trial: 1, profile: matrix[0].profile, binding: matrix[0].binding, attemptId: `calibration--${c.id}--t1` });
  const ids = new Set(items.map(i => i.attemptId));
  if (ids.size !== items.length) throw new BenchmarkError('duplicate_attempt', 'Two attempts share an id after normalisation; rename a profile or case.');
  return items;
}

// ---- the offline provider double ----------------------------------------------------------------------------------------------------------------
export const createVirtualClock = (start = 0) => { let t = start; return { now: () => t, advance: ms => { t += ms; } }; };
const SPECIAL = ['timeout', 'http500', 'refusal', 'truncated'];
export function checkFixtureScripts(corpus, behaviors, matrix) {
  const models = new Set(matrix.flatMap(({ profile }) => EXPLANATION_ROLES.map(r => profile.roles[r].model)));
  for (const model of models) {
    const b = behaviors?.[model] ?? behaviors?.['*'];
    if (!b) throw new BenchmarkError('no_fixture_behavior', `Fixture mode has no scripted behavior for model ${model}; add it to the config behaviors (or "*").`);
    for (const c of corpus.cases) {
      const replies = corpus.fixtures[baseOf(corpus, c).id] || {};
      for (const token of String(c.kind === 'calibration' ? c.script : b.overrides?.[c.id] ?? b.script).split('>')) if (!SPECIAL.includes(token) && !Object.hasOwn(replies, token)) throw new BenchmarkError('bad_fixture_script', `Behavior for ${model} names reply "${token}" that case ${c.id} does not have.`);
    }
  }
}
// One double per attempt. The script picks, per call number, a named reply from the case's fixture file or a special failure; the last token repeats.
export function fixtureProvider({ replies, behavior, script, clock, timeoutMs }) {
  const tokens = String(script ?? behavior.script).split('>');
  let n = 0;
  return async (env, body, model) => {
    const token = tokens[Math.min(n++, tokens.length - 1)];
    clock.advance?.(token === 'timeout' ? timeoutMs + 1 : behavior.latencyMs ?? 0);
    if (token === 'http500') return new Response('{"error":"scripted upstream failure"}', { status: 500 });
    const usage = behavior.usage === 'unknown' ? {} : { usage: { input_tokens: behavior.tokens?.input ?? 0, output_tokens: behavior.tokens?.output ?? 0 } };
    const served = behavior.servedModel ?? model;
    if (token === 'refusal') return Response.json({ model: served, stop_reason: 'end_turn', content: [{ type: 'text', text: 'I cannot help with that.' }], ...usage });
    const input = replies[token === 'truncated' || token === 'timeout' ? 'clean' : token];
    return Response.json({ model: served, stop_reason: token === 'truncated' ? 'max_tokens' : 'tool_use', content: [{ type: 'tool_use', id: `fx_${n}`, name: 'make_explanation', input }], ...usage });
  };
}

// ---- cost -------------------------------------------------------------------------------------------------------------------------------------------------
// Known only when the provider reported the tokens AND the profile carries a price; anything else is unknown, never zero.
export function costOf(usage, role, config) {
  const price = priceOf(config, role);
  if (!price) return { usd: null, known: false, reason: 'no pricing key for this role' };
  if (usage.input == null || usage.output == null) return { usd: null, known: false, reason: 'usage not reported' };
  if (usage.cache && price.cachePerMTok == null) return { usd: null, known: false, reason: 'cache tokens without a cache price' };
  return { usd: Number(((usage.input * price.inputPerMTok + usage.output * price.outputPerMTok + (usage.cache ?? 0) * (price.cachePerMTok ?? 0)) / 1e6).toFixed(6)), known: true, synthetic: !!price.synthetic };
}
const sumField = (calls, k) => (calls.length && calls.every(c => c.usage?.[k] != null) ? calls.reduce((n, c) => n + c.usage[k], 0) : null);
const sumCost = calls => (calls.every(c => c.cost?.known) ? { usd: Number(calls.reduce((n, c) => n + c.cost.usd, 0).toFixed(6)), known: true } : { usd: null, known: false });

// generateArtifact logs each refused attempt as one JSON line; keep those as the attempt's validation record and let everything else through.
async function captureInvalid(events, fn) {
  const original = console.log;
  console.log = (...args) => { try { const e = JSON.parse(String(args[0])); if (e?.event === 'learn_artifact_invalid') { events.push({ attempt: e.attempt, error: e.error }); return; } } catch { /* not a JSON line */ } original(...args); };
  try { return await fn(); } finally { console.log = original; }
}
class TimedOut extends Error { constructor(ms) { super(`call exceeded ${ms} ms`); this.code = 'benchmark_timeout'; } }

const LIMITATIONS = {
  common: ['Latency is measured from the constructed author request to the validated card; client save, render and first-output times are not measured.',
    'The deterministic evaluator checks card text against frozen patterns. It catches the seeded defects but cannot establish truth for open-ended prose; disputed facts need independent or human review.',
    'Corpus v1 has direct-entry cases only: accepted-Tutor entry and image-attachment cases are not included.',
    'Cache hit/miss separation is recorded as a policy (every fixture call is an uncached scripted reply) but not exercised.',
    'Durations and stage times come from an injected clock (virtual in fixture runs); startedAt and endedAt fields are real wall time, so they do not add up to the durations in a fixture run.'],
  fixture: ['Every reply was a scripted provider double. Quality, latency and cost numbers describe the scripts, not any model.', 'Prices in the fixture config are SYNTHETIC; the registry carries no real pricing.'],
  dry: ['A dry run generates nothing: there are no results to rank.'],
};

// Owner M2 (2026-11-08): the prompt hash covers the final system text the fast chain sends for every corpus case (system prompt, tool guidance,
// references, answer format: explanation-fast-chain.js assembledSystem), so a reordering or a reference change shows as a prompt change.
const PROMPT_ENV = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'prompt-hash-only' };
export const assembledPrompts = corpus => corpus.cases.map(c => { try { const p = prepareArtifactAuthorRequest(PROMPT_ENV, authorInput(c)); return p.body ? assembledSystem(p.body) : ''; } catch { return ''; } }).join('\n---\n');
// ---- the run ---------------------------------------------------------------------------------------------------------------------------------------
export async function runBenchmark(o) {
  if (o.mode === 'live') throw new LiveRefusedError();
  if (!['dry', 'fixture'].includes(o.mode)) throw new BenchmarkError('bad_mode', `Unknown mode ${String(o.mode).slice(0, 20)}; use dry or fixture.`);
  const { corpus, matrix, store, config = {}, clock = createVirtualClock(), wall = () => new Date(), trials = 1, seed = 'e7-1', timeoutMs = 60000, hooks = {}, evaluator = deterministicEvaluator, providerFactory = fixtureProvider } = o;
  if (evaluator.kind === 'model') throw new BenchmarkError('evaluator_refused', 'A model-based evaluator needs its own profile and a concrete paid cap; none is authorized, so the run did not start.');
  if (o.mode === 'fixture' && !o.providerFactory) checkFixtureScripts(corpus, config.behaviors, matrix);
  const plan = planRun({ matrix, corpus, trials, config });
  const runId = o.runId, type = o.mode, redactCount = () => store.redactions?.() ?? 0;
  const manifest = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION, runId, type: o.mode, evidenceClass: o.mode, status: 'running', codeSha: o.codeSha ?? 'unknown', codeDirty: !!o.codeDirty,
    corpus: { id: corpus.id, version: corpus.version, hash: corpus.hash }, expectedFactsHash: corpus.expectedFactsHash, thresholds: corpus.thresholds,
    versions: { harness: HARNESS_VERSION, promptHash: (await hashOf(assembledPrompts(corpus))).slice(0, 16), schemaHash: (await hashOf(PRIMITIVES.explanation.schema)).slice(0, 16), visualRequirements: VISUAL_REQUIREMENTS_VERSION },
    profiles: matrix.map(({ profile, binding }) => ({ ...binding, roles: profile.roles })), evaluator: { id: evaluator.id, kind: evaluator.kind, modelCalls: evaluator.modelCalls, profile: evaluator.profile },
    order: { seed, trials, concurrency: 1, interleave: 'per trial: cases shuffled, then profiles shuffled within each case (seeded)', cachePolicy: 'none: every fixture call is an uncached scripted reply (cache=miss)' },
    timeoutMs, authorizedCapUsd: null, plan: { attemptCount: plan.attemptCount, calibrationCount: plan.calibrationCount, spend: plan.spend }, startedAt: wall().toISOString(), endedAt: null,
    environment: { node: o.nodeVersion ?? null, platform: o.platform ?? null }, limitations: [...LIMITATIONS.common, ...LIMITATIONS[o.mode]],
  };
  const state = o.resume ? await store.load() : null;
  if (state && state.manifest.runId !== runId) throw new BenchmarkError('resume_mismatch', `The directory holds run ${state.manifest.runId}, not ${runId}.`);
  if (state && state.manifest.type !== o.mode) throw new BenchmarkError('mixed_evidence', `Cannot resume a ${state.manifest.type} run as ${o.mode}.`);
  if (state) manifest.startedAt = state.manifest.startedAt;
  await store.writeManifest(manifest);
  const done = new Map((state?.results ?? []).map(r => [r.attemptId, r]));
  const counts = { planned: 0, ran: 0, skipped: 0, reconciled: 0 };

  const items = o.mode === 'dry' ? [] : orderAttempts({ corpus, matrix, trials, seed });
  for (const item of items) {
    counts.planned++;
    if (done.has(item.attemptId)) { counts.skipped++; continue; }
    const prior = state?.attempts.get(item.attemptId);
    if (prior && state.calls.some(c => c.attemptId === item.attemptId)) { // a provider call may have been paid for: never dispatch it again, record what is known
      const row = await reconcileInterrupted({ store, prior, state, wall, type });
      done.set(item.attemptId, row); counts.reconciled++; continue;
    }
    done.set(item.attemptId, await runAttempt({ item, corpus, config, store, clock, wall, runId, type, timeoutMs, evaluator, hooks, providerFactory }));
    counts.ran++;
  }

  const rows = applyCorrections([...done.values()], await store.readCorrections());
  const summary = summarize(rows), calibration = calibrationSummary(rows);
  const finished = { ...manifest, status: 'complete', endedAt: wall().toISOString(), counts, redactions: redactCount() };
  await store.writeManifest(finished);
  await store.appendIndex?.(finished);
  await store.writeDerived({ summaryCsv: summaryCsv(summary), reportMd: reportMarkdown({ manifest: finished, summary, rows, plan: o.mode === 'dry' ? plan : null, calibration }) });
  return { runId, manifest: finished, rows, summary, calibration, counts, plan };
}

async function runAttempt({ item, corpus, config, store, clock, wall, runId, type, timeoutMs, evaluator, hooks, providerFactory }) {
  const c = caseOf(corpus, item.caseId), base = baseOf(corpus, c), profile = item.profile;
  const input = authorInput(base), prepared = prepareArtifactAuthorRequest({}, input, { profile });
  const snapshot = { requestHash: (await hashOf(prepared.body)).slice(0, 16), model: prepared.model, repairModel: prepared.repairModel, max_tokens: prepared.body.max_tokens, tool_choice: prepared.body.tool_choice,
    system: { sha: (await hashOf(prepared.body.system)).slice(0, 16), chars: prepared.body.system.length }, tools: { sha: (await hashOf(prepared.body.tools)).slice(0, 16), names: prepared.body.tools.map(t => t.name) }, messages: prepared.body.messages,
    note: 'the system prompt and tool text are identified by hash and prompt/schema versions in the manifest, not repeated per attempt' };
  const record = { schemaVersion: BENCHMARK_SCHEMA_VERSION, runId, attemptId: item.attemptId, kind: item.kind, caseId: c.id, baseCaseId: base.id, trial: item.trial, depth: base.depth, entry: base.entry, promptLabel: base.promptLabel,
    profile: { ...item.binding, roles: profile.roles }, request: snapshot, visualRequirements: input.visualRequirements ?? null, status: 'pending', createdAt: wall().toISOString() };
  await store.beginAttempt(item.attemptId, record); // identity first, before any dispatch

  const callsMade = [], events = [];
  const provider = model => { const behavior = config.behaviors?.[model] ?? config.behaviors?.['*'] ?? {}; return providerFactory({ replies: corpus.fixtures[base.id], behavior, script: c.kind === 'calibration' ? c.script : behavior.overrides?.[c.id], clock, timeoutMs }); };
  const providers = new Map();
  const traced = async (env, body, model, org) => {
    const role = body.messages.length > 1 ? 'repair' : 'author', cfg = profile.roles[role];
    const callId = `${item.attemptId}.c${callsMade.length + 1}`;
    if (!providers.has(model)) providers.set(model, provider(model));
    const open = { runId, attemptId: item.attemptId, caseId: c.id, callId, role, category: 'generation', requested: { provider: cfg.provider, model }, attempt: callsMade.length + 1, startedAt: wall().toISOString(), startedMs: clock.now() };
    await store.appendCall({ ...open, state: 'dispatched' }); // call identity persisted BEFORE dispatch
    await hooks.afterDispatch?.(open);
    let response, thrown = null;
    try { response = await providers.get(model)(env, body, model, org); } catch (error) { thrown = error; }
    const endedMs = clock.now(), timedOut = !thrown && endedMs - open.startedMs > timeoutMs;
    let raw = null; if (!thrown && !timedOut && response.ok) raw = await response.clone().json().catch(() => null);
    const n = normalizeProviderResult('anthropic', raw, { provider: cfg.provider, model, attempt: open.attempt, startedMs: open.startedMs, endedMs, tool: 'make_explanation', timedOut, httpStatus: thrown || timedOut ? null : response.status });
    const settled = { ...open, state: 'settled', endedAt: wall().toISOString(), durationMs: endedMs - open.startedMs, served: n.served, stop: n.stop, error: thrown ? { class: 'provider_exception', message: String(thrown.message).slice(0, 300) } : n.error,
      usage: n.usage, cost: costOf(n.usage, cfg, config), cache: 'miss', cancellation: timedOut ? 'abandoned: provider may still have used tokens, usage unknown' : 'none', normalizedOutput: n.output };
    callsMade.push(settled);
    await store.appendCall({ ...settled, normalizedOutput: undefined });
    if (thrown instanceof InterruptRun) throw thrown;
    if (thrown) throw thrown;
    if (timedOut) throw new TimedOut(timeoutMs);
    return response;
  };

  const startMs = clock.now();
  let out = null, thrown = null;
  try { out = await captureInvalid(events, () => generateArtifact({}, input, { callModel: traced, profile })); } catch (error) { if (error instanceof InterruptRun) throw error; thrown = error; }
  const totalMs = clock.now() - startMs;

  const failure = thrown ? classifyThrown(thrown) : out.result === 'artifact' ? null : { stage: out.result === 'validation_error' ? 'validation' : out.result, reason: out.error || out.message || out.question || out.result };
  const block = failure ? null : out.block;
  const rubric = rubricOf(corpus, c);
  const { evaluation, calls: evalCalls } = await evaluator.evaluate({ block, rubric, failureReason: failure?.reason, attempt: record });
  for (const [i, call] of evalCalls.entries()) await store.appendCall({ runId, attemptId: item.attemptId, caseId: c.id, callId: `${item.attemptId}.e${i + 1}`, state: 'settled', ...call });
  const calibration = c.kind === 'calibration' ? calibrationVerdict(evaluation.flags, corpus.rubrics[c.id].calibration) : null;

  const ms = role => callsMade.filter(x => x.role === role).reduce((n, x) => n + x.durationMs, 0);
  const row = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION, runId, evidenceClass: type, attemptId: item.attemptId, kind: item.kind, caseId: c.id, trial: item.trial, depth: base.depth, entry: base.entry, promptLabel: base.promptLabel, heldOut: !!base.heldOut,
    profile: item.binding, roles: { author: { provider: profile.roles.author.provider, model: profile.roles.author.model }, repair: { provider: profile.roles.repair.provider, model: profile.roles.repair.model } }, cache: 'miss',
    requested: callsMade.map(x => x.requested), served: [...new Set(callsMade.map(x => x.served?.model ?? null))], servedProvider: 'fixture-double',
    status: failure ? 'failed' : 'success', failureStage: failure?.stage ?? null, failureReason: failure?.reason?.slice(0, 400) ?? null, repaired: !!out?.repaired || callsMade.some(x => x.role === 'repair'), calls: callsMade.length,
    factualPass: evaluation.factualPass, requiredOutputPass: evaluation.requiredOutputPass, majorErrors: evaluation.majorErrors, minorErrors: evaluation.minorErrors, omissions: evaluation.omissions, checks: evaluation.checks, flags: evaluation.flags,
    timings: { usableCardMs: failure ? null : totalMs, totalMs, authorMs: ms('author'), repairMs: callsMade.some(x => x.role === 'repair') ? ms('repair') : null, validateMs: totalMs - ms('author') - ms('repair') },
    usage: { input: sumField(callsMade, 'input'), output: sumField(callsMade, 'output'), cache: sumField(callsMade, 'cache'), reasoning: sumField(callsMade, 'reasoning'), complete: callsMade.length > 0 && callsMade.every(x => x.usage.input != null && x.usage.output != null) },
    cost: callsMade.length ? sumCost(callsMade) : { usd: null, known: false }, evaluatorCost: { ...sumCost(evalCalls), calls: evalCalls.length }, calibration,
    artifactRef: `attempts/${item.attemptId}/`, evaluationRef: `attempts/${item.attemptId}/evaluation.json`,
  };
  await store.writeAttemptFile(item.attemptId, 'output.json', { status: row.status, failure, result: out ? { result: out.result, repaired: out.repaired ?? false, profile: out.profile ?? null } : null, block, normalizedCalls: callsMade.map(x => ({ callId: x.callId, role: x.role, requested: x.requested, served: x.served, stop: x.stop, error: x.error, usage: x.usage, output: x.normalizedOutput })) });
  await store.writeAttemptFile(item.attemptId, 'validation.json', { visualRequirements: input.visualRequirements ?? null, refusedAttempts: events, finalChecks: evaluation.checks, calibration });
  await store.writeAttemptFile(item.attemptId, 'evaluation.json', { ...evaluation, blind: 'provider identity is not given to the deterministic evaluator', reviewRequired: !!rubric.reviewRequired });
  await hooks.beforeResult?.(item.attemptId);
  await store.appendResult(row);
  await store.writeAttemptFile(item.attemptId, 'attempt.json', { ...record, status: 'done', finishedAt: wall().toISOString(), callIds: callsMade.map(x => x.callId) });
  return row;
}

function classifyThrown(error) {
  const message = String(error?.message ?? error);
  if (error?.code === 'benchmark_timeout') return { stage: 'timeout', reason: message };
  if (/model HTTP \d+/.test(message) || /unavailable/i.test(message)) return { stage: 'provider_error', reason: message };
  if (/returned no artifact/.test(message)) return { stage: 'refusal', reason: message };
  return { stage: 'error', reason: message };
}

// A pending attempt that already dispatched a call is not dispatched again: its calls are marked unknown and the attempt is recorded as a failed, interrupted row.
async function reconcileInterrupted({ store, prior, state, wall, type }) {
  const open = state.calls.filter(c => c.attemptId === prior.attemptId);
  const last = new Map(open.map(c => [c.callId, c]));
  for (const call of last.values()) if (call.state === 'dispatched') await store.appendCall({ ...call, state: 'reconciled', endedAt: wall().toISOString(), error: { class: 'interrupted', message: 'The run stopped before this call settled; its outcome and usage are unknown and it was not re-dispatched.' }, usage: { input: null, output: null, cache: null, reasoning: null }, cost: { usd: null, known: false } });
  const row = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION, runId: prior.runId, evidenceClass: type, attemptId: prior.attemptId, kind: prior.kind, caseId: prior.caseId, trial: prior.trial, depth: prior.depth, entry: prior.entry, promptLabel: prior.promptLabel, heldOut: false,
    profile: { id: prior.profile.id, version: prior.profile.version, hash: prior.profile.hash }, roles: { author: { provider: prior.profile.roles.author.provider, model: prior.profile.roles.author.model }, repair: { provider: prior.profile.roles.repair.provider, model: prior.profile.roles.repair.model } },
    cache: 'miss', requested: [...last.values()].map(c => c.requested), served: [], servedProvider: 'fixture-double', status: 'failed', failureStage: 'interrupted', failureReason: 'The run stopped mid-attempt; reconciled on resume without a second dispatch.', repaired: false, calls: last.size,
    factualPass: false, requiredOutputPass: false, majorErrors: 0, minorErrors: 0, omissions: 0, checks: [], flags: ['no_card', 'interrupted'], timings: { usableCardMs: null, totalMs: null, authorMs: null, repairMs: null, validateMs: null },
    usage: { input: null, output: null, cache: null, reasoning: null, complete: false }, cost: { usd: null, known: false }, evaluatorCost: { usd: 0, known: true, calls: 0 }, calibration: null, artifactRef: `attempts/${prior.attemptId}/`, evaluationRef: null,
  };
  await store.appendResult(row);
  await store.writeAttemptFile(prior.attemptId, 'attempt.json', { ...prior, status: 'interrupted', reconciledAt: wall().toISOString() });
  return row;
}

// A correction never edits results.jsonl: it is a separate record (original kept, reason required) that derived files apply on top.
export function applyCorrections(rows, corrections) {
  const patches = new Map();
  for (const c of corrections || []) patches.set(c.attemptId, [...(patches.get(c.attemptId) ?? []), c]);
  return rows.map(r => (patches.has(r.attemptId) ? { ...patches.get(r.attemptId).reduce((acc, c) => ({ ...acc, ...c.patch }), r), corrected: true } : r));
}
export function makeCorrection({ attemptId, patch, reason, original, at }) {
  if (!String(reason ?? '').trim()) throw new BenchmarkError('correction_needs_reason', 'A correction must say why.');
  return { attemptId, patch, reason: String(reason).trim(), at, original };
}
