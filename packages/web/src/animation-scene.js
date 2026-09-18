import { z } from 'zod';
import { GEOMETRY, ROLES, TYPE_ROLES } from './scene-vocab.js';
import { adaptLegacyScene } from './scene-legacy.js';

// The animation source of truth: scene JSON plus a pure evaluator. Neither
// React nor tldraw is imported here, so the live canvas and the video exporter
// read the same state for the same time.

const vector = z.object({ x: z.number(), y: z.number() });

// Every type here has a branch in AnimatedScene.jsx. Adding a member without
// one produces an object that validates and draws nothing, which is how arrow,
// line and image shipped invisible. The renderer's own test reads this list.
export const RENDERED_TYPES = ['box', 'text', 'circle', 'arrow', 'line', 'equation', 'code', 'image', 'grid', 'strip', 'bars', 'tokens'];

const objectSchema = z.object({
  id: z.string().min(1).max(64),
  // Primitives that are the mathematical object itself, not a label for it.
  type: z.enum(RENDERED_TYPES),
  semanticId: z.string().max(64).optional(),
  conceptId: z.string().max(64).optional(),
  initialState: z.object({
    label: z.string().max(200).optional(),
    text: z.string().max(600).optional(),
    x: z.number().default(0),
    y: z.number().default(0),
    w: z.number().positive().max(2000).optional(),
    h: z.number().positive().max(2000).optional(),
    opacity: z.number().min(0).max(1).default(1),
    rotation: z.number().min(-360).max(360).default(0),
    role: z.enum(ROLES).default('neutral'),
    typography: z.enum(TYPE_ROLES).default('body'),
    from: vector.optional(),
    to: vector.optional(),
    rows: z.number().int().positive().max(64).optional(),
    cols: z.number().int().positive().max(64).optional(),
    cell: z.number().positive().max(80).optional(),
    // null is a blank cell, not a zero: a masked or not-yet-computed entry
    // must read as absent rather than as a real measurement of nothing.
    values: z.array(z.number().nullable()).max(256).optional(),
    labels: z.array(z.string().max(24)).max(64).optional(),
    tokens: z.array(z.string().max(24)).max(48).optional(),
    src: z.string().max(300).optional(),
    heat: z.boolean().optional(),
    peak: z.number().positive().max(1e6).optional(),
  }).prefault({}),
});

const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring'];

const eventSchema = z.object({
  at: z.number().min(0).max(600),
  action: z.enum([
    'appear', 'disappear', 'move', 'resize', 'rotate', 'highlight', 'unhighlight',
    'draw_path', 'erase_path', 'change_text', 'type_text', 'change_value',
    'connect', 'disconnect', 'focus_camera', 'pan_camera', 'zoom_camera', 'pause',
    'set_values', 'highlight_cell', 'sweep', 'emphasize',
  ]),
  target: z.string().max(64).optional(),
  from: z.string().max(64).optional(),
  to: z.string().max(64).optional(),
  duration: z.number().min(0).max(60).default(0),
  easing: z.enum(EASINGS).default('easeInOut'),
  value: z.any().optional(),
});

export const animationSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(200).optional(),
  width: z.number().positive().max(4096).default(960),
  height: z.number().positive().max(4096).default(540),
  duration: z.number().positive().max(120),
  objects: z.array(objectSchema).max(60),
  timeline: z.array(eventSchema).max(200),
  camera: z.object({ x: z.number().nullable().default(null), y: z.number().nullable().default(null), zoom: z.number().positive().max(8).default(1) }).prefault({}),
});

const ease = (kind, t) => {
  const clamped = Math.max(0, Math.min(1, t));
  if (kind === 'linear') return clamped;
  if (kind === 'easeIn') return clamped * clamped;
  if (kind === 'easeOut') return 1 - (1 - clamped) ** 2;
  // A visual spring that still settles exactly at 1, so a diagram never
  // finishes off its mark.
  if (kind === 'spring') return clamped === 1 ? 1 : 1 - Math.cos(clamped * Math.PI * 1.5) * (1 - clamped) ** 2 - (1 - clamped) ** 2;
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
};

// How far through an event we are at this time: 0 before it starts, 1 once it
// has finished, eased in between.
const phase = (event, time) => {
  if (time <= event.at) return 0;
  if (!event.duration) return 1;
  return ease(event.easing, (time - event.at) / event.duration);
};

// An image source is a policy, not a length. A third-party origin would make a
// lesson a tracking beacon, and a data: URI would put megabytes into the
// learner's persisted canvas. One leading slash, no scheme, no traversal.
const SAME_ORIGIN = /^\/[A-Za-z0-9._~\-/]*$/;

export function validateScene(raw) {
  // A legacy scene may still name a hex colour. Translate the closed set we
  // recognise into a role before zod ever sees `color` - unknown keys are
  // dropped silently by zod, and a dropped colour is exactly the failure this
  // gate exists to prevent, so it must be caught before the drop happens.
  raw = adaptLegacyScene(raw);
  const parsed = animationSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid animation at ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  const scene = parsed.data;
  const byId = new Map(scene.objects.map(object => [object.id, object]));
  const ids = new Set(byId.keys());
  if (ids.size !== scene.objects.length) throw new Error('Every animation object needs a unique id');
  for (const object of scene.objects) {
    if (object.type === 'image') {
      const src = object.initialState.src;
      if (!src) throw new Error(`Object "${object.id}": an image needs a src`);
      if (!SAME_ORIGIN.test(src) || src.includes('..') || src.startsWith('//')) {
        throw new Error(`Object "${object.id}": an image src must be a same-origin path beginning with a single /`);
      }
      // An image has no intrinsic size here - sizeOf gives it none - so without
      // a width and height it renders as an element with no dimensions, which is
      // engine-dependent and silently invisible.
      if (!(object.initialState.w && object.initialState.h)) {
        throw new Error(`Object "${object.id}": an image needs a width and height`);
      }
    }
    if (object.type === 'equation' && !(object.initialState.w && object.initialState.h)) {
      throw new Error(`Object "${object.id}": an equation needs a width and height`);
    }
    // A stroke with no endpoints falls back to its own x/y for both ends - a
    // finite zero-length line, no NaN, but an invisible object that validated.
    // That is the failure this whole pass exists to stop.
    if (['arrow', 'line'].includes(object.type) && !(object.initialState.from && object.initialState.to)) {
      throw new Error(`Object "${object.id}": ${object.type === 'arrow' ? 'an' : 'a'} ${object.type} needs a from and a to`);
    }
  }
  for (const event of scene.timeline) {
    for (const key of ['target', 'from', 'to']) {
      if (event[key] && !ids.has(event[key])) throw new Error(`Timeline event at ${event.at}s refers to unknown object "${event[key]}"`);
    }
    if (event.action === 'set_values') {
      if (!event.target) throw new Error(`Timeline event at ${event.at}s: set_values needs a target`);
      if (!Array.isArray(event.value)) throw new Error(`Timeline event at ${event.at}s: set_values needs an array of numbers`);
      if (event.value.some(entry => entry !== null && !Number.isFinite(entry))) {
        throw new Error(`Timeline event at ${event.at}s: set_values takes numbers or null, nothing else`);
      }
      // The object's own size is frozen from its authored values at build time
      // and the region hit-test reads that size, so a payload of a different
      // length would desynchronise the picture from what the learner can click.
      const authored = byId.get(event.target)?.initialState.values;
      if (!authored) throw new Error(`Timeline event at ${event.at}s: "${event.target}" has no values to change`);
      if (event.value.length !== authored.length) {
        throw new Error(`Timeline event at ${event.at}s: set_values sends ${event.value.length} values to "${event.target}", which holds ${authored.length}`);
      }
    }
    // The camera schema bounds the scene's OPENING camera, but the events that
    // move it carry a z.any() value, and since the renderer started reading the
    // camera those events are what draws the frame. An unchecked zoom of 0 or a
    // pan with no x turns the whole viewBox into Infinity or NaN - a blank block
    // with nothing said, which is the failure every other refusal here prevents.
    if (event.action === 'zoom_camera' || event.action === 'focus_camera') {
      const zoom = event.action === 'zoom_camera' ? (event.value?.zoom ?? event.value) : event.value?.zoom;
      if (zoom !== undefined && !(Number.isFinite(zoom) && zoom > 0 && zoom <= 8)) {
        throw new Error(`Timeline event at ${event.at}s: a camera zoom must be a number above 0 and at most 8`);
      }
    }
    if (event.action === 'pan_camera' && !(Number.isFinite(event.value?.x) && Number.isFinite(event.value?.y))) {
      throw new Error(`Timeline event at ${event.at}s: pan_camera needs an x and a y`);
    }
    if (event.at + event.duration > scene.duration + 0.001) throw new Error(`Timeline event at ${event.at}s runs past the ${scene.duration}s scene`);
  }
  return scene;
}

// Data primitives size themselves from their own contents, so an author
// writes rows and columns and never pixels. Both the renderer and region
// hit-testing read the size from here.
// A chip's padding and gap are spacing, so they sit on SPACE; its char width
// is a character-to-pixel measurement, neither spacing nor geometry, so it
// stays a plain constant. Exported individually rather than as one object -
// AnimatedScene.jsx's chip render needs these exact numbers too, to keep the
// drawn chip in sync with the width sizeOf already froze.
export const CHIP_PAD = 16, CHIP_GAP = 8, CHIP_CHAR = 9.5;
const sizeOf = object => {
  const state = object.initialState;
  const cell = state.cell ?? GEOMETRY.cellPitch;
  if (object.type === 'grid') return { w: (state.cols || 1) * cell, h: (state.rows || 1) * cell };
  if (object.type === 'strip') return { w: (state.values?.length || 1) * cell, h: cell };
  if (object.type === 'bars') return { w: (state.values?.length || 1) * GEOMETRY.barWidth, h: state.h ?? GEOMETRY.barHeight };
  if (object.type === 'tokens') return { w: (state.tokens || []).reduce((total, token) => total + CHIP_PAD * 2 + token.length * CHIP_CHAR + CHIP_GAP, 0), h: GEOMETRY.chipHeight };
  return { w: state.w ?? (object.type === 'box' ? GEOMETRY.nodeMinWidth : undefined), h: state.h ?? (object.type === 'box' ? GEOMETRY.nodeHeight : undefined) };
};

// The whole point: same time in, same state out, with no renderer involved.
export function getSceneState(scene, time) {
  // Time arrives from persisted learner state, so it can be anything. A scene
  // that cannot be evaluated at a moment is worse than one evaluated at zero:
  // NaN makes every `event.at > at` false, so the whole timeline applies at once.
  const requested = Number(time);
  const at = Number.isNaN(requested) ? 0 : Math.max(0, Math.min(scene.duration, requested));
  const objects = new Map(scene.objects.map(object => [object.id, {
    id: object.id,
    type: object.type,
    semanticId: object.semanticId || object.id,
    conceptId: object.conceptId || null,
    visible: object.initialState.opacity > 0,
    opacity: object.initialState.opacity,
    x: object.initialState.x,
    y: object.initialState.y,
    w: object.initialState.w ?? sizeOf(object).w,
    h: object.initialState.h ?? sizeOf(object).h,
    rotation: object.initialState.rotation,
    role: object.initialState.role,
    typography: object.initialState.typography,
    from: object.initialState.from ?? null,
    to: object.initialState.to ?? null,
    src: object.initialState.src ?? null,
    label: object.initialState.label ?? object.initialState.text ?? '',
    textProgress: 1,
    highlighted: false,
    rows: object.initialState.rows ?? null,
    cols: object.initialState.cols ?? null,
    cell: object.initialState.cell ?? GEOMETRY.cellPitch,
    values: object.initialState.values ? [...object.initialState.values] : null,
    labels: object.initialState.labels ?? null,
    tokens: object.initialState.tokens ?? null,
    heat: object.initialState.heat ?? false,
    peak: object.initialState.peak ?? null,
    cellHighlight: null,
    sweep: null,
    emphasis: 0,
  }]));
  const connections = [];
  // The camera names the point the frame is centred on. Unset means the middle
  // of the scene, so a scene that never mentions a camera is framed exactly as
  // it was before the camera did anything at all.
  let camera = { x: scene.camera.x ?? scene.width / 2, y: scene.camera.y ?? scene.height / 2, zoom: scene.camera.zoom };
  const events = [...scene.timeline].sort((a, b) => a.at - b.at || a.duration - b.duration);
  for (const event of events) {
    if (event.at > at) break;
    const progress = phase(event, at);
    const object = event.target ? objects.get(event.target) : null;
    switch (event.action) {
      case 'appear': if (object) { object.visible = true; object.opacity = progress; } break;
      case 'disappear': if (object) { object.opacity = 1 - progress; object.visible = object.opacity > 0.01; } break;
      case 'move': if (object && event.value) {
        object.x = object.x + (event.value.x - object.x) * progress;
        object.y = object.y + (event.value.y - object.y) * progress;
      } break;
      case 'resize': if (object && event.value) {
        object.w = (object.w ?? 0) + ((event.value.w ?? object.w ?? 0) - (object.w ?? 0)) * progress;
        object.h = (object.h ?? 0) + ((event.value.h ?? object.h ?? 0) - (object.h ?? 0)) * progress;
      } break;
      case 'rotate': if (object) object.rotation = object.rotation + ((event.value ?? 0) - object.rotation) * progress; break;
      case 'highlight': if (object) object.highlighted = progress > 0; break;
      case 'unhighlight': if (object) object.highlighted = progress < 1; break;
      case 'change_text': if (object && progress >= 1) { object.label = String(event.value ?? ''); object.textProgress = 1; } break;
      case 'type_text': if (object) { object.label = String(event.value ?? object.label); object.textProgress = progress; } break;
      case 'change_value': if (object) object.label = String(event.value ?? object.label); break;
      case 'draw_path':
      case 'connect': {
        const key = event.action === 'connect' ? `${event.from}->${event.to}` : event.target;
        const existing = connections.find(connection => connection.key === key);
        const drawn = {
          key,
          from: event.from || null,
          to: event.to || null,
          target: event.target || null,
          progress,
          semanticId: key,
        };
        if (existing) Object.assign(existing, drawn); else connections.push(drawn);
        break;
      }
      case 'erase_path':
      case 'disconnect': {
        const key = event.action === 'disconnect' ? `${event.from}->${event.to}` : event.target;
        const existing = connections.find(connection => connection.key === key);
        if (existing) existing.progress = 1 - progress;
        break;
      }
      // Numbers change into other numbers, so the learner watches the values
      // move rather than reading two static states.
      case 'set_values': if (object && Array.isArray(event.value)) {
        const target = event.value;
        object.values = (object.values || target.map(() => 0)).map((current, index) => {
          // Nothing has happened until the event is under way, in either
          // direction: a blank does not fill in and a value does not blank.
          if (progress === 0) return current;
          const goal = target[index];
          if (goal === null) return null;             // blanked; there is nothing to tween towards
          if (goal === undefined) return current;     // untouched
          const from = current == null ? 0 : current; // a blank cell grows back from zero
          return from + (goal - from) * progress;
        });
      } break;
      case 'highlight_cell': if (object) object.cellHighlight = progress > 0 ? event.value : null; break;
      case 'sweep': if (object) object.sweep = progress >= 1 ? null : progress; break;
      case 'emphasize': if (object) object.emphasis = progress; break;
      case 'focus_camera': if (object) camera = { ...camera, x: object.x + (object.w ?? 0) / 2, y: object.y + (object.h ?? 0) / 2, zoom: event.value?.zoom ?? camera.zoom }; break;
      case 'pan_camera': if (event.value) camera = { ...camera, x: camera.x + (event.value.x - camera.x) * progress, y: camera.y + (event.value.y - camera.y) * progress }; break;
      case 'zoom_camera': if (event.value) camera = { ...camera, zoom: camera.zoom + ((event.value.zoom ?? event.value) - camera.zoom) * progress }; break;
      default: break; // pause is a timeline marker, not a state change
    }
  }
  return {
    time: at,
    objects: [...objects.values()],
    connections: connections.filter(connection => connection.progress > 0),
    camera,
  };
}

// Templates place objects so the agent supplies A -> B -> C, never pixels.
// GAP and PAD are spacing between and around nodes, so they sit on SPACE; a
// node's own width and height are GEOMETRY - the same values sizeOf gives a
// box with no authored size.
const GAP = 64, PAD = 48;

export function fromTemplate({ template = 'flow', id, title, duration = 8, direction = 'vertical', nodes = [] }) {
  if (!nodes.length) throw new Error('A template needs at least one node');
  const vertical = direction !== 'horizontal';
  const objects = nodes.map((node, index) => ({
    id: node.id || `node-${index}`,
    type: 'box',
    semanticId: node.semanticId || node.id || `node-${index}`,
    conceptId: node.conceptId,
    initialState: {
      label: node.label,
      x: PAD + (vertical ? 0 : index * (GEOMETRY.nodeMinWidth + GAP)),
      y: PAD + (vertical ? index * (GEOMETRY.nodeHeight + GAP) : 0),
      w: GEOMETRY.nodeMinWidth,
      h: GEOMETRY.nodeHeight,
      opacity: 0,
    },
  }));
  const step = duration / (nodes.length * 2);
  const timeline = [];
  objects.forEach((object, index) => {
    timeline.push({ at: Number((index * step * 2).toFixed(2)), action: 'appear', target: object.id, duration: 0.4 });
    if (index > 0) timeline.push({ at: Number((index * step * 2 - step * 0.6).toFixed(2)), action: 'connect', from: objects[index - 1].id, to: object.id, duration: Math.min(0.7, step) });
    if (template === 'highlight_explanation' || template === 'step_sequence') {
      timeline.push({ at: Number((index * step * 2 + step).toFixed(2)), action: 'highlight', target: object.id });
      if (index > 0) timeline.push({ at: Number((index * step * 2 + step).toFixed(2)), action: 'unhighlight', target: objects[index - 1].id });
    }
  });
  return validateScene({
    id, title, duration,
    width: vertical ? 2 * PAD + GEOMETRY.nodeMinWidth : 2 * PAD + nodes.length * GEOMETRY.nodeMinWidth + (nodes.length - 1) * GAP,
    height: vertical ? 2 * PAD + nodes.length * GEOMETRY.nodeHeight + (nodes.length - 1) * GAP : 2 * PAD + GEOMETRY.nodeHeight,
    objects, timeline,
  });
}
