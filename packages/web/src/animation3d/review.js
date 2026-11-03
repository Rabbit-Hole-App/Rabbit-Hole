// The program half of one /animation review capture (AN-05 render seam, served by render/animation3d.html). Pure of the DOM: the
// page draws what this returns. The candidate is run by the SAME runtime the learner's card uses (runtime.js over the pinned QuickJS
// Worker): admitted (contract, program tuple, sourceHash), started at the requested inputs, then each requested event dispatched in
// order, then `ticks` host steps (stepped scenes), then shown at `time` (a seekable timeline only; otherwise the time the state has).
// `leadTicks` (stepped scenes, default 0) host steps run before the events, so an action on accumulated state has some to act on.
// Two review-level entries may stand among the events (they are not contract events): { type: 'advance', ticks } runs that many host steps at that
// point, so a capture can press an action, let the scene run, act on what it drew, and run again (a paused scene's lead ticks accomplish nothing);
// { type: 'resume', action, probe } runs `probe` host steps and presses the action only if the state did not change over them, so an action that
// toggles motion restarts a stopped scene and never pauses one that is running. Limits across every phase: REVIEW_LIMITS.events actions (a resume
// counts as one), REVIEW_LIMITS.ticks host steps (lead, advance, probe and final ticks together).
// The artifact must hash to request.artifactHash (sha256 of its canonical JSON, as the server's artifactHashOf), so the echoed hash
// is proof of what ran, not a copy of the request.
//   runReviewProgram(request, { workerFactory, createRuntime? }) ->
//     { ok: true, artifact, artifactHash, frame, trace: { inputs, time, events, ticks, readouts, goal?, selection?, stateHash? } }
//     | { ok: false, programError: { code, phase, diagnostic, ms? } }   the candidate's program failed (setup/engine: a renderer fault)
//     | { ok: false, error }                                            the page refuses the request itself
import { canonicalJson, sha256Hex } from '../explain-program/contract.js';
import { parameterAccepts, validateAnimationArtifact, validateAnimationEvent } from './contract.js';
import { createAnimationRuntime } from './runtime.js';

export const REVIEW_LIMITS = Object.freeze({ events: 4, ticks: 90, size: 2048 });
const isAdvance = event => event?.type === 'advance', isResume = event => event?.type === 'resume';
const wholeTicks = value => Number.isInteger(value) && value >= 1 && value <= REVIEW_LIMITS.ticks;
// The host steps a request spends in all: lead, final, every advance and every resume probe.
export const reviewTicksOf = request => (request.leadTicks ?? 0) + (request.ticks ?? 0) + (request.events ?? []).reduce((total, event) => total + (isAdvance(event) ? event.ticks : isResume(event) ? event.probe : 0), 0);
const PHASES = ['load', 'setup', 'initialize', 'reduce', 'evaluate', 'engine'];
const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

// The request's own shape, checked before anything runs. -> null | the refusal text
export function reviewRequestProblem(request) {
  if (!request || typeof request !== 'object') return 'request is not an object';
  const { view, events, ticks, leadTicks = 0, width, height, theme = 'light' } = request;
  if (typeof request.artifactHash !== 'string' || !/^[0-9a-f]{64}$/.test(request.artifactHash)) return 'artifactHash is not a SHA-256 hex digest';
  if (!view || typeof view.name !== 'string' || !finite3(view.position) || !finite3(view.target) || !(view.fov === undefined || (Number.isFinite(view.fov) && view.fov >= 10 && view.fov <= 120))) return 'view must be { name, position, target, fov? }';
  if (!Array.isArray(events) || events.filter(event => !isAdvance(event)).length > REVIEW_LIMITS.events || events.filter(isAdvance).length > REVIEW_LIMITS.events) return `events must be a list of at most ${REVIEW_LIMITS.events}`;
  for (const event of events) {
    if (isAdvance(event) && !(Object.keys(event).length === 2 && wholeTicks(event.ticks))) return 'an advance is { type, ticks } with whole ticks';
    if (isResume(event) && !(Object.keys(event).length === 3 && typeof event.action === 'string' && wholeTicks(event.probe))) return 'a resume is { type, action, probe } with whole probe ticks';
  }
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > REVIEW_LIMITS.ticks) return `ticks must be an integer from 0 to ${REVIEW_LIMITS.ticks}`;
  if (!Number.isInteger(leadTicks) || leadTicks < 0 || reviewTicksOf(request) > REVIEW_LIMITS.ticks) return `leadTicks must be an integer from 0, with ticks at most ${REVIEW_LIMITS.ticks} in all`;
  if (!Number.isFinite(request.time) || request.time < 0) return 'time must be a non-negative number';
  if (![width, height].every(side => Number.isInteger(side) && side > 0 && side <= REVIEW_LIMITS.size)) return `width and height must be integers up to ${REVIEW_LIMITS.size}`;
  if (theme !== 'light' && theme !== 'dark') return 'theme must be light or dark';
  return null;
}

const programError = (error, fallbackPhase) => ({
  ok: false,
  programError: {
    code: error?.code ?? 'runtime_error', phase: PHASES.includes(error?.phase) ? error.phase : fallbackPhase,
    diagnostic: String(error?.diagnostic ?? error?.message ?? '').slice(0, 500),
  },
});

export async function runReviewProgram(request, { workerFactory, createRuntime = createAnimationRuntime }) {
  const problem = reviewRequestProblem(request);
  if (problem) return { ok: false, error: problem };
  const parsed = validateAnimationArtifact(request.artifact);
  if (!parsed.ok) return { ok: false, error: `invalid_artifact: ${JSON.stringify(parsed.issues.slice(0, 3))}` };
  const artifact = parsed.value;
  if (await sha256Hex(canonicalJson(request.artifact)) !== request.artifactHash) return { ok: false, error: 'artifact_hash_mismatch' };
  if (request.seed !== undefined && request.seed !== artifact.seed) return { ok: false, error: 'seed_mismatch' };
  const inputs = request.inputs ?? {};
  if (artifact.parameters.some(p => !Object.hasOwn(inputs, p.id) || !parameterAccepts(p, inputs[p.id])) || Object.keys(inputs).some(key => !artifact.parameters.some(p => p.id === key))) return { ok: false, error: 'inputs must be a complete, valid set' };
  for (const event of request.events) {
    if (isAdvance(event)) continue;
    const contract = isResume(event) ? { type: 'action', action: event.action } : event;
    if (!validateAnimationEvent(contract, artifact).ok || event.type === 'step') return { ok: false, error: 'events must be declared, non-step contract events' };
  }
  const leadTicks = request.leadTicks ?? 0;
  if ((request.ticks > 0 || leadTicks > 0 || reviewTicksOf(request) > 0) && !artifact.stepped) return { ok: false, error: 'ticks need a stepped scene' };

  const errors = [];
  let frame = null;
  const runtime = createRuntime({ artifact: request.artifact, workerFactory, inputs, onFrame: next => { frame = next; }, onError: error => errors.push(error) });
  const failed = (result, phase) => programError(errors.at(-1) ?? { code: result.reason }, phase);
  try {
    try { await runtime.ready; } catch (error) { return programError(error, 'initialize'); }
    const stateful = artifact.actions.length > 0 || artifact.stepped || artifact.scene.nodes.some(node => node.selectable || node.drag);
    if (leadTicks > 0) {
      const result = await runtime.advance(leadTicks);
      if (!result.accepted) return failed(result, 'reduce');
    }
    for (const event of request.events) {
      if (isAdvance(event) || isResume(event)) {
        const before = isResume(event) ? await sha256Hex(canonicalJson(runtime.snapshot().state)) : null;
        const stepped = await runtime.advance(isAdvance(event) ? event.ticks : event.probe);
        if (!stepped.accepted) return failed(stepped, 'reduce');
        // A resume: the state did not change over the probe, so the scene is not running: press the action (a running scene is left alone).
        if (isResume(event) && before === await sha256Hex(canonicalJson(runtime.snapshot().state))) {
          const pressed = await runtime.dispatch({ type: 'action', action: event.action });
          if (!pressed.accepted) return failed(pressed, 'reduce');
        }
        continue;
      }
      const result = await runtime.dispatch(event);
      if (!result.accepted) return failed(result, stateful ? 'reduce' : 'evaluate');
    }
    if (request.ticks > 0) {
      const result = await runtime.advance(request.ticks);
      if (!result.accepted) return failed(result, 'reduce');
    }
    if (request.time > 0 && artifact.timeline) {
      const result = await runtime.seek(Math.min(request.time, artifact.timeline.duration));
      if (!result.accepted && result.reason !== 'unsupported') return failed(result, 'evaluate');
    }
    const snapshot = runtime.snapshot();
    const trace = {
      inputs: snapshot.inputs, time: snapshot.time, events: request.events, ticks: snapshot.tick, readouts: frame.readouts,
      ...(frame.goal ? { goal: frame.goal } : {}), ...(frame.selection !== undefined ? { selection: frame.selection } : {}),
      ...(snapshot.state !== null ? { stateHash: await sha256Hex(canonicalJson(snapshot.state)) } : {}),
    };
    return { ok: true, artifact, artifactHash: request.artifactHash, frame, trace };
  } finally {
    runtime.dispose();
  }
}
