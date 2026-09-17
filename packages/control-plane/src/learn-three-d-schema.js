import { validateToolInput } from './learn-validation.js';

const vector = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', minimum: -1000000, maximum: 1000000 } };
export const THREE_D_SCHEMA = { type: 'object', additionalProperties: false, required: ['op', 'id', 'concept', 'modelUrl'], properties: {
  op: { type: 'string', enum: ['interactive_3d'] }, id: { type: 'string', minLength: 1, maxLength: 100 },
  concept: { type: 'string', minLength: 1, maxLength: 300 }, description: { type: 'string', maxLength: 800 },
  modelUrl: { type: 'string', minLength: 1, maxLength: 2048 },
  camera: { type: 'object', additionalProperties: false, properties: { position: vector, target: vector } },
  autoRotate: { type: 'boolean' },
  animation: { type: 'object', additionalProperties: false, properties: { autoplay: { type: 'boolean' }, clipName: { type: 'string', maxLength: 200 } } },
} };

export function validateThreeD(value) {
  validateToolInput(value, THREE_D_SCHEMA, 'interactive_3d');
  if (!/^[\w-]{1,100}$/.test(value.id)) throw new Error('Invalid 3D object id');
  const url = new URL(value.modelUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !url.hostname.includes('.') || /(^localhost$|\.localhost$|\.local$|^[\d.]+$|:)/i.test(url.hostname)) throw new Error('Use a public HTTPS model URL');
  if (value.camera?.position && value.camera?.target && value.camera.position.every((n, i) => n === value.camera.target[i])) throw new Error('Camera position must differ from its target');
  return value;
}
