// EXP-13 auto Recraft (docs/features/explain.md "Card layout v2", owner decision A1 as revised 2026-11-08): every rh-illustration fence of a new written Explanation
// is made with the IMG-01 Recraft adapter (image-providers.js, recraftv4_1_flash) inside the same /explain dispatch. Pictures run in parallel; each attempt is
// admitted and settled on the shared ledger (learn-spend-ledger.js) under the request's own usage context, so its cost is part of the /explain charge and never
// unpriced. One attempt of at most FIGURE_TIMEOUT_MS (owner 2026-11-08); if it fails, or cannot be made here at all (no board, image generation off, no
// RECRAFT_API_KEY, no price, a refused admission), its fence is removed from the body and no figure is stored: the learner never sees a failed picture. The drop is
// recorded in the server log (explanation_figure_dropped) and the ledger. This module never throws to its caller.
// Off the critical path (owner 2026-11-08, option `later`): the card is returned as soon as its text is ready; a picture still being made is a pending entry the card
// shows loading (its source id is known once it is admitted), and its outcome is written into the SAVED card when it arrives (fillSavedCard).
//
// Saved shape (the web renders it; IllustrationFigure.jsx reads the same asset fields as block.illustration):
//   block.figures = { [fence id]: { status: 'ready', fileRef: { v: 1, source: { id, rev }, meta: { name, type, size } }, alt, caption, aspect: 1 } }
//   while it is made: { status: 'pending', fileRef: { v: 1, source: { id } }, alt, caption, aspect: 1 } (the web reads that source until it is stored);
//   once it failed, in the saved card only: { status: 'dropped', source: id }, its fence removed (keepSavedFigures applies it to a page's later save).
import { markdownIllustrations, withoutIllustrations } from './learn-primitives.js';
import { fileRefStatements } from './file-refs.js';
import { imageAdapter, imageCost, imageQuote, providerConfigured } from './image-providers.js';
import { imageAllowed } from './image-settings.js';
import { admitSpend, operationId, operationOf, settleSpend, spendEnforced } from './learn-spend-ledger.js';
import { settleAttempt, toMicros } from './learn-usage.js';
import { learnMedia } from './learn-storage.js';

export const FIGURE_MODEL = 'recraftv4_1_flash';
export const FIGURE_ATTEMPTS = 1; // owner 2026-11-08: one try, no retry (was three); the picture is off the card's critical path
export const FIGURES_MAX = 2; // at most two pictures a card, of up to three visuals (owner 2026-11-08; learn-primitives.js explanationLayoutProblem)
// Recraft measured 1.1-1.5 s per API call and 1.6-1.9 s to a visible picture (C:/s/spec/latency-lab/recraft/run1.log): 5 s is over twice that, so a slower call is
// dropped rather than waited for (owner 2026-11-08, replacing 20 s x 3 attempts). A 5.0 s cold call can be cut off.
export const FIGURE_TIMEOUT_MS = 5000;
// How long a finished picture waits for its card to reach the saved board (the page saves about 2 s after a change, LearnPage pushBoard), well inside a Worker's
// waitUntil window (30 s after the response). A card still not saved after these is treated as gone.
export const CARD_WAITS = [1000, 2000, 4000, 8000];
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

// The attempt, in two steps: admitted -> { reason } | { sourceId, run } (the picture's source id is known from here); run(): sent, stored, settled -> { figure } | { reason }.
async function attempt(env, spec, call, o) {
  const callEnv = o.scope ? await o.scope(env, call) : env;
  const op = operationOf(callEnv), quote = figureQuote(callEnv), db = callEnv.LEARN_DB;
  const opId = op?.opId || operationId('explain_illustration');
  let attemptId = null;
  if (spendEnforced(callEnv)) {
    const gate = await admitSpend(db, callEnv, { opId, userId: `provider:${o.store.org}`, org: o.store.org, category: 'explain_illustration', reservedUsd: quote.reserveUsd, kind: op?.kind || 'media',
      provider: 'recraft', model: FIGURE_MODEL, stable: !!op?.opId, allocation: op?.allocation || null });
    if (gate.refused) return { reason: `admission_${gate.reason}` };
    attemptId = gate.attemptId;
  }
  const sourceId = `fs_${(await sha(`explain-illustration:${opId}`)).slice(0, 24)}`;
  return { sourceId, run: () => send(callEnv, spec, o, { db, opId, quote, attemptId, sourceId }) };
}

async function send(callEnv, spec, o, { db, opId, quote, attemptId, sourceId }) {
  const settle = async ({ status, calls, costUsd, chargedUsd = costUsd, error = null }) => {
    if (!attemptId) return;
    await settleSpend(db, opId, { status, calls, costUsd, provider: 'recraft', model: FIGURE_MODEL, error });
    await settleAttempt(callEnv, attemptId, { status, costMicros: toMicros(chargedUsd), model: FIGURE_MODEL });
  };
  let result;
  try { result = await (o.adapter || imageAdapter(callEnv, FIGURE_MODEL)).generate({ model: FIGURE_MODEL, prompt: spec.prompt, settings: SETTINGS, references: [], signal: AbortSignal.timeout(FIGURE_TIMEOUT_MS) }); }
  catch (error) {
    // The same readings as an image job (image-jobs.js submit): nothing left the worker is a release; a 429 is a known zero; any other answer or no answer keeps the cost unknown.
    if (!error?.providerRequestStarted) { await settle({ status: 'cancelled', calls: 0, costUsd: 0, error: error?.code || 'provider_not_started' }); return { reason: error?.code || 'provider_not_started' }; }
    if (error.definiteResponse && error.status === 429) { await settle({ status: 'failed', calls: 1, costUsd: 0, error: 'provider_rejected' }); return { reason: 'provider_rejected' }; }
    const reason = error.definiteResponse ? (error.code === 'invalid_output' ? 'invalid_output' : 'provider_rejected') : 'outcome_unknown';
    await settle({ status: 'failed', calls: 1, costUsd: null, error: reason });
    return { reason };
  }
  if (!(result?.bytes instanceof Uint8Array) || !result.bytes.length || !IMAGE_TYPES.includes(result.mimeType)) { await settle({ status: 'failed', calls: 1, costUsd: null, error: 'invalid_output' }); return { reason: 'invalid_output' }; }
  const sha256 = await sha(result.bytes), r2Key = `file-sources/${sourceId}/original/${sha256}`;
  const ext = result.mimeType === 'image/jpeg' ? 'jpg' : result.mimeType.split('/')[1], name = `illustration.${ext}`, now = Date.now();
  try {
    await learnMedia(callEnv).put(r2Key, result.bytes, { httpMetadata: { contentType: result.mimeType }, sha256, customMetadata: { explainFigure: opId } });
    await db.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, 'stored', ?, ?) ON CONFLICT (id) DO NOTHING")
      .bind(sourceId, o.store.org, o.store.email, o.store.app, o.store.boardId ?? null, name, result.mimeType, result.mimeType, result.bytes.length, sha256, r2Key, now, now).run();
  } catch { await settle({ status: 'failed', calls: 1, costUsd: null, error: 'result_not_stored' }); return { reason: 'result_not_stored' }; }
  const cost = imageCost(FIGURE_MODEL, result.usage, quote.reserveUsd, quote.maxUsd);
  await settle({ status: 'settled', calls: 1, costUsd: cost.settledUsd, chargedUsd: cost.chargedUsd, error: cost.absorbedUsd > 0 ? 'charge_capped' : cost.state === 'estimated_upper_bound' ? 'cost_estimated_upper_bound' : null });
  return { figure: { status: 'ready', fileRef: { v: 1, source: { id: sourceId, rev: sha256 }, meta: { name, type: result.mimeType, size: result.bytes.length } }, alt: spec.alt, caption: spec.caption, aspect: 1 } };
}

// One picture -> { begun: Promise<{ sourceId } | null>, done: Promise<figure | null> }: begun once it is admitted (null: it will not be made), done once made or failed.
function figure(env, spec, index, o) {
  const log = (outcome, extra) => o.log(JSON.stringify({ event: 'explain_figure', id: spec.id, outcome, ...extra }));
  const admitted = (async () => {
    const why = unavailable(env, o.store);
    if (why) { log('not_made', { reason: why }); return null; }
    let got;
    try { got = await attempt(env, spec, index, o); } catch { got = { reason: 'error' }; }
    if (got.reason) { log('attempt_failed', { attempt: 0, reason: got.reason }); return null; }
    return got;
  })();
  const done = admitted.then(async got => {
    if (!got) return null;
    let made;
    try { made = await got.run(); } catch { made = { reason: 'error' }; }
    if (made.figure) { log('ready', { attempt: 0 }); return made.figure; }
    log('attempt_failed', { attempt: 0, reason: made.reason });
    return null;
  });
  return { begun: admitted.then(got => got && { sourceId: got.sourceId }), done };
}

// The pictures of one card, one per prompt, each started once: the same attempt, ledger rows and silent removal whoever starts it.
// EXP-13 fix 3 (owner 2026-11-08): the fast chain starts a picture as soon as the streamed answer holds it, while the author is still writing
// (explanation-fast-chain.js); a repaired answer that keeps a prompt reuses its picture, and a picture whose prompt left the card is still settled, then not used.
// start(spec) -> { begun, done, finished } (finished: { figure } once done has settled); store(): the resolved board owner.
export function figureStarter(env, { store = null, scope = null, adapter = null, log = console.log } = {}) {
  const started = new Map();
  let owner = null;
  const resolved = () => (owner ??= Promise.resolve().then(() => (typeof store === 'function' ? store() : store)).catch(() => null));
  return {
    start(spec) {
      if (!started.has(spec.prompt)) {
        const index = started.size, made = resolved().then(o => figure(env, spec, index, { store: o, scope, adapter, log }));
        const picture = { begun: made.then(f => f.begun).catch(() => null), done: made.then(f => f.done).catch(() => null), finished: null };
        picture.done.then(value => { picture.finished = { figure: value }; });
        started.set(spec.prompt, picture);
      }
      return started.get(spec.prompt);
    },
    settled: () => Promise.all([...started.values()].map(picture => picture.done)),
    store: resolved,
  };
}

// The count of dropped pictures, before and after a change (owner 2026-11-08): the card (null before it is on a board), the fence, its source and its prompt.
const dropped = (log, { card = null, spec, sourceId = null, reason }) => log(JSON.stringify({ event: 'explanation_figure_dropped', card, figure: spec.id, source: sourceId, reason, prompt: spec.prompt }));

// -> the block with `figures` for the pictures made and the fences of the others removed (the same block when it has no rh-illustration fence).
//   store: { org, email, app, board, boardId } (the board owner the file source belongs to, and the board the card is saved on), or an async function giving it,
//     or null (no picture is made: fences removed).
//   scope(env, call): the env one provider call runs under (the roadmap's stable operation drawing on the step hold); default the request's own env.
//   adapter: an image adapter double (tests); default imageAdapter.
//   early: a figureStarter that already holds pictures started from the streamed answer.
//   later(promise): given (the /explain route's waitUntil), the card waits only for each picture's admission; one still being made is returned pending and its
//     outcome is written into the saved card when it arrives (fillSavedCard). Omitted, the card waits for every picture it started (the roadmap's stored card).
export async function illustrateExplanation(env, block, { store = null, scope = null, adapter = null, log = console.log, early = null, later = null } = {}) {
  const specs = markdownIllustrations(block?.body).filter(p => p.ok).map(p => p.spec);
  const starter = early || figureStarter(env, { store, scope, adapter, log });
  const pictures = specs.map(spec => starter.start(spec));
  if (!later) await starter.settled();
  if (!specs.length) return block;
  const figures = {}, drop = new Set();
  for (const [i, spec] of specs.entries()) {
    const picture = pictures[i], begun = await picture.begun;
    // A picture started for an earlier answer with the same prompt shows this answer's alt and caption.
    if (picture.finished?.figure) figures[spec.id] = { ...picture.finished.figure, alt: spec.alt, caption: spec.caption };
    else if (begun && !picture.finished) {
      figures[spec.id] = { status: 'pending', fileRef: { v: 1, source: { id: begun.sourceId } }, alt: spec.alt, caption: spec.caption, aspect: 1 };
      later(picture.done.then(made => fillSavedCard(env, starter.store, { spec, sourceId: begun.sourceId, figure: made && { ...made, alt: spec.alt, caption: spec.caption } }, { log })).catch(() => {}));
    } else { drop.add(spec.id); dropped(log, { card: block.id ?? null, spec, sourceId: begun?.sourceId ?? null, reason: begun ? 'failed' : 'not_made' }); }
  }
  return { ...block, ...(drop.size ? { body: withoutIllustrations(block.body, drop) } : {}), ...(Object.keys(figures).length ? { figures } : {}) };
}

// ---- the saved card -------------------------------------------------------------------------------------------------------------------------------------------
// A card holds a pending picture when its entry is pending on that exact source: the source id is minted per attempt, so it names one picture of one card
// (a copy of the card names it too and is filled the same way).
const holds = (card, id, sourceId) => card?.figures?.[id]?.status === 'pending' && card.figures[id].fileRef?.source?.id === sourceId;
// One card with a picture's outcome: its figure entry set, and for a drop its fence removed (the prose joins). Nothing else on the card changes.
const settleCard = (card, id, entry) => ({ ...card, ...(entry.status === 'dropped' ? { body: withoutIllustrations(card.body, new Set([id])) } : {}), figures: { ...card.figures, [id]: entry } });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Writes one picture's outcome (figure, or null: dropped) into the saved card(s) that still hold it pending (owner Q39). The narrowest safe write: the board row is
// read; in the state as stored now only that card's figure entry (and, for a drop, its fence) changes; it is written back only if the row is still exactly what was
// read (version and state_json, the guard file-refs.js uses), with the file-reference index in the same batch; a lost race reads again. The version is not bumped,
// so the learner's open page is never told its board changed; its next save keeps this write (keepSavedFigures). A card deleted (or not saved within CARD_WAITS)
// gets no write; the learner's edits, moves and other cards are whatever is stored and are kept. -> the card ids written ([] when none).
export async function fillSavedCard(env, store, { spec, sourceId, figure }, { log = console.log, waits = CARD_WAITS, wait = pause } = {}) {
  const owner = typeof store === 'function' ? await store() : store, db = env?.LEARN_DB, entry = figure || { status: 'dropped', source: sourceId };
  let cards = [];
  for (let waited = 0, races = 0; owner?.org && owner.email && owner.app && db && races < 5;) {
    const row = await db.prepare('SELECT id, version, state_json FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ? AND board = ?').bind(owner.org, owner.email, owner.app, owner.board || 'main').first();
    let state = null;
    try { state = row ? JSON.parse(row.state_json) : null; } catch { /* unreadable: no write */ }
    const ids = (Array.isArray(state?.blocks) ? state.blocks : []).filter(card => holds(card, spec.id, sourceId)).map(card => card.id);
    if (!ids.length) { if (waited >= waits.length) break; await wait(waits[waited++]); continue; }
    const next = { ...state, blocks: state.blocks.map(card => (holds(card, spec.id, sourceId) ? settleCard(card, spec.id, entry) : card)) }, text = JSON.stringify(next);
    const [{ meta }] = await db.batch([db.prepare('UPDATE learn_boards SET state_json = ? WHERE id = ? AND version = ? AND state_json = ?').bind(text, row.id, row.version, row.state_json),
      ...fileRefStatements(db, row.id, text, row.version, next, { org: owner.org, email: owner.email })]);
    if (meta.changes) { cards = ids; break; }
    races++;
  }
  if (!figure) dropped(log, { card: cards[0] ?? null, spec, sourceId, reason: 'failed' });
  return cards;
}

// Whether a page's board save still holds a picture as pending (learn-boards.js saveOwn then keeps fillSavedCard's writes and guards against one landing mid-save).
export const holdsPendingFigure = state => Array.isArray(state?.blocks) && state.blocks.some(card => Object.values(card?.figures || {}).some(f => f?.status === 'pending'));

// A save from a page that still holds a picture as pending (the page never reads its card back) keeps what fillSavedCard wrote into the saved card since: the ready
// entry, or the drop with its fence removed. Matched by card id, fence id and source id; everything else is saved as the page sent it. -> the state to save.
export function keepSavedFigures(storedText, state) {
  if (!storedText || !holdsPendingFigure(state)) return state;
  let stored;
  try { stored = new Map((JSON.parse(storedText).blocks || []).map(card => [card?.id, card])); } catch { return state; }
  return { ...state, blocks: state.blocks.map(card => Object.entries(card?.figures || {}).reduce((out, [id, entry]) => {
    const saved = entry?.status === 'pending' ? stored.get(card.id)?.figures?.[id] : null, sourceId = entry?.fileRef?.source?.id;
    return (saved?.status === 'ready' && saved.fileRef?.source?.id === sourceId) || (saved?.status === 'dropped' && saved.source === sourceId) ? settleCard(out, id, saved) : out;
  }, card)) };
}
