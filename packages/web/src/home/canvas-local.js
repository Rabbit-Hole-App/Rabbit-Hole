// This browser's canvas content (T02 §8.3, §8.4), read the way Learn writes it. Pure: the
// storage is passed in. Home, Library, the Project canvases list, the canvas route gate and
// create_canvas Undo all decide from here, so they cannot disagree.

// LearnPage.jsx:143 builds the base from the app's org, the viewer's email and the slug.
// Content is under :ink (the AdaptiveCanvas storageKey, :794), questions under :chat (:158),
// sources under :sources (:169).
export function canvasKeys({ org, email, slug }) {
  const base = `small.adaptive-canvas:${org}:${email}:${slug}`;
  return { base, ink: `${base}:ink`, chat: `${base}:chat`, sources: `${base}:sources` };
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
export const hasLocalContent = (storage, keys) =>
  !blank(storage, keys.ink, (blob) => Object.values(blob).every(empty)) || !blank(storage, keys.chat, empty);

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

// Learn, or "This canvas's content isn't in this browser" (T02 §8.3). A record with no
// device id predates device ids and opens as before.
export const opensHere = ({ storage, keys, record }) =>
  hasLocalContent(storage, keys) || record.device_id == null || record.device_id === deviceId(storage);
