// Pinned Study (UI-27 Release 1, contract C:/s/spec/pinned-study/contract.md): the learner's Study arrangement for one
// canvas, remembered in this browser only. Pure: no React, no DOM. It stores preferences and stable references, never
// document contents or file bytes (a text pin carries its card's text, which the card already holds on this canvas).

export const SPLIT_MIN = 0.25, SPLIT_MAX = 0.65, SPLIT_DEFAULT = 0.40;
const KINDS = ['pdf', 'text', 'explanation'];
// A repository canvas's Study (pinned-study-codebase-spec.md): the reference pane's tab and the work pane's choice.
export const REFERENCE_TABS = Object.freeze(['graph', 'files', 'pin']);
export const WORKS = Object.freeze(['canvas', 'notebook', 'run', 'runbook']);
// The id field each card-backed work keeps its card in.
export const WORK_ID = Object.freeze({ notebook: 'notebookId', run: 'runId', runbook: 'runbookId' });
// The card Study is working in now (the one in its Focus), else null.
export const ownedId = state => (WORK_ID[state?.work] ? state[WORK_ID[state.work]] || null : null);

// The canvas's key (LearnPage canvasKey: org, the viewer's email and the canvas name) plus the review board, as chatKey has it.
export const studyScope = (canvasKey, board = null) => `${canvasKey}${board ? `:${board}` : ''}`;
export const studyKey = scope => `${scope}:study`;
// maps: the learner's explicit Study choice per map (focus-study.md); a map absent here is hidden in Study (widget-visibility.js).
// referenceTab: 'graph' | 'files' | 'pin' (pin: the Release 1 card pin, only while one exists). filesPlace: where Files reopens. workSet: the learner
// (or Study these) chose the work; until then a canvas with a Run card opens its Study on Run. panelWas: the right panel's open state
// when Study closed it (null: not held), put back on leaving.
export const defaultStudy = () => ({ v: 1, mode: 'canvas', work: 'canvas', workSet: false, pin: null, referenceTab: 'graph', notebookId: null, runId: null, runbookId: null, filesPlace: null, panelWas: null, split: SPLIT_DEFAULT, reader: null, canvasView: null, maps: {} });
// The maps Study keeps its own choice for; every other widget follows the Canvas preference (ui-prefs.js) in both modes.
export const STUDY_MAPS = Object.freeze(['minimap', 'holeMap']);

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
function cleanPlace(place) {
  if (!place || typeof place !== 'object' || typeof place.path !== 'string' || !place.path) return null;
  return num(place.line) != null && place.line > 0 ? { path: place.path, line: Math.floor(place.line) } : { path: place.path };
}
const cleanId = id => (typeof id === 'string' && id ? id : null);
function cleanReader(reader) {
  if (!reader || typeof reader !== 'object') return null;
  const out = {};
  for (const field of ['page', 'zoom', 'rotation', 'scrollTop']) if (num(reader[field]) != null) out[field] = reader[field];
  return Object.keys(out).length ? out : null;
}
function cleanMaps(maps) {
  const out = {};
  if (maps && typeof maps === 'object') for (const name of STUDY_MAPS) if (typeof maps[name] === 'boolean') out[name] = maps[name];
  return out;
}
function cleanView(view) {
  return view && num(view.x) != null && num(view.y) != null && num(view.z) != null ? { x: view.x, y: view.y, z: view.z } : null;
}

// Any stored value made safe: a bad or partial value falls back field by field to the default.
export function normalize(value) {
  const base = defaultStudy();
  if (!value || typeof value !== 'object' || value.v !== 1) return base;
  const pin = cleanPin(value.pin), work = WORKS.includes(value.work) ? value.work : 'canvas';
  const referenceTab = REFERENCE_TABS.includes(value.referenceTab) ? value.referenceTab : pin ? 'pin' : 'graph';
  return {
    v: 1,
    mode: value.mode === 'study' ? 'study' : 'canvas',
    work,
    // An arrangement saved before Study these / Run existed has no workSet: a chosen Notebook counts as chosen, Canvas does not.
    workSet: typeof value.workSet === 'boolean' ? value.workSet : work !== 'canvas',
    pin,
    // No referenceTab (the Release 1 shape): the pin when there is one, else the graph. 'pin' without a pin falls back too.
    referenceTab: referenceTab === 'pin' && !pin ? 'graph' : referenceTab,
    notebookId: cleanId(value.notebookId),
    runId: cleanId(value.runId),
    runbookId: cleanId(value.runbookId),
    filesPlace: cleanPlace(value.filesPlace),
    panelWas: typeof value.panelWas === 'boolean' ? value.panelWas : null,
    split: clampSplit(value.split),
    reader: cleanReader(value.reader),
    canvasView: cleanView(value.canvasView),
    // Absent in an arrangement saved before Study map choices existed: {} (both hidden), still version 1.
    maps: cleanMaps(value.maps),
  };
}

export function readStudy(storage, scope) {
  try { return normalize(JSON.parse(storage.getItem(studyKey(scope)) || 'null')); } catch { return defaultStudy(); }
}

// ok: kept in this browser across a reload. A blocked browser's stand-in (storage-fallback.js memoryStorage, memory: true)
// accepts the write but loses it on reload, so it is never reported as saved.
export function writeStudy(storage, scope, state) {
  try {
    if (!storage) throw new Error('No browser storage');
    storage.setItem(studyKey(scope), JSON.stringify(normalize(state)));
    return storage.memory === true ? { ok: false, durable: false, error: 'This browser keeps it only until you reload' } : { ok: true, durable: true };
  } catch (error) {
    return { ok: false, durable: false, error: String(error?.message || error) };
  }
}
// The pane's status line for the last write: only a failure is said (owner 2026-11-15: no "Saved on this browser" line); a good save shows nothing.
export const NOT_SAVED = 'Not saved: this browser is not allowing Rabbit Hole to store this. It applies until you reload.';
export const studyStatusText = status => (status === 'error' ? NOT_SAVED : '');

// The reader's Pin for study (the Context reader): the one PDF card on this canvas whose ref is the source being read.
// Two cards of one source are ambiguous, so neither is guessed: null, and the reader offers no pin.
export function readerPinTarget(objects, sourceId, refOf) {
  const matches = (objects || []).filter(object => eligible(object) === 'pdf' && refOf(object)?.sourceId === sourceId);
  return matches.length === 1 ? matches[0].id : null;
}

// The one slot through which the Context reader (SourcesPane) reaches the owner's Study (StudyPane useStudy sets it while
// mounted, null elsewhere, so a shared canvas's reader offers no pin). Kept here so the reader never imports the Study pane.
let readerPin = null;
export const setStudyReaderPin = value => { readerPin = value; };
export const studyReaderPin = () => readerPin;

// Where the reference pane goes in the space left beside the right panels (the section's own size, never the window's width):
// beside the work when both keep their minimum widths, otherwise stacked above it. size: the reference pane's width or height.
export const STUDY_MIN = Object.freeze({ reference: 300, work: 400, stackedReference: 180, stackedWork: 240 });
export function studyLayout({ width, height, split }) {
  const share = clampSplit(split), fit = (value, low, high) => Math.round(Math.min(Math.max(value, low), Math.max(low, high)));
  if (width >= STUDY_MIN.reference + STUDY_MIN.work) return { stacked: false, size: fit(width * share, STUDY_MIN.reference, width - STUDY_MIN.work) };
  return { stacked: true, size: fit(height * share, STUDY_MIN.stackedReference, height - STUDY_MIN.stackedWork) };
}

// Actions: pin { cardId, kind, ref } (Pin for study, Change reference), unpin, setMode { mode }, setWork { work, cardId? }, setReferenceTab { tab },
// filesAt { path, line }, panelWas { open },
// setSplit { split }, readerAt { reader }, saveCamera { view }, setMap { name, on } (an explicit View > Show / hide choice made
// in Study; it never touches the Canvas preferences). Selecting a card is not an action: only pin replaces the pin.
export function studyReducer(state, action) {
  const s = normalize(state);
  switch (action?.type) {
    case 'pin': {
      const pin = cleanPin(action);
      if (!pin) return s;
      const same = s.pin?.cardId === pin.cardId;
      return { ...s, mode: 'study', pin, referenceTab: 'pin', reader: same ? s.reader : null };
    }
    // The pin goes, not the tab: a Pinned tab with no pin falls back to Files where one was open, else the graph.
    case 'unpin': return { ...s, mode: 'canvas', pin: null, reader: null, referenceTab: s.referenceTab === 'pin' ? (s.filesPlace ? 'files' : 'graph') : s.referenceTab };
    case 'setReferenceTab': return REFERENCE_TABS.includes(action.tab) && (action.tab !== 'pin' || s.pin) ? { ...s, referenceTab: action.tab } : s;
    case 'filesShut': return s.filesPlace ? { ...s, filesPlace: null } : s; // the learner closed the open file: Files does not reopen it
    case 'filesAt': { const filesPlace = cleanPlace(action); return filesPlace ? { ...s, filesPlace } : s; }
    case 'panelWas': return { ...s, panelWas: typeof action.open === 'boolean' ? action.open : null };
    case 'setMode': return { ...s, mode: action.mode === 'study' ? 'study' : 'canvas' };
    // setWork { work, cardId? }: the card id is kept for its kind (notebookId, runId, runbookId) so Study returns to it; notebookId is the old spelling.
    case 'setWork': {
      const work = WORKS.includes(action.work) ? action.work : 'canvas';
      const field = WORK_ID[work], id = cleanId(action.cardId) || cleanId(action.notebookId);
      return { ...s, work, workSet: true, ...(field && id ? { [field]: id } : {}) };
    }
    case 'setSplit': return { ...s, split: clampSplit(action.split) };
    case 'readerAt': return { ...s, reader: cleanReader({ ...s.reader, ...action.reader }) };
    case 'saveCamera': return { ...s, canvasView: cleanView(action.view) };
    case 'setMap': return STUDY_MAPS.includes(action.name) && typeof action.on === 'boolean' ? { ...s, maps: { ...s.maps, [action.name]: action.on } } : s;
    default: return s;
  }
}
