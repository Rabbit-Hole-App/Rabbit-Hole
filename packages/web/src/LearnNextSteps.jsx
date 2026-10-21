// Professor Next Steps integration hooks (docs/features/professor-next-steps.md §1.3). No UI here: Parallel renders the
// card. select() only validates a click; the page sends it with tutor.askStep, or with the spoken session's
// say('', { nextStep, selectedAt }) while that mode is on (contract §1.4).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { gateHooks, goalOf, hooksTrigger, nextStepsBasis, nextStepsController, nextStepsInput, repositoryBasis, stoppingPoint, viewerStates } from './learn-next-steps.js';
import { emitDecision, hooksEvent, shownEvent, tracing } from './learn-tutor-trace.js';
import { loadStore, storeKey } from './learn-tutor-evidence.js';

// Task 14 A-M1: each hook post gives up after 60 s (the Tutor turn's own browser bound, LearnTutor.jsx TURN_TIMEOUT_MS), so a
// hung call records its basis as failed and frees the one request in flight for newer bases.
const HOOK_TIMEOUT_MS = 60000;

// The controller lifecycle both hooks share (internal). make() builds a controller; it is built at once and again on the first
// use after dispose() (an effect re-run under StrictMode or Fast Refresh disposes, then uses it again). The view is cached per
// controller change: view() returns fresh copies, which useSyncExternalStore must not get on every read. On each change the
// cached view is fresh first, then onView(view), then the subscribers; subscribers live here, so they survive a dispose.
function held(make, onView = () => {}) {
  const listeners = new Set();
  let ctl = null, view = null;
  const controller = () => {
    if (ctl) return ctl;
    ctl = make();
    view = ctl.view();
    ctl.subscribe(() => { view = ctl.view(); onView(view); listeners.forEach(fn => fn()); });
    return ctl;
  };
  controller();
  return { controller, view: () => view, subscribe: fn => { listeners.add(fn); controller(); return () => listeners.delete(fn); }, dispose: () => { ctl?.dispose(); ctl = null; } };
}

// ownedSteps is internal to this module, exported only for its node tests: not part of contract §1.3 (the contract is
// useNextSteps). It is useNextSteps' logic outside React, so those tests run it through the real controller (its lifecycle
// is held's). read(): the hook's latest props. A trigger state comes from state(); update() hands it to the controller with
// an input builder that reads the props when the request is sent. Telemetry (contract §3) only while a sink is registered:
// next_steps_computed as each set lands and next_steps_shown the first time a set is on screen, each with the identity of
// the input that set was planned from.
// A Refresh posts its operation id beside the input (extra: { refresh }, owner task 2).
export function ownedSteps(read, { post = (input, extra = {}) => api('/api/learn/tutor/next-steps', { method: 'POST', body: JSON.stringify({ ...read().access, input, ...extra }), signal: AbortSignal.timeout(HOOK_TIMEOUT_MS) }), ...timers } = {}) {
  const sent = new WeakMap(), planned = new Map();
  const life = held(() => nextStepsController({
    post,
    onSet: (set, input, trim, { discarded }) => {
      if (!tracing()) return;
      const ids = { input, trim, scope: 'owned', ...sent.get(input) };
      planned.set(set.set_id, ids);
      emitDecision(hooksEvent(set, { ...ids, discarded }));
    },
    onShown: set => { if (tracing()) emitDecision(shownEvent(set, planned.get(set.set_id))); },
    ...timers,
  }), view => read().tutor?.showing?.(view.status === 'ready' ? view.options : [])); // the Tutor learns which hooks are on screen
  // ponytail: snapshot() on every render (a sessionStorage parse and a Tutor context build); cache it by store seq if
  // LearnPage renders hot.
  const now = () => {
    const p = read();
    return { p, s: p.tutor?.askStep ? p.tutor.snapshot() : null, blocks: p.canvasApi?.current?.blocks?.() || [] };
  };
  // Owner task 2: the canvas's semantic snapshot (canvasApi.semantic(), the last one the canvas computed) - read with the
  // trigger state, and handed to update() with the basis its fingerprint is in, so the request carries that snapshot.
  const semanticOf = p => p.canvasApi?.current?.semantic?.() ?? null;
  return {
    // Contract §2.3 triggers only; off where no Tutor context resolves (Ruling F10).
    state() {
      const { p, s, blocks } = now();
      if (!s?.context) return { basis: null, stop: 'off' };
      const semantic = semanticOf(p), snapshot = semantic?.snapshot;
      return {
        basis: repositoryBasis(nextStepsBasis({ lastTurn: p.tutor.lastTurn, store: s.store, journey: p.journey, canvasState: p.canvasState, graded: p.graded, record: p.record, context: s.context, parent: s.parent, title: p.title, liveTitle: s.liveTitle, fingerprint: semantic?.fingerprint ?? null }), p.repositoryCommit),
        // Task 14 C-M2: the goal the input is built from (goalOf over the snapshot), never the title fallback prop alone.
        stop: stoppingPoint({ busy: p.tutor.busy, journey: p.journey, store: s.store, here: { app: p.access?.app, board: p.board }, blocks, objects: snapshot ? snapshot.objects.length + snapshot.omitted.objects : 0, goal: goalOf({ context: s.context, record: s.record, title: p.title, liveTitle: s.liveTitle }).goal, plain: s.context.source === 'canvas' && !s.record }),
        ...(semantic ? { semantic } : {}),
        // Owner task 2: the canvas's words are changing and not yet read; the shown set is stale until they settle.
        ...(p.canvasState?.semanticSettling ? { settling: true } : {}),
      };
    },
    update: ({ basis, stop, semantic = null, settling = false }) => life.controller().update({ basis, stop, settling, input: previous => {
      const { p, s, blocks } = now();
      const built = nextStepsInput({ ...s, journey: p.journey, blocks, title: p.title, lastTurn: p.tutor?.lastTurn, previous, basis, describe: p.describe, snapshot: semantic?.snapshot ?? null });
      // The trace identity as this input is sent, so a set that lands after the canvas moved on keeps its own ids.
      if (built.input) sent.set(built.input, {
        mode: built.input.mode === 'canvas' && s?.context?.source === 'registry' ? 'course' : built.input.mode,
        identity: { session_id: s?.store?.session_id ?? null, canvas_id: p.access?.app ?? null, board_id: p.board ?? null, canvas_version: p.canvasVersion ?? null,
          journey_id: p.journey?.journey?.id ?? s?.record?.journey?.journey_id ?? null, section_id: built.input.path?.current?.id ?? built.input.dive?.parent_section ?? null, dive_id: s?.record?.dive_id ?? null },
      });
      return built;
    } }),
    view: life.view,
    subscribe: life.subscribe,
    select: id => life.controller().select(id, { busy: !!read().tutor?.busy }),
    refresh: () => life.controller().refresh(),
    dispose: life.dispose,
  };
}

// repositoryCommit: the indexed commit of the canvas's repository, or null (none, or not read yet). The server reads the
// repository itself (learn-next-steps-routes.js curiousRepository), never from this; the commit only joins the basis, so a
// repository that finishes indexing, or moves to a new commit, asks again (repo-graph Release 1).
// describe: LearningBlocks' describeBlock when the page passes it (a card's kind and title as every canvas surface names
// it); without it a block's type and title stand in. Not imported here: LearningBlocks.jsx cannot load under node tests.
// board: the board name (LearnPage's boardName). canvasVersion: the board revision, for telemetry only.
// ponytail: one controller per mount (previous hooks and the tab ceiling span board changes inside one LearnPage); key it by
// app and board if a page ever switches canvases without remounting.
// coaching (owner 3a): { allowed, visible } - hooks are proactive, so they ask only while the Tutor controls allow it and only
// after a meaningful learner change (gateHooks). Absent, nothing is asked.
export function useNextSteps({ tutor, journey = null, canvasApi, canvasState, record = null, access, title = '', graded = 0, canvasVersion = null, board = 'main', describe = null, repositoryCommit = null, coaching = null }) {
  const live = useRef(null);
  live.current = { tutor, journey, canvasApi, canvasState, record, access, title, graded, canvasVersion, board, describe, repositoryCommit };
  const [steps] = useState(() => ownedSteps(() => live.current));
  const gate = useRef({}).current;
  const { basis, stop, semantic, settling = false } = gateHooks(gate, steps.state(), { allowed: !!coaching?.allowed, visible: !!coaching?.visible, trigger: hooksTrigger({ lastTurn: tutor?.lastTurn, journey, canvasState, graded }) });
  useEffect(() => { steps.update({ basis, stop, semantic, settling }); }, [basis, stop, settling]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => steps.dispose, [steps]);
  return { ...useSyncExternalStore(steps.subscribe, steps.view, steps.view), select: steps.select, refresh: steps.refresh };
}

// The signed-in viewer's own { org, email } (/api/me), only to find their own tab store. Read on each request, never kept: a
// failed read or another account signing in never sticks (requests are rare: only on a trigger change).
const whoIsSignedIn = signal => fetch('/api/me', { credentials: 'same-origin', signal }).then(r => (r.ok ? r.json() : null)).catch(() => null);
// The shared route (contract §1.5) by plain fetch, as SharedBoardPage calls its routes: a background call never sends an
// anonymous viewer to sign in. viewer_states only for a signed-in viewer, from their own tab store, never anyone else's; the
// server filters them again. A refusal throws with its status (429 is limited). Task 14 C-R1: one 60 s signal, made before
// the identity read, covers it and the hook request, so a hang in either records the basis failed.
const sharedPost = read => async (body, extra = {}) => {
  const { token, signedIn } = read();
  const signal = AbortSignal.timeout(HOOK_TIMEOUT_MS);
  const who = signedIn ? await whoIsSignedIn(signal) : null;
  const states = who?.email ? viewerStates(loadStore(globalThis.sessionStorage, storeKey(who))) : {};
  const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/next-steps`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...extra, ...(Object.keys(states).length ? { viewer_states: states } : {}) }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status: response.status });
  return data;
};

// sharedSteps is internal to this module, exported only for its node tests (as ownedSteps): useSharedNextSteps' logic outside
// React, its lifecycle held's. read(): the hook's latest props. The board is the server's to read: a request names only the
// origin card or root (and the viewer's own claim states). Triggers (contract §2.3, shared): the selected card or root, the board version and
// the signed-in state, nothing else. Telemetry only while a sink is registered, each event from the set itself: the source
// the server minted into its steps (share version, origin) with the one-way share key, the server's input summary and its
// trim counts (runtime.planner_input); user_id is the harness sink's (the viewer's own session), never the sharer's. Nothing
// is persisted.
export function sharedSteps(read, { post = sharedPost(read), ...timers } = {}) {
  const ids = set => ({ scope: 'shared', mode: 'shared', summary: set.telemetry?.summary ?? null, trim: set.telemetry?.trim ?? null,
    identity: { source: { share_key: set.telemetry?.share_key ?? null, ...set.options?.[0]?.selected_next_step?.source } } });
  const life = held(() => nextStepsController({
    post,
    onSet: (set, _input, _trim, { discarded }) => { if (tracing()) emitDecision(hooksEvent(set, { ...ids(set), discarded })); },
    onShown: set => { if (tracing()) emitDecision(shownEvent(set, ids(set))); },
    ...timers,
  }));
  return {
    // Owner R3 decision (2026-10-16): no AI generation for a signed-out viewer, so signed out asks nothing; the board's own
    // saved content still shows. The server refuses a signed-out request the same way (learn-boards.js).
    state() {
      const { token, card, version, signedIn } = read();
      return token && signedIn ? { basis: JSON.stringify([token, card ?? null, version ?? null, true]), stop: null } : { basis: null, stop: 'off' };
    },
    update: ({ basis, stop }) => life.controller().update({ basis, stop, input: () => { const { card } = read(); return { input: { origin: card ? { block_id: card } : null } }; } }),
    view: life.view,
    subscribe: life.subscribe,
    select: id => life.controller().select(id),
    refresh: () => life.controller().refresh(),
    dispose: life.dispose,
  };
}

// Shared canvases (SharedBoardPage): token, the selected card id (null: the root), the shared board version and whether the
// viewer is signed in. select() validates a click; the page sends the step with Start Rabbit Hole (contract §1.4).
export function useSharedNextSteps({ token, card = null, version = null, signedIn = false }) {
  const live = useRef(null);
  live.current = { token, card, version, signedIn };
  const [shared] = useState(() => sharedSteps(() => live.current));
  const { basis, stop } = shared.state();
  useEffect(() => { shared.update({ basis, stop }); }, [basis, stop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => shared.dispose, [shared]);
  return { ...useSyncExternalStore(shared.subscribe, shared.view, shared.view), select: shared.select, refresh: shared.refresh };
}
