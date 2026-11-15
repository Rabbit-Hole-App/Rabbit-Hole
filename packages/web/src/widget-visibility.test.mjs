// The one widget-visibility calculation (docs/features/focus-study.md): Study hides both maps unless the learner chose
// otherwise in Study, and the two stores never write each other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOCUS_HIDDEN, effectiveWidgets, focusWidgets, toolbarDrawn, widgetToggle } from './widget-visibility.js';
import { defaultStudy, readStudy, studyReducer, writeStudy } from './study-state.js';
import { readUiPrefs, saveUiPref, UI_PREF_DEFAULTS } from './ui-prefs.js';

const ALL_ON = { minimap: true, holeMap: true, curious: true, toolbar: true };
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map }; };

test('Canvas mode shows the Canvas preferences; missing values are the ui-prefs defaults', () => {
  assert.deepEqual(effectiveWidgets({ mode: 'canvas', canvas: { ...ALL_ON, holeMap: false }, study: { minimap: false } }), { ...ALL_ON, holeMap: false });
  assert.deepEqual(effectiveWidgets({ mode: 'canvas', canvas: {} }), { minimap: UI_PREF_DEFAULTS.minimap, holeMap: UI_PREF_DEFAULTS.holeMap, curious: UI_PREF_DEFAULTS.curious, toolbar: UI_PREF_DEFAULTS.toolbar });
  assert.deepEqual(effectiveWidgets(), effectiveWidgets({ mode: 'canvas', canvas: {} }));
});

test('Study mode: both maps hidden with no Study choice, whatever the Canvas preferences; the other widgets follow Canvas', () => {
  for (const study of [undefined, null, {}, defaultStudy().maps, { minimap: 'yes', holeMap: 1 }])
    assert.deepEqual(effectiveWidgets({ mode: 'study', canvas: ALL_ON, study }), { ...ALL_ON, minimap: false, holeMap: false }, JSON.stringify(study));
  assert.deepEqual(effectiveWidgets({ mode: 'study', canvas: { ...ALL_ON, toolbar: false, curious: false }, study: { holeMap: true } }), { minimap: false, holeMap: true, curious: false, toolbar: false });
  assert.deepEqual(effectiveWidgets({ mode: 'study', canvas: { ...ALL_ON, minimap: false }, study: { minimap: true } }).minimap, true, 'an explicit Study choice shows a map Canvas hides');
});

test('widgetToggle: in Study a map goes to the Study store, everything else to the Canvas store', () => {
  assert.deepEqual(widgetToggle({ mode: 'study', name: 'minimap', on: true }), { store: 'study', action: { type: 'setMap', name: 'minimap', on: true } });
  assert.deepEqual(widgetToggle({ mode: 'study', name: 'holeMap', on: false }), { store: 'study', action: { type: 'setMap', name: 'holeMap', on: false } });
  assert.deepEqual(widgetToggle({ mode: 'study', name: 'toolbar', on: false }), { store: 'canvas', name: 'toolbar', on: false });
  assert.deepEqual(widgetToggle({ mode: 'canvas', name: 'minimap', on: false }), { store: 'canvas', name: 'minimap', on: false });
  assert.equal(widgetToggle({ mode: 'study', name: 'comments', on: true }), null);
  assert.equal(widgetToggle({ mode: 'study', name: 'minimap', on: 'yes' }), null);
});

// The round trip the canvas runs: a toggle routed by widgetToggle, written to its store, then read back for both modes.
function toggle(stores, mode, name, on) {
  const routed = widgetToggle({ mode, name, on });
  if (routed.store === 'study') { stores.study = studyReducer(stores.study, routed.action); return writeStudy(stores.studyStorage, 'scope', stores.study); }
  try { saveUiPref(name, on, { storage: stores.prefStorage, root: null }); } catch { /* blocked: holds in the page */ }
  return null;
}

test('a Study toggle never touches the Canvas preferences; a Canvas toggle never touches the Study choice', () => {
  const stores = { study: studyReducer(defaultStudy(), { type: 'setMode', mode: 'study' }), studyStorage: memory(), prefStorage: memory() };
  const canvasBefore = readUiPrefs(stores.prefStorage);
  assert.deepEqual(toggle(stores, 'study', 'minimap', true), { ok: true, durable: true });
  assert.deepEqual(readUiPrefs(stores.prefStorage), canvasBefore, 'Canvas preferences unchanged by a Study toggle');
  assert.deepEqual(readStudy(stores.studyStorage, 'scope').maps, { minimap: true }, 'the Study choice survives a reload');
  assert.deepEqual(effectiveWidgets({ mode: 'study', canvas: readUiPrefs(stores.prefStorage), study: readStudy(stores.studyStorage, 'scope').maps }), { ...ALL_ON, holeMap: false });

  toggle(stores, 'canvas', 'holeMap', false);
  assert.equal(readUiPrefs(stores.prefStorage).holeMap, false);
  assert.deepEqual(readStudy(stores.studyStorage, 'scope').maps, { minimap: true }, 'Study choice unchanged by a Canvas toggle');

  // Leaving Study (unpin or View > Canvas) reads the Canvas preferences again, untouched by Study.
  const left = studyReducer(stores.study, { type: 'unpin' });
  assert.deepEqual(effectiveWidgets({ mode: left.mode, canvas: readUiPrefs(stores.prefStorage), study: left.maps }), { ...ALL_ON, holeMap: false });
  assert.deepEqual(left.maps, { minimap: true }, 'the Study choice is kept for the next visit');
});

test('blocked storage: a Study toggle still applies in the page and is never reported as saved', async () => {
  const { memoryStorage } = await import('./storage-fallback.js');
  for (const studyStorage of [null, { getItem: () => null, setItem: () => { throw Error('SecurityError'); } }, memoryStorage()]) {
    const stores = { study: studyReducer(defaultStudy(), { type: 'setMode', mode: 'study' }), studyStorage, prefStorage: memory() };
    const result = toggle(stores, 'study', 'holeMap', true);
    assert.equal(result.ok, false);
    assert.equal(effectiveWidgets({ mode: 'study', canvas: ALL_ON, study: stores.study.maps }).holeMap, true, 'shown for this page');
  }
});

// Focus (owner, 2026-10-28): the minimap, the Rabbit Hole map and Curious stand down while a card is focused; the toolbar stays;
// Back to canvas shows each exactly as before, a hidden one included. focusWidgets is a view, so nothing is written to restore.
test('focus hides the minimap, Rabbit Hole map and Curious, keeps the toolbar, and restores each exactly', () => {
  assert.deepEqual([...FOCUS_HIDDEN], ['minimap', 'holeMap', 'curious']);
  for (const shown of [{ minimap: true, holeMap: true, curious: true, toolbar: true }, { minimap: false, holeMap: true, curious: false, toolbar: false }, { minimap: true, holeMap: false, curious: true, toolbar: true }]) {
    const before = structuredClone(shown);
    assert.deepEqual(focusWidgets(shown, true), { minimap: false, holeMap: false, curious: false, toolbar: shown.toolbar });
    assert.deepEqual(shown, before, 'the choices are never written');
    assert.equal(focusWidgets(shown, false), shown, 'out of Focus: exactly what was shown, already-hidden ones still hidden');
  }
});

// Owner, 2026-10-29: a pinned Study with its notebook in Focus hides the drawing toolbar; Canvas or unpinning shows the saved choice.
test('toolbarDrawn: hidden over the pinned Study notebook only, otherwise the saved choice (hidden stays hidden)', () => {
  assert.equal(toolbarDrawn(true, { studying: true, pinned: true, focusKind: 'notebook' }), false);
  assert.equal(toolbarDrawn(false, { studying: true, pinned: true, focusKind: 'notebook' }), false);
  for (const saved of [true, false]) {
    assert.equal(toolbarDrawn(saved, { studying: true, pinned: true, focusKind: null }), saved, 'Study on Canvas');
    assert.equal(toolbarDrawn(saved, { studying: true, pinned: true, focusKind: 'card' }), saved, 'another card in Focus');
    assert.equal(toolbarDrawn(saved, { studying: false, pinned: false, focusKind: 'notebook' }), saved, 'unpinned, notebook in Focus');
    assert.equal(toolbarDrawn(saved, { studying: true, pinned: false, focusKind: 'notebook' }), saved, 'Study with no pin');
    assert.equal(toolbarDrawn(saved), saved);
  }
});

// Pinned Study for a codebase canvas (pinned-study-codebase-spec.md 2d): on a repository canvas, Study hides the toolbar, the minimap and the Rabbit Hole map
// whatever the saved choices, for every work and focus kind; a Release 1 canvas keeps its rules; nothing is written.
import { HIDDEN_IN_STUDY, studyHides, widgetLocked } from './widget-visibility.js';

test('repository canvas in Study: toolbar, minimap and holeMap hidden for every work x focusKind; Canvas mode and Release 1 canvases keep the saved choices', () => {
  const study = { minimap: true, holeMap: true };
  for (const work of ['canvas', 'notebook', 'run', 'runbook']) for (const focusKind of [null, 'notebook', 'run', 'doc', 'pdf']) {
    const shown = effectiveWidgets({ mode: 'study', canvas: ALL_ON, study, repository: true });
    assert.deepEqual([shown.minimap, shown.holeMap, toolbarDrawn(true, { studying: true, pinned: work === 'notebook', focusKind, repository: true })], [false, false, false], `${work} ${focusKind}`);
  }
  assert.deepEqual(effectiveWidgets({ mode: 'canvas', canvas: ALL_ON, study, repository: true }), ALL_ON, 'Canvas: as saved');
  assert.equal(toolbarDrawn(true, { studying: false, repository: true }), true);
  assert.deepEqual(effectiveWidgets({ mode: 'study', canvas: ALL_ON, study }), { ...ALL_ON }, 'Release 1: the Study map choice still shows them');
  assert.equal(toolbarDrawn(true, { studying: true, pinned: false, focusKind: 'notebook' }), true, 'Release 1: the toolbar rule is unchanged');
});

test('repository Study: the toggles are locked with the tooltip; nothing reaches either store; leaving Study shows the saved choices', () => {
  assert.equal(HIDDEN_IN_STUDY, 'Hidden in Study');
  for (const name of ['toolbar', 'minimap', 'holeMap']) {
    assert.equal(widgetLocked({ mode: 'study', repository: true, name }), true, name);
    assert.equal(widgetToggle({ mode: 'study', name, on: true, repository: true }), null, `${name}: no store is written`);
    assert.equal(widgetLocked({ mode: 'canvas', repository: true, name }), false);
    assert.equal(widgetLocked({ mode: 'study', repository: false, name }), false);
  }
  assert.equal(widgetLocked({ mode: 'study', repository: true, name: 'curious' }), false);
  assert.deepEqual(widgetToggle({ mode: 'study', name: 'curious', on: false, repository: true }), { store: 'canvas', name: 'curious', on: false });
  assert.deepEqual(widgetToggle({ mode: 'study', name: 'minimap', on: true }), { store: 'study', action: { type: 'setMap', name: 'minimap', on: true } }, 'Release 1: unchanged');
  assert.equal(studyHides({ mode: 'study', repository: true }), true);
  assert.equal(studyHides({ mode: 'canvas', repository: true }), false);
  const prefs = memory(), before = readUiPrefs(prefs);
  effectiveWidgets({ mode: 'study', canvas: before, study: {}, repository: true });
  assert.deepEqual(readUiPrefs(prefs), before, 'computing the Study view writes nothing');
  assert.deepEqual(effectiveWidgets({ mode: 'canvas', canvas: before, study: {}, repository: true }), effectiveWidgets({ mode: 'canvas', canvas: before }), 'leaving Study: the saved choices');
});
