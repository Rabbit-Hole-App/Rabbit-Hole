import { z } from 'zod';
import { canonicalBytes, canonicalJson, sha256Hex, stateProblem } from '../explain-program/contract.js';
import { ENGINE_VERSION } from '../explain-program/stamps.js';
import { ANIMATION_CAPABILITIES, CAPABILITY_REGISTRIES } from './capabilities.js';

// The frozen /animation (animation3d) contract, AN-01 (plan docs/superpowers/plans/2026-10-30-animation.md sections 3 and 5).
// Pure: no DOM, no Three.js, no runtime import, so server tests, workers and the page share it. Separate from the legacy 2D
// `animation` block (animation-scene.js) and from `explain_program`; neither is widened.
//
// Every validator returns { ok: true, value } (value: the parsed input with defaults filled) or
// { ok: false, issues: [{ path, code, message }] }. path is dotted ('scene.nodes.3.parent', '' for the root); code is one of
// ISSUE_CODES; message is bounded diagnostic text for logs and author repair, never shown to a learner verbatim. Validators never
// throw on input; they throw a TypeError only for a capabilities object that is not a registry from capabilities.js.
//
//   validateAnimationPlan(value, capabilities?)          planner output, checked against the enabled phase
//   validateAnimationArtifact(value, capabilities?)      a generated (or fixture) scene artifact
//   validateAnimationFrame(value, artifact)              one evaluate result; artifact must already be validated
//   validateAnimationEvent(value, artifact)              one learner/host event before reduce
//   validateAnimationSnapshot(value, artifact)           the durable atomic simulation snapshot
//   validateAnimationPresentation(value, artifact)       camera + selection, saved independently of the snapshot

export const PLAN_SCHEMA = 'animation-plan/1';
export const SCENE_SCHEMA = 'animation-scene/1';
export const SNAPSHOT_SCHEMA = 'animation-snapshot/1';

// Every value the contract knows. capabilities.js enables a subset per phase; the rest are reserved, never silently accepted.
export const EXPERIENCES = Object.freeze(['inspect', 'watch', 'experiment', 'game', 'assembly', 'walkthrough']);
export const BEHAVIORS = Object.freeze(['prescribed', 'analytical', 'rules', 'physics']);
export const CONTROL_PROFILES = Object.freeze(['inspect', 'manipulate', 'walk']);
export const GEOMETRY_KINDS = Object.freeze(['box', 'sphere', 'cylinder', 'cone', 'plane', 'line', 'curve', 'arrow', 'label']);
export const FEATURES = Object.freeze(['loop', 'speed', 'seek', 'parameters', 'actions', 'select', 'drag', 'step', 'labels', 'readouts',
  'physics', 'assembly', 'walkthrough', 'attached_models', 'image_reference']);
export const GOAL_STATUSES = Object.freeze(['playing', 'won', 'lost']);
export const ISSUE_CODES = Object.freeze(['invalid_value', 'unknown_field', 'unsupported_schema', 'over_limit', 'duplicate_id', 'unknown_id',
  'hierarchy_cycle', 'not_normalized', 'not_declared', 'unsupported_capability', 'capability_version', 'missing_program', 'artifact_mismatch']);

// The behavior program's identity tuple. Distinct from explain_program (sdk-1/renderer-1/policy-1) on purpose; the same pinned engine.
export const ANIMATION_PROGRAM_VERSIONS = Object.freeze({
  kind: 'animation_program', schemaVersion: 1, runtimeVersion: ENGINE_VERSION,
  sdkVersion: 'animation-sdk-1', rendererVersion: 'animation-renderer-1', runtimePolicyVersion: 'animation-policy-1',
});
// What the author is told. Same entry points and purity rules as the stateful /explain program (explain-program/contract.js).
export const ANIMATION_PROGRAM_CONTRACT = Object.freeze({
  exports: 'export function evaluate({ inputs, time, seed, state }) -> frame; when the artifact declares actions, selectable or draggable nodes, or stepped: also export function initialState({ inputs, seed }) -> state and export function reduce({ state, event, inputs, time, seed }) -> state',
  frame: '{ nodes?: { <node id>: { position?, quaternion?, scale?, visible?, text? } }, materials?: { <material id>: { color?, opacity? } }, readouts?: { <readout id>: number }, selection?: <node id> | null, goal?: { status: "playing" | "won" | "lost", message? } }',
  rules: 'One ES module, no imports, no Three.js, no DOM. All functions pure and deterministic; evaluate never advances state. time is seconds inside the declared timeline. Quaternions are [x, y, z, w] and normalized.',
});

// Contract ceilings that bound parse cost before any count is checked against the phase's limits.
export const CONTRACT_LIMITS = Object.freeze({ planBytes: 32 * 1024, artifactBytes: 512 * 1024, frameBytes: 256 * 1024, eventBytes: 1024, snapshotBytes: 40 * 1024, coordinate: 10000, size: 1000 });
const QUATERNION_TOLERANCE = 1e-3;
const ARROW_RADIAL = 8; // an arrow is a shaft cylinder plus a head cone at this many radial segments

// ---- shapes -------------------------------------------------------------------------------------------------------------

const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'an id starts with a letter and has at most 64 letters, digits, _ or -');
const text = max => z.string().min(1).max(max);
const finite = limit => z.number().min(-limit).max(limit); // z.number() refuses NaN and Infinity
const coordinate = finite(CONTRACT_LIMITS.coordinate);
const size = z.number().positive().max(CONTRACT_LIMITS.size);
const int = (min, max) => z.number().int().min(min).max(max);
const vec3 = z.tuple([coordinate, coordinate, coordinate]);
const quaternion = z.tuple([finite(1), finite(1), finite(1), finite(1)]);
const scale = z.tuple([size, size, size]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a color is #rrggbb');
const hash = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 hex digest');
const optionValue = z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/);
const inputValue = z.union([finite(1e9), z.boolean(), optionValue]);

const parameter = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), id, label: text(60), unit: z.string().max(16).optional(), min: finite(1e9), max: finite(1e9), step: z.number().positive().max(1e9).optional(), default: finite(1e9) }).strict(),
  z.object({ type: z.literal('toggle'), id, label: text(60), default: z.boolean() }).strict(),
  z.object({ type: z.literal('select'), id, label: text(60), options: z.array(z.object({ value: optionValue, label: text(60) }).strict()).min(2).max(8), default: optionValue }).strict(),
]);
// Reserved for attached assets (post-MVP): an immutable stored source revision, never a URL.
const sourceRef = z.object({ sourceId: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/), revision: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/) }).strict();

const PlanSchema = z.object({
  schema: z.literal(PLAN_SCHEMA), title: text(120), description: text(600), experience: z.enum(EXPERIENCES), reason: text(300),
  behavior: z.enum(BEHAVIORS), controlProfile: z.enum(CONTROL_PROFILES), sourceRefs: z.array(sourceRef), parameters: z.array(parameter),
  interactions: z.array(text(200)).max(8), assumptions: z.array(text(300)).max(8), limitations: z.array(text(300)).max(8),
  learningGoal: text(300).optional(), requiredCapabilities: z.array(z.enum(FEATURES)).max(16),
  duration: z.number().positive().max(600).optional(), // seconds, for a watch loop
}).strict();

const segments = (min, max, fallback) => int(min, max).default(fallback);
const geometry = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('box'), size: scale }).strict(),
  z.object({ id, kind: z.literal('sphere'), radius: size, widthSegments: segments(3, 64, 32), heightSegments: segments(2, 32, 16) }).strict(),
  z.object({ id, kind: z.literal('cylinder'), radius: size, height: size, radialSegments: segments(3, 64, 24) }).strict(),
  z.object({ id, kind: z.literal('cone'), radius: size, height: size, radialSegments: segments(3, 64, 24) }).strict(),
  z.object({ id, kind: z.literal('plane'), width: size, height: size }).strict(),
  z.object({ id, kind: z.literal('line'), points: z.array(vec3).min(2) }).strict(),
  z.object({ id, kind: z.literal('curve'), points: z.array(vec3).min(2).max(64), segments: segments(2, 512, 64), closed: z.boolean().default(false) }).strict(), // Catmull-Rom through points
  z.object({ id, kind: z.literal('arrow'), length: size }).strict(), // along local +Y from the node origin
  z.object({ id, kind: z.literal('label'), text: text(80), size: size.default(0.3) }).strict(), // camera-facing text, world height
]);
const material = z.object({ id, color, opacity: z.number().min(0).max(1).default(1) }).strict();
const node = z.object({
  id, name: text(80).optional(), parent: id.nullable().default(null), geometry: id.optional(), material: id.optional(), // no geometry: a group
  position: vec3.default(() => [0, 0, 0]), quaternion: quaternion.default(() => [0, 0, 0, 1]), scale: scale.default(() => [1, 1, 1]),
  visible: z.boolean().default(true), selectable: z.boolean().default(false),
  drag: z.object({ axis: z.enum(['x', 'y', 'z']), min: coordinate, max: coordinate }).strict().optional(), // local-axis position range
}).strict();
const camera = z.object({ position: vec3, target: vec3, fov: z.number().min(10).max(120).default(50) }).strict();

const ArtifactSchema = z.object({
  schema: z.literal(SCENE_SCHEMA), artifactId: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/), revision: int(1, 1e9),
  planHash: hash, capabilityVersion: z.string().max(64),
  title: text(120), description: text(600), // description: the accessible scene description
  experience: z.enum(EXPERIENCES), behavior: z.enum(BEHAVIORS), controlProfile: z.enum(CONTROL_PROFILES), sourceRefs: z.array(sourceRef),
  scene: z.object({ materials: z.array(material), geometries: z.array(geometry), nodes: z.array(node) }).strict(),
  parameters: z.array(parameter), actions: z.array(z.object({ id, label: text(60) }).strict()),
  readouts: z.array(z.object({ id, label: text(60), unit: z.string().max(16).optional(), decimals: int(0, 6).default(2) }).strict()),
  timeline: z.object({ duration: z.number().positive().max(600), loop: z.boolean() }).strict().optional(),
  stepped: z.boolean().default(false), // rules scene advanced by host step events at capabilities.stepSeconds
  game: z.object({ objective: text(300), hint: text(300).optional() }).strict().optional(),
  program: z.object({
    kind: z.literal(ANIMATION_PROGRAM_VERSIONS.kind), schemaVersion: z.literal(1), runtimeVersion: z.literal(ANIMATION_PROGRAM_VERSIONS.runtimeVersion),
    sdkVersion: z.literal(ANIMATION_PROGRAM_VERSIONS.sdkVersion), rendererVersion: z.literal(ANIMATION_PROGRAM_VERSIONS.rendererVersion),
    runtimePolicyVersion: z.literal(ANIMATION_PROGRAM_VERSIONS.runtimePolicyVersion), source: z.string().min(1), sourceHash: hash,
  }).strict().optional(),
  seed: int(0, 0xffffffff), camera, assumptions: z.array(text(300)).max(8),
  provenance: z.object({ origin: z.enum(['generated', 'fixture']), model: z.string().max(64).optional(), createdAt: z.string().max(40).optional() }).strict(),
}).strict();

const nodeUpdate = z.object({ position: vec3.optional(), quaternion: quaternion.optional(), scale: scale.optional(), visible: z.boolean().optional(), text: text(80).optional() }).strict();
const FrameSchema = z.object({
  nodes: z.record(id, nodeUpdate).default(() => ({})),
  materials: z.record(id, z.object({ color: color.optional(), opacity: z.number().min(0).max(1).optional() }).strict()).default(() => ({})),
  readouts: z.record(id, finite(1e12)).default(() => ({})),
  selection: id.nullable().optional(),
  goal: z.object({ status: z.enum(GOAL_STATUSES), message: text(200).optional() }).strict().optional(),
}).strict();

// Versioned with the artifact schema (animation-scene/1). Camera orbit is presentation, never an event.
const dragEvent = type => z.object({ type: z.literal(type), node: id, value: coordinate }).strict(); // value: position on the drag axis
const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('parameter'), parameter: id, value: inputValue }).strict(),
  z.object({ type: z.literal('action'), action: id }).strict(),
  z.object({ type: z.literal('select'), node: id.nullable() }).strict(),
  dragEvent('drag_start'), dragEvent('drag_move'), dragEvent('drag_end'),
  z.object({ type: z.literal('step'), tick: int(0, 2 ** 31) }).strict(), // simulated time = tick x capabilities.stepSeconds
]);

const SnapshotSchema = z.object({
  schema: z.literal(SNAPSHOT_SCHEMA), artifactId: z.string().max(64), revision: int(1, 1e9),
  inputs: z.record(id, inputValue), state: z.unknown(), seed: int(0, 0xffffffff),
  time: z.number().min(0).max(1e6), tick: int(0, 2 ** 31), stamp: int(0, Number.MAX_SAFE_INTEGER), paused: z.boolean(),
}).strict();
const PresentationSchema = z.object({ revision: int(0, Number.MAX_SAFE_INTEGER), camera, selection: id.nullable() }).strict();

// ---- helpers ------------------------------------------------------------------------------------------------------------

const utf8 = value => new TextEncoder().encode(value).length;
const MAX_ISSUES = 20;

// Rendered triangles of one geometry, fixed by its parameters; the renderer builds exactly these segment counts.
export function triangleCost(g) {
  switch (g.kind) {
    case 'box': return 12;
    case 'sphere': return 2 * g.widthSegments * (g.heightSegments - 1);
    case 'cylinder': return 4 * g.radialSegments; // side quads plus both caps
    case 'cone': return 3 * g.radialSegments; // side quads (apex row degenerate) plus the base cap
    case 'plane': case 'label': return 2;
    case 'arrow': return 4 * ARROW_RADIAL + 3 * ARROW_RADIAL;
    default: return 0; // line, curve: no triangles; their points count against linePoints
  }
}
const linePoints = g => (g.kind === 'line' ? g.points.length : g.kind === 'curve' ? g.segments + 1 : 0);

const quaternionOff = q => Math.abs(Math.hypot(...q) - 1) > QUATERNION_TOLERANCE;

const resolveCapabilities = capabilities => {
  const resolved = capabilities ?? ANIMATION_CAPABILITIES;
  if (!CAPABILITY_REGISTRIES.includes(resolved)) throw new TypeError('capabilities must be a registry exported by animation3d/capabilities.js');
  return resolved;
};

const zodIssue = issue => {
  const path = issue.path.join('.');
  if (issue.code === 'unrecognized_keys') {
    const keys = issue.keys.map(key => String(key).slice(0, 40));
    return { path: [path, keys[0]].filter(Boolean).join('.'), code: 'unknown_field', message: `unknown field(s): ${keys.slice(0, 4).join(', ')}` };
  }
  const tooMany = issue.code === 'too_big' && (issue.origin === 'array' || issue.origin === 'string');
  return { path, code: tooMany ? 'over_limit' : 'invalid_value', message: issue.message };
};

const protoPath = (node, path = '', depth = 0) => {
  if (!node || typeof node !== 'object' || depth > 32) return null;
  for (const key of Object.keys(node)) {
    const at = path ? `${path}.${key}` : key;
    if (key === '__proto__') return at;
    const found = protoPath(node[key], at, depth + 1);
    if (found) return found;
  }
  return null;
};

// The shared pipeline: byte budget, then the strict shape, then the semantic checks. Never throws.
function validate(raw, { schema, budget, expectSchema }, semantics) {
  if (expectSchema && raw?.schema !== expectSchema) return { ok: false, issues: [{ path: 'schema', code: 'unsupported_schema', message: `expected schema ${expectSchema}` }] };
  try { canonicalBytes(raw, budget); } catch (error) {
    if (error instanceof RangeError) return { ok: false, issues: [{ path: '', code: 'over_limit', message: `over ${budget} bytes or nested too deeply` }] };
    // A TypeError (NaN, a function): the strict shape below reports it with its path.
  }
  // zod records assign keys onto a plain object, where "__proto__" would silently vanish (or swap the prototype): refuse it first.
  const proto = protoPath(raw);
  if (proto) return { ok: false, issues: [{ path: proto, code: 'invalid_value', message: 'a key may not be __proto__' }] };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.slice(0, MAX_ISSUES).map(zodIssue) };
  const issues = [];
  const add = (path, code, message) => { if (issues.length < MAX_ISSUES) issues.push({ path, code, message }); };
  semantics(parsed.data, add);
  return issues.length ? { ok: false, issues } : { ok: true, value: parsed.data };
}

const uniqueIds = (items, path, add) => {
  const seen = new Set();
  items.forEach((item, index) => { if (seen.has(item.id)) add(`${path}.${index}.id`, 'duplicate_id', `duplicate id "${item.id}"`); seen.add(item.id); });
};

function checkParameters(parameters, limit, add) {
  if (parameters.length > limit) add('parameters', 'over_limit', `${parameters.length} parameters (at most ${limit})`);
  parameters.forEach((p, index) => {
    const at = `parameters.${index}`;
    if (p.type === 'number') {
      if (!(p.min < p.max)) add(`${at}.max`, 'invalid_value', 'min must be below max');
      else if (p.default < p.min || p.default > p.max) add(`${at}.default`, 'invalid_value', 'default must lie in [min, max]');
    }
    if (p.type === 'select') {
      if (new Set(p.options.map(o => o.value)).size !== p.options.length) add(`${at}.options`, 'duplicate_id', 'option values must be unique');
      if (!p.options.some(o => o.value === p.default)) add(`${at}.default`, 'invalid_value', 'default must be one of the options');
    }
  });
}

// A value a declared parameter accepts.
export function parameterAccepts(p, value) {
  if (p.type === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= p.min && value <= p.max;
  if (p.type === 'toggle') return typeof value === 'boolean';
  return p.options.some(o => o.value === value);
}

// Experience, behavior, control profile and attached sources against the enabled phase (shared by plan and artifact).
function checkPhase(value, caps, add) {
  const off = (path, what) => add(path, 'unsupported_capability', `${what} is not available in the ${caps.phase} phase`);
  if (!caps.experiences.includes(value.experience)) off('experience', `experience "${value.experience}"`);
  if (!caps.behaviors.includes(value.behavior)) off('behavior', `behavior "${value.behavior}"`);
  if (!caps.controlProfiles.includes(value.controlProfile)) off('controlProfile', `control profile "${value.controlProfile}"`);
  if (value.sourceRefs.length > caps.limits.sourceRefs) off('sourceRefs', 'attached sources');
}

// ---- validators ---------------------------------------------------------------------------------------------------------

export function validateAnimationPlan(value, capabilities) {
  const caps = resolveCapabilities(capabilities);
  return validate(value, { schema: PlanSchema, budget: CONTRACT_LIMITS.planBytes, expectSchema: PLAN_SCHEMA }, (plan, add) => {
    checkPhase(plan, caps, add);
    plan.requiredCapabilities.forEach((feature, index) => {
      if (!caps.features.includes(feature)) add(`requiredCapabilities.${index}`, 'unsupported_capability', `"${feature}" is not available in the ${caps.phase} phase`);
    });
    if (plan.requiredCapabilities.includes('seek') && !caps.seekBehaviors.includes(plan.behavior)) add('requiredCapabilities', 'unsupported_capability', `a ${plan.behavior} scene is not seekable`);
    if (plan.requiredCapabilities.includes('step') && plan.behavior !== 'rules') add('requiredCapabilities', 'unsupported_capability', 'step needs behavior rules');
    uniqueIds(plan.parameters, 'parameters', add);
    checkParameters(plan.parameters, caps.limits.parameters, add);
  });
}

export function validateAnimationArtifact(value, capabilities) {
  const caps = resolveCapabilities(capabilities);
  return validate(value, { schema: ArtifactSchema, budget: CONTRACT_LIMITS.artifactBytes, expectSchema: SCENE_SCHEMA }, (artifact, add) => {
    const { limits } = caps;
    if (artifact.capabilityVersion !== caps.version) add('capabilityVersion', 'capability_version', `expected ${caps.version}`);
    checkPhase(artifact, caps, add);
    const { materials, geometries, nodes } = artifact.scene;
    uniqueIds(materials, 'scene.materials', add);
    uniqueIds(geometries, 'scene.geometries', add);
    uniqueIds(nodes, 'scene.nodes', add);
    // Parameters, actions and readouts share one namespace: events and frames name them by id alone.
    const names = [...artifact.parameters, ...artifact.actions, ...artifact.readouts];
    if (new Set(names.map(item => item.id)).size !== names.length) add('parameters', 'duplicate_id', 'parameter, action and readout ids must be unique together');
    checkParameters(artifact.parameters, limits.parameters, add);
    if (artifact.actions.length > limits.actions) add('actions', 'over_limit', `${artifact.actions.length} actions (at most ${limits.actions})`);

    const geometryById = new Map(geometries.map(g => [g.id, g])), materialIds = new Set(materials.map(m => m.id));
    const parentOf = new Map(nodes.map(n => [n.id, n.parent]));
    geometries.forEach((g, index) => { if (!caps.geometry.includes(g.kind)) add(`scene.geometries.${index}.kind`, 'unsupported_capability', `geometry "${g.kind}" is not available in the ${caps.phase} phase`); });
    let triangles = 0, points = 0, labels = artifact.readouts.length;
    const acyclic = new Set();
    nodes.forEach((n, index) => {
      const at = `scene.nodes.${index}`;
      if (n.parent !== null && !parentOf.has(n.parent)) add(`${at}.parent`, 'unknown_id', `unknown parent "${n.parent}"`);
      if (n.material !== undefined && !materialIds.has(n.material)) add(`${at}.material`, 'unknown_id', `unknown material "${n.material}"`);
      const g = n.geometry === undefined ? null : geometryById.get(n.geometry);
      if (n.geometry !== undefined && !g) add(`${at}.geometry`, 'unknown_id', `unknown geometry "${n.geometry}"`);
      if (g) { triangles += triangleCost(g); points += linePoints(g); if (g.kind === 'label') labels += 1; }
      if (quaternionOff(n.quaternion)) add(`${at}.quaternion`, 'not_normalized', 'the quaternion must have length 1');
      if (n.drag && !(n.drag.min < n.drag.max)) add(`${at}.drag`, 'invalid_value', 'drag min must be below max');
      if (n.drag && artifact.controlProfile === 'inspect') add(`${at}.drag`, 'invalid_value', 'dragging needs control profile manipulate');
      // Walk up the parents; reaching a node already on this walk is a cycle. Bounded by the node count.
      const walk = new Set();
      for (let current = n.id; current !== null && parentOf.has(current) && !acyclic.has(current); current = parentOf.get(current)) {
        if (walk.has(current)) { add(`${at}.parent`, 'hierarchy_cycle', `node "${n.id}" is its own ancestor`); return; }
        walk.add(current);
      }
      walk.forEach(item => acyclic.add(item));
    });
    if (nodes.length > limits.nodes) add('scene.nodes', 'over_limit', `${nodes.length} nodes (at most ${limits.nodes})`);
    if (triangles > limits.triangles) add('scene.nodes', 'over_limit', `${triangles} procedural triangles (at most ${limits.triangles})`);
    if (points > limits.linePoints) add('scene.geometries', 'over_limit', `${points} line points (at most ${limits.linePoints})`);
    if (labels > limits.labels) add('readouts', 'over_limit', `${labels} labels and readouts (at most ${limits.labels})`);

    const interactive = artifact.actions.length > 0 || artifact.stepped || nodes.some(n => n.selectable || n.drag);
    const needsProgram = artifact.experience !== 'inspect' || interactive || artifact.parameters.length > 0 || artifact.readouts.length > 0;
    if (needsProgram && !artifact.program) add('program', 'missing_program', 'this scene needs a behavior program');
    if (artifact.program && utf8(artifact.program.source) > limits.sourceBytes) add('program.source', 'over_limit', `the source is over ${limits.sourceBytes} bytes`);
    if (artifact.experience === 'watch' && !artifact.timeline) add('timeline', 'invalid_value', 'a watch scene needs a timeline');
    if ((artifact.experience === 'game') !== !!artifact.game) add('game', 'invalid_value', 'a game, and only a game, declares game { objective, hint? }');
    if (artifact.stepped && artifact.behavior !== 'rules') add('stepped', 'unsupported_capability', 'stepping needs behavior rules');
  });
}

export function validateAnimationFrame(value, artifact) {
  return validate(value, { schema: FrameSchema, budget: CONTRACT_LIMITS.frameBytes }, (frame, add) => {
    const nodes = new Map(artifact.scene.nodes.map(n => [n.id, n])), geometries = new Map(artifact.scene.geometries.map(g => [g.id, g]));
    const materials = new Set(artifact.scene.materials.map(m => m.id)), readouts = new Set(artifact.readouts.map(r => r.id));
    for (const [key, update] of Object.entries(frame.nodes)) {
      const n = nodes.get(key);
      if (!n) { add(`nodes.${key}`, 'unknown_id', 'not a node of this artifact'); continue; }
      if (update.quaternion && quaternionOff(update.quaternion)) add(`nodes.${key}.quaternion`, 'not_normalized', 'the quaternion must have length 1');
      if (update.text !== undefined && geometries.get(n.geometry)?.kind !== 'label') add(`nodes.${key}.text`, 'not_declared', 'only a label node takes text');
    }
    for (const key of Object.keys(frame.materials)) if (!materials.has(key)) add(`materials.${key}`, 'unknown_id', 'not a material of this artifact');
    for (const key of Object.keys(frame.readouts)) if (!readouts.has(key)) add(`readouts.${key}`, 'unknown_id', 'not a declared readout');
    if (frame.selection && !nodes.get(frame.selection)?.selectable) add('selection', 'not_declared', 'not a selectable node');
    if (frame.goal && artifact.experience !== 'game') add('goal', 'not_declared', 'only a game reports a goal');
  });
}

export function validateAnimationEvent(value, artifact) {
  return validate(value, { schema: EventSchema, budget: CONTRACT_LIMITS.eventBytes }, (event, add) => {
    const node = id => artifact.scene.nodes.find(n => n.id === id);
    if (event.type === 'parameter') {
      const p = artifact.parameters.find(item => item.id === event.parameter);
      if (!p) add('parameter', 'unknown_id', 'not a declared parameter');
      else if (!parameterAccepts(p, event.value)) add('value', 'invalid_value', 'outside the parameter domain');
    } else if (event.type === 'action') {
      if (!artifact.actions.some(a => a.id === event.action)) add('action', 'unknown_id', 'not a declared action');
    } else if (event.type === 'select') {
      if (event.node !== null && !node(event.node)?.selectable) add('node', 'not_declared', 'not a selectable node');
    } else if (event.type === 'step') {
      if (!artifact.stepped) add('type', 'not_declared', 'this scene is not stepped');
    } else {
      const drag = node(event.node)?.drag;
      if (!drag) add('node', 'not_declared', 'not a draggable node');
      else if (event.value < drag.min || event.value > drag.max) add('value', 'invalid_value', 'outside the drag range');
    }
  });
}

export function validateAnimationSnapshot(value, artifact) {
  return validate(value, { schema: SnapshotSchema, budget: CONTRACT_LIMITS.snapshotBytes, expectSchema: SNAPSHOT_SCHEMA }, (snapshot, add) => {
    if (snapshot.artifactId !== artifact.artifactId || snapshot.revision !== artifact.revision) add('revision', 'artifact_mismatch', 'the snapshot belongs to another artifact revision');
    const declared = new Map(artifact.parameters.map(p => [p.id, p]));
    for (const [key, input] of Object.entries(snapshot.inputs)) {
      if (!declared.has(key)) add(`inputs.${key}`, 'unknown_id', 'not a declared parameter');
      else if (!parameterAccepts(declared.get(key), input)) add(`inputs.${key}`, 'invalid_value', 'outside the parameter domain');
    }
    for (const key of declared.keys()) if (!Object.hasOwn(snapshot.inputs, key)) add(`inputs.${key}`, 'invalid_value', 'missing input');
    const problem = snapshot.state === null ? null : stateProblem(snapshot.state);
    if (problem) add('state', problem.includes('bytes') ? 'over_limit' : 'invalid_value', problem);
  });
}

export function validateAnimationPresentation(value, artifact) {
  return validate(value, { schema: PresentationSchema, budget: CONTRACT_LIMITS.eventBytes }, (presentation, add) => {
    if (presentation.selection && !artifact.scene.nodes.find(n => n.id === presentation.selection)?.selectable) add('selection', 'not_declared', 'not a selectable node');
  });
}

// The parameter defaults with saved values applied where still valid: always a complete input set for a snapshot.
export function resolveAnimationInputs(artifact, saved = {}) {
  return Object.fromEntries(artifact.parameters.map(p => [p.id, saved && Object.hasOwn(saved, p.id) && parameterAccepts(p, saved[p.id]) ? saved[p.id] : p.default]));
}

// The server's planHash and the program's sourceHash: SHA-256 hex over canonical JSON / exact source text.
export const hashAnimationPlan = plan => sha256Hex(canonicalJson(plan));
export const hashProgramSource = source => sha256Hex(source);
