#!/usr/bin/env node
// tests/evals/explain-back/run.mjs
// Explain-back assessment quality evaluation (plan 2026-10-30-explain-back.md section 12, "Quality fixtures"). Each case in
// cases.json is saved and assessed through the real path: card binding, private assets, POST /api/learn/tutor/attempts,
// claim/commit, spend admission and learn-explain-assessment.js, on an in-memory node:sqlite LEARN_DB. Only the evaluator
// transport changes:
//   default (dry run)  no provider call. A stand-in evaluator captures each request and reports the token usage that
//                      request is estimated to cost, so the spend ledger prints the estimated cost, case by case.
//   --live --max-usd N one real Opus 5.5 call per case (tutor_rubric, or tutor_visual with a Sketch), ANTHROPIC_API_KEY read by
//                      name from small-deploy/.env and never printed. N (at most 10) is both the platform daily cap the
//                      spend admission enforces and a runner bound: a case is not started when the spend so far plus that
//                      case's maximum cost would pass N. Each case's actual cost comes from the spend ledger.
// Transcripts are fixed text (no transcription call): speech recognition is not evaluated. A wrong-prior case's parent review
// is written with a fixed stand-in reply, so it costs nothing.
//   node tests/evals/explain-back/run.mjs [--only id,id] [--out file.json]
//   node tests/evals/explain-back/run.mjs --live --max-usd 3 [--only id,id]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { ANA, call, submit, world } from '../../../packages/control-plane/test/learn-attempt-fixture.js';
import { explainEvidenceFixture } from '../../../packages/control-plane/test/learn-explain-evidence-fixture.js';
import { bindExplainBackCard } from '../../../packages/control-plane/src/learn-attempt-store.js';
import { putAttemptAsset } from '../../../packages/control-plane/src/learn-attempt-assets.js';
import { LEARN_TASKS, costUsd, loggedModel } from '../../../packages/control-plane/src/learn-models.js';
import { anthropic } from '../../../packages/control-plane/src/ask.js';
import { noteUsageIdentity, usageFeature, withUsage } from '../../../packages/control-plane/src/learn-usage.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
export const CASES = JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8'));
export const MAX_USD_LIMIT = 10; // the shared Explain-back acceptance cap; a run never asks for more
export const OUTPUT_TOKENS_ESTIMATE = 1200; // a typical JSON review of 2 criteria with feedback; the cap is the role's maxTokens
const MODEL = LEARN_TASKS.tutor_rubric.model;
const ATTEMPTS = '/api/learn/tutor/attempts';
const ACCESS_EMAIL = `${ANA.userId}@test`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const idOf = idea => `k_${sha(idea).slice(0, 16)}`;

// ---- a tiny grayscale PNG for the Sketch cases (circle, dots, arrows; labels travel as the capture's text) ----------------
// Letters drawn into the image, so a label is visible where the learner wrote it (5 x 7 cells, scaled 3x).
const GLYPHS = { F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'], v: ['00000', '00000', '10001', '10001', '10001', '01010', '00100'] };
export function sketchPng({ width, height, circle = null, dots = [], arrows = [], texts = [] }) {
  const px = new Uint8Array(width * height).fill(255);
  const set = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < width && y < height) px[y * width + x] = 0; };
  const line = (x1, y1, x2, y2) => { const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1); for (let i = 0; i <= n; i++) for (const d of [-1, 0, 1]) { set(x1 + ((x2 - x1) * i) / n + d, y1 + ((y2 - y1) * i) / n); set(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n + d); } };
  if (circle) { const [cx, cy, r] = circle; for (let a = 0; a < 720; a++) set(cx + r * Math.cos((a * Math.PI) / 360), cy + r * Math.sin((a * Math.PI) / 360)); }
  for (const [x, y] of dots) for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) if (dx * dx + dy * dy <= 16) set(x + dx, y + dy);
  for (const [x1, y1, x2, y2] of arrows) {
    line(x1, y1, x2, y2);
    const a = Math.atan2(y2 - y1, x2 - x1);
    for (const s of [-0.5, 0.5]) line(x2, y2, x2 - 14 * Math.cos(a + s), y2 - 14 * Math.sin(a + s));
  }
  for (const [x, y, word] of texts) [...word].forEach((ch, n) => (GLYPHS[ch] || []).forEach((row, r) => [...row].forEach((bit, k) => {
    if (bit === '1') for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) set(x + n * 18 + k * 3 + a, y + r * 3 + b);
  })));
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) { rows[y * (width + 1)] = 0; Buffer.from(px.buffer, y * width, width).copy(rows, y * (width + 1) + 1); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

// A Sketch recording timeline as M's recorder stores it (web/src/sketch-recording.js): a starting circle, then each step.
function timelineOf({ durationMs, steps }) {
  const start = { strokes: [], shapes: [{ kind: 'ellipse', x1: 80, y1: 40, x2: 240, y2: 200 }], items: [] };
  let count = 1;
  const ops = steps.map(s => { const keep = s.replace ? count - 1 : count; count = keep + 1; return { t: s.t, k: 'shapes', keep, add: [s.add ?? s.replace] }; });
  return { v: 1, kind: 'sketch-timeline', startedAt: '2026-10-30T00:00:00.000Z', durationMs, limitMs: 120000, narration: true, start, ops, pauses: [] };
}

// Fixed transcripts: an in-memory store and a transcriber that returns the case's text (no speech recognition).
const mapStore = () => { const m = new Map(); return { get: async id => m.get(id) ?? null, put: async r => { m.set(r.transcriptId, r); return r; } }; };
const fixedTranscriber = byHash => ({ provider: 'fixture', model: 'fixed-transcript', transcribe: async ({ bytes }) => byHash.get(sha(bytes)) });
const AUDIO_HEAD = [...'OggS'].map(c => c.charCodeAt(0));
const audioFor = text => new Uint8Array([...AUDIO_HEAD, ...new TextEncoder().encode(text).subarray(0, 64)]); // distinct bytes per case
const heardOf = ({ transcript, text, segments, lowConfidence = [] }) => ({
  text: transcript ?? text,
  ...(segments ? { segments: segments.map(g => ({ start: g.startMs / 1000, end: g.endMs / 1000, text: g.text })) } : {}),
  ...(lowConfidence.length ? { logprobs: lowConfidence.map(w => ({ token: w.text, logprob: Math.log(w.p) })) } : {}),
});

// A stand-in evaluator: records each request; reports usage (estimated tokens) so the ledger shows the estimated cost; the
// reply is a fixed text, so only the request and the ledger are meaningful in a dry run.
export const estimateInputTokens = body => {
  const content = body.messages[0].content;
  const text = String(body.system ?? '') + (typeof content === 'string' ? content : content.filter(b => b.type === 'text').map(b => b.text).join(''));
  const images = typeof content === 'string' ? [] : content.filter(b => b.type === 'image');
  // ~3.5 characters a token for this JSON-heavy prompt; an image of w x h pixels is about w*h/750 tokens.
  return Math.ceil(text.length / 3.5) + images.reduce((n, b) => n + Math.ceil(imageArea(b) / 750), 0);
};
function imageArea(block) {
  const bytes = Buffer.from(block.source.data, 'base64');
  return bytes.readUInt32BE(16) * bytes.readUInt32BE(20); // a PNG's IHDR width x height
}
// free: a fixed setup reply (a wrong-prior parent), reported as costing nothing so it never counts against the cap.
export function standIn(reply = { criteria: [] }, { free = false } = {}) {
  const calls = [];
  const callModel = async (_env, body, model) => {
    const input = estimateInputTokens(body);
    calls.push({ body, model, input });
    return Response.json({ model, usage: free ? { input_tokens: 0, output_tokens: 0 } : { input_tokens: input, output_tokens: OUTPUT_TOKENS_ESTIMATE }, content: [{ type: 'text', text: JSON.stringify(reply) }] });
  };
  return { calls, callModel };
}
// The parent review of a wrong-prior case, as a fixed evaluator reply naming ideas by key.
const replyOf = (review, ideas) => ({
  ...review,
  criteria: review.criteria.map(({ idea, ...c }) => ({ criterionId: idOf(ideas[idea]), version: 1, alternative: false, uncertain: false, question: null, ...c })),
  feedback: { ...review.feedback, revisit: review.feedback.revisit && { ...review.feedback.revisit, criterionId: idOf(ideas[review.feedback.revisit.idea]), version: 1 } },
});

// ---- one shared world: one in-memory LEARN_DB and spend ledger across the run ------------------------------------------
export function evalWorld({ live = false, maxUsd = MAX_USD_LIMIT, secrets = {} } = {}) {
  const LEARN_MEDIA = (() => { const o = new Map(); return { put: async (k, b) => { o.set(k, new Uint8Array(typeof b === 'string' ? new TextEncoder().encode(b) : b)); }, get: async k => (o.has(k) ? { body: o.get(k).slice(), size: o.get(k).byteLength } : null) }; })();
  const w = world({ after: () => {} }, {
    LEARN_MEDIA, TUTOR_EXPLAIN_BACK_ENABLED: 'true',
    // Spend enforced as in production: the platform daily cap is this run's cap; assessment is a free (platform-funded) feature.
    SMALL_ENV: 'dev', USAGE_PLATFORM_DAY_USD: String(maxUsd), AI_MONTHLY_ALLOWANCE_USD: '25',
    ...(live ? { ANTHROPIC_API_KEY: secrets.ANTHROPIC_API_KEY, ...(secrets.ANTHROPIC_WORKSPACE_ID ? { ANTHROPIC_WORKSPACE_ID: secrets.ANTHROPIC_WORKSPACE_ID } : {}) } : {}),
  });
  const env = withUsage(w.env, { feature: usageFeature('POST', ATTEMPTS) });
  noteUsageIdentity(env, { userId: ANA.userId, email: ACCESS_EMAIL });
  return { ...w, env };
}
const spentMicros = w => w.sqlite.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS c FROM usage_attempts WHERE status = 'settled'").get().c;
// The most one case can cost: a generous input bound (the largest dry-run request is under 2,000 tokens) and the role's whole
// output allowance.
export const WORST_CASE_USD = costUsd({ model: MODEL, input_tokens: 20000, output_tokens: LEARN_TASKS.tutor_rubric.maxTokens });

// Build one case's answer: bind its card, store its private media, and return the content and the deps the path needs.
async function prepare(w, c, card) {
  const ideas = card.ideas, bound = await bindExplainBackCard(w.env, ANA, { cardId: `eval_${c.id}`, prompt: card.prompt, expects: Object.values(ideas) });
  const activity = { activityId: bound.activityId, revision: bound.activityRevision };
  const heard = new Map(), deps = { transcriptStore: mapStore(), transcriber: fixedTranscriber(heard) };
  const note = async (spoken, evidenceId) => {
    const bytes = audioFor(spoken.transcript ?? spoken.text);
    heard.set(sha(bytes), heardOf(spoken));
    const a = await putAttemptAsset(w.env, ANA, { bytes, mime: 'audio/ogg', durationMs: 20000 });
    return { evidenceId, role: 'voice', media: 'audio', state: 'ready', assetId: a.assetId, revision: 1, hash: a.sha256, mime: a.mime, bytes: a.bytes, durationMs: 20000 };
  };
  const answerOf = async a => {
    const out = { v: 1, kind: 'explain_back', text: a.text ?? '', voice: [], resources: [], assistance: [] };
    if (a.voice) out.voice.push(await note(a.voice, 'ev_voice_1'));
    if (a.sketch) {
      const img = await putAttemptAsset(w.env, ANA, { bytes: sketchPng(a.sketch), mime: 'image/png', marks: a.sketch.marks, text: a.sketch.labels });
      out.sketch = { evidenceId: 'ev_sketch_1', role: 'sketch', media: 'image', state: 'ready', assetId: img.assetId, revision: 1, hash: img.sha256, mime: img.mime, bytes: img.bytes };
    }
    if (a.recording) {
      const tl = await putAttemptAsset(w.env, ANA, { bytes: new TextEncoder().encode(JSON.stringify(timelineOf(a.recording))), mime: 'application/json' });
      out.recording = { evidenceId: 'ev_rec_1', role: 'recording', media: 'sketch_timeline', state: 'ready', assetId: tl.assetId, revision: 1, hash: tl.sha256, mime: tl.mime, bytes: tl.bytes, durationMs: a.recording.durationMs, narration: await note(a.recording.narration, 'ev_narration_1') };
    }
    if (a.resources === 'pdf-page-2') {
      const fx = await explainEvidenceFixture();
      out.resources = fx.answer.resources.filter(r => r.sourceKind === 'file' && r.scope?.pages);
      deps.evidenceDeps = fx.deps;
    }
    return out;
  };
  return { ideas, activity, deps, answerOf };
}

// Score one review against the case's expectations. -> {pass, checks: [{what, ok, got, want}]}
export function score(c, card, review) {
  const checks = [];
  const judged = id => review?.judgments?.find(j => j.criterionId === idOf(card.ideas[id]));
  for (const [idea, allowed] of Object.entries(c.expect.judgments ?? {})) checks.push({ what: `judgment ${idea}`, ok: allowed.includes(judged(idea)?.judgment), got: judged(idea)?.judgment ?? null, want: allowed });
  for (const idea of c.expect.question ?? []) checks.push({ what: `question ${idea}`, ok: !!judged(idea)?.question, got: judged(idea)?.question ?? null, want: 'a clarification question' });
  if (c.expect.coverage?.voice) checks.push({ what: 'coverage voice', ok: review?.coverage?.some(x => x.evidenceId === 'ev_voice_1' && x.inspected?.transcriptOnly === true), got: review?.coverage ?? null, want: 'transcript-only' });
  for (const [idea, allowed] of Object.entries(c.expect.comparison ?? {})) {
    const item = review?.comparison?.items?.find(i => i.criterionId === idOf(card.ideas[idea]));
    checks.push({ what: `comparison ${idea}`, ok: allowed.includes(item?.change), got: item?.change ?? null, want: allowed });
  }
  const r = c.expect.rating, rating = review?.rating;
  if (r?.status) checks.push({ what: 'rating status', ok: rating?.status === r.status, got: rating?.status ?? null, want: r.status });
  if (r?.min != null) checks.push({ what: 'rating min', ok: rating?.score >= r.min, got: rating?.score ?? null, want: `>= ${r.min}` });
  if (r?.max != null) checks.push({ what: 'rating max', ok: rating?.score != null && rating.score <= r.max, got: rating?.score ?? null, want: `<= ${r.max}` });
  return { pass: checks.every(x => x.ok), checks };
}

/**
 * Run cases. live: real evaluator (callModel undefined -> the default admitted Opus transport). Stops before a case whose
 * maximum cost would pass maxUsd. -> {results, spentUsd, stopped}
 */
export async function runCases({ cases = CASES.cases, live = false, maxUsd = MAX_USD_LIMIT, secrets = {}, callModel = null, log = () => {} } = {}) {
  const w = evalWorld({ live, maxUsd, secrets });
  const results = [];
  let stopped = null;
  for (const c of cases) {
    const card = CASES.cards[c.card];
    const before = spentMicros(w);
    const { ideas, activity, deps, answerOf } = await prepare(w, c, card);
    const key = `eval-${c.id}`.slice(0, 64);
    let baseline;
    if (c.parent) {
      const parent = await submit(w.env, ANA, activity, { submissionKey: `${key}-parent`, submittedContent: await answerOf(c.parent.answer) }, { ...deps, callModel: standIn(replyOf(c.parent.review, ideas), { free: true }).callModel });
      baseline = { parentAttemptId: parent.body.attempt.attemptId, parentAssessmentId: parent.body.assessment.assessmentId };
    }
    const content = { ...(await answerOf(c.answer)), ...(baseline ? { baseline } : {}) };
    // Bound before spending: never start a case that could take the run past the cap.
    const spent = spentMicros(w) / 1e6;
    if (spent + WORST_CASE_USD > maxUsd) { stopped = { before: c.id, spentUsd: spent, worstNextUsd: WORST_CASE_USD }; break; }
    // Live: the default admitted transport, with each raw reply kept in the operator's results file (eval-live-1 lost the text of
    // an unreadable reply).
    const replies = [];
    const stub = live ? { calls: [], callModel: async (env, body, model, org) => { const res = await loggedModel('tutor_rubric', anthropic)(env, body, model, org); replies.push(await res.clone().json().then(m => (m.content || []).filter(b => b.type === 'text').map(b => b.text).join(String.fromCharCode(10))).catch(() => null)); return res; } }
      : callModel ? { callModel, calls: [] } : standIn();
    const r = await submit(w.env, ANA, activity, { submissionKey: key, submittedContent: content }, { ...deps, callModel: stub.callModel });
    const usd = (spentMicros(w) - before) / 1e6;
    const review = r.body.assessment?.provenance?.review ?? null;
    const sent = stub?.calls?.[0];
    const result = {
      id: c.id, what: c.what, status: r.body.assessment?.status ?? r.body.error, reason: r.body.assessment?.reason ?? null,
      costUsd: Number(usd.toFixed(6)), model: r.body.assessment?.provenance?.calls?.at(-1)?.servedModel ?? null,
      ...(sent ? { requestChars: JSON.stringify(sent.body).length, inputTokensEstimate: sent.input, images: Array.isArray(sent.body.messages[0].content) ? sent.body.messages[0].content.filter(b => b.type === 'image').length : 0 } : {}),
      ...(live ? { score: score(c, card, review), review, reply: replies.at(-1)?.slice(0, 20000) ?? null, provenance: review ? null : r.body.assessment?.provenance ?? null } : {}),
    };
    results.push(result);
    log(result);
  }
  return { results, spentUsd: spentMicros(w) / 1e6, stopped };
}

// ---- command line ------------------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const flag = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : null; };
  const live = args.includes('--live');
  const maxUsd = flag('--max-usd') == null ? null : Number(flag('--max-usd'));
  const only = flag('--only')?.split(',') ?? null;
  const out = flag('--out') || join(tmpdir(), `explain-back-eval-${live ? 'live' : 'dry'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const cases = CASES.cases.filter(c => !only || only.includes(c.id));
  if (only && cases.length !== only.length) { console.error(`unknown case in --only: ${only.filter(id => !CASES.cases.some(c => c.id === id)).join(', ')}`); process.exit(1); }
  let secrets = {};
  if (live) {
    if (!(maxUsd > 0 && maxUsd <= MAX_USD_LIMIT)) { console.error(`--live needs --max-usd N with 0 < N <= ${MAX_USD_LIMIT}`); process.exit(1); }
    const envFile = readFileSync(fileURLToPath(new URL('../../../../small-deploy/.env', import.meta.url)), 'utf8');
    const keyOf = name => envFile.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.replace(/^"|"$/g, '').trim() || null;
    secrets = { ANTHROPIC_API_KEY: keyOf('ANTHROPIC_API_KEY'), ANTHROPIC_WORKSPACE_ID: keyOf('ANTHROPIC_WORKSPACE_ID') };
    if (!secrets.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is required in small-deploy/.env'); process.exit(1); }
    console.log(`LIVE: ${cases.length} case(s), one ${MODEL} call each, cap ${maxUsd} USD`);
  } else {
    if (maxUsd != null) console.log('--max-usd is ignored without --live');
    console.log(`DRY RUN: ${cases.length} case(s), no provider call; costs are estimates (${OUTPUT_TOKENS_ESTIMATE} output tokens per call assumed)`);
  }
  const run = await runCases({
    cases, live, maxUsd: maxUsd ?? MAX_USD_LIMIT, secrets,
    log: r => console.log(`${r.id.padEnd(27)} ${live ? String(r.status).padEnd(11) : ''}${live ? (r.score.pass ? 'PASS' : 'FAIL') : `~${r.inputTokensEstimate} in`}  ${live ? '' : 'est '}${r.costUsd.toFixed(4)} USD${live && !r.score.pass ? `  ${r.score.checks.filter(x => !x.ok).map(x => `${x.what}: got ${JSON.stringify(x.got)}`).join('; ')}` : ''}`),
  });
  const worst = run.results.reduce((n, r) => n + (costUsd({ model: MODEL, input_tokens: r.inputTokensEstimate ?? 0, output_tokens: LEARN_TASKS.tutor_rubric.maxTokens }) ?? 0), 0);
  console.log(`${live ? 'Spent' : 'Estimated'}: ${run.spentUsd.toFixed(4)} USD${live ? '' : `; at most ${worst.toFixed(4)} USD if every reply used ${LEARN_TASKS.tutor_rubric.maxTokens} output tokens`}`);
  if (run.stopped) console.log(`Stopped before ${run.stopped.before}: ${run.stopped.spentUsd.toFixed(4)} USD spent + up to ${run.stopped.worstNextUsd.toFixed(4)} USD would pass the cap`);
  if (live) console.log(`Passed ${run.results.filter(r => r.score.pass).length}/${run.results.length}`);
  writeFileSync(out, JSON.stringify({ live, maxUsd, at: new Date().toISOString(), ...run }, null, 1));
  console.log(`Results: ${out}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
