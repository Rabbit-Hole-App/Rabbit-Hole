// INT-06 (docs/features/interact.md): the card composition, tested on the pure layout and the existing components rendered with
// react-dom/server, against versioned plan fixtures (no browser, no model call). What a browser must still show (real layout, line counts,
// scrubber seeks) is listed in the hand-back, not claimed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { interactFixtures } from './interact-plan-fixtures.js';
import { compositionFromPlan } from './interact-composition-fixtures.js';
import { COMPOSITION_VERSION, compositionOf, experimentControls, normalizeComposition } from './interact-composition-adapter.js';
import { MAX_SUPPORTS, SECTION_ORDER, cardLayout, focusFixed, focusRoom, layoutProblems, snapshotKey, supportInputs } from './interact-card-layout.js';
import { artifactKey, createSnapshotService, programSnapshot } from './interact-support-snapshots.js';
import { DESCRIPTION_STYLE } from './interact-description-fit.js';
import { FIXTURES } from './explain-program/fixtures.js';
import { SDK_SOURCE } from './explain-program/sdk.js';
import { parseManifest } from './explain-program/contract.js';
import { programDuration } from './explain-program/program-card.js';

const dir = mkdtempSync(join(tmpdir(), 'interact-ui-')), outfile = join(dir, 'ui.cjs');
await esbuild.build({
  stdin: { contents: "export { InteractIntro } from './InteractSupportPanels.jsx'; export { default as Content } from './InteractCardContent.jsx'; export { default as SceneControls, ShowPurposes, ResetButton } from './SceneControls.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'assets', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const { plans } = await interactFixtures();
const comp = name => { const out = normalizeComposition(compositionFromPlan(plans[name])); assert.equal(out.ok, true, JSON.stringify(out.problems)); return out.value; };
const kinds = composition => cardLayout(composition).map(section => section.kind);
// A plan with readouts gets a readouts row directly under its scene (drawn by the card): the expected order with it.
const withReadouts = (name, list) => list.flatMap(kind => (kind === 'scene' && plans[name].scene.readoutIds.length ? ['scene', 'readouts'] : [kind]));

// ---- card section order ------------------------------------------------------------------------------------------------------

// Every composed card ends with the controls row and its Reset (owner 2026-11-12): a plan without a reset control gets the card's own.
const RESET = { kind: 'controls', ids: ['reset'], reset: 'reset' };

test('the card order is Title, description, supporting visuals, scene, readouts, timeline when timed, then the controls row, which always ends with Reset', () => {
  assert.deepEqual([...SECTION_ORDER], ['title', 'description', 'support', 'scene', 'readouts', 'timeline', 'controls']);
  assert.deepEqual(kinds(comp('overview')), withReadouts('overview', ['title', 'description', 'scene', 'controls']), 'Static with no controls: no timeline row; the controls row holds the card\'s Reset alone');
  assert.deepEqual(cardLayout(comp('overview')).at(-1), RESET, 'a plan without a reset control still gets one');
  assert.deepEqual(kinds(comp('standard')), withReadouts('standard', ['title', 'description', 'support', 'scene', 'timeline', 'controls']), 'Standard: Three moments above the animation, the animation touching its timeline, then the Reset row');
  assert.deepEqual(kinds(comp('deep')), withReadouts('deep', ['title', 'description', 'support', 'scene', 'timeline', 'controls']));
  assert.deepEqual(kinds(comp('untimedExperiment')), withReadouts('untimedExperiment', ['title', 'description', 'scene', 'controls']), 'an untimed Experiment: the controls directly below the scene');
  assert.deepEqual(kinds(comp('staticAdjustable')), withReadouts('staticAdjustable', ['title', 'description', 'scene', 'controls']), 'Static with a still-recomputing control keeps its row');
  for (const name of Object.keys(plans)) {
    assert.deepEqual(layoutProblems(cardLayout(comp(name))), [], name);
    const controls = cardLayout(comp(name)).at(-1);
    assert.equal(controls.kind, 'controls', name); assert.equal(controls.ids.at(-1), controls.reset, `${name}: the row ends with Reset`);
  }
});

test('Standard puts the fixed Three moments panel above the live animation, which sits immediately above its timeline', () => {
  const layout = cardLayout(comp('standard'));
  const support = layout.findIndex(s => s.kind === 'support'), scene = layout.findIndex(s => s.kind === 'scene');
  assert.equal(layout[support].id, 'threeMoments');
  assert.ok(support < scene);
  assert.equal(layout[scene + 1].kind, 'readouts', 'the plan has readouts: their row sits directly under the scene');
  assert.equal(layout[scene + 2].kind, 'timeline', 'and the timeline directly under that');
  assert.deepEqual(layout.slice(scene + 3), [RESET], 'nothing after the timeline but the Reset row');
  assert.equal(comp('standard').supports[0].title, 'Three moments around the top');
});

test('the Deep card draws Compare the two peaks, then the animation, its playback, then Launch speed', () => {
  const composition = comp('deep'), layout = cardLayout(composition);
  assert.equal(composition.supports[0].title, 'Compare the two peaks');
  assert.deepEqual(layout.map(s => s.kind), withReadouts('deep', ['title', 'description', 'support', 'scene', 'timeline', 'controls']));
  assert.deepEqual(layout.at(-1).ids, ['speed', 'resetAll'], 'playback and the scrubber are the timeline row; the experiment row holds the rest');
  assert.deepEqual(experimentControls(composition).map(c => c.label), ['Launch speed', 'Reset experiment']);
});

test('no explanatory text can follow a scene or its controls: any other section is refused', () => {
  const ok = cardLayout(comp('deep'));
  for (const kind of ['note', 'caption', 'takeaway', 'footer', 'text']) {
    const problems = layoutProblems([...ok, { kind }]);
    assert.equal(problems[0].code, 'unknown_section', kind);
  }
  const at = (kind, index) => { const copy = [...ok]; copy.splice(index, 0, { kind }); return copy; };
  assert.ok(layoutProblems(at('support', 5)).some(p => p.code === 'order'), 'a supporting visual after the scene');
  assert.ok(layoutProblems(at('support', 4)).some(p => p.code === 'timeline_adjacent' || p.code === 'order'), 'a diagram between the animation and its timeline');
  assert.ok(layoutProblems(ok.filter(s => s.kind !== 'description')).some(p => p.code === 'description_second'));
  assert.ok(layoutProblems([...ok, { kind: 'scene' }]).some(p => p.code === 'exactly_one'));
  assert.ok(layoutProblems([...ok.slice(0, 2), { kind: 'support', id: 'a' }, { kind: 'support', id: 'b' }, { kind: 'support', id: 'c' }, ...ok.slice(3)]).some(p => p.code === 'support_limit'));
  assert.equal(MAX_SUPPORTS, 2);
  // controls straight after the scene when untimed, after the timeline when timed, never after anything else
  assert.ok(layoutProblems([{ kind: 'title' }, { kind: 'description' }, { kind: 'scene' }, RESET]).length === 0);
  assert.ok(layoutProblems([{ kind: 'title' }, { kind: 'description' }, { kind: 'scene' }, RESET, { kind: 'timeline' }]).length > 0);
});

test('the composition has nowhere to keep text for under the scene: only the description is introductory copy', () => {
  for (const name of Object.keys(plans)) {
    const composition = comp(name);
    assert.deepEqual(Object.keys(composition).sort(), ['cardDescription', 'controls', 'depth', 'envelopeHash', 'main', 'mode', 'onInputChange', 'order', 'planHash', 'supporting', 'supports', 'timeline', 'title', 'version']);
    assert.equal(composition.cardDescription, plans[name].cardDescription);
    assert.notEqual(composition.cardDescription, plans[name].story, 'the full Story is not the card body');
    assert.equal(composition.version, COMPOSITION_VERSION);
  }
});

// ---- the adapter -------------------------------------------------------------------------------------------------------------

test('the adapter reads a block\'s composition, treats a card without one as legacy and refuses a broken one', () => {
  const raw = compositionFromPlan(plans.standard);
  assert.equal(compositionOf({ type: 'animation', program: { bundleHash: 'x' } }), null, 'a legacy card has no composition and renders as before');
  assert.equal(compositionOf(null), null);
  assert.equal(compositionOf({ interact: { version: 1, composition: raw } }).title, plans.standard.title);
  for (const bad of [{ ...raw, version: 2 }, { ...raw, main: { ...raw.main, mode: 'steps' } }, { ...raw, main: { ...raw.main, runtime: { renderer: 'html' } } }, { ...raw, cardDescription: '' },
    { ...raw, supporting: [...raw.supporting, ...raw.supporting, ...raw.supporting] }, { ...raw, supporting: [...raw.supporting, ...raw.supporting] },
    { ...raw, main: { ...raw.main, timeline: { ...raw.main.timeline, playbackRate: 0 } } }, { ...raw, main: { ...raw.main, onInputChange: 'whenever' } }]) {
    assert.ok(compositionOf({ interact: { composition: bad } }).problems.length >= 1, JSON.stringify(Object.keys(bad)));
  }
});

// ---- support panels ----------------------------------------------------------------------------------------------------------

test('support inputs are the main state\'s values through the plan\'s bindings, read only; a fixed panel takes none', () => {
  const [panel] = comp('deep').supports;
  assert.deepEqual(supportInputs(panel, { launchSpeed: 4.2, other: 1 }), { trialSpeed: 4.2 });
  assert.deepEqual(supportInputs(panel, {}), {}, 'a missing main input is left out, never invented');
  assert.deepEqual(supportInputs(comp('standard').supports[0], { launchSpeed: 3 }), {}, 'the Standard panel is fixed');
});

test('a snapshot is keyed by artifact and bound inputs, whatever the key order', () => {
  assert.equal(snapshotKey('program:a', { x: 1, y: 2 }), snapshotKey('program:a', { y: 2, x: 1 }));
  assert.notEqual(snapshotKey('program:a', { x: 1 }), snapshotKey('program:a', { x: 2 }));
  assert.notEqual(snapshotKey('program:a', { x: 1 }), snapshotKey('program:b', { x: 1 }));
  assert.equal(artifactKey(comp('deep').supports[0]), 'program:fixture-comparePeaks');
});

const gate = () => { let open; const promise = new Promise(resolve => { open = resolve; }); return { promise, open }; };

test('snapshots run one after another, are cached by key, skip a request whose card is gone and never block the next on a failure', async () => {
  const service = createSnapshotService({ size: 2 });
  const order = [], first = gate();
  const job = (name, wait = Promise.resolve()) => ({ artifact: name, inputs: {}, run: async () => { order.push(`start ${name}`); await wait; order.push(`end ${name}`); return name; } });
  const a = service.request(job('a', first.promise)), b = service.request(job('b'));
  let live = true;
  const gone = service.request({ ...job('c'), live: () => live });
  live = false; // the card unmounted while c waited its turn
  const failing = service.request({ artifact: 'f', inputs: {}, run: async () => { throw new Error('boom'); } });
  const last = service.request(job('d'));
  await Promise.resolve();
  assert.deepEqual(order, ['start a'], 'b waits for a: one snapshot at a time, so one transient host');
  first.open();
  assert.deepEqual(await Promise.all([a, b, gone, last]), ['a', 'b', null, 'd']);
  await assert.rejects(failing, /boom/);
  assert.deepEqual(order, ['start a', 'end a', 'start b', 'end b', 'start d', 'end d'], 'the cancelled request never started; the failure did not block d');
  assert.equal(service.stats().peak, 1, 'never two at once');
  assert.equal(service.stats().active, 0);
  const again = await service.request(job('d'));
  assert.equal(again, 'd');
  assert.equal(order.length, 6, 'a repeat of the same artifact and inputs is a cache hit');
  assert.ok(service.stats().cached <= 2, 'the cache is bounded');
});

const fixture = FIXTURES[0];
const runNative = request => new Function(`${SDK_SOURCE}\n${fixture.source.replace('export function evaluate', 'function evaluate')}\nreturn evaluate;`)()({ inputs: request.inputs, time: request.time, seed: 1, state: null });
const fakeHost = (log, { fail = false } = {}) => () => ({
  initialize: async request => { log.push(['initialize', request]); return { state: { n: 1 } }; },
  evaluate: async (request, options) => { log.push(['evaluate', request, options]); if (fail) throw new Error('worker lost'); return { frame: runNative(request).frame }; },
  dispose: reason => log.push(['dispose', reason]),
});

test('a program snapshot is one frame at time zero for the bound inputs, and its transient host is always released', async () => {
  const manifest = parseManifest(fixture.manifest).value, log = [];
  const view = await programSnapshot({ artifact: { manifest, schemaVersion: 1 }, inputs: fixture.requests[0].inputs, createHost: fakeHost(log) });
  assert.ok(view.scene && view.state.objects.length > 0);
  assert.deepEqual(log.map(entry => entry[0]), ['evaluate', 'dispose'], 'schema 1 has no initialize');
  assert.equal(log[0][1].time, 0);
  assert.equal(log[0][2].supersede, false);
  const stateful = [];
  await programSnapshot({ artifact: { manifest, schemaVersion: 2 }, inputs: fixture.requests[0].inputs, createHost: fakeHost(stateful) });
  assert.deepEqual(stateful.map(entry => entry[0]), ['initialize', 'evaluate', 'dispose']);
  assert.deepEqual(stateful[1][1].state, { n: 1 });
  const failed = [];
  await assert.rejects(programSnapshot({ artifact: { manifest, schemaVersion: 1 }, inputs: fixture.requests[0].inputs, createHost: fakeHost(failed, { fail: true }) }), /worker lost/);
  assert.equal(failed.at(-1)[0], 'dispose', 'released on failure too');
});

// ---- rendering with the existing components ----------------------------------------------------------------------------------

test('the introduction draws the description once, in the measured style, then the supporting panels in order, each with its title', () => {
  const composition = comp('standard');
  const html = B.renderToStaticMarkup(B.createElement(B.InteractIntro, { composition, block: { id: 'card-1' }, mainInputs: {} }));
  assert.equal(html.split('data-card-description').length - 1, 1, 'rendered once');
  assert.ok(html.includes(composition.cardDescription));
  assert.ok(html.includes(`class="${DESCRIPTION_STYLE.className}"`), 'the style interact-description-fit.js measured');
  assert.ok(html.includes(`max-width:${DESCRIPTION_STYLE.focusMeasurePx}px`), 'a bounded column in wide Focus');
  assert.ok(html.indexOf('data-card-description') < html.indexOf('data-interact-support="threeMoments"'), 'description above the supporting panel');
  assert.ok(html.includes('Three moments around the top'));
  assert.doesNotMatch(html, /data-animation-transport|data-scene-controls|type="range"|<button/, 'a supporting panel has no transport, controls or buttons');
  assert.doesNotMatch(html, /Maya tossed the ball/, 'the full Story is not in the card');
  const bare = B.renderToStaticMarkup(B.createElement(B.InteractIntro, { composition: comp('overview'), block: { id: 'card-1' }, mainInputs: {} }));
  assert.doesNotMatch(bare, /data-interact-support/, 'a card with no supporting visual draws no panel and no space for one');
});

test('a composition that does not hold together draws the existing error block, never a partial card', () => {
  const html = B.renderToStaticMarkup(B.createElement(B.Content, { block: { id: 'c', type: 'animation' }, composition: { problems: [{ path: 'mode', message: 'x' }] } }));
  assert.match(html, /data-interact-composition-error/);
  assert.match(html, /This card could not be put together\./);
  assert.doesNotMatch(html, /\.\.\.|…/);
});

test('the experiments\' purpose sentences are suppressed on an /interact card and kept on every other card', () => {
  const props = { declarations: [{ name: 'k', type: 'choice', label: 'Case', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }], inputs: { k: 'a' }, data: {}, onInput: () => {}, experiments: [{ id: 'e', input: 'k', purpose: 'Compare the two cases.' }] };
  const legacy = B.renderToStaticMarkup(B.createElement(B.SceneControls, props));
  assert.match(legacy, /data-experiment-purpose="k"/);
  const composed = B.renderToStaticMarkup(B.createElement(B.ShowPurposes.Provider, { value: false }, B.createElement(B.SceneControls, props)));
  assert.doesNotMatch(composed, /data-experiment-purpose|Compare the two cases/);
  assert.match(composed, /Case:/, 'labels and native controls stay');
});

// ---- Reset: one place, one icon (owner 2026-11-12) -------------------------------------------------------------------------------

test('every composed card draws Reset as the same icon button at the end of its controls row, named Reset experiment, greyed when nothing differs; no text label', () => {
  const html = (inputs, onReset) => B.renderToStaticMarkup(B.createElement(B.ShowPurposes.Provider, { value: false }, B.createElement(B.SceneControls, { declarations: inputs, inputs: { k: 'a' }, data: {}, onInput: () => {}, onReset })));
  const choice = [{ name: 'k', type: 'choice', label: 'Case', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }];
  const button = B.renderToStaticMarkup(B.createElement(B.ResetButton, { onReset: () => {} }));
  assert.match(button, /^<button type="button" data-scene-reset="true" aria-label="Reset experiment" title="Reset experiment"/);
  assert.match(button, /<svg[^>]*lucide-rotate-ccw/, 'the app\'s refresh icon (RotateCcw, as in LearningBlocks.jsx)');
  assert.ok(!/>Reset experiment<|\.\.\.|…/.test(button), 'an icon, no visible text, no ellipsis');
  assert.match(button, /ml-auto/, 'right-aligned');
  for (const [name, declarations, changed] of [['with controls, changed', choice, true], ['with controls, unchanged', choice, false], ['no controls, unchanged', [], false]]) {
    const out = html(declarations, changed ? () => {} : null);
    assert.equal((out.match(/data-scene-reset/g) || []).length, 1, `${name}: exactly one Reset`);
    assert.equal(out.includes(' disabled=""'), !changed, `${name}: ${changed ? 'enabled' : 'greyed, still in its place'}`);
    assert.equal(out.lastIndexOf('data-scene-reset') > out.lastIndexOf('data-input-control') || !out.includes('data-input-control'), true, `${name}: after every control`);
  }
  // Any other card: Reset only while a value differs, and the same icon.
  const legacy = B.renderToStaticMarkup(B.createElement(B.SceneControls, { declarations: choice, inputs: { k: 'a' }, data: {}, onInput: () => {}, onReset: null }));
  assert.ok(!legacy.includes('data-scene-reset'));
  assert.match(B.renderToStaticMarkup(B.createElement(B.SceneControls, { declarations: choice, inputs: { k: 'a' }, data: {}, onInput: () => {}, onReset: () => {} })), /data-scene-reset="true"[^>]*aria-label="Reset experiment"/);
});

test('the program card draws the same Reset through the one ResetButton: on a composed card ONLY as the icon at the right of its heading row above the scene (always, greyed while unchanged), on another card at the end of its controls row while changed; no Interact label on a composed card (owner scope cut 2026-11-13 codex match)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./explain-program/ProgramScene.jsx', import.meta.url), 'utf8');
  assert.equal((src.match(/<ResetButton /g) || []).length, 2, 'two draws of the one component: the heading row and the legacy row');
  assert.match(src, /<div data-interact-heading [^>]*><ResetButton onReset=\{reset\} disabled=\{!changed\} \/><\/div>/, 'the heading row holds Reset at the right and repeats no title (the block header has it)');
  assert.doesNotMatch(src.slice(src.indexOf('data-interact-heading'), src.indexOf('<div data-program-viewport')), /composition\.title/, 'no repeated title text');
  assert.ok(src.indexOf('<div data-interact-heading') < src.indexOf('<div data-program-viewport'), 'the heading row is above the scene');
  assert.doesNotMatch(src, /corner|absolute top-3|Wrap/, 'the overlay path is gone');
  assert.match(src, /\{!composed && changed && <ResetButton onReset=\{reset\} \/>\}/, 'a composed card has no Reset in its controls row');
  assert.match(src, /composed \? rows\.length > 0 \|\| seeks\.length > 0 \|\| actions\.length > 0 \|\| targets\.length > 0 :/, 'a composed card with only Reset draws no controls block');
  assert.match(src, /\{!composed && <p className="mb-1\.5[^"]*">Interact<\/p>\}/, 'the Interact label stays on the legacy card only');
  assert.doesNotMatch(src, />Reset experiment<\/button>/, 'no text button any more');
});

// ---- time and focus ----------------------------------------------------------------------------------------------------------

test('the end-of-timeline helper reads the composition the card holds: its endpoint, never longer than the admitted manifest.duration', () => {
  const manifest = parseManifest(fixture.manifest).value;
  assert.equal(programDuration(manifest, comp('standard'), {}), Math.min(6 / 9.8, manifest.duration ?? Infinity), 'the Standard endpoint is 6/9.8 s from the composition');
  assert.equal(programDuration(manifest, comp('overview'), {}), manifest.duration ?? 0, 'an untimed composition leaves the manifest as it is');
  assert.equal(programDuration(manifest), manifest.duration ?? 0, 'no composition: the legacy behaviour');
});

test('Focus counts the description and supporting panels live: the drawing gets the pane minus every row the card draws', () => {
  const first = { cardW: 900, cardH: 800, viewportW: 860, viewportH: 600, rowsH: 80, introH: 60 };
  const fixed = focusFixed(first);
  assert.deepEqual(fixed, { w: 40, h: 60 });
  // measured once with no panel yet; the panels then load and add 220 px: the room shrinks by exactly that, the fixed part is untouched
  const withPanels = focusRoom({ cardW: 900, cardH: 800, fixed, rowsH: 80, introH: 280 });
  assert.equal(withPanels.h, 800 - 60 - 80 - 280);
  assert.equal(withPanels.w, 860);
  // the legacy card (no intro) gets the numbers it always did
  const legacyFixed = focusFixed({ cardW: 900, cardH: 800, viewportW: 860, viewportH: 600, rowsH: 80 });
  assert.deepEqual(focusRoom({ cardW: 900, cardH: 800, fixed: legacyFixed, rowsH: 80 }), { w: 860, h: 800 - (800 - 600 - 80) - 80 });
  assert.equal(focusRoom({ cardW: 100, cardH: 100, fixed: { w: 300, h: 300 }, rowsH: 50, introH: 50 }).h, 0, 'never negative');
});

test('the readouts row: one section after the scene when the plan has readouts, absent otherwise; a readouts row may not be moved away from the scene', async () => {
  const { layoutProblems } = await import('./interact-card-layout.js');
  assert.ok(kinds(comp('standard')).includes('readouts')); assert.equal(plans.standard.scene.readoutIds.length > 0, true);
  const ok = ['title', 'description', 'scene', 'readouts', 'timeline', 'controls'].map(kind => (kind === 'controls' ? RESET : { kind }));
  assert.deepEqual(layoutProblems(ok), []);
  assert.ok(layoutProblems(['title', 'description', 'scene', 'timeline', 'readouts', 'controls'].map(kind => (kind === 'controls' ? RESET : { kind }))).some(p => p.code === 'order' || p.code === 'readouts_adjacent'), 'readouts after the timeline is refused');
  assert.ok(layoutProblems(['title', 'description', 'scene', 'controls', 'readouts'].map(kind => (kind === 'controls' ? RESET : { kind }))).length > 0);
  assert.deepEqual(layoutProblems([{ kind: 'title' }, { kind: 'description' }, { kind: 'scene' }]).map(p => p.code), ['exactly_one'], 'a card without its controls row is refused');
  assert.deepEqual(layoutProblems([{ kind: 'title' }, { kind: 'description' }, { kind: 'scene' }, { kind: 'controls', ids: ['reset', 'speed'], reset: 'reset' }]).map(p => p.code), ['reset_last'], 'Reset must be last');
});

test('the card draws the readouts row itself: label, value and unit as tabular numbers at 14 px, filtered to the plan readouts, only for a composed card', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./explain-program/ProgramScene.jsx', import.meta.url), 'utf8');
  assert.match(src, /composed && readoutRows\.length > 0/);
  assert.match(src, /data-interact-readouts className="flex flex-wrap items-baseline gap-x-4 gap-y-0\.5 text-sm text-ink-2"/);
  assert.match(src, /data-interact-readout=\{value\.id\}>\{value\.label\}: <span className="text-ink tabular-nums">\{value\.text\}<\/span>/);
  assert.match(src, /composition\.main\.readoutIds\.includes\(r\.id\)/);
});
