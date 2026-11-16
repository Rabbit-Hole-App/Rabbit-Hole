// EXP-13 auto Recraft (docs/features/explain.md "Card layout v2", owner decision A1 as revised 2026-11-08): every rh-illustration fence of a new written Explanation
// is made with the IMG-01 Recraft adapter (image-providers.js, recraftv4_1_flash) inside the same /explain dispatch, before the card is saved and returned. Pictures run
// in parallel; each attempt is admitted and settled on the shared ledger (learn-spend-ledger.js) under the request's own usage context, so its cost is part of the
// /explain charge and never unpriced. A picture that cannot be made is retried up to twice (three attempts, same prompt); if it still fails, or cannot be made here at
// all (no board, image generation off, no RECRAFT_API_KEY, no price, a refused admission), its fence is removed from the body and no figure is stored: the learner
// never sees a failed picture. The failure is recorded only in the server log and the ledger. This module never throws to its caller.
//
// Saved shape (the web renders it; IllustrationFigure.jsx reads the same asset fields as block.illustration):
//   block.figures = { [fence id]: { status: 'ready', fileRef: { v: 1, source: { id, rev }, meta: { name, type, size } }, alt, caption, aspect: 1 } }
import { markdownIllustrations, withoutIllustrations } from './learn-primitives.js';
import { imageAdapter, imageCost, imageQuote, providerConfigured } from './image-providers.js';
import { imageAllowed } from './image-settings.js';
import { admitSpend, operationId, operationOf, settleSpend, spendEnforced } from './learn-spend-ledger.js';
import { settleAttempt, toMicros } from './learn-usage.js';
import { learnMedia } from './learn-storage.js';

export const FIGURE_MODEL = 'recraftv4_1_flash';
export const FIGURE_ATTEMPTS = 3; // owner 2026-11-08: the first try and up to two retries
export const FIGURES_MAX = 2; // at most two pictures a card, of up to three visuals (owner 2026-11-08; learn-primitives.js explanationLayoutProblem)
// Recraft measured 1.1-1.5 s per API call and 1.6-1.9 s to a visible picture, 5.0 s cold (C:/s/spec/latency-lab/recraft/run1.log): 20 s per attempt is generous.
export const FIGURE_TIMEOUT_MS = 20000;
const SETTINGS = Object.freeze({ model: FIGURE_MODEL, aspect_ratio: '1:1', resolution: '1K' });
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))].map(n => n.toString(16).padStart(2, '0')).join('');

// The quote one picture attempt is admitted at, or null when this deployment cannot price it (then no picture is made).
export const figureQuote = env => { const q = imageQuote(env, SETTINGS, 0, 0); return q.state === 'priced' ? q : null; };
// The most a card's pictures can reserve: two pictures, three attempts each (the Tutor step's hold includes it; roadmap-generate.js quoteRoadmapCard).
export const figuresBoundMicros = env => { const q = figureQuote(env); return q ? FIGURES_MAX * FIGURE_ATTEMPTS * toMicros(q.reserveUsd) : 0; };

// Why no picture can be made here, or null.
function unavailable(env, store) {
  if (!store?.org || !store?.email || !store?.app) return 'no_board';
  if (!imageAllowed(env, store.email)) return 'image_generation_off';
  if (!providerConfigured(env, FIGURE_MODEL)) return 'not_configured'; // no RECRAFT_API_KEY
  if (!env?.LEARN_DB || !learnMedia(env)) return 'storage_unavailable';
  if (!figureQuote(env)) return 'not_priced';
  return null;
}

// One attempt: admitted, sent, stored, settled. -> { figure } | { reason, retry }
async function attempt(env, spec, call, o) {
  const callEnv = o.scope ? await o.scope(env, call) : env;
  const op = operationOf(callEnv), quote = figureQuote(callEnv), db = callEnv.LEARN_DB;
  const opId = op?.opId || operationId('explain_illustration');
  let attemptId = null;
  if (spendEnforced(callEnv)) {
    const gate = await admitSpend(db, callEnv, { opId, userId: `provider:${o.store.org}`, org: o.store.org, category: 'explain_illustration', reservedUsd: quote.reserveUsd, kind: op?.kind || 'media',
      provider: 'recraft', model: FIGURE_MODEL, stable: !!op?.opId, allocation: op?.allocation || null });
    if (gate.refused) return { reason: `admission_${gate.reason}`, retry: false };
    attemptId = gate.attemptId;
  }
  const settle = async ({ status, calls, costUsd, chargedUsd = costUsd, error = null }) => {
    if (!attemptId) return;
    await settleSpend(db, opId, { status, calls, costUsd, provider: 'recraft', model: FIGURE_MODEL, error });
    await settleAttempt(callEnv, attemptId, { status, costMicros: toMicros(chargedUsd), model: FIGURE_MODEL });
  };
  let result;
  try { result = await (o.adapter || imageAdapter(callEnv, FIGURE_MODEL)).generate({ model: FIGURE_MODEL, prompt: spec.prompt, settings: SETTINGS, references: [], signal: AbortSignal.timeout(FIGURE_TIMEOUT_MS) }); }
  catch (error) {
    // The same readings as an image job (image-jobs.js submit): nothing left the worker is a release; a 429 is a known zero; any other answer or no answer keeps the cost unknown.
    if (!error?.providerRequestStarted) { await settle({ status: 'cancelled', calls: 0, costUsd: 0, error: error?.code || 'provider_not_started' }); return { reason: error?.code || 'provider_not_started', retry: !['not_configured', 'invalid_input'].includes(error?.code) }; }
    if (error.definiteResponse && error.status === 429) { await settle({ status: 'failed', calls: 1, costUsd: 0, error: 'provider_rejected' }); return { reason: 'provider_rejected', retry: true }; }
    const reason = error.definiteResponse ? (error.code === 'invalid_output' ? 'invalid_output' : 'provider_rejected') : 'outcome_unknown';
    await settle({ status: 'failed', calls: 1, costUsd: null, error: reason });
    return { reason, retry: true };
  }
  if (!(result?.bytes instanceof Uint8Array) || !result.bytes.length || !IMAGE_TYPES.includes(result.mimeType)) { await settle({ status: 'failed', calls: 1, costUsd: null, error: 'invalid_output' }); return { reason: 'invalid_output', retry: true }; }
  const sha256 = await sha(result.bytes), sourceId = `fs_${(await sha(`explain-illustration:${opId}`)).slice(0, 24)}`, r2Key = `file-sources/${sourceId}/original/${sha256}`;
  const ext = result.mimeType === 'image/jpeg' ? 'jpg' : result.mimeType.split('/')[1], name = `illustration.${ext}`, now = Date.now();
  try {
    await learnMedia(callEnv).put(r2Key, result.bytes, { httpMetadata: { contentType: result.mimeType }, sha256, customMetadata: { explainFigure: opId } });
    await db.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, 'stored', ?, ?) ON CONFLICT (id) DO NOTHING")
      .bind(sourceId, o.store.org, o.store.email, o.store.app, o.store.boardId ?? null, name, result.mimeType, result.mimeType, result.bytes.length, sha256, r2Key, now, now).run();
  } catch { await settle({ status: 'failed', calls: 1, costUsd: null, error: 'result_not_stored' }); return { reason: 'result_not_stored', retry: true }; }
  const cost = imageCost(FIGURE_MODEL, result.usage, quote.reserveUsd, quote.maxUsd);
  await settle({ status: 'settled', calls: 1, costUsd: cost.settledUsd, chargedUsd: cost.chargedUsd, error: cost.absorbedUsd > 0 ? 'charge_capped' : cost.state === 'estimated_upper_bound' ? 'cost_estimated_upper_bound' : null });
  return { figure: { status: 'ready', fileRef: { v: 1, source: { id: sourceId, rev: sha256 }, meta: { name, type: result.mimeType, size: result.bytes.length } }, alt: spec.alt, caption: spec.caption, aspect: 1 } };
}

async function figure(env, spec, index, o) {
  const log = (outcome, extra) => o.log(JSON.stringify({ event: 'explain_figure', id: spec.id, outcome, ...extra }));
  const why = unavailable(env, o.store);
  if (why) { log('not_made', { reason: why }); return null; }
  for (let n = 0; n < FIGURE_ATTEMPTS; n++) {
    let got;
    try { got = await attempt(env, spec, index * FIGURE_ATTEMPTS + n, o); } catch { got = { reason: 'error', retry: false }; }
    if (got.figure) { log('ready', { attempt: n }); return got.figure; }
    log('attempt_failed', { attempt: n, reason: got.reason });
    if (!got.retry) break;
  }
  return null;
}

// The pictures of one card, one per prompt, each started once: the same attempts, retries, ledger rows and silent removal whoever starts it.
// EXP-13 fix 3 (owner 2026-11-08): the fast chain starts a picture as soon as the streamed answer holds it, while the author is still writing
// (explanation-fast-chain.js); a repaired answer that keeps a prompt reuses its picture, and a picture whose prompt left the card is still settled, then not used.
export function figureStarter(env, { store = null, scope = null, adapter = null, log = console.log } = {}) {
  const started = new Map();
  let owner = null;
  const resolved = () => (owner ??= Promise.resolve().then(() => (typeof store === 'function' ? store() : store)).catch(() => null));
  return {
    start(spec) {
      if (!started.has(spec.prompt)) { const index = started.size; started.set(spec.prompt, resolved().then(o => figure(env, spec, index, { store: o, scope, adapter, log })).catch(() => null)); }
      return started.get(spec.prompt);
    },
    settled: () => Promise.all(started.values()),
  };
}

// -> the block with `figures` for the pictures made and the fences of the others removed (the same block when it has no rh-illustration fence).
//   store: { org, email, app, boardId } (the board owner the file source belongs to), or an async function giving it, or null (no picture is made: fences removed).
//   scope(env, call): the env one provider call runs under (the roadmap's stable operation drawing on the step hold); default the request's own env.
//   adapter: an image adapter double (tests); default imageAdapter.
//   early: a figureStarter that already holds pictures started from the streamed answer; the card waits for every picture it started.
export async function illustrateExplanation(env, block, { store = null, scope = null, adapter = null, log = console.log, early = null } = {}) {
  const specs = markdownIllustrations(block?.body).filter(p => p.ok).map(p => p.spec);
  const starter = early || figureStarter(env, { store, scope, adapter, log });
  const results = await Promise.all(specs.map(spec => starter.start(spec)));
  await starter.settled();
  if (!specs.length) return block;
  const figures = {}, drop = new Set();
  // A picture started for an earlier answer with the same prompt shows this answer's alt and caption.
  specs.forEach((spec, i) => { if (results[i]) figures[spec.id] = { ...results[i], alt: spec.alt, caption: spec.caption }; else drop.add(spec.id); });
  return { ...block, ...(drop.size ? { body: withoutIllustrations(block.body, drop) } : {}), ...(Object.keys(figures).length ? { figures } : {}) };
}
