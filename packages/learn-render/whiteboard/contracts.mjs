// The whiteboard-render/1 request (roadmap v1 sections 6.2, 6.4, 6.5): a static gate run before anything is written. A hand validator walked by a
// small schema: every object rejects a field the contract does not name (so no code-like key, `__proto__` or `code` primitive passes), every
// number is a finite number in its range (a string where a number goes is refused, never coerced), every string and list is bounded, the
// base64 audio is decoded-size checked, and the cross-field rules (frames, windows, reveals, beats, audio) hold. Field names and primitive
// geometry are the control plane's whiteboard-schema.js (wb-server); the renderer image does not carry control-plane code, so this is its own
// copy, tested against wb-server's fixtures (gate.test.mjs). Returns "path: problem" lines, [] when the request may render.
export const RENDER_SCHEMA = 'whiteboard-render/1';
// What /health reports as `whiteboard` and the Worker requires before it posts. Pinned with wb-server's whiteboard-policy.js: never changed here alone.
export const RENDERER_VERSION = 'whiteboard-renderer-1';
export const FPS = 30, WIDTH = 1920, HEIGHT = 1080;
const MIB = 1024 * 1024;
export const LIMITS = Object.freeze({
  durations: Object.freeze([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]), // the contract's; W1 serves up to servedMaxSeconds
  servedMaxSeconds: 60, // ponytail: W1 renders one segment of at most 60 s (evidence/w1-p0); W2 serves 120 s
  maxSegments: 6, // the contract keeps segments for W2; W1 accepts of = 1 only
  maxScenes: 8, beatsPerScene: 4, beatsPerVideo: 32, beatChars: 600, pauseFrames: 90,
  primitivesPerScene: 80, primitivesPerVideo: 400, pointsPerPath: 1000, pointsPerVideo: 12000, graphPoints: 64,
  beatAudioBytes: 8 * MIB, bodyBytes: 16 * MIB,
});

const str = (max, { min = 1, pattern } = {}) => ({ t: 'string', min, max, pattern });
const int = (min, max) => ({ t: 'int', min, max });
const num = (min, max) => ({ t: 'number', min, max });
const one = (...values) => ({ t: 'enum', values });
const arr = (item, max, min = 0) => ({ t: 'array', item, min, max });
const obj = (fields, optional = []) => ({ t: 'object', fields, optional: new Set(optional) });
const ID = str(64, { pattern: /^[A-Za-z0-9_-]+$/ });
const KEY = str(256, { pattern: /^[A-Za-z0-9_./-]+$/ });
const COLOR = str(7, { pattern: /^#[0-9a-fA-F]{6}$/ });
const TEXT = str(200);
const FRAMES = int(0, Math.max(...LIMITS.durations) * FPS);
const X = num(0, WIDTH), Y = num(0, HEIGHT), W = num(1, WIDTH), H = num(1, HEIGHT), BIG = num(-1e12, 1e12);
const B64 = { t: 'base64', max: LIMITS.beatAudioBytes };
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export const PRIMITIVE_KINDS = Object.freeze({
  rect: { x: X, y: Y, w: W, h: H },
  ellipse: { cx: X, cy: Y, rx: W, ry: H },
  line: { x1: X, y1: Y, x2: X, y2: Y },
  cross: { x: X, y: Y, w: W, h: H },
  arrow: { x1: X, y1: Y, x2: X, y2: Y },
  path: { points: arr(arr(num(-WIDTH, 2 * WIDTH), 2, 2), LIMITS.pointsPerPath, 2) },
  text: { x: X, y: Y, size: num(12, 200), text: TEXT },
  equation: { x: X, y: Y, size: num(12, 200), text: TEXT },
  graph: { x: X, y: Y, w: W, h: H, domain: arr(BIG, 2, 2), range: arr(BIG, 2, 2), points: arr(arr(BIG, 2, 2), LIMITS.graphPoints, 2) },
}); // `code` and `illustration` are W2's

function check(node, value, path, out) {
  const at = path || '(root)';
  const field = key => (path ? `${path}.${key}` : key);
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
    case 'boolean': if (typeof value !== 'boolean') out.push(`${at}: must be true or false`); return;
    case 'enum': if (!node.values.includes(value)) out.push(`${at}: must be one of ${node.values.join(', ')}`); return;
    case 'base64': {
      if (typeof value !== 'string' || !value.length || value.length % 4 || !B64_RE.test(value)) return out.push(`${at}: must be non-empty base64`);
      const bytes = (value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
      if (bytes > node.max) out.push(`${at}: decodes to ${bytes} bytes, over ${node.max}`);
      return;
    }
    case 'array':
      if (!Array.isArray(value)) return out.push(`${at}: must be a list`);
      if (value.length < node.min || value.length > node.max) return out.push(`${at}: must have ${node.min} to ${node.max} items`);
      value.forEach((item, i) => check(node.item, item, field(i), out));
      return;
    case 'object':
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return out.push(`${at}: must be an object`);
      for (const key of Object.keys(value)) if (!Object.hasOwn(node.fields, key)) out.push(`${field(key)}: is not a field of this contract`);
      for (const [key, child] of Object.entries(node.fields)) {
        if (value[key] === undefined) { if (!node.optional.has(key)) out.push(`${field(key)}: is required`); continue; }
        check(child, value[key], field(key), out);
      }
      return;
    case 'kind': { // a primitive: the common fields plus its kind's geometry
      const geometry = Object.hasOwn(PRIMITIVE_KINDS, value?.kind) ? PRIMITIVE_KINDS[value.kind] : null;
      if (!geometry) return out.push(`${field('kind')}: must be one of ${Object.keys(PRIMITIVE_KINDS).join(', ')}`);
      return check(obj({ id: ID, kind: one(value.kind), color: COLOR, width: num(1, 12), ...geometry }), value, path, out);
    }
  }
}

// wb-server's plan, scene manifest and timing, field for field (whiteboard-schema.js); illustrations are refused until W2.
const PLAN = obj({
  schema: one('whiteboard-plan/1'), planId: ID, revision: int(0, 1000), goal: str(300), audience: str(120),
  durationSeconds: one(...LIMITS.durations), language: one('en'), voice: one('whiteboard-default-v1'), quality: one('whiteboard-1080p-v1'),
  sourceRefs: arr(obj({ sourceId: ID, revision: int(0, 1e9) }), 16),
  scenes: arr(obj({
    id: ID, startFrame: FRAMES, endFrame: FRAMES, learningPoint: str(200), visualIntent: str(400), narrationSummary: str(600),
    facts: arr(obj({ text: TEXT, value: BIG, unit: str(24), provenance: str(72, { pattern: /^(computed|claim|source:[A-Za-z0-9_.:-]{1,64})$/ }) }, ['value', 'unit']), 8),
    illustration: one(false), // ponytail: W2 renders illustrations
  }), LIMITS.maxScenes, 1),
  substitutions: arr(obj({ requested: TEXT, proposed: TEXT, reason: TEXT }), 8),
  limitations: arr(TEXT, 8),
});
const SCENE = obj({ // no `illustration` field before W2
  schema: one('whiteboard-scene/1'), sceneId: ID,
  primitives: arr({ t: 'kind' }, LIMITS.primitivesPerScene, 1),
  beats: arr(obj({ id: ID, narration: str(LIMITS.beatChars, { min: 0 }), reveals: arr(ID, LIMITS.primitivesPerScene), pauseFrames: int(0, LIMITS.pauseFrames) }), LIMITS.beatsPerScene, 1),
});
const TIMING = obj({
  schema: one('whiteboard-timing/1'), fps: one(FPS), totalFrames: FRAMES,
  beats: arr(obj({ id: ID, sceneId: ID, startFrame: FRAMES, audioKey: KEY, audioFrames: FRAMES }), LIMITS.beatsPerVideo, 1),
});
const REQUEST = obj({
  schema: one(RENDER_SCHEMA), job_id: ID,
  segment: obj({ index: int(0, LIMITS.maxSegments - 1), of: int(1, LIMITS.maxSegments), startFrame: FRAMES, endFrame: FRAMES }),
  manifest: obj({ plan: PLAN, scenes: arr(SCENE, LIMITS.maxScenes, 1), timing: TIMING }),
  audio: arr(obj({ beat: KEY, b64: B64 }), LIMITS.beatsPerVideo),
  illustrations: arr(obj({ scene: ID, b64: str(1) }), 0), // ponytail: W2 sends illustrations; W1 sends []
});

// The rules between fields. Runs only on a request whose shape is valid.
function crossErrors({ segment, manifest: { plan, scenes, timing }, audio }) {
  const out = [], total = plan.durationSeconds * FPS;
  if (plan.durationSeconds > LIMITS.servedMaxSeconds) out.push(`manifest.plan.durationSeconds: W1 renders up to ${LIMITS.servedMaxSeconds} s`);
  if (timing.totalFrames !== total) out.push(`manifest.timing.totalFrames: must be ${total} (${plan.durationSeconds} s x ${FPS})`);
  if (segment.of !== 1 || segment.index !== 0) out.push('segment: W1 renders one segment (index 0 of 1)');
  if (segment.startFrame !== 0 || segment.endFrame !== total) out.push(`segment: must be frames 0 to ${total}`);
  let frame = 0;
  plan.scenes.forEach((s, i) => {
    if (s.startFrame !== frame || s.endFrame <= s.startFrame) out.push(`manifest.plan.scenes.${i}: its window must start at ${frame}, where the previous one ends, and be longer than 0`);
    frame = s.endFrame;
  });
  if (frame !== total) out.push(`manifest.plan.scenes: the windows must end at frame ${total}`);
  if (scenes.map(s => s.sceneId).join('\n') !== plan.scenes.map(s => s.id).join('\n')) out.push('manifest.scenes: must be the plan\'s scenes, in order');
  scenes.forEach((scene, si) => {
    const at = `manifest.scenes.${si}`, ids = new Set(scene.primitives.map(p => p.id)), revealed = new Set();
    if (ids.size !== scene.primitives.length) out.push(`${at}.primitives: ids must be unique`);
    if (new Set(scene.beats.map(b => b.id)).size !== scene.beats.length) out.push(`${at}.beats: ids must be unique`);
    scene.beats.forEach((b, bi) => b.reveals.forEach(id => {
      if (!ids.has(id)) out.push(`${at}.beats.${bi}.reveals: ${id} is not a primitive of this scene`);
      else if (revealed.has(id)) out.push(`${at}.beats.${bi}.reveals: ${id} is revealed twice`);
      revealed.add(id);
    }));
  });
  const beats = scenes.flatMap(s => s.beats.map(b => ({ ...b, sceneId: s.sceneId })));
  if (beats.length > LIMITS.beatsPerVideo) out.push(`manifest.scenes: at most ${LIMITS.beatsPerVideo} beats per video`);
  if (scenes.reduce((n, s) => n + s.primitives.length, 0) > LIMITS.primitivesPerVideo) out.push(`manifest.scenes: at most ${LIMITS.primitivesPerVideo} primitives per video`);
  if (scenes.reduce((n, s) => n + s.primitives.reduce((m, p) => m + (p.points?.length || 0), 0), 0) > LIMITS.pointsPerVideo) out.push(`manifest.scenes: at most ${LIMITS.pointsPerVideo} path points per video`);
  if (out.length) return out;
  // Timing: one entry per scene beat, in order; each beat's audio inside its scene's window and after the previous beat's audio.
  if (timing.beats.length !== beats.length || timing.beats.some((t, i) => t.sceneId !== beats[i].sceneId || t.id !== beats[i].id)) return ['manifest.timing.beats: must be the scenes\' beats, in order'];
  const windows = new Map(plan.scenes.map(s => [s.id, s]));
  timing.beats.forEach((t, i) => {
    const w = windows.get(t.sceneId), prev = timing.beats[i - 1];
    if (t.startFrame < w.startFrame || t.startFrame + t.audioFrames > w.endFrame) out.push(`manifest.timing.beats.${i}: its audio must sit inside its scene's window`);
    if (prev?.sceneId === t.sceneId && t.startFrame < prev.startFrame + prev.audioFrames) out.push(`manifest.timing.beats.${i}: must start after the previous beat's audio`);
    if ((beats[i].narration.trim() !== '') !== (t.audioFrames > 0)) out.push(`manifest.timing.beats.${i}: a narrated beat has audio and a silent beat has none`);
  });
  // Audio: exactly one MP3 per narrated beat, named by its timing audioKey.
  const voiced = new Set(timing.beats.filter(t => t.audioFrames > 0).map(t => t.audioKey));
  if (voiced.size !== timing.beats.filter(t => t.audioFrames > 0).length) out.push('manifest.timing.beats: narrated beats need distinct audioKeys');
  const sent = audio.map(a => a.beat);
  if (new Set(sent).size !== sent.length || sent.length !== voiced.size || sent.some(k => !voiced.has(k))) out.push('audio: must be one entry per narrated beat, named by its audioKey');
  return out;
}

export function validateRenderRequest(body) {
  const out = [];
  check(REQUEST, body, '', out);
  return out.length ? out : crossErrors(body);
}
