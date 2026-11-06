// Professor Next Steps integration hooks (docs/features/professor-next-steps.md §1.3). No UI here: Parallel renders the
// card. select() only validates a click; the page sends the hook as a Chat turn, or with the spoken session's
// say('', { nextStep, selectedAt }) while that mode is on (contract §1.4).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { gateHooks, goalOf, hooksTrigger, nextStepsBasis, nextStepsController, nextStepsInput, repositoryBasis, stoppingPoint } from './learn-next-steps.js';

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
// an input builder that reads the props when the request is sent. A Refresh posts its operation id beside the input
// (extra: { refresh }, owner task 2).
export function ownedSteps(read, { post = (input, extra = {}) => api('/api/learn/tutor/next-steps', { method: 'POST', body: JSON.stringify({ ...read().access, input, ...extra }), signal: AbortSignal.timeout(HOOK_TIMEOUT_MS) }), ...timers } = {}) {
  // A Tutor, where one still runs, learns which hooks are on screen; hooks read nothing else from it but busy and lastTurn.
  const life = held(() => nextStepsController({ post, ...timers }), view => read().tutor?.showing?.(view.status === 'ready' ? view.options : []));
  const blocksOf = p => p.canvasApi?.current?.blocks?.() || [];
  // Owner task 2: the canvas's semantic snapshot (canvasApi.semantic(), the last one the canvas computed) - read with the
  // trigger state, and handed to update() with the basis its fingerprint is in, so the request carries that snapshot.
  const semanticOf = p => p.canvasApi?.current?.semantic?.() ?? null;
  return {
    // Contract §2.3 triggers only. Off while a hole's record is still loading (recordPending: it would plan as a plain canvas first).
    state() {
      const p = read();
      if (p.recordPending) return { basis: null, stop: 'off' };
      const semantic = semanticOf(p), snapshot = semantic?.snapshot;
      return {
        basis: repositoryBasis(nextStepsBasis({ lastTurn: p.tutor?.lastTurn, canvasState: p.canvasState, graded: p.graded, record: p.record, title: p.title, liveTitle: p.liveTitle, fingerprint: semantic?.fingerprint ?? null }), p.repositoryCommit),
        // Task 14 C-M2: the goal the input is built from (goalOf over the snapshot), never the title fallback prop alone.
        stop: stoppingPoint({ busy: !!p.tutor?.busy, blocks: blocksOf(p), objects: snapshot ? snapshot.objects.length + snapshot.omitted.objects : 0, goal: goalOf({ record: p.record, title: p.title, liveTitle: p.liveTitle }).goal, plain: !p.record }),
        ...(semantic ? { semantic } : {}),
        // Owner task 2: the canvas's words are changing and not yet read; the shown set is stale until they settle.
        ...(p.canvasState?.semanticSettling ? { settling: true } : {}),
      };
    },
    update: ({ basis, stop, semantic = null, settling = false }) => life.controller().update({ basis, stop, settling, input: previous => {
      const p = read();
      return nextStepsInput({ blocks: blocksOf(p), record: p.record, title: p.title, liveTitle: p.liveTitle, lastTurn: p.tutor?.lastTurn, previous, basis, describe: p.describe, snapshot: semantic?.snapshot ?? null });
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
// liveTitle: the hole's live title (the dives path's); recordPending: a canvas that may be a hole whose record has not landed.
// tutor: optional while the browser Tutor still runs ({ busy, lastTurn, showing }); hooks read nothing else from it.
// coaching (owner 3a): { allowed, visible } - hooks are proactive, so they ask only while the Tutor controls allow it and only
// after a meaningful learner change (gateHooks). Absent, nothing is asked. shown: View > Curious (gateHooks); request() is the
// empty state's explicit ask, the one request a hidden-then-shown Curious with no saved set makes.
export function useNextSteps({ tutor = null, canvasApi, canvasState, record = null, liveTitle = null, recordPending = false, access, title = '', graded = 0, describe = null, repositoryCommit = null, coaching = null, shown = true }) {
  const live = useRef(null);
  live.current = { tutor, canvasApi, canvasState, record, liveTitle, recordPending, access, title, graded, describe, repositoryCommit };
  const [steps] = useState(() => ownedSteps(() => live.current));
  const gate = useRef({}).current;
  const [, asked] = useState(0);
  const { basis, stop, semantic, settling = false } = gateHooks(gate, steps.state(), { allowed: !!coaching?.allowed, visible: !!coaching?.visible, shown, trigger: hooksTrigger({ lastTurn: tutor?.lastTurn, canvasState, graded }) });
  useEffect(() => { steps.update({ basis, stop, semantic, settling }); }, [basis, stop, settling]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => steps.dispose, [steps]);
  return { ...useSyncExternalStore(steps.subscribe, steps.view, steps.view), select: steps.select, refresh: steps.refresh, request: () => { gate.ask = true; asked(n => n + 1); } };
}

// The signed-in viewer's own { org, email } (/api/me), only to find their own tab store. Read on each request, never kept: a
// failed read or another account signing in never sticks (requests are rare: only on a trigger change).
const whoIsSignedIn = signal => fetch('/api/me', { credentials: 'same-origin', signal }).then(r => (r.ok ? r.json() : null)).catch(() => null);
// The shared route (contract §1.5) by plain fetch, as SharedBoardPage calls its routes: a background call never sends an
// anonymous viewer to sign in. A refusal throws with its status (429 is limited). Task 14 C-R1: one 60 s signal, made before
// the identity read, covers it and the hook request, so a hang in either records the basis failed.
// Owner priority 1 (2026-10-21): a view sends no generate and the server answers its saved set or idle (thrown as reason
// curious_empty, the card's Suggest button); generate goes only with the viewer's explicit ask or a Refresh. The last set this
// tab received for this viewer, link, card and version is kept in sessionStorage, so a reload shows it without a request
// (the edge cache is per data center and absent on workers.dev).
const sharedPost = read => async (body, extra = {}) => {
  const { token, signedIn, version } = read();
  const signal = AbortSignal.timeout(HOOK_TIMEOUT_MS);
  const who = signedIn ? await whoIsSignedIn(signal) : null;
  const generate = body.generate === true || !!extra.refresh;
  const kept = who?.email ? `small.shared-steps:${JSON.stringify([who.email, token, body.origin ?? null, version ?? null])}` : null;
  if (kept && !generate) { try { const set = JSON.parse(globalThis.sessionStorage.getItem(kept) || 'null'); if (set) return set; } catch { /* ask the server */ } }
  const response = await fetch(`/api/learn/boards/shared/${encodeURIComponent(token)}/next-steps`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...extra, ...(generate ? { generate: true } : {}) }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status: response.status });
  if (data.idle) throw Object.assign(new Error('No saved suggestions'), { reason: 'curious_empty' });
  if (kept && Array.isArray(data.options)) { try { globalThis.sessionStorage.setItem(kept, JSON.stringify(data)); } catch { /* best effort */ } }
  return data;
};

// sharedSteps is internal to this module, exported only for its node tests (as ownedSteps): useSharedNextSteps' logic outside
// React, its lifecycle held's. read(): the hook's latest props. The board is the server's to read: a request names only the
// origin card or root. Triggers (contract §2.3, shared): the selected card or root, the board version and
// the signed-in state, nothing else. Only the tab's last set per trigger is kept (sharedPost). Owner priority 1 (2026-10-21): a trigger reads the saved set and never
// generates; request() is the viewer's explicit ask for the trigger on screen, its own basis, posted with generate: true.
export function sharedSteps(read, { post = sharedPost(read), ...timers } = {}) {
  const asked = new Set();
  const trigger = () => { const { token, card, version } = read(); return JSON.stringify([token, card ?? null, version ?? null]); };
  const life = held(() => nextStepsController({ post, ...timers }));
  return {
    // Owner R3 decision (2026-10-16): no AI generation for a signed-out viewer, so signed out asks nothing; the board's own
    // saved content still shows. The server refuses a signed-out request the same way (learn-boards.js).
    state() {
      const { token, card, version, signedIn } = read();
      return token && signedIn ? { basis: JSON.stringify([token, card ?? null, version ?? null, true, asked.has(trigger())]), stop: null } : { basis: null, stop: 'off' };
    },
    update: ({ basis, stop }) => life.controller().update({ basis, stop, input: () => { const { card } = read(); return { input: { origin: card ? { block_id: card } : null, ...(asked.has(trigger()) ? { generate: true } : {}) } }; } }),
    request() { asked.add(trigger()); this.update(this.state()); },
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
  return { ...useSyncExternalStore(shared.subscribe, shared.view, shared.view), select: shared.select, refresh: shared.refresh, request: () => shared.request() };
}
