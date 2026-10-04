// Adaptive Learning Journeys, part A: intake bank and the Tutor Prompt Tray model
// (docs/features/adaptive-learning-path-v1-architecture.md 6.2, 7.1). Intent and the interaction rules (6.1, 7.2) live in
// the shared resolver's extension, control-plane/src/learner-intent-journey.js (R7); callers import journeyIntent and
// interactionInterpretation from there. Pure ES module: no React, no DOM, no imports, so the browser and the
// control-plane worker share one copy.

export const JOURNEY_STATES = ['intake', 'diagnostic', 'path_review', 'active', 'paused', 'completed'];
export const TRAY_MODES = ['intent_intake', 'diagnostic_probe', 'path_preview', 'check_in', 'clarification', 'next_step', 'branch_choice', 'generation_proposal'];

// ---- Intake (6.2): a fixed bank, at most three questions, no model call ----
const opt = (id, label, value = id) => ({ id, label, value });
export const INTAKE_SLOTS = [
  { slot: 'goal', prompt: (t) => `What do you want to be able to do with ${t || 'this'}?`, options: [
    opt('intuition', 'Understand the intuition'), opt('build', 'Build it from scratch'), opt('project', 'Use it in a project'),
    opt('exam', 'Prepare for an exam or interview'), opt('other', 'Something else')] },
  { slot: 'familiarity', prompt: (t) => `How familiar are you with ${t || 'this'}?`, options: [
    opt('new', 'Completely new'), opt('seen', 'Seen it before'), opt('parts', 'Understand parts of it'), opt('comfortable', 'Fairly comfortable')] },
  { slot: 'depth', prompt: () => 'How deep should we go?', options: [
    opt('overview', 'Quick visual overview (~10 min)'), opt('guided', 'Guided understanding (~30 min)'),
    opt('deep', 'Deep dive (~1 h)'), opt('build_first', 'Build-first')] },
];
const DEFAULTS = { goal: 'intuition', familiarity: 'new', depth: 'guided' };
const DEPTH_MINUTES = { overview: 10, guided: 30, deep: 60 };

// What the request already states fills slots as `stated`. A quick overview asks only the goal, so familiarity takes its
// default; a fast start (skip setup) defaults everything.
export function slotsFromIntent(it) {
  const slots = {}, source = {};
  const put = (k, v, s) => { slots[k] = v; source[k] = s; };
  const c = it?.constraints || {};
  if (c.depth) put('depth', c.depth, 'stated');
  if (c.minutes) put('minutes', c.minutes, 'stated');
  if (c.coding) put('coding', true, 'stated');
  if (it?.kind === 'quick_overview') put('familiarity', DEFAULTS.familiarity, 'default');
  if (it?.skip_setup) for (const k of Object.keys(DEFAULTS)) if (slots[k] === undefined) put(k, DEFAULTS[k], 'default');
  return { slots, source };
}

export function nextIntakeQuestion(intake, it) {
  const q = INTAKE_SLOTS.find((s) => intake?.slots?.[s.slot] === undefined);
  return q ? { slot: q.slot, prompt: q.prompt(it?.topic), options: q.options.map(({ id, label }) => ({ id, label })) } : null;
}

// answer is { option_id } or { text }. Only goal takes free text ("something else"); an unknown option or text on another
// slot takes the default, so a bad answer can never make the question repeat. An unknown slot or blank text answers
// nothing: the intake comes back unchanged. Free text is trimmed and capped at 300 characters.
export function applyIntakeAnswer(intake, slot, answer) {
  const def = INTAKE_SLOTS.find((s) => s.slot === slot);
  const text = answer?.text == null ? null : String(answer.text).trim().slice(0, 300);
  if (!def || text === '') return intake;
  const slots = { ...intake?.slots }, source = { ...intake?.source };
  const out = { ...intake, slots, source };
  const hit = def.options.find((o) => o.id === answer?.option_id);
  if (slot === 'goal' && text) {
    slots.goal = 'other'; source.goal = 'answered'; out.goal_text = text;
  } else if (hit) {
    slots[slot] = hit.value; source[slot] = 'answered';
  } else {
    slots[slot] = DEFAULTS[slot]; source[slot] = 'default';
  }
  // A depth the learner chose carries its default time, unless the request stated minutes.
  if (slot === 'depth' && source.minutes !== 'stated' && DEPTH_MINUTES[slots.depth]) { slots.minutes = DEPTH_MINUTES[slots.depth]; source.minutes = 'default'; }
  return out;
}

// ---- Tutor Prompt Tray (7.1): recomputed from journey state after every event and reload, never persisted ----
const PREVIEW_OPTIONS = [
  { id: 'start', label: 'Start' }, { id: 'shorter', label: 'Make it shorter' }, { id: 'deeper', label: 'Go deeper' },
  { id: 'practical', label: 'More practical' }, { id: 'mathematical', label: 'More mathematical' },
];
const tray = (mode, id, prompt, options, extra = {}) => ({ id: `${mode}:${id}`, mode, prompt, options, free_text: false, dismissible: true, ...extra });

// journey/path use the 9.1/9.2 field names. In `diagnostic` the current probe is nextProbe's job (not this module's), so
// the caller passes it as signals.probe; signals.resumed marks a return to an active journey.
export function trayFor(journey, path, signals = {}) {
  if (!journey) return null;
  if (journey.pending != null) return { id: 'busy', mode: null, options: [], busy: 'Working on it...', free_text: false, dismissible: false };
  if (journey.error) return { id: 'error', mode: null, options: [{ id: 'retry', label: 'Try again' }], error: { message: journey.error.message }, free_text: false, dismissible: false };
  switch (journey.state) {
    case 'intake': {
      const r = journey.request || {};
      const q = nextIntakeQuestion(journey.intake, { topic: r.topic ?? r.intent?.topic });
      return q && tray('intent_intake', q.slot, q.prompt, q.options, { slot: q.slot, free_text: q.slot === 'goal' });
    }
    case 'diagnostic': {
      const p = signals.probe;
      if (!p) return null;
      // Probe options may carry the server-only keys correct / misconception_id: copy id and label only.
      const options = [...(p.options || []).map(({ id, label }) => ({ id, label })), { id: 'skip', label: 'Skip the assessment' }];
      return tray('diagnostic_probe', p.id, p.prompt, options, { probe_id: p.id, free_text: p.kind === 'explain_back' });
    }
    case 'path_review':
      return tray('path_preview', path?.version ?? journey.path_version ?? 0, 'Here is your path. Start, or adjust it.', PREVIEW_OPTIONS);
    case 'active':
      return signals.resumed
        ? tray('next_step', journey.id, 'Welcome back. How do you want to pick up?', [
          { id: 'continue', label: 'Continue' }, { id: 'recap', label: 'Quick recap' },
          { id: 'revisit', label: signals.previous_concept ? `Revisit ${signals.previous_concept}` : 'Revisit the last idea' }])
        : null;
    default:
      return null;
  }
}
