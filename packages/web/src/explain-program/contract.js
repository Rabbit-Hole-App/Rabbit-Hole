import { z } from 'zod';
import { fitFrame } from './frame-fit.js';
import { RASTER_LIMITS, rasterProblem } from '../raster-pixels.js';
import { ROLES } from '../scene-vocab.js';
import { IMAGE_FIXTURE_IDS } from './sdk-image.js';
import { parseTutorDiagram } from '../tutor-diagrams/spec.js';
import { CYCLIC_CAPABILITY, CYCLIC_SDK_VERSION, FIGURES_CAPABILITY, FIGURES_SDK_VERSION, HEAT_GRID_SDK_VERSION, MEDIUM_CAPABILITY, MEDIUM_SDK_VERSION, PROPS_CAPABILITY, PROPS_SDK_VERSION, RASTER_CAPABILITY, RASTER_SDK_VERSION } from './stamps.js';

// The frozen artifact and frame contract of the generic /explain sandbox (plan section 5.2, Task 2).
// Subject-independent on purpose: nothing here names a topic. Every object is strict, every value bounded; the host
// (A), the author schemas (C) and the card (B) all build on these shapes. Pure: no React, no DOM, no runtime import.

export const PROGRAM_KIND = 'explain_program';
export const SCHEMA_VERSION = 1;
// Schema 2 is the stateful contract (initialState/reduce/evaluate, declared actions/targets, one viewport). Only artifacts that need state
// use it; schema 1 artifacts parse, hash and run exactly as before. host.js runs a version only if stamps.js lists its whole tuple.
export const STATEFUL_SCHEMA_VERSION = 2;
// Versions the card side owns. runtimeVersion (the pinned interpreter build) is stamped by whoever seals the artifact.
export const PROGRAM_VERSIONS = Object.freeze({
  schemaVersion: SCHEMA_VERSION, sdkVersion: 'sdk-1', rendererVersion: 'renderer-1', runtimePolicyVersion: 'policy-1', permissionProfileVersion: 'perm-1',
});

// ponytail: objects is 60 because the existing scene gate allows 60 on screen without a pager (animation-scene.js); the plan's 240 total
// (objectsTotal) needs parts, which arrive with Task 8.
// Starting limits from plan section 5.3. limits.js (runtime owner) is the runtime policy file; these are the contract-level
// bounds a Frame or artifact must satisfy before anything renders, so they live with the schemas that enforce them.
export const CONTRACT_LIMITS = Object.freeze({
  sourceBytes: 16 * 1024, manifestBytes: 4 * 1024, maxOutputBytes: 256 * 1024, depth: 32,
  objects: 60, objectsTotal: 240, pointsPerObject: 2000, pointsTotal: 10000, inputs: 4, optionCombinations: 64, options: 8, readouts: 8, quantities: 32, assumptions: 8,
  heatCells: 256,
  duration: 120, coordinate: 100000, size: 2000, text: 200, runs: 16,
  stateBytes: 32 * 1024, actions: 8, targets: 8, // schema 2 only; LIMITS.stateBytes is this value
  // schema 2 only: a viewport's width x height, the per-capture size the review reserves (explain-render.js reserveRound: the largest
  // scene card, 1120 x 860, per capture), so every admitted viewport fits its review. explain-stateful.test.js pins the two together.
  viewportPixels: 1120 * 860,
});

export const ERROR_CODES = Object.freeze(['invalid_program', 'unsupported_capability', 'runtime_limit', 'runtime_error', 'invalid_output', 'version_unavailable']);
// Capabilities a manifest may require. An unknown one is unsupported_capability, never silently ignored.
export const HEAT_GRID_CAPABILITY = 'heat_grid';
export const requiresHeatGrid = manifest => Array.isArray(manifest?.capabilities) && manifest.capabilities.includes(HEAT_GRID_CAPABILITY);
// inputs_v2 (INTERACT_INPUTS_V2): native `boolean` and `index` manifest inputs. A manifest capability, not an SDK helper: the sdk tuple and renderer stamp are unchanged, and a manifest with
// either input type must declare it, so every saved artifact (number and select inputs only) parses and seals exactly as before.
export const INPUTS_V2_CAPABILITY = 'inputs_v2';
export const CAPABILITIES = Object.freeze(['time_playback', 'number_inputs', 'select_inputs', 'polyline', 'math_text', MEDIUM_CAPABILITY, CYCLIC_CAPABILITY, RASTER_CAPABILITY, HEAT_GRID_CAPABILITY, PROPS_CAPABILITY, FIGURES_CAPABILITY]);
// CAPABILITIES is the list /explain tells its author and repairer (explain-program.js PROGRAM_CAPABILITIES; a maximal 16 KiB program has 14 bytes of room in the repair request, explain-program-budget.test.js), so inputs_v2
// stays out of it while the setting is off; KNOWN_CAPABILITIES is every capability a manifest may name.
export const KNOWN_CAPABILITIES = Object.freeze([...CAPABILITIES, INPUTS_V2_CAPABILITY]);
// Frame object kinds: the closed set the trusted renderer draws. Equations are text objects with math runs (hardened path).
export const OBJECT_KINDS = Object.freeze(['box', 'circle', 'text', 'line', 'arrow', 'polyline', 'image', 'raster', 'heat_grid', 'axis', 'plot', 'diagram']);
// The semantic figure kinds (capability figures, sdk-8): a frame that draws one needs both (parseGuestResult). Saved frames never carry them, so every older artifact parses unchanged.
export const FIGURE_KINDS = Object.freeze(['axis', 'plot', 'diagram']);
// What a figure keeps free beside its line, in frame units, so the frame bounds check is the same number the renderer draws with (FrameFigures.jsx): an x axis keeps
// BAND.x below it for ticks and its title, a y axis keeps BAND.y to its left and titleRoom above its top end.
export const FIGURE_BAND = Object.freeze({ x: 52, y: 60, titleRoom: 28 }); // 22 until run 2 (2026-11-13): the y title sat on the top tick label; it now rides 18 px above the axis end
// A body (a circle of at least this diameter, frame-look.js) is coloured by the renderer, by order, whatever role it carries (a role on a body is ignored, never refused: owner 2026-11-13).
export const BODY_MIN = 12;
export const FIGURE_LIMITS = Object.freeze({ series: 3, points: 24, ticks: 12, specBytes: 16 * 1024, plotMin: Object.freeze({ w: 200, h: 160 }) });

const finite = limit => z.number().min(-limit).max(limit); // z.number() already refuses NaN and Infinity
const coordinate = finite(CONTRACT_LIMITS.coordinate);
const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'an id is 1 to 64 letters, digits or _ . : -');
const name = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/, 'a name starts with a letter and has at most 32 letters, digits or _');
const hash = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 hex digest');
const version = z.string().regex(/^[A-Za-z0-9._@+-]{1,64}$/);

// Text is data. It is always drawn through escaped text nodes (React children and SVG text), never parsed as HTML, so a lesson may
// quote a URL or a tag ("A URL starts with https://", "The <div> tag groups content") as literal words. What stays forbidden is
// arbitrary resource fields: every object below is strict, so an href, src, url, image, handler or function-valued key is
// refused. An image object may name only an asset in the app's closed fixture list.
const plain = max => z.string().min(1).max(max);
const maybePlain = max => z.string().max(max);

const run = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: plain(CONTRACT_LIMITS.text) }).strict(),
  z.object({ kind: z.literal('math'), tex: z.string().min(1).max(CONTRACT_LIMITS.text) }).strict(),
]);

const utf8 = text => new TextEncoder().encode(text).length;

// ---- manifest ---------------------------------------------------------------------------------------------------------

const optionSchema = z.object({ value: z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/), label: plain(60) }).strict();
const numberInput = z.object({
  type: z.literal('number'), id: name, label: plain(60), unit: maybePlain(16).optional(),
  default: finite(1e9), min: finite(1e9), max: finite(1e9), step: z.number().positive().max(1e9).optional(),
}).strict().refine(input => input.min < input.max, { message: 'min must be below max', path: ['max'] })
  .refine(input => input.default >= input.min && input.default <= input.max, { message: 'default must lie in the domain', path: ['default'] });
const selectInput = z.object({
  type: z.literal('select'), id: name, label: plain(60), unit: maybePlain(16).optional(),
  default: z.string(), options: z.array(optionSchema).min(2).max(CONTRACT_LIMITS.options),
}).strict().refine(input => input.options.some(option => option.value === input.default), { message: 'default must be one of the options', path: ['default'] })
  .refine(input => new Set(input.options.map(option => option.value)).size === input.options.length, { message: 'option values must be unique', path: ['options'] });
const INDEX_ITEMS_MAX = 12;
// inputs_v2: a switch (the value is true or false) and a position in 2 to 12 ordered items (the value is the item's index, 0 to items - 1).
const booleanInput = z.object({ type: z.literal('boolean'), id: name, label: plain(60), default: z.boolean() }).strict();
const indexInput = z.object({
  type: z.literal('index'), id: name, label: plain(60), default: z.number().int().min(0), presentation: z.enum(['picker', 'slider']).default('picker'),
  items: z.array(z.object({ id: name, label: plain(60) }).strict()).min(2).max(INDEX_ITEMS_MAX),
}).strict().refine(input => input.default < input.items.length, { message: 'default must be the position of an item', path: ['default'] })
  .refine(input => new Set(input.items.map(item => item.id)).size === input.items.length, { message: 'item ids must be unique', path: ['items'] });
const inputSchema = z.union([numberInput, selectInput, booleanInput, indexInput]);
// kind (additive): absent or 'number' is a number readout as before; 'state' names a mode the frame reports as one of its labels (Moving up, Still for an instant, Moving down), never a number.
const readoutSchema = z.object({ id: name, label: plain(60), unit: maybePlain(16).optional(), decimals: z.number().int().min(0).max(6).default(2),
  kind: z.enum(['number', 'state']).optional(), labels: z.array(plain(40)).min(1).max(6).optional() }).strict()
  .superRefine((readout, context) => {
    if (readout.kind === 'state' && !readout.labels) context.addIssue({ code: 'custom', message: 'a state readout lists its labels', path: ['labels'] });
    if (readout.kind !== 'state' && readout.labels) context.addIssue({ code: 'custom', message: 'only a state readout has labels', path: ['labels'] });
    if (readout.labels && new Set(readout.labels).size !== readout.labels.length) context.addIssue({ code: 'custom', message: 'state labels must be unique', path: ['labels'] });
  });

// interact.md INT-01 mode.timeline, as far as a program card needs it now: shown time = elapsed + displayOffset, a trusted playback rate in simulated
// seconds per wall second, and named exact-seek markers. Optional and additive: a saved card without it plays and saves exactly as before.
const timelineMarker = z.object({ id: name, label: plain(40), time: z.number().min(0).max(CONTRACT_LIMITS.duration) }).strict();
const timelineSchema = z.object({
  label: plain(40).optional(), // names the displayed time origin, for example "Time from the apex"
  displayOffset: z.number().min(-CONTRACT_LIMITS.duration).max(CONTRACT_LIMITS.duration).optional(),
  playbackRate: z.number().positive().max(10).optional(),
  markers: z.array(timelineMarker).max(8).optional(),
}).strict();
const manifestShape = {
  title: plain(120), summary: plain(400), assumptions: z.array(plain(300)).max(CONTRACT_LIMITS.assumptions),
  description: plain(600), // the accessible description of what the picture shows
  inputs: z.array(inputSchema).max(CONTRACT_LIMITS.inputs),
  duration: z.number().positive().max(CONTRACT_LIMITS.duration).optional(), // seconds; absent means a static, time-free card
  instructions: plain(300).optional(), // owner 2026-11-07: 1 to 2 short sentences below the description, only when the card needs them (how to use the controls)
  cardDescription: plain(500).optional(), // the visible 2 to 4 line introduction above the scene (description stays the accessible one)
  timeline: timelineSchema.optional(),
  readouts: z.array(readoutSchema).max(CONTRACT_LIMITS.readouts),
  capabilities: z.array(z.string().min(1).max(32)).max(16),
};
const manifestChecks = (manifest, context) => {
  const ids = [...manifest.inputs.map(input => input.id), ...manifest.readouts.map(readout => readout.id)];
  if (new Set(ids).size !== ids.length) {
    // Name the clash and say how to fix it: a control and a readout often want the same word ("room"), and they share one namespace.
    const taken = new Set(), twice = [...new Set(ids.filter(id => taken.size === taken.add(id).size))].slice(0, 4);
    const where = id => [manifest.inputs.some(input => input.id === id) && 'an input', manifest.readouts.some(readout => readout.id === id) && 'a readout'].filter(Boolean).join(' and ');
    context.addIssue({ code: 'custom', message: `input and readout ids must be unique (they share one namespace): ${twice.map(id => `"${id}" is used more than once, as ${where(id)}`).join('; ')}; rename one of each pair`, path: ['inputs'] });
  }
  if (manifest.timeline) {
    if (!manifest.duration) context.addIssue({ code: 'custom', message: 'a timeline needs a duration', path: ['timeline'] });
    const late = (manifest.timeline.markers || []).filter(marker => marker.time > (manifest.duration ?? 0));
    if (late.length) context.addIssue({ code: 'custom', message: `timeline marker ${late[0].id} is after the end of the card (${manifest.duration} s)`, path: ['timeline', 'markers'] });
    const ids = (manifest.timeline.markers || []).map(marker => marker.id);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'timeline marker ids must be unique', path: ['timeline', 'markers'] });
  }
  if (manifest.inputs.some(input => input.type === 'boolean' || input.type === 'index') && !manifest.capabilities.includes(INPUTS_V2_CAPABILITY)) {
    context.addIssue({ code: 'custom', message: `a boolean or index input needs the ${INPUTS_V2_CAPABILITY} capability in manifest.capabilities`, path: ['capabilities'] });
  }
  const combinations = manifest.inputs.filter(input => input.type === 'select').reduce((total, input) => total * input.options.length, 1);
  if (combinations > CONTRACT_LIMITS.optionCombinations) context.addIssue({ code: 'custom', message: `select options combine to ${combinations} states (at most ${CONTRACT_LIMITS.optionCombinations})`, path: ['inputs'] });
  if (utf8(JSON.stringify(manifest)) > CONTRACT_LIMITS.manifestBytes) context.addIssue({ code: 'custom', message: `the manifest is over ${CONTRACT_LIMITS.manifestBytes} bytes`, path: [] });
};
export const ProgramManifest = z.object(manifestShape).strict().superRefine(manifestChecks);

// Schema 2 adds: one fixed viewport every evaluated frame must have (resizing scales it; inputs and actions never change the card's
// aspect), the button actions a reducer may receive, and the frame object ids a learner may select. Nothing else crosses as an event.
const frameSide = z.number().positive().max(4096); // the Frame's own dimension bound
const actionSchema = z.object({ id: name, label: plain(60) }).strict();
const targetSchema = z.object({ id, label: plain(60), drag: z.boolean().optional() }).strict(); // id: the frame object a learner selects (and, with drag, moves)
export const StatefulManifest = z.object({
  ...manifestShape,
  viewport: z.object({ width: frameSide, height: frameSide }).strict(),
  actions: z.array(actionSchema).max(CONTRACT_LIMITS.actions),
  targets: z.array(targetSchema).max(CONTRACT_LIMITS.targets),
}).strict().superRefine((manifest, context) => {
  manifestChecks(manifest, context);
  const { width, height } = manifest.viewport;
  if (width * height > CONTRACT_LIMITS.viewportPixels) context.addIssue({ code: 'custom', message: `the viewport ${width} x ${height} is ${width * height} pixels, over the ${CONTRACT_LIMITS.viewportPixels} each review capture allows: use a smaller viewport, for example 1120 x 860 or 960 x 540`, path: ['viewport'] });
  for (const key of ['actions', 'targets']) {
    const ids = manifest[key].map(item => item.id);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: `${key} ids must be unique`, path: [key] });
  }
});
const manifestFor = schemaVersion => (schemaVersion === STATEFUL_SCHEMA_VERSION ? StatefulManifest : ProgramManifest);
// The schema an author's draft asks for: one that declares a viewport, actions or targets is stateful (schema 2); anything else is schema 1.
// The author never writes a version: this is read from what the manifest declares.
export const STATEFUL_MANIFEST_KEYS = Object.freeze(['viewport', 'actions', 'targets']);
export const draftSchemaVersion = draft => (draft?.manifest && typeof draft.manifest === 'object' && STATEFUL_MANIFEST_KEYS.some(key => Object.hasOwn(draft.manifest, key)) ? STATEFUL_SCHEMA_VERSION : SCHEMA_VERSION);
// What the author is told about the stateful contract, from the same constants the schemas enforce.
export const STATEFUL_CONTRACT = Object.freeze({
  exports: 'export function initialState({ inputs, seed }) -> state; export function reduce({ state, event, inputs, time, seed }) -> state; export function evaluate({ inputs, time, seed, state }) -> { frame, quantities }',
  manifest: `viewport {width, height} (required; width x height at most ${CONTRACT_LIMITS.viewportPixels} pixels, for example 640 x 420; every frame has exactly this size), actions [{id, label}] (at most ${CONTRACT_LIMITS.actions} buttons; id is a name), targets [{id, label, drag?}] (at most ${CONTRACT_LIMITS.targets}; id is the id of a frame object the learner can select; with drag: true the learner can also drag it; every frame draws every target under that id)`,
  events: [`{type:"action", action: <an actions id>}`, `{type:"select", target: <a targets id>}`, `{type:"input", input: <an inputs id>, value: <the new value>}`,
    `{type:"drag_start" | "drag_move" | "drag_end", target: <a drag target id>, x, y} (x, y: the pointer in frame coordinates, inside the viewport; one drag is a start, any number of moves, then an end; moves may be merged, the last position and the end always arrive)`],
  state: `a plain JSON object: finite numbers, strings, booleans, null, arrays and objects; at most ${CONTRACT_LIMITS.stateBytes} bytes as JSON and ${CONTRACT_LIMITS.depth} levels deep`,
  rules: 'reduce returns the next state from the state and one event, without changing its arguments; evaluate draws the state. All three are pure and deterministic: the same seed and the same ordered events give the same state. Math.random restarts from seed on every call, so keep any random sequence counter in the state.',
});

// ---- artifact ---------------------------------------------------------------------------------------------------------

const sourceSchema = z.string().min(1).refine(text => utf8(text) <= CONTRACT_LIMITS.sourceBytes, `the source is over ${CONTRACT_LIMITS.sourceBytes} bytes`);
// What the author model supplies. Never versions, never hashes: the host stamps and computes those.
export const ProgramBundle = z.object({ manifest: ProgramManifest, source: sourceSchema }).strict();
export const StatefulBundle = z.object({ manifest: StatefulManifest, source: sourceSchema }).strict();
const artifactSchema = schemaVersion => z.object({
  kind: z.literal(PROGRAM_KIND), schemaVersion: z.literal(schemaVersion),
  runtimeVersion: version, sdkVersion: version, rendererVersion: version, runtimePolicyVersion: version, permissionProfileVersion: version,
  fingerprints: z.object({ engine: version, sdk: version, renderer: version }).strict(),
  dependencies: z.array(version).max(8).default([]),
  manifest: manifestFor(schemaVersion), source: sourceSchema, sourceHash: hash, manifestHash: hash, bundleHash: hash,
}).strict();
export const ProgramArtifact = artifactSchema(SCHEMA_VERSION);
export const StatefulArtifact = artifactSchema(STATEFUL_SCHEMA_VERSION);

// ---- evaluate request / frame / response ------------------------------------------------------------------------------

const inputValue = z.union([finite(1e9), z.string().max(32), z.boolean()]);
const requestFields = {
  requestId: z.string().min(1).max(64),
  inputs: z.record(name, inputValue).refine(record => Object.keys(record).length <= CONTRACT_LIMITS.inputs, 'too many inputs'),
  time: z.number().min(0).max(CONTRACT_LIMITS.duration),
  seed: z.number().int().min(0).max(0xffffffff),
};
export const EvaluateRequest = z.object({ ...requestFields, state: z.null() }).strict(); // schema 1: no guest state, ever

// ---- schema 2: state and events -----------------------------------------------------------------------------------------

// The one state rule, for requests, guest results and (Task 8.2) storage alike: a plain JSON object, finite numbers only, no value
// nested deeper than CONTRACT_LIMITS.depth levels (the root is level 1, as for guest output), at most CONTRACT_LIMITS.stateBytes of
// canonical UTF-8 JSON. Returns the first problem, or null. The size is measured first, at a bounded cost.
const plainContainer = node => Array.isArray(node) || [Object.prototype, null].includes(Object.getPrototypeOf(node));
const stateTooDeep = (node, level) => level > CONTRACT_LIMITS.depth
  || (node !== null && typeof node === 'object' && (!plainContainer(node) || Object.values(node).some(child => stateTooDeep(child, level + 1))));
export function stateProblem(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'state must be a JSON object';
  try { canonicalBytes(value, CONTRACT_LIMITS.stateBytes); } catch (error) {
    return error instanceof RangeError ? `state is over ${CONTRACT_LIMITS.stateBytes} bytes or nested too deeply` : 'state must be plain JSON with finite numbers';
  }
  return stateTooDeep(value, 1) ? `state is nested deeper than ${CONTRACT_LIMITS.depth} levels or is not plain JSON` : null;
}
const stateSchema = z.unknown().superRefine((value, context) => { const problem = stateProblem(value); if (problem) context.addIssue({ code: 'custom', message: problem }); });

// The strict event union. A drag (Task 8.4) is start, moves and end on one declared drag target, at a point in frame coordinates
// inside the viewport; nothing else about the pointer crosses.
export const DRAG_EVENTS = Object.freeze(['drag_start', 'drag_move', 'drag_end']);
const dragEvent = type => z.object({ type: z.literal(type), target: id, x: z.number(), y: z.number() }).strict();
export const ProgramEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('action'), action: name }).strict(),
  z.object({ type: z.literal('select'), target: id }).strict(),
  z.object({ type: z.literal('input'), input: name, value: inputValue }).strict(),
  ...DRAG_EVENTS.map(dragEvent),
]);
export const StatefulEvaluateRequest = z.object({ ...requestFields, state: stateSchema }).strict();
export const InitializeRequest = z.object({ requestId: requestFields.requestId, inputs: requestFields.inputs, seed: requestFields.seed }).strict();
export const ReduceRequest = z.object({ ...requestFields, state: stateSchema, event: z.unknown() }).strict(); // event: parseEvent, against the manifest

const style = { role: z.enum(ROLES).default('neutral'), opacity: z.number().min(0).max(1).default(1) };
const labelled = { text: plain(CONTRACT_LIMITS.text).optional(), runs: z.array(run).min(1).max(CONTRACT_LIMITS.runs).optional() };
const point = z.tuple([coordinate, coordinate]);
const size = z.number().positive().max(CONTRACT_LIMITS.size);
const cropFraction = z.number().positive().max(1);
const imageCrop = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: cropFraction, h: cropFraction }).strict()
  .refine(({ x, y, w, h }) => x + w <= 1 && y + h <= 1, 'crop must stay within the source');
const axisRange = z.object({ label: plain(40), min: finite(1e9), max: finite(1e9), unit: maybePlain(16).optional() }).strict().refine(axis => axis.min < axis.max, { message: 'min must be below max', path: ['max'] });
const plotPoint = z.object({ x: finite(1e9), y: finite(1e9) }).strict();
const plotSeries = z.object({ label: plain(40), kind: z.enum(['line', 'scatter', 'step']), points: z.array(plotPoint).max(FIGURE_LIMITS.points) }).strict()
  .refine(series => series.kind === 'scatter' || series.points.length >= 2, { message: 'a line or step series needs at least two points', path: ['points'] });
// The spec is the written card's own diagram JSON: parseTutorDiagram is its validator (a bad spec is invalid_output, never drawn), and it counts as one object.
const diagramSpec = z.unknown().superRefine((spec, context) => {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return context.addIssue({ code: 'custom', message: 'a diagram spec is the diagram JSON object' });
  let text;
  try { text = JSON.stringify(spec); } catch { return context.addIssue({ code: 'custom', message: 'a diagram spec must be plain JSON' }); }
  if (utf8(text) > FIGURE_LIMITS.specBytes) return context.addIssue({ code: 'custom', message: `a diagram spec is at most ${FIGURE_LIMITS.specBytes} bytes` });
  try { parseTutorDiagram(spec); } catch (error) { context.addIssue({ code: 'custom', message: `the diagram spec is not valid: ${String(error?.issues?.[0]?.message ?? error?.message ?? error).slice(0, 160)}` }); }
  return undefined;
});
const frameObject = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('axis'), id, x: coordinate, y: coordinate, length: size, orientation: z.enum(['x', 'y']), min: finite(1e9), max: finite(1e9),
    ticks: z.array(finite(1e9)).min(1).max(FIGURE_LIMITS.ticks).optional(), label: plain(40), unit: maybePlain(16).optional(), ...style,
  }).strict(),
  z.object({ kind: z.literal('plot'), id, x: coordinate, y: coordinate, w: size, h: size, axes: z.object({ x: axisRange, y: axisRange }).strict(), series: z.array(plotSeries).min(1).max(FIGURE_LIMITS.series), ...style }).strict(),
  z.object({ kind: z.literal('diagram'), id, x: coordinate, y: coordinate, w: size, spec: diagramSpec, ...style }).strict(),
  z.object({ kind: z.literal('box'), id, x: coordinate, y: coordinate, w: size, h: size, ...labelled, ...style, rotation: finite(360).default(0) }).strict(),
  z.object({ kind: z.literal('circle'), id, x: coordinate, y: coordinate, w: size, ...labelled, ...style, rotation: finite(360).default(0) }).strict(), // w is the diameter
  z.object({ kind: z.literal('text'), id, x: coordinate, y: coordinate, ...labelled, align: z.enum(['start', 'middle']).default('start'), ...style }).strict(),
  z.object({ kind: z.enum(['line', 'arrow']), id, from: z.object({ x: coordinate, y: coordinate }).strict(), to: z.object({ x: coordinate, y: coordinate }).strict(), ...labelled, ...style }).strict(),
  z.object({ kind: z.literal('image'), id, asset: z.enum(IMAGE_FIXTURE_IDS), x: coordinate, y: coordinate, w: size, h: size, crop: imageCrop.optional(), ...style }).strict(),
  z.object({ kind: z.literal('raster'), id, x: coordinate, y: coordinate, w: size, h: size, rows: z.number().int().min(1).max(64), cols: z.number().int().min(1).max(64), pixels: z.array(z.number().int().min(0).max(255)).max(RASTER_LIMITS.pixels * 4), ...style }).strict(),
  z.object({
    kind: z.literal('polyline'), id, points: z.array(point).min(2).max(CONTRACT_LIMITS.pointsPerObject),
    // Everything outside this rectangle is not drawn: a plotted series cannot cover the rest of the picture.
    clip: z.object({ x: coordinate, y: coordinate, w: size, h: size }).strict().optional(), ...style,
  }).strict(),
  z.object({
    kind: z.literal('heat_grid'), id, x: coordinate, y: coordinate, cell: z.number().min(1).max(80),
    rows: z.number().int().min(1).max(64), cols: z.number().int().min(1).max(64),
    values: z.array(finite(1e12)).min(1).max(CONTRACT_LIMITS.heatCells),
    domain: z.tuple([finite(1e12), finite(1e12)]).refine(([min, max]) => min < max, 'the heat domain must increase'),
    ...style,
  }).strict(),
]);

// The first problem with a figure object, or null. Bounds are checked against the frame: an axis with its tick labels and title, a plot's rectangle, a diagram's left edge,
// width and top (its height is the diagram's own, fitted by the renderer into what the frame leaves below it).
export function figureProblem(object, frame) {
  const inside = (left, top, right, bottom) => left >= 0 && top >= 0 && right <= frame.width && bottom <= frame.height;
  if (object.kind === 'axis') {
    if (!(object.min < object.max)) return 'an axis needs min below max';
    if (object.ticks?.some(tick => tick < object.min || tick > object.max)) return 'every axis tick must lie between min and max';
    const fits = object.orientation === 'x'
      ? inside(object.x, object.y - 4, object.x + object.length, object.y + FIGURE_BAND.x)
      : inside(object.x - FIGURE_BAND.y, object.y - object.length - FIGURE_BAND.titleRoom, object.x + 4, object.y + 8);
    return fits ? null : `the axis, its tick labels and its title must stay inside the ${frame.width} x ${frame.height} frame (an x axis keeps ${FIGURE_BAND.x} below it; a y axis grows up from its start and keeps ${FIGURE_BAND.y} to its left and ${FIGURE_BAND.titleRoom} above its top)`;
  }
  if (object.kind === 'plot') {
    if (object.w < FIGURE_LIMITS.plotMin.w || object.h < FIGURE_LIMITS.plotMin.h) return `a plot is at least ${FIGURE_LIMITS.plotMin.w} x ${FIGURE_LIMITS.plotMin.h}`;
    if (!inside(object.x, object.y, object.x + object.w, object.y + object.h)) return 'the plot must stay inside the frame';
    const { x, y } = object.axes;
    const outside = object.series.find(series => series.points.some(point => point.x < x.min || point.x > x.max || point.y < y.min || point.y > y.max));
    return outside ? `series "${outside.label}" has a point outside the plot axes` : null;
  }
  return object.x >= 0 && object.y >= 0 && object.y < frame.height && object.x + object.w <= frame.width ? null : 'the diagram must start inside the frame and fit its width';
}

export const Frame = z.object({
  width: z.number().positive().max(4096).default(960), height: z.number().positive().max(4096).default(540),
  objects: z.array(frameObject).max(CONTRACT_LIMITS.objects),
  readouts: z.array(z.object({ id: name, value: finite(1e12).or(plain(40)) }).strict()).max(CONTRACT_LIMITS.readouts).default([]), // a string is a state readout's label (manifest readout kind 'state')
}).strict().superRefine((frame, context) => {
  const seen = new Set();
  let points = 0, images = 0, rasterPixels = 0, heatCells = 0;
  frame.objects.forEach((object, index) => {
    if (seen.has(object.id)) context.addIssue({ code: 'custom', message: `duplicate object id "${object.id}"`, path: ['objects', index, 'id'] });
    seen.add(object.id);
    if (object.kind === 'polyline') points += object.points.length;
    if (object.kind === 'raster') {
      rasterPixels += object.rows * object.cols;
      const problem = rasterProblem(object);
      if (problem) context.addIssue({ code: 'custom', message: problem, path: ['objects', index] });
      if (object.x < 0 || object.y < 0 || object.x + object.w > frame.width || object.y + object.h > frame.height) context.addIssue({ code: 'custom', message: 'raster must stay within the frame', path: ['objects', index] });
    }
    if (object.kind === 'image') {
      images += 1;
      if (object.x < 0 || object.y < 0 || object.x + object.w > frame.width || object.y + object.h > frame.height) {
        context.addIssue({ code: 'custom', message: 'image must stay within the frame', path: ['objects', index] });
      }
      // The shared renderer displays a centered crop of a square source. A matching viewport preserves the exact ROI.
      const scaledW = object.w * (object.crop?.h ?? 1), scaledH = object.h * (object.crop?.w ?? 1);
      if (Math.abs(scaledW - scaledH) > 1e-9 * Math.max(scaledW, scaledH)) {
        context.addIssue({ code: 'custom', message: 'image viewport must match the source crop aspect ratio', path: ['objects', index] });
      }
    }
    if (object.kind === 'heat_grid') {
      heatCells += object.values.length;
      if (object.values.length !== object.rows * object.cols) context.addIssue({ code: 'custom', message: 'give one heat value per cell', path: ['objects', index, 'values'] });
      if (object.x < 0 || object.y < 0 || object.x + object.cols * object.cell > frame.width || object.y + object.rows * object.cell > frame.height) {
        context.addIssue({ code: 'custom', message: 'the heat grid must fit inside the frame', path: ['objects', index] });
      }
    }
    if (FIGURE_KINDS.includes(object.kind)) {
      const problem = figureProblem(object, frame);
      if (problem) context.addIssue({ code: 'custom', message: problem, path: ['objects', index] });
    }
    if (object.kind === 'text' && !object.text && !object.runs) context.addIssue({ code: 'custom', message: 'a text object needs text or runs', path: ['objects', index] });
    if ('text' in object && object.text && object.runs) context.addIssue({ code: 'custom', message: 'give text or runs, not both', path: ['objects', index] });
  });
  if (points > CONTRACT_LIMITS.pointsTotal) context.addIssue({ code: 'custom', message: `${points} polyline points in total (at most ${CONTRACT_LIMITS.pointsTotal})`, path: ['objects'] });
  if (rasterPixels > RASTER_LIMITS.framePixels) context.addIssue({ code: 'custom', message: 'at most 8192 raster pixels per frame', path: ['objects'] });
  if (images > 4) context.addIssue({ code: 'custom', message: 'at most four image views per frame', path: ['objects'] });
  if (heatCells > CONTRACT_LIMITS.heatCells) context.addIssue({ code: 'custom', message: `at most ${CONTRACT_LIMITS.heatCells} heat cells in total`, path: ['objects'] });
});

export const Quantities = z.record(name, finite(1e12)).refine(record => Object.keys(record).length <= CONTRACT_LIMITS.quantities, 'too many quantities');
// What the guest returns for one evaluate call. The host adds requestId and metrics around it.
export const GuestResult = z.object({ frame: Frame, quantities: Quantities.default({}) }).strict();
export const EvaluateResponse = z.object({
  requestId: z.string().min(1).max(64), frame: Frame, quantities: Quantities,
  metrics: z.object({ ms: z.number().min(0), outputBytes: z.number().int().min(0).optional() }).strict(),
}).strict();

// ---- errors -----------------------------------------------------------------------------------------------------------

// The words a learner sees (plan section 8). The message never carries source, context or a stack.
export const ERROR_MESSAGES = Object.freeze({
  runtime_limit: 'This explanation stopped because it exceeded its runtime limit.',
  unsupported_capability: 'This explanation needs a capability that is not available yet.',
  invalid_program: 'This explanation could not run. Your saved version is kept.',
  runtime_error: 'This explanation could not run. Your saved version is kept.',
  invalid_output: 'This explanation could not run. Your saved version is kept.',
  version_unavailable: 'This explanation could not run. Your saved version is kept.',
});
export const RuntimeErrorSchema = z.object({ code: z.enum(ERROR_CODES), message: z.string().min(1).max(200) }).strict();
const normalizeCode = code => (typeof code === 'string' && ERROR_CODES.includes(code) ? code : 'runtime_error');
// The learner-facing part is only the stable code and its fixed message. Anything diagnostic (a source excerpt, a stack, a
// context string) goes in the second argument, is kept apart on a non-enumerable field, and never reaches the message or toJSON.
export class RuntimeError extends Error {
  constructor(code, diagnostic) {
    const normalized = normalizeCode(code); // unknown, undefined and non-string codes become runtime_error first
    super(ERROR_MESSAGES[normalized]);
    this.name = 'RuntimeError';
    this.code = normalized;
    Object.defineProperty(this, 'diagnostic', { value: typeof diagnostic === 'string' ? diagnostic.slice(0, 500) : undefined, enumerable: false });
  }
  toJSON() { return { code: this.code, message: this.message }; }
}

// ---- parse helpers (never throw) ---------------------------------------------------------------------------------------

const firstIssue = error => { const issue = error.issues[0]; return `${issue.path.join('.') || 'root'}: ${issue.message}`; };
// Result of parsing: { ok: true, value } or { ok: false, error: RuntimeError, issue } with the schema's first complaint in
// `issue` for logs and authors, and a code-only RuntimeError for the learner.
function parseWith(schema, raw, code) {
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: new RuntimeError(code), issue: firstIssue(parsed.error) };
}
// A manifest requiring a capability this build lacks is unsupported_capability, not a malformed program. Model output is untrusted: only a
// list of strings is read here; a field of another type (or a non-string in the list) is a malformed manifest, which the schema reports with its
// path, the expected type and the observed type, so it can be repaired.
export const unsupportedCapabilities = manifest => (Array.isArray(manifest?.capabilities) ? manifest.capabilities : []).filter(capability => typeof capability === 'string' && !KNOWN_CAPABILITIES.includes(capability));
export function parseManifest(raw, schemaVersion = SCHEMA_VERSION) {
  const result = parseWith(manifestFor(schemaVersion), raw, 'invalid_program');
  if (!result.ok) return result;
  const missing = unsupportedCapabilities(result.value);
  return missing.length ? { ok: false, error: new RuntimeError('unsupported_capability'), issue: `capabilities: ${missing.join(', ')}` } : result;
}
const stateful = schemaVersion => schemaVersion === STATEFUL_SCHEMA_VERSION;
export const parseBundle = (raw, schemaVersion = SCHEMA_VERSION) => {
  const manifest = parseManifest(raw?.manifest, schemaVersion);
  return manifest.ok ? parseWith(stateful(schemaVersion) ? StatefulBundle : ProgramBundle, raw, 'invalid_program') : manifest;
};
// The artifact's own schemaVersion picks its schema: 2 is the stateful one, anything else is read as schema 1, whose literal refuses
// a version it does not know.
export const parseArtifact = raw => {
  const schemaVersion = stateful(raw?.schemaVersion) ? STATEFUL_SCHEMA_VERSION : SCHEMA_VERSION;
  const manifest = parseManifest(raw?.manifest, schemaVersion);
  if (!manifest.ok) return manifest;
  if (manifest.value.capabilities.includes(MEDIUM_CAPABILITY) && ![MEDIUM_SDK_VERSION, CYCLIC_SDK_VERSION, RASTER_SDK_VERSION].includes(raw.sdkVersion)) {
    return { ok: false, error: new RuntimeError('version_unavailable'), issue: 'the Medium capability requires its SDK version' };
  }
  if (manifest.value.capabilities.includes(CYCLIC_CAPABILITY) && ![CYCLIC_SDK_VERSION, RASTER_SDK_VERSION].includes(raw.sdkVersion)) {
    return { ok: false, error: new RuntimeError('version_unavailable'), issue: 'cyclic networks require their SDK version' };
  }
  if (manifest.value.capabilities.includes(PROPS_CAPABILITY) && ![PROPS_SDK_VERSION, FIGURES_SDK_VERSION].includes(raw.sdkVersion)) {
    return { ok: false, error: new RuntimeError('version_unavailable'), issue: 'physical props require their SDK version' };
  }
  if (manifest.value.capabilities.includes(FIGURES_CAPABILITY) && raw.sdkVersion !== FIGURES_SDK_VERSION) {
    return { ok: false, error: new RuntimeError('version_unavailable'), issue: 'semantic figures require their SDK version' };
  }
  if (manifest.value.capabilities.includes(RASTER_CAPABILITY) && raw.sdkVersion !== RASTER_SDK_VERSION) {
    return { ok: false, error: new RuntimeError('version_unavailable'), issue: 'raster visuals require their SDK version' };
  }
  const parsed = parseWith(stateful(schemaVersion) ? StatefulArtifact : ProgramArtifact, raw, 'invalid_program');
  if (parsed.ok && requiresHeatGrid(manifest.value) && parsed.value.sdkVersion !== HEAT_GRID_SDK_VERSION) {
    return { ok: false, error: new RuntimeError('unsupported_capability'), issue: `heat_grid requires ${HEAT_GRID_SDK_VERSION}` };
  }
  return parsed;
};
export const parseEvaluateRequest = raw => parseWith(EvaluateRequest, raw, 'invalid_program');
export const parseStatefulEvaluateRequest = raw => parseWith(StatefulEvaluateRequest, raw, 'invalid_program');
export const parseInitializeRequest = raw => parseWith(InitializeRequest, raw, 'invalid_program');
export const parseState = raw => parseWith(stateSchema, raw, 'invalid_output'); // a state the guest returned
// An event the manifest declares: a declared action or target, a drag on a declared drag target at a point inside the viewport, or a
// declared input with an allowed value. Never throws.
export function parseEvent(raw, manifest) {
  const parsed = parseWith(ProgramEvent, raw, 'invalid_program');
  if (!parsed.ok) return parsed;
  const event = parsed.value, input = event.type === 'input' && manifest.inputs.find(item => item.id === event.input);
  const inside = () => event.x >= 0 && event.x <= manifest.viewport.width && event.y >= 0 && event.y <= manifest.viewport.height;
  const declared = event.type === 'action' ? manifest.actions.some(action => action.id === event.action)
    : event.type === 'select' ? manifest.targets.some(target => target.id === event.target)
      : DRAG_EVENTS.includes(event.type) ? manifest.targets.some(target => target.id === event.target && target.drag === true) && inside()
        : !!input && (input.type === 'number' ? typeof event.value === 'number' && event.value >= input.min && event.value <= input.max
          : input.type === 'boolean' ? typeof event.value === 'boolean'
            : input.type === 'index' ? Number.isInteger(event.value) && event.value >= 0 && event.value < input.items.length
              : input.options.some(option => option.value === event.value));
  return declared ? parsed : { ok: false, error: new RuntimeError('invalid_program'), issue: `event: this ${event.type} is not declared by the manifest` };
}
export function parseReduceRequest(raw, manifest) {
  const parsed = parseWith(ReduceRequest, raw, 'invalid_program');
  if (!parsed.ok) return parsed;
  const event = parseEvent(parsed.value.event, manifest);
  return event.ok ? { ok: true, value: { ...parsed.value, event: event.value } } : event;
}
// Output is measured before it is parsed: the canonical serialized byte length of the WHOLE result (frame, quantities, and for
// a response its id and metrics) must not exceed CONTRACT_LIMITS.maxOutputBytes, the one authoritative output limit. A result
// that is over, too deep, or not plain JSON is invalid_output; the issue text states the limit and echoes none of the content.
// A frame that is wrong in a way the host can put right is put right before the strict check, and each fit is logged as `fitted:<id>` on the result (frame-fit.js): an array inside `objects` (the
// SDK's figure helpers return arrays: the 2026-11-13 google-low runs, "frame.objects.9: expected object, received array"), a repeated id, an axis outside the frame, an axis `ticks` count, a line series
// of under two points (a label over a body is fitted by frame-overlap.js fitGuestLabels). Everything else still goes to the strict check and is refused there.
function parseOutput(schema, raw) {
  const fitted = [];
  if (schema === Frame) { const fit = fitFrame(raw); raw = fit.frame; fitted.push(...fit.fitted); }
  else if (schema === GuestResult && raw?.frame) { const fit = fitFrame(raw.frame); raw = fit.fitted.length ? { ...raw, frame: fit.frame } : raw; fitted.push(...fit.fitted); }
  try { canonicalBytes(raw, CONTRACT_LIMITS.maxOutputBytes); } catch {
    return { ok: false, error: new RuntimeError('invalid_output'), issue: `the result is over ${CONTRACT_LIMITS.maxOutputBytes} bytes, nested too deeply, or not plain JSON` };
  }
  const parsed = parseWith(schema, raw, 'invalid_output');
  return parsed.ok && fitted.length ? { ...parsed, fitted } : parsed;
}
export const parseFrame = raw => parseOutput(Frame, raw);
// With a schema 2 manifest, every frame must also have exactly the declared viewport and draw every declared target under its own id
// (stable ids: a learner can always select what the card offers). The Frame's object and point limits apply to every result as before.
export function parseGuestResult(raw, manifest = null, sdkVersion = null) {
  const result = parseOutput(GuestResult, raw);
  if (!result.ok) return result;
  const { width, height, objects } = result.value.frame;
  const invalid = issue => ({ ok: false, error: new RuntimeError('invalid_output'), issue });
  if (objects.some(object => object.kind === 'image') && !manifest?.capabilities?.includes(MEDIUM_CAPABILITY)) {
    return invalid('frame: image views require the Medium capability');
  }
  if (objects.some(object => object.kind === 'heat_grid') && (sdkVersion !== HEAT_GRID_SDK_VERSION || !requiresHeatGrid(manifest))) {
    return invalid('heat_grid requires a declared capability and a heat-grid SDK');
  }
  if (objects.some(object => object.kind === 'raster') && !manifest?.capabilities?.includes(RASTER_CAPABILITY)) return invalid('frame: raster pixels require raster_visuals');
  if (objects.some(object => FIGURE_KINDS.includes(object.kind)) && (sdkVersion !== FIGURES_SDK_VERSION || !manifest?.capabilities?.includes(FIGURES_CAPABILITY))) {
    return invalid(`frame: axis, plot and diagram objects require the ${FIGURES_CAPABILITY} capability and ${FIGURES_SDK_VERSION}`);
  }
  for (const readout of result.value.frame.readouts) {
    const definition = manifest?.readouts?.find(item => item.id === readout.id);
    if (!definition) continue; // an undeclared readout is normalizeFrame's refusal
    const state = definition.kind === 'state';
    if (state ? !definition.labels.includes(readout.value) : typeof readout.value !== 'number') return invalid(`readouts: "${readout.id}" ${state ? `reports one of ${definition.labels.join(', ')}` : 'reports a number'}`);
  }
  const viewport = manifest?.viewport;
  if (!viewport) return result;
  if (width !== viewport.width || height !== viewport.height) return invalid(`frame: ${width} x ${height}, but the manifest viewport is ${viewport.width} x ${viewport.height}`);
  const drawn = new Set(objects.map(object => object.id)), missing = (manifest.targets || []).filter(target => !drawn.has(target.id)).map(target => target.id);
  return missing.length ? invalid(`frame: declared targets are not drawn: ${missing.slice(0, 4).join(', ')} (draw every target in every frame under its own id)`) : result;
}
export const parseEvaluateResponse = raw => parseOutput(EvaluateResponse, raw);

// ---- inputs -----------------------------------------------------------------------------------------------------------

// The manifest's inputs with the learner's saved values applied: unknown names dropped, numbers clamped into the domain,
// a select value that is not an option replaced by the default. Always a complete, valid set for EvaluateRequest.inputs.
export function resolveInputs(manifest, saved = {}) {
  const out = {};
  for (const input of manifest.inputs) {
    const value = saved?.[input.id];
    if (input.type === 'number') out[input.id] = Number.isFinite(value) ? Math.min(input.max, Math.max(input.min, value)) : input.default;
    else if (input.type === 'boolean') out[input.id] = typeof value === 'boolean' ? value : input.default;
    else if (input.type === 'index') out[input.id] = Number.isInteger(value) && value >= 0 && value < input.items.length ? value : input.default;
    else out[input.id] = input.options.some(option => option.value === value) ? value : input.default;
  }
  return out;
}

// ---- identity: hashes the host computes, never the model ---------------------------------------------------------------

// Key-sorted JSON, so the same content always hashes the same. Rejects what JSON cannot carry exactly.
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('not a finite number'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  throw new TypeError('not JSON');
}
// The exact UTF-8 byte length of canonicalJson(value), counted without building the string and stopping as soon as the count passes
// budget (a RangeError), so an oversized or cyclic value is refused at a bounded cost. TypeError for anything JSON cannot carry.
const utf8Length = text => new TextEncoder().encode(text).length;
export function canonicalBytes(value, budget = Infinity) {
  let total = 0;
  const add = count => { total += count; if (total > budget) throw new RangeError('over budget'); };
  const walk = (node, depth) => {
    if (depth > CONTRACT_LIMITS.depth) throw new RangeError('too deep');
    if (node === null) return add(4);
    if (typeof node === 'boolean') return add(node ? 4 : 5);
    if (typeof node === 'number') { if (!Number.isFinite(node)) throw new TypeError('not a finite number'); return add(JSON.stringify(node).length); }
    if (typeof node === 'string') { if (node.length > budget) throw new RangeError('over budget'); return add(utf8Length(JSON.stringify(node))); }
    if (Array.isArray(node)) {
      add(2);
      node.forEach((item, index) => { if (index) add(1); walk(item, depth + 1); });
      return undefined;
    }
    if (typeof node === 'object') {
      add(2);
      let first = true;
      for (const key of Object.keys(node)) {
        if (node[key] === undefined) continue;
        if (!first) add(1);
        first = false;
        add(utf8Length(JSON.stringify(key)) + 1);
        walk(node[key], depth + 1);
      }
      return undefined;
    }
    throw new TypeError('not JSON');
  };
  walk(value, 0);
  return total;
}
export async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
// bundleHash binds source, manifest, the engine/SDK/renderer build fingerprints, executable dependencies and both policies.
const bundleIdentity = (artifact, sourceHash, manifestHash) => canonicalJson({
  sourceHash, manifestHash, schemaVersion: artifact.schemaVersion, runtimeVersion: artifact.runtimeVersion, sdkVersion: artifact.sdkVersion,
  rendererVersion: artifact.rendererVersion, runtimePolicyVersion: artifact.runtimePolicyVersion, permissionProfileVersion: artifact.permissionProfileVersion,
  fingerprints: artifact.fingerprints, dependencies: artifact.dependencies || [],
});
export async function computeHashes(artifact) {
  const sourceHash = await sha256Hex(artifact.source);
  const manifestHash = await sha256Hex(canonicalJson(artifact.manifest));
  return { sourceHash, manifestHash, bundleHash: await sha256Hex(bundleIdentity(artifact, sourceHash, manifestHash)) };
}
// Author output (manifest + source) plus the host's version stamps becomes a stored artifact. Any hash the model supplied is
// not read: parseBundle is strict, so it is refused before this runs.
// stamps: { runtimeVersion, fingerprints: { engine, sdk, renderer }, dependencies?, ...overrides of PROGRAM_VERSIONS }. A stamp set
// with schemaVersion 2 (STATEFUL_PROGRAM_STAMPS, stamps.js) seals a stateful bundle.
export async function sealProgram(bundle, stamps) {
  const parsed = parseBundle(bundle, stamps?.schemaVersion ?? SCHEMA_VERSION);
  if (!parsed.ok) return parsed;
  const draft = { kind: PROGRAM_KIND, ...PROGRAM_VERSIONS, dependencies: [], ...stamps, ...parsed.value };
  return parseArtifact({ ...draft, ...(await computeHashes(draft)) });
}
// True only when every stored hash matches the artifact's actual content: the check before anything executes or is reviewed.
export async function verifyHashes(artifact) {
  const computed = await computeHashes(artifact);
  return computed.sourceHash === artifact.sourceHash && computed.manifestHash === artifact.manifestHash && computed.bundleHash === artifact.bundleHash;
}
