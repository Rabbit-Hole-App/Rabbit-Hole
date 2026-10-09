// Adaptive Learning Journeys (docs/features/adaptive-learning-path-v1-architecture.md). Part A: intake bank and the
// Tutor Prompt Tray model (6.2, 7.1). Part B: registry and path validators (4, 9.2), journeyStep (6.6), the diagnostic
// walker (6.3) and the contents rail entries (8). Intent and the interaction rules (6.1, 7.2) live in
// the shared resolver's extension, control-plane/src/learner-intent-journey.js (R7); callers import journeyIntent and
// interactionInterpretation from there. Pure ES module: no React, no DOM, so the browser and the control-plane worker share
// one copy; its one import is the evidence module (claimCoverage, deriveClaimStates), so section completion, the path outcome and
// understood read the same evidence.

import { claimCoverage, deriveClaimStates } from './learn-tutor-evidence.js';

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

// ---- Contract caps: limits on any journey, never the size of an example ----
// architecture §4 (registry caps, cues), §6.3 (the walker asks at most 3), §6.6 (pending edits), §9.2 (path sections,
// expected_evidence), §9.3 (teaching steps, checks), §9.4 (probes, probe claims, options). One copy, shared by the
// browser, the worker and the planners' validators (agents/learn-journey.js).
export const JOURNEY_LIMITS = Object.freeze({
  concepts: 16, claims: 40, cues: 12, sections: 12, expected_evidence: 4, asked: 3, pending_edits: 5,
  probes_min: 2, probes_max: 4, probe_claims: 3, options_max: 4, steps_min: 2, steps_max: 6, checks: 3,
});
const L = JOURNEY_LIMITS;

// ---- Shared helpers for part B ----
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const has = (o, k) => isObj(o) && Object.hasOwn(o, k);
// Planner output is the trust boundary: iterate what should be a list without throwing (the shape check reports it).
const list = (v) => (Array.isArray(v) ? v : []);
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
  if (cids.length > L.concepts) errors.push(`at most ${L.concepts} concepts (got ${cids.length})`);
  if (ids.length > L.claims) errors.push(`at most ${L.claims} claims (got ${ids.length})`);
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
    if (c.cues !== undefined && (!Array.isArray(c.cues) || c.cues.length > L.cues || c.cues.some((q) => !str(q, Infinity) || q !== q.toLowerCase()))) errors.push(`${at}: cues must be at most ${L.cues} lowercase strings`);
  }
  for (const id of Object.keys(prev?.claims || {})) {
    if (list(events).some((e) => e?.claim === id) && !same(claims[id], prev.claims[id])) errors.push(`claim ${id} has evidence, so it cannot change or be removed`);
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
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > L.sections) return verdict([`a path has 1-${L.sections} sections`]);
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
    for (const c of [...list(s.target_concepts), ...list(s.prerequisites)]) if (!has(registry?.concepts, c)) errors.push(`invariant 5: ${at} names the unknown concept ${c}`);
    if (!Array.isArray(s.expected_evidence) || s.expected_evidence.length > L.expected_evidence) errors.push(`${at}: expected_evidence must be a list of at most ${L.expected_evidence}`);
    for (const e of list(s.expected_evidence)) {
      if (!has(registry?.claims, e?.claim)) errors.push(`invariant 5: ${at} names the unknown claim ${e?.claim}`);
      if (!EVIDENCE_KINDS.includes(e?.kind)) errors.push(`${at}: expected_evidence kind must be one of ${EVIDENCE_KINDS.join(', ')}`);
    }
    if (s.status !== 'current' && s.status !== 'completed' && s.generation_state !== 'not_generated') errors.push(`invariant 3: ${at} is ${s.status} but ${s.generation_state}`);
  });
  // 2: acceptance is what sets current_section_id, so a current section must be the one it names.
  const current = sections.filter((s) => s?.status === 'current');
  if (current.length > 1) errors.push(`invariant 2: ${current.length} sections are current`);
  if (current.length && current[0].id !== next.current_section_id) errors.push(`invariant 2: section ${current[0].id} is current, but current_section_id is ${next.current_section_id}`);
  if (next.current_section_id != null && !ids.has(next.current_section_id)) errors.push(`invariant 2: current_section_id ${next.current_section_id} names no section`);
  // 1: every section completed in prev is still there, still completed (a historical anchor: a shaky concept gets a new
  // review section instead), unchanged, and in the same order among the completed ones.
  let last = -1;
  for (const p of list(prev?.sections).filter((s) => s?.status === 'completed')) {
    const i = sections.findIndex((s) => s?.id === p.id);
    if (i < 0) { errors.push(`invariant 1: completed section ${p.id} was removed`); continue; }
    if (sections[i].status !== 'completed') errors.push(`invariant 1: completed section ${p.id} must stay completed`);
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
  if (asked.length >= L.asked || (d && d === dirs.at(-2))) return null;
  const from = probes.findIndex((p) => p.id === asked.at(-1).probe_id);
  const open = probes.map((_, i) => i).filter((i) => !asked.some((a) => a.probe_id === probes[i].id));
  const pick = d > 0 ? open.find((i) => i > from)
    : d < 0 ? open.filter((i) => i < from).at(-1)
      : open.sort((x, y) => Math.abs(x - from) - Math.abs(y - from))[0];
  return pick === undefined ? null : probes[pick];
}

// ---- Moving on (owner 2026-10-08, r29) ----
// The section after the current one that the learner can move to: the first upcoming one after it in the path, or null (the
// last section, no path, or not active). path: the journey's current path version.
export function nextSectionOf(journey, path) {
  const sections = list(path?.sections), at = sections.findIndex((s) => s?.id === journey?.active_section_id);
  if (journey?.state !== 'active' || at < 0) return null;
  return sections.slice(at + 1).find((s) => s?.status === 'upcoming') ?? null;
}
// Whether the current section's completion_evidence (its plan's own criterion, §9.3) holds on the journey's current evidence
// (claimCoverage, the rule understood reads; beta item 5b): attempted is any answer on the claim; demonstrated_here, no idea
// currently failed and at least one currently passed (or, for a claim with no ideas, its latest settled answer a pass);
// demonstrated_in_transfer, that plus a settled transfer pass with no later negative. Looser than understood (which needs every
// idea), and a pass the learner later got wrong no longer counts. Missing evidence is never met; a plan with no criterion is not
// complete. -> { met, attempted, missing: [claim ids] }: attempted, every criterion claim has at least one answer.
const answered = (e) => e.result !== 'non_attempt';
function meets(events, claim, minimum, claims) {
  if (minimum === 'attempted') return events.some((e) => e?.claim === claim && answered(e));
  const c = claimCoverage(events, claim, claims), ideas = list(claims?.[claim]?.ideas);
  const last = events.filter((e) => e?.claim === claim && e.settled && (e.result === 'pass' || e.result === 'fail' || e.result === 'misconception')).sort((a, b) => a.seq - b.seq).at(-1);
  const here = !c.failed_ideas.length && (ideas.length ? c.settled_ideas.length > 0 : last?.result === 'pass');
  return minimum === 'demonstrated_here' ? here : minimum === 'demonstrated_in_transfer' ? here && c.transfer : false;
}
// The honest outcome of a finished path (beta hardening, owner 2026-10-09): its sections by status - completed, skipped, and not
// reached (upcoming, current or needs_review; an optional one counts nowhere) - and the claims its non-optional sections expect,
// understood on current evidence (deriveClaimStates) or a gap with its current state. result: completed when no section was
// skipped or left unreached, else incomplete. A completed section is never an understood claim.
export function journeyOutcome(journey, path) {
  const sections = list(path?.sections), ids = (...statuses) => sections.filter((s) => statuses.includes(s?.status)).map((s) => s.id);
  const claims = journey?.registry?.claims || {}, states = deriveClaimStates(list(journey?.evidence?.events), claims);
  const wanted = [...new Set(sections.filter((s) => s?.status !== 'optional').flatMap((s) => list(s?.expected_evidence).map((e) => e?.claim)))].filter((id) => claims[id]);
  const understood = wanted.filter((id) => states[id]?.state === 'understood');
  const by = { completed: ids('completed'), skipped: ids('skipped'), not_reached: ids('upcoming', 'current', 'needs_review') };
  return { result: by.skipped.length || by.not_reached.length ? 'incomplete' : 'completed', sections: by, understood,
    gaps: wanted.filter((id) => !understood.includes(id)).map((claim) => ({ claim, state: states[claim]?.state ?? 'not_yet_observed' })) };
}
export function sectionCompletion(journey) {
  const wanted = list(journey?.section_plan?.completion_evidence), events = list(journey?.evidence?.events), claims = journey?.registry?.claims || {};
  const missing = wanted.filter((c) => !meets(events, c?.claim, c?.minimum, claims)).map((c) => c?.claim);
  return { met: wanted.length > 0 && !missing.length, attempted: wanted.length > 0 && wanted.every((c) => meets(events, c?.claim, 'attempted', claims)), missing };
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
  // Only the version the journey is on can be accepted: a stale path would start the wrong section.
  const accept = (path, version, over = {}) => {
    if (path?.version !== version) return no(`needs path version ${version}, got ${path?.version}`);
    const first = list(path.sections).find((s) => s?.status !== 'optional' && s?.status !== 'skipped');
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
      return j.pending === 'path' && kind === 'fast_start' ? accept(event.path, version, over) : go(over);
    }
    case 'path_edit': {
      // Edits wait in pending_edits (at most 5) until a path version includes them, so a retry can re-send them.
      const text = String(event.text ?? '').trim().slice(0, 300), pending_edits = [...(j.pending_edits || []), text];
      if (!text) return no('needs text');
      if (pending_edits.length > L.pending_edits) return no(`already has ${L.pending_edits} edits waiting`);
      if (j.state === 'intake' || j.state === 'diagnostic') return go({ pending_edits });
      return j.state === 'path_review' ? wait('path_review', 'revise', { pending_edits }) : no();
    }
    case 'accept':
      return j.state === 'path_review' ? accept(event.path, j.path_version) : no();
    case 'section_planned':
      return j.state === 'active' ? go({ pending: null }) : no();
    case 'next_section': {
      // Owner 2026-10-08 (r29): the learner moves on. The next upcoming section becomes current and is planned, as accept plans
      // the first; the route records the section left as completed or skipped (sectionCompletion) in the same path version.
      if (j.state !== 'active') return no();
      if (event.path?.version !== j.path_version) return no(`needs path version ${j.path_version}, got ${event.path?.version}`);
      const next = nextSectionOf(j, event.path);
      if (next) return wait('active', 'section', { active_section_id: next.id, section_plan: null });
      // Beta hardening (owner 2026-10-09): from the last section, moving on finishes the journey. No planner runs; the last section
      // stays active_section_id (its heading and cards stay the rail's and the Tutor's), and the route records the outcome.
      return list(event.path?.sections).some((s) => s?.id === j.active_section_id) ? go({ state: 'completed' }) : no('has no next section');
    }
    case 'section_materialized': {
      if (j.state !== 'active') return no();
      if (event.section_id == null || event.section_id !== j.active_section_id) return no(`names ${event.section_id}, which is not the current section`);
      if (!str(event.heading_block_id, 200)) return no('needs a heading_block_id');
      // Final review B-M1: a recorded heading is never replaced (a replay from a second tab, which the route steps through
      // here too); the same id is idempotent.
      const had = j.section_plan?.heading_block_id;
      if (had && had !== event.heading_block_id) return no(`names ${event.heading_block_id}, but the section already has heading ${had}`);
      // The heading belongs to the current section, whose plan is the only one the journey row stores. The browser posts
      // this only once the board holding the section is saved (§6.5.5, LP1 Task 15), so the section is generated now.
      return go({ section_plan: { ...j.section_plan, heading_block_id: event.heading_block_id, generation_state: 'generated' } });
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
