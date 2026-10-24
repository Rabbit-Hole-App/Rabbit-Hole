// Study map defaults wiring (docs/features/focus-study.md section 2): the pure rules are in widget-visibility.test.mjs; this pins
// that the app routes through them. The browser run is e2e/study-maps-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('AdaptiveCanvas recomputes minimap and holeMap from the effective widgets and routes toggles through widgetToggle', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /onPinForStudy = null, study = null,/);
  assert.match(canvas, /const \[minimapPref, setMinimapPref\] = useState\(\(\) => uiPrefs\(\)\.minimap\)/);
  assert.match(canvas, /const \{ minimap, holeMap \} = effectiveWidgets\(\{ mode: widgetMode, canvas: \{ minimap: minimapPref, holeMap: holeMapPref \}, study: study\?\.state\?\.maps \}\)/);
  assert.match(canvas, /if \(route\.store === 'study'\) \{ study\?\.setMap\(name, on\); return; \}/);
  // Study entry never goes through the Canvas preference setters or saveUiPref.
  assert.doesNotMatch(canvas, /showWidget\([^)]*false\)/);
  assert.match(canvas, /onState\?\.\(\{ grid, lock, minimap, holeMap, curious, toolbar,/);
});

test('LearnPage hands the Study object to the canvas and useStudy exposes setMap through the one write path', () => {
  assert.match(read('./LearnPage.jsx'), /onPinForStudy=\{study\.pinCard\} study=\{study\}/);
  assert.match(read('./StudyPane.jsx'), /setMap: \(name, on\) => apply\(\[\{ type: 'setMap', name, on \}\]\),/);
});

test('the canvas loading placeholder applies the same effective visibility, from the Study object LearnPage already read', () => {
  const loading = read('./CanvasLoading.jsx');
  assert.match(loading, /import \{ effectiveWidgets \} from '\.\/widget-visibility\.js';/);
  assert.match(loading, /export function CanvasChromeLoading\(\{ tools = true, feedback = false, top = 0, study = null \}\)/);
  assert.match(loading, /const prefs = effectiveWidgets\(\{ mode: study\?\.mode === 'study' \? 'study' : 'canvas', canvas: uiPrefs\(\), study: study\?\.state\?\.maps \}\);/);
  assert.match(read('./LearnPage.jsx'), /<CanvasChromeLoading feedback top=\{48\} study=\{study\} \/>/);
});

test('the View menu toolbar checkmark follows the canvas: LearnPage keeps a changed toolbar value (it was left out of the state comparison)', () => {
  assert.match(read('./LearnPage.jsx'), /previous\.curious === next\.curious && previous\.toolbar === next\.toolbar && previous\.pages === next\.pages/);
});

// WP5 P2: the Study Notebook/Canvas switch follows Focus: onCanvasState keeps a changed focus.
test('onCanvasState re-renders when focus changes', () => {
  assert.ok(read('./LearnPage.jsx').includes('JSON.stringify(previous.focus) === JSON.stringify(next.focus)'));
});
