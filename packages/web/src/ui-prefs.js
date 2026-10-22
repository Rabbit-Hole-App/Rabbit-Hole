// Interface preferences kept on this device (Settings > Appearance & input): text size, reduced decorative motion and the chat
// send key. There is no account preferences table yet (C:/s/spec/ui-changes/L11-report.md), so Settings labels each one
// "This device". One JSON entry; a missing, unreadable or odd value is the default, never an error.
// The canvas View menu's three widgets (owner brief 2026-10-21 item 3) are kept here too: minimap, holeMap (the Rabbit Hole
// Map) and curious (the Curious suggestions), all on by default, for every canvas on this device.
const KEY = 'rh.ui-prefs';
export const UI_PREF_DEFAULTS = Object.freeze({ textSize: 'default', reduceMotion: false, chatSend: 'enter', minimap: true, holeMap: true, curious: true, comments: true });
// Interface text only: index.css scales the chrome's text tokens by these and the canvas world keeps authored content at 1.
export const TEXT_SIZES = { default: 1, large: 1.125, larger: 1.25 };
const VALID = {
  textSize: value => Object.hasOwn(TEXT_SIZES, value),
  reduceMotion: value => typeof value === 'boolean',
  chatSend: value => value === 'enter' || value === 'mod',
  minimap: value => typeof value === 'boolean',
  holeMap: value => typeof value === 'boolean',
  curious: value => typeof value === 'boolean',
  comments: value => typeof value === 'boolean',
};

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function readUiPrefs(storage = store()) {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(KEY) || '{}') || {}; } catch { saved = {}; }
  const prefs = { ...UI_PREF_DEFAULTS };
  for (const name of Object.keys(VALID)) if (VALID[name](saved[name])) prefs[name] = saved[name];
  return prefs;
}

// <html data-text-size data-reduce-motion>: what index.css reads. Defaults leave no attribute, so nothing changes for them.
export function applyUiPrefs(prefs = readUiPrefs(), root = globalThis.document?.documentElement) {
  if (!root) return;
  if (prefs.textSize === 'default') root.removeAttribute('data-text-size');
  else root.setAttribute('data-text-size', prefs.textSize);
  if (prefs.reduceMotion) root.setAttribute('data-reduce-motion', '');
  else root.removeAttribute('data-reduce-motion');
}

// Values in force in this page that the browser refused to save (empty once a save succeeds).
let unsaved = {};
export const uiPrefs = (storage = store()) => ({ ...readUiPrefs(storage), ...unsaved });

// Applies at once, then saves. Throws when the browser refuses the write (storage blocked or full): the change still holds
// in this page until a reload, and Settings says it was not saved.
export function saveUiPref(name, value, { storage = store(), root } = {}) {
  if (!VALID[name]?.(value)) throw new Error(`Unknown ${name}`);
  const next = { ...uiPrefs(storage), [name]: value };
  applyUiPrefs(next, root);
  try {
    if (!storage) throw new Error('no storage');
    storage.setItem(KEY, JSON.stringify(next));
    unsaved = {};
  } catch {
    unsaved = next;
    throw new Error('Not saved: this browser is not allowing Rabbit Hole to store settings. It applies until you reload.');
  }
}

// The chat send key ('enter' | 'mod') for composer-keys.js, and how Settings and the composer name the modifier.
export const chatSendKey = () => uiPrefs().chatSend;
export const modKeyLabel = (platform = globalThis.navigator?.platform || '') => (/Mac|iPhone|iPad/.test(platform) ? '⌘' : 'Ctrl');
export const sendKeyLabel = (sendKey = chatSendKey()) => (sendKey === 'mod' ? `${modKeyLabel()}+Enter` : 'Enter');
