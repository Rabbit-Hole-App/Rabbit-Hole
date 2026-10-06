// M7B: the renderer registry. A name picks its static gate, its Author contract and its adapter;
// everything around them (the service, the render job, the review loop) is the same for both.
// The adapters load lazily: the HyperFrames producer is a large bundle the Remotion path never needs.
import { checkAuthorSource } from './author-check.js';
import { DEFAULT_RENDERER, RENDERERS } from './contracts.js';
import { checkHyperFramesComposition, checkHyperFramesSource } from './hf-static-check.js';
import { checkComposition } from './static-check.js';

export const RENDERER_GATES = Object.freeze({
  remotion: { label: 'Remotion', staticErrors: (source, { durationSeconds }) => checkComposition(source, { durationSeconds }), contract: checkAuthorSource },
  hyperframes: { label: 'HyperFrames', staticErrors: (source, { durationSeconds, compositionId }) => checkHyperFramesComposition(source, { compositionId, durationSeconds }), contract: checkHyperFramesSource },
});

export function rendererGate(name = DEFAULT_RENDERER) {
  if (!RENDERERS.includes(name)) throw new Error(`unknown renderer "${name}" (${RENDERERS.join(', ')})`);
  return RENDERER_GATES[name];
}

export async function rendererClass(name = DEFAULT_RENDERER) {
  rendererGate(name);
  return name === 'hyperframes' ? (await import('./hyperframes-renderer.mjs')).HyperFramesRenderer : (await import('./remotion-renderer.mjs')).RemotionRenderer;
}
