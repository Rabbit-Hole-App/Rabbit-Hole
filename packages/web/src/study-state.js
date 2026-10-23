// Pinned Study (UI-27 Release 1, contract C:/s/spec/pinned-study/contract.md): the learner's Study arrangement for one
// canvas, remembered in this browser only. Pure: no React, no DOM. It stores preferences and stable references, never
// document contents or file bytes (a text pin carries its card's text, which the card already holds on this canvas).

export const SPLIT_MIN = 0.25, SPLIT_MAX = 0.65, SPLIT_DEFAULT = 0.40;
const KINDS = ['pdf', 'text', 'explanation'];

export const studyKey = canvasKey => `${canvasKey}:study`;
export const defaultStudy = () => ({ v: 1, mode: 'canvas', work: 'canvas', pin: null, notebookId: null, split: SPLIT_DEFAULT, reader: null, canvasView: null });

const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
export const clampSplit = value => (num(value) == null ? SPLIT_DEFAULT : Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value)));

// The card kinds Release 1 pins: a PDF card, a text or sticky note on the canvas (not a code box), an Explanation card.
export function eligible(block) {
  if (!block || typeof block !== 'object') return null;
  if (block.type === 'pdf') return 'pdf';
  if (block.type === 'explanation') return 'explanation';
  if ((block.kind === 'text' && block.mode !== 'code') || block.kind === 'sticky') return 'text';
  return null;
}

function cleanPin(pin) {
  if (!pin || typeof pin !== 'object' || typeof pin.cardId !== 'string' || !pin.cardId || !KINDS.includes(pin.kind)) return null;
  const ref = pin.ref && typeof pin.ref === 'object' && typeof pin.ref.sourceId === 'string' ? pin.ref : null;
  return ref ? { cardId: pin.cardId, kind: pin.kind, ref } : null;
}
function cleanReader(reader) {
  if (!reader || typeof reader !== 'object') return null;
  const out = {};
  for (const field of ['page', 'zoom', 'rotation', 'scrollTop']) if (num(reader[field]) != null) out[field] = reader[field];
  return Object.keys(out).length ? out : null;
}
function cleanView(view) {
  return view && num(view.x) != null && num(view.y) != null && num(view.z) != null ? { x: view.x, y: view.y, z: view.z } : null;
}

// Any stored value made safe: a bad or partial value falls back field by field to the default.
export function normalize(value) {
  const base = defaultStudy();
  if (!value || typeof value !== 'object' || value.v !== 1) return base;
  return {
    v: 1,
    mode: value.mode === 'study' ? 'study' : 'canvas',
    work: value.work === 'notebook' ? 'notebook' : 'canvas',
    pin: cleanPin(value.pin),
    notebookId: typeof value.notebookId === 'string' && value.notebookId ? value.notebookId : null,
    split: clampSplit(value.split),
    reader: cleanReader(value.reader),
    canvasView: cleanView(value.canvasView),
  };
}

export function readStudy(storage, canvasKey) {
  try { return normalize(JSON.parse(storage.getItem(studyKey(canvasKey)) || 'null')); } catch { return defaultStudy(); }
}

export function writeStudy(storage, canvasKey, state) {
  try {
    if (!storage) throw new Error('No browser storage');
    storage.setItem(studyKey(canvasKey), JSON.stringify(normalize(state)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

// Actions: pin { cardId, kind, ref } (Pin for study, Change reference), unpin, setMode { mode }, setWork { work, notebookId? },
// setSplit { split }, readerAt { reader }, saveCamera { view }. Selecting a card is not an action: only pin replaces the pin.
export function studyReducer(state, action) {
  const s = normalize(state);
  switch (action?.type) {
    case 'pin': {
      const pin = cleanPin(action);
      if (!pin) return s;
      const same = s.pin?.cardId === pin.cardId;
      return { ...s, mode: 'study', pin, reader: same ? s.reader : null };
    }
    case 'unpin': return { ...s, mode: 'canvas', pin: null, reader: null };
    case 'setMode': return { ...s, mode: action.mode === 'study' ? 'study' : 'canvas' };
    case 'setWork': {
      const work = action.work === 'notebook' ? 'notebook' : 'canvas';
      const notebookId = typeof action.notebookId === 'string' && action.notebookId ? action.notebookId : s.notebookId;
      return { ...s, work, notebookId: work === 'notebook' ? notebookId : s.notebookId };
    }
    case 'setSplit': return { ...s, split: clampSplit(action.split) };
    case 'readerAt': return { ...s, reader: cleanReader({ ...s.reader, ...action.reader }) };
    case 'saveCamera': return { ...s, canvasView: cleanView(action.view) };
    default: return s;
  }
}
