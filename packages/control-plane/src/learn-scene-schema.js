import schema from '../../lesson-renderer/scene-schema.json' with { type: 'json' };
import { validateToolInput } from './learn-validation.js';
export const SCENE_SCHEMA = schema;
export function validateScene(input) {
  validateToolInput(input, SCENE_SCHEMA, 'generate_3d_animation');
  const identifier = s => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(s);
  if (!identifier(input.id)) throw new Error('Invalid scene id');
  const objects = input.scene.objects, ids = new Map(objects.map(o => [o.id, o]));
  if (ids.size !== objects.length) throw new Error('Scene object ids must be unique');
  const common = ['id', 'type', 'parent', 'position', 'rotation', 'scale', 'color'];
  for (const o of objects) {
    if (!identifier(o.id) || o.parent && !identifier(o.parent) || o.color && !/^#[0-9a-fA-F]{6}$/.test(o.color)) throw new Error('Invalid scene id or color');
    const extra = { cube: [], sphere: [], arrow: ['start', 'end', 'thickness'], coordinate_frame: ['length', 'thickness'], camera_frustum: ['near', 'far', 'fov', 'aspect', 'thickness'] }[o.type];
    if (Object.keys(o).some(k => !common.includes(k) && !extra.includes(k))) throw new Error(`Unsupported fields for ${o.type}`);
    const seen = new Set([o.id]); let parent = o.parent;
    while (parent) { if (!ids.has(parent) || seen.has(parent)) throw new Error('Invalid or cyclic scene parent'); seen.add(parent); parent = ids.get(parent).parent; }
    if (o.type === 'arrow' && (!o.start || !o.end || o.start.every((v, i) => v === o.end[i]))) throw new Error('Arrow needs distinct start and end points');
    if (o.type === 'camera_frustum' && (o.near ?? .1) >= (o.far ?? 3)) throw new Error('Frustum near must be less than far');
  }
  const channels = new Set();
  for (const a of input.scene.animations || []) {
    if (!ids.has(a.target) || a.start >= a.end || a.end > (input.duration ?? 3)) throw new Error('Invalid animation target or interval');
    if (a.type === 'scale' && [...a.from, ...a.to].some(v => v < .01 || v > 20)) throw new Error('Animation scale must be between 0.01 and 20');
    const key = `${a.target}:${a.type}`; if (channels.has(key)) throw new Error('One animation per object and transform channel'); channels.add(key);
  }
  return { ...input, duration: input.duration ?? 3 };
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export async function sceneCacheKey(input, version) {
  const content = canonical({ scene: input.scene, duration: input.duration ?? 3, output: input.output, version });
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content))))].map(n => n.toString(16).padStart(2, '0')).join('');
}
