// The browser side of the personal Tutor controls (C:/s/spec/tutor-workflow/draft.md Task 03; owner decisions 1a, 3a):
// GET/POST /api/learn/coaching (learn-coaching-routes.js) through one queue per learner and canvas. Pure: the caller
// passes `call` (api.js api), so node tests drive it with a fake server. No model is reachable from here.
//
// What the tab shows is the last confirmed state with the learner's unconfirmed control events applied in order, through
// the same reducer the Worker runs (reduceTutorControls). Events go up one at a time; a 409 adopts the server's newer state
// and the event is applied again on top of it (an Undo whose revision moved on is dropped instead, owner 3a). A failed
// save keeps the local choice visible in this tab only, says so, and never claims other tabs or devices changed.
import { canCoach, defaultControls, mayRun, reduceTutorControls } from './learn-coaching-contract.js';

// Coaching state lives on canvases only (the route refuses other apps: coaching_on_canvases_only).
export const coachingCanvas = name => /^canvas-[a-f0-9]{8}$/.test(String(name ?? ''));
export const coachingUrl = ({ app, board }) => `/api/learn/coaching?app=${encodeURIComponent(app)}&board=${encodeURIComponent(board)}`;
const SAVE_TRIES = 3;

// status: 'loading' | 'ready' | 'error' (the saved controls could not be read) | 'local' (no saved record here: not a canvas,
// or a Rabbit Hole not saved yet; the controls last for this page only). saveStatus: 'saved' | 'saving' | 'error'.
export function createCoachingSync({ scope, call, channel = null, newId = () => crypto.randomUUID() }) {
  let server = null, queue = [], status = 'loading', save = 'saved', undo = null, notice = null;
  let flying = false, live = false, loads = 0, cached = null;
  const listeners = new Set();
  const local = () => status === 'local';
  const controls = () => queue.reduce((c, item) => reduceTutorControls(c, item.event).state, server?.controls ?? defaultControls());
  const notify = () => { cached = null; listeners.forEach(fn => fn()); };
  // Never backwards: a late GET or another tab's older broadcast does not replace a newer confirmed state.
  const adopt = state => { if (state?.controls && (!server || state.revision >= server.revision)) server = state; };
  const view = () => (cached ||= { status, saveStatus: save, controls: controls(), state: server, undo, notice, pending: queue.length });

  async function load() {
    const turn = ++loads;
    if (!coachingCanvas(scope.app)) { status = 'local'; server ||= { controls: defaultControls(), goals: [], revision: 0 }; notify(); return; }
    try {
      const { state } = await call(coachingUrl(scope));
      if (!live || turn !== loads) return;
      adopt(state); status = 'ready';
    } catch (error) {
      if (!live || turn !== loads) return;
      // A Rabbit Hole is a canvas only once its first object keeps it: until then nothing is saved for it.
      if (error?.status === 404 && !server) { status = 'local'; server = { controls: defaultControls(), goals: [], revision: 0 }; }
      else if (!server) status = 'error'; // a failed refresh keeps what is shown
    }
    notify();
    flush();
  }

  async function flush() {
    if (flying || !live || !server || local() || save === 'error') return;
    flying = true;
    try {
      while (queue.length && live) {
        const item = queue[0];
        const step = reduceTutorControls(server.controls, item.event);
        // Moot on the newer state (another tab already did it), or an Undo for a revision that moved on: nothing to send.
        if (step.rejected || step.state === server.controls) {
          queue.shift();
          if (item.event.type === 'undo') { undo = null; notice = 'undo_stale'; }
          continue;
        }
        save = 'saving'; notify();
        try {
          const out = await call('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: scope.app, board: scope.board, actionId: item.actionId, expectedRevision: server.revision, action: 'save_controls', payload: { event: item.event } }) });
          if (!live) return;
          queue.shift();
          adopt(out.state);
          const shown = out.effects?.find(effect => effect.type === 'show_undo');
          if (shown) undo = shown.undo;
          channel?.postMessage({ app: scope.app, board: scope.board, state: out.state });
        } catch (error) {
          if (!live) return;
          if (error?.status === 409 && error.data?.state) {
            adopt(error.data.state);
            item.actionId = newId();
            if (error.data.error === 'undo_stale') { queue.shift(); undo = null; notice = 'undo_stale'; }
            else if (++item.tries >= SAVE_TRIES) { save = 'error'; break; }
            continue;
          }
          if (error?.status === 400) { queue.shift(); save = 'error'; break; } // refused: the local choice stays, unsaved
          save = 'error'; break; // offline or unavailable: kept, sent again on Retry or the next change
        }
      }
      if (save === 'saving' || (save !== 'error' && !queue.length)) save = 'saved';
    } finally {
      flying = false;
      notify();
    }
  }

  // A control event (reduceTutorControls). Applied in this tab at once; saved in order. Returns the reducer's answer for
  // this tab ({ ok, changed, controls }), never a model call.
  function dispatch(event) {
    const before = controls();
    const step = reduceTutorControls(before, event);
    if (step.rejected) {
      if (event?.type === 'undo') { undo = null; notice = 'undo_stale'; notify(); }
      return { ok: false, reason: step.rejected, controls: before };
    }
    if (step.state === before) return { ok: true, changed: false, controls: before };
    notice = null; undo = null; // any change makes an older Undo stale
    if (local()) {
      server = { ...server, controls: step.state, revision: step.state.revision };
      const shown = step.effects.find(effect => effect.type === 'show_undo');
      if (shown) undo = shown.undo;
      notify();
      return { ok: true, changed: true, controls: step.state };
    }
    queue.push({ event, actionId: newId(), tries: 0 });
    if (save === 'error') save = 'saving';
    notify();
    flush();
    return { ok: true, changed: true, controls: controls() };
  }

  // A goal or activity action (create_goal, activate_goal, ...): one request on the confirmed revision, after any queued
  // control events. Resolves to the new state; a refusal rejects with the server's reason and adopts its state.
  async function act(action, payload) {
    if (local() || !server) throw Object.assign(new Error('Your Tutor settings are not saved on this page.'), { code: 'local' });
    while (flying || queue.length) { if (save === 'error') throw Object.assign(new Error('Your Tutor settings are not saved yet.'), { code: 'unsaved' }); await new Promise(resolve => setTimeout(resolve, 50)); }
    try {
      const out = await call('/api/learn/coaching', { method: 'POST', body: JSON.stringify({ app: scope.app, board: scope.board, actionId: newId(), expectedRevision: server.revision, action, payload }) });
      adopt(out.state); notify();
      channel?.postMessage({ app: scope.app, board: scope.board, state: out.state });
      return out.state;
    } catch (error) {
      if (error?.data?.state) { adopt(error.data.state); notify(); }
      throw error;
    }
  }

  return {
    view,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch,
    act,
    // Another tab of this learner saved: its state replaces ours when newer; our queued events go on top of it.
    receive: message => { if (message?.app === scope.app && message.board === scope.board && message.state) { adopt(message.state); notify(); } },
    load,
    retry: () => { if (status === 'error') { status = 'loading'; notify(); load(); return; } if (save === 'error') { save = queue.length ? 'saving' : 'saved'; notify(); flush(); } },
    start: () => { live = true; return load(); },
    stop: () => { live = false; loads += 1; },
    // Proactive permission now (canCoach): the controls this tab applies, loaded or local only.
    canCoach: (context = {}) => canCoach(controls(), { ready: status === 'ready' || status === 'local', ...context }),
  };
}

// The Chat thread as the composer sees it (draft "Canonical personal controls override stale thread mode during restore"):
// on a canvas with saved controls the mode is the learner's canvas preference, never the thread's saved legacy mode, and
// picking a mode is a control event. Elsewhere (no saved record) the thread keeps its own mode as before.
export function threadWithControls(thread, coaching) {
  if (!coaching || coaching.status === 'local') return thread;
  return { ...thread, mode: coaching.controls.mode, setMode: mode => coaching.dispatch({ type: 'select_mode', mode }) };
}

// The controls proactive decisions read: on a surface with no saved record the mode is the thread's (threadWithControls).
export const effectiveControls = (coaching, thread) => (coaching.status === 'local' ? { ...coaching.controls, mode: thread?.mode ?? coaching.controls.mode } : coaching.controls);

// Owner 4a (contract: a guided entry is start_guided, then hole_opening_turn). The guided entry clears a pause only in
// selected, enabled Tutor; the opening turn then runs only where coaching may run. `entry` is the controls of the canvas the
// learner made the entry from (dive.js markGuidedEntry), used while this hole has no saved choice of its own (revision 0).
export function guidedOpening({ own, entry = null, context }) {
  const base = own && own.revision > 0 ? own : entry || own || defaultControls();
  const after = reduceTutorControls(base, { type: 'start_guided' }).state;
  return mayRun('hole_opening_turn', after, context);
}

// The status line under the controls: what this tab knows, never more (draft "If the preference has not synchronized or
// saved, show that state and do not claim all devices have stopped").
export function controlsNote({ status, saveStatus, controls, undo, notice }) {
  if (status === 'error') return { tone: 'error', text: "Couldn't load your Tutor settings for this canvas.", action: 'retry' };
  if (saveStatus === 'error') return { tone: 'error', text: 'Not saved: this change applies in this tab only.', action: 'retry' };
  if (undo && !controls.tutorEnabled) return { tone: 'info', text: 'Tutor off for this canvas.', action: 'undo' };
  if (notice === 'undo_stale') return { tone: 'info', text: 'Undo is no longer available: your Tutor settings changed since.' };
  if (controls.mode === 'tutor' && controls.tutorEnabled && controls.suggestionsPaused) return { tone: 'info', text: 'Suggestions paused.', action: 'resume' };
  if (controls.mode === 'tutor' && status === 'local') return { tone: 'muted', text: 'Tutor settings here last for this visit.' };
  return null;
}
