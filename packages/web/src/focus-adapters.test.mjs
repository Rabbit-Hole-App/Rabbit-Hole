// The Focus seam (focus-adapters.js, docs/features/focus-study.md section 2) with a test-only fake adapter: the registry decides
// the right-click row, the adapter hooks run once each in order, exit restores the saved navigation once (minus the focused card's
// own scroll), and an unclaimed Escape ends Focus. No browser: the host and nodes are plain objects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOCUS_BAR, syncFocus, workspaceFrame } from './focus-adapters.js';
import { focusAdapters, focusReducer, isFocusEligible, registerFocusAdapter, shouldExitOnEscape } from './focus-controller.js';
import { actionsFor, runAction } from './canvas-actions.js';
import { can } from './canvas-permissions.js';

const calls = [];
const fake = registerFocusAdapter({
  kind: 'fake-test', label: 'Focus fake',
  canFocus: block => block?.type === 'fake-test',
  enter: (host, frame, ctx) => calls.push(['enter', host.id, frame.width, ctx.view.z]),
  update: (host, frame, ctx) => calls.push(['update', host.id, frame.width, ctx.view.z]),
  exit: host => calls.push(['exit', host.id]),
});
test.after(() => focusAdapters.delete(fake.kind));

// A node inside card `id`, as exitNavigation reads it.
const nodeIn = id => ({ closest: () => ({ getAttribute: () => id }) });
const host = id => ({ id, focus() {} });
const VIEW = { x: 0, y: 0, z: 0.5 };
const FRAME = { left: 16, top: 68, width: 900, height: 600 };

test('workspaceFrame: the controller inset, then the header row taken off the top', () => {
  assert.deepEqual(workspaceFrame({ left: 0, top: 40, right: 1000, bottom: 800 }), { left: 16, top: 56 + FOCUS_BAR, width: 968, height: 728 - FOCUS_BAR });
  assert.equal(workspaceFrame({ left: 0, top: 0, right: 400, bottom: 700 }).left, 12, 'narrow pane: 12 px');
  assert.equal(workspaceFrame({ left: 0, top: 0, right: 100, bottom: 40 }).height, 0, 'never negative');
  assert.equal(workspaceFrame(null), null);
});

test('syncFocus: enter once, update on a new frame or camera, exit then restore once without the focused card scroll', () => {
  calls.length = 0;
  const hosts = { a: host('a'), b: host('b') }, restored = [], gone = [];
  const opts = view => ({ view, find: id => hosts[id] || null, restore: saved => restored.push(saved), gone: id => gone.push(id) });
  const saved = { owner: 'store', view: { x: 5, y: 6, z: 1 }, selection: ['a'], scroll: [{ node: nodeIn('a'), top: 9 }, { node: nodeIn('other'), top: 3 }] };
  let state = focusReducer(null, { type: 'enter', id: 'a', kind: 'fake-test', saved, frame: FRAME });
  let shown = syncFocus(null, state, opts(VIEW));
  shown = syncFocus(shown, state, opts(VIEW));
  assert.deepEqual(calls, [['enter', 'a', 900, 0.5]], 'a re-render with nothing new calls nothing');
  state = focusReducer(state, { type: 'workspace-changed', frame: { ...FRAME, width: 700 } });
  shown = syncFocus(shown, state, opts(VIEW));
  const zoomed = { x: 10, y: 0, z: 2 };
  shown = syncFocus(shown, state, opts(zoomed));
  assert.deepEqual(calls.slice(1), [['update', 'a', 700, 0.5], ['update', 'a', 700, 2]], 'a new frame and a camera move each update');
  // Another card while focused: old exit, new enter, nothing restored yet.
  state = focusReducer(state, { type: 'enter', id: 'b', kind: 'fake-test', saved: { ...saved, view: { x: 0, y: 0, z: 3 } }, frame: FRAME });
  shown = syncFocus(shown, state, opts(zoomed));
  assert.deepEqual(calls.slice(3), [['exit', 'a'], ['enter', 'b', 900, 2]]);
  assert.deepEqual(restored, []);
  // Back to canvas: exit, then the first saved navigation, minus scroll inside the focused card (b: none, so both stay).
  state = focusReducer(state, { type: 'exit' });
  shown = syncFocus(shown, state, opts(zoomed));
  assert.equal(shown, null);
  assert.deepEqual(calls.slice(5), [['exit', 'b']]);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].view, { x: 5, y: 6, z: 1 }, 'where Focus began');
  assert.equal(restored[0].scroll.length, 2);
  assert.equal(syncFocus(null, null, opts(zoomed)), null, 'nothing focused: nothing runs');
  assert.deepEqual(gone, []);
});

test('syncFocus: the focused card scroll is never put back; a card with no host or no adapter is gone', () => {
  calls.length = 0;
  const restored = [], gone = [];
  const saved = { owner: 'store', view: VIEW, selection: [], scroll: [{ node: nodeIn('a'), top: 9 }, { node: nodeIn('other'), top: 3 }] };
  const state = focusReducer(null, { type: 'enter', id: 'a', kind: 'fake-test', saved, frame: FRAME });
  const shown = syncFocus(null, state, { view: VIEW, find: () => host('a'), restore: s => restored.push(s) });
  syncFocus(shown, focusReducer(state, { type: 'content-gone', id: 'a' }), { view: VIEW, find: () => null, restore: s => restored.push(s) });
  assert.deepEqual(restored[0].scroll.map(entry => entry.top), [3], 'the reader keeps its latest position');
  assert.equal(syncFocus(null, state, { view: VIEW, find: () => null, gone: id => gone.push(id) }), null);
  assert.equal(syncFocus(null, { ...state, kind: 'no-adapter' }, { view: VIEW, find: () => host('a'), gone: id => gone.push(id) }), null);
  assert.deepEqual(gone, ['a', 'a']);
  assert.deepEqual(calls, [['enter', 'a', 900, 0.5], ['exit', 'a']]);
});

test('the right-click Focus row: only where an adapter claims the object, for a viewer too, running the one focus command', () => {
  const ran = [];
  const ctx = role => ({
    readOnly: role === 'viewer', can: capability => can(capability, { role, shared: role !== 'owner' }), locked: () => false, lockable: () => false,
    groupOf: () => null, familyOf: () => 'block', commands: {},
    canvas: { focusable: object => isFocusEligible(object), focus: id => ran.push(id), select: () => {} },
  });
  const card = object => ({ kind: 'card', family: 'block', type: object.type, id: object.id, object, ids: [object.id], objects: [object], part: null, group: null });
  const claimed = card({ id: 'f1', type: 'fake-test' }), other = card({ id: 'h1', type: 'heading' });
  for (const role of ['owner', 'viewer']) {
    const row = actionsFor(claimed, ctx(role)).find(entry => entry.id === 'card.focus');
    assert.ok(row && !row.disabled && row.label === 'Focus' && row.attrs['data-menu-focus'] === '', `${role}: Focus offered`);
    assert.equal(actionsFor(other, ctx(role)).some(entry => entry.id === 'card.focus'), false, `${role}: no Focus where no adapter claims it`);
  }
  assert.equal(runAction('card.focus', claimed, ctx('viewer')).ran, true);
  assert.deepEqual(ran, ['f1']);
  assert.equal(isFocusEligible({ id: 'x', type: 'fake-test' }), true);
});

test('Escape: an unclaimed press while focused exits and restores; typing in a field, or nothing focused, does nothing', () => {
  calls.length = 0;
  const restored = [];
  let state = focusReducer(null, { type: 'enter', id: 'a', kind: 'fake-test', saved: { owner: 'store', view: VIEW, selection: ['a'], scroll: [] }, frame: FRAME });
  let shown = syncFocus(null, state, { view: VIEW, find: () => host('a') });
  const press = target => ({ key: 'Escape', defaultPrevented: false, target });
  const field = { tagName: 'TEXTAREA', closest: () => null };
  const button = { tagName: 'BUTTON', closest: () => null };
  assert.equal(shouldExitOnEscape(press(field), { focusing: true }), false, 'the field keeps its Esc');
  assert.equal(shouldExitOnEscape(press(button), { focusing: true, menuOpen: true }), false, 'an open menu closes first');
  assert.equal(shouldExitOnEscape(press(button), { focusing: false }), false, 'not focusing');
  assert.equal(shouldExitOnEscape(press(button), { focusing: true }), true);
  state = focusReducer(state, { type: 'exit' });
  shown = syncFocus(shown, state, { view: VIEW, find: () => host('a'), restore: s => restored.push(s) });
  assert.equal(shown, null);
  assert.deepEqual(restored.map(s => s.selection), [['a']], 'the selection comes back');
  assert.deepEqual(calls, [['enter', 'a', 900, 0.5], ['exit', 'a']]);
});

// WP4 findings (focus-study.md section 7): a CAD card is focusable through the index and keeps its 3D tools in the Focus header,
// its viewer stays selected (Interact works) while focused, a focused card takes its own wheel (Full layout too), and the
// selection pill never comes back over the header.
test('CAD, wheel and pill: the seam keeps a focused card usable', async () => {
  assert.equal(isFocusEligible({ id: 'c1', type: 'cad' }), true, 'focus-adapter-cad.js is imported');
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /viewSelected=\{selection\.includes\(block\.id\) \|\| focus\?\.id === block\.id\}/, 'the focused CAD viewer counts as selected');
  assert.match(canvas, /tools=\{focus\.kind === 'cad' && cadArtifact\([^}]*\) \? <CadViewerTools viewKey=\{focus\.id\}/, 'Interact, Fit view and Show dimensions in the header');
  assert.match(canvas, /event\.target\.closest\?\.\('\[data-focus-host\]'\) \|\| \(event\.target\.closest\?\.\('\[data-scroll\]'\)/, 'a focused card scrolls inside itself');
  assert.match(canvas, /<SelectionActionsProvider [^>]*hidden=\{!!inline \|\| presenting !== null \|\| !!focus\}/, 'no selection pill while focused');
});

// fast-e2e 40083477849: the Focus button made the selected card's row 38 px tall (h-8 in a 28 px row), so on a first-row card
// the row's centre rose under the floating header's buttons (panel-header, focus-adapters step 2), and its visible "Focus" text
// changed what the card reads (dive). And Study's Locate ran before the exit's restore, which then undid its camera.
test('the Focus button keeps the row 34 px and adds no words; exitFocus restores at once', async () => {
  const { readFileSync } = await import('node:fs');
  const bar = readFileSync(new URL('./SelectionActions.jsx', import.meta.url), 'utf8');
  const button = bar.match(/\{ctx\.focusLabel && <button[^]*?<\/button>\}/)?.[0] || '';
  assert.match(button, /className="relative -my-0\.5 flex h-8 w-8 /, '32 px visual, a 28 px margin box like the other actions');
  assert.match(button, /<Maximize size=\{16\} strokeWidth=\{1\.8\} aria-hidden="true" \/>\r?\n\s+<\/button>/, 'icon only: the name is the aria-label');
  const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /exitFocus: \(\) => \{ focusShown\.current = syncFocus\(focusShown\.current, null, \{[^}]*restore: saved => commandsRef\.current\.restoreNavigation\(saved\) \}\); dispatchFocus\(\{ type: 'exit' \}\); \}/);
});

// The pane Focus sizes a card in: the surface less its floating controls (the tool palette) and the open side panel's inset, as
// AdaptiveCanvas focusWorkspace builds it (freeArea over the control rects, right edge less edgeInset, bottom above the dock).
test('the Focus pane leaves room for the toolbar on the left and an open chat panel on the right', async () => {
  const { freeArea } = await import('./canvas-slots.js');
  const surface = { w: 1440, h: 900 }, palette = { left: 8, top: 136, right: 84, bottom: 596 }, chatInset = 400;
  const area = freeArea(surface, [palette], 0);
  const pane = workspaceFrame({ ...area, right: Math.min(area.right, surface.w - chatInset), bottom: Math.min(area.bottom, 900) });
  assert.ok(pane.left >= palette.right, 'clear of the palette');
  assert.ok(pane.left + pane.width <= surface.w - chatInset, 'clear of the chat panel');
  assert.ok(pane.top >= FOCUS_BAR && pane.height > 0);
  const closed = workspaceFrame({ ...area, right: Math.min(area.right, surface.w), bottom: 900 });
  assert.ok(closed.width > pane.width, 'closing the panel gives the content its room back');
});
