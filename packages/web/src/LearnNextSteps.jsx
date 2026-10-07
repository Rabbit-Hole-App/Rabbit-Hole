// Professor Next Steps integration hooks (docs/features/professor-next-steps.md §1.3). No UI here: Parallel renders the
// card. select() only validates a click; the page sends it with tutor.askStep, or with the spoken session's
// say('', { nextStep, selectedAt }) while that mode is on (contract §1.4).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { goalOf, nextStepsBasis, nextStepsController, nextStepsInput, stoppingPoint, viewerStates } from './learn-next-steps.js';
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
export function ownedSteps(read, { post = input => api('/api/learn/tutor/next-steps', { method: 'POST', body: JSON.stringify({ ...read().access, input }), signal: AbortSignal.timeout(HOOK_TIMEOUT_MS) }), ...timers } = {}) {
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
  return {
    // Contract §2.3 triggers only; off where no Tutor context resolves (Ruling F10).
    state() {
      const { p, s, blocks } = now();
      if (!s?.context) return { basis: null, stop: 'off' };
      return {
        basis: nextStepsBasis({ lastTurn: p.tutor.lastTurn, store: s.store, journey: p.journey, canvasState: p.canvasState, graded: p.graded, record: p.record, context: s.context, parent: s.parent, title: p.title, liveTitle: s.liveTitle }),
        // Task 14 C-M2: the goal the input is built from (goalOf over the snapshot), never the title fallback prop alone.
        stop: stoppingPoint({ busy: p.tutor.busy, journey: p.journey, store: s.store, here: { app: p.access?.app, board: p.board }, blocks, goal: goalOf({ context: s.context, record: s.record, title: p.title, liveTitle: s.liveTitle }).goal, plain: s.context.source === 'canvas' && !s.record }),
      };
    },
    update: ({ basis, stop }) => life.controller().update({ basis, stop, input: previous => {
      const { p, s, blocks } = now();
      const built = nextStepsInput({ ...s, journey: p.journey, blocks, title: p.title, lastTurn: p.tutor?.lastTurn, previous, basis, describe: p.describe });
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
    dispose: life.dispose,
  };
}

// describe: LearningBlocks' describeBlock when the page passes it (a card's kind and title as every canvas surface names
// it); without it a block's type and title stand in. Not imported here: LearningBlocks.jsx cannot load under node tests.
// board: the board name (LearnPage's boardName). canvasVersion: the board revision, for telemetry only.
// ponytail: one controller per mount (previous hooks and the tab ceiling span board changes inside one LearnPage); key it by
// app and board if a page ever switches canvases without remounting.
export function useNextSteps({ tutor, journey = null, canvasApi, canvasState, record = null, access, title = '', graded = 0, canvasVersion = null, board = 'main', describe = null }) {
  const live = useRef(null);
  live.current = { tutor, journey, canvasApi, canvasState, record, access, title, graded, canvasVersion, board, describe };
  const [steps] = useState(() => ownedSteps(() => live.current));
  const { basis, stop } = steps.state();
  useEffect(() => { steps.update({ basis, stop }); }, [basis, stop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => steps.dispose, [steps]);
  return { ...useSyncExternalStore(steps.subscribe, steps.view, steps.view), select: steps.select };
}

// The signed-in viewer's own { org, email } (/api/me), only to find their own tab store. Read on each request, never kept: a
// failed read or another account signing in never sticks (requests are rare: only on a trigger change).
const whoIsSignedIn = () => fetch('/api/me', { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
// The shared route (contract §1.5) by plain fetch, as SharedBoardPage calls its routes: a background call never sends an
// anonymous viewer to sign in. viewer_states only for a signed-in viewer, from their own tab store, never anyone else's; the
// server filters them again. A refusal throws with its status (429 is limited).
const sharedPost = read => async body => {
  const { token, signedIn } = read();
  const who = signedIn ? await whoIsSignedIn() : null;
  const states = who?.email ? viewerStates(loadStore(globalThis.sessionStorage, storeKey(who))) : {};
  const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/next-steps`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...(Object.keys(states).length ? { viewer_states: states } : {}) }),
    signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
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
    state() {
      const { token, card, version, signedIn } = read();
      return token ? { basis: JSON.stringify([token, card ?? null, version ?? null, !!signedIn]), stop: null } : { basis: null, stop: 'off' };
    },
    update: ({ basis, stop }) => life.controller().update({ basis, stop, input: () => { const { card } = read(); return { input: { origin: card ? { block_id: card } : null } }; } }),
    view: life.view,
    subscribe: life.subscribe,
    select: id => life.controller().select(id),
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
  return { ...useSyncExternalStore(shared.subscribe, shared.view, shared.view), select: shared.select };
}
