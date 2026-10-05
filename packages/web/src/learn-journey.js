// Adaptive Learning Journeys (docs/features/adaptive-learning-path-v1-architecture.md). Part A: intake bank and the
// Tutor Prompt Tray model (6.2, 7.1). Part B: registry and path validators (4, 9.2), journeyStep (6.6), the diagnostic
// walker (6.3) and the contents rail entries (8). Intent and the interaction rules (6.1, 7.2) live in
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

// ---- Shared helpers for part B ----
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const has = (o, k) => isObj(o) && Object.hasOwn(o, k);
// Deep equality that ignores key order: a stored claim read back from D1 may list its keys differently.
const same = (a, b) => a === b || (a != null && b != null && typeof a === 'object' && typeof b === 'object'
  && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => same(a[k], b[k])));
const verdict = (errors) => (errors.length ? { ok: false, errors } : { ok: true });

// ---- Journey claim registry (4): same claim shape as the nanoGPT CLAIMS, so /evaluate, JEV and the derivation run
// unchanged. Field limits are validateEvaluateBody's. A claim that has any event is immutable: evidence points at it,
// so a changed claim must be a new id. ----
const CLAIM_ID = /^[a-z0-9-]+\/[a-z0-9-]+$/;
export function validateRegistry(registry, { prev = null, events = [] } = {}) {
  const { concepts, claims } = registry || {};
  if (!isObj(concepts) || !isObj(claims)) return verdict(['the registry needs concepts and claims objects']);
  const errors = [], cids = Object.keys(concepts), ids = Object.keys(claims);
  if (cids.length > 16) errors.push(`at most 16 concepts (got ${cids.length})`);
  if (ids.length > 40) errors.push(`at most 40 claims (got ${ids.length})`);
  const prereqs = (at, p) => { if (!Array.isArray(p) || p.some((c) => !has(concepts, c))) errors.push(`${at}: prerequisites must be concept ids`); };
  for (const id of cids) {
    if (!/^[a-z0-9-]+$/.test(id) || id.length > 60) errors.push(`concept ${id}: the id must be a lowercase slug of at most 60 characters`);
    prereqs(`concept ${id}`, concepts[id]?.prerequisites);
  }
  for (const id of ids) {
    const c = claims[id], at = `claim ${id}`;
    if (!CLAIM_ID.test(id) || id.length > 120) errors.push(`${at}: the id must be <concept-slug>/<claim-slug>, at most 120 characters`);
    if (!isObj(c)) { errors.push(`${at}: not an object`); continue; }
    if (c.concept !== id.split('/')[0] || !has(concepts, c.concept)) errors.push(`${at}: concept must be its id prefix and a registry concept`);
    if (!str(c.statement, 600)) errors.push(`${at}: statement must be 1-600 characters`);
    if (!str(c.drawn, 300)) errors.push(`${at}: drawn must be 1-300 characters`);
    if (!Array.isArray(c.ideas) || c.ideas.length < 1 || c.ideas.length > 4 || c.ideas.some((x) => !str(x, 300))) errors.push(`${at}: ideas must be 1-4 strings of at most 300 characters`);
    if (!Array.isArray(c.misconceptions) || c.misconceptions.length > 5 || c.misconceptions.some((m) => !str(m?.id, 80) || !str(m?.check, 300))) errors.push(`${at}: misconceptions must be at most 5 of { id ≤ 80, check ≤ 300 }`);
    prereqs(at, c.prerequisites);
    if (c.cues !== undefined && (!Array.isArray(c.cues) || c.cues.length > 12 || c.cues.some((q) => !str(q, Infinity) || q !== q.toLowerCase()))) errors.push(`${at}: cues must be at most 12 lowercase strings`);
  }
  for (const id of Object.keys(prev?.claims || {})) {
    if (events.some((e) => e?.claim === id) && !same(claims[id], prev.claims[id])) errors.push(`claim ${id} has evidence, so it cannot change or be removed`);
  }
  return verdict(errors);
}

// ---- LearningPath (9.2): the schema plus invariants 1-6, shared by the browser and the worker ----
const SECTION_KEYS = ['id', 'title', 'purpose', 'kind', 'target_concepts', 'prerequisites', 'expected_evidence', 'estimated_minutes', 'depth', 'status', 'generation_state', 'heading_block_id', 'adaptation_reason', 'from'];
const SECTION_ENUMS = {
  kind: ['core', 'refresher', 'bridge', 'review'], depth: ['overview', 'guided', 'deep'],
  status: ['upcoming', 'current', 'completed', 'optional', 'skipped', 'needs_review'], generation_state: ['not_generated', 'planning', 'generated'],
};
const EVIDENCE_KINDS = ['explain', 'predict', 'apply', 'transfer'];
const CHANGE_SOURCES = ['draft', 'learner_edit', 'evidence', 'dive_return'];
const KEPT_WHEN_COMPLETED = ['title', 'purpose', 'target_concepts', 'heading_block_id'];

export function validatePath(next, prev, registry) {
  const sections = next?.sections;
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 12) return verdict(['a path has 1-12 sections']);
  const errors = [], ids = new Set();
  sections.forEach((s, i) => {
    const at = `section ${s?.id ?? i + 1}`;
    if (!isObj(s)) return errors.push(`${at} is not an object`);
    for (const k of Object.keys(s)) if (!SECTION_KEYS.includes(k)) errors.push(`invariant 4: ${at} has the key ${k}, which is not a section field`);
    if (!str(s.id, 120) || ids.has(s.id)) errors.push(`${at}: id must be a unique string`);
    ids.add(s.id);
    if (!str(s.title, 80)) errors.push(`${at}: title must be 1-80 characters`);
    if (!str(s.purpose, 240)) errors.push(`${at}: purpose must be 1-240 characters`);
    for (const [k, allowed] of Object.entries(SECTION_ENUMS)) if (!allowed.includes(s[k])) errors.push(`${at}: ${k} must be one of ${allowed.join(', ')}`);
    if (!Array.isArray(s.target_concepts) || !Array.isArray(s.prerequisites)) errors.push(`${at}: target_concepts and prerequisites must be lists`);
    for (const c of [...(s.target_concepts || []), ...(s.prerequisites || [])]) if (!has(registry?.concepts, c)) errors.push(`invariant 5: ${at} names the unknown concept ${c}`);
    if (!Array.isArray(s.expected_evidence) || s.expected_evidence.length > 4) errors.push(`${at}: expected_evidence must be a list of at most 4`);
    for (const e of s.expected_evidence || []) {
      if (!has(registry?.claims, e?.claim)) errors.push(`invariant 5: ${at} names the unknown claim ${e?.claim}`);
      if (!EVIDENCE_KINDS.includes(e?.kind)) errors.push(`${at}: expected_evidence kind must be one of ${EVIDENCE_KINDS.join(', ')}`);
    }
    if (s.status !== 'current' && s.status !== 'completed' && s.generation_state !== 'not_generated') errors.push(`invariant 3: ${at} is ${s.status} but ${s.generation_state}`);
  });
  // 2: acceptance is what sets current_section_id, so a current section must be the one it names.
  const current = sections.filter((s) => s?.status === 'current');
  if (current.length > 1) errors.push(`invariant 2: ${current.length} sections are current`);
  if (current.length && current[0].id !== next.current_section_id) errors.push(`invariant 2: section ${current[0].id} is current, but current_section_id is ${next.current_section_id}`);
  // 1: every section completed in prev is still there, unchanged, in the same order among the completed ones.
  let last = -1;
  for (const p of (prev?.sections || []).filter((s) => s?.status === 'completed')) {
    const i = sections.findIndex((s) => s?.id === p.id);
    if (i < 0) { errors.push(`invariant 1: completed section ${p.id} was removed`); continue; }
    for (const k of KEPT_WHEN_COMPLETED) if (!same(sections[i][k], p[k])) errors.push(`invariant 1: completed section ${p.id} changed its ${k}`);
    if (i < last) errors.push(`invariant 1: completed section ${p.id} moved before an earlier completed section`);
    last = Math.max(last, i);
  }
  // 6
  if (next.version !== (prev?.version ?? 0) + 1) errors.push(`invariant 6: version must be ${(prev?.version ?? 0) + 1}, got ${next.version}`);
  if (!isObj(next.change) || !CHANGE_SOURCES.includes(next.change.source)) errors.push(`invariant 6: a version carries a change with source ${CHANGE_SOURCES.join(' | ')}`);
  return verdict(errors);
}

// ---- Diagnostic walker (6.3), deterministic ----
// Start in the middle of the ladder (prerequisite → advanced). Settled transfer or a pass steps up, a negative result
// steps down, an evaluator error moves to the nearest unasked probe with no direction (ties go to the easier probe).
// Stops after 3 asked, after two consecutive results in the same direction, when the step runs off the ladder, or on a
// skip. A non-transfer pass steps up for placement only: the walker reads results, it never writes evidence states.
const UP = ['settled_transfer', 'pass'], DOWN = ['fail', 'uncertain', 'gap', 'non_attempt'];
const PROBE_RESULTS = [...UP, ...DOWN, 'error'];
const direction = (result) => (UP.includes(result) ? 1 : DOWN.includes(result) ? -1 : 0);

export function nextProbe(diagnostic) {
  const probes = diagnostic?.probes || [], asked = diagnostic?.asked || [];
  if (diagnostic?.skipped || !probes.length) return null;
  if (!asked.length) return probes[Math.floor((probes.length - 1) / 2)];
  const dirs = asked.map((a) => direction(a.result)), d = dirs.at(-1);
  if (asked.length >= 3 || (d && d === dirs.at(-2))) return null;
  const from = probes.findIndex((p) => p.id === asked.at(-1).probe_id);
  const open = probes.map((_, i) => i).filter((i) => !asked.some((a) => a.probe_id === probes[i].id));
  const pick = d > 0 ? open.find((i) => i > from)
    : d < 0 ? open.filter((i) => i < from).at(-1)
      : open.sort((x, y) => Math.abs(x - from) - Math.abs(y - from))[0];
  return pick === undefined ? null : probes[pick];
}

// ---- State machine (6.6): the server applies journeyStep and refuses (409) anything it returns an error for ----
// Effects are the planner calls the caller runs next. A transition sets `pending` to the call it waits for; the event
// that reports the result clears it. A planner failure keeps the state and every answer, records the failed call as
// error.op, and only `retry` (which re-issues that call) is legal until it clears. `path` is passed on accept and
// path_drafted because the journey row does not hold the path (9.1); it is read for its sections only.
// ponytail: section completion, active path edits, adaptation and pause/return arrive with LP2/LP3/LP5.
const EFFECT = { diagnostic: 'plan_diagnostic', path: 'plan_path', revise: 'revise_path', section: 'plan_section' };
const AWAITS = { diagnostic_ready: ['diagnostic'], path_drafted: ['path', 'revise'], section_planned: ['section'] };

export function journeyStep(journey, event) {
  const j = journey, t = event?.type;
  if (!isObj(j) || !t) return { error: 'journeyStep needs a journey and an event type' };
  const kind = j.request?.intent?.kind ?? j.request?.intent; // the resolver's intent object, or its kind alone
  const no = (why = `is not legal in ${j.state}${j.pending ? ` while ${j.pending} is pending` : ''}`) => ({ error: `${t} ${why}` });
  const go = (over, effects = []) => ({ journey: { ...j, ...over }, effects });
  const wait = (state, op, over = {}) => go({ ...over, state, pending: op }, [EFFECT[op]]);
  // Intake is complete: a quick overview or a fast start skips the diagnostic.
  const intakeDone = (intake) => (kind === 'quick_overview' || kind === 'fast_start' ? wait('path_review', 'path', { intake }) : wait('diagnostic', 'diagnostic', { intake }));
  const accept = (path, over = {}) => {
    const first = path?.sections?.find((s) => s.status !== 'optional' && s.status !== 'skipped');
    return first ? wait('active', 'section', { ...over, active_section_id: first.id }) : no('needs a path with a section to start');
  };

  if (j.error) return t === 'retry' ? wait(j.state, j.error.op, { error: null }) : no('waits for retry after a planner failure');
  if (t === 'planner_failed') return j.pending ? go({ pending: null, error: { op: j.pending, message: String(event.message || 'The planner failed.'), retryable: true } }) : no('needs a pending planner call');
  if (AWAITS[t] ? !AWAITS[t].includes(j.pending) : j.pending != null) return no();

  switch (t) {
    case 'intake_answer': {
      if (j.state !== 'intake') return no();
      if (nextIntakeQuestion(j.intake)?.slot !== event.slot) return no(`answers ${event.slot}, which is not the open question`);
      const intake = applyIntakeAnswer(j.intake, event.slot, event.answer);
      if (intake === j.intake) return no('answers nothing');
      return nextIntakeQuestion(intake) ? go({ intake }) : intakeDone(intake);
    }
    case 'intake_skip': {
      if (j.state !== 'intake') return no();
      // An unknown answer takes the slot's default (source: 'default'), so skipping is answering every open slot with nothing.
      let intake = j.intake;
      for (let q; (q = nextIntakeQuestion(intake)); ) intake = applyIntakeAnswer(intake, q.slot, {});
      return intakeDone(intake);
    }
    case 'diagnostic_ready':
      return j.state === 'diagnostic' ? go({ pending: null }) : no();
    case 'probe_result': {
      if (j.state !== 'diagnostic') return no();
      if (!PROBE_RESULTS.includes(event.result)) return no(`has the unknown result ${event.result}`);
      if (nextProbe(j.diagnostic)?.id !== event.probe_id) return no(`answers ${event.probe_id}, which is not the open probe`);
      const diagnostic = { ...j.diagnostic, asked: [...(j.diagnostic.asked || []), { probe_id: event.probe_id, result: event.result }] };
      return nextProbe(diagnostic) ? go({ diagnostic }) : wait('path_review', 'path', { diagnostic });
    }
    case 'diagnostic_skip':
      return j.state === 'diagnostic' ? wait('path_review', 'path', { diagnostic: { ...j.diagnostic, skipped: true } }) : no();
    case 'path_drafted': {
      const version = (j.path_version || 0) + 1;
      if (event.version !== version) return no(`must be version ${version}`);
      // The planner has read every pending edit, so they clear with the new version.
      const over = { pending: null, path_version: version, pending_edits: [] };
      return j.pending === 'path' && kind === 'fast_start' ? accept(event.path, over) : go(over);
    }
    case 'path_edit': {
      // Edits wait in pending_edits (at most 5) until a path version includes them, so a retry can re-send them.
      const text = String(event.text ?? '').trim().slice(0, 300), pending_edits = [...(j.pending_edits || []), text];
      if (!text) return no('needs text');
      if (pending_edits.length > 5) return no('already has 5 edits waiting');
      if (j.state === 'intake' || j.state === 'diagnostic') return go({ pending_edits });
      return j.state === 'path_review' ? wait('path_review', 'revise', { pending_edits }) : no();
    }
    case 'accept':
      return j.state === 'path_review' ? accept(event.path) : no();
    case 'section_planned':
      return j.state === 'active' ? go({ pending: null }) : no();
    case 'section_materialized': {
      if (j.state !== 'active') return no();
      if (event.section_id == null || event.section_id !== j.active_section_id) return no(`names ${event.section_id}, which is not the current section`);
      if (!str(event.heading_block_id, 200)) return no('needs a heading_block_id');
      // The heading belongs to the current section, whose plan is the only one the journey row stores.
      return go({ section_plan: { ...j.section_plan, heading_block_id: event.heading_block_id } });
    }
    default:
      return no();
  }
}

// ---- Adaptive Contents Rail (8) ----
// `changed` diffs this version with the previous one: a new id is added; a section whose predecessor among the shared
// sections differs is moved; a changed title, purpose, kind, depth or concept list is changed. Inserting a section
// shifts the numbers of the ones after it but marks nothing else.
// ponytail: the predecessor check also marks the section that now follows a moved one; a longest-increasing-subsequence
// pass if those extra marks confuse learners.
const CONTENT_KEYS = ['title', 'purpose', 'kind', 'depth', 'target_concepts'];
export function pathEntries(path, prevPath = null) {
  const sections = path?.sections || [], before = prevPath?.sections;
  const shared = before ? sections.filter((s) => before.some((p) => p.id === s.id)).map((s) => s.id) : [];
  const sharedBefore = before ? before.filter((p) => shared.includes(p.id)).map((p) => p.id) : [];
  const predecessor = (list, id) => list[list.indexOf(id) - 1];
  return sections.map((s, i) => {
    const p = before?.find((x) => x.id === s.id);
    const changed = !before ? null
      : !p ? 'added'
        : predecessor(shared, s.id) !== predecessor(sharedBefore, s.id) ? 'moved'
          : CONTENT_KEYS.some((k) => !same(s[k], p[k])) ? 'changed' : null;
    return { id: s.id, n: i + 1, title: s.title, purpose: s.purpose, status: s.status, changed, heading_block_id: s.heading_block_id ?? null };
  });
}
