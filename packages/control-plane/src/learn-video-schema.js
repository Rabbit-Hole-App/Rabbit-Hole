import { validateToolInput } from './learn-validation.js';

export const VIDEO_SCHEMA = { type: 'object', additionalProperties: false, required: ['op', 'id', 'prompt', 'purpose'], properties: {
  op: { type: 'string', enum: ['generate_video'] }, id: { type: 'string', minLength: 1, maxLength: 100 },
  prompt: { type: 'string', minLength: 1, maxLength: 2000 },
  purpose: { type: 'string', enum: ['intuition', 'physical_process', '3d_explanation', 'scenario', 'transformation'] },
  duration: { type: 'integer', minimum: 2, maximum: 12 }, aspectRatio: { type: 'string', enum: ['16:9', '1:1', '9:16'] },
  style: { type: 'string', maxLength: 300 }, caption: { type: 'string', maxLength: 300 },
  referenceImages: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 2000 } },
} };

export function validateVideo(value) {
  validateToolInput(value, VIDEO_SCHEMA, 'generate_video');
  if (!value.prompt.trim() || !/^[\w-]{1,100}$/.test(value.id)) throw new Error('Video needs a prompt and a simple object id');
  for (const image of value.referenceImages || []) {
    const url = new URL(image);
    // References are existing public illustration assets, never internal URLs or credentials.
    if (url.protocol !== 'https:' || url.username || url.password || !['images.pexels.com', 'fal.media'].some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) throw new Error('Use an existing public photo asset as the video reference');
  }
  return { ...value, prompt: value.prompt.trim(), duration: value.duration ?? 2, aspectRatio: value.aspectRatio ?? '16:9', style: value.style?.trim() || '', referenceImages: value.referenceImages || [] };
}

export async function videoCacheKey(input, version) {
  const data = JSON.stringify([input.prompt, input.purpose, input.duration, input.aspectRatio, input.style, input.referenceImages, version]);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))), b => b.toString(16).padStart(2, '0')).join('');
}
