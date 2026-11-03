// The program half of one /animation review capture (AN-05 render seam, served by render/animation3d.html). Pure of the DOM: the
// page draws what this returns. The candidate is run by the SAME runtime the learner's card uses (runtime.js over the pinned QuickJS
// Worker): admitted (contract, program tuple, sourceHash), started at the requested inputs, then each requested event dispatched in
// order, then `ticks` host steps (stepped scenes), then shown at `time` (a seekable timeline only; otherwise the time the state has).
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
const PHASES = ['load', 'setup', 'initialize', 'reduce', 'evaluate', 'engine'];
const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

// The request's own shape, checked before anything runs. -> null | the refusal text
export function reviewRequestProblem(request) {
  if (!request || typeof request !== 'object') return 'request is not an object';
  const { view, events, ticks, width, height, theme = 'light' } = request;
  if (typeof request.artifactHash !== 'string' || !/^[0-9a-f]{64}$/.test(request.artifactHash)) return 'artifactHash is not a SHA-256 hex digest';
  if (!view || typeof view.name !== 'string' || !finite3(view.position) || !finite3(view.target) || !(view.fov === undefined || (Number.isFinite(view.fov) && view.fov >= 10 && view.fov <= 120))) return 'view must be { name, position, target, fov? }';
  if (!Array.isArray(events) || events.length > REVIEW_LIMITS.events) return `events must be a list of at most ${REVIEW_LIMITS.events}`;
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > REVIEW_LIMITS.ticks) return `ticks must be an integer from 0 to ${REVIEW_LIMITS.ticks}`;
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
  for (const event of request.events) if (!validateAnimationEvent(event, artifact).ok || event.type === 'step') return { ok: false, error: 'events must be declared, non-step contract events' };
  if (request.ticks > 0 && !artifact.stepped) return { ok: false, error: 'ticks need a stepped scene' };

  const errors = [];
  let frame = null;
  const runtime = createRuntime({ artifact: request.artifact, workerFactory, inputs, onFrame: next => { frame = next; }, onError: error => errors.push(error) });
  const failed = (result, phase) => programError(errors.at(-1) ?? { code: result.reason }, phase);
  try {
    try { await runtime.ready; } catch (error) { return programError(error, 'initialize'); }
    const stateful = artifact.actions.length > 0 || artifact.stepped || artifact.scene.nodes.some(node => node.selectable || node.drag);
    for (const event of request.events) {
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
