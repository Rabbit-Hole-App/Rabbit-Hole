// Professor Next Steps, browser side (docs/features/professor-next-steps.md §2.1, §2.3): the hook planner's input, built from
// structured state only (never a chat dump, never intake self-report), its staleness basis and the stopping points. Pure.
import { NEXT_STEPS_LIMITS as L, STATES, capText as cap, trimToFit } from '../../control-plane/src/agents/learn-next-steps.js';
import { resolveTarget } from './learn-target.js';

// Tutor decision telemetry is gone with the browser Tutor; these two outlived it. safely runs a callback so a throwing sink or
// subscriber never fails the caller, and counts the swallowed error (globalThis.__smallTutorTraceErrors).
export const count = () => { globalThis.__smallTutorTraceErrors = (globalThis.__smallTutorTraceErrors || 0) + 1; };
export const safely = build => { try { return build(); } catch { count(); return null; } };

// The hook planner's input in telemetry terms: claim ids by state, the canvas's block kinds and presented claims, targets. The
// server stores it beside a shared set (learn-next-steps-routes.js).
const byState = pairs => Object.fromEntries(STATES.map(state => [state, pairs.filter(([, s]) => s === state).map(([id]) => id)]));
const tally = names => { const out = {}; for (const name of names) out[name] = (out[name] || 0) + 1; return out; };
export function inputSummary(input) {
  const claims = input?.scope?.claims || {}, blocks = input?.canvas?.blocks || [];
  return {
    evidence_summary: byState(Object.entries(claims).map(([id, claim]) => [id, claim?.state])),
    canvas_summary: { blocks: blocks.length, kinds: tally(blocks.map(block => block.kind)), presented_claim_ids: [...new Set(blocks.flatMap(block => block.claim_ids || []))] },
    target_concept_ids: [...new Set(Object.values(claims).map(claim => claim?.concept).filter(Boolean))], target_claim_ids: Object.keys(claims),
  };
}

// A title that says what a canvas is about, else '' (owner 2026-10-08, blank canvases): not blank, not the default Untitled
// (start.js UNTITLED) and not an auto canvas name (canvas-<8 hex>).
export const informativeTitle = title => { const t = String(title || '').trim(); return /^(untitled( canvas)?|canvas-[0-9a-f]{8})$/i.test(t) ? '' : t; };
// Owner task 2 (2026-10-13, Curious): a plain canvas's title is background, never its goal (sent as canvas.title): the planner reads
// the canvas's content for what the learner is working on, and the title only when the canvas holds nothing. A hole's goal is its
// learning_goal, else its live title (liveTitle: the dives path's, record.title is its creation-time title), else the canvas title.
// Shared by the input and its basis (owner eleventh message 3): a rename that changes the goal changes the basis.
export function goalOf({ record = null, title = '', liveTitle = null }) {
  const holeTitle = liveTitle || record?.title;
  if (!record) return { goal: '', parentGoal: null, background: informativeTitle(liveTitle || title) };
  return { goal: informativeTitle(record.learning_goal || holeTitle || title), parentGoal: null, background: '' };
}

// Owner task 2: the canvas's native content, from the shared snapshot (canvas-semantics.js semanticSnapshot, already
// budgeted and free of hidden practice answers): objects with their words, relations with their source (connector,
// annotation or inferred), groups, and what the budget cut. Positions never travel.
// fingerprint names the snapshot this content came from, so the request carries what its basis says.
const nativeOf = snapshot => (!snapshot ? {} : {
  objects: (snapshot.objects || []).map(({ id, kind, text, groupId, sectionId }) => ({ id, kind, text, ...(groupId ? { groupId } : {}), ...(sectionId ? { sectionId } : {}) })),
  relations: snapshot.relations || [], groups: snapshot.groups || [], omitted: snapshot.omitted || { objects: 0, chars: 0 }, fingerprint: snapshot.fingerprint,
});

// record: a hole's dive record (read only). liveTitle: the hole's live title. lastTurn: the last finished turn the page knows, if
// any ({ kind, question }). previous: { hooks, goals } already shown and chosen. describe: LearningBlocks' describeBlock when the
// page passes it; only its title is read. snapshot: the canvas's semantic snapshot (canvasApi.semantic(), owner task 2), its native
// content carried beside the cards. The input is the canvas's own content (Tutor cleanup P1): no claims, evidence states, journey
// sections or Tutor session; the scope stays empty, which the planner reads as a plain canvas.
// Returns { input, trim } - trim is structured counts beside the input, never inside it (owner sixth message 4) - or
// { problem: 'input_too_large' } when nothing fits the 9000-character cap.
export function nextStepsInput({ blocks = [], record = null, title = '', liveTitle = null, lastTurn = null, previous = {}, basis, describe = null, snapshot = null }) {
  // kind is the block type. A chat card ({ id, question, answer }, no type) is kind chat titled by the learner's own question -
  // grounding only: topicOf skips it - and never its answer.
  const words = new Map((snapshot?.cards || []).map(card => [card.id, card.text]));
  const shown = blocks.slice(-L.blocks).map(block => {
    const chat = !block.type, text = chat ? '' : words.get(block.id) || '';
    let named = null;
    try { named = chat ? null : describe?.(block) ?? null; } catch { /* the block's own title */ }
    return {
      id: block.id, kind: chat ? 'chat' : cap(block.type, 40), title: cap(chat ? block.question : named?.title ?? block.title ?? block.question ?? block.prompt ?? block.text, L.block_title),
      concept_ids: [], claim_ids: [],
      practice: block.activity ? block.attemptLog?.at(-1)?.result ?? 'open' : null,
      // Owner task 2: the card's visible words (the snapshot's, budgeted; never a hidden answer), so a text edit re-plans.
      ...(text ? { text } : {}),
    };
  });
  const { goal, background } = goalOf({ record, title, liveTitle });
  const asked = ['question', 'request'].includes(lastTurn?.kind) && lastTurn.question ? cap(lastTurn.question, L.question) : null;
  const practice = shown.filter(b => b.practice && b.practice !== 'open').map(b => ({ block_id: b.id, result: b.practice }));
  const input = {
    mode: record ? 'dive' : 'canvas', basis, goal: cap(goal, L.goal_text),
    canvas: { ...(background ? { title: cap(background, L.block_title) } : {}), blocks: shown, ...nativeOf(snapshot) }, scope: { concepts: {}, claims: {} },
    recent: { intent: lastTurn?.kind ?? null, ...(asked ? { question: asked } : {}), transitions: [], modalities: [], practice: [] },
    previous: { hooks: (previous?.hooks || []).slice(-L.previous_hooks), goals: (previous?.goals || []).slice(-L.previous_goals) },
    ...(record ? { dive: { title: cap(liveTitle || record.title, 80), concept: null, claim_ids: [], parent_goal: null, parent_section: null, parent_states: {} } } : {}),
    constraints: { learner: [] },
  };
  // The 9000-character cap (owner sixth message 1), by structured priority only, never titles or text (trimToFit, shared with the
  // shared route): the least relevant, oldest cards go first down to the block floor, the newest card last.
  const newest = shown.at(-1)?.id;
  const sizes = () => ({ block_count: input.canvas.blocks.length, claim_count: 0 });
  const sync = () => { input.recent.practice = practice.filter(p => input.canvas.blocks.some(b => b.id === p.block_id)).slice(-L.practice); };
  const before = sizes();
  const problem = trimToFit(input, { rank: b => (b.id === newest ? 1 : 0), sync });
  if (problem) return { problem };
  const after = sizes();
  return { input, trim: { before, after, trimmed: { block_count: before.block_count - after.block_count, claim_count: 0 } } };
}

// The basis with the canvas repository's commit (repo-graph Release 1): short, so it stays inside the server's 400-character
// cap; no commit leaves the basis as it was.
export const repositoryBasis = (basis, commit) => (basis && commit ? `${basis}@${String(commit).slice(0, 12)}` : basis);

// FNV-1a over the trigger state: a short opaque key (the server caps a basis at 400 characters).
// ponytail: 32 bits, so one change in about 4e9 could keep a stale set; widen the hash if that ever matters.
const fnv = text => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
// §2.3: a finished turn, a card added or removed (ids only, order ignored: never moved, selected or zoomed), a practice attempt,
// a graded answer, entering or leaving a hole, the goal the input is grounded on (goalOf, so a rename that changes it re-asks) and
// a hole's live dive title (a renamed learning_goal hole re-asks too). Owner task 2: the plain canvas's background title and the
// canvas's semantic fingerprint (words, labels, kinds, relations and groups; never positions, selection or camera), so a text
// edit with the same ids re-asks. Nothing else is read.
export function nextStepsBasis({ lastTurn = null, canvasState = null, graded = 0, record = null, title = '', liveTitle = null, fingerprint = null }) {
  const { goal, background } = goalOf({ record, title, liveTitle });
  return `nb_${fnv(JSON.stringify([lastTurn?.turn_id ?? null, (canvasState?.cards || []).map(entry => entry[0]).sort(), canvasState?.attempts ?? 0, graded,
    record?.dive_id ?? null, goal ?? null, record ? liveTitle || record.title : null, background, fingerprint]))}`;
}

// Not a stopping point (contract §1.2): a turn answering, or nothing to suggest from. Voice Mode is deliberately not an input:
// hooks stay visible and clickable while it is on. plain: a canvas that is not a hole. A blank plain canvas gets hooks at rest
// (owner 2026-10-08, reversing the eleventh message 8): grounded in an informative title, else three distinct starter directions
// (goalOf gives no goal). blocks are the canvas blocks (canvasApi.blocks()); chat exchanges are not among them. objects: how many
// native objects it holds (owner task 2): a canvas of shapes and text alone is not blank.
export function stoppingPoint({ busy = false, blocks = [], objects = 0, goal = '', plain = false }) {
  if (busy) return 'not_now';
  if (!blocks.length && !objects && !plain && !String(goal || '').trim()) return 'not_now';
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
  // Owner task 2: the canvas's words are changing and not yet read (settling): the set on screen is stale at once, and
  // nothing is asked until they settle into a basis.
  let settling = false;
  // A learner's Refresh (owner brief 2 item 6): { basis, status: 'loading' | 'error', reason } while it runs or after it failed.
  let again = null;
  // Owner task 2: Refreshes landed per basis, so each Refresh is one operation, r<n>: a retry reuses its id (the server's
  // cache answers a retry it already paid for), the next id only after one landed.
  const refreshed = new Map();
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
    const out = stop ? unavailable(stop) : settling ? (shown ? showing('stale', shown) : { status: 'loading', reason: null, ...empty }) : entry?.set ? showing('ready', entry.set) : entry ? unavailable(entry.failed)
      : requests >= cap && flying !== basis ? unavailable('limited') : shown ? showing('stale', shown) : { status: 'loading', reason: null, ...empty };
    // The set on screen stays while a refresh runs and after one fails; the card shows the refresh's own state beside it.
    return again && again.basis === basis && out.status === 'ready' ? { ...out, refresh_state: again.status, ...(again.reason ? { refresh_reason: again.reason } : {}) } : out;
  };
  const usableSet = got => {
    const usable = o => typeof o?.id === 'string' && typeof o.hook === 'string' && !!o.selected_next_step && typeof o.selected_next_step === 'object' && !Array.isArray(o.selected_next_step);
    return Array.isArray(got?.options) && got.options.length === L.options && got.options.every(usable) && new Set(got.options.map(o => o.id)).size === L.options;
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
    if (disposed || stop || settling || !basis || flying !== null || outcomes.has(basis) || requests >= cap) return;
    timer = setTimer(fire, delay);
  };
  async function fire() {
    timer = null;
    if (disposed || stop || settling || !basis || flying !== null || outcomes.has(basis)) return;
    const sent = basis;
    let outcome, built = {};
    try {
      built = build(copy());
      if (built.problem) outcome = { failed: 'failed' };
      else {
        flying = sent; requests += 1;
        const got = await post(built.input);
        outcome = usableSet(got) ? { set: got } : { failed: 'failed' };
      }
    } catch (error) { outcome = { failed: error?.status === 429 ? 'limited' : error?.reason === 'curious_empty' ? 'curious_empty' : 'failed' }; }
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
      if (next.basis === basis && (next.stop ?? null) === stop && !!next.settling === settling) return;
      basis = next.basis; stop = next.stop ?? null; settling = !!next.settling; changedAt = now();
      if (again && again.basis !== basis) again = null;
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
    // Refresh: a new set for the basis on screen, through the same post (its authorization, model and spend limits; it
    // counts toward the tab ceiling). Never while one flies or a stop holds; the shown set stays until the new one is
    // usable; a failure keeps it and says so (retryable); a reply for a basis the canvas has left is dropped. Returns
    // whether a request went out. Sends no chat message and changes nothing on the canvas.
    refresh() {
      if (disposed || stop || settling || !basis || flying !== null || !outcomes.get(basis)?.set) return false;
      const sent = basis;
      if (requests >= cap) { again = { basis: sent, status: 'error', reason: 'limited' }; sync(); return false; }
      again = { basis: sent, status: 'loading' };
      flying = sent; requests += 1;
      const operation = (refreshed.get(sent) || 0) + 1;
      sync();
      (async () => {
        let got = null, built = {}, reason = null;
        try {
          built = build(copy());
          if (built.problem) reason = 'failed';
          else got = await post(built.input, { refresh: `r${operation}` });
        } catch (error) { reason = error?.status === 429 ? 'limited' : 'failed'; }
        flying = null;
        if (disposed) return;
        if (!reason && usableSet(got)) refreshed.set(sent, operation);
        if (sent !== basis) { again = null; sync(); schedule(Math.max(0, changedAt + debounce - now())); return; }
        if (!reason && usableSet(got)) {
          again = null;
          outcomes.set(sent, { set: got });
          safely(() => onSet(structuredClone(got), built.input, built.trim, { discarded: false, refreshed: true }));
        } else again = { basis: sent, status: 'error', reason: reason || 'failed' };
        sync();
      })();
      return true;
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

// Professor Next Steps under the Tutor controls (owner 3a; conflicts.md Q5 "hooks"). Hooks are proactive: only while
// `allowed` (Tutor selected, On, unpaused, the saved controls read). Opening, restoring, selecting Tutor or switching it On
// asks nothing: the trigger at that moment is the baseline, and only a meaningful learner change after it asks - a finished
// Tutor turn, journey evidence or a path or section move, a graded practice attempt (hooksTrigger). A title change, saved
// content loading, moved cards and Tutor-made cards are not triggers, and they never re-ask an existing set: the basis the
// controller keys on is the full basis taken when the trigger last changed. `visible` false (Chat closed) holds them back
// without forgetting the baseline. memory is the caller's own object, one per mount.
// shown false (View > Curious off, owner brief 2026-10-21 message 25 item 2): nothing is asked, learner turns included, and the
// last set stays saved. Shown again, that saved set comes back as it was and nothing is asked for the turns made while hidden;
// with none saved the stop is 'curious_empty' (the card's explicit request, memory.ask, asks once). Tutor's rules still come
// first: shown never brings back what Off or paused hides.
export const hooksTrigger = ({ lastTurn = null, canvasState = null, graded = 0 }) => JSON.stringify([lastTurn?.turn_id ?? null, canvasState?.attempts ?? 0, graded]);
export function gateHooks(memory, state, { allowed, visible = true, shown = true, trigger }) {
  if (!allowed) { memory.baseline = memory.trigger = memory.basis = null; memory.resumed = memory.ask = false; return { basis: null, stop: 'off' }; }
  if (!shown) { memory.hidden = true; memory.ask = false; return { basis: memory.basis ?? null, stop: 'curious_hidden' }; }
  if (memory.hidden) { memory.hidden = false; memory.resumed = true; memory.trigger = trigger; if (memory.basis == null) memory.baseline = trigger; }
  if (memory.ask && state.basis != null) { memory.ask = memory.resumed = false; memory.basis = state.basis; memory.trigger = trigger; }
  if (state.basis == null) return state;
  if (memory.baseline == null) memory.baseline = trigger;
  if (memory.basis == null && trigger === memory.baseline) return { basis: null, stop: 'curious_empty' };
  if (trigger !== memory.trigger) { memory.trigger = trigger; memory.basis = state.basis; memory.resumed = false; }
  return { ...state, basis: memory.basis, ...(visible ? {} : { stop: state.stop || 'hidden' }) };
}
