// Professor Next Steps integration hooks (docs/features/professor-next-steps.md §1.3). No UI here: Parallel renders the
// card. select() only validates a click; the page sends it with tutor.askStep.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { nextStepsBasis, nextStepsController, nextStepsInput, stoppingPoint } from './learn-next-steps.js';
import { emitDecision, hooksEvent, shownEvent, tracing } from './learn-tutor-trace.js';

// ownedSteps is internal to this module, exported only for its node tests: not part of contract §1.3 (the contract is
// useNextSteps). It is useNextSteps' logic outside React, so those tests run it through the real controller. read(): the
// hook's latest props. A trigger state comes from state(); update() hands it to the controller with an input builder that
// reads the props when the request is sent. The view is cached per controller change: view() returns fresh copies, which
// useSyncExternalStore must not get on every read. Telemetry (contract §3) only while a sink is registered:
// next_steps_computed as each set lands and next_steps_shown the first time a set is on screen, each with the identity of
// the input that set was planned from. dispose() ends the controller; the next subscribe, update or select builds a fresh one
// (an effect re-run under StrictMode or Fast Refresh disposes, then uses it again). Subscribers live here, so they survive it.
export function ownedSteps(read, { post = input => api('/api/learn/tutor/next-steps', { method: 'POST', body: JSON.stringify({ ...read().access, input }) }), ...timers } = {}) {
  const sent = new WeakMap(), planned = new Map(), listeners = new Set();
  let ctl = null, view = null;
  const controller = () => {
    if (ctl) return ctl;
    ctl = nextStepsController({
      post,
      onSet: (set, input, trim, { discarded }) => {
        if (!tracing()) return;
        const ids = { input, trim, scope: 'owned', ...sent.get(input) };
        planned.set(set.set_id, ids);
        emitDecision(hooksEvent(set, { ...ids, discarded }));
      },
      onShown: set => { if (tracing()) emitDecision(shownEvent(set, planned.get(set.set_id))); },
      ...timers,
    });
    view = ctl.view();
    // The cached view is fresh before React reads it; the Tutor learns which hooks are on screen; then the subscribers.
    ctl.subscribe(() => { view = ctl.view(); read().tutor?.showing?.(view.status === 'ready' ? view.options : []); listeners.forEach(fn => fn()); });
    return ctl;
  };
  controller();
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
        basis: nextStepsBasis({ lastTurn: p.tutor.lastTurn, store: s.store, journey: p.journey, canvasState: p.canvasState, graded: p.graded, record: p.record, context: s.context, parent: s.parent, title: p.title }),
        stop: stoppingPoint({ busy: p.tutor.busy, journey: p.journey, store: s.store, here: { app: p.access?.app, board: p.board }, blocks, goal: p.title, plain: s.context.source === 'canvas' && !s.record }),
      };
    },
    update: ({ basis, stop }) => controller().update({ basis, stop, input: previous => {
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
    view: () => view,
    subscribe: fn => { listeners.add(fn); controller(); return () => listeners.delete(fn); },
    select: id => controller().select(id, { busy: !!read().tutor?.busy }),
    dispose: () => { ctl?.dispose(); ctl = null; },
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
