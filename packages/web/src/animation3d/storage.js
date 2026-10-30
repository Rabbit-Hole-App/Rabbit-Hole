// /animation card persistence (plan section 5 "State and recovery rules", AN-06). Pure: no React, no DOM, no fetch. What an
// animation3d block keeps on the board, how settled changes reach the board save, how a saved card hydrates, and which late
// results may land. The pattern is /explain's program card (explain-program/program-card.js, explain-client.js): the board holds
// a small reference and the learner's state; the artifact (scene and program, source included) stays in the durable result store
// and is read back through the authorized result route (lane G's, injected here as readArtifact). Never source in board JSON.
//
//   block = { id, type: 'animation3d', title, ...layout,
//     animation3d: { v: 1,
//       ref:  { artifactId, revision, planHash, sourceHash, boardId, cardId, stamps },   the accepted artifact, immutable
//       sim:  contract.js snapshot { schema, artifactId, revision, inputs, state, seed, time, tick, stamp, paused } | null
//       view: contract.js presentation { revision, camera, selection } | null },          merged independently of sim
//     animation3dJob: { id, boardId, cardId, requestId, sourceKey, baseRevision, stage, message? } }   a generation in flight
//
// sim null: initialize from the artifact's defaults. view null: the artifact's camera, nothing selected.
// This module imports nothing at load: the canvas's flush (withFlushedAnimations) runs on every board save, so the contract (zod) is
// loaded only by hydration.

export const ANIMATION3D = 'animation3d';
export const ENVELOPE_VERSION = 1;
export const SNAPSHOT_SCHEMA = 'animation-snapshot/1'; // contract.js SNAPSHOT_SCHEMA; storage.test.mjs fails on drift
// Bounded: the snapshot keeps the contract's 40 KiB (CONTRACT_LIMITS.snapshotBytes), a presentation 2 KiB.
export const SNAPSHOT_LIMIT = 40 * 1024;
export const VIEW_LIMIT = 2 * 1024;
export const ENVELOPE_LIMIT = 48 * 1024;
// The card's own debounce: a settled change reaches the board within SAVE_DELAY of the last one, and never later than SAVE_MAX_WAIT
// after the first unsaved one, however continuous the input. The canvas then saves the board on its own 400 ms (AdaptiveCanvas).
export const SAVE_DELAY = 400;
export const SAVE_MAX_WAIT = 2000;

export const isAnimation3dBlock = block => block?.type === ANIMATION3D;

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const id = v => typeof v === 'string' && ID.test(v);
const HASH = /^[0-9a-f]{64}$/;
const count = v => Number.isInteger(v) && v >= 0;
const size = v => { try { return JSON.stringify(v).length; } catch { return Infinity; } };
const finiteJson = v => (typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(finiteJson) : plain(v) ? Object.values(v).every(finiteJson) : v === null || typeof v === 'string' || typeof v === 'boolean');
const keysOnly = (v, keys) => Object.keys(v).every(key => keys.includes(key));

// ---- the envelope -----------------------------------------------------------------------------------------------------
// The checks here are structural (shape, size, binding to the reference); the contract's full rules (declared parameters, selectable
// nodes, camera ranges) need the artifact and run at hydration.

// Stamps: the artifact's scene schema, capability version and program tuple (artifactIdentity below), compared whole.
const stampsProblem = s => (!plain(s) || !Object.keys(s).length || Object.keys(s).length > 10 || !Object.entries(s).every(([k, v]) => id(k) && (count(v) || (typeof v === 'string' && v.length <= 160))) ? 'stamps' : null);
const REF_KEYS = ['artifactId', 'revision', 'planHash', 'sourceHash', 'boardId', 'cardId', 'stamps'];
export function refProblem(ref) {
  if (!plain(ref) || !keysOnly(ref, REF_KEYS)) return 'ref must be { artifactId, revision, planHash, sourceHash, boardId, cardId, stamps }';
  for (const key of ['artifactId', 'boardId', 'cardId']) if (!id(ref[key])) return `ref.${key}`;
  if (!Number.isInteger(ref.revision) || ref.revision < 1) return 'ref.revision';
  if (typeof ref.planHash !== 'string' || !HASH.test(ref.planHash)) return 'ref.planHash';
  if (ref.sourceHash !== null && (typeof ref.sourceHash !== 'string' || !HASH.test(ref.sourceHash))) return 'ref.sourceHash'; // null: a static inspect scene has no program
  return stampsProblem(ref.stamps) && 'ref.stamps';
}
const SIM_KEYS = ['schema', 'artifactId', 'revision', 'inputs', 'state', 'seed', 'time', 'tick', 'stamp', 'paused'];
export function simProblem(sim) {
  if (!plain(sim) || !keysOnly(sim, SIM_KEYS) || sim.schema !== SNAPSHOT_SCHEMA) return 'sim must be an animation-snapshot/1';
  if (!count(sim.stamp) || !count(sim.tick) || !count(sim.seed) || sim.seed > 0xffffffff) return 'sim.stamp, tick or seed';
  if (!plain(sim.inputs) || !Number.isFinite(sim.time) || sim.time < 0 || typeof sim.paused !== 'boolean') return 'sim.inputs, time or paused';
  return finiteJson(sim) && size(sim) <= SNAPSHOT_LIMIT ? null : 'sim is not finite JSON within 40 KiB';
}
export function viewProblem(view) {
  if (!plain(view) || !keysOnly(view, ['revision', 'camera', 'selection']) || !count(view.revision)) return 'view must be { revision, camera, selection }';
  if (!plain(view.camera) || !finiteJson(view.camera) || size(view.camera) > VIEW_LIMIT) return 'view.camera';
  return view.selection === null || id(view.selection) ? null : 'view.selection';
}
const sameArtifact = (sim, ref) => sim.artifactId === ref.artifactId && sim.revision === ref.revision;

// The saved envelope, checked: { ok: true, envelope } or { ok: false, issue }. Strict keys, so a scene, program or source a
// pasted or tampered block carries is refused, never handed to the player.
export function readEnvelope(block) {
  const env = block?.animation3d;
  if (!plain(env) || env.v !== ENVELOPE_VERSION || !keysOnly(env, ['v', 'ref', 'sim', 'view'])) return { ok: false, issue: 'envelope' };
  const issue = refProblem(env.ref) || (env.sim != null && simProblem(env.sim)) || (env.view != null && viewProblem(env.view))
    || (env.ref.cardId !== block.id && 'ref.cardId does not name this card') || (size(env) > ENVELOPE_LIMIT && 'envelope too large');
  return issue ? { ok: false, issue } : { ok: true, envelope: { v: env.v, ref: env.ref, sim: env.sim ?? null, view: env.view ?? null } };
}

// A newly accepted artifact's envelope: its own camera and initial state (sim and view null).
export const freshEnvelope = ref => ({ v: ENVELOPE_VERSION, ref, sim: null, view: null });

// One atomic simulation snapshot (state.js commitAnimationStep's accepted one) onto the block: applied only when it belongs to the
// saved artifact revision and its stamp is newer than the saved one's (a late or repeated commit never goes back). A Scene Reset is the
// same call with the runtime's reset snapshot, so the camera stays. -> { block, applied, reason? }; a refused one returns the block.
export function withSimulation(block, sim) {
  const read = readEnvelope(block);
  if (!read.ok) return { block, applied: false, reason: 'no_envelope' };
  const { envelope } = read;
  const problem = simProblem(sim);
  if (problem) return { block, applied: false, reason: `invalid: ${problem}` };
  if (!sameArtifact(sim, envelope.ref)) return { block, applied: false, reason: 'other_artifact' };
  if (envelope.sim && sim.stamp <= envelope.sim.stamp) return { block, applied: false, reason: 'stale' };
  return { block: { ...block, animation3d: { ...envelope, sim } }, applied: true };
}

// Presentation onto the block, beside the simulation: only a newer view revision lands, so a worker reply computed against an older
// view (its revision + 1) never replaces an orbit or selection the learner made meanwhile. Needs no reducer evaluation.
export function withView(block, view) {
  const read = readEnvelope(block);
  if (!read.ok) return { block, applied: false, reason: 'no_envelope' };
  const problem = viewProblem(view);
  if (problem) return { block, applied: false, reason: `invalid: ${problem}` };
  if (read.envelope.view && view.revision <= read.envelope.view.revision) return { block, applied: false, reason: 'stale' };
  return { block: { ...block, animation3d: { ...read.envelope, view: { revision: view.revision, camera: view.camera, selection: view.selection } } }, applied: true };
}
// The next presentation from the saved one, for a camera or selection change made on this card. With nothing saved, the card passes
// the shown camera (the artifact's) in `change`.
export const nextView = (block, change) => {
  const saved = readEnvelope(block).envelope?.view;
  return { revision: (saved?.revision ?? -1) + 1, camera: saved?.camera ?? null, selection: saved?.selection ?? null, ...change };
};
// Reset view: only the camera goes back (to the artifact's own, which the card passes); the selection and the simulation stay.
export const resetView = (block, camera) => withView(block, nextView(block, { camera }));

// ---- saving: bounded debounce, explicit flush ------------------------------------------------------------------------

// Every live saver, so the canvas's own flush (its unmount and pagehide, canvasApi.persist) can take what a card has not written
// yet into the board it is about to save. A card's own unmount runs after its canvas's, so it cannot be relied on for this.
const savers = new Set();

// One per mounted owner card. simulation(sim) / view(view) queue a settled change (the latest of each wins; both re-check their rule
// when written, so a write never goes back); flush() writes now. write(apply) hands the card an updater (block -> block) to run on its
// latest block, the canvas's quiet change; it is never called with a whole stale block, so a move or resize is never undone.
//   createAnimationSaver({ boardId, cardId, write, delay, maxWait, timers })
//     -> { simulation(sim), view(view), flush() -> boolean, pending() -> boolean, dispose() }
export function createAnimationSaver({ boardId, cardId, write, delay = SAVE_DELAY, maxWait = SAVE_MAX_WAIT, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: t => clearTimeout(t), now: () => Date.now() } }) {
  let sim = null, view = null, timer = null, since = 0, dead = false;
  const take = () => {
    if (timer !== null) { timers.clear(timer); timer = null; }
    since = 0;
    if (!sim && !view) return null;
    const s = sim, v = view;
    sim = null; view = null;
    return block => {
      if (block?.id !== cardId) return block;
      let next = block;
      if (s) next = withSimulation(next, s).block;
      if (v) next = withView(next, v).block;
      return next;
    };
  };
  const flush = () => { const apply = take(); if (!apply) return false; write(apply); return true; };
  const schedule = () => {
    if (dead) return;
    const now = timers.now();
    if (!since) since = now;
    if (timer !== null) timers.clear(timer);
    timer = timers.set(flush, Math.max(0, Math.min(delay, maxWait - (now - since))));
  };
  const pending = () => !!(sim || view);
  const entry = { boardId, cardId, take, write, pending };
  savers.add(entry);
  return {
    simulation(next) { if (!dead) { sim = next; schedule(); } },
    view(next) { if (!dead) { view = next; schedule(); } },
    flush,
    pending,
    dispose() { flush(); dead = true; savers.delete(entry); },
  };
}

// The canvas's flush (patch a-canvas-flush.patch): the board's blocks with every pending card change written in, and each card told
// (so its state matches). The canvas knows its storage key, not its board id, so a saver matches by its card id and the board the
// block's own reference names. A card copied onto another canvas keeps both (same id, the original's board), but a copy gets no saver
// (hydrateAnimation: unavailable) and the original's saver is disposed with its own canvas, which unmounts before another mounts. A
// deleted card is not brought back: only a block still in `blocks` changes. Same array when nothing was pending.
export function withFlushedAnimations(blocks) {
  let out = blocks;
  for (const entry of savers) {
    const mine = block => block?.id === entry.cardId && block.animation3d?.ref?.boardId === entry.boardId;
    if (!entry.pending() || !out.some(mine)) continue;
    const apply = entry.take();
    out = out.map(block => (mine(block) ? apply(block) : block));
    entry.write(apply);
  }
  return out;
}
// Whether a reload now could lose a card change (canvas-persist.js boardPending's companion).
export const animationSavesPending = () => [...savers].some(entry => entry.pending());

// ---- hydration --------------------------------------------------------------------------------------------------------

// What the card shows instead of a scene. No ellipsis (UI copy rule); a disabled action keeps its name.
export const MESSAGES = Object.freeze({
  shared: 'Animations on shared canvases are not available yet. The owner can open it on their canvas.',
  copied: 'This animation was copied from another canvas. Copied animations are not available yet.',
  invalid: 'This animation\'s saved data could not be read.',
  missing: 'This animation\'s saved scene is no longer available.',
  mismatch: 'This animation\'s saved version could not be verified. Your saved settings are kept. Try again.',
  error: 'The animation could not be loaded. Try again.',
});
// The audiences the MVP serves: the owner on their own canvas. A share link, a publication, an embed or a fork gets the honest
// placeholder (AN-14 enables them) and never reaches an owner route.
const OWNER = 'owner';

// The identity the card pins, from an artifact (contract.js field names): the reference's stamps are its scene schema, capability
// version and, when it has a program, the program's whole version tuple.
export function artifactIdentity(artifact) {
  const { source: _source, sourceHash = null, ...tuple } = artifact.program ?? {};
  return { artifactId: artifact.artifactId, revision: artifact.revision, planHash: artifact.planHash, sourceHash, stamps: { scene: artifact.schema, capabilityVersion: artifact.capabilityVersion, ...tuple } };
}
const sameStamps = (a, b) => plain(a) && plain(b) && Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

// The contract's rules (loaded only here): the artifact passes validateAnimationArtifact under a registry this build has (which also
// pins the program tuple), its source still hashes to its sourceHash, and a saved snapshot and presentation pass their validators.
async function contractChecks() {
  const contract = await import('./contract.js');
  const { CAPABILITY_REGISTRIES } = await import('./capabilities.js');
  return {
    check: async artifact => {
      const parsed = CAPABILITY_REGISTRIES.map(caps => contract.validateAnimationArtifact(artifact, caps)).find(result => result.ok);
      if (!parsed) return null;
      const program = parsed.value.program;
      if (program && (await contract.hashProgramSource(program.source)) !== program.sourceHash) return null;
      return parsed.value;
    },
    checkSnapshot: (sim, artifact) => { const out = contract.validateAnimationSnapshot(sim, artifact); return out.ok ? null : out.issues[0]?.message || 'snapshot'; },
    checkView: (view, artifact) => contract.validateAnimationPresentation(view, artifact).ok,
  };
}

// The card's saved artifact made runnable, paused at the saved moment. The only read is readArtifact(ref, { signal }), the durable
// result by its immutable id under this canvas's authorization: no job record, no model, no generation. Never throws.
//   context: { kind: 'owner' | 'share' | 'publication' | 'embed' | 'fork', boardId }
//   readArtifact(ref, { signal }) -> artifact, or null / a { status: 404 | 410 } throw when it is gone
// -> { status: 'ready', artifact, sim, view, playing: false, dropped? } | { status: 'unavailable' | 'invalid' | 'missing' | 'mismatch' |
//    'error' | 'aborted', message, retry } ; every result carries binding (what it was asked for) for landHydration.
export async function hydrateAnimation(block, { context, readArtifact, signal } = {}) {
  const read = readEnvelope(block);
  const binding = { boardId: context?.boardId ?? null, cardId: block?.id ?? null, revision: read.envelope?.ref.revision ?? null };
  const out = (status, extra = {}) => ({ status, binding, message: MESSAGES[status === 'unavailable' ? extra.reason : status] ?? null, retry: status === 'mismatch' || status === 'error', ...extra });
  if (context?.kind !== OWNER) return out('unavailable', { reason: context?.kind === 'fork' ? 'copied' : 'shared' });
  if (!read.ok) return out('invalid', { issue: read.issue });
  const { ref, sim, view } = read.envelope;
  // A card copied onto another canvas (a fork, a duplicate, a paste) still names the canvas it was made on; that canvas's result route
  // is not this one's to call.
  if (ref.boardId !== context.boardId) return out('unavailable', { reason: 'copied' });
  let raw;
  try { raw = await readArtifact(ref, { signal }); } catch (problem) {
    if (signal?.aborted || problem?.name === 'AbortError') return out('aborted');
    return out(problem?.status === 404 || problem?.status === 410 ? 'missing' : 'error');
  }
  if (signal?.aborted) return out('aborted');
  if (!raw) return out('missing');
  let artifact = null, rules;
  try {
    rules = await contractChecks();
    artifact = await rules.check(raw);
    const own = artifact && artifactIdentity(artifact);
    if (own && !(own.artifactId === ref.artifactId && own.revision === ref.revision && own.planHash === ref.planHash && own.sourceHash === ref.sourceHash && sameStamps(own.stamps, ref.stamps))) artifact = null;
  } catch { artifact = null; }
  if (signal?.aborted) return out('aborted');
  if (!artifact) return out('mismatch');
  // A saved state the contract refuses, or one made by another revision, is dropped (the card initializes again from its defaults, as
  // program-card.js programStateFor); the artifact itself is still good. A presentation it refuses falls back to the artifact's camera.
  // Restored paused, whatever was saved.
  let issue = sim && !sameArtifact(sim, ref) ? 'other_artifact' : null;
  if (sim && !issue) { try { issue = rules.checkSnapshot(sim, artifact); } catch { issue = 'snapshot'; } }
  let shown = view;
  if (view) { try { if (!rules.checkView(view, artifact)) shown = null; } catch { shown = null; } }
  return out('ready', { artifact, sim: issue ? null : { ...sim, paused: true }, view: shown, playing: false, ...(issue ? { dropped: String(issue) } : {}), message: null, retry: false });
}

// A hydration result landing on the card as it is now. Refused when the card was deleted, replaced, given another artifact, or the
// canvas switched. The learner's edits made while it loaded win: the live block's sim and view are used whenever they are newer
// than (or not in) the result. -> { ok: true, sim, view } | { ok: false, reason }
export function landHydration(live, result, { boardId }) {
  const b = result?.binding;
  if (!live) return { ok: false, reason: 'card_deleted' };
  if (!b || b.boardId !== boardId) return { ok: false, reason: 'board_switched' };
  if (b.cardId !== live.id) return { ok: false, reason: 'other_card' };
  const read = readEnvelope(live);
  if (!read.ok || read.envelope.ref.revision !== b.revision) return { ok: false, reason: 'replaced' };
  if (result.status !== 'ready') return { ok: true, sim: null, view: null };
  const { sim, view } = read.envelope;
  return {
    ok: true,
    sim: sim && (!result.sim || sim.stamp > result.sim.stamp) ? { ...sim, paused: true } : result.sim,
    view: view && (!result.view || view.revision > result.view.revision) ? view : result.view,
  };
}

// ---- generation and regeneration jobs ----------------------------------------------------------------------------------

// The binding a card keeps while its job runs: the result lands only on this card, on this canvas, from this request, for this
// source set and against the revision the card had when it started (null for a first generation).
export const withJob = (block, { job, boardId, requestId, sourceKey, baseRevision = null }) => ({
  ...block, animation3dJob: { id: job.id, boardId, cardId: block.id, requestId, sourceKey, baseRevision, stage: job.stage },
});
// Stop: the card stops waiting at once; a result that arrives later is refused (the server is asked to cancel separately, and
// releases unused holds by its own billing rules). The good version stays.
export const cancelAnimationJob = block => (block?.animation3dJob ? { ...block, animation3dJob: { ...block.animation3dJob, stage: 'cancelled' } } : block);
const TERMINAL = new Set(['cancelled', 'failed']);

// The accepted result's reference. Lane G's job result names the accepted artifact by the contract's fields (artifactId, revision,
// planHash, sourceHash or null) and the stamps artifactIdentity gives it.
export const refFromResult = (result, binding) => ({ artifactId: result.artifactId, revision: result.revision, planHash: result.planHash, sourceHash: result.sourceHash ?? null, boardId: binding.boardId, cardId: binding.cardId, stamps: result.stamps });

// A polled job meets the card as it is now (card null: deleted). Mirrors explain-client.js explainResultBlock / applyExplainEdit.
// -> { action: 'ignore', reason } | { action: 'progress' | 'keep' | 'apply', block }
//    progress: still running (stage updated); keep: failed or cancelled, the current good version kept; apply: the new version.
export function settleAnimationJob(card, job, { boardId }) {
  if (!card) return { action: 'ignore', reason: 'card_deleted' };
  const waiting = card.animation3dJob;
  if (!waiting) return { action: 'ignore', reason: 'not_waiting' };
  if (waiting.boardId !== boardId) return { action: 'ignore', reason: 'board_switched' };
  if (job?.id !== waiting.id || job.cardId !== card.id || job.boardId !== waiting.boardId) return { action: 'ignore', reason: 'other_job' };
  if (job.requestId !== undefined && job.requestId !== waiting.requestId) return { action: 'ignore', reason: 'replaced' };
  if (TERMINAL.has(waiting.stage)) return { action: 'ignore', reason: waiting.stage };
  const current = readEnvelope(card).envelope?.ref.revision ?? null;
  if (current !== waiting.baseRevision) return { action: 'ignore', reason: 'stale_base' };
  if (job.stage === 'failed' || job.stage === 'cancelled') {
    return { action: 'keep', block: { ...card, animation3dJob: { ...waiting, stage: job.stage, ...(job.failure?.message ? { message: String(job.failure.message).slice(0, 300) } : {}) } } };
  }
  if (job.stage !== 'ready') return { action: 'progress', block: job.stage === waiting.stage ? card : { ...card, animation3dJob: { ...waiting, stage: job.stage } } };
  const result = job.result;
  if (!result || result.cardId !== card.id || result.canvas?.boardId !== waiting.boardId || result.sourceKey !== waiting.sourceKey || (result.baseRevision ?? null) !== waiting.baseRevision) {
    return { action: 'ignore', reason: 'other_result' };
  }
  const ref = refFromResult(result, waiting);
  const problem = refProblem(ref);
  if (problem) return { action: 'ignore', reason: `invalid_result: ${problem}` };
  const { animation3dJob: _job, ...rest } = card;
  return { action: 'apply', block: { ...rest, type: ANIMATION3D, animation3d: freshEnvelope(ref) } };
}
