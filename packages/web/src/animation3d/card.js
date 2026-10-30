// What an Animation card shows (plan section 4, AN-03). Pure: no React, no DOM except detectWebGL's injected document.
// The card reads a validated artifact (contract.js validateAnimationArtifact's value) only through cardModel and a frame only
// through frameView. The block's saved fields are read and written only through the block helpers below.
// The saved envelope (block.animation3d: ref, sim, view) and a job in flight (block.animation3dJob) are lane A's (storage.js); a
// built-in example card names its fixture (block.fixtureId) and keeps its state in this page only.
import { ANIMATION_CAPABILITIES } from './capabilities.js';
import { resolveAnimationInputs } from './contract.js';

export const EXPERIENCE_LABELS = Object.freeze({ inspect: 'Inspect', watch: 'Loop', experiment: 'Experiment', game: 'Mini-game' });
// A fixture card is a built-in example, never presented as a generated result (AN-03 acceptance).
export const FIXTURE_LABEL = 'Example';
export const FIXTURE_NOTE = 'Built-in example scene for trying the controls. It was not generated from a request.';
export const INTERACT_LEGEND = 'Drag to orbit · Scroll to zoom · Right-drag to pan · Esc to finish';

// --- The block's fields the card reads ---
export const jobOf = block => block?.animation3dJob ?? null;
export const artifactRefOf = block => block?.animation3d?.ref ?? null;
export const fixtureIdOf = block => block?.fixtureId ?? null;

const finite = value => typeof value === 'number' && Number.isFinite(value);

// The UI model of a validated artifact: only what the card draws and dispatches. Seek and speed are capability-declared
// (prescribed and analytical scenes only); a rule-based loop restarts instead of rewinding.
export function cardModel(artifact, capabilities = ANIMATION_CAPABILITIES) {
  const seekable = capabilities.seekBehaviors.includes(artifact.behavior);
  const timeline = artifact.timeline ?? null;
  return {
    title: artifact.title,
    description: artifact.description,
    experience: artifact.experience,
    loop: timeline ? { duration: timeline.duration, repeat: !!timeline.loop, seekable, speeds: seekable ? [...capabilities.speeds] : [] } : null,
    goal: artifact.experience === 'game' && artifact.game ? { objective: artifact.game.objective, hint: artifact.game.hint ?? '' } : null,
    parameters: artifact.parameters,
    actions: artifact.actions,
    readouts: artifact.readouts,
    assumptions: artifact.assumptions ?? [],
    camera: artifact.camera,
    fixture: artifact.provenance?.origin === 'fixture',
  };
}

export const defaultInputs = artifact => resolveAnimationInputs(artifact, {});

// The controls a card offers: only those meaningful for its experience (no pointless Play on an inspect scene, no empty
// parameter panel on a passive one, no camera control without a live 3D view).
export function visibleControls(model, { webgl = true, readOnly = false } = {}) {
  const game = model.experience === 'game' && !!model.goal;
  return {
    transport: !!model.loop,
    speed: !!model.loop && model.loop.speeds.length > 1,
    resetView: webgl,
    parameters: model.parameters.length > 0,
    actions: model.actions.length > 0,
    game, hint: game && !!model.goal.hint,
    reset: model.experience === 'experiment' || game || model.parameters.length > 0 || model.actions.length > 0,
    interact: webgl,
    edit: !readOnly,
  };
}

// The card's one phase. job: the polled job (or the saved stage); renderer: 'off' | 'loading' | 'ready'.
export function cardPhase({ block, job = null, artifact = null, failure = null, webgl = true, renderer = 'off' }) {
  if (!artifact) {
    if (jobOf(block) && !artifactRefOf(block) && !fixtureIdOf(block)) {
      const stage = (job ?? jobOf(block))?.stage;
      return stage === 'failed' || stage === 'cancelled' ? 'failed' : 'pending';
    }
    return failure ? 'recovery' : 'loading';
  }
  if (failure) return 'recovery';
  if (!webgl) return 'unavailable';
  return renderer === 'ready' ? 'ready' : 'loading';
}

// The learner-facing words for a failure, by the stage that failed; Retry repeats only that stage.
const FAILURES = {
  artifact: ['The saved scene could not be read.', 'Retry loading'],
  runtime: ['The scene stopped responding. The last good state is kept.', 'Restart scene'],
  renderer: ['The 3D view could not load. The scene description and readouts still work.', 'Retry 3D view'],
};
const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
// A saved card's own words (storage.js MESSAGES, by hydration status) stand alone; unavailable, invalid and missing offer no Retry.
const SAVED = new Set(['unavailable', 'invalid', 'missing', 'mismatch', 'error']);
export const failureText = failure => (SAVED.has(failure?.code) ? failure.message : failure?.message && failure.stage !== 'runtime' ? `${FAILURES[failure.stage]?.[0] ?? 'Something went wrong.'} ${failure.message}` : FAILURES[failure?.stage]?.[0] ?? 'Something went wrong.');
export const retryLabel = failure => FAILURES[failure?.stage]?.[1] ?? 'Retry';
export const failureOf = (stage, error) => ({ stage, code: error?.code ?? null, message: clip(error?.message ?? (typeof error === 'string' ? error : ''), 300), retry: error?.retry !== false });
// A contract refusal of the artifact, as one failure: its first issue names where.
export const invalidArtifact = issues => Object.assign(new Error(`This scene did not pass its checks (${issues?.[0]?.code ?? 'invalid'} at ${issues?.[0]?.path || 'the root'}).`), { code: 'invalid_artifact' });
export const WEBGL_UNAVAILABLE = 'Interactive 3D is not available in this browser, so the scene cannot be turned or played here. Its description and readouts are below.';

// A typed value is accepted only when it is a finite number inside the declared range, snapped to the step; otherwise null
// and the control keeps the last accepted value. Toggles and selects by their declared values.
export function parameterInput(parameter, raw) {
  if (parameter.type === 'toggle') return !!raw;
  if (parameter.type === 'select') return parameter.options.find(option => String(option.value) === String(raw))?.value ?? null;
  if (raw === '' || raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) return null;
  if (!parameter.step) return value;
  const snapped = parameter.min + Math.round((value - parameter.min) / parameter.step) * parameter.step;
  return Number(Math.min(parameter.max, Math.max(parameter.min, snapped)).toFixed(decimals(parameter.step)));
}
export const decimals = step => (step && step < 1 ? Math.min(6, String(step).split('.')[1]?.length ?? 2) : 0);
export const sliderStep = parameter => parameter.step ?? (parameter.max - parameter.min) / 100;
export const formatValue = (parameter, value) => (parameter.type === 'number' ? `${Number(value).toFixed(decimals(sliderStep(parameter)))}${parameter.unit ? ` ${parameter.unit}` : ''}` : String(value));

// A frame's text side: the declared readouts with the frame's values (in declaration order) and the goal status.
export function frameView(frame, model) {
  const values = frame?.readouts ?? {};
  const readouts = (model?.readouts ?? []).filter(item => finite(values[item.id])).map(item => ({ ...item, value: values[item.id] }));
  const goal = frame?.goal ? { status: frame.goal.status, message: clip(frame.goal.message, 200) } : null;
  return { readouts, goal };
}
export const readoutText = item => `${item.value.toFixed(item.decimals)}${item.unit ? ` ${item.unit}` : ''}`;
const OUTCOMES = { playing: 'In progress', won: 'Solved', lost: 'Not solved' };
export const outcomeText = goal => (goal?.message ? goal.message : OUTCOMES[goal?.status] ?? OUTCOMES.playing);

// Learner events, as the contract defines them (validateAnimationEvent).
export const eventFor = {
  parameter: (parameter, value) => ({ type: 'parameter', parameter, value }),
  action: action => ({ type: 'action', action }),
  select: node => ({ type: 'select', node }),
};
// The runtime answers a dispatch with accepted-or-rejected.
export const accepted = result => result === true || result?.accepted === true || result?.ok === true;

// WebGL in this browser (doc injected for tests). The renderer's own load failure is still reported separately.
export function detectWebGL(doc = globalThis.document) {
  try {
    const canvas = doc?.createElement?.('canvas');
    return !!(canvas?.getContext?.('webgl2') || canvas?.getContext?.('webgl'));
  } catch { return false; }
}
