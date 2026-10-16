// This browser's canvas content (T02 §8.3, §8.4), read the way Learn writes it. Pure: the
// storage is passed in. Home, Library, the Project canvases list, the canvas route gate and
// create_canvas Undo all decide from here, so they cannot disagree.
import { docIsEmpty } from '../canvas-doc.js';

// LearnPage.jsx:143 builds the base from the app's org, the viewer's email and the slug.
// Content is under :ink (the AdaptiveCanvas storageKey, :794), questions under :chat (:158),
// sources under :sources (:169).
export function canvasKeys({ org, email, slug }) {
  const base = `small.adaptive-canvas:${org}:${email}:${slug}`;
  return { base, ink: `${base}:ink`, chat: `${base}:chat`, sources: `${base}:sources` };
}

// window.localStorage, or null where the browser blocks it: reading the property itself then throws (a SecurityError) before
// any helper's own try/catch runs, so pages pass this instead (follow-up R3 item 3). Every helper here treats null as unreadable.
export function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

// This browser's copy of a board, for a save: {} when there is none, null when it cannot be read (blocked storage, or a value
// that is not a board). An unreadable copy is never {}: saved, that empty board would replace the server's content.
export function readBoardCopy(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return {};
    const state = JSON.parse(raw);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : null;
  } catch {
    return null;
  }
}

// The server version this browser's copy is based on: 0 when none is stored, null when it cannot be read or is not a version.
// An unreadable version never proves this browser's copy is current.
export function readBoardVersion(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return 0;
    const version = Number(raw);
    return raw.trim() !== '' && Number.isInteger(version) && version >= 0 ? version : null;
  } catch {
    return null;
  }
}

const empty = (value) => Array.isArray(value) && value.length === 0;

// Absent, or present and holding nothing. Anything unreadable counts as content, so Undo
// never deletes it and the gate never hides it.
function blank(storage, key, isBlank) {
  try {
    const raw = storage.getItem(key);
    return raw === null || isBlank(JSON.parse(raw));
  } catch {
    return false;
  }
}

// Learn writes empty arrays as soon as a canvas opens (AdaptiveCanvas.jsx:774, LearnPage.jsx:163),
// so opened is not touched: content is any stroke, shape, item, link, block or question.
// The document (docs/features/blocknote-canvas.md, the `doc` key) is an object: a sheet with no words is not content either.
export const hasLocalContent = (storage, keys) =>
  !blank(storage, keys.ink, (blob) => Object.entries(blob).every(([key, value]) => (key === 'doc' ? docIsEmpty(value) : empty(value)))) || !blank(storage, keys.chat, empty);

// The board a Fork sends for your own canvas (docs/features/canvas-forking.md): what Learn saved in this
// browser - the canvas and its chat cards - or null when this browser holds none of it, so the server
// copy (or a plain refusal) decides instead of an empty fork.
export function localBoard(storage, keys) {
  if (!hasLocalContent(storage, keys)) return null;
  try { return { ...JSON.parse(storage.getItem(keys.ink) || '{}'), exchanges: JSON.parse(storage.getItem(keys.chat) || '[]') }; } catch { return null; }
}

// An opaque id for this browser, stored with each new canvas (T02 §8.3). Not personal data.
export function deviceId(storage) {
  let id = null;
  try { id = storage.getItem('small.device'); } catch { /* blocked storage: a fresh id each call */ }
  if (!id) {
    id = crypto.randomUUID();
    try { storage.setItem('small.device', id); } catch { /* not kept */ }
  }
  return id;
}

// Learn, or the NOT_HERE state below (T02 §8.3). A record with no
// device id predates device ids and opens as before. The canvas route (CanvasPage.jsx) also opens a canvas whose
// board is on the server (docs/features/canvas-persistence.md); Home and the Library read the row's board_saved first
// (continue.js browserOnly), so only a canvas whose content is not on the server reaches this.
export const opensHere = ({ storage, keys, record }) =>
  hasLocalContent(storage, keys) || record.device_id == null || record.device_id === deviceId(storage);

// The server refused this browser's newest copy of the main board as over 1.9 MB (LearnPage `refused`), so that copy is
// only here even when an older one is on the server. Cleared by the next save that lands.
export const unsavedKey = (keys) => `${keys.ink}:unsaved`;
export function unsavedHere(storage, keys) {
  try { return storage.getItem(unsavedKey(keys)) !== null; } catch { return false; }
}

// The canvas gate's copy (checklist WP6, user 2026-09-28): content is browser-local, so it never says "device".
// One place for the gate and the harness.
export const NOT_HERE = "This canvas's content isn't available in this browser.";
export const NOT_HERE_WHY = 'The canvas exists, but its local content was created in another browser or has been cleared.';
