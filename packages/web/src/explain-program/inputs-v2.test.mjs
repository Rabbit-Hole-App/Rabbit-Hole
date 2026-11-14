// inputs_v2 (INTERACT_INPUTS_V2): native boolean and index inputs for programs. A manifest capability, not an SDK helper: the sdk tuple and the renderer stamp are the same, a manifest without
// either input type parses and resolves exactly as before, and the catalogue offers the controls only when the capability is enabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { CAPABILITIES, INPUTS_V2_CAPABILITY, KNOWN_CAPABILITIES, unsupportedCapabilities, ProgramManifest, EvaluateRequest, parseEvent, parseManifest, resolveInputs, sealProgram } from './contract.js';
import { VISUAL_PROGRAM_STAMPS } from './stamps.js';
import { inputChange, describeProgram, programInputWidget } from './program-card.js';
import { getInteractControlCatalogue, interactCapabilities, INPUT_TYPES_PROMPT_SENTENCE } from '../interact-control-catalogue.js';
import { compileCardComposition, validateCompositionBindings, controlDeclarations } from '../interact-composition.js';
import { planProblems, validatePlanBindings } from '../interact-plan.js';
import { FIXTURE_DRAFTS, sealEnvelope } from '../interact-build-fixtures.js';
import { interactFixtures } from '../interact-plan-fixtures.js';

const base = { title: 'T', summary: 'S', assumptions: [], description: 'D', readouts: [], inputs: [], capabilities: [INPUTS_V2_CAPABILITY] };
const boolInput = { type: 'boolean', id: 'guides', label: 'Show guides', default: true };
const indexInput = { type: 'index', id: 'mode', label: 'Mode', default: 1, presentation: 'picker', items: [{ id: 'low', label: 'Low' }, { id: 'mid', label: 'Middle' }, { id: 'high', label: 'High' }] };
const manifestOf = (...inputs) => ({ ...base, inputs });

test('a boolean and an index input parse; they need the inputs_v2 capability, a default that is a position, 2 to 12 items and unique item ids', () => {
  assert.ok(KNOWN_CAPABILITIES.includes(INPUTS_V2_CAPABILITY));
  assert.ok(!CAPABILITIES.includes(INPUTS_V2_CAPABILITY), 'the list /explain advertises to its author and repairer is unchanged (its repair request has 14 bytes of room)');
  assert.deepEqual(unsupportedCapabilities({ capabilities: [INPUTS_V2_CAPABILITY, 'nope'] }), ['nope']);
  const parsed = ProgramManifest.safeParse(manifestOf(boolInput, { ...indexInput, presentation: undefined }));
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  assert.equal(parsed.data.inputs[1].presentation, 'picker', 'the presentation defaults to the picker');
  assert.equal(ProgramManifest.safeParse({ ...manifestOf(boolInput), capabilities: [] }).success, false, 'a boolean input without the capability is refused');
  assert.equal(ProgramManifest.safeParse({ ...manifestOf(indexInput), capabilities: ['number_inputs'] }).success, false, 'an index input without the capability is refused');
  assert.equal(ProgramManifest.safeParse(manifestOf({ ...indexInput, default: 3 })).success, false, 'default past the last item');
  assert.equal(ProgramManifest.safeParse(manifestOf({ ...indexInput, items: [{ id: 'only', label: 'One' }], default: 0 })).success, false, 'fewer than 2 items');
  assert.equal(ProgramManifest.safeParse(manifestOf({ ...indexInput, items: Array.from({ length: 13 }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` })) })).success, false, 'more than 12 items');
  assert.equal(ProgramManifest.safeParse(manifestOf({ ...indexInput, items: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], default: 0 })).success, false, 'duplicate item ids');
  assert.equal(ProgramManifest.safeParse(manifestOf({ ...boolInput, default: 'yes' })).success, false, 'a boolean default is a boolean');
});

test('resolveInputs keeps a boolean and an index value, and replaces a wrong one with the default; number and select behave as before', () => {
  const manifest = ProgramManifest.parse({ ...manifestOf(boolInput, indexInput, { type: 'number', id: 'n', label: 'N', default: 1, min: 0, max: 2 }) });
  assert.deepEqual(resolveInputs(manifest, {}), { guides: true, mode: 1, n: 1 });
  assert.deepEqual(resolveInputs(manifest, { guides: false, mode: 2, n: 9 }), { guides: false, mode: 2, n: 2 });
  assert.deepEqual(resolveInputs(manifest, { guides: 'false', mode: 3 }), { guides: true, mode: 1, n: 1 }, 'not a boolean, not a position');
  assert.deepEqual(resolveInputs(manifest, { mode: 1.5 }).mode, 1, 'an index is an integer');
  assert.deepEqual(resolveInputs(manifest, { mode: -1 }).mode, 1);
});

test('EvaluateRequest.inputs accepts a boolean; a manifest of number and select inputs is exactly what it was', () => {
  const request = { requestId: '1', inputs: { guides: false, mode: 2 }, time: 0, seed: 0, state: null };
  assert.equal(EvaluateRequest.safeParse(request).success, true);
  assert.equal(EvaluateRequest.safeParse({ ...request, inputs: { guides: { nested: true } } }).success, false);
  const old = ProgramManifest.parse({ ...base, capabilities: ['number_inputs'], inputs: [{ type: 'number', id: 'n', label: 'N', default: 1, min: 0, max: 2 }, { type: 'select', id: 's', label: 'S', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }] });
  assert.deepEqual(resolveInputs(old, { n: 5, s: 'c' }), { n: 2, s: 'a' });
});

test('an input event carries a boolean or an item position, and only a declared one', () => {
  const manifest = { ...ProgramManifest.parse(manifestOf(boolInput, indexInput)), actions: [], targets: [] };
  const ok = (input, value) => parseEvent({ type: 'input', input, value }, manifest).ok;
  assert.equal(ok('guides', false), true);
  assert.equal(ok('guides', 'off'), false);
  assert.equal(ok('mode', 2), true);
  assert.equal(ok('mode', 3), false, 'past the last item');
  assert.equal(ok('mode', 0.5), false);
  assert.equal(ok('other', true), false, 'undeclared');
});

test('sdk tuple and renderer stamp are unchanged: a sealed sdk-2 program with the capability keeps the saved stamps', async () => {
  const sealed = await sealProgram({ manifest: manifestOf(boolInput, indexInput), source: 'export function evaluate({ inputs }) { return { frame: sdk.frame([sdk.text("t", 10, 10, inputs.guides ? "on" : "off")], { width: 200, height: 100 }), quantities: {} }; }' }, VISUAL_PROGRAM_STAMPS);
  assert.equal(sealed.ok, true, sealed.issue);
  assert.equal(sealed.value.sdkVersion, 'sdk-2'); assert.equal(sealed.value.rendererVersion, 'renderer-1');
  assert.deepEqual(sealed.value.fingerprints, VISUAL_PROGRAM_STAMPS.fingerprints);
});

test('the card describes a boolean as On or Off and an index as its item label', () => {
  const manifest = ProgramManifest.parse(manifestOf(boolInput, indexInput));
  const { text } = describeProgram({ title: 'Card', inputs: { guides: false, mode: 2 } }, manifest);
  assert.match(text, /Show guides: Off/); assert.match(text, /Mode: High/);
});

// ---- the catalogue and the plan ----------------------------------------------------------------------------------------------

test('the catalogue offers program.boolean and the index picker and slider only when inputs_v2 is on; the default catalogue is unchanged', async () => {
  const off = getInteractControlCatalogue({ renderers: ['program'] });
  assert.ok(!off.some(d => ['program.boolean', 'program.index_picker', 'program.index_slider'].includes(d.id)));
  assert.equal((await interactCapabilities({ renderers: ['program'], inputsV2: false })).catalogueHash, (await interactCapabilities({ renderers: ['program'] })).catalogueHash, 'off is the same hash as before');
  const on = getInteractControlCatalogue({ renderers: ['program'], inputsV2: true });
  const added = on.filter(d => !off.some(o => o.id === d.id));
  assert.deepEqual(added.map(d => [d.id, d.semanticType, d.presentation, d.requires]), [
    ['program.boolean', 'boolean', 'switch', [INPUTS_V2_CAPABILITY]], ['program.index_picker', 'index', 'picker', [INPUTS_V2_CAPABILITY]], ['program.index_slider', 'index', 'slider', [INPUTS_V2_CAPABILITY]]]);
  assert.deepEqual(on.filter(d => off.some(o => o.id === d.id)), off, 'every existing entry is byte for byte what it was');
  assert.ok(!getInteractControlCatalogue({ renderers: ['spec'], inputsV2: true, componentControls: ['bool'] }).some(d => d.id.startsWith('program.')), 'a spec-only catalogue gains nothing');
  assert.match(INPUT_TYPES_PROMPT_SENTENCE, /boolean.*index.*inputs_v2/);
});

const { plans } = await interactFixtures();
const affects = [{ scope: 'main', kind: 'readout', id: 'periodReadout' }];
const controlBase = { purpose: 'See the guides.', selectionReason: 'Two states, so a switch.', affects };
// The pendulum fixture (a program Experiment, length as a number) with a Show guides switch and a Mode picker added.
const planWithV2 = () => {
  const plan = structuredClone(plans.pendulum);
  plan.scene.runtime.requiredCapabilities = [INPUTS_V2_CAPABILITY];
  plan.controls.splice(1, 0,
    { ...controlBase, id: 'guides', label: 'Show guides', type: 'boolean', nativeControlId: 'program.boolean', binding: { kind: 'input', id: 'guides' }, default: true },
    { ...controlBase, id: 'mode', label: 'Mode', type: 'index', nativeControlId: 'program.index_picker', presentation: 'picker', dataRef: 'modes', binding: { kind: 'input', id: 'mode' }, default: 1, items: [{ id: 'low', label: 'Low' }, { id: 'mid', label: 'Middle' }, { id: 'high', label: 'High' }] });
  plan.mode.adjustableIds = ['length', 'guides', 'mode'];
  return plan;
};
const draftWithV2 = () => {
  const draft = structuredClone(FIXTURE_DRAFTS.pendulum), manifest = draft.main.program.manifest;
  manifest.capabilities = [INPUTS_V2_CAPABILITY];
  manifest.inputs.push(structuredClone(boolInput), structuredClone(indexInput));
  return draft;
};

test('a plan with a boolean and an index control passes the plan checks when inputs_v2 is enabled, and names what is missing when it is not', async () => {
  const plan = planWithV2();
  assert.deepEqual(planProblems(plan), [], 'the plan itself');
  const enabled = await interactCapabilities({ renderers: ['program'], inputsV2: true, evidenceIds: [] });
  const withHash = structuredClone(plan); withHash.scene.runtime.catalogueHash = enabled.catalogueHash;
  assert.deepEqual(validatePlanBindings(withHash, enabled), [], 'the catalogue offers the controls');
  const disabled = await interactCapabilities({ renderers: ['program'], evidenceIds: [] });
  assert.ok(validatePlanBindings(withHash, disabled).some(p => p.code === 'unsupported_control' || p.code === 'unknown_native_control'), 'off: the controls are not offered');
  const undeclared = structuredClone(withHash); undeclared.scene.runtime.requiredCapabilities = [];
  assert.ok(validatePlanBindings(undeclared, enabled).some(p => p.code === 'capability_missing'), 'the runtime must list inputs_v2');
});

test('a plan with a boolean and an index control compiles and passes validateCompositionBindings; each declaration is the plan', async () => {
  const plan = planWithV2();
  const { declarations, problems } = controlDeclarations(plan);
  assert.deepEqual(problems, []);
  assert.deepEqual(declarations.find(d => d.controlId === 'guides').declaration, { type: 'boolean', id: 'guides', label: 'Show guides', default: true });
  assert.deepEqual(declarations.find(d => d.controlId === 'mode').declaration, { type: 'index', id: 'mode', label: 'Mode', default: 1, presentation: 'picker', items: indexInput.items });
  const artifacts = await sealEnvelope(draftWithV2());
  assert.deepEqual(validateCompositionBindings(plan, artifacts), []);
  const composition = await compileCardComposition(plan, artifacts);
  assert.deepEqual(composition.main.inputDefaults, { length: 0.5, guides: true, mode: 1 });
  assert.deepEqual(composition.main.controls.filter(c => c.native.in === 'manifest.inputs').map(c => c.type), ['number', 'boolean', 'index']);
});

test('a boolean or index the program declares differently, or without the capability, is refused', async () => {
  const plan = planWithV2();
  const refused = async edit => { const draft = draftWithV2(); edit(draft.main.program.manifest); return validateCompositionBindings(plan, await sealEnvelope(draft)); };
  assert.ok((await refused(m => { m.inputs[1].default = false; })).some(p => p.code === 'control_mismatch'), 'a changed boolean default');
  assert.ok((await refused(m => { m.inputs[2].items.reverse(); })).some(p => p.code === 'control_mismatch'), 'changed items');
  assert.ok((await refused(m => { m.inputs[2].presentation = 'slider'; })).some(p => p.code === 'control_mismatch'), 'a changed presentation');
  assert.ok((await refused(m => { m.inputs.pop(); })).some(p => p.code === 'control_missing'), 'a missing index');
  const noCapability = draftWithV2(); noCapability.main.program.manifest.capabilities = [];
  await assert.rejects(() => sealEnvelope(noCapability), /refused|capabilit/, 'such a program cannot even be sealed');
});

// ---- the card: BoolToggle and IndexPicker/IndexSlider from a manifest, and the input events they send --------------------------------

const dir = mkdtempSync(join(tmpdir(), 'inputs-v2-')), outfile = join(dir, 'ui.cjs');
await esbuild.build({
  stdin: { contents: "export { InputWidget } from '../SceneControls.jsx';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'assets', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
const UI = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// Expand an element tree (function components called with their props) to its host elements, so a click handler can be found and called without a browser.
const expand = node => {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!node || typeof node !== 'object' || !node.type) return [];
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return [node, ...expand(node.props?.children)];
};
const widgetOf = (input, value, onInput) => expand(UI.InputWidget({ ...programInputWidget(input), value, onInput }));

test('a composed card draws a boolean as a switch and an index as chips (or a slider) from the manifest, and each press sends its input event', () => {
  const manifest = ProgramManifest.parse(manifestOf(boolInput, indexInput, { ...indexInput, id: 'many', label: 'Many', presentation: 'slider' }));
  const [guides, mode, many] = manifest.inputs, sent = [];
  const onInput = (name, value) => sent.push([name, value]);

  const toggle = widgetOf(guides, true, onInput).find(e => e.props.role === 'switch');
  assert.equal(toggle.props['aria-checked'], true); assert.equal(toggle.props['data-input-control'], 'guides');
  toggle.props.onClick();
  assert.deepEqual(sent.at(-1), ['guides', false], 'pressing the switch sends the opposite boolean');

  const chips = widgetOf(mode, 1, onInput).filter(e => e.props['data-input-value'] !== undefined);
  assert.deepEqual(chips.map(e => e.props.children), ['Low', 'Middle', 'High']);
  assert.deepEqual(chips.map(e => e.props['aria-pressed']), [false, true, false]);
  chips[2].props.onClick();
  assert.deepEqual(sent.at(-1), ['mode', 2], 'a chip sends its position');

  const slider = widgetOf(many, 0, onInput).find(e => e.props.type === 'range');
  assert.equal(slider.props.max, 2); assert.equal(slider.props['data-input-control'], 'many');
  slider.props.onChange({ target: { value: '2' } });
  assert.deepEqual(sent.at(-1), ['many', 2]);
});

test('the input events reach the card state: inputChange saves the boolean and the position, and a wrong value changes nothing', () => {
  const manifest = ProgramManifest.parse(manifestOf(boolInput, indexInput));
  const block = { title: 'Card', inputs: {} };
  const off = inputChange(block, manifest, 'guides', false);
  assert.deepEqual(off.block.inputs, { guides: false, mode: 1 }); assert.equal(off.playing, false);
  const high = inputChange(off.block, manifest, 'mode', 2);
  assert.deepEqual(high.block.inputs, { guides: false, mode: 2 });
  assert.equal(inputChange(high.block, manifest, 'mode', 9).block.inputs.mode, 1, 'past the last item resolves to the default, as a select value that is not an option does');
  assert.equal(inputChange(high.block, manifest, 'mode', 2), null, 'the same value: nothing to save');
});
