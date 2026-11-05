// /whiteboard contracts v1 (roadmap v1 section 6.4): hand validators, in the spirit of tool-input.js a walk directed by a small schema.
// Every object rejects a field the contract does not name; every number is a finite number in its range (a string where a number goes is
// refused, never coerced); every string and array is bounded; nesting is bounded by the schema itself and canonicalBytes' depth. Each
// validator returns its issues as "path: problem" lines, [] when the value is valid. Policy numbers come from whiteboard-policy.js.
import { canonicalBytes, canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';
import { LEARN_TASKS } from './learn-models.js';
import { RENDERER_VERSION, WHITEBOARD_LIMITS as L, WHITEBOARD_POLICY_VERSION, WHITEBOARD_ROLES, maxScenesFor } from './whiteboard-policy.js';

export const WHITEBOARD_VOICE = 'whiteboard-default-v1';
export const WHITEBOARD_QUALITY = 'whiteboard-1080p-v1';
export const WIDTH = 1920, HEIGHT = 1080;
export const FAILURE_REASONS = Object.freeze(['the narration could not be made', 'the drawing could not be rendered', 'the plan could not be written', 'the video could not be checked', 'access to a source was lost']);
export const STAGES = Object.freeze(['queued', 'planning', 'awaiting_approval', 'authoring', 'narrating', 'timing', 'illustrating', 'regions', 'rendering', 'reviewing', 'repairing', 'reconciling', 'ready']);

// Schema nodes.
const str = (max, { min = 1, pattern } = {}) => ({ t: 'string', min, max, pattern });
const int = (min, max) => ({ t: 'int', min, max });
const num = (min, max) => ({ t: 'number', min, max });
const bool = { t: 'boolean' };
const one = (...values) => ({ t: 'enum', values });
const arr = (item, max, min = 0) => ({ t: 'array', item, min, max });
const obj = (fields, optional = []) => ({ t: 'object', fields, optional: new Set(optional) });
const ID = str(64, { pattern: /^[A-Za-z0-9_-]+$/ });
const HASH = str(64, { min: 64, pattern: /^[0-9a-f]{64}$/ });
const KEY = str(256, { pattern: /^[A-Za-z0-9_./-]+$/ });
const COLOR = str(7, { pattern: /^#[0-9a-fA-F]{6}$/ });
const X = num(0, WIDTH), Y = num(0, HEIGHT), W = num(1, WIDTH), H = num(1, HEIGHT);
const TEXT = str(200);
const FRAMES = int(0, Math.max(...L.durations) * L.fps);

function check(node, value, path, out) {
  const at = path || '(root)';
  switch (node.t) {
    case 'string':
      if (typeof value !== 'string') return out.push(`${at}: must be a string`);
      if (value.length < node.min || value.length > node.max) return out.push(`${at}: must be ${node.min} to ${node.max} characters`);
      if (node.pattern && !node.pattern.test(value)) out.push(`${at}: has characters it may not have`);
      return;
    case 'int': case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return out.push(`${at}: must be a finite number`);
      if (node.t === 'int' && !Number.isInteger(value)) return out.push(`${at}: must be a whole number`);
      if (value < node.min || value > node.max) out.push(`${at}: must be ${node.min} to ${node.max}`);
      return;
    case 'any': return; // checked by its own validator
    case 'boolean': if (typeof value !== 'boolean') out.push(`${at}: must be true or false`); return;
    case 'enum': if (!node.values.includes(value)) out.push(`${at}: must be one of ${node.values.join(', ')}`); return;
    case 'array':
      if (!Array.isArray(value)) return out.push(`${at}: must be a list`);
      if (value.length < node.min || value.length > node.max) return out.push(`${at}: must have ${node.min} to ${node.max} items`);
      value.forEach((item, i) => check(node.item, item, `${path}.${i}`, out));
      return;
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return out.push(`${at}: must be an object`);
      for (const key of Object.keys(value)) if (!Object.hasOwn(node.fields, key)) out.push(`${path ? `${path}.` : ''}${key}: is not a field of this contract`);
      for (const [key, child] of Object.entries(node.fields)) {
        if (value[key] === undefined) { if (!node.optional.has(key)) out.push(`${path ? `${path}.` : ''}${key}: is required`); continue; }
        check(child, value[key], path ? `${path}.${key}` : key, out);
      }
      return;
    }
    case 'kind': { // a primitive: its common fields plus the geometry its kind names
      const geometry = PRIMITIVE_KINDS[value?.kind];
      if (!geometry) return out.push(`${path}.kind: must be one of ${Object.keys(PRIMITIVE_KINDS).join(', ')}`);
      return check(obj({ id: ID, kind: one(value.kind), color: COLOR, width: num(1, 12), ...geometry }), value, path, out);
    }
  }
}
const run = (node, value) => { const out = []; check(node, value, '', out); return out; };

// Plan (6.4). sourceRefs is W4's ([] before it); facts carry the numbers the author draws.
const FACT = obj({ text: TEXT, value: num(-1e12, 1e12), unit: str(24), provenance: str(72, { pattern: /^(computed|claim|source:[A-Za-z0-9_.:-]{1,64})$/ }) }, ['value', 'unit']);
const PLAN = obj({
  schema: one('whiteboard-plan/1'), planId: ID, revision: int(0, 1000), goal: str(300), audience: str(120),
  durationSeconds: one(...L.durations), language: one('en'), voice: one(WHITEBOARD_VOICE), quality: one(WHITEBOARD_QUALITY),
  sourceRefs: arr(obj({ sourceId: ID, revision: int(0, 1e9) }), 16),
  scenes: arr(obj({
    id: ID, startFrame: FRAMES, endFrame: FRAMES, learningPoint: str(200), visualIntent: str(400), narrationSummary: str(600),
    facts: arr(FACT, 8), illustration: bool,
  }), L.maxScenes, 1),
  substitutions: arr(obj({ requested: TEXT, proposed: TEXT, reason: TEXT }), 8),
  limitations: arr(TEXT, 8),
});

// The plan's fit to policy: scenes 1..min(8, ceil(d / 15)); windows from frame 0, contiguous, each a multiple of 30 frames and at least 150,
// ending at d x 30; scene ids unique.
export function validatePlan(plan) {
  const out = run(PLAN, plan);
  if (out.length) return out;
  const d = plan.durationSeconds, cap = maxScenesFor(d);
  if (plan.scenes.length > cap) out.push(`scenes: a ${d} s video has at most ${cap} scenes`);
  let frame = 0;
  plan.scenes.forEach((s, i) => {
    const length = s.endFrame - s.startFrame;
    if (s.startFrame !== frame) out.push(`scenes.${i}.startFrame: must be ${frame}, where the previous scene ends`);
    if (length < L.minWindowFrames || length % L.windowStepFrames) out.push(`scenes.${i}: its window must be a multiple of ${L.windowStepFrames} frames and at least ${L.minWindowFrames}`);
    frame = s.endFrame;
  });
  if (frame !== d * L.fps) out.push(`scenes: the windows must end at frame ${d * L.fps}`);
  if (new Set(plan.scenes.map(s => s.id)).size !== plan.scenes.length) out.push('scenes: ids must be unique');
  return out;
}

// SceneManifest (6.4). Geometry per kind on the 1920 x 1080 board; `code` and `illustration` primitives are W2's.
const POINT = arr(num(-WIDTH, 2 * WIDTH), 2, 2);
const PRIMITIVE_KINDS = Object.freeze({
  rect: { x: X, y: Y, w: W, h: H },
  ellipse: { cx: X, cy: Y, rx: W, ry: H },
  line: { x1: X, y1: Y, x2: X, y2: Y },
  cross: { x: X, y: Y, w: W, h: H },
  arrow: { x1: X, y1: Y, x2: X, y2: Y },
  path: { points: arr(POINT, L.pointsPerPath, 2) },
  text: { x: X, y: Y, size: num(12, 200), text: TEXT },
  equation: { x: X, y: Y, size: num(12, 200), text: TEXT },
  // axes in the box, the polyline in data units mapped through domain and range
  graph: { x: X, y: Y, w: W, h: H, domain: arr(num(-1e12, 1e12), 2, 2), range: arr(num(-1e12, 1e12), 2, 2), points: arr(arr(num(-1e12, 1e12), 2, 2), L.graphPoints, 2) },
});
const REGION = obj({ x: num(0, 1), y: num(0, 1), w: num(0, 1), h: num(0, 1) });
const SCENE = obj({
  schema: one('whiteboard-scene/1'), sceneId: ID,
  primitives: arr({ t: 'kind' }, L.primitivesPerScene, 1),
  beats: arr(obj({ id: ID, narration: str(L.beatChars, { min: 0 }), reveals: arr(ID, L.primitivesPerScene), pauseFrames: int(0, L.pauseFrames) }), L.beatsPerScene, 1),
  illustration: obj({ assetKey: KEY, regions: arr(REGION, L.regionsPerScene, 1) }),
}, ['illustration']);

const words = text => (text.match(/\S+/g) || []).length;
const points = s => s.primitives.reduce((total, p) => total + (p.points?.length || 0), 0);

export function validateScene(scene) {
  const out = run(SCENE, scene);
  if (out.length) return out;
  const ids = new Set(scene.primitives.map(p => p.id));
  if (ids.size !== scene.primitives.length) out.push('primitives: ids must be unique');
  if (new Set(scene.beats.map(b => b.id)).size !== scene.beats.length) out.push('beats: ids must be unique');
  const revealed = new Set();
  scene.beats.forEach((b, i) => b.reveals.forEach(id => {
    if (!ids.has(id)) out.push(`beats.${i}.reveals: ${id} is not a primitive of this scene`);
    else if (revealed.has(id)) out.push(`beats.${i}.reveals: ${id} is revealed twice`);
    revealed.add(id);
  }));
  scene.illustration?.regions.forEach((r, i) => {
    if (!(r.w > 0 && r.h > 0) || r.x + r.w > 1 || r.y + r.h > 1) out.push(`illustration.regions.${i}: must have positive area inside the image`);
  });
  return out;
}

// Timing (6.4): 30 fps, total frames d x 30, each beat's audio inside its scene's window.
const TIMING = obj({
  schema: one('whiteboard-timing/1'), fps: one(L.fps), totalFrames: FRAMES,
  beats: arr(obj({ id: ID, sceneId: ID, startFrame: FRAMES, audioKey: KEY, audioFrames: FRAMES }), L.beatsPerVideo, 1),
}, []);

// A whole video's manifest {plan, scenes, timing?}: each part valid, the scenes the plan's in order, the per-video totals, and at most 256 KiB
// serialised (checked first, so an oversized manifest is refused before it is walked).
export function validateManifest(manifest) {
  try { canonicalBytes(manifest, L.manifestBytes); }
  catch (error) { return [error instanceof RangeError ? `manifest: is over ${L.manifestBytes} bytes or nested too deep` : 'manifest: is not JSON with finite numbers']; }
  const out = run(obj({ plan: { t: 'any' }, scenes: { t: 'any' }, timing: { t: 'any' } }, ['timing']), manifest);
  if (out.length) return out;
  const prefixed = (prefix, issues) => issues.map(issue => `${prefix}.${issue}`);
  out.push(...prefixed('plan', validatePlan(manifest.plan)));
  if (!Array.isArray(manifest.scenes)) return [...out, 'scenes: must be a list'];
  manifest.scenes.forEach((scene, i) => out.push(...prefixed(`scenes.${i}`, validateScene(scene))));
  if (manifest.timing !== undefined) out.push(...prefixed('timing', run(TIMING, manifest.timing)));
  if (out.length) return out;
  const { plan, scenes, timing } = manifest;
  if (scenes.map(s => s.sceneId).join('\n') !== plan.scenes.map(s => s.id).join('\n')) out.push('scenes: must be the plan\'s scenes, in order');
  const beats = scenes.flatMap(s => s.beats), narration = beats.map(b => b.narration).join(' ');
  if (beats.length > L.beatsPerVideo) out.push(`scenes: at most ${L.beatsPerVideo} beats per video`);
  if (scenes.reduce((total, s) => total + s.primitives.length, 0) > L.primitivesPerVideo) out.push(`scenes: at most ${L.primitivesPerVideo} primitives per video`);
  if (scenes.reduce((total, s) => total + points(s), 0) > L.pointsPerVideo) out.push(`scenes: at most ${L.pointsPerVideo} path points per video`);
  if (beats.reduce((total, b) => total + b.narration.length, 0) > L.narrationChars || words(narration) > L.narrationWords) out.push(`scenes: narration is at most ${L.narrationWords} words and ${L.narrationChars} characters`);
  if (timing) {
    if (timing.totalFrames !== plan.durationSeconds * L.fps) out.push(`timing.totalFrames: must be ${plan.durationSeconds * L.fps}`);
    const windows = new Map(plan.scenes.map(s => [s.id, s]));
    timing.beats.forEach((b, i) => {
      const w = windows.get(b.sceneId);
      if (!w) out.push(`timing.beats.${i}.sceneId: is not a scene of the plan`);
      else if (b.startFrame < w.startFrame || b.startFrame + b.audioFrames > w.endFrame) out.push(`timing.beats.${i}: its audio must sit inside its scene's window`);
    });
  }
  return out;
}

// The deterministic timing line (owner benchmark order, every MVP): wall seconds per stage, written by the job, never by a model.
const SECONDS = num(0, 86400);
const TIMINGS = obj({
  video_seconds: SECONDS, plan: SECONDS, author: SECONDS, narration: SECONDS, timing_fit: SECONDS,
  render: arr(SECONDS, 24, 1), pull_store: SECONDS, total: SECONDS,
});
export const validateTimings = value => run(TIMINGS, value);

// Result and failure (6.4), the result carrying the timing line.
const RESULT = obj({
  timings: TIMINGS,
  schema: one('whiteboard-result/1'), artifactId: ID, revision: int(0, 1000), planHash: HASH, manifestHash: HASH, rendererVersion: str(64),
  keys: obj({ mp4: KEY, poster: KEY, captions: KEY, transcript: KEY, manifest: KEY }),
  measured: obj({ seconds: num(0, Math.max(...L.durations) + 1), frames: FRAMES, width: one(WIDTH), height: one(HEIGHT), bytes: int(1, L.finalMp4Bytes) }),
});
const FAILURE = obj({
  code: ID, stage: one(...STAGES), reason: one(...FAILURE_REASONS),
  recovery: arr(one('retry_render', 'edit_plan', 'new_attempt'), 3), previousRevisionAvailable: bool,
}, ['recovery']);
export const validateResult = value => run(RESULT, value);
export const validateFailure = value => run(FAILURE, value);

// Hashes (6.4): sorted keys (canonicalJson), no volatile fields. A plan's id and revision number name it; they are not its content.
export const canonicalHash = value => sha256Hex(canonicalJson(value));
export const planHash = ({ planId, revision, ...content }) => canonicalHash(content);
// The versions a manifest is bound to: policy, the role models, voice, renderer.
export const whiteboardVersions = (tasks = LEARN_TASKS) => ({
  policy: WHITEBOARD_POLICY_VERSION, renderer: RENDERER_VERSION, voice: WHITEBOARD_VOICE,
  models: Object.fromEntries(Object.entries(WHITEBOARD_ROLES).map(([role, spec]) => [role, tasks[spec.task]?.model ?? null])),
});
// manifestHash: over plan content + scenes + timing + the assets' SHA-256s + versions.
export const manifestHash = ({ plan, scenes, timing, assets }, versions = whiteboardVersions()) => {
  const { planId, revision, ...content } = plan;
  return canonicalHash({ plan: content, scenes, timing: timing ?? null, assets: assets ?? {}, versions });
};
