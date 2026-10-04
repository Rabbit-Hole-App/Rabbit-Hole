// Adaptive Learning Journeys, part A: intent, intake bank, interaction resolver rules and the Tutor Prompt Tray model
// (docs/features/adaptive-learning-path-v1-architecture.md 6.1, 6.2, 7). Pure ES module: no React, no DOM, no imports,
// so the browser and the control-plane worker share one copy.

export const JOURNEY_STATES = ['intake', 'diagnostic', 'path_review', 'active', 'paused', 'completed'];
export const TRAY_MODES = ['intent_intake', 'diagnostic_probe', 'path_preview', 'check_in', 'clarification', 'next_step', 'branch_choice', 'generation_proposal'];

// Every rule runs on this form, which is how punctuation can never decide: "Can we skip this?" and "can we skip this" are one text.
const norm = (s) => String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[?.!,;:]/g, '').replace(/\s+/g, ' ').trim();

// ---- Intent (6.1) ----
// ponytail: regex intent and edit rules; a model classifier when misses show
// The broad verbs are router.js LEARN_INTENT's (copied, router.js is untouched) plus "i want to understand" and "i need to learn".
const BROAD = /^(?:please )?(?:teach me|walk me through|i want to learn|i would like to learn|id like to learn|help me learn|i want to understand|i need to learn) (.+)$/;
const FOCUSED = /^(?:please )?(?:show me how to (?:build|implement|code) (.+?)|teach me how (.+?) works)$/;
const OVERVIEW = /^(?:just )?give me an? (\d+)[- ]minute (visual )?overview of (.+)$/;
const SETUP_CLAUSE = /\s*(?:skip (?:the )?setup|dont ask me (?:any )?(?:setup )?questions|no setup)\b.*$/;
const QUESTION = /^(?:what|why|how|when|who|where|which|is|are|does|do|can|explain)\b/;

const cleanTopic = (t) => (t ?? '').replace(/\s+from scratch$/, '').trim() || null;
const intent = (kind, topic = null, constraints = {}, skip_setup = false) => ({ kind, topic, constraints, skip_setup });

export function journeyIntent(text) {
  let n = norm(text);
  if (SETUP_CLAUSE.test(n)) {
    // "Skip setup and start" has no topic; "Teach me X, skip setup and just start" keeps X.
    const rest = journeyIntent(n.replace(SETUP_CLAUSE, ''));
    return intent('fast_start', rest.topic, rest.constraints, true);
  }
  let m = n.match(OVERVIEW);
  if (m) return intent('quick_overview', cleanTopic(m[3]), { minutes: Number(m[1]), depth: 'overview', ...(m[2] ? { style: 'visual' } : {}) });
  if ((m = n.match(FOCUSED))) return intent('focused_skill', cleanTopic(m[1] ?? m[2]), m[1] ? { coding: true } : {});
  if ((m = n.match(BROAD))) return intent('learning_journey', cleanTopic(m[1]));
  return intent(QUESTION.test(n) ? 'direct_question' : 'none');
}

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
// slot takes the default, so a bad answer can never make the question repeat.
export function applyIntakeAnswer(intake, slot, answer) {
  const def = INTAKE_SLOTS.find((s) => s.slot === slot);
  const slots = { ...intake.slots }, source = { ...intake.source };
  let out = { ...intake, slots, source };
  const hit = def.options.find((o) => o.id === answer?.option_id);
  if (slot === 'goal' && answer?.text) {
    slots.goal = 'other'; source.goal = 'answered'; out.goal_text = String(answer.text);
  } else if (hit) {
    slots[slot] = hit.value; source[slot] = 'answered';
  } else {
    slots[slot] = DEFAULTS[slot]; source[slot] = 'default';
  }
  // A depth the learner chose carries its default time, unless the request stated minutes.
  if (slot === 'depth' && source.minutes !== 'stated' && DEPTH_MINUTES[slots.depth]) { slots.minutes = DEPTH_MINUTES[slots.depth]; source.minutes = 'default'; }
  return out;
}

// ---- Interaction resolver rules 1-4 (7.2); rule 5 is the caller's model call ----
const ORDINALS = [['first', '1', 'one', 'a'], ['second', '2', 'two', 'b'], ['third', '3', 'three', 'c'], ['fourth', '4', 'four', 'd']];
const ORDINAL = new RegExp(`^(?:option |number |the )?(${ORDINALS.flat().join('|')})(?: one| option)?$`);
const ACCEPT = new Set(['start', 'looks good', 'lets go', 'go ahead', 'yes', 'ok', 'okay', 'sounds good', 'start with section 1']);
const CANCEL = /^(?:(?:can we|could we|please) )?(?:skip|cancel|never mind|not now|stop)(?: this| it| the assessment| setup| the setup| this one)?$/;
const EDIT = /^(?:(?:can we|could we|please) )?(?:go deeper\b.*|(?:skip|drop|remove|add|include|move|put|make (?:it|this|the path)|more|less|do) .+)$/;
const NOT_AN_OBJECT = /^(?:skip|drop|remove|do) (?:this|it|the assessment)$/;

export function resolveTurnRules(text, tray) {
  const n = norm(text);
  // Bare skip first: it must mean cancel even when a diagnostic tray carries a "Skip the assessment" option (same effect, one result).
  if (CANCEL.test(n)) return { kind: 'cancel' };
  const opts = tray?.options || [];
  const answer = (o) => ({ kind: 'tray_answer', option_id: o.id });
  // 1. exact label, ordinal, or a unique label prefix of 4+ characters
  const exact = opts.find((o) => norm(o.label) === n);
  if (exact) return answer(exact);
  const ord = n.match(ORDINAL);
  if (ord) {
    const o = opts[ORDINALS.findIndex((row) => row.includes(ord[1]))];
    if (o) return answer(o);
  }
  if (n.length >= 4) {
    const pre = opts.filter((o) => norm(o.label).startsWith(n));
    if (pre.length === 1) return answer(pre[0]);
  }
  // 2. accept words only mean "start" while a path is on offer
  if (tray?.mode === 'path_preview' && ACCEPT.has(n)) return { kind: 'tray_answer', option_id: 'start' };
  // 4. an edit verb with a path object
  if (EDIT.test(n) && !NOT_AN_OBJECT.test(n)) return { kind: 'path_edit', edit: text };
  return null;
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
      const q = nextIntakeQuestion(journey.intake, { ...(typeof r.intent === 'object' ? r.intent : {}), topic: r.topic });
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
