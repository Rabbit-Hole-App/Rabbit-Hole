// The one widget-visibility calculation (docs/features/focus-study.md): Study hides both maps unless the learner chose
// otherwise in Study, and the two stores never write each other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveWidgets, widgetToggle } from './widget-visibility.js';
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
