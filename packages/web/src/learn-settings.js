// The learner's Depth (this canvas) and Auto-suggest (every canvas), as the browser holds them (Tutor ladder R2; server
// control-plane/src/learn-user-settings.js, GET/POST /api/learn/user-settings). One sync per learner canvas: a change applies in
// this tab at once, is saved in order (the last value wins on the server), and reaches the learner's other tabs through the
// channel. The composer's menu and, later, the table of contents read this one value. No model call is reachable from here.
// Depth is canvas-scoped, so a message for another canvas changes only Auto-suggest; a message from another learner (a shared
// browser) changes nothing.
export const DEPTHS = [['overview', 'Overview', 'The short version: the central idea and what matters most'], ['standard', 'Standard', 'A balanced explanation'], ['deep', 'Deep', 'Thorough: reasoning, a worked example and edge cases']];
export const DEFAULT_SETTINGS = Object.freeze({ depth: 'standard', autoSuggest: true });
const valid = patch => (patch.depth === undefined || DEPTHS.some(([id]) => id === patch.depth)) && (patch.autoSuggest === undefined || typeof patch.autoSuggest === 'boolean');

// Modes that show the Auto-suggest switch: Auto and Tutor, hidden in Ask (decision D22). A mode of Auto shows it, but until a
// release makes Auto suggest something unasked it only governs the Tutor's proactive suggestions.
// ponytail: narrow to ['tutor'] if cleanup leaves no unasked suggestion in Auto before R4.
export const AUTO_SUGGEST_MODES = ['auto', 'tutor'];

// The request field Depth rides in: nothing for Standard, so a request is exactly today's until the learner chooses.
export const depthField = settings => (settings && settings.depth !== 'standard' ? { depth: settings.depth } : {});

// The controls proactive Tutor decisions read: Auto-suggest off turns the Tutor's unasked suggestions off, whatever this
// canvas's own switch says. The canvas switch itself (learn_coaching_state.tutor_enabled) is not touched.
export const withAutoSuggest = (controls, settings) => (settings && settings.autoSuggest === false && controls.tutorEnabled ? { ...controls, tutorEnabled: false } : controls);

// scope: { app, board }; call: api(path, init); channel: { postMessage } or null.
export function createSettingsSync({ scope, call, channel = null }) {
  let settings = { ...DEFAULT_SETTINGS }, status = 'loading', save = 'saved', learner = null, live = false, loads = 0, pending = 0, snapshot;
  const listeners = new Set();
  const refresh = () => { snapshot = { settings, status, saveStatus: save, depth: settings.depth, autoSuggest: settings.autoSuggest }; };
  const notify = () => { refresh(); listeners.forEach(fn => fn()); };
  refresh();
  const url = `/api/learn/user-settings?app=${encodeURIComponent(scope.app)}&board=${encodeURIComponent(scope.board)}`;

  async function load() {
    const mine = ++loads;
    try {
      const out = await call(url);
      if (!live || mine !== loads) return;
      learner = out.learner ?? learner;
      if (!pending) settings = { ...DEFAULT_SETTINGS, ...out.settings };
      status = out.unsaved ? 'unsaved' : 'ready';
    } catch {
      if (!live || mine !== loads) return;
      status = 'error';
    }
    notify();
  }

  // patch: { depth?, autoSuggest? }. Applied here at once. Returns false for a value the server would refuse.
  async function set(patch) {
    if (!valid(patch)) return false;
    settings = { ...settings, ...patch };
    save = 'saving'; pending += 1; notify();
    try {
      const out = await call('/api/learn/user-settings', { method: 'POST', body: JSON.stringify({ app: scope.app, board: scope.board, ...patch }) });
      if (!live) return true;
      learner = out.learner ?? learner;
      pending -= 1;
      // A newer change still in flight stays on top of this answer; the last one to land is the server's value.
      if (!pending) { settings = { ...DEFAULT_SETTINGS, ...out.settings }; save = 'saved'; }
      channel?.postMessage({ app: scope.app, board: scope.board, learner, settings: out.settings });
    } catch {
      pending = Math.max(0, pending - 1);
      if (!pending) save = 'error'; // refused or offline: the choice stays in this tab, unsaved
    }
    notify();
    return true;
  }

  return {
    view: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    set, load,
    receive: message => {
      if (!message || !message.settings || !learner || message.learner !== learner || pending) return;
      // Auto-suggest is the learner's on every canvas; Depth only on the canvas it was chosen for.
      const next = { ...settings, autoSuggest: message.settings.autoSuggest, ...(message.app === scope.app && message.board === scope.board ? { depth: message.settings.depth } : {}) };
      if (next.autoSuggest === settings.autoSuggest && next.depth === settings.depth) return;
      settings = next; notify();
    },
    retry: () => { if (status === 'error') { status = 'loading'; notify(); load(); } else if (save === 'error') { set({ depth: settings.depth, autoSuggest: settings.autoSuggest }); } },
    start: () => { live = true; return load(); },
    stop: () => { live = false; loads += 1; },
  };
}
