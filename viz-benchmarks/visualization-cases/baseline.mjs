// EXP-T02 baseline: the CURRENT /explain system (learn-artifact.js generateArtifact, its prompts, gates, verifier and
// the AnimatedScene renderer), frozen by file hash before any /explain component change, run on corpus cases.
// Modes (plan section 6): generate vs render-existing; prompt-only vs reference-guided. Prompt-only receives only the
// case's learner prompt: no pixels, no family facts. Reference-guided adds the reference image as an image block on the
// artifact path's existing input.documents channel (learn-artifact.js) with a declared role.
// Every model call goes through a recording transport: request (images redacted to hash/bytes), requested/served model,
// request id, usage, cost from the repo's price table, and a hard budget cap checked BEFORE each call.
//
//   node baseline.mjs freeze
//   node baseline.mjs generate <caseId> <prompt-only|reference-guided> <runId> --cap-usd <n>   (paid; plan in spend.md first)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, sha256 } from './cases.mjs';

const REPO = join(HERE, '..', '..');
// The system under test. A change to any of these after freezing refuses further baseline runs.
export const SYSTEM_FILES = [
  'packages/control-plane/src/learn-artifact.js', 'packages/control-plane/src/agents/learn-artifact.js',
  'packages/control-plane/src/agents/learn-scene-author.js', 'packages/control-plane/src/agents/learn-scene-verify.js',
  'packages/control-plane/src/learn-scene-gates.js', 'packages/control-plane/src/learn-primitives.js',
  'packages/control-plane/src/learn-models.js', 'packages/web/src/agent/slash.js', 'packages/web/src/animation-scene.js',
  'packages/web/src/AnimatedScene.jsx', 'packages/web/src/scene-layout.js', 'packages/web/src/scene-style.js',
  'packages/web/render/render-scene.jsx', 'packages/control-plane/src/explain-render.js',
];
// Committed text hashes the same on every checkout (CRLF vs LF never changes behaviour).
const fileHash = rel => createHash('sha256').update(readFileSync(join(REPO, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
export const systemHashes = () => Object.fromEntries(SYSTEM_FILES.map(f => [f, fileHash(f)]));
const BASELINE = join(HERE, 'baseline.json');

export async function freeze({ now = new Date().toISOString(), path = BASELINE } = {}) {
  const { LEARN_TASKS, ARTIFACT_REPAIRS } = await import('../../packages/control-plane/src/learn-models.js');
  const git = args => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
  const record = {
    schema: 1, frozenAt: now, systemSha: git(['merge-base', 'HEAD', 'rabbit-hole/main']),
    modelPolicy: { role: 'artifact', ...LEARN_TASKS.artifact, repairs: ARTIFACT_REPAIRS, verifier: 'on (LEARN_SCENE_VERIFIER unset)', command: '/explain' },
    renderer: 'packages/web/render/scene.html via explain-render.js renderStates (e2e/viz-benchmark-capture.mjs locally)',
    files: systemHashes(),
    disclosure: 'Historical providers are not replayed: this is the system at systemSha with whatever model the provider serves for the requested id today; served ids are recorded per call.',
  };
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function assertFrozen(path = BASELINE) {
  if (!existsSync(path)) throw new Error('baseline not frozen: run `node baseline.mjs freeze` first');
  const frozen = JSON.parse(readFileSync(path, 'utf8'));
  const changed = Object.entries(frozen.files).filter(([f, h]) => fileHash(f) !== h).map(([f]) => f);
  if (changed.length) throw new Error(`baseline system changed since freezing: ${changed.join(', ')}`);
  return frozen;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const redact = body => JSON.parse(JSON.stringify(body, (key, value) => (value?.type === 'base64' && typeof value.data === 'string'
  ? { type: 'base64', media_type: value.media_type, redacted: true, sha256: sha256(Buffer.from(value.data, 'base64')), bytes: Buffer.from(value.data, 'base64').length } : value)));
const stageOf = body => (body.tools || []).some(t => t.name === 'report_check') ? 'verify'
  : (body.messages || []).some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result')) ? 'repair' : 'author';

// Wraps a transport (body, model) => Response with recording and a pre-call budget check.
// prices: { model: [inUsdPerMTok, outUsdPerMTok] }; worst case = whole request text as tokens + max_tokens out.
export function recordingModel(transport, { capUsd, prices, ledger = { calls: [], spentUsd: 0, unknownCost: false } }) {
  const price = (model, usage) => (prices[model] && usage ? ((usage.input_tokens || 0) * prices[model][0] + (usage.output_tokens || 0) * prices[model][1]
    + (usage.cache_creation_input_tokens || 0) * prices[model][0] * 1.25 + (usage.cache_read_input_tokens || 0) * (prices[model][2] ?? prices[model][0] / 10)) / 1e6 : null);
  const callModel = async (_env, body, model) => {
    const p = prices[model];
    const worst = p ? (JSON.stringify(redact(body)).length / 3 * p[0] + (body.max_tokens || 0) * p[1]) / 1e6 + 0.01 * countImages(body) : Infinity;
    if (ledger.spentUsd + worst > capUsd) {
      ledger.calls.push({ stage: stageOf(body), requestedModel: model, outcome: 'refused_budget', worstCaseUsd: +worst.toFixed(4) });
      return Response.json({ code: 'spend_limited', error: `Baseline budget cap $${capUsd} reached before this call` }, { status: 429 });
    }
    const started = Date.now();
    const response = await transport(body, model);
    const json = await response.clone().json().catch(() => null);
    const cost = price(json?.model || model, json?.usage);
    if (cost == null) ledger.unknownCost = true;
    ledger.spentUsd += cost ?? worst;
    ledger.calls.push({ stage: stageOf(body), requestedModel: model, servedModel: json?.model ?? null, requestId: response.headers.get('request-id'), status: response.status,
      usage: json?.usage ?? null, images: countImages(body), costUsd: cost, ms: Date.now() - started, request: redact(body), stopReason: json?.stop_reason ?? null });
    return response;
  };
  return { callModel, ledger };
}
const countImages = body => JSON.stringify(body).split('"type":"image"').length - 1;

// The case input for a mode: prompt-only gets the learner prompt only; reference-guided adds the pixels and a declared role.
export function caseInput(caseRecord, inputMode, casesRoot = HERE) {
  const input = { command: 'explain', args: caseRecord.prompt, selection: null, context: null };
  if (inputMode === 'prompt-only') return input;
  if (inputMode !== 'reference-guided') throw new Error(`unknown input mode ${inputMode}`);
  const file = join(casesRoot, 'cases', caseRecord.id, caseRecord.reference.file);
  const bytes = readFileSync(file);
  if (sha256(bytes) !== caseRecord.reference.sha256) throw new Error('reference bytes do not match the manifest hash');
  return { ...input, context: 'The attached image is a reference diagram the learner supplied for this request.',
    documents: [{ type: 'image', source: { type: 'base64', media_type: MIME[extname(file).toLowerCase()], data: bytes.toString('base64') } }] };
}

// One generate attempt. Returns { prompt, outcome, scene|null, result, ledger }; the caller renders and records it.
export async function generateCase(caseRecord, inputMode, { transport, capUsd, prices, casesRoot = HERE, frozen = assertFrozen(), env = {} }) {
  if (!caseRecord.generationReady) throw new Error(`${caseRecord.id}: family/split not assigned`);
  const { generateArtifact } = await import('../../packages/control-plane/src/learn-artifact.js');
  const { callModel, ledger } = recordingModel(transport, { capUsd, prices });
  const input = caseInput(caseRecord, inputMode, casesRoot);
  const started = Date.now();
  let result, error = null;
  try { result = await generateArtifact(env, input, { callModel }); } catch (problem) { error = problem.message; }
  const prompt = {
    schema: 1, caseId: caseRecord.id, family: caseRecord.family, split: caseRecord.split, mode: 'generate', inputMode,
    learnerPrompt: caseRecord.prompt, command: '/explain', systemSha: frozen.systemSha, modelPolicy: frozen.modelPolicy, files: frozen.files,
    referenceImage: inputMode === 'reference-guided' ? { sha256: caseRecord.reference.sha256, role: 'reference diagram supplied by the learner' } : null,
    examples: [], stageCalls: ledger.calls, redactions: 'image bytes replaced by sha256 + byte count', elapsedMs: Date.now() - started,
  };
  const scene = result?.block?.scene || null;
  const outcome = error ? `error: ${error}` : result?.result === 'artifact' && scene ? 'scene' : result?.result || 'unknown';
  return { prompt, outcome, scene, result: result || null, ledger };
}

// Direct Anthropic transport for a dev-only baseline run (the app path adds spend admission; this adds the cap above).
export const anthropicTransport = keys => (body, model) => fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': keys.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(keys.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': keys.ANTHROPIC_WORKSPACE_ID } : {}) },
  body: JSON.stringify({ ...body, model }),
});

// Reads only the named keys from the canonical credentials file; values are never printed.
export function readKeys(names, file = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env') {
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && names.includes(m[1])) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'freeze') console.log(JSON.stringify(await freeze(), null, 2));
  else if (cmd === 'generate') {
    const [caseId, inputMode, runId] = rest;
    const cap = Number(rest[rest.indexOf('--cap-usd') + 1]);
    if (!caseId || !inputMode || !runId || !(cap > 0)) { console.error('usage: node baseline.mjs generate <caseId> <inputMode> <runId> --cap-usd <n>'); process.exit(1); }
    const { MODEL_PRICES } = await import('../../packages/control-plane/src/learn-models.js');
    const prices = { ...MODEL_PRICES, 'claude-opus-5': [5, 25, 0.5] }; // learn-spend.js price table (the artifact role's model)
    const record = JSON.parse(readFileSync(join(HERE, 'cases', caseId, 'case.json'), 'utf8'));
    const keys = readKeys(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID']);
    if (!keys.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing from the credentials file'); process.exit(1); }
    const out = await generateCase(record, inputMode, { transport: anthropicTransport(keys), capUsd: cap, prices });
    const pending = join(HERE, 'cases', caseId, 'generated', 'pending', `${runId}.json`);
    if (existsSync(pending)) throw new Error(`pending ${runId} exists`);
    mkdirSync(dirname(pending), { recursive: true });
    writeFileSync(pending, `${JSON.stringify(out, null, 2)}\n`);
    console.log(JSON.stringify({ caseId, runId, outcome: out.outcome, spentUsd: +out.ledger.spentUsd.toFixed(4), unknownCost: out.ledger.unknownCost, calls: out.ledger.calls.map(c => ({ stage: c.stage, requested: c.requestedModel, served: c.servedModel, status: c.status, usage: c.usage, costUsd: c.costUsd, outcome: c.outcome })) }, null, 2));
  } else { console.error('usage: node baseline.mjs freeze | generate <caseId> <inputMode> <runId> --cap-usd <n>'); process.exit(1); }
}
