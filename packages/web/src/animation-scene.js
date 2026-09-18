import { z } from 'zod';

// The animation source of truth: scene JSON plus a pure evaluator. Neither
// React nor tldraw is imported here, so the live canvas and the video exporter
// read the same state for the same time.

const vector = z.object({ x: z.number(), y: z.number() });

const objectSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['box', 'text', 'circle', 'arrow', 'line', 'equation', 'code', 'image']),
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
    color: z.string().max(24).optional(),
    from: vector.optional(),
    to: vector.optional(),
  }).default({}),
});

const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring'];

const eventSchema = z.object({
  at: z.number().min(0).max(600),
  action: z.enum([
    'appear', 'disappear', 'move', 'resize', 'rotate', 'highlight', 'unhighlight',
    'draw_path', 'erase_path', 'change_text', 'type_text', 'change_value',
    'connect', 'disconnect', 'focus_camera', 'pan_camera', 'zoom_camera', 'pause',
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
  camera: z.object({ x: z.number().default(0), y: z.number().default(0), zoom: z.number().positive().max(8).default(1) }).default({}),
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

export function validateScene(raw) {
  const parsed = animationSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid animation at ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  const scene = parsed.data;
  const ids = new Set(scene.objects.map(object => object.id));
  if (ids.size !== scene.objects.length) throw new Error('Every animation object needs a unique id');
  for (const event of scene.timeline) {
    for (const key of ['target', 'from', 'to']) {
      if (event[key] && !ids.has(event[key]) && !(event.action === 'connect' || event.action === 'disconnect' ? false : false)) {
        if (!ids.has(event[key])) throw new Error(`Timeline event at ${event.at}s refers to unknown object "${event[key]}"`);
      }
    }
    if (event.at + event.duration > scene.duration + 0.001) throw new Error(`Timeline event at ${event.at}s runs past the ${scene.duration}s scene`);
  }
  return scene;
}

// The whole point: same time in, same state out, with no renderer involved.
export function getSceneState(scene, time) {
  const at = Math.max(0, Math.min(scene.duration, time));
  const objects = new Map(scene.objects.map(object => [object.id, {
    id: object.id,
    type: object.type,
    semanticId: object.semanticId || object.id,
    conceptId: object.conceptId || null,
    visible: object.initialState.opacity > 0,
    opacity: object.initialState.opacity,
    x: object.initialState.x,
    y: object.initialState.y,
    w: object.initialState.w ?? (object.type === 'box' ? 160 : undefined),
    h: object.initialState.h ?? (object.type === 'box' ? 56 : undefined),
    rotation: object.initialState.rotation,
    color: object.initialState.color || null,
    label: object.initialState.label ?? object.initialState.text ?? '',
    textProgress: 1,
    highlighted: false,
  }]));
  const connections = [];
  let camera = { ...scene.camera };
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
      case 'focus_camera': if (object) camera = { ...camera, x: object.x, y: object.y, zoom: event.value?.zoom ?? camera.zoom }; break;
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
const GAP = 80, NODE = { w: 170, h: 58 }, PAD = 48;

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
      x: PAD + (vertical ? 0 : index * (NODE.w + GAP)),
      y: PAD + (vertical ? index * (NODE.h + GAP) : 0),
      w: NODE.w,
      h: NODE.h,
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
    width: vertical ? 2 * PAD + NODE.w : 2 * PAD + nodes.length * NODE.w + (nodes.length - 1) * GAP,
    height: vertical ? 2 * PAD + nodes.length * NODE.h + (nodes.length - 1) * GAP : 2 * PAD + NODE.h,
    objects, timeline,
  });
}
