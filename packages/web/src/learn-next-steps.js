// Professor Next Steps, browser side (docs/features/professor-next-steps.md §2.1, §2.3): the hook planner's input, built from
// structured state only (never a chat dump, never intake self-report), its staleness basis and the stopping points. Pure.
import { NEXT_STEPS_LIMITS as L, capText as cap, needsRepair, nextStepsScope, trimToFit } from '../../control-plane/src/agents/learn-next-steps.js';
import { deriveClaimStates } from './learn-tutor-evidence.js';
import { claimsOfConceptIn, holeConcept } from './learn-tutor-claims.js';
import { resolveTarget } from './learn-target.js';
import { enterHole, markOpened, openingQuestion, sameCanvas } from './learn-tutor.js';
import { safely } from './learn-tutor-trace.js';
import { TUTOR_DOMAINS } from './learn-tutor-domains.js';

const SETUP = ['intake', 'diagnostic', 'path_review'];
const claimIdsOf = section => (section?.expected_evidence || []).map(e => e?.claim).filter(id => typeof id === 'string');

// Ruling T7: structured sources only - the journey goal; a hole's hook goal, else its parent's goal (a journey's, or the
// course subject) and its title; else the course subject or canvas title. The learner's words travel as recent.question.
// Shared by the input and its basis (owner eleventh message 3): a rename that changes the goal changes the basis.
// liveTitle (fix round 3): a hole's live title (useTutor's, from the dives path); record.title is its creation-time title.
// A title that says what a canvas is about, else '' (owner 2026-10-08, blank canvases): not blank, not the default Untitled
// (start.js UNTITLED) and not an auto canvas name (canvas-<8 hex>).
export const informativeTitle = title => { const t = String(title || '').trim(); return /^(untitled( canvas)?|canvas-[0-9a-f]{8})$/i.test(t) ? '' : t; };
export function goalOf({ context = null, record = null, title = '', liveTitle = null }) {
  const domain = context?.domain ?? null, holeTitle = liveTitle || record?.title;
  const parentGoal = !record ? null : context?.source === 'dive' ? domain.context?.goal : context?.source === 'registry' ? domain.subject : null;
  const goal = context?.source === 'journey' ? domain.context?.goal || title
    // A plain canvas or a canvas-domain hole (fix round 2): the goal tutorContext built from the live title (a hole's
    // learning_goal first), so a rename reaches the input and the basis.
    // An uninformative title (blank, Untitled, an auto name) is no goal: a blank canvas then gets distinct starter hooks.
    : context?.source === 'canvas' ? informativeTitle(domain.subject || title)
    : record ? record.learning_goal || (parentGoal ? `${cap(parentGoal, 120)} - ${cap(holeTitle, 80)}` : holeTitle)
    : domain?.subject || title;
  return { goal, parentGoal };
}

// context: tutorContext's (or a hook turn's) { domain, source }, null where none resolves; a plain canvas or hole has the
// canvas domain (Task 10: empty scope, block titles as grounding). store: the canvas's Tutor session store. journey:
// useJourney's view. record/parent: a hole's dive record and its parent journey (read only). liveTitle: the hole's live
// title (fix round 3; the record title is its creation title). previous: { hooks, goals } already shown and chosen.
// describe: LearningBlocks' describeBlock when the page passes it; only its title is read.
// Returns { input, trim } - trim is structured counts beside the input, never inside it (owner sixth message 4) - or
// { problem: 'input_too_large' } when the 9000-character cap would leave a registry canvas with no claim, or nothing fits.
export function nextStepsInput({ context = null, store = null, journey = null, blocks = [], record = null, parent = null, title = '', liveTitle = null, lastTurn = null, previous = {}, basis, describe = null }) {
  const domain = context?.domain ?? null, claims = domain?.claims || {}, concepts = domain?.concepts || {}, events = store?.events || [];
  const known = id => typeof id === 'string' && Object.hasOwn(claims, id);
  const states = domain ? deriveClaimStates(events, claims) : {};
  // kind is the block type, as TutorDecisionEvent's canvas_summary.kinds. A chat card ({ id, question, answer }, no type) is
  // kind chat titled by the learner's own question - grounding only: topicOf skips it - and never its answer.
  const shown = blocks.slice(-L.blocks).map(block => {
    const chat = !block.type;
    let named = null;
    try { named = chat ? null : describe?.(block) ?? null; } catch { /* the block's own title */ }
    const t = resolveTarget(block);
    return {
      id: block.id, kind: chat ? 'chat' : cap(block.type, 40), title: cap(chat ? block.question : named?.title ?? block.title ?? block.question ?? block.prompt ?? block.text, L.block_title),
      concept_ids: t.concept_ids.filter(c => Object.hasOwn(concepts, c)).slice(0, L.ids),
      claim_ids: (domain?.targetClaims?.({ block_id: block.id, card_id: t.card_id, part_id: t.part_id, selected_object: t.selected_object, concept_ids: t.concept_ids }) || []).filter(known).slice(0, L.ids),
      practice: block.activity ? block.attemptLog?.at(-1)?.result ?? 'open' : null,
    };
  });
  const mode = context?.source === 'journey' ? 'journey' : record ? 'dive' : 'canvas';
  const sections = journey?.path?.sections || [], completed = sections.filter(s => s.status === 'completed');
  const current = mode === 'journey' ? sections.find(s => s.id === domain.sectionId) : null;
  // Completed-section claims (owner sixth message 2), from every completed section: a claim only in a completed section takes a
  // scope place only for repair - needsRepair (the validator's rule, on settled counts), or the concept a prerequisite_gap
  // claim names (a missing prerequisite), and then only while that gap claim is in the kept scope. Understood or unseen stay out.
  const done = new Set(completed.flatMap(claimIdsOf)), now = new Set(claimIdsOf(current));
  const negatives = id => events.filter(e => e.claim === id && e.settled && (e.result === 'fail' || e.result === 'misconception')).length;
  const repairState = id => needsRepair({ state: states[id]?.state, settled_negatives: negatives(id) });
  const missing = new Set(Object.values(states).filter(s => s.state === 'prerequisite_gap' && s.prerequisite).map(s => s.prerequisite));
  const repairing = id => repairState(id) || missing.has(claims[id]?.concept);
  const completedOnly = id => done.has(id) && !now.has(id);
  const active = id => !completedOnly(id) || repairing(id);
  // A completed-only claim kept only as a missing prerequisite, with no gap claim naming its concept left in this scope.
  const orphans = kept => Object.keys(kept).filter(id => completedOnly(id) && !repairState(id) && !Object.values(kept).some(c => c.state === 'prerequisite_gap' && c.prerequisite === kept[id].concept));
  // Scope priority (§2.1): the section's or hole's claims, the newest blocks' claims, claims with evidence (newest first),
  // the prerequisites of those, then completed-section claims that need repair.
  const first = (domain?.defaultClaims?.({ canvas: { dive: record ? { record } : null } }) || []).filter(known);
  const lead = [...first, ...[...shown.slice(-6).reverse().flatMap(b => b.claim_ids), ...events.map(e => e.claim).reverse().filter(known)].filter(active)];
  const prerequisites = lead.flatMap(id => [states[id]?.prerequisite, ...(claims[id].prerequisites || [])]).filter(Boolean).flatMap(c => claimsOfConceptIn(claims, c)).filter(active);
  const repair = [...done].filter(id => known(id) && !now.has(id) && repairing(id));
  // The 12 cap, from the full priority order on every pass: a missing prerequisite whose gap claim the cap cut is excluded; once
  // leaving it out lets that gap claim in, the gap claim keeps its place (pinned) and the prerequisite comes back ahead of the
  // lowest claim. A claim is excluded at most once and readmitted at most once, so the passes end.
  const order = [...new Set([...lead, ...prerequisites, ...repair])], excluded = new Set(), pinned = new Set();
  const gapsOf = (kept, id) => Object.keys(kept).filter(g => kept[g].state === 'prerequisite_gap' && kept[g].prerequisite === claims[id].concept);
  let scope;
  for (;;) {
    const pool = order.filter(id => !excluded.has(id));
    let room = L.scope_claims - pool.filter(id => pinned.has(id)).length;
    scope = nextStepsScope({ claims, concepts, order: pool.filter(id => pinned.has(id) || room-- > 0), states, events, presented: shown.flatMap(b => b.claim_ids) });
    const lost = orphans(scope.claims), back = [...excluded].filter(id => gapsOf(scope.claims, id).length);
    if (!lost.length && !back.length) break;
    for (const id of lost) excluded.add(id);
    for (const id of back) { excluded.delete(id); for (const g of gapsOf(scope.claims, id)) pinned.add(g); }
  }

  const { goal, parentGoal } = goalOf({ context, record, title, liveTitle });
  const asked = ['question', 'request'].includes(lastTurn?.kind) && lastTurn.question ? cap(lastTurn.question, L.question) : null;
  // recent names only claims and cards still in the kept input (set by fits below, after every trim step).
  const transitions = (lastTurn?.transitions || []).map(({ claim, from, to }) => ({ claim, from, to }));
  const practice = shown.filter(b => b.practice && b.practice !== 'open').map(b => ({ block_id: b.id, result: b.practice }));
  const parentStates = record?.journey && parent?.journey ? deriveClaimStates(parent.journey.evidence?.events || [], parent.journey.registry?.claims || {}) : {};
  const input = {
    mode, basis, goal: cap(goal, L.goal_text),
    ...(mode === 'journey' ? { path: {
      current: current ? { id: current.id, title: cap(current.title, 80), purpose: cap(current.purpose, 240), claim_ids: claimIdsOf(current) } : null,
      completed: completed.slice(-6).map(s => ({ id: s.id, title: cap(s.title, 80), claim_ids: claimIdsOf(s) })),
      upcoming: sections.filter(s => s.status === 'upcoming').slice(0, 4).map(s => cap(s.title, 80)),
    } } : {}),
    canvas: { blocks: shown }, scope,
    recent: {
      intent: lastTurn?.kind ?? null, ...(asked ? { question: asked } : {}),
      transitions: [], modalities: (store?.modalities || []).slice(-L.modalities), practice: [],
    },
    previous: { hooks: (previous?.hooks || []).slice(-L.previous_hooks), goals: (previous?.goals || []).slice(-L.previous_goals) },
    ...(record ? { dive: {
      title: cap(liveTitle || record.title, 80), concept: domain?.conceptOf ? holeConcept(record, domain) : null, claim_ids: first,
      parent_goal: parentGoal ? cap(parentGoal, 200) : null, parent_section: record.journey?.section_id ?? null,
      parent_states: Object.fromEntries((record.journey?.claim_ids || []).filter(id => parentStates[id]).map(id => [id, parentStates[id].state])),
    } } : {}),
    constraints: { learner: [...(store?.constraints || [])], ...(domain?.context?.constraints || {}) },
  };
  // The 9000-character cap (owner sixth message 1), by structured priority only, never titles or text (trimToFit, shared with the
  // shared route): first the least relevant, oldest cards down to the block floor that feeds the scope (a card naming no kept
  // claim, then one naming a kept claim or the newest card, then one naming an essential claim or the current section heading),
  // then the lowest-priority claims, the essential claims only after every card. Essential: the section's or hole's claims, else
  // the first claim. Every card and recent names only what is still kept; a missing prerequisite leaves with its gap claim.
  const lead1 = new Set(first), had = Object.keys(input.scope.claims), core = new Set(first.length ? first : had.slice(0, 1));
  const heading = journey?.journey?.section_plan?.heading_block_id ?? null, newest = shown.at(-1)?.id;
  const count = () => ({ block_count: input.canvas.blocks.length, claim_count: Object.keys(input.scope.claims).length });
  const sync = () => {
    const keep = input.scope.claims;
    input.recent.transitions = transitions.filter(t => Object.hasOwn(keep, t.claim)).slice(-L.transitions);
    input.recent.practice = practice.filter(p => input.canvas.blocks.some(b => b.id === p.block_id)).slice(-L.practice);
  };
  const rank = b => (b.id === heading || b.claim_ids.some(id => core.has(id)) ? 2 : b.claim_ids.length || b.id === newest ? 1 : 0);
  const before = count();
  // Never a planner input with zero usable claims where the registry offered some, and never one over the cap.
  const problem = trimToFit(input, { rank, essential: core, leaving: (_id, rest) => orphans(rest), sync });
  const after = count();
  if (problem) return { problem };
  const kept = ids => (ids.length ? ids.every(id => Object.hasOwn(input.scope.claims, id)) : null);
  return { input, trim: {
    before, after, trimmed: { block_count: before.block_count - after.block_count, claim_count: before.claim_count - after.claim_count },
    current_section_claims_kept: kept(had.filter(id => lead1.has(id))), repair_claims_kept: kept(had.filter(repairing)),
  } };
}

// FNV-1a over the trigger state: a short opaque key (the server caps a basis at 400 characters).
// ponytail: 32 bits, so one change in about 4e9 could keep a stale set; widen the hash if that ever matters.
const fnv = text => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
// §2.3: a finished Tutor turn, an evidence event (the session store's or the journey's, so an option answer outside a turn
// counts), a path version, section change or section materialized, a card added or removed (ids only, order ignored: never
// moved, selected or zoomed), a practice attempt, a graded answer, entering or leaving a hole. Task 10 fix round 1 (owner
// eleventh message 2, 3): also the effective Tutor context (context, parent: the snapshot's) - its kind (journey, dive,
// registry, canvas), the journey it stands on (a live one, or a hole's read parent), its section - and the goal the input
// is grounded on (goalOf, so a rename that changes it re-asks), and a hole's live dive title, which every hole's input carries
// (fix round 4: a renamed learning_goal hole re-asks too). Nothing else is read.
export function nextStepsBasis({ lastTurn = null, store = null, journey = null, canvasState = null, graded = 0, record = null, context = null, parent = null, title = '', liveTitle = null }) {
  const j = journey?.journey;
  return `nb_${fnv(JSON.stringify([lastTurn?.turn_id ?? null, store?.seq ?? 0, j?.evidence?.seq ?? null, journey?.path?.version ?? null, j?.active_section_id ?? null,
    j?.section_plan?.heading_block_id ?? null, (canvasState?.cards || []).map(entry => entry[0]).sort(), canvasState?.attempts ?? 0, graded, record?.dive_id ?? null, !!store?.returned,
    context?.source ?? null, j?.id ?? parent?.journey?.id ?? null, context?.domain?.sectionId ?? null, goalOf({ context, record, title, liveTitle }).goal ?? null, record ? liveTitle || record.title : null]))}`;
}

// Not a stopping point (contract §1.2): the Tutor answering, journey work (a pending action, a section being built) or
// setup, an open tray, an open Tutor question or a pending return on this canvas, or nothing to suggest from. Voice Mode is
// deliberately not an input: hooks stay visible and clickable while it is on. plain: a canvas-domain canvas that is not a
// hole. A blank plain canvas gets hooks at rest (owner 2026-10-08, reversing the eleventh message 8): grounded in an
// informative title, else three distinct starter directions (goalOf gives no goal). blocks are the canvas blocks
// (canvasApi.blocks()); chat exchanges are not among them.
export function stoppingPoint({ busy = false, journey = null, store = null, here = null, blocks = [], goal = '', plain = false }) {
  const j = journey?.journey;
  if (busy || journey?.busy || j?.pending || (j && SETUP.includes(j.state)) || journey?.trayProps) return 'not_now';
  if ((store?.open && sameCanvas(store.open.canvas, here)) || (store?.returned && sameCanvas(store.returned.parent, here))) return 'not_now';
  if (!blocks.length && !plain && !String(goal || '').trim()) return 'not_now';
  return null;
}

// The recompute policy (contract §2.3, owner section 10), pure and testable with fake timers like journeyController: a debounce
// after the last change (an implementation default), one request in flight, never two requests for one basis, nothing while
// stopped (a Tutor turn waits until it ends), and a per-tab safety ceiling, not a target: the server limits stay authoritative.
// Each basis keeps its one outcome ({ set } or { failed: 'failed' | 'limited' }), so returning to a basis shows its outcome
// again. Two roles: onSet(set, input, trim, { discarded }) records every set once as it lands, for any basis (discarded when
// its basis moved on first), so the trace sees each recomputation; previous.hooks, the no-repeat memory, grows only when a set
// is actually shown (ready for the current basis with no stop), which for a discarded set means when its basis returns.
// onShown(set) records the impression (owner tenth message): once per set, the first time it is on screen, so a discarded set
// only if its basis returns. input(previous) has nextStepsInput's shape: { input, trim } posts input and hands trim to onSet
// beside it, never inside it; { problem } is failed and posts nothing. Hooks are kept as opaque strings for previous, never
// read. Callbacks get copies of the stored set. A throwing onSet, onShown or subscriber is swallowed and counted like a trace
// sink error.
// cap here is the tab ceiling: it shadows the capText import (also cap), which this function must not call.
export function nextStepsController({ post, onSet = () => {}, onShown = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now, debounce = L.debounce_ms, cap = L.tab_cap }) {
  let basis = null, stop = 'off', build = null, shown = null, timer = null, flying = null, requests = 0, changedAt = 0, disposed = false;
  const outcomes = new Map(), listeners = new Set(), previous = { hooks: [], goals: [] };
  // Ruling F3: the builder and callers get copies, never the live record.
  const copy = () => ({ hooks: [...previous.hooks], goals: [...previous.goals] });
  const empty = { set_id: null, generated_at: null, options: [] };
  const unavailable = reason => ({ status: 'unavailable', reason, ...empty });
  // Copies, so UI code never mutates the stored set or what onSet received.
  const showing = (status, s) => ({ status, reason: null, set_id: s.set_id, generated_at: s.generated_at, options: structuredClone(s.options) });
  // The current basis first; else limited once the ceiling leaves it unasked; else the last shown set, stale; else loading.
  const view = () => {
    const entry = outcomes.get(basis);
    return stop ? unavailable(stop) : entry?.set ? showing('ready', entry.set) : entry ? unavailable(entry.failed)
      : requests >= cap && flying !== basis ? unavailable('limited') : shown ? showing('stale', shown) : { status: 'loading', reason: null, ...empty };
  };
  let told = JSON.stringify(view());
  // The set on screen (ready, no stop) is always the stale fallback; its hooks join previous only the first time it shows.
  const sync = () => {
    const entry = outcomes.get(basis);
    if (!stop && entry?.set) {
      shown = entry.set;
      if (!entry.shown) {
        entry.shown = true; previous.hooks = [...previous.hooks, ...entry.set.options.map(o => o.hook)].slice(-L.previous_hooks);
        safely(() => onShown(structuredClone(entry.set)));
      }
    }
    const text = JSON.stringify(view());
    if (text !== told) { told = text; listeners.forEach(fn => safely(fn)); }
  };
  const schedule = delay => {
    clearTimer(timer); timer = null;
    if (disposed || stop || !basis || flying !== null || outcomes.has(basis) || requests >= cap) return;
    timer = setTimer(fire, delay);
  };
  async function fire() {
    timer = null;
    if (disposed || stop || !basis || flying !== null || outcomes.has(basis)) return;
    const sent = basis;
    let outcome, built = {};
    try {
      built = build(copy());
      if (built.problem) outcome = { failed: 'failed' };
      else {
        flying = sent; requests += 1;
        const got = await post(built.input);
        const usable = o => typeof o?.id === 'string' && typeof o.hook === 'string' && !!o.selected_next_step && typeof o.selected_next_step === 'object' && !Array.isArray(o.selected_next_step);
        outcome = Array.isArray(got?.options) && got.options.length === L.options && got.options.every(usable) && new Set(got.options.map(o => o.id)).size === L.options ? { set: got } : { failed: 'failed' };
      }
    } catch (error) { outcome = { failed: error?.status === 429 ? 'limited' : 'failed' }; }
    flying = null;
    if (disposed) return;
    // ponytail: never evicted (eviction would allow a second request for a basis), so the map grows with the distinct bases
    // visited in the tab; entries are tiny ({ set } of 3 options or { failed }). Bound it by age if a tab ever lives that long.
    outcomes.set(sent, outcome);
    if (outcome.set) safely(() => onSet(structuredClone(outcome.set), built.input, built.trim, { discarded: sent !== basis }));
    sync();
    schedule(Math.max(0, changedAt + debounce - now()));
  }
  return {
    update(next) {
      if (disposed) return;
      build = next.input;
      if (next.basis === basis && (next.stop ?? null) === stop) return;
      basis = next.basis; stop = next.stop ?? null; changedAt = now();
      schedule(debounce); sync();
    },
    view,
    // An id from a replaced set is unknown; any stop is busy; one from the stale set still shown is stale. All refuse.
    select(id, { busy = false } = {}) {
      const option = (outcomes.get(basis)?.set ?? shown)?.options.find(o => o.id === id);
      if (!option) return { ok: false, reason: 'unknown' };
      if (busy || stop) return { ok: false, reason: 'busy' };
      if (view().status !== 'ready') return { ok: false, reason: 'stale' };
      previous.goals = [...previous.goals, option.selected_next_step.learning_goal].slice(-L.previous_goals);
      return { ok: true, selected_next_step: structuredClone(option.selected_next_step) };
    },
    previous: copy,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { disposed = true; clearTimer(timer); timer = null; listeners.clear(); },
  };
}

// Shared canvases (contract §1.4). A hook clicked on a shared canvas starts the viewer's own hole: carryStep keeps the
// server-checked step for that hole (by its canvas name) and the hole's first Tutor turn takes it once (LearnTutor.jsx). A hook
// clicked while signed out waits through sign-in: keepPendingStep keeps it for that share link, and takePendingStep gives it
// back once, only for the same link and hook id. Read once, removed on read; blocked storage keeps nothing (the hole opens as usual).
const CARRY = name => `small.next-step.carry:${name}`, PENDING = 'small.next-step.pending';
const read = (storage, key) => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };
const take = (storage, key) => { const value = read(storage, key); try { storage.removeItem(key); } catch { /* blocked storage */ } return value; };
const keep = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch { /* blocked storage: the hole opens as usual */ } };
export const carryStep = (storage, holeName, step) => keep(storage, CARRY(holeName), step);
export const takeCarriedStep = (storage, holeName) => take(storage, CARRY(holeName));
export const keepPendingStep = (storage, token, step) => keep(storage, PENDING, { token, suggestion_id: step.suggestion_id, step });
export function takePendingStep(storage, token, suggestionId) {
  const kept = read(storage, PENDING);
  return kept?.token === token && kept.suggestion_id === suggestionId ? take(storage, PENDING)?.step ?? null : null;
}

// The signed-in viewer's own evidence (their tab's Tutor store), only on claims of public registered courses and only claims
// with evidence, newest evidence first across every such course, at most 12 (the scope cap). The server filters it again to
// the board's own scope.
export function viewerStates(store, registry = TUTOR_DOMAINS) {
  const events = store?.events || [], out = {};
  const states = Object.assign({}, ...registry.filter(e => e.domain && e.capabilities?.suppliedCourse === true).map(e => deriveClaimStates(events, e.domain.claims)));
  for (const id of new Set(events.map(e => e?.claim).reverse())) {
    if (Object.keys(out).length >= L.scope_claims) break;
    if (states[id] && states[id].state !== 'not_yet_observed') out[id] = states[id].state;
  }
  return out;
}

// A hole's opening (LearnTutor.jsx's effect; contract §1.4, §6.4): where hook turns run, a hook carried from a shared canvas
// opens the hole once as a next_step (marked opened, so the usual opening question never follows); otherwise, where the
// Tutor is active, the pending question once (title is the live title, Task 10 fix round 4). Nothing is read or taken where
// hook turns do not run (Ruling F4), so a carried step waits for them, nor until settled: the hook context is resolved (the
// dives record and a journey hole's parent read), so a carried step never runs on the canvas domain a parent journey
// replaces. load and domain are thunks (load mints a session id). Returns { store: to save or null, opening: for setOpening
// or null }.
export function holeOpening({ storage, load, record, title = null, hookTurns, settled, active, domain }) {
  const none = { store: null, opening: null };
  if (!hookTurns || !settled || !record?.dive_id) return none;
  const carried = takeCarriedStep(storage, record.dive_id);
  if (carried) return { store: markOpened(load(), record), opening: { key: record.dive_id, next_step: carried } };
  if (!active) return none;
  const store = enterHole(load(), record, domain());
  const question = openingQuestion(store, record, title);
  return { store: question ? markOpened(store, record) : store, opening: question ? { key: record.dive_id, question } : null };
}
