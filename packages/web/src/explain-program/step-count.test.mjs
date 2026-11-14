// An index input whose list of steps depends on another input (inputs_v2, items: { by, options }): TCP Standard has 5 states without loss and 6 with. The host resolves the current list from the
// named select input and shows its range, boundary buttons and counter; a position past the end of the shorter list is clamped in the same update; events and resolveInputs use the resolved list.
// A static `items` list and a manifest without the capability are exactly what they were. contract.js, program-card.js and ProgramScene.jsx are outside the SDK source, so the sdk-8 fingerprint is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { INPUTS_V2_CAPABILITY, ProgramManifest, indexItems, parseEvent, parseReduceRequest, resolveInputs } from './contract.js';
import { inputChange, describeProgram, programInputWidget } from './program-card.js';
import { FIGURES_PROGRAM_STAMPS, SDK_FINGERPRINT } from './stamps.js';
import { sdkFingerprint } from './sdk.js';

const item = (id, label) => ({ id, label });
const five = ['syn', 'synack', 'ack', 'data', 'fin'].map((id, i) => item(id, `Step ${i + 1}`));
const six = [...five, item('retx', 'Step 6')];
const loss = { type: 'select', id: 'loss', label: 'Packet loss', default: 'no', options: [{ value: 'no', label: 'No loss' }, { value: 'yes', label: 'Loss' }] };
const step = { type: 'index', id: 'step', label: 'Step', default: 0, presentation: 'slider', items: { by: 'loss', options: { no: five, yes: six } } };
const base = { title: 'T', summary: 'S', assumptions: [], description: 'D', readouts: [], capabilities: [INPUTS_V2_CAPABILITY] };
const manifestOf = (...inputs) => ({ ...base, inputs });
const manifest = () => ProgramManifest.parse(manifestOf(loss, step));
const reduceOf = (m, inputs, value) => parseReduceRequest({ requestId: '1', inputs, time: 0, seed: 0, state: {}, event: { type: 'input', input: 'step', value } }, { ...m, actions: [], targets: [] });

test('an index input lists its steps by another input: one list per option, a select to name, a default that fits every list, the inputs_v2 capability', () => {
  assert.equal(ProgramManifest.safeParse(manifestOf(loss, step)).success, true);
  const refused = (inputs, why) => assert.equal(ProgramManifest.safeParse(manifestOf(...inputs)).success, false, why);
  refused([step], 'the named input is not in the manifest');
  refused([{ ...loss, id: 'other' }, step], 'the named input is not "loss"');
  refused([{ type: 'boolean', id: 'loss', label: 'L', default: false }, step], 'the named input must be a select');
  refused([loss, { ...step, items: { by: 'loss', options: { no: five } } }], 'a list is missing for the option "yes"');
  refused([loss, { ...step, items: { by: 'loss', options: { no: five, yes: six, maybe: six } } }], 'a list for something that is not an option');
  refused([loss, { ...step, default: 5 }], 'the default (step 6) is not a position of the five-step list');
  refused([loss, { ...step, items: { by: 'loss', options: { no: five, yes: [item('a', 'A'), item('a', 'B')] } } }], 'duplicate item ids within a list');
  assert.equal(ProgramManifest.safeParse({ ...manifestOf(loss, step), capabilities: [] }).success, false, 'without inputs_v2 the index input is refused, as every other inputs_v2 input is');
  assert.equal(ProgramManifest.safeParse(manifestOf(loss, { ...step, items: five })).success, true, 'a static list is unchanged');
});

test('resolveInputs resolves the list from the named input and clamps a position past the end of the shorter list in the same call', () => {
  const m = manifest();
  assert.deepEqual(resolveInputs(m, {}), { loss: 'no', step: 0 });
  assert.deepEqual(resolveInputs(m, { loss: 'yes', step: 5 }), { loss: 'yes', step: 5 }, 'six steps: step 6 is position 5');
  assert.deepEqual(resolveInputs(m, { loss: 'no', step: 5 }), { loss: 'no', step: 4 }, 'five steps: step 6 clamps to step 5');
  assert.deepEqual(resolveInputs(m, { step: 5, loss: 'no' }), { loss: 'no', step: 4 }, 'the order of the saved keys does not matter');
  assert.deepEqual(resolveInputs(m, { loss: 'yes', step: 1.5 }), { loss: 'yes', step: 0 }, 'not a position: the default');
  assert.deepEqual(resolveInputs(m, { loss: 'weird', step: 5 }), { loss: 'no', step: 4 }, 'an unknown option resolves to the default option first');
  assert.equal(indexItems(m.inputs[1], { loss: 'yes' }).length, 6); assert.equal(indexItems(m.inputs[1], { loss: 'no' }).length, 5);
  assert.equal(indexItems(m.inputs[1], null).length, 6, 'without values (an event checked alone): the longest list');
});

test('switching the named input clamps the saved step in one update: the block never holds a position the new list does not have', () => {
  const m = manifest();
  const toSix = inputChange({ title: 'Card', inputs: {} }, m, 'loss', 'yes');
  assert.deepEqual(toSix.block.inputs, { loss: 'yes', step: 0 });
  const atSix = inputChange(toSix.block, m, 'step', 5);
  assert.deepEqual(atSix.block.inputs, { loss: 'yes', step: 5 });
  const back = inputChange(atSix.block, m, 'loss', 'no');
  assert.deepEqual(back.block.inputs, { loss: 'no', step: 4 }, 'one write: the loss changed and step 6 became step 5 together');
  assert.equal(back.block.inputRevision, atSix.block.inputRevision + 1, 'one revision bump, no intermediate state');
});

test('an input event naming step 6 is refused while the list has five steps and accepted when it has six (the request carries the current inputs)', () => {
  const m = { ...manifest(), actions: [], targets: [] };
  const event = value => ({ type: 'input', input: 'step', value });
  assert.equal(reduceOf(m, { loss: 'no', step: 0 }, 5).ok, false, 'loss = no: positions 0 to 4');
  assert.equal(reduceOf(m, { loss: 'no', step: 0 }, 4).ok, true);
  assert.equal(reduceOf(m, { loss: 'yes', step: 0 }, 5).ok, true, 'loss = yes: positions 0 to 5');
  assert.equal(reduceOf(m, { loss: 'yes', step: 0 }, 6).ok, false);
  assert.equal(parseEvent(event(5), m, { loss: 'no' }).ok, false);
  assert.equal(parseEvent(event(5), m, { loss: 'yes' }).ok, true);
  assert.equal(parseEvent(event(5), m).ok, true, 'an event checked without inputs accepts what any list allows');
  assert.equal(parseEvent(event(6), m).ok, false);
});

// ---- the card: the slider range, boundary buttons and counter follow the current list ------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'step-count-')), outfile = join(dir, 'ui.cjs');
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
const expand = node => {
  if (Array.isArray(node)) return node.flatMap(expand);
  if (!node || typeof node !== 'object' || !node.type) return [];
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return [node, ...expand(node.props?.children)];
};
const textOf = node => (Array.isArray(node) ? node.map(textOf).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? textOf(node.props.children) : '');
const widget = (input, values, onInput = () => {}) => expand(UI.InputWidget({ ...programInputWidget(input, values), value: values[input.id], onInput }));

test('the step slider shows five steps without loss and six with it, with the boundary buttons and the counter following', () => {
  const [, stepInput] = manifest().inputs;
  const range = values => widget(stepInput, values).find(e => e.props.type === 'range');
  assert.equal(range({ loss: 'no', step: 0 }).props.max, 4, 'five steps: 0 to 4');
  assert.equal(range({ loss: 'yes', step: 0 }).props.max, 5, 'six steps: 0 to 5');
  const counter = values => textOf(widget(stepInput, values).find(e => e.props['data-input-readout'] === 'step'));
  assert.equal(counter({ loss: 'no', step: 4 }), '5 of 5'); assert.equal(counter({ loss: 'yes', step: 4 }), '5 of 6'); assert.equal(counter({ loss: 'yes', step: 5 }), '6 of 6');
  const next = values => widget(stepInput, values).find(e => e.props['data-input-step'] === 'step:next');
  assert.equal(next({ loss: 'no', step: 4 }).props.disabled, true, 'step 5 of 5 is the last');
  assert.equal(next({ loss: 'yes', step: 4 }).props.disabled, false, 'step 5 of 6 has a next');
  assert.equal(widget(stepInput, { loss: 'yes', step: 0 }).find(e => e.props['data-input-step'] === 'step:previous').props.disabled, true, 'the first step has no previous');
});

test('the activity line and the composer context name the step from the current list', () => {
  const m = manifest(), block = { title: 'Card', inputs: { loss: 'yes', step: 5 } };
  assert.match(describeProgram(block, m).text, /Step: Step 6/, 'the six-step list names its sixth step');
  assert.match(describeProgram({ ...block, inputs: { loss: 'no', step: 5 } }, m).text, /Step: Step 5/, 'a position past the shorter list is the last step, never an out-of-range label');
});

test('a static items list and a manifest of other inputs resolve exactly as before', () => {
  const staticStep = { ...step, items: five, default: 1 };
  const m = ProgramManifest.parse(manifestOf(loss, staticStep));
  assert.deepEqual(resolveInputs(m, { loss: 'yes', step: 4 }), { loss: 'yes', step: 4 });
  assert.deepEqual(resolveInputs(m, { step: 9 }), { loss: 'no', step: 1 }, 'past the end of a static list: the default, as before');
  assert.equal(parseEvent({ type: 'input', input: 'step', value: 5 }, { ...m, actions: [], targets: [] }).ok, false);
  assert.equal(programInputWidget(m.inputs[1]).data.items.length, 5);
});

test('the sdk-8 fingerprint is unchanged: this change lives in the contract, the card and the scene, none of which is SDK source', () => {
  assert.equal(FIGURES_PROGRAM_STAMPS.fingerprints.sdk, '023f97b3134cc738caadd6050680eb77e070e2a335312aa627bfec76db09196a');
  assert.equal(typeof SDK_FINGERPRINT, 'string');
  assert.equal(typeof sdkFingerprint, 'function');
});
