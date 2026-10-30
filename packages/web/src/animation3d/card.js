// What an Animation card shows (plan section 4, AN-03). Pure: no React, no DOM except detectWebGL's injected document.
// The card reads an accepted artifact only through cardModel and a frame only through frameView, so aligning with the
// frozen contract (contract.js, lane R) is a change to those two functions. The block's saved fields are read and written
// only through the block helpers below (lane A's storage.js replaces them).
// ponytail: field names follow plan section 5 until contract.js lands; align cardModel/frameView/eventFor then.

export const EXPERIENCE_LABELS = Object.freeze({ inspect: 'Inspect', watch: 'Loop', experiment: 'Experiment', game: 'Mini-game' });
// A fixture card is a built-in example, never presented as a generated result (AN-03 acceptance).
export const FIXTURE_LABEL = 'Example';
export const FIXTURE_NOTE = 'Built-in example scene for trying the controls. It was not generated from a request.';
export const INTERACT_LEGEND = 'Drag to orbit · Scroll to zoom · Right-drag to pan · Esc to finish';
export const LIMITS = Object.freeze({ parameters: 8, actions: 8, readouts: 24 }); // plan section 5 feature limits
const SPEEDS = [0.5, 1, 2];

// --- The block's saved fields (one place; storage.js replaces) ---
export const jobOf = block => block?.animationJob ?? null;
export const artifactRefOf = block => block?.artifactRef ?? null;
export const fixtureIdOf = block => block?.fixtureId ?? null;
export const savedSnapshot = block => block?.snapshot ?? null;
export const savedCamera = block => block?.camera ?? null;
export const posterOf = block => block?.poster ?? null;
export const withSaved = (block, { snapshot, camera } = {}) => ({ ...block, ...(snapshot !== undefined ? { snapshot } : {}), ...(camera !== undefined ? { camera } : {}) });

const text = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const list = value => (Array.isArray(value) ? value : []);

function parameterOf(raw) {
  const id = text(raw?.id, 64);
  if (!id) return null;
  const label = text(raw.label, 80) || id, unit = text(raw.unit, 16);
  if (raw.type === 'boolean' || raw.type === 'toggle') return { id, label, kind: 'toggle', default: !!raw.default };
  if (raw.type === 'select' || raw.type === 'choice') {
    const options = list(raw.options).map(option => ({ value: option?.value ?? option?.id, label: text(option?.label, 60) || String(option?.value ?? option?.id) })).filter(option => option.value != null);
    return options.length ? { id, label, kind: 'select', options, default: raw.default ?? options[0].value } : null;
  }
  if (!finite(raw.min) || !finite(raw.max) || raw.max <= raw.min) return null;
  const step = finite(raw.step) && raw.step > 0 ? raw.step : (raw.max - raw.min) / 100;
  return { id, label, kind: 'number', min: raw.min, max: raw.max, step, unit, default: finite(raw.default) ? raw.default : raw.min };
}

// The UI model of an accepted artifact: only what the card draws and dispatches.
export function cardModel(artifact) {
  const experience = Object.hasOwn(EXPERIENCE_LABELS, artifact?.experience) ? artifact.experience : 'inspect';
  const behavior = typeof artifact?.behavior === 'string' ? { kind: artifact.behavior } : artifact?.behavior ?? {};
  // Seek and speed are capability-declared: prescribed and analytical scenes only (plan section 5); rules restart.
  const seekable = behavior.seekable ?? ['prescribed', 'analytical'].includes(behavior.kind);
  const duration = finite(behavior.duration) && behavior.duration > 0 ? behavior.duration : null;
  const declared = list(behavior.speeds).filter(speed => finite(speed) && speed > 0).slice(0, 4);
  const speeds = seekable ? (declared.length ? declared : SPEEDS) : [];
  const loop = experience === 'watch' || (duration && behavior.loop) ? { duration, seekable, speeds } : null;
  const goalRaw = artifact?.goal ?? artifact?.learningGoal ?? null;
  const actions = list(artifact?.actions ?? artifact?.controls?.actions).map(action => ({ id: text(action?.id, 64), label: text(action?.label, 60) })).filter(action => action.id && action.label).slice(0, LIMITS.actions);
  const check = goalRaw && text(goalRaw.checkAction ?? goalRaw.check, 64);
  const goal = experience === 'game' && goalRaw ? { objective: text(goalRaw.objective ?? goalRaw.text, 300), hint: text(goalRaw.hint, 300), check: actions.some(action => action.id === check) ? check : null } : null;
  return {
    title: text(artifact?.title) || 'Animation',
    description: text(artifact?.description, 600),
    experience, loop, goal,
    parameters: list(artifact?.parameters ?? artifact?.controls?.parameters).map(parameterOf).filter(Boolean).slice(0, LIMITS.parameters),
    // Check is its own control; the remaining actions are the scene's buttons.
    actions: actions.filter(action => action.id !== goal?.check),
    assumptions: [...list(artifact?.assumptions), ...list(artifact?.limitations)].map(item => text(item, 300)).filter(Boolean).slice(0, 8),
    camera: artifact?.camera ?? null,
    fixture: !!(artifact?.fixture || artifact?.provenance?.fixture || artifact?.provenance?.kind === 'fixture'),
  };
}

export const defaultInputs = model => Object.fromEntries(model.parameters.map(parameter => [parameter.id, parameter.default]));

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
    game, check: game && !!model.goal.check, hint: game && !!model.goal.hint,
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
export const failureText = failure => (failure?.message && failure.stage !== 'runtime' ? `${FAILURES[failure.stage]?.[0] ?? 'Something went wrong.'} ${text(failure.message, 160)}` : FAILURES[failure?.stage]?.[0] ?? 'Something went wrong.');
export const retryLabel = failure => FAILURES[failure?.stage]?.[1] ?? 'Retry';
export const failureOf = (stage, error) => ({ stage, code: error?.code ?? null, message: text(error?.message ?? (typeof error === 'string' ? error : ''), 160) });
export const WEBGL_UNAVAILABLE = 'Interactive 3D is not available in this browser, so the scene cannot be turned or played here. Its description and readouts are below.';

// A typed number is accepted only when it is a finite value inside the declared range, snapped to the step; otherwise null
// and the control keeps the last accepted value.
export function parameterInput(parameter, raw) {
  if (parameter.kind === 'toggle') return !!raw;
  if (parameter.kind === 'select') return parameter.options.find(option => String(option.value) === String(raw))?.value ?? null;
  if (raw === '' || raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < parameter.min || value > parameter.max) return null;
  const snapped = parameter.min + Math.round((value - parameter.min) / parameter.step) * parameter.step;
  return Number(Math.min(parameter.max, Math.max(parameter.min, snapped)).toFixed(decimals(parameter.step)));
}
export const decimals = step => (step < 1 ? Math.min(6, String(step).split('.')[1]?.length ?? 2) : 0);
export const formatValue = (parameter, value) => (parameter.kind === 'number' ? `${Number(value).toFixed(decimals(parameter.step))}${parameter.unit ? ` ${parameter.unit}` : ''}` : String(value));

// A validated frame's text side: readouts and the goal status. Bounded; non-finite numbers are not shown.
export function frameView(frame) {
  const readouts = list(frame?.readouts).map(item => ({ id: text(item?.id, 64), label: text(item?.label, 80), value: item?.value, unit: text(item?.unit, 16) }))
    .filter(item => item.id && item.label && (finite(item.value) || typeof item.value === 'string')).slice(0, LIMITS.readouts);
  const goal = frame?.goal ? { status: ['playing', 'success', 'failed'].includes(frame.goal.status) ? frame.goal.status : 'playing', attempts: finite(frame.goal.attempts) ? frame.goal.attempts : 0, message: text(frame.goal.message, 200) } : null;
  return { readouts, goal };
}
export const readoutText = item => (typeof item.value === 'number' ? `${Number(item.value.toFixed(3))}${item.unit ? ` ${item.unit}` : ''}` : item.value);
const OUTCOMES = { playing: 'In progress', success: 'Solved', failed: 'Not solved yet' };
export const outcomeText = goal => (goal ? goal.message || OUTCOMES[goal.status] : OUTCOMES.playing);
export const attemptsText = goal => { const count = goal?.attempts ?? 0; return `${count} ${count === 1 ? 'attempt' : 'attempts'}`; };

// Learner events, as the runtime receives them (plan section 5 "Event").
export const eventFor = {
  parameter: (id, value) => ({ type: 'parameter', id, value }),
  action: id => ({ type: 'action', id }),
  select: id => ({ type: 'select', id }),
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
