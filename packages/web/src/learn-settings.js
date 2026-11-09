// The learner's Depth (this canvas) and Auto-suggest (every canvas), as the browser holds them (Tutor ladder R2; server
// control-plane/src/learn-user-settings.js, GET/POST /api/learn/user-settings). One sync per learner canvas: a change applies in
// this tab at once, is saved in order, and reaches the learner's other tabs through the channel. A Depth write names the revision
// it was made from: a tab that missed another tab's change is told (409) and sends its choice again once on the current revision,
// so an old write never overwrites a newer one by accident. The composer's menu and, later, the table of contents read this one
// value. No model call is reachable from here.
// Depth is canvas-scoped, so a message for another canvas changes only Auto-suggest; a message from another learner (a shared
// browser) changes nothing.
// Brief / Balanced / Detailed (renamed 2026-11-08 from Overview / Standard / Deep): same length, a different reader. The hints say who each is written for.
export const DEPTHS = [['brief', 'Brief', 'For someone new to the subject'], ['balanced', 'Balanced', 'For someone who knows the basics'], ['detailed', 'Detailed', 'For someone who wants the exact account']];
export const DEFAULT_SETTINGS = Object.freeze({ depth: 'balanced', autoSuggest: true });
// Read-side aliases for the old names (the server, another tab on an older build and a saved value may still say overview, standard or deep); writes use only the new names.
// Same map as control-plane chat-depth.js DEPTH_ALIASES; remove both together after the stored-value rewrite.
export const DEPTH_ALIASES = Object.freeze({ overview: 'brief', standard: 'balanced', deep: 'detailed' });
export const depthOf = value => (typeof value === 'string' && Object.hasOwn(DEPTH_ALIASES, value) ? DEPTH_ALIASES[value] : value);
const norm = settings => (settings && settings.depth !== undefined ? { ...settings, depth: depthOf(settings.depth) } : settings);
const valid = patch => Object.keys(patch).length === 1 && (patch.depth !== undefined ? DEPTHS.some(([id]) => id === depthOf(patch.depth)) : typeof patch.autoSuggest === 'boolean');
const newId = () => `set-${globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? Math.random().toString(36).slice(2).padEnd(12, '0')}`;

// The deployed behavior Auto-suggest governs on this build: the Tutor's unasked suggestions, read through effectiveControls
// (learn-coaching-client.js). With none, the preference is still saved but the switch is not shown: a control that changes nothing
// would imply a capability that is not there. Roadmap invitations and proposals (R4, R6) add themselves here when they ship.
export const SUGGESTION_CAPABILITIES = ['tutor_unrequested_material'];
// Modes that show the Auto-suggest switch: Auto and Tutor, hidden in Ask (decision D22).
export const AUTO_SUGGEST_MODES = ['auto', 'tutor'];
export const autoSuggestShown = (mode, capabilities = SUGGESTION_CAPABILITIES) => capabilities.length > 0 && AUTO_SUGGEST_MODES.includes(mode);

// The request field Depth rides in on a Chat turn: nothing for Balanced, so a request is exactly today's until the learner chooses.
export const depthField = settings => (settings && depthOf(settings.depth) !== DEFAULT_SETTINGS.depth ? { depth: depthOf(settings.depth) } : {});

// The controls proactive Tutor decisions read: the learner's Auto-suggest decides tutorEnabled, whatever the canvas record says
// (no control for the per-canvas value remains, and it is never rewritten). The explicit pause is not touched, so switching
// Auto-suggest back on keeps a cancellation pause.
export const withAutoSuggest = (controls, settings) => (typeof settings?.autoSuggest === 'boolean' && settings.autoSuggest !== controls.tutorEnabled ? { ...controls, tutorEnabled: settings.autoSuggest } : controls);

// What each open canvas's sync holds, so a command's request can take the learner's choice at the moment they submit it
// (learn-slash.js generateCommand) with the board it was chosen for. Plain values, copied into the request: a later change in the
// menu never alters a request already made.
const live = new Map();
export const settingsSnapshot = app => { const own = live.get(app); return own ? { board: own.board, depth: own.depth } : null; };

// scope: { app, board }; call: api(path, init); channel: { postMessage } or null.
export function createSettingsSync({ scope, call, channel = null }) {
  let settings = { ...DEFAULT_SETTINGS }, revision = 0, status = 'loading', save = 'saved', learner = null, running = false, loads = 0, pending = 0, tail = Promise.resolve(), failed = null, snapshot;
  const listeners = new Set();
  const refresh = () => { snapshot = { settings, status, saveStatus: save, depth: settings.depth, autoSuggest: settings.autoSuggest, depthRevision: revision }; if (running) live.set(scope.app, { board: scope.board, depth: settings.depth, owner: snapshot }); };
  const notify = () => { refresh(); listeners.forEach(fn => fn()); };
  refresh();
  const url = `/api/learn/user-settings?app=${encodeURIComponent(scope.app)}&board=${encodeURIComponent(scope.board)}`;

  async function load() {
    const mine = ++loads;
    try {
      const out = await call(url);
      if (!running || mine !== loads) return;
      learner = out.learner ?? learner;
      if (!pending) { settings = { ...DEFAULT_SETTINGS, ...norm(out.settings) }; revision = out.depthRevision ?? 0; }
      status = out.unsaved ? 'unsaved' : 'ready';
    } catch {
      if (!running || mine !== loads) return;
      status = 'error';
    }
    notify();
  }

  // One write, on the revision known now. A Depth write that comes back 409 adopts the answer and is sent once more on it.
  async function send(patch) {
    for (let attempt = 0; ; attempt++) {
      const body = patch.depth !== undefined ? { depth: patch.depth, expectedRevision: revision, actionId: newId() } : { autoSuggest: patch.autoSuggest };
      try {
        const out = await call('/api/learn/user-settings', { method: 'POST', body: JSON.stringify({ app: scope.app, board: scope.board, ...body }) });
        if (!running) return true;
        learner = out.learner ?? learner;
        revision = out.depthRevision ?? revision;
        return out;
      } catch (error) {
        if (!running) return true;
        if (error?.status === 409 && error.data?.settings) {
          learner = error.data.learner ?? learner;
          revision = error.data.depthRevision ?? revision;
          if (attempt === 0) continue;
          settings = { ...settings, ...norm(error.data.settings) }; // sent twice and still behind: the newer choice stands
          return error.data;
        }
        return null;
      }
    }
  }

  // patch: { depth } or { autoSuggest }, one setting per call. Applied here at once; saved in order. Returns false for a value the
  // server would refuse.
  function set(patch) {
    if (!valid(patch)) return Promise.resolve(false);
    patch = norm(patch);
    settings = { ...settings, ...patch };
    save = 'saving'; pending += 1; notify();
    const run = async () => {
      const out = await send(patch);
      pending -= 1;
      if (out === true) return true;
      if (!out) { failed = patch; if (!pending) save = 'error'; } // refused or offline: the choice stays in this tab, unsaved
      else {
        failed = null;
        // A newer change still queued stays on top of this answer; the last one to land is the server's value.
        if (!pending) { settings = { ...DEFAULT_SETTINGS, ...norm(out.settings) }; save = 'saved'; }
        channel?.postMessage({ app: scope.app, board: scope.board, learner, settings: out.settings, depthRevision: revision });
      }
      notify();
      return true;
    };
    tail = tail.then(run, run);
    return tail;
  }

  return {
    view: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    set, load,
    receive: message => {
      if (!message || !message.settings || !learner || message.learner !== learner || pending) return;
      // Auto-suggest is the learner's on every canvas; Depth (and its revision) only on the canvas it was chosen for.
      const same = message.app === scope.app && message.board === scope.board;
      const next = { ...settings, autoSuggest: message.settings.autoSuggest, ...(same ? { depth: depthOf(message.settings.depth) } : {}) };
      if (same && Number.isInteger(message.depthRevision)) revision = Math.max(revision, message.depthRevision);
      if (next.autoSuggest === settings.autoSuggest && next.depth === settings.depth) return;
      settings = next; notify();
    },
    retry: () => { if (status === 'error') { status = 'loading'; notify(); load(); } else if (save === 'error' && failed) set(failed); },
    start: () => { running = true; refresh(); return load(); },
    stop: () => { running = false; loads += 1; if (live.get(scope.app)?.owner === snapshot) live.delete(scope.app); },
  };
}
